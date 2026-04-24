from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
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
from app.scheduler import start_scheduler


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)
    migrate_schema(engine)
    with SessionLocal() as db:
        bootstrap_admin(db)
    scheduler = start_scheduler()
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


async def security_middleware(request: Request, call_next):
    try:
        enforce_origin_for_unsafe_methods(request)
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Arma Reforger Mod Manager API",
        version="0.1.0",
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
    return app


app = create_app()
