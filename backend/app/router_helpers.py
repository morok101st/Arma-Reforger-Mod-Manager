from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.audit import record_audit
from app.models import User


def audit_event(
    db: Session,
    *,
    action: str,
    entity_type: str,
    request: Request,
    actor: User | None = None,
    entity_id: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    record_audit(
        db,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        actor=actor,
        request=request,
        detail=detail or {},
    )


def fail_with_audit(
    db: Session,
    *,
    action: str,
    entity_type: str,
    request: Request,
    status_code: int,
    detail_message: str,
    actor: User | None = None,
    entity_id: str | None = None,
    audit_detail: dict[str, Any] | None = None,
) -> None:
    audit_event(
        db,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        actor=actor,
        request=request,
        detail=audit_detail,
    )
    raise HTTPException(status_code=status_code, detail=detail_message)
