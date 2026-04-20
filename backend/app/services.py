import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.models import Mod, ModVersion, UserMod
from app.schemas import DependencyRead, ModCreate, ModRead, ModReferenceRead, RefreshResult, UserModUpdate
from app.scraper import ScrapedMod, WorkshopScraper
from app.versioning import compare_versions


def mod_to_read(mod: Mod, all_tracked_mods: list[Mod] | None = None) -> ModRead:
    user_mod = mod.user_mod
    current_version = user_mod.current_version if user_mod else None
    return ModRead(
        id=mod.id,
        name=mod.name,
        summary=mod.summary,
        description=mod.description,
        latest_version=mod.latest_version,
        game_version=mod.game_version,
        size=mod.size,
        dependencies=_normalize_dependencies(mod.dependencies or []),
        dependents=_find_dependents(mod, all_tracked_mods or []),
        source_url=mod.source_url,
        last_checked=mod.last_checked,
        current_version=current_version,
        pinned=bool(user_mod.pinned) if user_mod else False,
        status=compare_versions(current_version, mod.latest_version),
        versions=mod.versions[:10],
    )


def list_mods(db: Session) -> list[ModRead]:
    mods = _list_tracked_mods(db)
    return [mod_to_read(mod, mods) for mod in mods]


def get_mod_read(db: Session, mod_id: str) -> ModRead | None:
    mods = _list_tracked_mods(db)
    mod = next((candidate for candidate in mods if candidate.id == mod_id), None)
    if not mod:
        return None
    return mod_to_read(mod, mods)


def _list_tracked_mods(db: Session) -> list[Mod]:
    return list(db.scalars(
        select(Mod)
        .join(UserMod)
        .options(selectinload(Mod.user_mod), selectinload(Mod.versions))
        .order_by(func.lower(Mod.name).nullslast(), Mod.id)
    ).all())


def get_mod_or_none(db: Session, mod_id: str) -> Mod | None:
    return db.scalar(
        select(Mod).where(Mod.id == mod_id).options(selectinload(Mod.user_mod), selectinload(Mod.versions))
    )


async def create_mod(db: Session, payload: ModCreate) -> ModRead:
    mod = get_mod_or_none(db, payload.id)
    if not mod:
        mod = Mod(id=payload.id)
        db.add(mod)
        db.flush()

    if not mod.user_mod:
        db.add(UserMod(mod_id=payload.id, current_version=payload.current_version, pinned=payload.pinned))
    else:
        mod.user_mod.current_version = payload.current_version
        mod.user_mod.pinned = payload.pinned

    db.commit()
    await refresh_mod(db, payload.id)
    read = get_mod_read(db, payload.id)
    assert read is not None
    return read


def update_user_mod(db: Session, mod_id: str, payload: UserModUpdate) -> ModRead | None:
    mod = get_mod_or_none(db, mod_id)
    if not mod:
        return None

    user_mod = mod.user_mod
    if not user_mod:
        user_mod = UserMod(mod_id=mod_id)
        db.add(user_mod)

    if payload.current_version is not None:
        user_mod.current_version = payload.current_version
    if payload.pinned is not None:
        user_mod.pinned = payload.pinned

    db.commit()
    refreshed = get_mod_or_none(db, mod_id)
    if refreshed:
        _track_dependencies_for_installed_mod(db, refreshed)
    return get_mod_read(db, mod_id)


async def refresh_mod(db: Session, mod_id: str) -> ModRead:
    scraper = WorkshopScraper(get_settings().workshop_base_url)
    scraped = await scraper.fetch_mod(mod_id)
    _upsert_scraped_mod(db, scraped)
    refreshed = get_mod_or_none(db, mod_id)
    assert refreshed is not None
    _track_dependencies_for_installed_mod(db, refreshed)
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
        except Exception as exc:  # scheduler/API should continue with remaining mods
            failed[mod_id] = str(exc)
    return RefreshResult(refreshed=refreshed, failed=failed)


def delete_mod(db: Session, mod_id: str) -> bool:
    mod = db.get(Mod, mod_id)
    if not mod:
        return False
    db.delete(mod)
    db.commit()
    return True


