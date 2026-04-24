from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Mod, ModSet, User, UserMod
from app.schemas_modsets import ModSetCreate, ModSetExportEntry, ModSetExportRead, ModSetRead, ModSetUpdate


class ModSetError(ValueError):
    pass


class ModSetNotFoundError(ModSetError):
    pass


class ModSetConflictError(ModSetError):
    pass


class ModSetLastDeleteError(ModSetError):
    pass


class ModSetNotEmptyError(ModSetError):
    pass


def list_modsets(db: Session) -> list[ModSetRead]:
    rows = db.execute(
        select(
            ModSet.id,
            ModSet.name,
            ModSet.created_at,
            ModSet.updated_at,
            func.count(UserMod.mod_id).label("tracked_mods_count"),
        )
        .outerjoin(UserMod, UserMod.modset_id == ModSet.id)
        .group_by(ModSet.id, ModSet.name, ModSet.created_at, ModSet.updated_at)
        .order_by(func.lower(ModSet.name), ModSet.id)
    ).all()
    return [
        ModSetRead(
            id=row.id,
            name=row.name,
            tracked_mods_count=int(row.tracked_mods_count or 0),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


def ensure_default_modset(db: Session) -> ModSet:
    existing = db.scalar(select(ModSet).order_by(ModSet.id).limit(1))
    if existing:
        return existing
    modset = ModSet(name="Default")
    db.add(modset)
    db.commit()
    db.refresh(modset)
    return modset


def ensure_user_active_modset(db: Session, user: User) -> ModSet:
    if user.active_modset_id:
        current = db.get(ModSet, user.active_modset_id)
        if current:
            return current
    fallback = ensure_default_modset(db)
    user.active_modset_id = fallback.id
    db.commit()
    db.refresh(user)
    return fallback


def resolve_modset_id(db: Session, user: User, requested_modset_id: int | None) -> int:
    if requested_modset_id is not None:
        modset = db.get(ModSet, requested_modset_id)
        if not modset:
            raise ModSetNotFoundError("Modset not found")
        return modset.id
    return ensure_user_active_modset(db, user).id


def create_modset(db: Session, payload: ModSetCreate) -> ModSetRead:
    name = payload.name.strip()
    existing = db.scalar(select(ModSet).where(func.lower(ModSet.name) == name.casefold()))
    if existing:
        raise ModSetConflictError("Modset name already exists")
    modset = ModSet(name=name)
    db.add(modset)
    db.commit()
    db.refresh(modset)
    return _modset_to_read(db, modset)


def update_modset(db: Session, modset_id: int, payload: ModSetUpdate) -> ModSetRead:
    modset = db.get(ModSet, modset_id)
    if not modset:
        raise ModSetNotFoundError("Modset not found")

    name = payload.name.strip()
    existing = db.scalar(select(ModSet).where(func.lower(ModSet.name) == name.casefold(), ModSet.id != modset_id))
    if existing:
        raise ModSetConflictError("Modset name already exists")

    modset.name = name
    db.commit()
    db.refresh(modset)
    return _modset_to_read(db, modset)


def delete_modset(db: Session, modset_id: int) -> None:
    modset = db.get(ModSet, modset_id)
    if not modset:
        raise ModSetNotFoundError("Modset not found")

    count = db.scalar(select(func.count()).select_from(ModSet)) or 0
    if count <= 1:
        raise ModSetLastDeleteError("At least one modset is required")

    mod_count = db.scalar(select(func.count()).select_from(UserMod).where(UserMod.modset_id == modset_id)) or 0
    if mod_count > 0:
        raise ModSetNotEmptyError("Cannot delete modset with tracked mods")

    fallback = db.scalar(select(ModSet).where(ModSet.id != modset_id).order_by(ModSet.id).limit(1))
    if not fallback:
        raise ModSetLastDeleteError("At least one modset is required")

    users = db.scalars(select(User).where(User.active_modset_id == modset_id)).all()
    for user in users:
        user.active_modset_id = fallback.id

    db.delete(modset)
    db.commit()


def activate_modset(db: Session, user: User, modset_id: int) -> ModSet:
    modset = db.get(ModSet, modset_id)
    if not modset:
        raise ModSetNotFoundError("Modset not found")
    user.active_modset_id = modset.id
    db.commit()
    db.refresh(user)
    return modset


def export_modset(db: Session, modset_id: int) -> ModSetExportRead:
    modset = db.get(ModSet, modset_id)
    if not modset:
        raise ModSetNotFoundError("Modset not found")

    rows = db.execute(
        select(UserMod.mod_id, Mod.name)
        .join(Mod, Mod.id == UserMod.mod_id)
        .where(UserMod.modset_id == modset_id)
        .order_by(func.lower(func.coalesce(Mod.name, UserMod.mod_id)), UserMod.mod_id)
    ).all()

    return ModSetExportRead(
        mods=[
            ModSetExportEntry(
                modId=row.mod_id,
                name=row.name or row.mod_id,
            )
            for row in rows
        ]
    )


def _modset_to_read(db: Session, modset: ModSet) -> ModSetRead:
    tracked_mods_count = db.scalar(select(func.count()).select_from(UserMod).where(UserMod.modset_id == modset.id)) or 0
    return ModSetRead(
        id=modset.id,
        name=modset.name,
        tracked_mods_count=int(tracked_mods_count),
        created_at=modset.created_at,
        updated_at=modset.updated_at,
    )
