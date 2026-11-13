from pathlib import Path
from types import SimpleNamespace
import asyncio
import unittest
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app import main as app_main
from app.mod_size import normalize_mod_size
from app.models import Mod, UserMod
from app.scraper import ScrapedMod, WorkshopScraper
from app.services import fetch_and_upsert_mods
from tests.support import ApiTestCase


class ModSizeScraperTestCase(unittest.TestCase):
    def parse(self, html):
        return WorkshopScraper("https://example.invalid/workshop")._parse_detail(
            "59CF333B3A309D6E", "https://example.invalid/workshop/59CF333B3A309D6E", html,
        )

    def test_mussalo_description_does_not_override_version_size(self):
        html = (Path(__file__).parent / "fixtures" / "mussalo-size.html").read_text()
        mod = self.parse(html)
        self.assertEqual(mod.size, "676.99 MB")
        self.assertEqual(mod.latest_version, "0.9.71")
        self.assertEqual(mod.game_version, "1.8.0.13")
        self.assertEqual(mod.name, "Mussalo")

    def test_accepts_only_complete_supported_unit_values(self):
        for value, expected in [
            ("0 B", "0 B"), ("1.5 KB", "1.5 KB"), (" 1,25 mb ", "1.25 MB"),
            ("2 GB", "2 GB"), ("1 TB", "1 TB"), ("1 KiB", "1 KiB"),
            ("2 MiB", "2 MiB"), ("1 GiB", "1 GiB"), ("1 TiB", "1 TiB"),
            ("1\u00a0MB", "1 MB"),
        ]:
            with self.subTest(value=value):
                self.assertEqual(normalize_mod_size(value), expected)
        for value in [None, "", "Unknown", "12345", "-2 MB", "1,234.56 MB", "1.2.3 GB",
                      "Infinity B", "3 GB extra", "1 PB", "999999999999 TB",
                      "of the playable area is about 6", "6,4 km x 6,4 km", "1" * 81 + " B"]:
            with self.subTest(value=value):
                self.assertIsNone(normalize_mod_size(value))

    def test_exact_structured_aliases_and_tables(self):
        for label in ["Version size", "File size", "Size", " VERSION SIZE "]:
            for label_tag, value_tag in [("dt", "dd"), ("th", "td")]:
                with self.subTest(label=label, tag=label_tag):
                    html = f"<{label_tag}>{label}</{label_tag}><{value_tag}>1,5 MiB</{value_tag}>"
                    self.assertEqual(self.parse(html).size, "1.5 MiB")

    def test_invalid_candidate_does_not_hide_later_valid_metadata(self):
        html = "<dt>Size</dt><dd>999 GB</dd><dt>Version size</dt><dd>bad</dd><dt>Version size</dt><dd>2 MB</dd>"
        self.assertEqual(self.parse(html).size, "2 MB")
        html = "<dt>Version size</dt><dd>-1 MB</dd><dt>File size</dt><dd>0 B</dd>"
        self.assertEqual(self.parse(html).size, "0 B")

    def test_prose_missing_or_malformed_metadata_stays_unknown(self):
        for html in [
            "<p>The size is 2 GB</p>", "<p>Size: 2 GB</p>",
            "<dt>Download size estimate</dt><dd>2 GB</dd>",
            "<dt>Size</dt><dd>of the playable area is about 6</dd>",
            "<dt>Version size</dt><dd>123456</dd>",
            "<dt>Size</dt><dt>Other field</dt><dd>2 GB</dd>",
            "<dt>Size</dt><div>2 GB</div>", "<dt>Size</dt>", "",
        ]:
            with self.subTest(html=html):
                self.assertIsNone(self.parse(html).size)


class ModSizeRefreshTestCase(ApiTestCase):
    def test_successful_fetch_repairs_sizes_and_api_exposes_result(self):
        cases = [
            ("of the playable area is about 6", "676.99 MB", "676.99 MB"),
            ("of the playable area is about 6", None, None),
            ("bad cached value", "bad incoming value", None),
            ("1 GiB", None, "1 GiB"),
            ("1 GiB", "bad incoming value", "1 GiB"),
            ("1 GiB", "0 B", "0 B"),
            (None, " 1,25 mb ", "1.25 MB"),
            (None, None, None),
        ]
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            response = client.post("/modsets", json={"name": "Size regression"})
            self.assertEqual(response.status_code, 201, response.text)
            modset_id = response.json()["id"]
            for index, (cached, incoming, expected) in enumerate(cases):
                with self.subTest(cached=cached, incoming=incoming):
                    mod_id = f"SIZE{index:03d}"
                    with self.SessionLocal() as db:
                        db.add(Mod(id=mod_id, size=cached, dependencies=[]))
                        db.add(UserMod(modset_id=modset_id, mod_id=mod_id, current_version="1.0"))
                        db.commit()
                        provider = SimpleNamespace(fetch_mod=AsyncMock(return_value=ScrapedMod(id=mod_id, size=incoming)))
                        asyncio.run(fetch_and_upsert_mods(db, provider, [mod_id]))
                        self.assertEqual(db.get(Mod, mod_id).size, expected)
                    response = client.get(f"/mods/{mod_id}?modset_id={modset_id}")
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.json()["size"], expected)

    def test_failed_fetch_does_not_change_cached_metadata(self):
        for cached in ["1 GiB", "of the playable area is about 6"]:
            with self.subTest(cached=cached), self.SessionLocal() as db:
                mod_id = "FAILED001" if cached == "1 GiB" else "FAILED002"
                db.add(Mod(id=mod_id, size=cached, latest_version="1.0", dependencies=[]))
                db.commit()
                provider = SimpleNamespace(fetch_mod=AsyncMock(side_effect=RuntimeError("Workshop unavailable")))
                with self.assertRaisesRegex(RuntimeError, "Workshop unavailable"):
                    asyncio.run(fetch_and_upsert_mods(db, provider, [mod_id]))
                db.expire_all()
                mod = db.get(Mod, mod_id)
                self.assertEqual(mod.size, cached)
                self.assertEqual(mod.latest_version, "1.0")
                self.assertIsNone(mod.last_checked)
