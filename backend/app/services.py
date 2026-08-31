import asyncio
import queue
import threading
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.discord_webhooks import notify_update_available
from app.mod_dependencies import (
    dependency_mod_id,
    synchronize_dependency_tracking_for_modset_state,
    track_and_refresh_dependencies_for_installed_mod,
)
from app.mod_persistence import upsert_scraped_mod
from app.mod_queries import (
    collect_dependency_sets,
    get_mod_or_none,
    get_mod_read,
    get_user_mod_or_none,
    list_mods as list_mods_query,
    list_tracked_user_mods,
    normalize_dependencies,
)
from app.models import Mod, UserMod
from app.schemas_mods import ModCreate, ModRead, RefreshResult, UserModUpdate
from app.scraper import WorkshopScraper
from app.workshop_provider import get_workshop_metadata_provider


class ModDeleteBlockedError(Exception):
    pass


@dataclass(frozen=True)
class MetadataRefreshJob:
    mod_id: str
    modset_id: int
    send_update_notifications: bool = False


_METADATA_REFRESH_WORKERS = 2
_metadata_refresh_queue: queue.Queue[MetadataRefreshJob] = queue.Queue()
_metadata_refresh_pending: set[tuple[str, int]] = set()
_metadata_refresh_lock = threading.Lock()
_metadata_refresh_workers_started = False


async def create_mod(db: Session, payload: ModCreate, modset_id: int, defer_metadata_refresh: bool = False) -> ModRead:
    mod = db.get(Mod, payload.id)
    if not mod:
        mod = Mod(id=payload.id)
        db.add(mod)
        db.flush()

    user_mod = get_user_mod_or_none(db, payload.id, modset_id)
    if not user_mod:
        db.add(
            UserMod(
                modset_id=modset_id,
                mod_id=payload.id,
                current_version=payload.current_version,
                pinned=payload.pinned,
                tracking_reason="manual",
            )
        )
    else:
        user_mod.current_version = payload.current_version
        user_mod.pinned = payload.pinned
        user_mod.tracking_reason = "manual"

    db.commit()
    if defer_metadata_refresh:
        await fetch_and_upsert_mods(db, WorkshopScraper(get_settings().workshop_base_url), [payload.id])
        synchronize_dependency_tracking_for_modset_state(db, modset_id)
    else:
        await refresh_mod(db, payload.id, modset_id, send_update_notifications=False)
    read = get_mod_read(db, payload.id, modset_id)
    assert read is not None
    return read


async def update_user_mod(
    db: Session,
    mod_id: str,
    payload: UserModUpdate,
    modset_id: int,
    provided_fields: set[str] | None = None,
    deactivate_orphan_dependencies: bool = False,
    send_update_notifications: bool = False,
    defer_metadata_refresh: bool = False,
) -> ModRead | None:
    mod = db.get(Mod, mod_id)
    if not mod:
        return None

    user_mod = get_user_mod_or_none(db, mod_id, modset_id)
    if not user_mod:
        user_mod = UserMod(modset_id=modset_id, mod_id=mod_id, tracking_reason="manual")
        db.add(user_mod)
    previous_current_version = (user_mod.current_version or "").strip()
    provided_fields = provided_fields or set(payload.model_fields_set)

    if "current_version" in provided_fields:
        user_mod.current_version = payload.current_version
    if "pinned" in provided_fields and payload.pinned is not None:
        user_mod.pinned = payload.pinned
    if "is_core" in provided_fields and payload.is_core is not None:
        user_mod.is_core = payload.is_core
    if "load_order" in provided_fields and payload.load_order is not None:
        user_mod.load_order = payload.load_order
    user_mod.tracking_reason = "manual"

    db.commit()
    current_version = (user_mod.current_version or "").strip()
    if deactivate_orphan_dependencies and previous_current_version and not current_version:
        orphaned_dependency_ids = find_orphaned_dependency_ids_for_mod_delete(db, mod_id, modset_id)
        deactivate_dependency_tracking(db, modset_id, orphaned_dependency_ids)
    if defer_metadata_refresh:
        refreshed = get_mod_or_none(db, mod_id, modset_id)
        if refreshed:
            synchronize_dependency_tracking_for_modset_state(db, modset_id)
        read = get_mod_read(db, mod_id, modset_id)
        if read and send_update_notifications:
            await notify_update_available(db, modset_id, read)
        return read
    metadata_provider = get_workshop_metadata_provider(get_settings())
    # If a mod transitions from "no installed version" to a defined version, try a full refresh first.
    # If that fails (network/workshop issue), fall back to the stored dependency list so dependency
    # tracking is still applied for the active modset.
    if not previous_current_version and current_version:
        try:
            return await refresh_mod(db, mod_id, modset_id, send_update_notifications=send_update_notifications)
        except Exception:
            refreshed = get_mod_or_none(db, mod_id, modset_id)
            if refreshed:
                await track_and_refresh_dependencies_for_installed_mod(db, refreshed, modset_id, metadata_provider)
            read = get_mod_read(db, mod_id, modset_id)
            if read and send_update_notifications:
                await notify_update_available(db, modset_id, read)
            return read

    refreshed = get_mod_or_none(db, mod_id, modset_id)
    if refreshed:
        await track_and_refresh_dependencies_for_installed_mod(db, refreshed, modset_id, metadata_provider)
    read = get_mod_read(db, mod_id, modset_id)
    if read and send_update_notifications:
        await notify_update_available(db, modset_id, read)
    return read


