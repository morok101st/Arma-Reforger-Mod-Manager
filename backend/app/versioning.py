import re

from packaging.version import InvalidVersion, Version

from app.schema_enums import ModStatus


def normalize_version(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip()
    if cleaned.lower().startswith("v") and len(cleaned) > 1 and cleaned[1].isdigit():
        cleaned = cleaned[1:]
    return cleaned or None


def compare_versions(installed: str | None, latest: str | None) -> ModStatus:
    installed = normalize_version(installed)
    latest = normalize_version(latest)
    if not installed:
        return ModStatus.not_installed
    if not latest:
        return ModStatus.unknown

    try:
        return ModStatus.update_available if Version(installed) < Version(latest) else ModStatus.up_to_date
    except InvalidVersion:
        pass

    installed_parts = _natural_parts(installed)
    latest_parts = _natural_parts(latest)
    if installed_parts == latest_parts:
        return ModStatus.up_to_date
    return ModStatus.update_available if installed_parts < latest_parts else ModStatus.up_to_date


def _natural_parts(value: str) -> list[int | str]:
    parts: list[int | str] = []
    for part in re.split(r"(\d+)", value.lower()):
        if not part:
            continue
        parts.append(int(part) if part.isdigit() else part)
    return parts
