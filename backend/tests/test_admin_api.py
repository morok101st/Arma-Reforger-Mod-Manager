from fastapi.testclient import TestClient

from app import main as app_main
from app.models import User
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

    def test_admin_can_delete_user_but_not_self_or_last_active_admin(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            create_response = client.post(
                "/users",
                json={"username": "delete.me", "password": "super-secure-pass", "role": "user"},
            )
            self.assertEqual(create_response.status_code, 201)
            user_id = create_response.json()["id"]

            delete_response = client.delete(f"/users/{user_id}")
            self.assertEqual(delete_response.status_code, 204)

            users_response = client.get("/users")
            self.assertEqual(users_response.status_code, 200)
            usernames = [user["username"] for user in users_response.json()]
            self.assertNotIn("delete.me", usernames)

            audit_response = client.get("/audit?limit=20")
            self.assertEqual(audit_response.status_code, 200)
            actions = [entry["action"] for entry in audit_response.json()]
            self.assertIn("user_deleted", actions)

            self_delete_response = client.delete("/users/1")
            self.assertEqual(self_delete_response.status_code, 400)
            self.assertIn("Cannot delete current user", self_delete_response.json()["detail"])

            last_admin_delete_response = client.delete("/users/1")
            self.assertEqual(last_admin_delete_response.status_code, 400)

    def test_admin_can_delete_inactive_admin(self) -> None:
        second_admin = self._create_user("otheradmin", "very-secure-admin-pass", role="admin")

        with self.SessionLocal() as db:
            target = db.get(User, second_admin.id)
            assert target is not None
            target.is_active = False
            db.commit()

        with TestClient(app_main.app) as client:
            self.login_admin(client)
            delete_response = client.delete(f"/users/{second_admin.id}")
            self.assertEqual(delete_response.status_code, 204)
