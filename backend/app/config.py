from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    armm_env: str = "development"
    armm_secret_key: str = "development-only-change-me"
    armm_admin_username: str | None = None
    armm_admin_password: str | None = None
    armm_public_url: str | None = None
    database_url: str = "sqlite:///./armm.db"
    workshop_base_url: str = "https://reforger.armaplatform.com/workshop"
    scrape_interval_minutes: int = 60
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.armm_env.casefold() == "production"

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
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
