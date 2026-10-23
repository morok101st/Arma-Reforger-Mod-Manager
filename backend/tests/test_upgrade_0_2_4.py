"""Upgrade tests use frozen release DDL, never current models to build legacy DBs."""
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app import main as app_main
from app.migrations import _migrate_groups, migrate_schema
from app.models import Group, GroupMembership, ModSet, ModSetGroupPermission, User
from app.modset_service import export_modset, list_modsets
from app.passwords import hash_password, verify_password
from app.session_auth import create_session_token, decode_session_token
from app.webhook_crypto import decrypt_webhook_url, encrypt_webhook_url
from tests.support import DummyScheduler


class Upgrade024Mixin:
    def test_fresh_installation_creates_versioned_group_tables(self):
        with patch.object(app_main, 'engine', self.engine), \
             patch.object(app_main, 'SessionLocal', sessionmaker(bind=self.engine)), \
             patch.object(app_main, 'start_scheduler', return_value=DummyScheduler()):
            with TestClient(app_main.app) as client:
                self.assertEqual(client.get('/health').status_code, 200)
        with self.engine.connect() as connection:
            self.assertEqual(connection.execute(text('SELECT version FROM schema_migrations')).scalar(), '001_group_sharing')
            self.assertEqual(connection.execute(text('SELECT COUNT(*) FROM groups')).scalar(), 0)
            self.assertEqual(connection.execute(text('SELECT COUNT(*) FROM modsets')).scalar(), 1)

    def load_legacy(self):
        fixture = Path(__file__).parent / 'fixtures' / f'schema_0_2_4_{self.engine.dialect.name}.sql'
        with self.engine.begin() as connection:
            for statement in fixture.read_text().split('\n-- statement\n'):
                connection.exec_driver_sql(statement)
            password_hash = hash_password('legacy-account-password')
            self.password_hash = password_hash
            connection.execute(text("INSERT INTO users (id, username, password_hash, role, session_version) VALUES (1, 'legacy-admin', :hash, 'admin', 4)"), {'hash': password_hash})
            connection.execute(text("INSERT INTO users (id, username, password_hash, role) VALUES (2, 'legacy-service', :hash, 'user')"), {'hash': password_hash})
            connection.execute(text("INSERT INTO users (id, username, oidc_issuer, oidc_subject, email, role) VALUES (3, 'legacy-oidc', 'https://identity.example', 'subject-123', 'oidc@example.com', 'user')"))
            connection.execute(text("INSERT INTO modsets (id, name, owner_user_id, shared) VALUES (1, 'Private', 1, false), (2, 'Shared', 1, true), (3, 'Unowned private', NULL, false)"))
            connection.execute(text("UPDATE users SET active_modset_id = 2 WHERE id = 1"))
            connection.execute(text("INSERT INTO mods (id, name, latest_version, dependencies) VALUES ('PARENT', 'Parent', '2.0', :deps), ('DEP', 'Dependency', '1.0', '[]')"), {'deps': '[{"name":"DEP","url":"https://example.com/workshop/DEP"}]'})
            connection.execute(text("INSERT INTO user_mods (id, modset_id, mod_id, current_version, pinned, is_core, dependency_origin, load_order) VALUES (1, 1, 'PARENT', '1.0', true, true, false, 25), (2, 1, 'DEP', NULL, false, false, false, 500), (3, 2, 'PARENT', '2.0', false, false, false, 7)"))
            connection.execute(text("INSERT INTO mod_versions (id, mod_id, version, changelog, last_modified_at) VALUES (1, 'PARENT', '2.0', 'Legacy changelog', '2026-01-02 03:04:05+00:00')"))
            connection.execute(text("INSERT INTO discord_webhooks (id, name, webhook_url, is_active) VALUES (1, 'Selected', :url, true), (2, 'Empty', :url, false)"), {'url': encrypt_webhook_url('https://discord.com/api/webhooks/legacy/test')})
            connection.execute(text("INSERT INTO discord_webhook_modsets VALUES (1, 2)"))
            connection.execute(text("INSERT INTO discord_webhook_deliveries (id, webhook_id, modset_id, mod_id, latest_version) VALUES (1, 1, 2, 'PARENT', '2.0')"))
            connection.execute(text("INSERT INTO audit_logs (id, actor_user_id, actor_username, action, entity_type, detail) VALUES (1, 1, 'legacy-admin', 'login_success', 'auth', '{}')"))
            connection.execute(text("INSERT INTO scheduler_runs (id, started_at, failed, refreshed) VALUES (1, '2026-01-02 03:04:05+00:00', '{}', 2)"))
            if self.engine.dialect.name == 'postgresql':
                # Explicit fixture IDs must advance sequences just as pg_dump does.
                for table in ('users', 'modsets', 'user_mods', 'mod_versions', 'discord_webhooks', 'discord_webhook_deliveries', 'audit_logs', 'scheduler_runs'):
                    connection.execute(text(f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), (SELECT MAX(id) FROM {table}))"))
        self.legacy_tables = inspect(self.engine).get_table_names()

    def snapshot(self):
        with self.engine.connect() as connection:
            return {table: connection.execute(text(f'SELECT * FROM "{table}" ORDER BY 1, 2')).all() for table in self.legacy_tables}

    def test_upgrade_and_restarts_preserve_all_legacy_rows(self):
        self.load_legacy()
        before = self.snapshot()
        with Session(self.engine) as db:
            token = create_session_token(db.get(User, 1))
        for _ in range(2):
            migrate_schema(self.engine)
            with patch.object(app_main, 'engine', self.engine), \
                 patch.object(app_main, 'SessionLocal', sessionmaker(bind=self.engine)), \
                 patch.object(app_main, 'start_scheduler', return_value=DummyScheduler()):
                with TestClient(app_main.app) as client:
                    self.assertEqual(client.get('/health').status_code, 200)
            self.assertEqual(self.snapshot(), before)
        with Session(self.engine) as db:
            owner = db.get(User, 1)
            service = db.get(User, 2)
            self.assertTrue(verify_password('legacy-account-password', owner.password_hash))
            self.assertEqual(decode_session_token(token)['sv'], owner.session_version)
            self.assertEqual(list_modsets(db, service), [])
            self.assertTrue(all(not row.shared for row in list_modsets(db, owner)))
            self.assertEqual(export_modset(db, owner, 1)[0].version, '1.0')
            self.assertEqual(export_modset(db, owner, 1)[0].modId, 'PARENT')
            self.assertEqual(decrypt_webhook_url(db.execute(text('SELECT webhook_url FROM discord_webhooks WHERE id = 1')).scalar()), 'https://discord.com/api/webhooks/legacy/test')
            self.assertEqual(db.execute(text('SELECT COUNT(*) FROM groups')).scalar(), 0)
            self.assertEqual(db.execute(text('SELECT COUNT(*) FROM schema_migrations')).scalar(), 1)
            group = Group(name='New integration', description='After upgrade')
            db.add(group)
            db.flush()
            db.add_all([GroupMembership(group_id=group.id, user_id=2), ModSetGroupPermission(modset_id=1, group_id=group.id, permission='read')])
            db.commit()
            self.assertEqual({row.id for row in list_modsets(db, service)}, {1})
        migrate_schema(self.engine)
        self.assertEqual(self.snapshot(), before)
        with Session(self.engine) as db:
            user = User(username='post-upgrade-account', password_hash=self.password_hash)
            db.add(user)
            db.flush()
            modset = ModSet(name='Post-upgrade private modset', owner_user_id=user.id)
            db.add(modset)
            db.commit()
            self.assertGreater(user.id, 3)
            self.assertGreater(modset.id, 3)
            self.assertTrue(next(row for row in list_modsets(db, user) if row.id == modset.id).can_manage_access)

    def test_failed_group_migration_rolls_back_and_can_be_retried(self):
        self.load_legacy()
        before = self.snapshot()

        def fail(*args, **kwargs):
            raise RuntimeError('Simulated interrupted upgrade')

        event.listen(GroupMembership.__table__, 'before_create', fail)
        try:
            with self.assertRaisesRegex(RuntimeError, 'interrupted upgrade'):
                _migrate_groups(self.engine)
        finally:
            event.remove(GroupMembership.__table__, 'before_create', fail)
        self.assertNotIn('groups', inspect(self.engine).get_table_names())
        self.assertEqual(self.snapshot(), before)
        migrate_schema(self.engine)
        self.assertEqual(self.snapshot(), before)
        self.assertIn('modset_group_permissions', inspect(self.engine).get_table_names())


class SQLiteUpgrade024TestCase(Upgrade024Mixin, unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.engine = create_engine(f'sqlite:///{Path(self.tempdir.name) / "upgrade.db"}', connect_args={'check_same_thread': False})

    def tearDown(self):
        self.engine.dispose()
        self.tempdir.cleanup()


@unittest.skipUnless(os.getenv('ARMM_UPGRADE_TEST_DATABASE_URL'), 'Isolated PostgreSQL upgrade database not configured')
class PostgreSQLUpgrade024TestCase(Upgrade024Mixin, unittest.TestCase):
    def setUp(self):
        self.schema = 'armm_upgrade_' + uuid.uuid4().hex
        self.admin_engine = create_engine(os.environ['ARMM_UPGRADE_TEST_DATABASE_URL'])
        with self.admin_engine.begin() as connection:
            connection.execute(text(f'CREATE SCHEMA {self.schema}'))
        self.engine = create_engine(os.environ['ARMM_UPGRADE_TEST_DATABASE_URL'], connect_args={'options': f'-csearch_path={self.schema}'})

    def tearDown(self):
        self.engine.dispose()
        with self.admin_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA {self.schema} CASCADE'))
        self.admin_engine.dispose()
