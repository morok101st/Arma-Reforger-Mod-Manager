from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth import require_admin_user, require_current_user
from app.database import get_db
from app.models import Group, GroupMembership, ModSetGroupPermission, User
from app.modset_permissions import require_modset_permission, set_modset_group_permissions
from app.router_helpers import audit_event
from app.schemas_groups import GroupPermission, GroupRead, GroupSummary, GroupWrite, ModsetPermissionsUpdate, UserGroupsUpdate

router = APIRouter(tags=["groups"])


def group_read(group: Group) -> GroupRead:
    return GroupRead(id=group.id, name=group.name, description=group.description,
                     user_ids=sorted(member.user_id for member in group.memberships))


@router.get("/groups", response_model=list[GroupSummary])
def list_group_choices(db: Session = Depends(get_db), _: User = Depends(require_current_user)):
    # Owners need a group directory to share modsets; membership remains admin-only.
    return [GroupSummary(id=group.id, name=group.name) for group in db.scalars(select(Group).order_by(func.lower(Group.name), Group.id))]


@router.get("/admin/groups", response_model=list[GroupRead])
def list_groups(db: Session = Depends(get_db), _: User = Depends(require_admin_user)):
    return [group_read(group) for group in db.scalars(select(Group).options(selectinload(Group.memberships)).order_by(func.lower(Group.name), Group.id))]


def save_group(db: Session, group: Group, payload: GroupWrite) -> GroupRead:
    if db.scalar(select(Group.id).where(func.lower(Group.name) == payload.name.lower(), Group.id != group.id)):
        raise HTTPException(status_code=409, detail="Group name already exists")
    user_ids = set(payload.user_ids)
    if len(db.scalars(select(User.id).where(User.id.in_(user_ids))).all()) != len(user_ids):
        raise HTTPException(status_code=400, detail="One or more selected users do not exist")
    group.name = payload.name
    group.description = payload.description.strip()
    # Reuse existing memberships rather than deleting and inserting the same PK.
    existing = {member.user_id: member for member in group.memberships}
    group.memberships = [existing[user_id] if user_id in existing else GroupMembership(user_id=user_id) for user_id in sorted(user_ids)]
    db.add(group)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Group conflicts with existing data") from exc
    db.refresh(group)
    return group_read(group)


@router.post("/admin/groups", response_model=GroupRead, status_code=201)
def create_group(payload: GroupWrite, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_admin_user)):
    result = save_group(db, Group(name=payload.name), payload)
    audit_event(db, action="group_created", entity_type="user", entity_id=str(result.id), actor=actor, request=request,
                detail={"name": result.name, "user_ids": result.user_ids})
    return result


@router.put("/admin/groups/{group_id}", response_model=GroupRead)
def update_group(group_id: int, payload: GroupWrite, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_admin_user)):
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    result = save_group(db, group, payload)
    audit_event(db, action="group_updated", entity_type="user", entity_id=str(group_id), actor=actor, request=request,
                detail={"name": result.name, "user_ids": result.user_ids})
    return result


@router.delete("/admin/groups/{group_id}", status_code=204)
def delete_group(group_id: int, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_admin_user)):
    group = db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    name = group.name
    db.delete(group)
    db.commit()
    audit_event(db, action="group_deleted", entity_type="user", entity_id=str(group_id), actor=actor, request=request, detail={"name": name})


@router.put("/admin/users/{user_id}/groups", status_code=204)
def update_user_groups(user_id: int, payload: UserGroupsUpdate, request: Request,
                       db: Session = Depends(get_db), actor: User = Depends(require_admin_user)):
    if db.get(User, user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    group_ids = set(payload.group_ids)
    if len(db.scalars(select(Group.id).where(Group.id.in_(group_ids))).all()) != len(group_ids):
        raise HTTPException(status_code=400, detail="One or more selected groups do not exist")
    db.execute(delete(GroupMembership).where(GroupMembership.user_id == user_id))
    db.add_all([GroupMembership(group_id=group_id, user_id=user_id) for group_id in sorted(group_ids)])
    db.commit()
    audit_event(db, action="user_groups_updated", entity_type="user", entity_id=str(user_id), actor=actor,
                request=request, detail={"group_ids": sorted(group_ids)})


@router.get("/modsets/{modset_id}/group-permissions", response_model=list[GroupPermission])
def list_group_permissions(modset_id: int, db: Session = Depends(get_db), actor: User = Depends(require_current_user)):
    require_modset_permission(db, actor, modset_id, "manage")
    return [GroupPermission(group_id=row.group_id, permission=row.permission) for row in db.scalars(
        select(ModSetGroupPermission).where(ModSetGroupPermission.modset_id == modset_id).order_by(ModSetGroupPermission.group_id))]


@router.put("/modsets/{modset_id}/group-permissions", response_model=list[GroupPermission])
def update_group_permissions(modset_id: int, payload: ModsetPermissionsUpdate, request: Request,
                             db: Session = Depends(get_db), actor: User = Depends(require_current_user)):
    require_modset_permission(db, actor, modset_id, "manage")
    set_modset_group_permissions(db, modset_id, payload.entries)
    db.commit()
    audit_event(db, action="modset_group_permissions_updated", entity_type="modset", entity_id=str(modset_id), actor=actor,
                request=request, detail={"entries": [entry.model_dump() for entry in payload.entries]})
    return payload.entries
