from datetime import datetime

from pydantic import BaseModel


class AuditLogRead(BaseModel):
    id: int
    actor_username: str | None
    action: str
    entity_type: str
    entity_id: str | None
    detail: dict[str, object]
    ip_address: str | None
    user_agent: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ModsetActivityRead(BaseModel):
    id: int
    actor_username: str | None
    action: str
    entity_id: str | None
    detail: dict[str, object]
    created_at: datetime

    model_config = {"from_attributes": True}
