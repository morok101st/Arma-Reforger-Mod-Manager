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
    theme_preference: str = "dark"
    active_modset_id: int | None = None
    active_modset_name: str | None = None
    session_expires_at: datetime | None = None
    auth_provider: str = "local"
    has_local_password: bool = True


class AuthConfigRead(BaseModel):
    local_login_enabled: bool = True
    oidc_enabled: bool = False


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=12, max_length=256)


class ThemePreferenceUpdate(BaseModel):
    theme_preference: str = Field(pattern=r"^(light|dark)$")
