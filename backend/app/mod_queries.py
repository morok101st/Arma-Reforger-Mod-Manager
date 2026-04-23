from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Mod, ModVersion, UserMod
from app.schemas import DependencyRead, ModRead, ModReferenceRead
from app.versioning import compare_versions


def mod_to_read(mod: Mod, all_tracked_mods: list[Mod] | None = None) -> ModRead:
    user_mod = mod.user_mod
    current_version = user_mod.current_version if user_mod else None
    tracking_reason = user_mod.tracking_reason if user_mod else "manual"
    return ModRead(
        id=mod.id,
        name=mod.name,
        summary=mod.summary,
        description=mod.description,
        latest_version=mod.latest_version,
        game_version=mod.game_version,
        size=mod.size,
        dependencies=normalize_dependencies(mod.dependencies or []),
        dependents=find_dependents(mod, all_tracked_mods or []),
        source_url=mod.source_url,
        last_checked=mod.last_checked,
        current_version=current_version,
        pinned=bool(user_mod.pinned) if user_mod else False,
        tracking_reason=tracking_reason,
        status=compare_versions(current_version, mod.latest_version),
        versions=sort_versions(mod.versions)[:10],
    )


def list_mods(db: Session) -> list[ModRead]:
    mods = list_tracked_mods(db)
    return [mod_to_read(mod, mods) for mod in mods]


def get_mod_read(db: Session, mod_id: str) -> ModRead | None:
    mods = list_tracked_mods(db)
    mod = next((candidate for candidate in mods if candidate.id == mod_id), None)
    if not mod:
        return None
    return mod_to_read(mod, mods)


def list_tracked_mods(db: Session) -> list[Mod]:
    return list(
        db.scalars(
            select(Mod)
            .join(UserMod)
            .options(selectinload(Mod.user_mod), selectinload(Mod.versions))
            .order_by(func.lower(Mod.name).nullslast(), Mod.id)
        ).all()
    )


def get_mod_or_none(db: Session, mod_id: str) -> Mod | None:
    return db.scalar(select(Mod).where(Mod.id == mod_id).options(selectinload(Mod.user_mod), selectinload(Mod.versions)))


def normalize_dependencies(dependencies: list[object]) -> list[DependencyRead]:
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


def find_dependents(target: Mod, all_tracked_mods: list[Mod]) -> list[ModReferenceRead]:
    dependents: list[ModReferenceRead] = []
    for candidate in all_tracked_mods:
        if candidate.id == target.id:
            continue
        dependencies = normalize_dependencies(candidate.dependencies or [])
        if any(dependency_matches_mod(dependency, target) for dependency in dependencies):
            dependents.append(ModReferenceRead(id=candidate.id, name=candidate.name, source_url=candidate.source_url))
    return dependents


def dependency_matches_mod(dependency: DependencyRead, target: Mod) -> bool:
    target_id = normalize_match_value(target.id)
    target_name = normalize_match_value(target.name)
    dependency_name = normalize_match_value(dependency.name)
    dependency_url = normalize_match_value(dependency.url)

    return bool(dependency_url and target_id in dependency_url) or dependency_name == target_id or bool(target_name and dependency_name == target_name)


def normalize_match_value(value: str | None) -> str:
    if not value:
        return ""
    return " ".join(value.casefold().split())


def sort_versions(versions: list[ModVersion]) -> list[ModVersion]:
    return sorted(
        versions,
        key=lambda version: version.last_modified_at or version.published_at or version.created_at,
        reverse=True,
    )
