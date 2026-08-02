from datetime import datetime

from pydantic import BaseModel, Field

from app.schema_enums import UserRole


class PasswordReset(BaseModel):
    password: str = Field(min_length=12, max_length=256)


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
    auth_provider: str = "local"
    has_local_password: bool = True
    email: str | None = None
