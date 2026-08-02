from __future__ import annotations

import tempfile
import unittest
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
from app.models import User


def test_settings(**overrides):
    values = {
        "armm_secret_key": "test-secret",
        "is_production": False,
        "workshop_base_url": "https://example.invalid/workshop",
        "armm_public_url": "http://testserver",
        "oidc_enabled": False,
        "oidc_issuer_url": None,
        "oidc_client_id": None,
        "oidc_client_secret": None,
        "oidc_redirect_uri": None,
        "oidc_scopes": "openid email profile",
        "oidc_scope_list": ["openid", "email", "profile"],
        "oidc_username_claim": "preferred_username",
        "oidc_email_claim": "email",
        "effective_oidc_redirect_uri": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class DummyScheduler:
    def get_job(self, job_id: str):
        return None

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
            return_value=test_settings(),
        )
        self.session_settings_patcher = patch(
            "app.session_auth.get_settings",
            return_value=test_settings(),
        )
        self.oidc_settings_patcher = patch("app.oidc.get_settings", return_value=test_settings())
        self.bootstrap_settings_patcher = patch(
            "app.admin_bootstrap.get_settings",
            return_value=test_settings(armm_admin_username="admin", armm_admin_password="very-secure-admin-pass"),
        )
        self.main_engine_patcher = patch.object(app_main, "engine", self.engine)
        self.main_session_patcher = patch.object(app_main, "SessionLocal", self.SessionLocal)
        self.main_scheduler_patcher = patch.object(app_main, "start_scheduler", return_value=DummyScheduler())

        self.settings_patcher.start()
        self.session_settings_patcher.start()
        self.oidc_settings_patcher.start()
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
        self.oidc_settings_patcher.stop()
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

    def login_admin(self, client: TestClient) -> None:
        response = client.post("/auth/login", json={"username": "admin", "password": "very-secure-admin-pass"})
        self.assertEqual(response.status_code, 200)
