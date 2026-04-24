from fastapi.testclient import TestClient

from app import main as app_main
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
