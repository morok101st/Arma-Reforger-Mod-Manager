from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import threading
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import select

from app import main as app_main
from app.models import AuditLog, Mod, ModRefreshJob, ModSet, User, UserMod
from app.refresh_jobs import enqueue_refresh, execute_refresh, list_refresh_jobs, start_refresh_workers
from tests.support import ApiTestCase


class RefreshJobsTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        with self.SessionLocal() as db:
            admin = db.scalar(select(User).where(User.username == "admin"))
            modset = ModSet(name="Refresh jobs", owner_user_id=admin.id)
            db.add(modset)
            db.flush()
            self.modset_id, self.actor_id = modset.id, admin.id
            db.add(Mod(id="REFRESH001", name="Refresh mod", dependencies=[]))
            db.flush()
            db.add(UserMod(modset_id=modset.id, mod_id="REFRESH001", current_version="1.0"))
            db.commit()

    def enqueue(self):
        with self.SessionLocal() as db:
            return enqueue_refresh(db, "REFRESH001", self.modset_id, db.get(User, self.actor_id))

    def test_concurrent_requests_share_one_persistent_attempt(self):
        with ThreadPoolExecutor(max_workers=6) as executor:
            jobs = list(executor.map(lambda _: self.enqueue(), range(12)))
        self.assertEqual(len({job.attempt for job in jobs}), 1)
        with self.SessionLocal() as db:
            self.assertEqual(len(list_refresh_jobs(db, self.modset_id)), 1)
            self.assertEqual(list_refresh_jobs(db, self.modset_id)[0].state, "queued")

    def test_active_lock_prevents_duplicate_execution_and_false_recovery(self):
        self.enqueue()
        started, release = threading.Event(), threading.Event()

        async def refresh(*args, **kwargs):
            self.assertFalse(kwargs["send_update_notifications"])
            started.set()
            release.wait(5)

        with patch("app.services.refresh_mod", side_effect=refresh) as call:
            with ThreadPoolExecutor(max_workers=2) as executor:
                first = executor.submit(execute_refresh, self.engine, self.modset_id, "REFRESH001")
                try:
                    self.assertTrue(started.wait(5))
                    job = self.enqueue()
                    self.assertEqual(job.state, "running")
                    execute_refresh(self.engine, self.modset_id, "REFRESH001")
                    with self.SessionLocal() as db:
                        self.assertEqual(db.get(ModRefreshJob, (self.modset_id, "REFRESH001")).state, "running")
                finally:
                    release.set()
                first.result(timeout=5)
            self.assertEqual(call.call_count, 1)
        with self.SessionLocal() as db:
            self.assertEqual(db.get(ModRefreshJob, (self.modset_id, "REFRESH001")).state, "succeeded")
            self.assertEqual(db.query(AuditLog).filter_by(action="mod_refreshed").count(), 1)

    def test_interrupted_job_is_failed_without_replaying_and_can_retry(self):
        original = self.enqueue()
        with self.SessionLocal() as db:
            job = db.get(ModRefreshJob, (self.modset_id, "REFRESH001"))
            job.state = "running"
            job.started_at = datetime.now(timezone.utc)
            db.commit()
        with patch("app.services.refresh_mod", new_callable=AsyncMock) as refresh:
            execute_refresh(self.engine, self.modset_id, "REFRESH001")
            refresh.assert_not_called()
        with self.SessionLocal() as db:
            job = db.get(ModRefreshJob, (self.modset_id, "REFRESH001"))
            self.assertEqual(job.state, "failed")
            self.assertIsNotNone(job.completed_at)
        self.assertNotEqual(self.enqueue().attempt, original.attempt)

    def test_failure_is_persisted_and_retry_succeeds(self):
        original = self.enqueue()
        with patch("app.services.refresh_mod", new_callable=AsyncMock, side_effect=RuntimeError("private upstream detail")):
            execute_refresh(self.engine, self.modset_id, "REFRESH001")
        with self.SessionLocal() as db:
            job = db.get(ModRefreshJob, (self.modset_id, "REFRESH001"))
            self.assertEqual(job.state, "failed")
            self.assertNotIn("private", job.error)
        self.assertNotEqual(self.enqueue().attempt, original.attempt)
        with patch("app.services.refresh_mod", new_callable=AsyncMock):
            execute_refresh(self.engine, self.modset_id, "REFRESH001")
        with self.SessionLocal() as db:
            self.assertEqual(db.get(ModRefreshJob, (self.modset_id, "REFRESH001")).state, "succeeded")
            self.assertEqual(db.query(AuditLog).filter(AuditLog.action.in_(["mod_refreshed", "mod_refresh_failed"])).count(), 2)

    def test_jobs_are_discoverable_after_reload_and_protected_by_permissions(self):
        # Control execution so the API test can observe the queued state.
        with patch.object(app_main, "start_refresh_workers", return_value=lambda: None):
            with TestClient(app_main.app) as client:
                self.login_admin(client)
                path = f"/mods/REFRESH001/refresh-job?modset_id={self.modset_id}"
                first = client.post(path)
                self.assertEqual(first.status_code, 202, first.text)
                self.assertEqual(client.post(path).json()["attempt"], first.json()["attempt"])
                jobs = client.get(f"/refresh-jobs?modset_id={self.modset_id}").json()
                self.assertEqual(jobs[0]["state"], "queued")
                self.assertNotIn("actor_user_id", jobs[0])
                client.post("/auth/logout")
                self.assertEqual(client.get(f"/refresh-jobs?modset_id={self.modset_id}").status_code, 401)
                self._create_user("outsider", "outsider-password")
                client.post("/auth/login", json={"username": "outsider", "password": "outsider-password"})
                self.assertEqual(client.get(f"/refresh-jobs?modset_id={self.modset_id}").status_code, 404)
                self.assertEqual(client.post(path).status_code, 404)

    def test_startup_worker_consumes_preexisting_queue(self):
        self.enqueue()
        completed = threading.Event()

        async def refresh(*args, **kwargs):
            completed.set()

        with patch("app.services.refresh_mod", side_effect=refresh):
            stop = start_refresh_workers(self.engine)
            try:
                self.assertTrue(completed.wait(5))
            finally:
                stop()
        with self.SessionLocal() as db:
            self.assertEqual(db.get(ModRefreshJob, (self.modset_id, "REFRESH001")).state, "succeeded")
