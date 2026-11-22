import asyncio
import os
import re
from time import monotonic

import httpx
from packaging.version import Version
from pydantic import BaseModel

REPOSITORY_URL = "https://github.com/morok101st/Arma-Reforger-Mod-Manager"
LATEST_RELEASE_URL = "https://api.github.com/repos/morok101st/Arma-Reforger-Mod-Manager/releases/latest"
STABLE_VERSION = re.compile(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)")
RELEASE_VERSION = os.environ.get("ARMM_BUILD_VERSION", "")
BUILD_VERSION = RELEASE_VERSION if STABLE_VERSION.fullmatch(RELEASE_VERSION) else "dev"
BUILD_REVISION = os.environ.get("ARMM_BUILD_REVISION") or None


class AvailableUpdate(BaseModel):
    version: str
    url: str


class ReleaseStatus(BaseModel):
    version: str
    revision: str | None
    repository_url: str
    update: AvailableUpdate | None = None


class ReleaseChecker:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._expires_at = 0.0
        self._update: AvailableUpdate | None = None

    async def available_update(self) -> AvailableUpdate | None:
        async with self._lock:
            if monotonic() < self._expires_at:
                return self._update

            self._update = None
            try:
                async with httpx.AsyncClient(timeout=3.0) as client:
                    response = await client.get(LATEST_RELEASE_URL, headers={"Accept": "application/vnd.github+json"})
                    response.raise_for_status()
                    release = response.json()
            except (httpx.HTTPError, ValueError):
                self._expires_at = monotonic() + 300
                return None

            self._expires_at = monotonic() + 6 * 60 * 60
            if not isinstance(release, dict) or release.get("draft") or release.get("prerelease"):
                return None
            tag = release.get("tag_name")
            if not isinstance(tag, str) or not tag.startswith("v") or not STABLE_VERSION.fullmatch(tag[1:]):
                return None
            version = tag[1:]
            if Version(version) > Version(BUILD_VERSION):
                self._update = AvailableUpdate(version=version, url=f"{REPOSITORY_URL}/releases/tag/{tag}")
            return self._update
