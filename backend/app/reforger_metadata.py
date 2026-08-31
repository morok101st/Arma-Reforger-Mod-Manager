from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin

import httpx

from app.scraper import ScrapedMod, ScrapedModVersion


class ReforgerMetadataError(Exception):
    pass


class ReforgerMetadataServiceClient:
    def __init__(self, base_url: str, *, workshop_base_url: str, timeout_seconds: int = 180) -> None:
        self.base_url = base_url.rstrip("/")
        self.workshop_base_url = workshop_base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    async def fetch_mod(self, mod_id: str) -> ScrapedMod:
        mods = await self.fetch_mods([mod_id])
        normalized_id = mod_id.strip().upper()
        try:
            return mods[normalized_id]
        except KeyError as exc:
            raise ReforgerMetadataError(f"Reforger metadata service did not return mod {normalized_id}") from exc

    async def fetch_mods(self, mod_ids: list[str]) -> dict[str, ScrapedMod]:
        normalized_ids = [mod_id.strip().upper() for mod_id in mod_ids if mod_id.strip()]
        if not normalized_ids:
            return {}

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(float(self.timeout_seconds), connect=10.0)) as client:
                response = await client.post(f"{self.base_url}/mods", json={"mod_ids": normalized_ids})
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:1000]
            raise ReforgerMetadataError(f"Reforger metadata service returned HTTP {exc.response.status_code}: {detail}") from exc
        except httpx.HTTPError as exc:
            raise ReforgerMetadataError(f"Reforger metadata service request failed: {exc}") from exc

        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("mods"), list):
            raise ReforgerMetadataError("Reforger metadata service returned an invalid response")
        return {mod.id: mod for mod in (_mod_from_payload(item, self.workshop_base_url) for item in payload["mods"])}


def _mod_from_payload(payload: Any, workshop_base_url: str) -> ScrapedMod:
    if not isinstance(payload, dict):
        raise ReforgerMetadataError("Invalid mod metadata payload")
    mod_id = _string_value(payload, "id") or _string_value(payload, "modId")
    if not mod_id:
        raise ReforgerMetadataError("Invalid mod metadata payload: missing id")
    latest_version = _string_value(payload, "latest_version") or _string_value(payload, "version")
    changelog = _string_value(payload, "changelog")
    versions = [ScrapedModVersion(version=latest_version, changelog=changelog)] if latest_version else []
    return ScrapedMod(
        id=mod_id.upper(),
        name=_string_value(payload, "name"),
        summary=_string_value(payload, "summary"),
        description=_string_value(payload, "description"),
        latest_version=latest_version,
        game_version=_string_value(payload, "game_version"),
        size=_string_value(payload, "size"),
        dependencies=_dependencies_from_payload(payload.get("dependencies")),
        changelog=changelog,
        versions=versions,
        source_url=urljoin(workshop_base_url.rstrip("/") + "/", mod_id.upper()),
        last_checked=datetime.now(timezone.utc),
    )


def _dependencies_from_payload(value: Any) -> list[dict[str, str | None]]:
    if not isinstance(value, list):
        return []
    dependencies: list[dict[str, str | None]] = []
    for entry in value:
        if isinstance(entry, str):
            dependency_id = entry.strip().upper()
            if dependency_id:
                dependencies.append({"id": dependency_id, "name": dependency_id, "url": None})
            continue
        if not isinstance(entry, dict):
            continue
        dependency_id = _string_value(entry, "id") or _string_value(entry, "modId")
        name = _string_value(entry, "name") or dependency_id
        if not name:
            continue
        dependency: dict[str, str | None] = {"name": name, "url": None}
        if dependency_id:
            dependency["id"] = dependency_id.upper()
        dependencies.append(dependency)
    return dependencies


def _string_value(data: dict[str, Any], key: str) -> str | None:
    value = data.get(key)
    if value is None:
        return None
    text = str(value).strip()
    return text or None
