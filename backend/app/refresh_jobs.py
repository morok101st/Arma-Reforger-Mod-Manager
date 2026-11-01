"""Durable manual refresh jobs, shared by the async and legacy HTTP APIs.

PostgreSQL session advisory locks live on a dedicated connection for the entire
execution. A second worker can recover a running row only after its owner has
lost that lock. No timeout can unlock a slow but still active refresh.
"""
import asyncio
from collections.abc import Callable
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import logging
from pathlib import Path
import tempfile
import threading
from uuid import uuid4

from sqlalchemy import select, text, update
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.audit import record_audit
from app.models import ModRefreshJob, User, UserMod
from app.schemas_mods import ModRefreshJobRead

logger = logging.getLogger(__name__)
ACTIVE_STATES = ("queued", "running")


def enqueue_refresh(db: Session, mod_id: str, modset_id: int, actor: User) -> ModRefreshJobRead:
    key = (modset_id, mod_id)
    values = dict(attempt=str(uuid4()), state="queued", requested_at=datetime.now(timezone.utc),
                  started_at=None, completed_at=None, error=None, actor_user_id=actor.id)
    # Conditional UPDATE plus the composite PK cover both existing and first jobs.
    changed = db.execute(update(ModRefreshJob).where(
        ModRefreshJob.modset_id == modset_id, ModRefreshJob.mod_id == mod_id,
        ModRefreshJob.state.not_in(ACTIVE_STATES),
    ).values(**values)).rowcount
    if not changed and db.get(ModRefreshJob, key) is None:
        try:
            with db.begin_nested():
                db.add(ModRefreshJob(mod_id=mod_id, modset_id=modset_id, **values))
                db.flush()
        except IntegrityError:
            pass  # A concurrent request won the unique key.
    db.commit()
    db.expire_all()
    return ModRefreshJobRead.model_validate(db.get(ModRefreshJob, key))


def list_refresh_jobs(db: Session, modset_id: int) -> list[ModRefreshJobRead]:
    jobs = db.scalars(select(ModRefreshJob).join(UserMod, (
        (UserMod.modset_id == ModRefreshJob.modset_id) & (UserMod.mod_id == ModRefreshJob.mod_id)
    )).where(ModRefreshJob.modset_id == modset_id)).all()
    return [ModRefreshJobRead.model_validate(job) for job in jobs]


@contextmanager
def execution_lock(engine: Engine, modset_id: int, mod_id: str):
    digest = hashlib.sha256(f"armm-manual-refresh:{modset_id}:{mod_id}".encode()).digest()
    lock_id = int.from_bytes(digest[:8], "big", signed=True)
    if engine.dialect.name == "postgresql":
        # Use a fresh physical connection, never leave session locks in the pool.
        connection = engine.connect()
        acquired = False
        try:
            acquired = bool(connection.execute(text("SELECT pg_try_advisory_lock(:key)"), {"key": lock_id}).scalar())
            connection.commit()
            yield acquired
        finally:
            try:
                if acquired:
                    connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": lock_id})
                    connection.commit()
            except Exception:
                connection.invalidate()
                raise
            finally:
                connection.close()
    else:
        # Local SQLite development: process-safe lock, released by the OS on exit.
        import fcntl
        identity = hashlib.sha256(f"{engine.url}:{lock_id}".encode()).hexdigest()
        directory = Path(tempfile.gettempdir()) / "armm-refresh-locks"
        directory.mkdir(mode=0o700, exist_ok=True)
        with (directory / identity).open("a") as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                yield False
            else:
                try:
                    yield True
                finally:
                    fcntl.flock(handle, fcntl.LOCK_UN)


def execute_refresh(engine: Engine, modset_id: int, mod_id: str) -> None:
    from app.services import refresh_mod

    with execution_lock(engine, modset_id, mod_id) as acquired:
        if not acquired:
            return
        with Session(engine) as db:
            job = db.get(ModRefreshJob, (modset_id, mod_id))
            if job is None or job.state not in ACTIVE_STATES:
                return
            if job.state == "running":
                # The prior process lost its lock. Do not replay possible effects.
                job.state = "failed"
                job.error = "Update check was interrupted. Please try again."
                job.completed_at = datetime.now(timezone.utc)
                _audit_result(db, job)
                db.commit()
                return
            if db.scalar(select(UserMod.id).where(UserMod.modset_id == modset_id, UserMod.mod_id == mod_id)) is None:
                db.delete(job)
                db.commit()
                return
            job.state = "running"
            job.started_at = datetime.now(timezone.utc)
            db.commit()
            attempt = job.attempt
            try:
                # The request connection is not involved; closing a tab cannot cancel this.
                asyncio.run(refresh_mod(db, mod_id, modset_id, send_update_notifications=False))
            except Exception:
                db.rollback()
                logger.exception("Manual refresh failed for mod=%s modset=%s", mod_id, modset_id)
                state, error = "failed", "Update check failed. Please try again."
            else:
                state, error = "succeeded", None
            db.expire_all()
            job = db.get(ModRefreshJob, (modset_id, mod_id))
            if job is not None and job.attempt == attempt:
                job.state, job.error = state, error
                job.completed_at = datetime.now(timezone.utc)
                _audit_result(db, job)
                db.commit()


def _audit_result(db: Session, job: ModRefreshJob) -> None:
    from app.mod_queries import get_mod_read

    mod = get_mod_read(db, job.mod_id, job.modset_id)
    detail = {"modset_id": job.modset_id, "attempt": job.attempt, "mod_name": mod.name if mod else None}
    if job.state == "succeeded" and mod:
        detail.update(latest_version=mod.latest_version, status=mod.status.value)
    else:
        detail["reason"] = job.error
    record_audit(db, action="mod_refreshed" if job.state == "succeeded" else "mod_refresh_failed",
                 entity_type="mod", entity_id=job.mod_id,
                 actor=db.get(User, job.actor_user_id) if job.actor_user_id else None,
                 detail=detail, commit=False)


def start_refresh_workers(engine: Engine) -> Callable[[], None]:
    stop = threading.Event()
    factory = sessionmaker(bind=engine)

    def worker():
        while not stop.is_set():
            try:
                with factory() as db:
                    keys = db.execute(select(ModRefreshJob.modset_id, ModRefreshJob.mod_id).where(
                        ModRefreshJob.state.in_(ACTIVE_STATES)
                    ).order_by(ModRefreshJob.requested_at)).all()
                for modset_id, mod_id in keys:
                    if stop.is_set():
                        break
                    execute_refresh(engine, modset_id, mod_id)
            except Exception:
                logger.exception("Refresh worker iteration failed")
            stop.wait(1)

    threads = [threading.Thread(target=worker, name=f"manual-refresh-{i}", daemon=True) for i in range(2)]
    for thread in threads:
        thread.start()

    def shutdown():
        stop.set()
        # Bound shutdown; unfinished jobs are recovered on the next start.
        for thread in threads:
            thread.join(timeout=1)

    return shutdown