async def refresh_mod_background(mod_id: str, modset_id: int, send_update_notifications: bool = False) -> None:
    db = SessionLocal()
    try:
        await refresh_mod(db, mod_id, modset_id, send_update_notifications=send_update_notifications)
    except Exception as exc:
        print(f"Background metadata refresh failed for mod={mod_id} modset={modset_id}: {exc}", flush=True)
    finally:
        db.close()


def schedule_mod_metadata_refresh(mod_id: str, modset_id: int, send_update_notifications: bool = False) -> None:
    global _metadata_refresh_workers_started

    normalized_mod_id = mod_id.strip().upper()
    job_key = (normalized_mod_id, modset_id)
    with _metadata_refresh_lock:
        if not _metadata_refresh_workers_started:
            _start_metadata_refresh_workers()
            _metadata_refresh_workers_started = True
        if job_key in _metadata_refresh_pending:
            return
        _metadata_refresh_pending.add(job_key)

    _metadata_refresh_queue.put(MetadataRefreshJob(normalized_mod_id, modset_id, send_update_notifications))


def _start_metadata_refresh_workers() -> None:
    for worker_index in range(_METADATA_REFRESH_WORKERS):
        thread = threading.Thread(target=_metadata_refresh_worker, name=f"mod-refresh-worker-{worker_index + 1}", daemon=True)
        thread.start()


def _metadata_refresh_worker() -> None:
    while True:
        job = _metadata_refresh_queue.get()
        try:
            asyncio.run(
                refresh_mod_background(
                    job.mod_id,
                    job.modset_id,
                    send_update_notifications=job.send_update_notifications,
                )
            )
        finally:
            with _metadata_refresh_lock:
                _metadata_refresh_pending.discard((job.mod_id, job.modset_id))
            _metadata_refresh_queue.task_done()


async def refresh_mod(db: Session, mod_id: str, modset_id: int, send_update_notifications: bool = False) -> ModRead:
    metadata_provider = get_workshop_metadata_provider(get_settings())
    await fetch_and_upsert_mods(db, metadata_provider, [mod_id])
    refreshed = get_mod_or_none(db, mod_id, modset_id)
    assert refreshed is not None
    await track_and_refresh_dependencies_for_installed_mod(db, refreshed, modset_id, metadata_provider)
    read = get_mod_read(db, mod_id, modset_id)
    assert read is not None
    if send_update_notifications:
        await notify_update_available(db, modset_id, read)
    return read


async def refresh_all_mods(db: Session, send_update_notifications: bool = False) -> RefreshResult:
    mod_ids = list(db.scalars(select(UserMod.mod_id).distinct().order_by(UserMod.mod_id)).all())
    failed: dict[str, str] = {}
    refreshed = 0
    for mod_id in mod_ids:
        try:
            await refresh_mod_for_all_modsets(db, mod_id, send_update_notifications=send_update_notifications)
            refreshed += 1
        except Exception as exc:
            failed[mod_id] = str(exc)
    return RefreshResult(refreshed=refreshed, failed=failed)


