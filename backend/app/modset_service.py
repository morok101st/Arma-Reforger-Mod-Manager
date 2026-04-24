from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ModSet, User, UserMod
from app.schemas_modsets import ModSetCreate, ModSetRead, ModSetUpdate


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
    modsets = db.scalars(select(ModSet).order_by(func.lower(ModSet.name), ModSet.id)).all()
    return [ModSetRead.model_validate(modset) for modset in modsets]


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
    return ModSetRead.model_validate(modset)


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
    return ModSetRead.model_validate(modset)


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
