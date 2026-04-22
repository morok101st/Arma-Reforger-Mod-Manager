import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin

import httpx
from bs4 import BeautifulSoup


@dataclass
class ScrapedModVersion:
    version: str
    changelog: str | None = None
    published_at: datetime | None = None
    last_modified_at: datetime | None = None


@dataclass
class ScrapedMod:
    id: str
    name: str | None = None
    summary: str | None = None
    description: str | None = None
    latest_version: str | None = None
    game_version: str | None = None
    size: str | None = None
    dependencies: list[dict[str, str | None]] = field(default_factory=list)
    changelog: str | None = None
    versions: list[ScrapedModVersion] = field(default_factory=list)
    source_url: str | None = None
    last_checked: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class WorkshopScraper:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")

    async def fetch_mod(self, mod_id: str) -> ScrapedMod:
        detail_url = f"{self.base_url}/{mod_id}"
        changelog_url = f"{detail_url}/changelog"

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(20.0, connect=10.0),
            follow_redirects=True,
            headers={"User-Agent": "Arma-Reforger-Mod-Manager/0.1"},
        ) as client:
            detail_response = await client.get(detail_url)
            detail_response.raise_for_status()
            changelog_response = await client.get(changelog_url)

        mod = self._parse_detail(mod_id, detail_url, detail_response.text)
        if changelog_response.status_code < 400:
            versions = self._parse_changelog_versions(changelog_response.text)
            if versions:
                mod.versions = versions
            changelog = self._parse_changelog(changelog_response.text)
            mod.changelog = changelog or mod.changelog
        return mod

    def _parse_detail(self, mod_id: str, source_url: str, html: str) -> ScrapedMod:
        soup = BeautifulSoup(html, "html.parser")
        page_text = _clean_text(soup.get_text("\n"))

        name = _first_text(soup, ["h1", "[data-testid='mod-title']", ".mod-title"])
        if not name:
            name = _meta_content(soup, "og:title") or _meta_content(soup, "twitter:title")

        summary = _meta_content(soup, "description") or _meta_content(soup, "og:description")
        description = _section_after_heading(soup, ["description", "beschreibung"]) or summary

        return ScrapedMod(
            id=mod_id,
            name=_strip_suffix(name),
            summary=summary,
            description=description,
            latest_version=_version_value(soup, page_text),
            game_version=_label_value(page_text, ["game version", "required game version"]),
            size=_label_value(page_text, ["size", "file size"]),
            dependencies=_dependencies(soup, page_text),
            changelog=_section_after_heading(soup, ["changelog", "change log", "changes"]),
            source_url=source_url,
        )

    def _parse_changelog(self, html: str) -> str | None:
        soup = BeautifulSoup(html, "html.parser")
        changelog = _section_after_heading(soup, ["changelog", "change log", "changes"])
        if changelog:
            return _clean_changelog_text(changelog)

        main = soup.find("main") or soup.body
        return _clean_changelog_text(main.get_text("\n")) if main else None

    def _parse_changelog_versions(self, html: str) -> list[ScrapedModVersion]:
        soup = BeautifulSoup(html, "html.parser")
        versions: list[ScrapedModVersion] = []
        seen: set[str] = set()

        for heading in soup.find_all(re.compile(r"^h[1-6]$")):
            version = _clean_text(heading.get_text(" "))
            if not _looks_like_version(version) or version in seen:
                continue

            card = _changelog_card(heading)
            changelog = _changelog_body(heading, card)
            versions.append(
                ScrapedModVersion(
                    version=version,
                    changelog=changelog,
                    published_at=_parse_datetime(_metadata_value(card or heading, ["created"])),
                    last_modified_at=_parse_datetime(_metadata_value(card or heading, ["last modified", "modified"])),
                )
            )
            seen.add(version)

        return versions


def _first_text(soup: BeautifulSoup, selectors: list[str]) -> str | None:
    for selector in selectors:
        node = soup.select_one(selector)
        if node:
            text = _clean_text(node.get_text(" "))
            if text:
                return text
    return None


def _meta_content(soup: BeautifulSoup, name: str) -> str | None:
    node = soup.find("meta", attrs={"name": name}) or soup.find("meta", attrs={"property": name})
    if not node:
        return None
    content = node.get("content")
    return _clean_text(content) if isinstance(content, str) else None


def _label_value(text: str, labels: list[str]) -> str | None:
    for label in labels:
        pattern = rf"\b{re.escape(label)}\b\s*:?\s*\n?\s*([A-Za-z0-9_.+\- ]{{1,80}})"
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            value = _clean_text(match.group(1))
            if value and value.lower() not in {"version", "game version", "size"}:
                return value
    return None


def _version_value(soup: BeautifulSoup, page_text: str) -> str | None:
    value = _metadata_value(soup, ["version", "mod version", "latest version"])
    if value and _looks_like_version(value):
        return value

    value = _label_value(page_text, ["mod version", "latest version", "version"])
    return value if value and _looks_like_version(value) else None


