from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import (
    authenticate_user,
    bootstrap_admin,
    check_login_rate_limit,
    clear_failed_logins,
    clear_session_cookie,
    enforce_origin_for_unsafe_methods,
    record_failed_login,
    require_admin_user,
    require_current_user,
    set_session_cookie,
)
from app.config import get_settings
from app.database import Base, SessionLocal, engine, get_db
from app.migrations import migrate_schema
from app.models import User
from app.schemas import AuthUserRead, LoginRequest, ModCreate, ModRead, RefreshResult, UserCreate, UserModUpdate, UserRead, UserUpdate
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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    clear_failed_logins(request, username)
    set_session_cookie(response, user)
    return auth_user_to_read(user)


@app.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def api_logout(response: Response) -> Response:
    clear_session_cookie(response)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/auth/me", response_model=AuthUserRead)
def api_me(current_user: User = Depends(require_current_user)) -> AuthUserRead:
    return auth_user_to_read(current_user)


@app.get("/users", response_model=list[UserRead])
def api_list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_user),
) -> list[UserRead]:
    return list_users(db)


@app.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def api_create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin_user),
) -> UserRead:
    try:
        return create_user(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@app.patch("/users/{user_id}", response_model=UserRead)
def api_update_user(
    user_id: int,
    payload: UserUpdate,
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
    return updated


@app.get("/mods", response_model=list[ModRead])
def api_list_mods(db: Session = Depends(get_db), _: User = Depends(require_current_user)) -> list[ModRead]:
    return list_mods(db)


@app.post("/mods", response_model=ModRead, status_code=status.HTTP_201_CREATED)
async def api_create_mod(
    payload: ModCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_current_user),
) -> ModRead:
    try:
        return await create_mod(db, payload)
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
    db: Session = Depends(get_db),
    _: User = Depends(require_current_user),
) -> ModRead:
    mod = await update_user_mod(db, mod_id, payload)
    if not mod:
        raise HTTPException(status_code=404, detail="Mod not found")
    return mod


@app.post("/mods/{mod_id}/refresh", response_model=ModRead)
async def api_refresh_mod(
    mod_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_current_user),
) -> ModRead:
    if not get_mod_or_none(db, mod_id):
        raise HTTPException(status_code=404, detail="Mod not found")
    try:
        return await refresh_mod(db, mod_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Workshop fetch failed: {exc}") from exc


@app.delete("/mods/{mod_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_mod(
    mod_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_current_user),
) -> Response:
    if not delete_mod(db, mod_id):
        raise HTTPException(status_code=404, detail="Mod not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/refresh", response_model=RefreshResult)
async def api_refresh_all(
    db: Session = Depends(get_db),
    _: User = Depends(require_current_user),
) -> RefreshResult:
    return await refresh_all_mods(db)


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
