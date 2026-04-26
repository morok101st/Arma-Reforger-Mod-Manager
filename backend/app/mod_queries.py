from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Mod, ModVersion, UserMod
from app.schemas_mods import DependencyRead, ModRead, ModReferenceRead
from app.versioning import compare_versions


def mod_to_read(
    mod: Mod,
    user_mod: UserMod,
    all_mappings: list[UserMod] | None = None,
    dependency_ids: set[str] | None = None,
    core_dependency_ids: set[str] | None = None,
) -> ModRead:
    current_version = user_mod.current_version
    tracking_reason = user_mod.tracking_reason
    all_mappings = all_mappings or []
    tracked_mods = [mapping.mod for mapping in all_mappings]
    dependency_ids = dependency_ids or set()
    core_dependency_ids = core_dependency_ids or set()
    core_dependents = find_dependents(mod, all_mappings, installed_only=True, core_only=True)
    return ModRead(
        id=mod.id,
        name=mod.name,
        summary=mod.summary,
        description=mod.description,
        latest_version=mod.latest_version,
        game_version=mod.game_version,
        size=mod.size,
        dependencies=normalize_dependencies(mod.dependencies or []),
        dependents=find_dependents(mod, all_mappings, installed_only=False, core_only=False),
        source_url=mod.source_url,
        last_checked=mod.last_checked,
        current_version=current_version,
        pinned=bool(user_mod.pinned),
        is_core=bool(user_mod.is_core),
        is_dependency=mod.id in dependency_ids,
        tracking_reason=tracking_reason,
        core_dependents=core_dependents,
        delete_blocked=mod.id in core_dependency_ids,
        status=compare_versions(current_version, mod.latest_version),
        versions=sort_versions(mod.versions)[:10],
    )


def list_mods(db: Session, modset_id: int) -> list[ModRead]:
    mappings = list_tracked_user_mods(db, modset_id)
    dependency_ids, core_dependency_ids = collect_dependency_sets(mappings)
    return [mod_to_read(mapping.mod, mapping, mappings, dependency_ids, core_dependency_ids) for mapping in mappings]


def get_mod_read(db: Session, mod_id: str, modset_id: int) -> ModRead | None:
    mappings = list_tracked_user_mods(db, modset_id)
    target = next((mapping for mapping in mappings if mapping.mod_id == mod_id), None)
    if not target:
        return None
    dependency_ids, core_dependency_ids = collect_dependency_sets(mappings)
    return mod_to_read(target.mod, target, mappings, dependency_ids, core_dependency_ids)


def list_tracked_user_mods(db: Session, modset_id: int) -> list[UserMod]:
    return list(
        db.scalars(
            select(UserMod)
            .where(UserMod.modset_id == modset_id)
            .join(UserMod.mod)
            .options(selectinload(UserMod.mod).selectinload(Mod.versions))
            .order_by(func.lower(Mod.name).nullslast(), Mod.id)
        ).all()
    )


def get_user_mod_or_none(db: Session, mod_id: str, modset_id: int) -> UserMod | None:
    return db.scalar(
        select(UserMod)
        .where(UserMod.modset_id == modset_id, UserMod.mod_id == mod_id)
        .options(selectinload(UserMod.mod).selectinload(Mod.versions))
    )


def get_mod_or_none(db: Session, mod_id: str, modset_id: int) -> Mod | None:
    mapping = get_user_mod_or_none(db, mod_id, modset_id)
    return mapping.mod if mapping else None


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


def find_dependents(target: Mod, all_mappings: list[UserMod], *, installed_only: bool, core_only: bool) -> list[ModReferenceRead]:
    dependents: list[ModReferenceRead] = []
    for mapping in all_mappings:
        candidate = mapping.mod
        if candidate.id == target.id:
            continue
        if installed_only and not (mapping.current_version or "").strip():
            continue
        if core_only and not bool(mapping.is_core):
            continue
        dependencies = normalize_dependencies(candidate.dependencies or [])
        if any(dependency_matches_mod(dependency, target) for dependency in dependencies):
            dependents.append(ModReferenceRead(id=candidate.id, name=candidate.name, source_url=candidate.source_url))
    return dependents


def collect_dependency_sets(mappings: list[UserMod]) -> tuple[set[str], set[str]]:
    tracked_by_id = {mapping.mod_id: mapping.mod for mapping in mappings}
    dependency_ids: set[str] = set()
    core_dependency_ids: set[str] = set()

    for mapping in mappings:
        if not (mapping.current_version or "").strip():
            continue
        dependencies = normalize_dependencies(mapping.mod.dependencies or [])
        for target_id, target_mod in tracked_by_id.items():
            if target_id == mapping.mod_id:
                continue
            if any(dependency_matches_mod(dependency, target_mod) for dependency in dependencies):
                dependency_ids.add(target_id)
                if bool(mapping.is_core):
                    core_dependency_ids.add(target_id)
    return dependency_ids, core_dependency_ids


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
