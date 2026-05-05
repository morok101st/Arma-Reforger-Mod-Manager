from datetime import datetime

from pydantic import BaseModel, Field

from app.schema_enums import ModStatus, TrackingReason


class ModCreate(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{3,80}$")
    current_version: str | None = Field(default=None, max_length=80)
    pinned: bool = False


class UserModUpdate(BaseModel):
    current_version: str | None = Field(default=None, max_length=80)
    pinned: bool | None = None
    is_core: bool | None = None


class DependencyRead(BaseModel):
    name: str
    url: str | None = None


class ModReferenceRead(BaseModel):
    id: str
    name: str | None = None
    source_url: str | None = None


class ModVersionRead(BaseModel):
    id: int
    version: str
    changelog: str | None
    published_at: datetime | None
    last_modified_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ModRead(BaseModel):
    id: str
    name: str | None
    summary: str | None
    description: str | None
    latest_version: str | None
    game_version: str | None
    size: str | None
    dependencies: list[DependencyRead]
    dependents: list[ModReferenceRead] = Field(default_factory=list)
    source_url: str | None
    last_checked: datetime | None
    current_version: str | None
    pinned: bool
    is_core: bool
    dependency_origin: bool
    is_dependency: bool
    tracking_reason: TrackingReason
    blocking_dependents: list[ModReferenceRead] = Field(default_factory=list)
    core_dependents: list[ModReferenceRead] = Field(default_factory=list)
    delete_blocked: bool = False
    status: ModStatus
    versions: list[ModVersionRead] = []


class RefreshResult(BaseModel):
    refreshed: int
    failed: dict[str, str]
