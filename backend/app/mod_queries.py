from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Mod, ModVersion, UserMod, ModSet, ModSetExportOrder
from app.schemas_mods import DependencyRead, ModRead, ModReferenceRead
from app.versioning import compare_versions


def mod_to_read(
    mod: Mod,
    user_mod: UserMod | InheritedMod,
    all_mappings: list[UserMod | InheritedMod] | None = None,
    dependency_ids: set[str] | None = None,
    core_dependency_ids: set[str] | None = None,
    derived_modsets_count: int = 0,
) -> ModRead:
    current_version = user_mod.current_version
    tracking_reason = user_mod.tracking_reason
    all_mappings = all_mappings or []
    tracked_mods = [mapping.mod for mapping in all_mappings]
    dependency_ids = dependency_ids or set()
    core_dependency_ids = core_dependency_ids or set()
    blocking_dependents = find_dependents(mod, all_mappings, installed_only=True, core_only=False)
    core_dependents = find_dependents(mod, all_mappings, installed_only=True, core_only=True)
    return ModRead(
        derived_modsets_count=derived_modsets_count,
        inherited_from_modset_id=getattr(user_mod, "inherited_from_modset_id", None),
        inherited_from_modset_name=getattr(user_mod, "inherited_from_modset_name", None),
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
        dependency_origin=bool(user_mod.dependency_origin),
        load_order=int(user_mod.load_order if user_mod.load_order is not None else 500),
        is_dependency=mod.id in dependency_ids,
        tracking_reason=tracking_reason,
        blocking_dependents=blocking_dependents,
        core_dependents=core_dependents,
        delete_blocked=mod.id in dependency_ids,
        status=compare_versions(current_version, mod.latest_version),
        versions=sort_versions(mod.versions)[:10],
    )


def list_mods(db: Session, modset_id: int) -> list[ModRead]:
    mappings = list_tracked_user_mods(db, modset_id)
    dependency_ids, core_dependency_ids = collect_dependency_sets(mappings)
    count = derived_count(db, modset_id)
    reads = [mod_to_read(mapping.mod, mapping, mappings, dependency_ids, core_dependency_ids, count) for mapping in mappings]
    protected = derived_dependency_ids(db, modset_id) if count else set()
    for read in reads:
        read.delete_blocked = read.delete_blocked or read.id in protected
    apply_effective_positions(db, modset_id, mappings, reads)
    return reads


def get_mod_read(db: Session, mod_id: str, modset_id: int) -> ModRead | None:
    mappings = list_tracked_user_mods(db, modset_id)
    target = next((mapping for mapping in mappings if mapping.mod_id == mod_id), None)
    if not target:
        return None
    dependency_ids, core_dependency_ids = collect_dependency_sets(mappings)
    count = derived_count(db, modset_id)
    read = mod_to_read(target.mod, target, mappings, dependency_ids, core_dependency_ids, count)
    if count:
        read.delete_blocked = read.delete_blocked or mod_id in derived_dependency_ids(db, modset_id)
    apply_effective_positions(db, modset_id, mappings, [read])
    return read


def list_local_user_mods(db: Session, modset_id: int) -> list[UserMod]:
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
    mapping = inherited_mapping(db, modset_id, mod_id) or get_user_mod_or_none(db, mod_id, modset_id)
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
            id_value = dependency.get("id") or dependency.get("modId")
            dependency_id = str(id_value).strip() if id_value is not None else None
            name_value = dependency.get("name")
            name = str(name_value).strip() if name_value is not None else ""
            name = name or dependency_id or ""
            if not name:
                continue
            url_value = dependency.get("url")
            url = str(url_value).strip() if url_value else None
            normalized.append(DependencyRead(id=dependency_id, name=name, url=url))
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
    dependency_id = normalize_match_value(dependency.id)
    dependency_name = normalize_match_value(dependency.name)
    dependency_url = normalize_match_value(dependency.url)

    return (
        dependency_id == target_id
        or bool(dependency_url and target_id in dependency_url)
        or dependency_name == target_id
        or bool(target_name and dependency_name == target_name)
    )


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


def inherited_mapping(db: Session, modset_id: int, mod_id: str) -> UserMod | None:
    modset = db.get(ModSet, modset_id)
    if not modset or not modset.base_modset_id:
        return None
    return get_user_mod_or_none(db, mod_id, modset.base_modset_id)


def list_tracked_user_mods(db: Session, modset_id: int) -> list[UserMod | InheritedMod]:
    """Effective mappings. Inherited rows are detached views, never writable ORM rows."""
    local: dict[str, UserMod | InheritedMod] = {row.mod_id: row for row in list_local_user_mods(db, modset_id)}
    modset = db.get(ModSet, modset_id)
    if modset and modset.base_modset_id:
        base = db.get(ModSet, modset.base_modset_id)
        orders = {row.mod_id: row.load_order for row in db.scalars(
            select(ModSetExportOrder).where(ModSetExportOrder.modset_id == modset_id)
        )}
        for row in list_local_user_mods(db, base.id):
            local[row.mod_id] = InheritedMod(
                mod_id=row.mod_id, modset_id=modset_id, mod=row.mod,
                current_version=row.current_version, pinned=row.pinned, is_core=row.is_core,
                dependency_origin=row.dependency_origin, tracking_reason=row.tracking_reason,
                load_order=orders.get(row.mod_id, row.load_order),
                inherited_from_modset_id=base.id, inherited_from_modset_name=base.name,
            )
    return sorted(local.values(), key=lambda row: ((row.mod.name or row.mod_id).casefold(), row.mod_id))


def derived_count(db: Session, modset_id: int) -> int:
    return db.scalar(select(func.count()).select_from(ModSet).where(ModSet.base_modset_id == modset_id)) or 0


@dataclass(frozen=True)
class InheritedMod:
    mod_id: str
    modset_id: int
    mod: Mod
    current_version: str | None
    pinned: bool
    is_core: bool
    dependency_origin: bool
    tracking_reason: str
    load_order: int
    inherited_from_modset_id: int
    inherited_from_modset_name: str


def derived_dependency_ids(db: Session, base_id: int) -> set[str]:
    protected: set[str] = set()
    for child_id in db.scalars(select(ModSet.id).where(ModSet.base_modset_id == base_id)):
        required, _ = collect_dependency_sets(list_tracked_user_mods(db, child_id))
        protected.update(required)
    return protected


def apply_effective_positions(db: Session, modset_id: int, mappings, reads) -> None:
    from app.base_modsets import effective_order
    modset = db.get(ModSet, modset_id)
    ordered = effective_order(db, modset_id, mappings)
    exported = [row for row in ordered if (row.current_version or "").strip()]
    ranks = {row.mod_id: index + 1 for index, row in enumerate(exported)}
    for read in reads:
        read.export_position = ranks.get(read.id)
        read.export_order_mode = modset.export_order_mode if modset else "independent"
    if modset and modset.base_modset_id and modset.export_order_mode == "base":
        positions = {row.mod_id: 500 + index * 10 for index, row in enumerate(ordered)}
        for read in reads:
            read.load_order = positions[read.id]
