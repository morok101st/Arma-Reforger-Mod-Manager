from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse

from app.auth import bootstrap_admin, enforce_origin_for_unsafe_methods
from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.migrations import migrate_schema
from app.routers.admin import router as admin_router
from app.routers.auth import router as auth_router
from app.routers.modsets import router as modsets_router
from app.routers.mods import router as mods_router
from app.routers.system import router as system_router
from app.routers.groups import router as groups_router
from app.routers.sync import router as sync_router
from app.scheduler import start_scheduler
from app.refresh_jobs import start_refresh_workers


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # These tables belong to migrations: scope backfills must distinguish legacy
    # installs, and group tables must be created in the versioned transaction.
    Base.metadata.create_all(
        bind=engine,
        tables=[table for table in Base.metadata.tables.values() if table.name not in {
            "discord_webhook_modsets", "groups", "group_memberships", "modset_group_permissions", "mod_refresh_jobs", "modset_export_orders", "modset_sync_access",
        }],
    )
    migrate_schema(engine)
    with SessionLocal() as db:
        bootstrap_admin(db)
    scheduler = start_scheduler()
    stop_refresh_workers = start_refresh_workers(engine)
    try:
        yield
    finally:
        stop_refresh_workers()
        scheduler.shutdown(wait=False)


async def security_middleware(request: Request, call_next):
    try:
        enforce_origin_for_unsafe_methods(request)
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    response = await call_next(request)
    if request.url.path.startswith(("/sync/", "/admin/sync-access")) or request.url.path.endswith(("/sync-access", "/sync-configuration")):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
    return response


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Arma Reforger Mod Manager API",
        version="0.2.7",
        root_path="/api",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.middleware("http")(security_middleware)
    app.include_router(system_router)
    app.include_router(auth_router)
    app.include_router(admin_router)
    app.include_router(modsets_router)
    app.include_router(mods_router)
    app.include_router(groups_router)
    app.include_router(sync_router)

    def custom_openapi() -> dict[str, object]:
        if app.openapi_schema:
            return app.openapi_schema
        schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
        schema["servers"] = [{"url": "/api"}]
        app.openapi_schema = schema
        return app.openapi_schema

    app.openapi = custom_openapi
    return app


app = create_app()
