import re
from typing import Protocol

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Mod, UserMod
from app.mod_persistence import upsert_scraped_mod
from app.mod_queries import list_tracked_user_mods, normalize_dependencies, normalize_match_value
from app.schemas_mods import DependencyRead
from app.scraper import ScrapedMod


class WorkshopMetadataProvider(Protocol):
    async def fetch_mod(self, mod_id: str) -> ScrapedMod:
        pass


async def track_and_refresh_dependencies_for_installed_mod(db: Session, mod: Mod, modset_id: int, metadata_provider: WorkshopMetadataProvider) -> None:
    user_mod = db.scalar(select(UserMod).where(UserMod.modset_id == modset_id, UserMod.mod_id == mod.id))
    if not user_mod:
        return
    await synchronize_dependency_tracking_for_modset(db, modset_id, metadata_provider)


async def synchronize_dependency_tracking_for_modset(db: Session, modset_id: int, metadata_provider: WorkshopMetadataProvider) -> None:
    refreshed_ids: set[str] = set()
    for _ in range(20):
        dependency_ids_to_refresh = [
            mod_id
            for mod_id in synchronize_dependency_tracking_for_modset_state(db, modset_id)
            if mod_id not in refreshed_ids
        ]
        if not dependency_ids_to_refresh:
            return
        refreshed_ids.update(dependency_ids_to_refresh)
        await refresh_dependency_mods(db, dependency_ids_to_refresh, metadata_provider)


def synchronize_dependency_tracking_for_modset_state(db: Session, modset_id: int) -> list[str]:
    mappings = list_tracked_user_mods(db, modset_id)
    tracked_mappings_by_id = {mapping.mod_id: mapping for mapping in mappings}
    required_dependencies: dict[str, DependencyRead] = {}
    dependency_ids_to_refresh: list[str] = []
    state_changed = False
    source_queue = [mapping.mod_id for mapping in mappings if (mapping.current_version or "").strip()]
    inspected_sources: set[str] = set()
    while source_queue:
        source_id = source_queue.pop(0)
        if source_id in inspected_sources:
            continue
        inspected_sources.add(source_id)

        source_mapping = tracked_mappings_by_id.get(source_id)
        source_mod = source_mapping.mod if source_mapping else db.get(Mod, source_id)
        if not source_mod:
            continue

        for dependency in normalize_dependencies(source_mod.dependencies or []):
            dependency_id = dependency_mod_id(dependency, db)
            if not dependency_id or dependency_id == source_id:
                continue
            required_dependencies.setdefault(dependency_id, dependency)
            if dependency_id not in inspected_sources:
                source_queue.append(dependency_id)

    for dependency_id, dependency in required_dependencies.items():
        dependency_mod = db.get(Mod, dependency_id)
        if not dependency_mod:
            dependency_mod = Mod(id=dependency_id, name=dependency.name, source_url=dependency.url)
            db.add(dependency_mod)
            db.flush()
            state_changed = True
        else:
            dependency_mod.name = dependency_mod.name or dependency.name
            dependency_mod.source_url = dependency_mod.source_url or dependency.url

        existing_mapping = tracked_mappings_by_id.get(dependency_id)
        if not existing_mapping:
            db.add(
                UserMod(
                    modset_id=modset_id,
                    mod_id=dependency_id,
                    current_version=None,
                    pinned=False,
                    dependency_origin=True,
                    tracking_reason="dependency",
                )
            )
            if not dependency_mod.latest_version:
                dependency_ids_to_refresh.append(dependency_id)
            state_changed = True
        else:
            if not existing_mapping.dependency_origin:
                existing_mapping.dependency_origin = True
                state_changed = True
            if not dependency_mod.latest_version:
                dependency_ids_to_refresh.append(dependency_id)

    if dependency_ids_to_refresh or state_changed:
        db.commit()
    return dependency_ids_to_refresh


async def refresh_dependency_mods(db: Session, mod_ids: list[str], metadata_provider: WorkshopMetadataProvider) -> None:
    for mod_id in dict.fromkeys(mod_ids):
        try:
            scraped = await metadata_provider.fetch_mod(mod_id)
            upsert_scraped_mod(db, scraped)
        except Exception:
            # Dependency mappings are already persisted; metadata refresh is best-effort.
            continue


def dependency_mod_id(dependency: DependencyRead, db: Session) -> str | None:
    if dependency.id:
        return dependency.id

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
