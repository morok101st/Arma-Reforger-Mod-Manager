from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.mod_dependencies import track_and_refresh_dependencies_for_installed_mod
from app.mod_persistence import upsert_scraped_mod
from app.mod_queries import get_mod_or_none, get_mod_read, list_mods
from app.models import Mod, UserMod
from app.schemas_mods import ModCreate, ModRead, RefreshResult, UserModUpdate
from app.scraper import WorkshopScraper


async def create_mod(db: Session, payload: ModCreate) -> ModRead:
    mod = get_mod_or_none(db, payload.id)
    if not mod:
        mod = Mod(id=payload.id)
        db.add(mod)
        db.flush()

    if not mod.user_mod:
        db.add(
            UserMod(
                mod_id=payload.id,
                current_version=payload.current_version,
                pinned=payload.pinned,
                tracking_reason="manual",
            )
        )
    else:
        mod.user_mod.current_version = payload.current_version
        mod.user_mod.pinned = payload.pinned
        mod.user_mod.tracking_reason = "manual"

    db.commit()
    await refresh_mod(db, payload.id)
    read = get_mod_read(db, payload.id)
    assert read is not None
    return read


async def update_user_mod(db: Session, mod_id: str, payload: UserModUpdate) -> ModRead | None:
    mod = get_mod_or_none(db, mod_id)
    if not mod:
        return None

    user_mod = mod.user_mod
    if not user_mod:
        user_mod = UserMod(mod_id=mod_id, tracking_reason="manual")
        db.add(user_mod)

    if payload.current_version is not None:
        user_mod.current_version = payload.current_version
    if payload.pinned is not None:
        user_mod.pinned = payload.pinned
    user_mod.tracking_reason = "manual"

    db.commit()
    refreshed = get_mod_or_none(db, mod_id)
    if refreshed:
        scraper = WorkshopScraper(get_settings().workshop_base_url)
        await track_and_refresh_dependencies_for_installed_mod(db, refreshed, scraper)
    return get_mod_read(db, mod_id)


async def refresh_mod(db: Session, mod_id: str) -> ModRead:
    scraper = WorkshopScraper(get_settings().workshop_base_url)
    scraped = await scraper.fetch_mod(mod_id)
    upsert_scraped_mod(db, scraped)
    refreshed = get_mod_or_none(db, mod_id)
    assert refreshed is not None
    await track_and_refresh_dependencies_for_installed_mod(db, refreshed, scraper)
    read = get_mod_read(db, mod_id)
    assert read is not None
    return read


async def refresh_all_mods(db: Session) -> RefreshResult:
    mod_ids = list(db.scalars(select(Mod.id).order_by(Mod.id)).all())
    failed: dict[str, str] = {}
    refreshed = 0
    for mod_id in mod_ids:
        try:
            await refresh_mod(db, mod_id)
            refreshed += 1
        except Exception as exc:
            failed[mod_id] = str(exc)
    return RefreshResult(refreshed=refreshed, failed=failed)


def delete_mod(db: Session, mod_id: str) -> bool:
    mod = db.get(Mod, mod_id)
    if not mod:
        return False
    db.delete(mod)
    db.commit()
    return True
