from datetime import datetime

from pydantic import BaseModel, Field


class ModSetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ModSetUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ModSetRead(BaseModel):
    id: int
    name: str
    tracked_mods_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
