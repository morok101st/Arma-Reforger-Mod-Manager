from functools import lru_cache
from urllib.parse import urljoin
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    armm_env: str = "development"
    armm_secret_key: str = "development-only-change-me"
    armm_admin_username: str | None = None
    armm_admin_password: str | None = None
    armm_public_url: str | None = None
    armm_scheduler_timezone: str = "Europe/Berlin"
    database_url: str = "sqlite:///./armm.db"
    workshop_base_url: str = "https://reforger.armaplatform.com/workshop"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    oidc_enabled: bool = False
    oidc_issuer_url: str | None = None
    oidc_client_id: str | None = None
    oidc_client_secret: str | None = None
    oidc_redirect_uri: str | None = None
    oidc_scopes: str = "openid email profile"
    oidc_username_claim: str = "preferred_username"
    oidc_email_claim: str = "email"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.armm_env.casefold() == "production"

    @property
    def oidc_scope_list(self) -> list[str]:
        scopes = [scope.strip() for scope in self.oidc_scopes.split() if scope.strip()]
        return scopes or ["openid"]

    @property
    def effective_oidc_redirect_uri(self) -> str | None:
        if self.oidc_redirect_uri:
            return self.oidc_redirect_uri
        if not self.armm_public_url:
            return None
        return urljoin(self.armm_public_url.rstrip("/") + "/", "api/auth/oidc/callback")

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        try:
            ZoneInfo(self.armm_scheduler_timezone)
        except ZoneInfoNotFoundError as exc:
            raise ValueError(f"Unknown ARMM_SCHEDULER_TIMEZONE: {self.armm_scheduler_timezone}") from exc
        if self.oidc_enabled:
            missing = [
                name
                for name, value in {
                    "OIDC_ISSUER_URL": self.oidc_issuer_url,
                    "OIDC_CLIENT_ID": self.oidc_client_id,
                    "OIDC_CLIENT_SECRET": self.oidc_client_secret,
                    "OIDC_REDIRECT_URI or ARMM_PUBLIC_URL": self.effective_oidc_redirect_uri,
                }.items()
                if not value
            ]
            if missing:
                raise ValueError(f"OIDC is enabled but required settings are missing: {', '.join(missing)}")
        if not self.is_production:
            return self
        insecure_values = {
            "",
            "development-only-change-me",
            "change-me-long-random-secret",
        }
        if self.armm_secret_key in insecure_values:
            raise ValueError("ARMM_SECRET_KEY must be set to a unique strong value in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
