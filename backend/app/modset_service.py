from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Mod, ModSet, ModSetGroupPermission, User, UserMod
from app.modset_permissions import accessible_modset_filter, modset_capabilities, require_modset_permission, set_modset_group_permissions
from app.schemas_modsets import ModSetCreate, ModSetExportEntry, ModSetLoadOrderUpdate, ModSetRead, ModSetUpdate


class ModSetError(ValueError):
    pass


class ModSetNotFoundError(ModSetError):
    pass


class ModSetConflictError(ModSetError):
    pass


class ModSetPermissionError(ModSetError):
    pass


class ModSetLastDeleteError(ModSetError):
    pass


def list_modsets(db: Session, user: User) -> list[ModSetRead]:
    return _list_modsets(db, user)


def list_modsets_for_admin(db: Session) -> list[ModSetRead]:
    # This directory is for webhook administration, not a grant of modset access.
    return _list_modsets(db)


def _list_modsets(db: Session, user: User | None = None) -> list[ModSetRead]:
    count = select(func.count(UserMod.id)).where(UserMod.modset_id == ModSet.id).scalar_subquery()
    group_access = select(ModSetGroupPermission.modset_id).where(ModSetGroupPermission.modset_id == ModSet.id).exists()
    columns = [ModSet, User.username.label("owner_username"), count.label("tracked_mods_count"), group_access.label("has_group_access")]
    if user is not None:
        columns.append(accessible_modset_filter(user, write=True).label("can_edit"))
    query = select(*columns).outerjoin(User, User.id == ModSet.owner_user_id)
    if user is not None:
        query = query.where(accessible_modset_filter(user))
    rows = db.execute(query.order_by(func.lower(ModSet.name), ModSet.id)).all()
    return [ModSetRead(
        id=row.ModSet.id, name=row.ModSet.name,
        tracked_mods_count=row.tracked_mods_count, owner_username=row.owner_username,
        is_owner=bool(user and row.ModSet.owner_user_id == user.id),
        can_edit=bool(user and row.can_edit),
        can_delete=bool(user and (user.role == "admin" or row.ModSet.owner_user_id == user.id)),
        can_manage_access=bool(user and (user.role == "admin" or row.ModSet.owner_user_id == user.id)),
        has_group_access=row.has_group_access,
        created_at=row.ModSet.created_at, updated_at=row.ModSet.updated_at,
    ) for row in rows]


def ensure_user_active_modset(db: Session, user: User) -> ModSet | None:
    if user.active_modset_id:
        current = _get_accessible_modset(db, user, user.active_modset_id)
        if current:
            return current
    fallback = db.scalar(select(ModSet).where(accessible_modset_filter(user))
                         .order_by(func.lower(ModSet.name), ModSet.id).limit(1))
    fallback_id = fallback.id if fallback else None
    if user.active_modset_id != fallback_id:
        user.active_modset_id = fallback_id
        db.commit()
        db.refresh(user)
    return fallback


def resolve_modset_id(db: Session, user: User, requested_modset_id: int | None, *, write: bool = False) -> int:
    if requested_modset_id is None:
        active = ensure_user_active_modset(db, user)
        if active is None:
            raise ModSetNotFoundError("No accessible modset")
        requested_modset_id = active.id
    return require_modset_permission(db, user, requested_modset_id, "write" if write else "read").id


def create_modset(db: Session, user: User, payload: ModSetCreate) -> ModSetRead:
    name = payload.name.strip()
    existing = db.scalar(select(ModSet).where(func.lower(ModSet.name) == name.casefold()))
    if existing:
        raise ModSetConflictError("Modset name already exists")
    modset = ModSet(name=name, owner_user_id=user.id)
    db.add(modset)
    db.commit()
    db.refresh(modset)
    return _modset_to_read(db, modset, user)


def duplicate_modset(db: Session, user: User, modset_id: int) -> ModSetRead:
    source = _get_accessible_modset(db, user, modset_id)
    if not source:
        raise ModSetNotFoundError("Modset not found")

    duplicate = ModSet(
        name=_build_copy_name(db, source.name),
        owner_user_id=user.id,
        shared=False,
    )
    db.add(duplicate)
    db.flush()

    source_rows = db.scalars(
        select(UserMod).where(UserMod.modset_id == source.id).order_by(UserMod.id)
    ).all()
    for row in source_rows:
        db.add(
            UserMod(
                modset_id=duplicate.id,
                mod_id=row.mod_id,
                current_version=row.current_version,
                pinned=row.pinned,
                is_core=row.is_core,
                dependency_origin=row.dependency_origin,
                tracking_reason=row.tracking_reason,
                load_order=row.load_order,
            )
        )

    db.commit()
    db.refresh(duplicate)
    return _modset_to_read(db, duplicate, user)


