from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Mod, ModSet, User, UserMod
from app.schemas_modsets import ModSetCreate, ModSetExportEntry, ModSetRead, ModSetUpdate


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


def _accessible_modset_filter(user: User):
    return or_(ModSet.shared.is_(True), ModSet.owner_user_id == user.id)


def list_modsets(db: Session, user: User) -> list[ModSetRead]:
    rows = db.execute(
        select(
            ModSet.id,
            ModSet.name,
            ModSet.shared,
            ModSet.owner_user_id,
            User.username.label("owner_username"),
            ModSet.created_at,
            ModSet.updated_at,
            func.count(UserMod.mod_id).label("tracked_mods_count"),
        )
        .outerjoin(UserMod, UserMod.modset_id == ModSet.id)
        .outerjoin(User, User.id == ModSet.owner_user_id)
        .where(_accessible_modset_filter(user))
        .group_by(ModSet.id, ModSet.name, ModSet.created_at, ModSet.updated_at)
        .group_by(ModSet.shared, ModSet.owner_user_id, User.username)
        .order_by(func.lower(ModSet.name), ModSet.id)
    ).all()
    return [
        ModSetRead(
            id=row.id,
            name=row.name,
            tracked_mods_count=int(row.tracked_mods_count or 0),
            shared=bool(row.shared),
            owner_username=row.owner_username,
            is_owner=bool(row.owner_user_id == user.id),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


def list_modsets_for_admin(db: Session) -> list[ModSetRead]:
    rows = db.execute(
        select(
            ModSet.id,
            ModSet.name,
            ModSet.shared,
            ModSet.owner_user_id,
            User.username.label("owner_username"),
            ModSet.created_at,
            ModSet.updated_at,
            func.count(UserMod.mod_id).label("tracked_mods_count"),
        )
        .outerjoin(UserMod, UserMod.modset_id == ModSet.id)
        .outerjoin(User, User.id == ModSet.owner_user_id)
        .group_by(ModSet.id, ModSet.name, ModSet.created_at, ModSet.updated_at)
        .group_by(ModSet.shared, ModSet.owner_user_id, User.username)
        .order_by(func.lower(ModSet.name), ModSet.id)
    ).all()
    return [
        ModSetRead(
            id=row.id,
            name=row.name,
            tracked_mods_count=int(row.tracked_mods_count or 0),
            shared=bool(row.shared),
            owner_username=row.owner_username,
            is_owner=False,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


def ensure_default_modset(db: Session) -> ModSet:
    existing = db.scalar(select(ModSet).where(func.lower(ModSet.name) == "default").order_by(ModSet.id).limit(1))
    if existing:
        if not existing.shared:
            existing.shared = True
            db.commit()
            db.refresh(existing)
        return existing
    modset = ModSet(name="Default", shared=True)
    db.add(modset)
    db.commit()
    db.refresh(modset)
    return modset


def ensure_user_active_modset(db: Session, user: User) -> ModSet:
    if user.active_modset_id:
        current = db.get(ModSet, user.active_modset_id)
        if current and _is_modset_accessible(user, current):
            return current
    fallback = db.scalar(
        select(ModSet)
        .where(_accessible_modset_filter(user))
        .order_by(func.lower(ModSet.name), ModSet.id)
        .limit(1)
    )
    if not fallback:
        fallback = ensure_default_modset(db)
    user.active_modset_id = fallback.id
    db.commit()
    db.refresh(user)
    return fallback


def resolve_modset_id(db: Session, user: User, requested_modset_id: int | None) -> int:
    if requested_modset_id is not None:
        modset = _get_accessible_modset(db, user, requested_modset_id)
        if not modset:
            raise ModSetNotFoundError("Modset not found")
        return modset.id
    return ensure_user_active_modset(db, user).id


def create_modset(db: Session, user: User, payload: ModSetCreate) -> ModSetRead:
    name = payload.name.strip()
    existing = db.scalar(select(ModSet).where(func.lower(ModSet.name) == name.casefold()))
    if existing:
        raise ModSetConflictError("Modset name already exists")
    modset = ModSet(name=name, owner_user_id=user.id, shared=payload.shared)
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
    modset = _get_accessible_modset(db, user, modset_id)
    if not modset:
        raise ModSetNotFoundError("Modset not found")

    name = payload.name.strip()
    existing = db.scalar(select(ModSet).where(func.lower(ModSet.name) == name.casefold(), ModSet.id != modset_id))
    if existing:
        raise ModSetConflictError("Modset name already exists")

    if payload.shared is not None and modset.owner_user_id != user.id:
        raise ModSetPermissionError("Only the owner can change sharing")

    modset.name = name
    if payload.shared is not None:
        modset.shared = payload.shared
    db.commit()
    db.refresh(modset)
    return _modset_to_read(db, modset, user)


def delete_modset(db: Session, user: User, modset_id: int) -> None:
    modset = _get_accessible_modset(db, user, modset_id)
    if not modset:
        raise ModSetNotFoundError("Modset not found")

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
    return db.scalar(select(ModSet).where(ModSet.id == modset_id, _accessible_modset_filter(user)))


def _is_modset_accessible(user: User, modset: ModSet) -> bool:
    return bool(modset.shared or modset.owner_user_id == user.id)


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
        shared=bool(modset.shared),
        owner_username=modset.owner.username if modset.owner else None,
        is_owner=bool(modset.owner_user_id == user.id),
        created_at=modset.created_at,
        updated_at=modset.updated_at,
    )