async def refresh_mod_for_all_modsets(db: Session, mod_id: str, send_update_notifications: bool = False) -> None:
    # Refreshes global workshop data once, then updates dependency tracking in each modset that tracks the mod.
    metadata_provider = get_workshop_metadata_provider(get_settings())
    await fetch_and_upsert_mods(db, metadata_provider, [mod_id])

    modset_ids = list(db.scalars(select(UserMod.modset_id).where(UserMod.mod_id == mod_id).distinct()).all())
    for modset_id in modset_ids:
        refreshed = get_mod_or_none(db, mod_id, modset_id)
        if not refreshed:
            continue
        await track_and_refresh_dependencies_for_installed_mod(db, refreshed, modset_id, metadata_provider)
        read = get_mod_read(db, mod_id, modset_id)
        if read and send_update_notifications:
            await notify_update_available(db, modset_id, read)


async def fetch_and_upsert_mods(db: Session, metadata_provider, mod_ids: list[str]) -> None:
    if hasattr(metadata_provider, "fetch_mods"):
        scraped_mods = (await metadata_provider.fetch_mods(mod_ids)).values()
    else:
        scraped_mods = [await metadata_provider.fetch_mod(mod_id) for mod_id in mod_ids]
    for scraped in scraped_mods:
        upsert_scraped_mod(db, scraped)


def delete_mod(db: Session, mod_id: str, modset_id: int, deactivate_orphan_dependencies: bool = False) -> bool:
    user_mod = get_user_mod_or_none(db, mod_id, modset_id)
    if not user_mod:
        return False
    if is_delete_blocked(db, mod_id, modset_id):
        raise ModDeleteBlockedError("Cannot delete a mod that is an active dependency of another tracked mod.")
    orphaned_dependency_ids = find_orphaned_dependency_ids_for_mod_delete(db, mod_id, modset_id)
    db.delete(user_mod)
    db.commit()
    if deactivate_orphan_dependencies:
        deactivate_dependency_tracking(db, modset_id, orphaned_dependency_ids)
    synchronize_dependency_tracking_for_modset_state(db, modset_id)
    return True


def list_mods(db: Session, modset_id: int) -> list[ModRead]:
    return list_mods_query(db, modset_id)


def is_delete_blocked(db: Session, mod_id: str, modset_id: int) -> bool:
    mappings = list_tracked_user_mods(db, modset_id)
    dependency_ids, _ = collect_dependency_sets(mappings)
    return mod_id in dependency_ids


def find_orphaned_dependency_ids_for_mod_delete(db: Session, mod_id: str, modset_id: int) -> list[str]:
    mappings = list_tracked_user_mods(db, modset_id)
    selected_mapping = next((mapping for mapping in mappings if mapping.mod_id == mod_id), None)
    if not selected_mapping:
        return []

    candidate_ids: set[str] = set()
    for dependency in normalize_dependencies(selected_mapping.mod.dependencies or []):
        dependency_id = dependency_mod_id(dependency, db)
        if not dependency_id or dependency_id == mod_id:
            continue
        tracked_dependency = next((mapping for mapping in mappings if mapping.mod_id == dependency_id), None)
        if tracked_dependency and tracked_dependency.dependency_origin:
            candidate_ids.add(dependency_id)

    if not candidate_ids:
        return []

    remaining_mappings = [mapping for mapping in mappings if mapping.mod_id != mod_id and (mapping.current_version or "").strip()]
    orphaned_ids: list[str] = []
    for candidate_id in sorted(candidate_ids):
        still_required = False
        candidate_mod = next((mapping.mod for mapping in mappings if mapping.mod_id == candidate_id), None)
        if not candidate_mod:
            continue
        for mapping in remaining_mappings:
            if any(dependency_matches_candidate(dependency, candidate_mod, db) for dependency in normalize_dependencies(mapping.mod.dependencies or [])):
                still_required = True
                break
        if not still_required:
            orphaned_ids.append(candidate_id)
    return orphaned_ids


def dependency_matches_candidate(dependency, candidate_mod: Mod, db: Session) -> bool:
    dependency_id = dependency_mod_id(dependency, db)
    return dependency_id == candidate_mod.id if dependency_id else False


def deactivate_dependency_tracking(db: Session, modset_id: int, mod_ids: list[str]) -> None:
    if not mod_ids:
        return
    mappings = list(
        db.scalars(select(UserMod).where(UserMod.modset_id == modset_id, UserMod.mod_id.in_(mod_ids))).all()
    )
    for mapping in mappings:
        mapping.current_version = None
    db.commit()
