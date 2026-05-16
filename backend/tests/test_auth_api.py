from fastapi.testclient import TestClient

from app import main as app_main
from app.auth import authenticate_user
from tests.support import ApiTestCase


class AuthApiTestCase(ApiTestCase):
    def test_auth_login_logout_flow(self) -> None:
        with TestClient(app_main.app) as client:
            login_response = client.post("/auth/login", json={"username": "admin", "password": "very-secure-admin-pass"})
            self.assertEqual(login_response.status_code, 200)
            self.assertIn("armm_session", login_response.headers.get("set-cookie", ""))
            self.assertEqual(login_response.json()["theme_preference"], "dark")

            session_response = client.get("/auth/me")
            self.assertEqual(session_response.status_code, 200)
            self.assertEqual(session_response.json()["username"], "admin")
            self.assertEqual(session_response.json()["theme_preference"], "dark")

            logout_response = client.post("/auth/logout")
            self.assertEqual(logout_response.status_code, 204)
            self.assertIn("Max-Age=0", logout_response.headers.get("set-cookie", ""))

            session_after_logout = client.get("/auth/me")
            self.assertEqual(session_after_logout.status_code, 401)

    def test_auth_login_username_is_case_insensitive(self) -> None:
        with TestClient(app_main.app) as client:
            login_response = client.post("/auth/login", json={"username": "ADMIN", "password": "very-secure-admin-pass"})
            self.assertEqual(login_response.status_code, 200, login_response.text)
            self.assertEqual(login_response.json()["username"], "admin")

    def test_authenticate_user_helper_username_is_case_insensitive(self) -> None:
        with self.SessionLocal() as db:
            user = authenticate_user(db, "ADMIN", "very-secure-admin-pass")
            self.assertIsNotNone(user)

    def test_auth_theme_preference_update(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            update_response = client.patch("/auth/theme", json={"theme_preference": "dark"})
            self.assertEqual(update_response.status_code, 200, update_response.text)
            self.assertEqual(update_response.json()["theme_preference"], "dark")

            session_response = client.get("/auth/me")
            self.assertEqual(session_response.status_code, 200, session_response.text)
            self.assertEqual(session_response.json()["theme_preference"], "dark")

    def test_admin_password_reset_revokes_existing_session(self) -> None:
        target = self._create_user("revoked.user", "very-secure-user-pass", role="user")

        with TestClient(app_main.app) as admin_client, TestClient(app_main.app) as user_client:
            self.login_admin(admin_client)
            login_response = user_client.post("/auth/login", json={"username": "revoked.user", "password": "very-secure-user-pass"})
            self.assertEqual(login_response.status_code, 200, login_response.text)

            reset_response = admin_client.patch(f"/users/{target.id}/password", json={"password": "new-very-secure-user-pass"})
            self.assertEqual(reset_response.status_code, 200, reset_response.text)

            revoked_session = user_client.get("/auth/me")
            self.assertEqual(revoked_session.status_code, 401, revoked_session.text)

    def test_admin_role_change_revokes_existing_session(self) -> None:
        target = self._create_user("role.revoked", "very-secure-user-pass", role="user")

        with TestClient(app_main.app) as admin_client, TestClient(app_main.app) as user_client:
            self.login_admin(admin_client)
            login_response = user_client.post("/auth/login", json={"username": "role.revoked", "password": "very-secure-user-pass"})
            self.assertEqual(login_response.status_code, 200, login_response.text)

            update_response = admin_client.patch(f"/users/{target.id}", json={"role": "admin"})
            self.assertEqual(update_response.status_code, 200, update_response.text)

            revoked_session = user_client.get("/auth/me")
            self.assertEqual(revoked_session.status_code, 401, revoked_session.text)
