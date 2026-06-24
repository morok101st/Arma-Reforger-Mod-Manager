import asyncio
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.exc import OperationalError
from sqlalchemy import select

from app.config import get_settings
from app.database import SessionLocal
from app.models import SchedulerRun
from app.services import refresh_all_mods

AUTOMATIC_RUN_TIMES = ["10:00", "19:00"]
SCHEDULER_JOB_ID = "refresh-workshop-mods"

_scheduler: BackgroundScheduler | None = None
_last_automatic_started_at: datetime | None = None
_last_automatic_completed_at: datetime | None = None
_next_automatic_run_at: datetime | None = None
_last_refreshed: int | None = None
_last_failed: dict[str, str] | None = None
_last_error: str | None = None


def start_scheduler() -> BackgroundScheduler:
    global _scheduler

    settings = get_settings()
    scheduler = BackgroundScheduler(timezone=ZoneInfo(settings.armm_scheduler_timezone))
    scheduler.add_job(
        _refresh_job,
        "cron",
        hour="10,19",
        minute=0,
        id=SCHEDULER_JOB_ID,
        replace_existing=True,
        max_instances=1,
    )
    scheduler.start()
    _scheduler = scheduler
    _update_next_run_at()
    return scheduler


def get_scheduler_status() -> dict[str, object]:
    settings = get_settings()
    _update_next_run_at()
    last_run = _last_completed_scheduler_run()
    return {
        "scheduler_timezone": settings.armm_scheduler_timezone,
        "automatic_run_times": AUTOMATIC_RUN_TIMES,
        "last_automatic_started_at": _last_automatic_started_at or (last_run.started_at if last_run else None),
        "last_automatic_completed_at": _last_automatic_completed_at or (last_run.completed_at if last_run else None),
        "next_automatic_run_at": _next_automatic_run_at,
        "last_refreshed": _last_refreshed if _last_refreshed is not None else (last_run.refreshed if last_run else None),
        "last_failed": _last_failed if _last_failed is not None else (last_run.failed if last_run else None),
        "last_error": _last_error if _last_error is not None else (last_run.error if last_run else None),
    }


def _refresh_job() -> None:
    global _last_automatic_started_at, _last_automatic_completed_at, _last_refreshed, _last_failed, _last_error

    _last_automatic_started_at = datetime.now(timezone.utc)
    _last_error = None
    db = SessionLocal()
    run = SchedulerRun(started_at=_last_automatic_started_at, failed={})
    db.add(run)
    db.commit()
    try:
        result = asyncio.run(refresh_all_mods(db, send_update_notifications=True))
        _last_refreshed = result.refreshed
        _last_failed = result.failed
        _last_automatic_completed_at = datetime.now(timezone.utc)
        run.refreshed = result.refreshed
        run.failed = result.failed
        run.completed_at = _last_automatic_completed_at
        db.commit()
    except Exception as exc:
        _last_error = str(exc)
        run.error = _last_error
        db.commit()
        raise
    finally:
        db.close()
        _update_next_run_at()


def _update_next_run_at() -> None:
    global _next_automatic_run_at

    if not _scheduler:
        _next_automatic_run_at = None
        return

    job = _scheduler.get_job(SCHEDULER_JOB_ID)
    _next_automatic_run_at = job.next_run_time if job else None


def _last_completed_scheduler_run() -> SchedulerRun | None:
    with SessionLocal() as db:
        try:
            return db.scalar(
                select(SchedulerRun)
                .where(SchedulerRun.completed_at.is_not(None))
                .order_by(SchedulerRun.completed_at.desc())
                .limit(1)
            )
        except OperationalError:
            return None
