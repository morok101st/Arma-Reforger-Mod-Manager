from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Mod, ModVersion
from app.scraper import ScrapedMod


def upsert_scraped_mod(db: Session, scraped: ScrapedMod) -> None:
    mod = db.get(Mod, scraped.id)
    if not mod:
        mod = Mod(id=scraped.id)
        db.add(mod)

    mod.name = scraped.name or mod.name
    mod.summary = scraped.summary or mod.summary
    mod.description = scraped.description or mod.description
    mod.latest_version = scraped.latest_version or mod.latest_version
    mod.game_version = scraped.game_version or mod.game_version
    mod.size = scraped.size or mod.size
    mod.dependencies = scraped.dependencies
    mod.source_url = scraped.source_url
    mod.last_checked = scraped.last_checked

    for scraped_version in scraped.versions:
        existing = db.scalar(select(ModVersion).where(ModVersion.mod_id == scraped.id, ModVersion.version == scraped_version.version))
        if not existing:
            db.add(
                ModVersion(
                    mod_id=scraped.id,
                    version=scraped_version.version,
                    changelog=scraped_version.changelog,
                    published_at=scraped_version.published_at,
                    last_modified_at=scraped_version.last_modified_at,
                )
            )
            continue

        if scraped_version.changelog is not None:
            existing.changelog = scraped_version.changelog
        if scraped_version.published_at is not None:
            existing.published_at = scraped_version.published_at
        if scraped_version.last_modified_at is not None:
            existing.last_modified_at = scraped_version.last_modified_at

    if scraped.latest_version and not scraped.versions:
        existing = db.scalar(select(ModVersion).where(ModVersion.mod_id == scraped.id, ModVersion.version == scraped.latest_version))
        if not existing:
            db.add(ModVersion(mod_id=scraped.id, version=scraped.latest_version, changelog=scraped.changelog))
        elif scraped.changelog and existing.changelog != scraped.changelog:
            existing.changelog = scraped.changelog

    db.commit()
