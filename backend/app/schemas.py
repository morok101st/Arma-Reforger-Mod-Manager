from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class ModStatus(StrEnum):
    unknown = "UNKNOWN"
    up_to_date = "UP_TO_DATE"
    update_available = "UPDATE_AVAILABLE"


class TrackingReason(StrEnum):
    manual = "manual"
    dependency = "dependency"


class UserRole(StrEnum):
    admin = "admin"
    user = "user"


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)


class AuthUserRead(BaseModel):
    id: int
    username: str
    role: UserRole


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=12, max_length=256)
    role: UserRole = UserRole.user
    is_active: bool = True


class UserUpdate(BaseModel):
    password: str | None = Field(default=None, min_length=12, max_length=256)
    role: UserRole | None = None
    is_active: bool | None = None


class UserRead(BaseModel):
    id: int
    username: str
    role: UserRole
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None


class ModCreate(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{3,80}$")
    current_version: str | None = Field(default=None, max_length=80)
    pinned: bool = False


class UserModUpdate(BaseModel):
    current_version: str | None = Field(default=None, max_length=80)
    pinned: bool | None = None


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
    tracking_reason: TrackingReason
    status: ModStatus
    versions: list[ModVersionRead] = []


class RefreshResult(BaseModel):
    refreshed: int
    failed: dict[str, str]
