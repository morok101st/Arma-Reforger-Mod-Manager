import asyncio

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import get_settings
from app.database import SessionLocal
from app.services import refresh_all_mods


def start_scheduler() -> BackgroundScheduler:
    settings = get_settings()
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        _refresh_job,
        "interval",
        minutes=settings.scrape_interval_minutes,
        id="refresh-workshop-mods",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.start()
    return scheduler


def _refresh_job() -> None:
    db = SessionLocal()
    try:
        asyncio.run(refresh_all_mods(db))
    finally:
        db.close()

