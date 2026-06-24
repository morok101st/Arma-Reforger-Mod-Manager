from datetime import datetime

from pydantic import BaseModel


class SchedulerStatusRead(BaseModel):
    scheduler_timezone: str
    automatic_run_times: list[str]
    last_automatic_started_at: datetime | None
    last_automatic_completed_at: datetime | None
    next_automatic_run_at: datetime | None
    last_refreshed: int | None
    last_failed: dict[str, str] | None
    last_error: str | None
