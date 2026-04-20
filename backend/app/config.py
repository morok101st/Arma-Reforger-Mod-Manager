from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    armm_env: str = "development"
    armm_secret_key: str = "development-only-change-me"
    armm_admin_username: str | None = None
    armm_admin_password: str | None = None
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
