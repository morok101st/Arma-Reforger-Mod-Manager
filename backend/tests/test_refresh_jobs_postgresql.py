import os
from pathlib import Path
import subprocess
import sys
import unittest
import uuid
from unittest.mock import AsyncMock, patch

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.migrations import migrate_schema
from app.models import Mod, ModRefreshJob, ModSet, User, UserMod
from app.refresh_jobs import enqueue_refresh, execute_refresh, execution_lock
from tests import test_refresh_jobs as jobs_tests


@unittest.skipUnless(os.getenv("ARMM_UPGRADE_TEST_DATABASE_URL"), "Isolated PostgreSQL database not configured")
class PostgreSQLRefreshJobsTests(unittest.TestCase):
    enqueue = jobs_tests.RefreshJobsTests.enqueue
    test_concurrent_requests_share_one_persistent_attempt = jobs_tests.RefreshJobsTests.test_concurrent_requests_share_one_persistent_attempt
    test_active_lock_prevents_duplicate_execution_and_false_recovery = jobs_tests.RefreshJobsTests.test_active_lock_prevents_duplicate_execution_and_false_recovery
    test_interrupted_job_is_failed_without_replaying_and_can_retry = jobs_tests.RefreshJobsTests.test_interrupted_job_is_failed_without_replaying_and_can_retry
    test_failure_is_persisted_and_retry_succeeds = jobs_tests.RefreshJobsTests.test_failure_is_persisted_and_retry_succeeds
    test_startup_worker_consumes_preexisting_queue = jobs_tests.RefreshJobsTests.test_startup_worker_consumes_preexisting_queue

    def setUp(self):
        self.schema = "armm_jobs_" + uuid.uuid4().hex
        self.admin_engine = create_engine(os.environ["ARMM_UPGRADE_TEST_DATABASE_URL"])
        with self.admin_engine.begin() as connection:
            connection.execute(text(f"CREATE SCHEMA {self.schema}"))
        self.engine = create_engine(os.environ["ARMM_UPGRADE_TEST_DATABASE_URL"], connect_args={"options": f"-csearch_path={self.schema}"})
        self.SessionLocal = sessionmaker(bind=self.engine)
        fixture = Path(__file__).parent / "fixtures/schema_0_2_5_postgresql.sql"
        with self.engine.begin() as connection:
            for statement in fixture.read_text().split("\n-- statement\n"):
                connection.exec_driver_sql(statement)
        migrate_schema(self.engine)
        with self.SessionLocal() as db:
            actor = User(username="jobs-admin", role="admin")
            db.add(actor)
            db.flush()
            modset = ModSet(name="Refresh jobs", owner_user_id=actor.id)
            db.add(modset)
            db.flush()
            self.modset_id, self.actor_id = modset.id, actor.id
            db.add(Mod(id="REFRESH001", name="Refresh mod", dependencies=[]))
            db.flush()
            db.add(UserMod(modset_id=modset.id, mod_id="REFRESH001", current_version="1.0"))
            db.commit()

    def tearDown(self):
        self.engine.dispose()
        with self.admin_engine.begin() as connection:
            connection.execute(text(f"DROP SCHEMA {self.schema} CASCADE"))
        self.admin_engine.dispose()

    def test_process_death_releases_lock_and_allows_interruption_recovery(self):
        self.enqueue()
        with self.SessionLocal() as db:
            job = db.get(ModRefreshJob, (self.modset_id, "REFRESH001"))
            job.state = "running"
            db.commit()
        code = """
import os, time
from sqlalchemy import create_engine
from app.refresh_jobs import execution_lock
engine = create_engine(os.environ['ARMM_UPGRADE_TEST_DATABASE_URL'])
with execution_lock(engine, int(os.environ['TEST_MODSET_ID']), 'REFRESH001') as acquired:
    print('locked' if acquired else 'busy', flush=True)
    time.sleep(30)
"""
        child = subprocess.Popen([sys.executable, "-c", code], env={**os.environ, "TEST_MODSET_ID": str(self.modset_id)}, stdout=subprocess.PIPE, text=True)
        try:
            self.assertEqual(child.stdout.readline().strip(), "locked")
            with execution_lock(self.engine, self.modset_id, "REFRESH001") as acquired:
                self.assertFalse(acquired)
            with patch("app.services.refresh_mod", new_callable=AsyncMock) as refresh:
                execute_refresh(self.engine, self.modset_id, "REFRESH001")
                refresh.assert_not_called()
        finally:
            child.kill()
            child.wait(timeout=5)
            child.stdout.close()
        with patch("app.services.refresh_mod", new_callable=AsyncMock) as refresh:
            execute_refresh(self.engine, self.modset_id, "REFRESH001")
            refresh.assert_not_called()
        with self.SessionLocal() as db:
            self.assertEqual(db.get(ModRefreshJob, (self.modset_id, "REFRESH001")).state, "failed")
