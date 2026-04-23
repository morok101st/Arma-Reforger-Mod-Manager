from fastapi.testclient import TestClient

from app import main as app_main
from tests.support import ApiTestCase


class AdminApiTestCase(ApiTestCase):
    def test_admin_user_creation_and_audit_log(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            create_response = client.post(
                "/users",
                json={"username": "editor.user", "password": "super-secure-pass", "role": "user"},
            )
            self.assertEqual(create_response.status_code, 201)
            self.assertEqual(create_response.json()["username"], "editor.user")

            users_response = client.get("/users")
            self.assertEqual(users_response.status_code, 200)
            usernames = [user["username"] for user in users_response.json()]
            self.assertIn("editor.user", usernames)

            audit_response = client.get("/audit?limit=10")
            self.assertEqual(audit_response.status_code, 200)
            actions = [entry["action"] for entry in audit_response.json()]
            self.assertIn("user_created", actions)
