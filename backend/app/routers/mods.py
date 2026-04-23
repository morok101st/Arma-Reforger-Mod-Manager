from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.database import get_db
from app.mod_router_helpers import (
    audit_mod_create_failed,
    audit_mod_created,
    audit_mod_deleted,
    audit_mod_refreshed,
    audit_mod_refresh_failed,
    audit_mod_updated,
    audit_refresh_all,
    raise_mod_not_found,
    raise_workshop_fetch_failed,
)
from app.models import User
from app.schemas_mods import ModCreate, ModRead, RefreshResult, UserModUpdate
from app.services import create_mod, delete_mod, get_mod_or_none, get_mod_read, list_mods, refresh_all_mods, refresh_mod, update_user_mod

router = APIRouter(tags=["mods"])


@router.get("/mods", response_model=list[ModRead])
def api_list_mods(db: Session = Depends(get_db), _: User = Depends(require_current_user)) -> list[ModRead]:
    return list_mods(db)


@router.post("/mods", response_model=ModRead, status_code=status.HTTP_201_CREATED)
async def api_create_mod(
    payload: ModCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> ModRead:
    try:
        created = await create_mod(db, payload)
        audit_mod_created(db, mod=created, request=request, actor=current_user)
        return created
    except Exception as exc:
        audit_mod_create_failed(db, payload=payload, request=request, actor=current_user, exc=exc)
        raise_workshop_fetch_failed(exc)


@router.get("/mods/{mod_id}", response_model=ModRead)
def api_get_mod(
    mod_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_current_user),
) -> ModRead:
    mod = get_mod_read(db, mod_id)
    if not mod:
        raise HTTPException(status_code=404, detail="Mod not found")
    return mod


@router.patch("/mods/{mod_id}", response_model=ModRead)
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
    audit_mod_updated(db, mod_id=mod_id, mod=mod, payload=payload, request=request, actor=current_user)
    return mod


@router.post("/mods/{mod_id}/refresh", response_model=ModRead)
async def api_refresh_mod(
    mod_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> ModRead:
    existing_mod = get_mod_or_none(db, mod_id)
    if not existing_mod:
        raise_mod_not_found(db, action="mod_refresh_failed", mod_id=mod_id, request=request, actor=current_user)
    try:
        refreshed = await refresh_mod(db, mod_id)
        audit_mod_refreshed(db, mod_id=mod_id, mod=refreshed, request=request, actor=current_user)
        return refreshed
    except Exception as exc:
        audit_mod_refresh_failed(db, mod_id=mod_id, request=request, actor=current_user, reason=str(exc), mod_name=existing_mod.name)
        raise_workshop_fetch_failed(exc)


@router.delete("/mods/{mod_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_mod(
    mod_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> Response:
    existing_mod = get_mod_or_none(db, mod_id)
    if not existing_mod:
        raise_mod_not_found(db, action="mod_delete_failed", mod_id=mod_id, request=request, actor=current_user)
    mod_name = existing_mod.name
    delete_mod(db, mod_id)
    audit_mod_deleted(db, mod_id=mod_id, mod_name=mod_name, request=request, actor=current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/refresh", response_model=RefreshResult)
async def api_refresh_all(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> RefreshResult:
    result = await refresh_all_mods(db)
    audit_refresh_all(db, result=result, request=request, actor=current_user)
    return result
