from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditLog, User
from app.schemas_audit import AuditLogRead, ModsetActivityRead


def record_audit(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    actor: User | None = None,
    request: Request | None = None,
    detail: dict[str, object] | None = None,
) -> None:
    db.add(
        AuditLog(
            actor_user_id=actor.id if actor else None,
            actor_username=actor.username if actor else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            detail=detail or {},
            ip_address=_client_ip(request),
            user_agent=_user_agent(request),
        )
    )
    db.commit()


def list_audit_logs(db: Session, limit: int = 100) -> list[AuditLogRead]:
    limit = max(1, min(limit, 500))
    logs = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)).all()
    return [AuditLogRead.model_validate(log) for log in logs]


def list_modset_activity(db: Session, modset_id: int, limit: int = 20) -> list[ModsetActivityRead]:
    limit = max(1, min(limit, 100))
    logs = db.scalars(
        select(AuditLog)
        .where(
            AuditLog.entity_type == "mod",
            AuditLog.action.in_(("mod_created", "mod_updated", "mod_deleted")),
            AuditLog.detail["modset_id"].as_integer() == modset_id,
        )
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    ).all()
    return [ModsetActivityRead.model_validate(log) for log in logs]


def _client_ip(request: Request | None) -> str | None:
    if not request:
        return None
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else None


def _user_agent(request: Request | None) -> str | None:
    if not request:
        return None
    value = request.headers.get("user-agent")
    return value[:255] if value else None
