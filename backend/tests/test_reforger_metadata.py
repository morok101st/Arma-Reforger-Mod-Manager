from __future__ import annotations

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from app.reforger_metadata import ReforgerMetadataError, ReforgerMetadataServiceClient, _mod_from_payload
from app.scraper import ScrapedMod, ScrapedModVersion
from app.workshop_provider import HybridWorkshopMetadataProvider


class ReforgerMetadataTestCase(unittest.IsolatedAsyncioTestCase):
    def test_mod_from_payload_reads_version_and_dependencies(self) -> None:
        mod = _mod_from_payload(
            {
                "id": "60ed3cc6e7e40221",
                "name": "Sikorsky H60 Project",
                "latest_version": "1.2.3",
                "changelog": "Changed rotor behavior.",
                "dependencies": [
                    {"id": "AUSCORE001", "name": "AUS_CORE"},
                    "DEPENDENCY02",
                ],
            },
            "https://reforger.armaplatform.com/workshop",
        )

        self.assertEqual(mod.id, "60ED3CC6E7E40221")
        self.assertEqual(mod.name, "Sikorsky H60 Project")
        self.assertEqual(mod.latest_version, "1.2.3")
        self.assertEqual(mod.changelog, "Changed rotor behavior.")
        self.assertEqual(mod.versions[0].version, "1.2.3")
        self.assertEqual(
            mod.dependencies,
            [
                {"name": "AUS_CORE", "url": None, "id": "AUSCORE001"},
                {"name": "DEPENDENCY02", "url": None, "id": "DEPENDENCY02"},
            ],
        )

    async def test_fetch_mod_calls_metadata_service(self) -> None:
        server = _start_test_server(
            {
                "mods": [
                    {
                        "id": "660E395AD366D1F7",
                        "name": "Probe Mod",
                        "latest_version": "2.0.0",
                        "dependencies": [],
                    }
                ]
            }
        )
        try:
            host, port = server.server_address
            client = ReforgerMetadataServiceClient(
                f"http://{host}:{port}",
                workshop_base_url="https://reforger.armaplatform.com/workshop",
                timeout_seconds=5,
            )
            mod = await client.fetch_mod("660E395AD366D1F7")
        finally:
            server.shutdown()
            server.server_close()

        self.assertEqual(mod.id, "660E395AD366D1F7")
        self.assertEqual(mod.name, "Probe Mod")
        self.assertEqual(mod.latest_version, "2.0.0")

    async def test_fetch_mod_raises_when_metadata_is_missing(self) -> None:
        server = _start_test_server({"mods": []})
        try:
            host, port = server.server_address
            client = ReforgerMetadataServiceClient(
                f"http://{host}:{port}",
                workshop_base_url="https://reforger.armaplatform.com/workshop",
                timeout_seconds=5,
            )
            with self.assertRaisesRegex(ReforgerMetadataError, "did not return mod"):
                await client.fetch_mod("660E395AD366D1F7")
        finally:
            server.shutdown()
            server.server_close()

    async def test_hybrid_provider_uses_reforger_only_for_latest_version(self) -> None:
        provider = HybridWorkshopMetadataProvider(
            _FakeScraper(
                ScrapedMod(
                    id="64F0EB575E3F64E2",
                    name="101st Airborne Faction",
                    latest_version="0.4.1",
                    changelog="Scraped changelog",
                    dependencies=[{"id": "DEP001", "name": "Scraped Dependency", "url": None}],
                    versions=[ScrapedModVersion(version="0.4.1", changelog="Scraped changelog")],
                    source_url="https://reforger.armaplatform.com/workshop/64F0EB575E3F64E2",
                )
            ),
            _FakeReforger({"64F0EB575E3F64E2": ScrapedMod(id="64F0EB575E3F64E2", latest_version="0.4.2", dependencies=[])}),
        )

        mod = await provider.fetch_mod("64F0EB575E3F64E2")

        self.assertEqual(mod.latest_version, "0.4.2")
        self.assertEqual(mod.changelog, "Scraped changelog")
        self.assertEqual(mod.dependencies, [{"id": "DEP001", "name": "Scraped Dependency", "url": None}])
        self.assertEqual([version.version for version in mod.versions], ["0.4.2", "0.4.1"])


class _Handler(BaseHTTPRequestHandler):
    response_payload: dict[str, Any] = {"mods": []}

    def do_POST(self) -> None:
        self.rfile.read(int(self.headers.get("Content-Length", "0")))
        body = json.dumps(self.response_payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        return


def _start_test_server(response_payload: dict[str, Any]) -> ThreadingHTTPServer:
    handler = type("TestMetadataHandler", (_Handler,), {"response_payload": response_payload})
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


class _FakeScraper:
    def __init__(self, mod: ScrapedMod) -> None:
        self.mod = mod

    async def fetch_mod(self, mod_id: str) -> ScrapedMod:
        return self.mod


class _FakeReforger:
    def __init__(self, mods: dict[str, ScrapedMod]) -> None:
        self.mods = mods

    async def fetch_mods(self, mod_ids: list[str]) -> dict[str, ScrapedMod]:
        return self.mods


if __name__ == "__main__":
    unittest.main()
