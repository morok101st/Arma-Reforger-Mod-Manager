"""Binding base versions with independent derived export order and permissions."""
import asyncio
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import event, inspect, select, text

from app import main as app_main
from app.migrations import _migrate_base_modsets
from app.models import Mod, ModSet, UserMod, ModSetExportOrder, ModRefreshJob
from app.mod_queries import get_mod_read
from app.refresh_jobs import enqueue_refresh, execute_refresh, list_refresh_jobs
from app.services import refresh_all_mods, refresh_mod_for_all_modsets
from tests.support import ApiTestCase
from tests import test_upgrade_0_2_5 as upgrade025


class BaseModsetsTestCase(ApiTestCase):
    def create_set(self, client, name, base=None, mode="independent"):
        result = client.post('/modsets', json={'name': name, 'base_modset_id': base, 'export_order_mode': mode})
        self.assertEqual(result.status_code, 201, result.text)
        return result.json()['id']

    def seed(self, modset_id, mod_id='CORE001', version='1.0', order=500, dependencies=None):
        with self.SessionLocal() as db:
            if db.get(Mod, mod_id) is None:
                db.add(Mod(id=mod_id, name=mod_id, latest_version='3.0', dependencies=dependencies or []))
                db.flush()
            db.add(UserMod(modset_id=modset_id, mod_id=mod_id, current_version=version,
                           load_order=order, tracking_reason='manual'))
            db.commit()

    def mods(self, client, modset_id):
        response = client.get(f'/mods?modset_id={modset_id}')
        self.assertEqual(response.status_code, 200, response.text)
        return {mod['id']: mod for mod in response.json()}

    def test_live_versions_and_export_order_are_independent(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            base = self.create_set(client, 'Core')
            self.seed(base, order=100)
            child = self.create_set(client, 'Mission', base)
            sibling = self.create_set(client, 'Training', base)
            self.seed(child, 'MAP001', '2.0', 200)
            inherited = self.mods(client, child)['CORE001']
            self.assertEqual(inherited['inherited_from_modset_id'], base)
            self.assertEqual(inherited['current_version'], '1.0')
            result = client.patch(f'/modsets/{child}/load-order', json={'entries': [
                {'mod_id': 'CORE001', 'load_order': 900}, {'mod_id': 'MAP001', 'load_order': 10}]})
            self.assertEqual(result.status_code, 204, result.text)
            self.assertEqual(self.mods(client, sibling)['CORE001']['load_order'], 100)
            self.assertEqual(self.mods(client, base)['CORE001']['load_order'], 100)
            with self.SessionLocal() as db:
                row = db.scalar(select(UserMod).where(UserMod.modset_id == base))
                row.current_version = '2.5'
                row.load_order = 50
                db.commit()
            self.assertEqual(self.mods(client, child)['CORE001']['current_version'], '2.5')
            self.assertEqual(self.mods(client, child)['CORE001']['load_order'], 900)
            self.assertEqual(self.mods(client, sibling)['CORE001']['load_order'], 100)
            exported = client.get(f'/modsets/{child}/export').json()
            self.assertEqual([row['modId'] for row in exported], ['MAP001', 'CORE001'])
            self.assertEqual(exported[1]['version'], '2.5')
            listed = next(row for row in client.get('/modsets').json() if row['id'] == child)
            self.assertEqual(listed['tracked_mods_count'], 2)
            with self.SessionLocal() as db:
                self.assertEqual(len(db.scalars(select(UserMod).where(UserMod.modset_id == child)).all()), 1)

    def test_inherited_versions_cannot_be_overridden_via_any_write_path(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            base = self.create_set(client, 'Core')
            self.seed(base)
            child = self.create_set(client, 'Mission', base)
            for payload in ({'current_version': '9.0'}, {'current_version': None}, {'is_core': False}, {'pinned': True}, {'current_version': '9.0', 'load_order': 20}):
                response = client.patch(f'/mods/CORE001?modset_id={child}', json=payload)
                self.assertEqual(response.status_code, 409, response.text)
            self.assertEqual(client.post(f'/mods?modset_id={child}', json={'id': 'CORE001', 'current_version': '9.0'}).status_code, 409)
            self.assertEqual(client.delete(f'/mods/CORE001?modset_id={child}').status_code, 409)
            response = client.patch(f'/mods/CORE001?modset_id={child}', json={'load_order': 7})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(self.mods(client, child)['CORE001']['current_version'], '1.0')
            self.assertEqual(self.mods(client, base)['CORE001']['load_order'], 500)

    def test_conflicts_require_confirmation_and_detach_preserves_effective_snapshot(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            base = self.create_set(client, 'Core')
            self.seed(base, version='2.0')
            self.seed(base, 'NEUTRAL', None)
            child = self.create_set(client, 'Existing')
            self.seed(child, version='1.0', order=75)
            body = {'name': 'Existing', 'base_modset_id': base}
            self.assertEqual(client.patch(f'/modsets/{child}', json=body).status_code, 409)
            self.assertEqual(self.mods(client, child)['CORE001']['current_version'], '1.0')
            body['confirm_base_conflicts'] = True
            self.assertEqual(client.patch(f'/modsets/{child}', json=body).status_code, 200)
            self.assertEqual(self.mods(client, child)['CORE001']['load_order'], 75)
            self.assertEqual(self.mods(client, child)['CORE001']['current_version'], '2.0')
            self.assertEqual(len(client.get(f'/modsets/{child}/export').json()), 1)
            snapshot = client.get(f'/modsets/{child}/export').json()
            response = client.patch(f'/modsets/{child}', json={'name': 'Detached', 'base_modset_id': None})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(client.get(f'/modsets/{child}/export').json(), snapshot)
            self.assertIsNone(self.mods(client, child)['CORE001']['inherited_from_modset_id'])
            with self.SessionLocal() as db:
                self.assertIsNone(db.get(ModSetExportOrder, (child, 'CORE001')))
                db.scalar(select(UserMod).where(UserMod.modset_id == base, UserMod.mod_id == 'CORE001')).current_version = '3.0'
                db.commit()
            self.assertEqual(self.mods(client, child)['CORE001']['current_version'], '2.0')

    def test_new_base_mod_replaces_local_version_but_retains_local_position(self):
        from app.services import create_mod
        from app.schemas_mods import ModCreate
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            base = self.create_set(client, 'Core')
            child = self.create_set(client, 'Mission', base)
            self.seed(child, version='0.5', order=23)
            with self.SessionLocal() as db, patch('app.services.fetch_and_upsert_mods', new=AsyncMock()):
                asyncio.run(create_mod(db, ModCreate(id='CORE001', current_version='2.0'), base, defer_metadata_refresh=True))
                self.assertIsNone(db.scalar(select(UserMod).where(UserMod.modset_id == child, UserMod.mod_id == 'CORE001')))
            inherited = self.mods(client, child)['CORE001']
            self.assertEqual(inherited['current_version'], '2.0')
            self.assertEqual(inherited['load_order'], 23)
            self.assertEqual(client.delete(f'/mods/CORE001?modset_id={base}').status_code, 204)
            self.assertNotIn('CORE001', self.mods(client, child))

    def test_orphan_followup_cannot_deactivate_a_base_dependency_needed_by_a_child(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            base = self.create_set(client, 'Core')
            self.seed(base, 'DEP001')
            self.seed(base, 'PARENT01', dependencies=[{'id': 'DEP001', 'name': 'DEP001'}])
            with self.SessionLocal() as db:
                db.scalar(select(UserMod).where(UserMod.modset_id == base, UserMod.mod_id == 'DEP001')).dependency_origin = True
                db.commit()
            child = self.create_set(client, 'Mission', base)
            self.seed(child, 'EXTRA001', dependencies=[{'id': 'DEP001', 'name': 'DEP001'}])
            response = client.delete(f'/mods/PARENT01?modset_id={base}&deactivate_orphan_dependencies=true')
            self.assertEqual(response.status_code, 204, response.text)
            self.assertEqual(self.mods(client, child)['DEP001']['current_version'], '1.0')
            self.assertEqual(self.mods(client, base)['DEP001']['current_version'], '1.0')

    def test_single_level_and_base_deletion_protection(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            base = self.create_set(client, 'Core')
            child = self.create_set(client, 'Mission', base)
            other = self.create_set(client, 'Other')
            self.assertEqual(client.post('/modsets', json={'name': 'Grandchild', 'base_modset_id': child}).status_code, 409)
            for target, source in ((base, child), (base, other), (child, child), (child, other)):
                result = client.patch(f'/modsets/{target}', json={'name': 'Renamed', 'base_modset_id': source})
                self.assertEqual(result.status_code, 409, result.text)
            self.assertEqual(client.delete(f'/modsets/{base}').status_code, 409)

    def test_derived_dependencies_protect_base_mods_and_cannot_deactivate_inheritance(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            base = self.create_set(client, 'Core')
            self.seed(base)
            child = self.create_set(client, 'Mission', base)
            self.seed(child, 'PARENT01', dependencies=[{'id': 'CORE001', 'name': 'CORE001'}])
            inherited = self.mods(client, child)['CORE001']
            self.assertTrue(inherited['delete_blocked'])
            self.assertEqual(inherited['dependents'][0]['id'], 'PARENT01')
            self.assertEqual(client.delete(f'/mods/CORE001?modset_id={base}').status_code, 400)
            response = client.patch(f'/mods/CORE001?modset_id={base}', json={'current_version': None})
            self.assertEqual(response.status_code, 409, response.text)
            response = client.delete(f'/mods/PARENT01?modset_id={child}&deactivate_orphan_dependencies=true')
            self.assertEqual(response.status_code, 204, response.text)
            self.assertEqual(self.mods(client, base)['CORE001']['current_version'], '1.0')

    def test_added_and_removed_base_mods_propagate_and_copy_is_independent(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            base = self.create_set(client, 'Core')
            child = self.create_set(client, 'Mission', base)
            self.seed(base)
            self.assertIn('CORE001', self.mods(client, child))
            copied = client.post(f'/modsets/{child}/duplicate')
            self.assertEqual(copied.status_code, 201, copied.text)
            self.assertIsNone(copied.json()['base_modset_id'])
            self.assertEqual(client.delete(f'/mods/CORE001?modset_id={base}').status_code, 204)
            self.assertNotIn('CORE001', self.mods(client, child))
            self.assertEqual(self.mods(client, copied.json()['id'])['CORE001']['current_version'], '1.0')

    def test_base_read_permission_is_required_and_revocation_does_not_leak(self):
        with TestClient(app_main.app) as admin, TestClient(app_main.app) as user:
            self.login_admin(admin)
            alice = self._create_user('alice', 'alice-password-123')
            self.assertEqual(user.post('/auth/login', json={'username': 'alice', 'password': 'alice-password-123'}).status_code, 200)
            base = self.create_set(admin, 'Secret core')
            self.seed(base)
            self.assertEqual(user.post('/modsets', json={'name': 'Forbidden', 'base_modset_id': base}).status_code, 404)
            group = admin.post('/admin/groups', json={'name': 'Readers', 'user_ids': [alice.id]}).json()['id']
            admin.put(f'/modsets/{base}/group-permissions', json={'entries': [{'group_id': group, 'permission': 'read'}]})
            child = self.create_set(user, 'Alice mission', base)
            self.assertEqual(self.mods(user, child)['CORE001']['current_version'], '1.0')
            self.assertEqual(user.patch(f'/mods/CORE001?modset_id={base}', json={'current_version': '3.0'}).status_code, 403)
            admin.put(f'/modsets/{base}/group-permissions', json={'entries': []})
            for path in (f'/mods?modset_id={child}', f'/modsets/{child}/export', f'/modsets/{child}/activity'):
                self.assertEqual(user.get(path).status_code, 403, path)
            listed = next(row for row in user.get('/modsets').json() if row['id'] == child)
            self.assertIsNone(listed['base_modset_name'])
            self.assertEqual(listed['tracked_mods_count'], 0)
            self.assertEqual(admin.patch(f'/modsets/{child}', json={'name': 'Recovered', 'base_modset_id': None}).status_code, 200)
            self.assertEqual(self.mods(user, child)['CORE001']['current_version'], '1.0')

    def test_inherited_manual_jobs_and_bulk_refresh_use_effective_mods(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            base = self.create_set(client, 'Core')
            self.seed(base)
            child = self.create_set(client, 'Mission', base)
            # Stop background workers for deterministic direct execution below.
        from app.models import User
        with self.SessionLocal() as db:
            actor = db.scalar(select(User).where(User.username == 'admin'))
            enqueue_refresh(db, 'CORE001', child, actor)
            self.assertEqual(len(list_refresh_jobs(db, child)), 1)
        with patch('app.services.refresh_mod', new=AsyncMock()) as refresh:
            execute_refresh(self.engine, child, 'CORE001')
            self.assertEqual(refresh.await_count, 1)
            with self.SessionLocal() as db:
                self.assertEqual(db.get(ModRefreshJob, (child, 'CORE001')).state, 'succeeded')
                result = asyncio.run(refresh_all_mods(db, modset_id=child))
                self.assertEqual(result.refreshed, 1)
        with self.SessionLocal() as db, patch('app.services.fetch_and_upsert_mods', new=AsyncMock()), \
             patch('app.services.track_and_refresh_dependencies_for_installed_mod', new=AsyncMock()), \
             patch('app.services.notify_update_available', new=AsyncMock()) as notify:
            asyncio.run(refresh_mod_for_all_modsets(db, 'CORE001', send_update_notifications=True, use_reliable_latest=False))
            self.assertEqual({call.args[1] for call in notify.await_args_list}, {base, child})
            self.assertEqual(get_mod_read(db, 'CORE001', child).current_version, '1.0')


class BaseMigrationSQLiteTestCase(upgrade025.SQLiteUpgrade025TestCase):
    # Reuse the frozen fixture setup, not the parent's test methods.
    test_upgrade_025_and_repeated_startup_preserve_all_rows_and_grants = None
    test_failed_refresh_migration_rolls_back_and_retries = None

    def test_base_migration_is_atomic_retryable_and_defaults_to_independent(self):
        self.load_legacy()
        before = self.snapshot()
        def fail(*args, **kwargs):
            raise RuntimeError('Interrupted base migration')
        event.listen(ModSetExportOrder.__table__, 'after_create', fail)
        try:
            with self.assertRaisesRegex(RuntimeError, 'Interrupted base'):
                _migrate_base_modsets(self.engine)
        finally:
            event.remove(ModSetExportOrder.__table__, 'after_create', fail)
        self.assertNotIn('base_modset_id', {col['name'] for col in inspect(self.engine).get_columns('modsets')})
        self.assertNotIn('modset_export_orders', inspect(self.engine).get_table_names())
        self.assertEqual(self.snapshot(), before)
        for _ in range(2):
            _migrate_base_modsets(self.engine)
            self.assertEqual(self.snapshot(), before)
        with self.engine.connect() as connection:
            self.assertEqual(connection.execute(text('SELECT COUNT(*) FROM modsets WHERE base_modset_id IS NOT NULL')).scalar(), 0)


    def test_order_migration_preserves_existing_independent_orders_and_rolls_back(self):
        from app.migrations import migrate_schema, _migrate_base_order
        self.load_legacy()
        migrate_schema(self.engine)
        with self.engine.begin() as connection:
            connection.execute(text("UPDATE modsets SET base_modset_id = 1 WHERE id = 2"))
            connection.execute(text("INSERT INTO modset_export_orders (modset_id, mod_id, load_order) VALUES (2, 'PARENT', 777)"))
            # Simulate the dev schema before migration 004.
            connection.execute(text("ALTER TABLE modsets DROP COLUMN export_order_mode"))
            connection.execute(text("ALTER TABLE modset_export_orders DROP COLUMN before_mod_ids"))
            connection.execute(text("DELETE FROM schema_migrations WHERE version = '004_base_export_order'"))
        def fail(connection, cursor, statement, parameters, context, executemany):
            if 'ADD COLUMN before_mod_ids' in statement:
                raise RuntimeError('Interrupted order migration')
        event.listen(self.engine, 'before_cursor_execute', fail)
        try:
            with self.assertRaisesRegex(RuntimeError, 'Interrupted order'):
                _migrate_base_order(self.engine)
        finally:
            event.remove(self.engine, 'before_cursor_execute', fail)
        self.assertNotIn('export_order_mode', {col['name'] for col in inspect(self.engine).get_columns('modsets')})
        for _ in range(2):
            _migrate_base_order(self.engine)
        with self.engine.connect() as connection:
            self.assertEqual(connection.execute(text("SELECT DISTINCT export_order_mode FROM modsets")).scalars().all(), ['independent'])
            self.assertEqual(connection.execute(text("SELECT load_order FROM modset_export_orders WHERE modset_id = 2 AND mod_id = 'PARENT'")).scalar(), 777)
            self.assertIsNone(connection.execute(text("SELECT before_mod_ids FROM modset_export_orders WHERE modset_id = 2 AND mod_id = 'PARENT'")).scalar())


class BaseMigrationPostgreSQLTestCase(upgrade025.PostgreSQLUpgrade025TestCase):
    test_upgrade_025_and_repeated_startup_preserve_all_rows_and_grants = None
    test_failed_refresh_migration_rolls_back_and_retries = None
    test_base_migration_is_atomic_retryable_and_defaults_to_independent = BaseMigrationSQLiteTestCase.test_base_migration_is_atomic_retryable_and_defaults_to_independent
    test_order_migration_preserves_existing_independent_orders_and_rolls_back = BaseMigrationSQLiteTestCase.test_order_migration_preserves_existing_independent_orders_and_rolls_back

    def test_postgresql_binding_export_and_concurrent_links(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from fastapi import HTTPException
        from sqlalchemy.orm import Session
        from app.migrations import migrate_schema
        from app.models import User
        from app.modset_service import create_modset, export_modset, update_modset, update_modset_load_order
        from app.schemas_modsets import ModSetCreate, ModSetUpdate, ModSetLoadOrderUpdate

        self.load_legacy()
        migrate_schema(self.engine)
        with Session(self.engine) as db:
            actor = db.get(User, 1)
            base = create_modset(db, actor, ModSetCreate(name='Foundation'))
            db.add(UserMod(modset_id=base.id, mod_id='PARENT', current_version='1.5', load_order=10))
            db.commit()
            child = create_modset(db, actor, ModSetCreate(name='Derived', base_modset_id=base.id, export_order_mode='independent'))
            update_modset_load_order(db, actor, child.id, ModSetLoadOrderUpdate(entries=[{'mod_id':'PARENT','load_order':900}]))
            source = db.scalar(select(UserMod).where(UserMod.modset_id == base.id, UserMod.mod_id == 'PARENT'))
            source.current_version = '2.5'
            source.load_order = 25
            db.commit()
            self.assertEqual(export_modset(db, actor, child.id)[0].version, '2.5')
            self.assertEqual(get_mod_read(db, 'PARENT', child.id).load_order, 900)
            update_modset(db, actor, child.id, ModSetUpdate(name='Derived', base_modset_id=None))
            self.assertEqual(export_modset(db, actor, child.id)[0].version, '2.5')
            first = create_modset(db, actor, ModSetCreate(name='Concurrent A'))
            second = create_modset(db, actor, ModSetCreate(name='Concurrent B'))
        barrier = Barrier(2)
        def link(target, source, name):
            with Session(self.engine) as db:
                actor = db.get(User, 1)
                barrier.wait(timeout=10)
                try:
                    update_modset(db, actor, target, ModSetUpdate(name=name, base_modset_id=source))
                    return 200
                except HTTPException as exc:
                    return exc.status_code
        with ThreadPoolExecutor(max_workers=2) as executor:
            a = executor.submit(link, first.id, second.id, first.name)
            b = executor.submit(link, second.id, first.id, second.name)
            self.assertEqual(sorted((a.result(timeout=15), b.result(timeout=15))), [200, 409])

    def test_postgresql_following_order_uses_json_anchors(self):
        from sqlalchemy.orm import Session
        from app.migrations import migrate_schema
        from app.models import User
        from app.modset_service import create_modset, export_modset, update_modset_load_order, update_export_order
        from app.schemas_modsets import ModSetCreate, ModSetLoadOrderUpdate, ModSetExportOrderUpdate
        self.load_legacy()
        migrate_schema(self.engine)
        with Session(self.engine) as db:
            actor = db.get(User, 1)
            base = create_modset(db, actor, ModSetCreate(name='Ordered base'))
            db.add_all([UserMod(modset_id=base.id, mod_id='PARENT', current_version='1.0', load_order=100),
                        UserMod(modset_id=base.id, mod_id='DEP', current_version='1.0', load_order=200)])
            db.commit()
            child = create_modset(db, actor, ModSetCreate(name='Following', base_modset_id=base.id))
            db.add(Mod(id='LOCAL001', name='Local', dependencies=[]))
            db.flush()
            db.add(UserMod(modset_id=child.id, mod_id='LOCAL001', current_version='2.0'))
            db.commit()
            update_export_order(db, actor, child.id, ModSetExportOrderUpdate(mod_ids=['PARENT','LOCAL001','DEP']))
            update_modset_load_order(db, actor, base.id, ModSetLoadOrderUpdate(entries=[{'mod_id':'DEP','load_order':10}]))
            self.assertEqual([entry.modId for entry in export_modset(db, actor, child.id)], ['LOCAL001','DEP','PARENT'])
            self.assertEqual(db.get(ModSetExportOrder, (child.id, 'LOCAL001')).before_mod_ids, ['DEP'])