def update_modset(db: Session, user: User, modset_id: int, payload: ModSetUpdate) -> ModSetRead:
    modset = require_modset_permission(db, user, modset_id, "write")
    if payload.group_permissions is not None:
        require_modset_permission(db, user, modset_id, "manage")

    name = payload.name.strip()
    existing = db.scalar(select(ModSet).where(func.lower(ModSet.name) == name.casefold(), ModSet.id != modset_id))
    if existing:
        raise ModSetConflictError("Modset name already exists")

    if payload.group_permissions is not None:
        set_modset_group_permissions(db, modset_id, payload.group_permissions)
    modset.name = name
    db.commit()
    db.refresh(modset)
    return _modset_to_read(db, modset, user)


def update_modset_load_order(db: Session, user: User, modset_id: int, payload: ModSetLoadOrderUpdate) -> None:
    require_modset_permission(db, user, modset_id, "write")

    entries_by_mod_id = {entry.mod_id: entry.load_order for entry in payload.entries}
    if len(entries_by_mod_id) != len(payload.entries):
        raise ValueError("Duplicate mod IDs are not allowed")

    mappings = db.scalars(
        select(UserMod).where(UserMod.modset_id == modset_id, UserMod.mod_id.in_(entries_by_mod_id.keys()))
    ).all()
    mappings_by_mod_id = {mapping.mod_id: mapping for mapping in mappings}
    missing_ids = sorted(set(entries_by_mod_id) - set(mappings_by_mod_id))
    if missing_ids:
        raise ValueError(f"Mods are not tracked in this modset: {', '.join(missing_ids)}")

    for mod_id, load_order in entries_by_mod_id.items():
        mappings_by_mod_id[mod_id].load_order = load_order

    db.commit()


def delete_modset(db: Session, user: User, modset_id: int) -> None:
    modset = require_modset_permission(db, user, modset_id, "delete")

    count = db.scalar(select(func.count()).select_from(ModSet)) or 0
    if count <= 1:
        raise ModSetLastDeleteError("At least one modset is required")

    users = db.scalars(select(User).where(User.active_modset_id == modset_id)).all()
    db.delete(modset)
    db.commit()

    for affected_user in users:
        ensure_user_active_modset(db, affected_user)


def activate_modset(db: Session, user: User, modset_id: int) -> ModSet:
    modset = _get_accessible_modset(db, user, modset_id)
    if not modset:
        raise ModSetNotFoundError("Modset not found")
    user.active_modset_id = modset.id
    db.commit()
    db.refresh(user)
    return modset


def export_modset(db: Session, user: User, modset_id: int) -> list[ModSetExportEntry]:
    modset = _get_accessible_modset(db, user, modset_id)
    if not modset:
        raise ModSetNotFoundError("Modset not found")

    rows = db.execute(
        select(UserMod.mod_id, Mod.name, UserMod.current_version)
        .join(Mod, Mod.id == UserMod.mod_id)
        .where(
            UserMod.modset_id == modset_id,
            UserMod.current_version.is_not(None),
            UserMod.current_version != "",
        )
        .order_by(UserMod.load_order, func.lower(func.coalesce(Mod.name, UserMod.mod_id)), UserMod.mod_id)
    ).all()

    return [
        ModSetExportEntry(
            modId=row.mod_id,
            name=row.name or row.mod_id,
            version=row.current_version or "",
        )
        for row in rows
    ]


def ensure_accessible_modset(db: Session, user: User, modset_id: int) -> ModSet:
    modset = _get_accessible_modset(db, user, modset_id)
    if not modset:
        raise ModSetNotFoundError("Modset not found")
    return modset


def _get_accessible_modset(db: Session, user: User, modset_id: int) -> ModSet | None:
    return db.scalar(select(ModSet).where(ModSet.id == modset_id, accessible_modset_filter(user)))


def _build_copy_name(db: Session, base_name: str) -> str:
    candidate = f"{base_name} (copy)"
    if not db.scalar(select(ModSet.id).where(func.lower(ModSet.name) == candidate.casefold())):
        return candidate

    index = 2
    while True:
        candidate = f"{base_name} (copy {index})"
        if not db.scalar(select(ModSet.id).where(func.lower(ModSet.name) == candidate.casefold())):
            return candidate
        index += 1


def _modset_to_read(db: Session, modset: ModSet, user: User) -> ModSetRead:
    tracked_mods_count = db.scalar(select(func.count()).select_from(UserMod).where(UserMod.modset_id == modset.id)) or 0
    return ModSetRead(
        id=modset.id,
        name=modset.name,
        tracked_mods_count=int(tracked_mods_count),
        owner_username=modset.owner.username if modset.owner else None,
        is_owner=bool(modset.owner_user_id == user.id),
        **modset_capabilities(db, user, modset),
        has_group_access=db.scalar(select(ModSetGroupPermission.modset_id).where(ModSetGroupPermission.modset_id == modset.id).limit(1)) is not None,
        created_at=modset.created_at,
        updated_at=modset.updated_at,
    )
