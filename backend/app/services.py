from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.mod_dependencies import synchronize_dependency_tracking_for_modset_state, track_and_refresh_dependencies_for_installed_mod
from app.mod_persistence import upsert_scraped_mod
from app.mod_queries import (
    collect_dependency_sets,
    get_mod_or_none,
    get_mod_read,
    get_user_mod_or_none,
    list_mods as list_mods_query,
    list_tracked_user_mods,
)
from app.models import Mod, UserMod
from app.schemas_mods import ModCreate, ModRead, RefreshResult, UserModUpdate
from app.scraper import WorkshopScraper


class ModDeleteBlockedError(Exception):
    pass


async def create_mod(db: Session, payload: ModCreate, modset_id: int) -> ModRead:
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
    await refresh_mod(db, payload.id, modset_id)
    read = get_mod_read(db, payload.id, modset_id)
    assert read is not None
    return read


async def update_user_mod(
    db: Session,
    mod_id: str,
    payload: UserModUpdate,
    modset_id: int,
    provided_fields: set[str] | None = None,
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
    user_mod.tracking_reason = "manual"

    db.commit()
    current_version = (user_mod.current_version or "").strip()
    scraper = WorkshopScraper(get_settings().workshop_base_url)
    # If a mod transitions from "no installed version" to a defined version, try a full refresh first.
    # If that fails (network/workshop issue), fall back to the stored dependency list so dependency
    # tracking is still applied for the active modset.
    if not previous_current_version and current_version:
        try:
            return await refresh_mod(db, mod_id, modset_id)
        except Exception:
            refreshed = get_mod_or_none(db, mod_id, modset_id)
            if refreshed:
                await track_and_refresh_dependencies_for_installed_mod(db, refreshed, modset_id, scraper)
            return get_mod_read(db, mod_id, modset_id)

    refreshed = get_mod_or_none(db, mod_id, modset_id)
    if refreshed:
        await track_and_refresh_dependencies_for_installed_mod(db, refreshed, modset_id, scraper)
    return get_mod_read(db, mod_id, modset_id)


async def refresh_mod(db: Session, mod_id: str, modset_id: int) -> ModRead:
    scraper = WorkshopScraper(get_settings().workshop_base_url)
    scraped = await scraper.fetch_mod(mod_id)
    upsert_scraped_mod(db, scraped)
    refreshed = get_mod_or_none(db, mod_id, modset_id)
    assert refreshed is not None
    await track_and_refresh_dependencies_for_installed_mod(db, refreshed, modset_id, scraper)
    read = get_mod_read(db, mod_id, modset_id)
    assert read is not None
    return read


async def refresh_all_mods(db: Session) -> RefreshResult:
    mod_ids = list(db.scalars(select(UserMod.mod_id).distinct().order_by(UserMod.mod_id)).all())
    failed: dict[str, str] = {}
    refreshed = 0
    for mod_id in mod_ids:
        try:
            await refresh_mod_for_all_modsets(db, mod_id)
            refreshed += 1
        except Exception as exc:
            failed[mod_id] = str(exc)
    return RefreshResult(refreshed=refreshed, failed=failed)


async def refresh_mod_for_all_modsets(db: Session, mod_id: str) -> None:
    # Refreshes global workshop data once, then updates dependency tracking in each modset that tracks the mod.
    scraper = WorkshopScraper(get_settings().workshop_base_url)
    scraped = await scraper.fetch_mod(mod_id)
    upsert_scraped_mod(db, scraped)

    modset_ids = list(db.scalars(select(UserMod.modset_id).where(UserMod.mod_id == mod_id).distinct()).all())
    for modset_id in modset_ids:
        refreshed = get_mod_or_none(db, mod_id, modset_id)
        if not refreshed:
            continue
        await track_and_refresh_dependencies_for_installed_mod(db, refreshed, modset_id, scraper)


def delete_mod(db: Session, mod_id: str, modset_id: int) -> bool:
    user_mod = get_user_mod_or_none(db, mod_id, modset_id)
    if not user_mod:
        return False
    if is_delete_blocked(db, mod_id, modset_id):
        raise ModDeleteBlockedError("Cannot delete a mod that is an active dependency of another tracked mod.")
    db.delete(user_mod)
    db.commit()
    synchronize_dependency_tracking_for_modset_state(db, modset_id)
    return True


def list_mods(db: Session, modset_id: int) -> list[ModRead]:
    return list_mods_query(db, modset_id)


def is_delete_blocked(db: Session, mod_id: str, modset_id: int) -> bool:
    mappings = list_tracked_user_mods(db, modset_id)
    dependency_ids, _ = collect_dependency_sets(mappings)
    return mod_id in dependency_ids
