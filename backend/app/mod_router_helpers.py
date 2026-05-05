from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.models import Mod, User
from app.router_helpers import audit_event, fail_with_audit
from app.schemas_mods import ModCreate, ModRead, RefreshResult, UserModUpdate


def raise_mod_not_found(
    db: Session,
    *,
    action: str,
    mod_id: str,
    modset_id: int,
    request: Request,
    actor: User,
) -> None:
    fail_with_audit(
        db,
        action=action,
        entity_type="mod",
        entity_id=mod_id,
        actor=actor,
        request=request,
        status_code=404,
        detail_message="Mod not found",
        audit_detail={"reason": "mod_not_found", "mod_name": None, "modset_id": modset_id},
    )


def raise_workshop_fetch_failed(exc: Exception) -> None:
    raise HTTPException(status_code=502, detail=f"Workshop fetch failed: {exc}") from exc


def audit_mod_created(db: Session, *, mod: ModRead, modset_id: int, request: Request, actor: User) -> None:
    audit_event(
        db,
        action="mod_created",
        entity_type="mod",
        entity_id=mod.id,
        actor=actor,
        request=request,
        detail={
            "mod_name": mod.name,
            "current_version": mod.current_version,
            "latest_version": mod.latest_version,
            "pinned": mod.pinned,
            "modset_id": modset_id,
        },
    )


def audit_mod_create_failed(
    db: Session,
    *,
    payload: ModCreate,
    modset_id: int,
    request: Request,
    actor: User,
    exc: Exception,
) -> None:
    audit_event(
        db,
        action="mod_create_failed",
        entity_type="mod",
        entity_id=payload.id,
        actor=actor,
        request=request,
        detail={
            "reason": str(exc),
            "mod_name": None,
            "current_version_provided": payload.current_version is not None,
            "modset_id": modset_id,
        },
    )


def audit_mod_updated(
    db: Session,
    *,
    mod_id: str,
    modset_id: int,
    mod: ModRead,
    payload: UserModUpdate,
    provided_fields: set[str] | None,
    request: Request,
    actor: User,
) -> None:
    provided_fields = provided_fields or set(payload.model_fields_set)
    audit_event(
        db,
        action="mod_updated",
        entity_type="mod",
        entity_id=mod_id,
        actor=actor,
        request=request,
        detail={
            "mod_name": mod.name,
            "current_version_changed": "current_version" in provided_fields,
            "current_version": mod.current_version,
            "pinned_changed": "pinned" in provided_fields,
            "pinned": mod.pinned,
            "modset_id": modset_id,
        },
    )


def audit_mod_refreshed(db: Session, *, mod_id: str, modset_id: int, mod: ModRead, request: Request, actor: User) -> None:
    audit_event(
        db,
        action="mod_refreshed",
        entity_type="mod",
        entity_id=mod_id,
        actor=actor,
        request=request,
        detail={"mod_name": mod.name, "latest_version": mod.latest_version, "status": mod.status.value, "modset_id": modset_id},
    )


def audit_mod_refresh_failed(
    db: Session,
    *,
    mod_id: str,
    modset_id: int,
    request: Request,
    actor: User,
    reason: str,
    mod_name: str | None,
) -> None:
    audit_event(
        db,
        action="mod_refresh_failed",
        entity_type="mod",
        entity_id=mod_id,
        actor=actor,
        request=request,
        detail={"reason": reason, "mod_name": mod_name, "modset_id": modset_id},
    )


def audit_mod_deleted(db: Session, *, mod_id: str, modset_id: int, mod_name: str | None, request: Request, actor: User) -> None:
    audit_event(
        db,
        action="mod_deleted",
        entity_type="mod",
        entity_id=mod_id,
        actor=actor,
        request=request,
        detail={"mod_id": mod_id, "mod_name": mod_name, "modset_id": modset_id},
    )


def audit_refresh_all(db: Session, *, result: RefreshResult, modset_id: int | None, request: Request, actor: User) -> None:
    audit_event(
        db,
        action="mods_refreshed",
        entity_type="mod",
        actor=actor,
        request=request,
        detail={"refreshed": result.refreshed, "failed": len(result.failed), "failed_mods": result.failed, "modset_id": modset_id},
    )
