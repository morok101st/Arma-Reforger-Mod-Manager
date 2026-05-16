from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.audit import list_audit_logs
from app.router_helpers import audit_event, fail_with_audit
from app.auth import hash_password, require_admin_user
from app.models import User
from app.schemas_audit import AuditLogRead
from app.schemas_users import PasswordReset, UserCreate, UserRead, UserUpdate
from app.user_service import create_user, delete_user, list_users, update_user

router = APIRouter(tags=["admin"])


@router.get("/users", response_model=list[UserRead])
def api_list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_user),
) -> list[UserRead]:
    return list_users(db)


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def api_create_user(
    payload: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_user),
) -> UserRead:
    try:
        created = create_user(db, payload)
        audit_event(
            db,
            action="user_created",
            entity_type="user",
            entity_id=str(created.id),
            actor=current_user,
            request=request,
            detail={"username": created.username, "role": created.role, "is_active": created.is_active},
        )
        return created
    except ValueError as exc:
        audit_event(
            db,
            action="user_create_failed",
            entity_type="user",
            entity_id=payload.username.strip(),
            actor=current_user,
            request=request,
            detail={"reason": str(exc), "username": payload.username.strip(), "role": payload.role.value},
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.patch("/users/{user_id}", response_model=UserRead)
def api_update_user(
    user_id: int,
    payload: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_user),
) -> UserRead:
    target = db.get(User, user_id)
    old_role = target.role if target else None
    old_active = target.is_active if target else None
    if user_id == current_user.id and payload.is_active is False:
        fail_with_audit(
            db,
            action="user_update_failed",
            entity_type="user",
            entity_id=str(user_id),
            actor=current_user,
            request=request,
            status_code=400,
            detail_message="Cannot disable current user",
            audit_detail={"reason": "cannot_disable_current_user"},
        )
    if payload.is_active is False or payload.role is not None:
        try:
            _ensure_admin_change_is_safe(db, user_id, payload)
        except HTTPException as exc:
            audit_event(
                db,
                action="user_update_failed",
                entity_type="user",
                entity_id=str(user_id),
                actor=current_user,
                request=request,
                detail={"reason": exc.detail},
            )
            raise
    updated = update_user(db, user_id, payload)
    if not updated:
        fail_with_audit(
            db,
            action="user_update_failed",
            entity_type="user",
            entity_id=str(user_id),
            actor=current_user,
            request=request,
            status_code=404,
            detail_message="User not found",
            audit_detail={"reason": "user_not_found"},
        )
    audit_event(
        db,
        action="user_updated",
        entity_type="user",
        entity_id=str(user_id),
        actor=current_user,
        request=request,
        detail={
            "username": updated.username,
            "role_changed": payload.role is not None,
            "old_role": old_role,
            "new_role": updated.role if payload.role is not None else None,
            "active_changed": payload.is_active is not None,
            "old_active": old_active,
            "new_active": updated.is_active if payload.is_active is not None else None,
            "password_changed": payload.password is not None,
        },
    )
    return updated


@router.patch("/users/{user_id}/password", response_model=UserRead)
def api_reset_user_password(
    user_id: int,
    payload: PasswordReset,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_user),
) -> UserRead:
    target = db.get(User, user_id)
    if not target:
        fail_with_audit(
            db,
            action="password_reset_failed",
            entity_type="user",
            entity_id=str(user_id),
            actor=current_user,
            request=request,
            status_code=404,
            detail_message="User not found",
            audit_detail={"reason": "user_not_found"},
        )
    target.password_hash = hash_password(payload.password)
    target.session_version = int(getattr(target, "session_version", 0) or 0) + 1
    db.commit()
    db.refresh(target)
    audit_event(
        db,
        action="password_reset",
        entity_type="user",
        entity_id=str(user_id),
        actor=current_user,
        request=request,
        detail={"target_username": target.username},
    )
    return UserRead(
        id=target.id,
        username=target.username,
        role=target.role,
        is_active=target.is_active,
        created_at=target.created_at,
        last_login_at=target.last_login_at,
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_user(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_user),
) -> None:
    target = db.get(User, user_id)
    if user_id == current_user.id:
        fail_with_audit(
            db,
            action="user_delete_failed",
            entity_type="user",
            entity_id=str(user_id),
            actor=current_user,
            request=request,
            status_code=400,
            detail_message="Cannot delete current user",
            audit_detail={"reason": "cannot_delete_current_user"},
        )
    if not target:
        fail_with_audit(
            db,
            action="user_delete_failed",
            entity_type="user",
            entity_id=str(user_id),
            actor=current_user,
            request=request,
            status_code=404,
            detail_message="User not found",
            audit_detail={"reason": "user_not_found"},
        )
    if target.role == "admin" and target.is_active:
        active_admin_count = db.scalar(select(func.count()).select_from(User).where(User.role == "admin", User.is_active.is_(True))) or 0
        if active_admin_count <= 1:
            fail_with_audit(
                db,
                action="user_delete_failed",
                entity_type="user",
                entity_id=str(user_id),
                actor=current_user,
                request=request,
                status_code=400,
                detail_message="At least one active admin is required",
                audit_detail={"reason": "last_active_admin"},
            )

    deleted = delete_user(db, user_id)
    assert deleted is not None
    audit_event(
        db,
        action="user_deleted",
        entity_type="user",
        entity_id=str(user_id),
        actor=current_user,
        request=request,
        detail={"username": deleted.username, "role": deleted.role, "is_active": deleted.is_active},
    )


@router.get("/audit", response_model=list[AuditLogRead])
def api_list_audit_logs(
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_user),
) -> list[AuditLogRead]:
    return list_audit_logs(db, limit=limit)


def _ensure_admin_change_is_safe(db: Session, user_id: int, payload: UserUpdate) -> None:
    target = db.get(User, user_id)
    if not target:
        return
    if target.role != "admin":
        return
    if payload.is_active is not False and (payload.role is None or payload.role.value == "admin"):
        return

    active_admin_count = db.scalar(select(func.count()).select_from(User).where(User.role == "admin", User.is_active.is_(True))) or 0
    if active_admin_count <= 1:
        raise HTTPException(status_code=400, detail="At least one active admin is required")
