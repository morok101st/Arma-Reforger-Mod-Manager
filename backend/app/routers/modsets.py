from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.database import get_db
from app.modset_service import (
    ModSetConflictError,
    ModSetLastDeleteError,
    ModSetNotEmptyError,
    ModSetNotFoundError,
    activate_modset,
    create_modset,
    delete_modset,
    ensure_user_active_modset,
    list_modsets,
    update_modset,
)
from app.models import User
from app.router_helpers import audit_event
from app.schemas_auth import AuthUserRead
from app.schemas_modsets import ModSetCreate, ModSetRead, ModSetUpdate
from app.user_service import auth_user_to_read

router = APIRouter(tags=["modsets"])


@router.get("/modsets", response_model=list[ModSetRead])
def api_list_modsets(db: Session = Depends(get_db), _: User = Depends(require_current_user)) -> list[ModSetRead]:
    return list_modsets(db)


@router.post("/modsets", response_model=ModSetRead, status_code=status.HTTP_201_CREATED)
def api_create_modset(
    payload: ModSetCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> ModSetRead:
    try:
        created = create_modset(db, payload)
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
        updated = update_modset(db, modset_id, payload)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ModSetConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
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


@router.delete("/modsets/{modset_id}", response_model=AuthUserRead)
def api_delete_modset(
    modset_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> AuthUserRead:
    try:
        delete_modset(db, modset_id)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ModSetNotEmptyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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
