from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.router_helpers import audit_event
from app.auth import (
    SESSION_COOKIE_NAME,
    authenticate_user,
    check_login_rate_limit,
    clear_failed_logins,
    clear_session_cookie,
    hash_password,
    record_failed_login,
    require_current_user,
    session_expires_at,
    set_session_cookie,
    verify_password,
)
from app.models import User
from app.schemas_auth import AuthUserRead, LoginRequest, PasswordChange
from app.user_service import auth_user_to_read

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=AuthUserRead)
def api_login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> AuthUserRead:
    username = payload.username.strip()
    try:
        check_login_rate_limit(request, username)
    except HTTPException:
        audit_event(
            db,
            action="login_rate_limited",
            entity_type="auth",
            entity_id=username,
            request=request,
            detail={"username": username, "reason": "too_many_failed_attempts"},
        )
        raise
    user = authenticate_user(db, username, payload.password)
    if not user:
        attempted_user = db.scalar(select(User).where(func.lower(User.username) == username.casefold()))
        record_failed_login(request, username)
        audit_event(
            db,
            action="login_failed",
            entity_type="auth",
            entity_id=username,
            request=request,
            detail={
                "username": username,
                "reason": "inactive_user" if attempted_user and not attempted_user.is_active else "invalid_credentials",
                "user_exists": attempted_user is not None,
            },
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    clear_failed_logins(request, username)
    set_session_cookie(response, user)
    audit_event(
        db,
        action="login_success",
        entity_type="auth",
        entity_id=str(user.id),
        actor=user,
        request=request,
        detail={"username": user.username, "role": user.role},
    )
    return auth_user_to_read(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def api_logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> Response:
    audit_event(
        db,
        action="logout",
        entity_type="auth",
        entity_id=str(current_user.id),
        actor=current_user,
        request=request,
        detail={"username": current_user.username},
    )
    clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=AuthUserRead)
def api_me(
    current_user: User = Depends(require_current_user),
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> AuthUserRead:
    return auth_user_to_read(current_user, session_expires_at(session_token))


@router.patch("/password", response_model=AuthUserRead)
def api_change_password(
    payload: PasswordChange,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> AuthUserRead:
    if not verify_password(payload.current_password, current_user.password_hash):
        audit_event(
            db,
            action="password_change_failed",
            entity_type="user",
            entity_id=str(current_user.id),
            actor=current_user,
            request=request,
            detail={"reason": "current_password_incorrect"},
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    db.refresh(current_user)
    audit_event(
        db,
        action="password_changed",
        entity_type="user",
        entity_id=str(current_user.id),
        actor=current_user,
        request=request,
        detail={"username": current_user.username, "method": "self_service"},
    )
    return auth_user_to_read(current_user, session_expires_at(session_token))
