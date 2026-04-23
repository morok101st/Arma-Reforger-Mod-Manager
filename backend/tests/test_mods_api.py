from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import main as app_main
from app.models import AuditLog
from app.schema_enums import ModStatus, TrackingReason
from app.schemas_mods import ModRead, RefreshResult
from tests.support import ApiTestCase


class ModsApiTestCase(ApiTestCase):
    def test_mod_routes_and_audit_log_with_mocked_services(self) -> None:
        sample_mod = ModRead(
            id="MOD123",
            name="Tracked Mod",
            summary=None,
            description=None,
            latest_version="1.2.0",
            game_version=None,
            size=None,
            dependencies=[],
            dependents=[],
            source_url="https://example.invalid/workshop/MOD123",
            last_checked=datetime.now(timezone.utc),
            current_version="1.0.0",
            pinned=False,
            tracking_reason=TrackingReason.manual,
            status=ModStatus.update_available,
            versions=[],
        )
        updated_mod = sample_mod.model_copy(update={"current_version": "1.2.0", "status": ModStatus.up_to_date})

        with TestClient(app_main.app) as client:
            self.login_admin(client)
            with (
                patch("app.routers.mods.create_mod", autospec=True, return_value=sample_mod),
                patch("app.routers.mods.list_mods", autospec=True, return_value=[sample_mod]),
                patch("app.routers.mods.get_mod_read", autospec=True, return_value=sample_mod),
                patch("app.routers.mods.update_user_mod", autospec=True, return_value=updated_mod),
                patch("app.routers.mods.refresh_all_mods", autospec=True, return_value=RefreshResult(refreshed=1, failed={})),
            ):
                create_response = client.post("/mods", json={"id": "MOD123", "current_version": "1.0.0", "pinned": False})
                self.assertEqual(create_response.status_code, 201)
                self.assertEqual(create_response.json()["name"], "Tracked Mod")

                list_response = client.get("/mods")
                self.assertEqual(list_response.status_code, 200)
                self.assertEqual(len(list_response.json()), 1)

                update_response = client.patch("/mods/MOD123", json={"current_version": "1.2.0"})
                self.assertEqual(update_response.status_code, 200)
                self.assertEqual(update_response.json()["current_version"], "1.2.0")

                refresh_all_response = client.post("/refresh")
                self.assertEqual(refresh_all_response.status_code, 200)
                self.assertEqual(refresh_all_response.json()["refreshed"], 1)

            with self.SessionLocal() as db:
                actions = [row.action for row in db.query(AuditLog).order_by(AuditLog.id).all()]
                self.assertIn("mod_created", actions)
                self.assertIn("mod_updated", actions)
                self.assertIn("mods_refreshed", actions)
