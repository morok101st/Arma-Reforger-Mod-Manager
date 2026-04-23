from fastapi.testclient import TestClient

from app import main as app_main
from tests.support import ApiTestCase


class AuthApiTestCase(ApiTestCase):
    def test_auth_login_logout_flow(self) -> None:
        with TestClient(app_main.app) as client:
            login_response = client.post("/auth/login", json={"username": "admin", "password": "very-secure-admin-pass"})
            self.assertEqual(login_response.status_code, 200)
            self.assertIn("armm_session", login_response.headers.get("set-cookie", ""))

            session_response = client.get("/auth/me")
            self.assertEqual(session_response.status_code, 200)
            self.assertEqual(session_response.json()["username"], "admin")

            logout_response = client.post("/auth/logout")
            self.assertEqual(logout_response.status_code, 204)
            self.assertIn("Max-Age=0", logout_response.headers.get("set-cookie", ""))

            session_after_logout = client.get("/auth/me")
            self.assertEqual(session_after_logout.status_code, 401)
