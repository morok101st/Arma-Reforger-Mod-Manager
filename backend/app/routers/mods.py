from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.audit import record_audit
from app.auth import require_current_user
from app.models import User
from app.schemas import ModCreate, ModRead, RefreshResult, UserModUpdate
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
        record_audit(
            db,
            action="mod_created",
            entity_type="mod",
            entity_id=created.id,
            actor=current_user,
            request=request,
            detail={
                "mod_name": created.name,
                "current_version": created.current_version,
                "latest_version": created.latest_version,
                "pinned": created.pinned,
            },
        )
        return created
    except Exception as exc:
        record_audit(
            db,
            action="mod_create_failed",
            entity_type="mod",
            entity_id=payload.id,
            actor=current_user,
            request=request,
            detail={"reason": str(exc), "mod_name": None, "current_version_provided": payload.current_version is not None},
        )
        raise HTTPException(status_code=502, detail=f"Workshop fetch failed: {exc}") from exc


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
    record_audit(
        db,
        action="mod_updated",
        entity_type="mod",
        entity_id=mod_id,
        actor=current_user,
        request=request,
        detail={
            "mod_name": mod.name,
            "current_version_changed": payload.current_version is not None,
            "current_version": mod.current_version,
            "pinned_changed": payload.pinned is not None,
            "pinned": mod.pinned,
        },
    )
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
        record_audit(
            db,
            action="mod_refresh_failed",
            entity_type="mod",
            entity_id=mod_id,
            actor=current_user,
            request=request,
            detail={"reason": "mod_not_found", "mod_name": None},
        )
        raise HTTPException(status_code=404, detail="Mod not found")
    try:
        refreshed = await refresh_mod(db, mod_id)
        record_audit(
            db,
            action="mod_refreshed",
            entity_type="mod",
            entity_id=mod_id,
            actor=current_user,
            request=request,
            detail={"mod_name": refreshed.name, "latest_version": refreshed.latest_version, "status": refreshed.status.value},
        )
        return refreshed
    except Exception as exc:
        record_audit(
            db,
            action="mod_refresh_failed",
            entity_type="mod",
            entity_id=mod_id,
            actor=current_user,
            request=request,
            detail={"reason": str(exc), "mod_name": existing_mod.name},
        )
        raise HTTPException(status_code=502, detail=f"Workshop fetch failed: {exc}") from exc


@router.delete("/mods/{mod_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_mod(
    mod_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> Response:
    existing_mod = get_mod_or_none(db, mod_id)
    if not existing_mod:
        record_audit(
            db,
            action="mod_delete_failed",
            entity_type="mod",
            entity_id=mod_id,
            actor=current_user,
            request=request,
            detail={"reason": "mod_not_found", "mod_name": None},
        )
        raise HTTPException(status_code=404, detail="Mod not found")
    mod_name = existing_mod.name
    delete_mod(db, mod_id)
    record_audit(
        db,
        action="mod_deleted",
        entity_type="mod",
        entity_id=mod_id,
        actor=current_user,
        request=request,
        detail={"mod_id": mod_id, "mod_name": mod_name},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/refresh", response_model=RefreshResult)
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
        detail={"refreshed": result.refreshed, "failed": len(result.failed), "failed_mods": result.failed},
    )
    return result
