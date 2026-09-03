import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from app import scheduler as scheduler_module


class DummyJob:
    def __init__(self, next_run_time):
        self.next_run_time = next_run_time


class FakeScheduler:
    def __init__(self, *, timezone):
        self.timezone = timezone
        self.jobs = {}
        self.started = False

    def add_job(self, func, trigger, **kwargs):
        self.jobs[kwargs["id"]] = {
            "func": func,
            "trigger": trigger,
            "kwargs": kwargs,
        }

    def start(self):
        self.started = True

    def shutdown(self, wait=False):
        return None

    def get_job(self, job_id):
        job = self.jobs.get(job_id)
        if not job:
            return None
        return DummyJob(job["kwargs"].get("next_run_time"))


class SchedulerTestCase(unittest.TestCase):
    def tearDown(self) -> None:
        scheduler_module._scheduler = None
        scheduler_module._last_automatic_started_at = None
        scheduler_module._last_automatic_completed_at = None
        scheduler_module._next_automatic_run_at = None
        scheduler_module._last_refreshed = None
        scheduler_module._last_failed = None
        scheduler_module._last_error = None

    def test_start_scheduler_uses_fixed_daily_times(self) -> None:
        created = []

        def factory(*, timezone):
            scheduler = FakeScheduler(timezone=timezone)
            created.append(scheduler)
            return scheduler

        with (
            patch.object(scheduler_module, "BackgroundScheduler", side_effect=factory),
            patch.object(
                scheduler_module,
                "get_settings",
                return_value=SimpleNamespace(armm_scheduler_timezone="Europe/Berlin"),
            ),
        ):
            scheduler = scheduler_module.start_scheduler()

        self.assertTrue(created)
        fake = created[0]
        self.assertIs(scheduler, fake)
        self.assertTrue(fake.started)
        job = fake.jobs[scheduler_module.SCHEDULER_JOB_ID]
        self.assertEqual(job["trigger"], "cron")
        self.assertEqual(job["kwargs"]["hour"], "10,19")
        self.assertEqual(job["kwargs"]["minute"], 0)
        self.assertEqual(str(fake.timezone), "Europe/Berlin")

    def test_scheduler_status_reports_fixed_schedule_metadata(self) -> None:
        next_run = datetime(2026, 6, 24, 8, 0, tzinfo=timezone.utc)
        scheduler_module._scheduler = SimpleNamespace(
            get_job=lambda job_id: DummyJob(next_run) if job_id == scheduler_module.SCHEDULER_JOB_ID else None
        )

        with patch.object(
            scheduler_module,
            "get_settings",
            return_value=SimpleNamespace(armm_scheduler_timezone="Europe/Berlin"),
        ):
            status = scheduler_module.get_scheduler_status()

        self.assertEqual(status["scheduler_timezone"], "Europe/Berlin")
        self.assertEqual(status["automatic_run_times"], ["10:00", "19:00"])
        self.assertEqual(status["next_automatic_run_at"], next_run)

    def test_refresh_job_uses_scraper_only_refresh(self) -> None:
        class FakeDb:
            def __init__(self) -> None:
                self.added = []
                self.commits = 0
                self.closed = False

            def add(self, row) -> None:
                self.added.append(row)

            def commit(self) -> None:
                self.commits += 1

            def close(self) -> None:
                self.closed = True

        fake_db = FakeDb()
        calls = []

        async def fake_refresh_all_mods(db, send_update_notifications=False, use_reliable_latest=True):
            calls.append(
                {
                    "db": db,
                    "send_update_notifications": send_update_notifications,
                    "use_reliable_latest": use_reliable_latest,
                }
            )
            return SimpleNamespace(refreshed=2, failed={})

        with (
            patch.object(scheduler_module, "SessionLocal", return_value=fake_db),
            patch.object(scheduler_module, "refresh_all_mods", side_effect=fake_refresh_all_mods),
            patch.object(scheduler_module, "_update_next_run_at"),
        ):
            scheduler_module._refresh_job()

        self.assertEqual(
            calls,
            [
                {
                    "db": fake_db,
                    "send_update_notifications": True,
                    "use_reliable_latest": False,
                }
            ],
        )
        self.assertEqual(fake_db.added[0].refreshed, 2)
        self.assertEqual(fake_db.added[0].failed, {})
        self.assertIsNotNone(fake_db.added[0].completed_at)
        self.assertTrue(fake_db.closed)
