import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Mod, UserMod
from app.mod_persistence import upsert_scraped_mod
from app.mod_queries import normalize_dependencies, normalize_match_value
from app.schemas import DependencyRead
from app.scraper import WorkshopScraper


async def track_and_refresh_dependencies_for_installed_mod(db: Session, mod: Mod, scraper: WorkshopScraper) -> None:
    if not mod.user_mod or not mod.user_mod.current_version:
        return

    dependency_ids_to_refresh: list[str] = []
    for dependency in normalize_dependencies(mod.dependencies or []):
        dependency_id = dependency_mod_id(dependency, db)
        if not dependency_id or dependency_id == mod.id:
            continue

        dependency_mod = db.get(Mod, dependency_id)
        if not dependency_mod:
            dependency_mod = Mod(id=dependency_id, name=dependency.name, source_url=dependency.url)
            db.add(dependency_mod)
            db.flush()
        else:
            dependency_mod.name = dependency_mod.name or dependency.name
            dependency_mod.source_url = dependency_mod.source_url or dependency.url

        if not dependency_mod.user_mod:
            db.add(
                UserMod(
                    mod_id=dependency_mod.id,
                    current_version=None,
                    pinned=False,
                    tracking_reason="dependency",
                )
            )
            dependency_ids_to_refresh.append(dependency_mod.id)
        elif not dependency_mod.latest_version:
            dependency_ids_to_refresh.append(dependency_mod.id)

    if dependency_ids_to_refresh:
        db.commit()
        await refresh_dependency_mods(db, dependency_ids_to_refresh, scraper)


async def refresh_dependency_mods(db: Session, mod_ids: list[str], scraper: WorkshopScraper) -> None:
    for mod_id in dict.fromkeys(mod_ids):
        scraped = await scraper.fetch_mod(mod_id)
        upsert_scraped_mod(db, scraped)


def dependency_mod_id(dependency: DependencyRead, db: Session) -> str | None:
    mod_id = workshop_mod_id_from_url(dependency.url)
    if mod_id:
        return mod_id

    known_mod = db.scalar(select(Mod).where(func.lower(Mod.id) == dependency.name.casefold()))
    if known_mod:
        return known_mod.id

    normalized_dependency_name = normalize_match_value(dependency.name)
    if not normalized_dependency_name:
        return None

    known_mods = db.scalars(select(Mod)).all()
    for known_mod in known_mods:
        if normalize_match_value(known_mod.name) == normalized_dependency_name:
            return known_mod.id
    return None


def workshop_mod_id_from_url(url: str | None) -> str | None:
    if not url:
        return None

    match = re.search(r"/workshop/([^/?#]+)", url)
    if not match:
        return None

    candidate = match.group(1).split("-", 1)[0].strip()
    return candidate or None
