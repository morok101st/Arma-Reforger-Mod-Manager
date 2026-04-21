from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import (
    SESSION_COOKIE_NAME,
    authenticate_user,
    bootstrap_admin,
    check_login_rate_limit,
    clear_failed_logins,
    clear_session_cookie,
    enforce_origin_for_unsafe_methods,
    hash_password,
    record_failed_login,
    require_admin_user,
    require_current_user,
    session_expires_at,
    set_session_cookie,
    verify_password,
)
from app.audit import list_audit_logs, record_audit
from app.config import get_settings
from app.database import Base, SessionLocal, engine, get_db
from app.migrations import migrate_schema
from app.models import User
from app.schemas import (
    AuditLogRead,
    AuthUserRead,
    LoginRequest,
    ModCreate,
    ModRead,
    PasswordChange,
    PasswordReset,
    RefreshResult,
    UserCreate,
    UserModUpdate,
    UserRead,
    UserUpdate,
)
from app.scheduler import start_scheduler
from app.services import create_mod, delete_mod, get_mod_or_none, get_mod_read, list_mods, refresh_all_mods, refresh_mod, update_user_mod
from app.user_service import auth_user_to_read, create_user, list_users, update_user


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    migrate_schema(engine)
    with SessionLocal() as db:
        bootstrap_admin(db)
    scheduler = start_scheduler()
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


settings = get_settings()
app = FastAPI(
    title="Arma Reforger Mod Manager API",
    version="0.1.0",
    root_path="/api",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    try:
        enforce_origin_for_unsafe_methods(request)
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/auth/login", response_model=AuthUserRead)
def api_login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)) -> AuthUserRead:
    username = payload.username.strip()
    check_login_rate_limit(request, username)
    user = authenticate_user(db, username, payload.password)
    if not user:
        record_failed_login(request, username)
        record_audit(
            db,
            action="login_failed",
            entity_type="auth",
            entity_id=username,
            request=request,
            detail={"username": username},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    clear_failed_logins(request, username)
    set_session_cookie(response, user)
    record_audit(db, action="login_success", entity_type="auth", entity_id=str(user.id), actor=user, request=request)
    return auth_user_to_read(user)


@app.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def api_logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> Response:
    record_audit(db, action="logout", entity_type="auth", entity_id=str(current_user.id), actor=current_user, request=request)
    clear_session_cookie(response)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/auth/me", response_model=AuthUserRead)
def api_me(
    current_user: User = Depends(require_current_user),
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> AuthUserRead:
    return auth_user_to_read(current_user, session_expires_at(session_token))


@app.patch("/auth/password", response_model=AuthUserRead)
def api_change_password(
    payload: PasswordChange,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
) -> AuthUserRead:
    if not verify_password(payload.current_password, current_user.password_hash):
        record_audit(
            db,
            action="password_change_failed",
            entity_type="user",
            entity_id=str(current_user.id),
            actor=current_user,
            request=request,
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    db.refresh(current_user)
    record_audit(db, action="password_changed", entity_type="user", entity_id=str(current_user.id), actor=current_user, request=request)
    return auth_user_to_read(current_user, session_expires_at(session_token))


@app.get("/users", response_model=list[UserRead])
def api_list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_user),
) -> list[UserRead]:
    return list_users(db)


@app.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def api_create_user(
    payload: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_user),
) -> UserRead:
    try:
        created = create_user(db, payload)
        record_audit(
            db,
            action="user_created",
            entity_type="user",
            entity_id=str(created.id),
            actor=current_user,
            request=request,
            detail={"role": created.role},
        )
        return created
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@app.patch("/users/{user_id}", response_model=UserRead)
def api_update_user(
    user_id: int,
    payload: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_user),
) -> UserRead:
    if user_id == current_user.id and payload.is_active is False:
        raise HTTPException(status_code=400, detail="Cannot disable current user")
    if payload.is_active is False or payload.role is not None:
        _ensure_admin_change_is_safe(db, user_id, payload)
    updated = update_user(db, user_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    record_audit(
        db,
        action="user_updated",
        entity_type="user",
        entity_id=str(user_id),
        actor=current_user,
        request=request,
        detail={
            "role_changed": payload.role is not None,
            "active_changed": payload.is_active is not None,
            "password_changed": payload.password is not None,
        },
    )
    return updated


@app.patch("/users/{user_id}/password", response_model=UserRead)
def api_reset_user_password(
    user_id: int,
    payload: PasswordReset,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_user),
) -> UserRead:
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.password_hash = hash_password(payload.password)
    db.commit()
    db.refresh(target)
    record_audit(db, action="password_reset", entity_type="user", entity_id=str(user_id), actor=current_user, request=request)
    return UserRead(
        id=target.id,
        username=target.username,
        role=target.role,
        is_active=target.is_active,
        created_at=target.created_at,
        last_login_at=target.last_login_at,
    )


@app.get("/audit", response_model=list[AuditLogRead])
def api_list_audit_logs(
    limit: int = 100,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_user),
) -> list[AuditLogRead]:
    return list_audit_logs(db, limit=limit)


@app.get("/mods", response_model=list[ModRead])
def api_list_mods(db: Session = Depends(get_db), _: User = Depends(require_current_user)) -> list[ModRead]:
    return list_mods(db)


@app.post("/mods", response_model=ModRead, status_code=status.HTTP_201_CREATED)
async def api_create_mod(
    payload: ModCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> ModRead:
    try:
        created = await create_mod(db, payload)
        record_audit(
            db,
            action="mod_created",
            entity_type="mod",
            entity_id=created.id,
            actor=current_user,
            request=request,
            detail={"current_version": created.current_version, "pinned": created.pinned},
        )
        return created
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Workshop fetch failed: {exc}") from exc


@app.get("/mods/{mod_id}", response_model=ModRead)
def api_get_mod(
    mod_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_current_user),
) -> ModRead:
    mod = get_mod_read(db, mod_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Mod not found")
    return mod


@app.patch("/mods/{mod_id}", response_model=ModRead)
async def api_update_user_mod(
    mod_id: str,
    payload: UserModUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> ModRead:
    mod = await update_user_mod(db, mod_id, payload)
    if not mod:
        raise HTTPException(status_code=404, detail="Mod not found")
    record_audit(
        db,
        action="mod_updated",
        entity_type="mod",
        entity_id=mod_id,
        actor=current_user,
        request=request,
        detail={"current_version_changed": payload.current_version is not None, "pinned_changed": payload.pinned is not None},
    )
    return mod


@app.post("/mods/{mod_id}/refresh", response_model=ModRead)
async def api_refresh_mod(
    mod_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> ModRead:
    if not get_mod_or_none(db, mod_id):
        raise HTTPException(status_code=404, detail="Mod not found")
    try:
        refreshed = await refresh_mod(db, mod_id)
        record_audit(db, action="mod_refreshed", entity_type="mod", entity_id=mod_id, actor=current_user, request=request)
        return refreshed
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Workshop fetch failed: {exc}") from exc


@app.delete("/mods/{mod_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_mod(
    mod_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> Response:
    if not delete_mod(db, mod_id):
        raise HTTPException(status_code=404, detail="Mod not found")
    record_audit(db, action="mod_deleted", entity_type="mod", entity_id=mod_id, actor=current_user, request=request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/refresh", response_model=RefreshResult)
async def api_refresh_all(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> RefreshResult:
    result = await refresh_all_mods(db)
    record_audit(
        db,
        action="mods_refreshed",
        entity_type="mod",
        actor=current_user,
        request=request,
        detail={"refreshed": result.refreshed, "failed": len(result.failed)},
    )
    return result


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