def _metadata_value(soup: BeautifulSoup, labels: list[str]) -> str | None:
    normalized_labels = {label.lower() for label in labels}
    for label_node in soup.find_all(["dt", "th"]):
        label = _clean_text(label_node.get_text(" ")).lower()
        if label not in normalized_labels:
            continue

        value_node = label_node.find_next_sibling(["dd", "td"])
        if value_node:
            value = _clean_text(value_node.get_text(" "))
            if value:
                return value

        parent = label_node.parent
        if parent:
            parts = [_clean_text(part) for part in parent.stripped_strings]
            parts = [part for part in parts if part and part.lower() != label]
            if parts:
                return parts[0]
    return None


def _changelog_card(heading):
    node = heading
    for _ in range(5):
        parent = node.parent
        if not parent:
            return node
        if parent.find("dl") and parent.find(re.compile(r"^h[1-6]$")):
            return parent
        node = parent
    return node


def _changelog_body(heading, card) -> str | None:
    if card:
        pre = card.find("pre")
        if pre:
            return _clean_changelog_text(pre.get_text("\n"))

    chunks: list[str] = []
    for sibling in heading.find_next_siblings():
        if sibling.name == "pre":
            text = _clean_changelog_text(sibling.get_text("\n"))
            if text:
                chunks.append(text)
        if sibling.name == "dl" or (sibling.name and re.match(r"^h[1-6]$", sibling.name)):
            break
    return "\n".join(chunks).strip() or None


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _section_after_heading(soup: BeautifulSoup, labels: list[str]) -> str | None:
    headings = soup.find_all(re.compile(r"^h[1-6]$"))
    for heading in headings:
        heading_text = _clean_text(heading.get_text(" ")).lower()
        if not any(label in heading_text for label in labels):
            continue

        chunks: list[str] = []
        for sibling in heading.find_next_siblings():
            if sibling.name and re.match(r"^h[1-6]$", sibling.name):
                break
            text = _clean_text(sibling.get_text("\n"))
            if text:
                chunks.append(text)
        return "\n\n".join(chunks) or None
    return None


def _dependencies(soup: BeautifulSoup, page_text: str) -> list[dict[str, str | None]]:
    linked_dependencies = _linked_dependencies(soup)
    if linked_dependencies:
        return linked_dependencies

    dependency_text = _section_after_heading(soup, ["dependencies", "required addons"])
    if not dependency_text:
        match = re.search(r"dependencies\s*:?\s*(.+)", page_text, flags=re.IGNORECASE)
        dependency_text = match.group(1) if match else ""
    values = [_clean_text(item) for item in re.split(r"[,;\n]", dependency_text)]
    return [{"name": value, "url": None} for value in values if value and len(value) <= 120]


def _linked_dependencies(soup: BeautifulSoup) -> list[dict[str, str | None]]:
    headings = soup.find_all(re.compile(r"^h[1-6]$"))
    for heading in headings:
        heading_text = _clean_text(heading.get_text(" ")).lower()
        if "dependencies" not in heading_text and "required addons" not in heading_text:
            continue

        container = heading.parent
        links = container.find_all("a", href=True) if container else []
        dependencies: list[dict[str, str | None]] = []
        for link in links:
            href = str(link.get("href", ""))
            name = _clean_text(link.get_text(" "))
            if not name or "/workshop/" not in href:
                continue
            dependencies.append({"name": name, "url": urljoin("https://reforger.armaplatform.com", href)})
        if dependencies:
            return dependencies
    return []


def _clean_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", value)).strip()


def _clean_changelog_text(value: str | None) -> str | None:
    text = _clean_text(value)
    if not text:
        return None

    lines = [_clean_text(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    first_version_index = next((index for index, line in enumerate(lines) if _looks_like_version(line)), None)
    if first_version_index is not None:
        lines = lines[first_version_index:]

    cleaned: list[str] = []
    skip_next_metadata_value = False
    skip_pagination = False
    metadata_labels = {"game version", "created", "last modified"}
    ui_labels = {
        "back to workshop",
        "info",
        "scenarios",
        "changelog",
        "rows per page",
        "showing",
        "to",
        "of",
        "results",
    }

    for line in lines:
        lowered = line.lower()

        if skip_next_metadata_value:
            skip_next_metadata_value = False
            continue

        if lowered in metadata_labels:
            skip_next_metadata_value = True
            continue

        if lowered.startswith("showing "):
            skip_pagination = True
            continue

        if skip_pagination:
            if lowered == "rows per page":
                skip_pagination = False
            continue

        if lowered in ui_labels or line.isdigit():
            continue

        cleaned.append(line)

    return "\n".join(cleaned).strip() or None


def _looks_like_version(value: str) -> bool:
    return bool(re.match(r"^v?\d+(?:[._-]\d+)+(?:[A-Za-z0-9._+-]*)?$", value.strip()))


def _strip_suffix(value: str | None) -> str | None:
    if not value:
        return None
    return re.sub(r"\s*[-|]\s*Arma Reforger.*$", "", value).strip()
