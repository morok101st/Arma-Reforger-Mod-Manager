from datetime import datetime

from pydantic import BaseModel, Field

from app.schema_enums import UserRole


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)


class AuthUserRead(BaseModel):
    id: int
    username: str
    role: UserRole
    active_modset_id: int | None = None
    active_modset_name: str | None = None
    session_expires_at: datetime | None = None


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)
