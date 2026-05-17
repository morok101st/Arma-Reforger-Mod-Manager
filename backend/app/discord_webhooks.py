from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import DiscordWebhook, DiscordWebhookDelivery, ModSet
from app.schema_enums import ModStatus
from app.schemas_discord import DiscordWebhookCreate, DiscordWebhookRead, DiscordWebhookUpdate
from app.schemas_mods import ModRead
from app.webhook_crypto import decrypt_webhook_url, encrypt_webhook_url

logger = logging.getLogger(__name__)


def mask_webhook_url(webhook_url: str) -> str:
    parsed = urlparse(decrypt_webhook_url(webhook_url))
    host = parsed.netloc or "discord.com"
    return f"{host}/api/webhooks/..."


def list_webhooks(db: Session) -> list[DiscordWebhookRead]:
    rows = db.scalars(select(DiscordWebhook).order_by(func.lower(DiscordWebhook.name), DiscordWebhook.id)).all()
    return [to_read(row) for row in rows]


def create_webhook(db: Session, payload: DiscordWebhookCreate) -> DiscordWebhookRead:
    name = payload.name.strip()
    webhook_url = payload.webhook_url.strip()
    if not name:
        raise ValueError("Webhook name is required")
    if not webhook_url:
        raise ValueError("Webhook URL is required")
    webhook = DiscordWebhook(
        name=name,
        webhook_url=encrypt_webhook_url(webhook_url),
        is_active=payload.is_active,
    )
    db.add(webhook)
    db.commit()
    db.refresh(webhook)
    return to_read(webhook)


def update_webhook(db: Session, webhook_id: int, payload: DiscordWebhookUpdate) -> DiscordWebhookRead | None:
    webhook = db.get(DiscordWebhook, webhook_id)
    if not webhook:
        return None
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise ValueError("Webhook name is required")
        webhook.name = name
    if payload.webhook_url is not None:
        webhook_url = payload.webhook_url.strip()
        if not webhook_url:
            raise ValueError("Webhook URL is required")
        webhook.webhook_url = encrypt_webhook_url(webhook_url)
    if payload.is_active is not None:
        webhook.is_active = payload.is_active
    db.commit()
    db.refresh(webhook)
    return to_read(webhook)


def delete_webhook(db: Session, webhook_id: int) -> DiscordWebhookRead | None:
    webhook = db.get(DiscordWebhook, webhook_id)
    if not webhook:
        return None
    deleted = to_read(webhook)
    db.delete(webhook)
    db.commit()
    return deleted


async def test_webhook(webhook_url: str, webhook_name: str) -> None:
    await _post_discord_webhook(
        webhook_url,
        _build_test_payload(webhook_name),
    )


async def notify_update_available(db: Session, modset_id: int, mod: ModRead) -> None:
    status = _coerce_mod_status(mod.status)
    if status != ModStatus.update_available or not mod.latest_version:
        return

    modset = db.get(ModSet, modset_id)
    if not modset:
        return

    webhooks = db.scalars(select(DiscordWebhook).where(DiscordWebhook.is_active.is_(True)).order_by(func.lower(DiscordWebhook.name), DiscordWebhook.id)).all()
    if not webhooks:
        return

    for webhook in webhooks:
        if _delivery_exists(db, webhook.id, modset_id, mod.id, mod.latest_version):
            continue

        try:
            await _post_discord_webhook(decrypt_webhook_url(webhook.webhook_url), _build_update_payload(modset.name, mod))
        except Exception as exc:
            logger.warning(
                "Discord webhook delivery failed for webhook_id=%s modset_id=%s mod_id=%s: %s",
                webhook.id,
                modset_id,
                mod.id,
                exc,
            )
            continue

        db.add(
            DiscordWebhookDelivery(
                webhook_id=webhook.id,
                modset_id=modset_id,
                mod_id=mod.id,
                latest_version=mod.latest_version,
                sent_at=datetime.now(timezone.utc),
            )
        )
        try:
            db.commit()
        except Exception:
            db.rollback()
            logger.exception(
                "Failed to record Discord webhook delivery for webhook_id=%s modset_id=%s mod_id=%s",
                webhook.id,
                modset_id,
                mod.id,
            )


def to_read(webhook: DiscordWebhook) -> DiscordWebhookRead:
    return DiscordWebhookRead(
        id=webhook.id,
        name=webhook.name,
        masked_webhook_url=mask_webhook_url(webhook.webhook_url),
        is_active=bool(webhook.is_active),
        created_at=webhook.created_at,
        updated_at=webhook.updated_at,
    )


def _delivery_exists(db: Session, webhook_id: int, modset_id: int, mod_id: str, latest_version: str) -> bool:
    delivery_id = db.scalar(
        select(DiscordWebhookDelivery.id).where(
            DiscordWebhookDelivery.webhook_id == webhook_id,
            DiscordWebhookDelivery.modset_id == modset_id,
            DiscordWebhookDelivery.mod_id == mod_id,
            DiscordWebhookDelivery.latest_version == latest_version,
        )
    )
    return delivery_id is not None


async def _post_discord_webhook(webhook_url: str, payload: dict[str, Any]) -> None:
    async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=6.0)) as client:
        response = await client.post(webhook_url, json=payload)
        response.raise_for_status()


def _build_update_payload(modset_name: str, mod: ModRead) -> dict[str, Any]:
    mod_name = mod.name or mod.id
    status = _coerce_mod_status(mod.status)
    status_label = {
        ModStatus.not_installed: "No installed version",
        ModStatus.unknown: "Unknown",
        ModStatus.up_to_date: "Up to date",
        ModStatus.update_available: "Update available",
    }.get(status, "Unknown")
    workshop_url = mod.source_url or ""
    changelog_url = f"{workshop_url.rstrip('/')}/changelog" if workshop_url else ""

    fields: list[dict[str, Any]] = [
        {"name": "Modset", "value": modset_name, "inline": True},
        {"name": "Mod", "value": f"{mod_name}\n`{mod.id}`", "inline": True},
        {"name": "Installed", "value": mod.current_version or "No installed version", "inline": True},
        {"name": "Latest", "value": mod.latest_version or "unknown", "inline": True},
        {"name": "Status", "value": status_label, "inline": True},
    ]
    if workshop_url:
        fields.append({"name": "Workshop", "value": f"[Open workshop]({workshop_url})", "inline": True})
    if changelog_url:
        fields.append({"name": "Changelog", "value": f"[Open changelog]({changelog_url})", "inline": True})

    return {
        "username": "ARMM",
        "allowed_mentions": {"parse": []},
        "embeds": [
            {
                "title": f"Update available: {mod_name}",
                "description": f"Tracked mod in **{modset_name}** has a newer workshop version.",
                "color": 0xFFCE3A,
                "fields": fields,
                "footer": {"text": "Arma Reforger Mod Manager"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ],
    }


def _build_test_payload(webhook_name: str) -> dict[str, Any]:
    return {
        "username": "ARMM",
        "allowed_mentions": {"parse": []},
        "embeds": [
            {
                "title": f"Webhook test: {webhook_name}",
                "description": "This is a test notification from Arma Reforger Mod Manager.",
                "color": 0xFFCE3A,
                "footer": {"text": "Arma Reforger Mod Manager"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ],
    }


def _coerce_mod_status(value: object) -> ModStatus | None:
    if isinstance(value, ModStatus):
        return value
    try:
        return ModStatus(str(value))
    except Exception:
        return None
