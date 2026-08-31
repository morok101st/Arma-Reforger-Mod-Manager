from __future__ import annotations

from typing import Protocol

from app.config import Settings, get_settings
from app.reforger_metadata import ReforgerMetadataServiceClient
from app.scraper import ScrapedMod, ScrapedModVersion, WorkshopScraper


class WorkshopMetadataProvider(Protocol):
    async def fetch_mod(self, mod_id: str) -> ScrapedMod:
        pass


class HybridWorkshopMetadataProvider:
    def __init__(self, scraper: WorkshopScraper, reforger: ReforgerMetadataServiceClient) -> None:
        self.scraper = scraper
        self.reforger = reforger

    async def fetch_mod(self, mod_id: str) -> ScrapedMod:
        mods = await self.fetch_mods([mod_id])
        return mods[mod_id.strip().upper()]

    async def fetch_mods(self, mod_ids: list[str]) -> dict[str, ScrapedMod]:
        normalized_ids = [mod_id.strip().upper() for mod_id in mod_ids if mod_id.strip()]
        scraped_mods = {mod_id: await self.scraper.fetch_mod(mod_id) for mod_id in normalized_ids}
        reforger_mods = await self.reforger.fetch_mods(normalized_ids)

        for mod_id, scraped in scraped_mods.items():
            latest_version = reforger_mods.get(mod_id).latest_version if mod_id in reforger_mods else None
            if latest_version:
                _apply_reliable_latest_version(scraped, latest_version)
        return scraped_mods


def _apply_reliable_latest_version(scraped: ScrapedMod, latest_version: str) -> None:
    scraped.latest_version = latest_version
    if any(version.version == latest_version for version in scraped.versions):
        return
    scraped.versions.insert(0, ScrapedModVersion(version=latest_version))


def get_workshop_metadata_provider(settings: Settings | None = None) -> WorkshopMetadataProvider:
    settings = settings or get_settings()
    provider = settings.workshop_metadata_provider.casefold()
    if provider == "reforger":
        return HybridWorkshopMetadataProvider(
            WorkshopScraper(settings.workshop_base_url),
            ReforgerMetadataServiceClient(
                settings.reforger_metadata_url,
                workshop_base_url=settings.workshop_base_url,
                timeout_seconds=settings.reforger_metadata_timeout_seconds,
            ),
        )
    if provider == "scraper":
        return WorkshopScraper(settings.workshop_base_url)
    raise ValueError(f"Unsupported WORKSHOP_METADATA_PROVIDER: {settings.workshop_metadata_provider}")
