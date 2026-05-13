from datetime import datetime

from pydantic import BaseModel, Field


class ModSetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    shared: bool = False


class ModSetUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    shared: bool | None = None


class ModSetRead(BaseModel):
    id: int
    name: str
    tracked_mods_count: int
    shared: bool
    owner_username: str | None = None
    is_owner: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ModSetExportEntry(BaseModel):
    modId: str
    name: str
    version: str
