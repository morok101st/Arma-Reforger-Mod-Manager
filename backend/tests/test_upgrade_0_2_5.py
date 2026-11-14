"""0.2.5 fixtures are frozen from tag v0.2.5, not current metadata."""
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import event, inspect, text
from sqlalchemy.orm import sessionmaker

from app import main as app_main
from app.migrations import _migrate_refresh_jobs, migrate_schema
from app.models import ModRefreshJob
from tests.support import DummyScheduler
from tests import test_upgrade_0_2_4 as upgrade024


class Upgrade025Mixin:
    fixture_version = "0_2_5"

    def load_legacy(self):
        upgrade024.Upgrade024Mixin.load_legacy(self)
        with self.engine.begin() as connection:
            connection.execute(text("INSERT INTO groups (id, name, description) VALUES (1, 'Existing group', 'Preserve me')"))
            connection.execute(text("INSERT INTO group_memberships (group_id, user_id) VALUES (1, 2)"))
            connection.execute(text("INSERT INTO modset_group_permissions (modset_id, group_id, permission) VALUES (1, 1, 'write')"))
        self.legacy_tables = [table for table in inspect(self.engine).get_table_names() if table != "schema_migrations"]

    snapshot = upgrade024.Upgrade024Mixin.snapshot

    def test_upgrade_025_and_repeated_startup_preserve_all_rows_and_grants(self):
        self.load_legacy()
        before = self.snapshot()
        for _ in range(2):
            with patch.object(app_main, "engine", self.engine), \
                 patch.object(app_main, "SessionLocal", sessionmaker(bind=self.engine)), \
                 patch.object(app_main, "start_scheduler", return_value=DummyScheduler()):
                with TestClient(app_main.app) as client:
                    self.assertEqual(client.get("/health").status_code, 200)
            self.assertEqual(self.snapshot(), before)
        with self.engine.connect() as connection:
            self.assertEqual(connection.execute(text("SELECT COUNT(*) FROM mod_refresh_jobs")).scalar(), 0)
            self.assertEqual(set(connection.execute(text("SELECT version FROM schema_migrations")).scalars()),
                             {"001_group_sharing", "002_mod_refresh_jobs", "003_base_modsets", "004_base_export_order", "005_modset_sync_access"})

    def test_failed_refresh_migration_rolls_back_and_retries(self):
        self.load_legacy()
        before = self.snapshot()

        def fail(*args, **kwargs):
            raise RuntimeError("Interrupted refresh migration")

        # Failure after CREATE TABLE proves DDL and ledger rollback together.
        event.listen(ModRefreshJob.__table__, "after_create", fail)
        try:
            with self.assertRaisesRegex(RuntimeError, "Interrupted refresh migration"):
                _migrate_refresh_jobs(self.engine)
        finally:
            event.remove(ModRefreshJob.__table__, "after_create", fail)
        self.assertNotIn("mod_refresh_jobs", inspect(self.engine).get_table_names())
        with self.engine.connect() as connection:
            self.assertEqual(list(connection.execute(text("SELECT version FROM schema_migrations")).scalars()), ["001_group_sharing"])
        self.assertEqual(self.snapshot(), before)
        migrate_schema(self.engine)
        self.assertEqual(self.snapshot(), before)


class SQLiteUpgrade025TestCase(Upgrade025Mixin, upgrade024.SQLiteUpgrade024TestCase):
    # Do not rerun the 0.2.4-specific assertions against the newer fixture.
    test_fresh_installation_creates_versioned_group_tables = None
    test_upgrade_and_restarts_preserve_all_legacy_rows = None
    test_failed_group_migration_rolls_back_and_can_be_retried = None


class PostgreSQLUpgrade025TestCase(Upgrade025Mixin, upgrade024.PostgreSQLUpgrade024TestCase):
    test_fresh_installation_creates_versioned_group_tables = None
    test_upgrade_and_restarts_preserve_all_legacy_rows = None
    test_failed_group_migration_rolls_back_and_can_be_retried = None
