from fastapi.testclient import TestClient

from app import main as app_main
from app.models import Mod, UserMod
from tests.support import ApiTestCase


class ModsetsApiTestCase(ApiTestCase):
    def test_modset_crud_and_activate_flow(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            initial = client.get("/modsets")
            self.assertEqual(initial.status_code, 200)
            initial_data = initial.json()
            self.assertGreaterEqual(len(initial_data), 1)
            default_id = initial_data[0]["id"]

            created = client.post("/modsets", json={"name": "Server A"})
            self.assertEqual(created.status_code, 201)
            modset_id = created.json()["id"]

            renamed = client.patch(f"/modsets/{modset_id}", json={"name": "Server Bravo"})
            self.assertEqual(renamed.status_code, 200)
            self.assertEqual(renamed.json()["name"], "Server Bravo")

            activated = client.post(f"/modsets/{modset_id}/activate")
            self.assertEqual(activated.status_code, 200)
            self.assertEqual(activated.json()["active_modset_id"], modset_id)

            deleted = client.delete(f"/modsets/{modset_id}")
            self.assertEqual(deleted.status_code, 200)
            self.assertEqual(deleted.json()["active_modset_id"], default_id)

            after = client.get("/modsets")
            self.assertEqual(after.status_code, 200)
            after_ids = [entry["id"] for entry in after.json()]
            self.assertIn(default_id, after_ids)
            self.assertNotIn(modset_id, after_ids)

    def test_delete_non_empty_modset_is_blocked(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            created = client.post("/modsets", json={"name": "Server C"})
            self.assertEqual(created.status_code, 201)
            modset_id = created.json()["id"]

            activated = client.post(f"/modsets/{modset_id}/activate")
            self.assertEqual(activated.status_code, 200)

            with self.SessionLocal() as db:
                db.add(Mod(id="MOD123", name="Test Mod"))
                db.add(UserMod(modset_id=modset_id, mod_id="MOD123", current_version=None, pinned=False, tracking_reason="manual"))
                db.commit()

            delete_response = client.delete(f"/modsets/{modset_id}")
            self.assertEqual(delete_response.status_code, 400)
            self.assertIn("Cannot delete modset with tracked mods", delete_response.json().get("detail", ""))

    def test_export_modset_returns_mod_config_shape(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            created = client.post("/modsets", json={"name": "Server Export"})
            self.assertEqual(created.status_code, 201)
            modset_id = created.json()["id"]

            with self.SessionLocal() as db:
                db.add(Mod(id="664AFDC993C9CE1A", name="ACE Cook-Off Dev"))
                db.add(Mod(id="65EB440190E0B2DF", name="COE2 Ruha"))
                db.add(UserMod(modset_id=modset_id, mod_id="664AFDC993C9CE1A", current_version=None, pinned=False, tracking_reason="manual"))
                db.add(UserMod(modset_id=modset_id, mod_id="65EB440190E0B2DF", current_version=None, pinned=False, tracking_reason="manual"))
                db.commit()

            response = client.get(f"/modsets/{modset_id}/export")
            self.assertEqual(response.status_code, 200)
            payload = response.json()
            self.assertIn("mods", payload)
            self.assertEqual(
                payload["mods"],
                [
                    {"modId": "664AFDC993C9CE1A", "name": "ACE Cook-Off Dev"},
                    {"modId": "65EB440190E0B2DF", "name": "COE2 Ruha"},
                ],
            )
