import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.auth import require_current_user
from app.database import get_db
from app.modset_service import ModSetNotFoundError, resolve_modset_id
from app.mod_router_helpers import (
    audit_mod_create_failed,
    audit_mod_created,
    audit_mod_deleted,
    audit_mod_updated,
    audit_refresh_all,
    raise_mod_not_found,
    raise_workshop_fetch_failed,
)
from app.models import ModRefreshJob, User
from app.refresh_jobs import enqueue_refresh, execute_refresh, list_refresh_jobs
from app.schemas_mods import ModCreate, ModRead, ModRefreshJobRead, RefreshResult, UserModUpdate
from app.services import (
    ModDeleteBlockedError,
    create_mod,
    delete_mod,
    get_mod_or_none,
    get_mod_read,
    list_mods,
    refresh_all_mods,
    schedule_mod_metadata_refresh,
    update_user_mod,
)

router = APIRouter(tags=["mods"])


@router.get("/mods", response_model=list[ModRead])
def api_list_mods(
    modset_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
) -> list[ModRead]:
    try:
        effective_modset_id = resolve_modset_id(db, current_user, modset_id)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return list_mods(db, effective_modset_id)


@router.post("/mods", response_model=ModRead, status_code=status.HTTP_201_CREATED)
async def api_create_mod(
    payload: ModCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
    modset_id: int | None = None,
) -> ModRead:
    try:
        effective_modset_id = resolve_modset_id(db, current_user, modset_id, write=True)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    try:
        created = await create_mod(db, payload, effective_modset_id, defer_metadata_refresh=True)
        schedule_mod_metadata_refresh(payload.id, effective_modset_id)
        audit_mod_created(db, mod=created, modset_id=effective_modset_id, request=request, actor=current_user)
        return created
    except HTTPException:
        raise
    except Exception as exc:
        audit_mod_create_failed(db, payload=payload, modset_id=effective_modset_id, request=request, actor=current_user, exc=exc)
        raise_workshop_fetch_failed(exc)


@router.get("/mods/{mod_id}", response_model=ModRead)
def api_get_mod(
    mod_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
    modset_id: int | None = None,
) -> ModRead:
    try:
        effective_modset_id = resolve_modset_id(db, current_user, modset_id)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    mod = get_mod_read(db, mod_id, effective_modset_id)
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
    modset_id: int | None = None,
    deactivate_orphan_dependencies: bool = False,
) -> ModRead:
    try:
        effective_modset_id = resolve_modset_id(db, current_user, modset_id, write=True)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    request_payload = await request.json()
    provided_fields = set(request_payload.keys()) if isinstance(request_payload, dict) else set()
    should_refresh_in_background = "current_version" in provided_fields
    mod = await update_user_mod(
        db,
        mod_id,
        payload,
        effective_modset_id,
        provided_fields=provided_fields,
        deactivate_orphan_dependencies=deactivate_orphan_dependencies,
        defer_metadata_refresh=should_refresh_in_background,
    )
    if not mod:
        raise HTTPException(status_code=404, detail="Mod not found")
    if should_refresh_in_background:
        schedule_mod_metadata_refresh(mod_id, effective_modset_id)
    audit_mod_updated(
        db,
        mod_id=mod_id,
        modset_id=effective_modset_id,
        mod=mod,
        payload=payload,
        provided_fields=provided_fields,
        request=request,
        actor=current_user,
    )
    return mod


@router.post("/mods/{mod_id}/refresh", response_model=ModRead)
async def api_refresh_mod(
    mod_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
    modset_id: int | None = None,
) -> ModRead:
    try:
        effective_modset_id = resolve_modset_id(db, current_user, modset_id, write=True)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    existing_mod = get_mod_or_none(db, mod_id, effective_modset_id)
    if not existing_mod:
        raise_mod_not_found(
            db,
            action="mod_refresh_failed",
            mod_id=mod_id,
            modset_id=effective_modset_id,
            request=request,
            actor=current_user,
        )
    enqueue_refresh(db, mod_id, effective_modset_id, current_user)
    # Preserve the 0.2.5 API: wait for the same durable job and return ModRead.
    await asyncio.to_thread(execute_refresh, db.get_bind(), effective_modset_id, mod_id)
    while True:
        db.expire_all()
        current = db.get(ModRefreshJob, (effective_modset_id, mod_id))
        if current is None:
            raise HTTPException(status_code=404, detail="Mod not found")
        if current.state == "failed":
            raise HTTPException(status_code=502, detail=current.error)
        if current.state == "succeeded":
            return get_mod_read(db, mod_id, effective_modset_id)
        db.rollback()
        await asyncio.sleep(0.25)


@router.post("/mods/{mod_id}/refresh-job", response_model=ModRefreshJobRead, status_code=202)
def api_start_refresh_job(
    mod_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
    modset_id: int | None = None,
) -> ModRefreshJobRead:
    try:
        effective_modset_id = resolve_modset_id(db, current_user, modset_id, write=True)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if not get_mod_or_none(db, mod_id, effective_modset_id):
        raise HTTPException(status_code=404, detail="Mod not found")
    return enqueue_refresh(db, mod_id, effective_modset_id, current_user)


@router.get("/refresh-jobs", response_model=list[ModRefreshJobRead])
def api_list_refresh_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
    modset_id: int | None = None,
) -> list[ModRefreshJobRead]:
    try:
        effective_modset_id = resolve_modset_id(db, current_user, modset_id)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return list_refresh_jobs(db, effective_modset_id)


@router.delete("/mods/{mod_id}", status_code=status.HTTP_204_NO_CONTENT)
def api_delete_mod(
    mod_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
    modset_id: int | None = None,
    deactivate_orphan_dependencies: bool = False,
) -> Response:
    try:
        effective_modset_id = resolve_modset_id(db, current_user, modset_id, write=True)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    existing_mod = get_mod_or_none(db, mod_id, effective_modset_id)
    if not existing_mod:
        raise_mod_not_found(
            db,
            action="mod_delete_failed",
            mod_id=mod_id,
            modset_id=effective_modset_id,
            request=request,
            actor=current_user,
        )
    mod_name = existing_mod.name
    try:
        delete_mod(db, mod_id, effective_modset_id, deactivate_orphan_dependencies=deactivate_orphan_dependencies)
    except ModDeleteBlockedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    audit_mod_deleted(db, mod_id=mod_id, modset_id=effective_modset_id, mod_name=mod_name, request=request, actor=current_user)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/refresh", response_model=RefreshResult)
async def api_refresh_all(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_current_user),
    modset_id: int | None = None,
) -> RefreshResult:
    try:
        effective_modset_id = resolve_modset_id(db, current_user, modset_id, write=True)
    except ModSetNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    result = await refresh_all_mods(db, modset_id=effective_modset_id)
    audit_refresh_all(db, result=result, modset_id=effective_modset_id, request=request, actor=current_user)
    return result
