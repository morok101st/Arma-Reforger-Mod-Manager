from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.audit import list_modset_activity
from app.auth import require_current_user
from app.database import get_db
from app.modset_service import (
    ModSetConflictError,
    ModSetLastDeleteError,
    ModSetNotFoundError,
    ModSetPermissionError,
    activate_modset,
    create_modset,
    delete_modset,
    duplicate_modset,
    ensure_accessible_modset,
    ensure_user_active_modset,
    export_modset,
    list_modsets,
    update_modset_load_order,
    update_modset,
)
from app.models import User
from app.router_helpers import audit_event
from app.schemas_audit import ModsetActivityRead
from app.schemas_auth import AuthUserRead
from app.schemas_modsets import ModSetCreate, ModSetExportEntry, ModSetLoadOrderUpdate, ModSetRead, ModSetUpdate
from app.user_service import auth_user_to_read

router = APIRouter(tags=["modsets"])


@router.get("/modsets", response_model=list[ModSetRead])
def api_list_modsets(db: Session = Depends(get_db), current_user: User = Depends(require_current_user)) -> list[ModSetRead]:
    return list_modsets(db, current_user)


@router.post("/modsets", response_model=ModSetRead, status_code=status.HTTP_201_CREATED)
def api_create_modset(
    payload: ModSetCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> ModSetRead:
    try:
        created = create_modset(db, current_user, payload)
    except ModSetConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    audit_event(
        db,
        action="modset_created",
        entity_type="modset",
        entity_id=str(created.id),
        actor=current_user,
        request=request,
        detail={"modset_name": created.name},
    )
    return created


@router.patch("/modsets/{modset_id}", response_model=ModSetRead)
def api_update_modset(
    modset_id: int,
    payload: ModSetUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> ModSetRead:
    try:
        updated = update_modset(db, current_user, modset_id, payload)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ModSetConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ModSetPermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    audit_event(
        db,
        action="modset_updated",
        entity_type="modset",
        entity_id=str(updated.id),
        actor=current_user,
        request=request,
        detail={"modset_name": updated.name},
    )
    return updated


@router.post("/modsets/{modset_id}/duplicate", response_model=ModSetRead, status_code=status.HTTP_201_CREATED)
def api_duplicate_modset(
    modset_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> ModSetRead:
    try:
        duplicated = duplicate_modset(db, current_user, modset_id)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    audit_event(
        db,
        action="modset_duplicated",
        entity_type="modset",
        entity_id=str(duplicated.id),
        actor=current_user,
        request=request,
        detail={"modset_name": duplicated.name, "source_modset_id": modset_id},
    )
    return duplicated


@router.delete("/modsets/{modset_id}", response_model=AuthUserRead)
def api_delete_modset(
    modset_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> AuthUserRead:
    try:
        delete_modset(db, current_user, modset_id)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ModSetLastDeleteError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    ensure_user_active_modset(db, current_user)
    audit_event(
        db,
        action="modset_deleted",
        entity_type="modset",
        entity_id=str(modset_id),
        actor=current_user,
        request=request,
        detail={"active_modset_id": current_user.active_modset_id},
    )
    return auth_user_to_read(current_user)


@router.post("/modsets/{modset_id}/activate", response_model=AuthUserRead)
def api_activate_modset(
    modset_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> AuthUserRead:
    try:
        modset = activate_modset(db, current_user, modset_id)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    audit_event(
        db,
        action="modset_activated",
        entity_type="modset",
        entity_id=str(modset.id),
        actor=current_user,
        request=request,
        detail={"modset_name": modset.name},
    )
    return auth_user_to_read(current_user)


@router.get("/modsets/{modset_id}/export", response_model=list[ModSetExportEntry])
def api_export_modset(
    modset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> list[ModSetExportEntry]:
    try:
        return export_modset(db, current_user, modset_id)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("/modsets/{modset_id}/load-order", status_code=status.HTTP_204_NO_CONTENT)
def api_update_modset_load_order(
    modset_id: int,
    payload: ModSetLoadOrderUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> None:
    try:
        update_modset_load_order(db, current_user, modset_id, payload)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    audit_event(
        db,
        action="modset_load_order_updated",
        entity_type="modset",
        entity_id=str(modset_id),
        actor=current_user,
        request=request,
        detail={
            "modset_id": modset_id,
            "updated_count": len(payload.entries),
            "mod_ids": [entry.mod_id for entry in payload.entries],
        },
    )


@router.get("/modsets/{modset_id}/activity", response_model=list[ModsetActivityRead])
def api_modset_activity(
    modset_id: int,
    limit: int = 10,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> list[ModsetActivityRead]:
    try:
        ensure_accessible_modset(db, current_user, modset_id)
        return list_modset_activity(db, modset_id, limit=limit, offset=offset)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
