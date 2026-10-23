from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field
from app.schemas_groups import GroupPermission


class ModSetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    shared: Literal[False] = Field(default=False, json_schema_extra={'deprecated': True}, description="Global sharing was removed. Only false is accepted; use group permissions.")


class ModSetUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    shared: Literal[False] | None = Field(default=None, json_schema_extra={'deprecated': True}, description="Global sharing was removed. Use group permissions.")
    group_permissions: list[GroupPermission] | None = None


class ModSetLoadOrderEntry(BaseModel):
    mod_id: str = Field(min_length=1, max_length=80)
    load_order: int = Field(ge=0, le=999999)


class ModSetLoadOrderUpdate(BaseModel):
    entries: list[ModSetLoadOrderEntry] = Field(min_length=1)


class ModSetRead(BaseModel):
    id: int
    name: str
    tracked_mods_count: int
    shared: Literal[False] = Field(default=False, json_schema_extra={'deprecated': True}, description="Compatibility field; always false. Access is controlled by ownership and groups.")
    owner_username: str | None = None
    is_owner: bool = False
    can_edit: bool = False
    can_delete: bool = False
    can_manage_access: bool = False
    has_group_access: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ModSetExportEntry(BaseModel):
    modId: str
    name: str
    version: str