def _normalize_dependencies(dependencies: list[object]) -> list[DependencyRead]:
    normalized: list[DependencyRead] = []
    for dependency in dependencies:
        if isinstance(dependency, str):
            name = dependency.strip()
            if name:
                normalized.append(DependencyRead(name=name, url=None))
            continue

        if isinstance(dependency, dict):
            name_value = dependency.get("name")
            name = str(name_value).strip() if name_value is not None else ""
            if not name:
                continue
            url_value = dependency.get("url")
            url = str(url_value).strip() if url_value else None
            normalized.append(DependencyRead(name=name, url=url))
    return normalized


def _find_dependents(target: Mod, all_tracked_mods: list[Mod]) -> list[ModReferenceRead]:
    dependents: list[ModReferenceRead] = []
    for candidate in all_tracked_mods:
        if candidate.id == target.id:
            continue
        dependencies = _normalize_dependencies(candidate.dependencies or [])
        if any(_dependency_matches_mod(dependency, target) for dependency in dependencies):
            dependents.append(ModReferenceRead(id=candidate.id, name=candidate.name, source_url=candidate.source_url))
    return dependents


def _dependency_matches_mod(dependency: DependencyRead, target: Mod) -> bool:
    target_id = _normalize_match_value(target.id)
    target_name = _normalize_match_value(target.name)
    dependency_name = _normalize_match_value(dependency.name)
    dependency_url = _normalize_match_value(dependency.url)

    return (
        bool(dependency_url and target_id in dependency_url)
        or dependency_name == target_id
        or bool(target_name and dependency_name == target_name)
    )


def _normalize_match_value(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.casefold().split())


def _track_dependencies_for_installed_mod(db: Session, mod: Mod) -> None:
    if not mod.user_mod or not mod.user_mod.current_version:
        return

    tracked_count = 0
    for dependency in _normalize_dependencies(mod.dependencies or []):
        dependency_id = _dependency_mod_id(dependency, db)
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
            db.add(UserMod(mod_id=dependency_mod.id, current_version=None, pinned=False))
            tracked_count += 1

    if tracked_count:
        db.commit()


def _dependency_mod_id(dependency: DependencyRead, db: Session) -> str | None:
    mod_id = _workshop_mod_id_from_url(dependency.url)
    if mod_id:
        return mod_id

    known_mod = db.scalar(select(Mod).where(func.lower(Mod.id) == dependency.name.casefold()))
    if known_mod:
        return known_mod.id

    normalized_dependency_name = _normalize_match_value(dependency.name)
    if not normalized_dependency_name:
        return None

    known_mods = db.scalars(select(Mod)).all()
    for known_mod in known_mods:
        if _normalize_match_value(known_mod.name) == normalized_dependency_name:
            return known_mod.id
    return None


def _workshop_mod_id_from_url(url: str | None) -> str | None:
    if not url:
        return None

    match = re.search(r"/workshop/([^/?#]+)", url)
    if not match:
        return None

    candidate = match.group(1).split("-", 1)[0].strip()
    return candidate or None


def _upsert_scraped_mod(db: Session, scraped: ScrapedMod) -> None:
    mod = db.get(Mod, scraped.id)
    if not mod:
        mod = Mod(id=scraped.id)
        db.add(mod)

    mod.name = scraped.name or mod.name
    mod.summary = scraped.summary or mod.summary
    mod.description = scraped.description or mod.description
    mod.latest_version = scraped.latest_version or mod.latest_version
    mod.game_version = scraped.game_version or mod.game_version
    mod.size = scraped.size or mod.size
    mod.dependencies = scraped.dependencies
    mod.source_url = scraped.source_url
    mod.last_checked = scraped.last_checked

    if scraped.latest_version:
        existing = db.scalar(
            select(ModVersion).where(ModVersion.mod_id == scraped.id, ModVersion.version == scraped.latest_version)
        )
        if not existing:
            db.add(ModVersion(mod_id=scraped.id, version=scraped.latest_version, changelog=scraped.changelog))
        elif scraped.changelog and existing.changelog != scraped.changelog:
            existing.changelog = scraped.changelog

    db.commit()
