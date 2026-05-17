from datetime import datetime

from pydantic import BaseModel, Field


class DiscordWebhookCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    webhook_url: str = Field(min_length=1, max_length=1024, pattern=r"^https://")
    is_active: bool = True


class DiscordWebhookUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    webhook_url: str | None = Field(default=None, min_length=1, max_length=1024, pattern=r"^https://")
    is_active: bool | None = None


class DiscordWebhookRead(BaseModel):
    id: int
    name: str
    masked_webhook_url: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DiscordWebhookTestResult(BaseModel):
    sent: bool
