from typing import Literal

from fastapi import HTTPException
from sqlalchemy import delete, exists, or_, select, true
from sqlalchemy.orm import Session

from app.models import Group, GroupMembership, ModSet, ModSetGroupPermission, User
from app.schemas_groups import GroupPermission


def accessible_modset_filter(user: User, *, write: bool = False):
    if user.role == "admin":
        return true()
    grant = exists(select(ModSetGroupPermission.modset_id).join(
        GroupMembership, GroupMembership.group_id == ModSetGroupPermission.group_id,
    ).where(
        ModSetGroupPermission.modset_id == ModSet.id,
        GroupMembership.user_id == user.id,
        *([ModSetGroupPermission.permission == "write"] if write else []),
    ))
    return or_(ModSet.owner_user_id == user.id, grant)


def modset_capabilities(db: Session, user: User, modset: ModSet) -> dict[str, bool]:
    owner = modset.owner_user_id == user.id
    manager = owner or user.role == "admin"
    edit = manager
    if not edit:
        edit = db.scalar(select(ModSet.id).where(
            ModSet.id == modset.id, accessible_modset_filter(user, write=True),
        )) is not None
    return {
        "can_edit": edit,
        "can_delete": manager,
        "can_manage_access": manager,
    }


def require_modset_permission(
    db: Session, user: User, modset_id: int,
    permission: Literal["read", "write", "delete", "manage"] = "read",
) -> ModSet:
    modset = db.scalar(select(ModSet).where(ModSet.id == modset_id, accessible_modset_filter(user)))
    if modset is None:
        raise HTTPException(status_code=404, detail="Modset not found")
    if permission != "read":
        key = {"write": "can_edit", "delete": "can_delete", "manage": "can_manage_access"}[permission]
        if not modset_capabilities(db, user, modset)[key]:
            raise HTTPException(status_code=403, detail="Insufficient modset permissions")
    return modset


def set_modset_group_permissions(db: Session, modset_id: int, entries: list[GroupPermission]) -> None:
    """Validate and stage replacement grants within the caller's transaction."""
    group_ids = {entry.group_id for entry in entries}
    if len(group_ids) != len(entries):
        raise HTTPException(status_code=400, detail="Duplicate groups are not allowed")
    if len(db.scalars(select(Group.id).where(Group.id.in_(group_ids))).all()) != len(group_ids):
        raise HTTPException(status_code=400, detail="One or more selected groups do not exist")
    db.execute(delete(ModSetGroupPermission).where(ModSetGroupPermission.modset_id == modset_id))
    db.add_all([ModSetGroupPermission(modset_id=modset_id, **entry.model_dump()) for entry in entries])
