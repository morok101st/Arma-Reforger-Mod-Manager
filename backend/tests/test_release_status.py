import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import require_current_user
from app.release_status import AvailableUpdate, ReleaseChecker
from app.routers.system import router


class ReleaseCheckerTests(unittest.IsolatedAsyncioTestCase):
    async def test_newer_stable_release_is_reused_during_cache_lifetime(self):
        clock = [10.0]
        requests = []

        def github(request):
            requests.append(request)
            return httpx.Response(200, json={"tag_name": "v0.2.10"})

        client = httpx.AsyncClient(transport=httpx.MockTransport(github))
        checker = ReleaseChecker()
        with (
            patch("app.release_status.BUILD_VERSION", "0.2.9"),
            patch("app.release_status.monotonic", side_effect=lambda: clock[0]),
            patch("app.release_status.httpx.AsyncClient", return_value=client),
        ):
            first = await checker.available_update()
            clock[0] += 6 * 60 * 60 - 1
            self.assertEqual(await checker.available_update(), first)
        self.assertEqual(len(requests), 1)
        self.assertEqual(first.version, "0.2.10")
        self.assertTrue(first.url.endswith("/releases/tag/v0.2.10"))

    async def test_same_old_prerelease_and_unavailable_responses(self):
        cases = [
            httpx.Response(200, json={"tag_name": "v0.2.9"}),
            httpx.Response(200, json={"tag_name": "v0.2.8"}),
            httpx.Response(200, json={"tag_name": "v0.2.10", "prerelease": True}),
            httpx.Response(200, json={"tag_name": "v0.2.10-rc.1"}),
            httpx.Response(403),
        ]
        for response in cases:
            with self.subTest(response=response):
                client = httpx.AsyncClient(transport=httpx.MockTransport(lambda _: response))
                with (
                    patch("app.release_status.BUILD_VERSION", "0.2.9"),
                    patch("app.release_status.httpx.AsyncClient", return_value=client),
                ):
                    self.assertIsNone(await ReleaseChecker().available_update())


class ReleaseStatusApiTests(unittest.TestCase):
    def test_only_admins_on_stable_builds_receive_update(self):
        for role, version, receives_update in (
            ("admin", "0.2.9", True),
            ("user", "0.2.9", False),
            ("admin", "dev", False),
        ):
            with self.subTest(role=role, version=version):
                app = FastAPI()
                app.include_router(router)
                app.dependency_overrides[require_current_user] = lambda: SimpleNamespace(role=role)
                checker = AsyncMock()
                checker.available_update.return_value = AvailableUpdate(version="0.2.10", url="https://example.invalid")
                app.state.release_checker = checker
                with patch("app.routers.system.BUILD_VERSION", version), TestClient(app) as client:
                    response = client.get("/release-status")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.headers["cache-control"], "no-store")
                self.assertEqual(response.json()["version"], version)
                self.assertEqual(response.json()["update"] is not None, receives_update)
                self.assertEqual(checker.available_update.await_count, int(receives_update))
