from __future__ import annotations

import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import main as app_main
from app.auth import hash_password
from app.database import Base, get_db
from app.login_protection import _failed_logins
from app.models import AuditLog, User
from app.schemas import ModRead, ModStatus, RefreshResult, TrackingReason, UserModUpdate, UserRole


class DummyScheduler:
    def shutdown(self, wait: bool = False) -> None:
        return None


class ApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tempdir.name) / "test.db"
        self.engine = create_engine(f"sqlite:///{self.db_path}", connect_args={"check_same_thread": False})
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(self.engine)

        self.settings_patcher = patch(
            "app.auth.get_settings",
            return_value=SimpleNamespace(
                armm_secret_key="test-secret",
                is_production=False,
                workshop_base_url="https://example.invalid/workshop",
            ),
        )
        self.session_settings_patcher = patch(
            "app.session_auth.get_settings",
            return_value=SimpleNamespace(
                armm_secret_key="test-secret",
                is_production=False,
                workshop_base_url="https://example.invalid/workshop",
            ),
        )
        self.bootstrap_settings_patcher = patch(
            "app.admin_bootstrap.get_settings",
            return_value=SimpleNamespace(
                armm_secret_key="test-secret",
                is_production=False,
                armm_admin_username="admin",
                armm_admin_password="very-secure-admin-pass",
                workshop_base_url="https://example.invalid/workshop",
            ),
        )
        self.main_engine_patcher = patch.object(app_main, "engine", self.engine)
        self.main_session_patcher = patch.object(app_main, "SessionLocal", self.SessionLocal)
        self.main_scheduler_patcher = patch.object(app_main, "start_scheduler", return_value=DummyScheduler())

        self.settings_patcher.start()
        self.session_settings_patcher.start()
        self.bootstrap_settings_patcher.start()
        self.main_engine_patcher.start()
        self.main_session_patcher.start()
        self.main_scheduler_patcher.start()
        _failed_logins.clear()

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app_main.app.dependency_overrides[get_db] = override_get_db
        self._create_user("admin", "very-secure-admin-pass", role="admin")

    def tearDown(self) -> None:
        app_main.app.dependency_overrides.clear()
        self.main_scheduler_patcher.stop()
        self.main_session_patcher.stop()
        self.main_engine_patcher.stop()
        self.bootstrap_settings_patcher.stop()
        self.session_settings_patcher.stop()
        self.settings_patcher.stop()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()
        self.tempdir.cleanup()

    def _create_user(self, username: str, password: str, *, role: str = "user", is_active: bool = True) -> User:
        with self.SessionLocal() as db:
            user = User(
                username=username,
                password_hash=hash_password(password),
                role=role,
                is_active=is_active,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            return user

    def _login_admin(self, client: TestClient) -> None:
        response = client.post("/auth/login", json={"username": "admin", "password": "very-secure-admin-pass"})
        self.assertEqual(response.status_code, 200)

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

    def test_admin_user_creation_and_audit_log(self) -> None:
        with TestClient(app_main.app) as client:
            self._login_admin(client)

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
            self._login_admin(client)
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


if __name__ == "__main__":
    unittest.main()
