from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch

from app import main as app_main
from app.auth import authenticate_user
from app.models import User
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

    def test_auth_config_reports_oidc_disabled_by_default(self) -> None:
        with TestClient(app_main.app) as client:
            response = client.get("/auth/config")
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json(), {"local_login_enabled": True, "oidc_enabled": False})

    def test_oidc_login_redirects_when_configured(self) -> None:
        with (
            patch("app.routers.auth.oidc_is_configured", return_value=True),
            patch("app.routers.auth.build_authorization_redirect", new=AsyncMock(return_value="https://issuer.example/authorize")),
            TestClient(app_main.app) as client,
        ):
            response = client.get("/auth/oidc/login", follow_redirects=False)
            self.assertEqual(response.status_code, 302, response.text)
            self.assertEqual(response.headers["location"], "https://issuer.example/authorize")

    def test_oidc_callback_sets_local_session_cookie(self) -> None:
        with self.SessionLocal() as db:
            user = User(username="oidc.user", password_hash=None, role="user", is_active=True, oidc_issuer="https://issuer.example", oidc_subject="sub-1")
            db.add(user)
            db.commit()
            db.refresh(user)
            user_id = user.id

        async def fake_callback(request, response, db):
            return db.get(User, user_id), True

        with (
            patch("app.routers.auth.handle_oidc_callback", new=fake_callback),
            TestClient(app_main.app) as client,
        ):
            response = client.get("/auth/oidc/callback?code=abc&state=state", follow_redirects=False)
            self.assertEqual(response.status_code, 303, response.text)
            self.assertIn("armm_session", response.headers.get("set-cookie", ""))

            session_response = client.get("/auth/me")
            self.assertEqual(session_response.status_code, 200, session_response.text)
            self.assertEqual(session_response.json()["username"], "oidc.user")
            self.assertEqual(session_response.json()["auth_provider"], "oidc")
            self.assertFalse(session_response.json()["has_local_password"])

    def test_oidc_only_user_cannot_use_local_password_change(self) -> None:
        with self.SessionLocal() as db:
            user = User(username="oidc.only", password_hash=None, role="user", is_active=True, oidc_issuer="https://issuer.example", oidc_subject="sub-2")
            db.add(user)
            db.commit()
            db.refresh(user)
            user_id = user.id

        async def fake_callback(request, response, db):
            return db.get(User, user_id), False

        with (
            patch("app.routers.auth.handle_oidc_callback", new=fake_callback),
            TestClient(app_main.app) as client,
        ):
            login_response = client.get("/auth/oidc/callback?code=abc&state=state", follow_redirects=False)
            self.assertEqual(login_response.status_code, 303, login_response.text)

            change_response = client.patch(
                "/auth/password",
                json={"current_password": "unused-password", "new_password": "new-very-secure-password"},
            )
            self.assertEqual(change_response.status_code, 400, change_response.text)

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
