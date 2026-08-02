from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import get_settings
from app.oidc import build_authorization_redirect, handle_oidc_callback, oidc_is_configured
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
from app.modset_service import ensure_user_active_modset
from app.schemas_auth import AuthConfigRead, AuthUserRead, LoginRequest, PasswordChange, ThemePreferenceUpdate
from app.user_service import auth_user_to_read

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/config", response_model=AuthConfigRead)
def api_auth_config() -> AuthConfigRead:
    return AuthConfigRead(local_login_enabled=True, oidc_enabled=oidc_is_configured())


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
    ensure_user_active_modset(db, user)
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


@router.get("/oidc/login")
async def api_oidc_login(request: Request, db: Session = Depends(get_db)) -> RedirectResponse:
    if not oidc_is_configured():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OIDC login is not enabled")
    response = RedirectResponse(url="/", status_code=status.HTTP_302_FOUND)
    response.headers["location"] = await build_authorization_redirect(response)
    audit_event(
        db,
        action="oidc_login_started",
        entity_type="auth",
        entity_id="oidc",
        request=request,
        detail={"provider": get_settings().oidc_issuer_url},
    )
    return response


@router.get("/oidc/callback")
async def api_oidc_callback(request: Request, db: Session = Depends(get_db)) -> RedirectResponse:
    settings = get_settings()
    redirect_target = settings.armm_public_url.rstrip("/") + "/" if settings.armm_public_url else "/"
    response = RedirectResponse(url=redirect_target, status_code=status.HTTP_303_SEE_OTHER)
    try:
        user, created = await handle_oidc_callback(request, response, db)
    except HTTPException as exc:
        audit_event(
            db,
            action="oidc_login_failed",
            entity_type="auth",
            entity_id="oidc",
            request=request,
            detail={"reason": exc.detail, "provider": settings.oidc_issuer_url},
        )
        raise
    set_session_cookie(response, user)
    if created:
        audit_event(
            db,
            action="oidc_user_created",
            entity_type="user",
            entity_id=str(user.id),
            actor=user,
            request=request,
            detail={"username": user.username, "role": user.role, "provider": settings.oidc_issuer_url},
        )
    audit_event(
        db,
        action="oidc_login_success",
        entity_type="auth",
        entity_id=str(user.id),
        actor=user,
        request=request,
        detail={"username": user.username, "role": user.role, "provider": settings.oidc_issuer_url},
    )
    return response


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
    db: Session = Depends(get_db),
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> AuthUserRead:
    ensure_user_active_modset(db, current_user)
    return auth_user_to_read(current_user, session_expires_at(session_token))


@router.patch("/password", response_model=AuthUserRead)
def api_change_password(
    payload: PasswordChange,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> AuthUserRead:
    ensure_user_active_modset(db, current_user)
    if not current_user.password_hash:
        audit_event(
            db,
            action="password_change_failed",
            entity_type="user",
            entity_id=str(current_user.id),
            actor=current_user,
            request=request,
            detail={"reason": "local_password_not_enabled"},
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Local password login is not enabled for this user")
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
    current_user.session_version = int(getattr(current_user, "session_version", 0) or 0) + 1
    db.commit()
    db.refresh(current_user)
    clear_session_cookie(response)
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


@router.patch("/theme", response_model=AuthUserRead)
def api_change_theme_preference(
    payload: ThemePreferenceUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> AuthUserRead:
    ensure_user_active_modset(db, current_user)
    current_user.theme_preference = payload.theme_preference
    db.commit()
    db.refresh(current_user)
    audit_event(
        db,
        action="theme_preference_changed",
        entity_type="user",
        entity_id=str(current_user.id),
        actor=current_user,
        request=request,
        detail={"username": current_user.username, "theme_preference": current_user.theme_preference},
    )
    return auth_user_to_read(current_user, session_expires_at(session_token))
