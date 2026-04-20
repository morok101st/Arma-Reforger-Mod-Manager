from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import Base, engine, get_db
from app.schemas import ModCreate, ModRead, RefreshResult, UserModUpdate
from app.scheduler import start_scheduler
from app.services import create_mod, delete_mod, get_mod_or_none, list_mods, mod_to_read, refresh_all_mods, refresh_mod, update_user_mod


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    scheduler = start_scheduler()
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


settings = get_settings()
app = FastAPI(title="RWMS API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/mods", response_model=list[ModRead])
def api_list_mods(db: Session = Depends(get_db)) -> list[ModRead]:
    return list_mods(db)


@app.post("/mods", response_model=ModRead, status_code=status.HTTP_201_CREATED)
async def api_create_mod(payload: ModCreate, db: Session = Depends(get_db)) -> ModRead:
    try:
        return await create_mod(db, payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Workshop fetch failed: {exc}") from exc


@app.get("/mods/{mod_id}", response_model=ModRead)
def api_get_mod(mod_id: str, db: Session = Depends(get_db)) -> ModRead:
    mod = get_mod_or_none(db, mod_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Mod not found")
    return mod_to_read(mod)


@app.patch("/mods/{mod_id}", response_model=ModRead)
def api_update_user_mod(mod_id: str, payload: UserModUpdate, db: Session = Depends(get_db)) -> ModRead:
    mod = update_user_mod(db, mod_id, payload)
    if not mod:
        raise HTTPException(status_code=404, detail="Mod not found")
    return mod


@app.post("/mods/{mod_id}/refresh", response_model=ModRead)
async def api_refresh_mod(mod_id: str, db: Session = Depends(get_db)) -> ModRead:
    if not get_mod_or_none(db, mod_id):
        raise HTTPException(status_code=404, detail="Mod not found")
    try:
        return await refresh_mod(db, mod_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Workshop fetch failed: {exc}") from exc


@app.delete("/mods/{mod_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_mod(mod_id: str, db: Session = Depends(get_db)) -> Response:
    if not delete_mod(db, mod_id):
        raise HTTPException(status_code=404, detail="Mod not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/refresh", response_model=RefreshResult)
async def api_refresh_all(db: Session = Depends(get_db)) -> RefreshResult:
    return await refresh_all_mods(db)
