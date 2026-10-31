from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.exc import IntegrityError

from app import main as app_main
from app.auth import verify_password
from app.models import AuditLog, Group, GroupMembership, User
from tests.support import ApiTestCase


class AtomicUserUpdateTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.user_id = self._create_user("member", "original-password").id
        with self.SessionLocal() as db:
            first, second = Group(name="First"), Group(name="Second")
            db.add_all([first, second])
            db.flush()
            self.first, self.second = first.id, second.id
            db.add(GroupMembership(user_id=self.user_id, group_id=self.first))
            db.commit()

    def snapshot(self, user_id=None):
        with self.SessionLocal() as db:
            user = db.get(User, user_id or self.user_id)
            return (user.role, user.is_active, user.password_hash, user.session_version,
                    sorted(m.group_id for m in user.group_memberships))

    def test_combined_update_and_single_session_revocation(self):
        before = self.snapshot()
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            response = client.patch(f"/users/{self.user_id}", json={
                "role": "admin", "is_active": False, "password": "replacement-password",
                "group_ids": [self.first, self.second],
            })
            self.assertEqual(response.status_code, 200, response.text)
        after = self.snapshot()
        self.assertEqual(after[:2], ("admin", False))
        self.assertTrue(verify_password("replacement-password", after[2]))
        self.assertEqual(after[3], before[3] + 1)
        self.assertEqual(after[4], [self.first, self.second])
        with self.SessionLocal() as db:
            logs = db.scalars(select(AuditLog).where(AuditLog.action == "user_updated")).all()
            self.assertEqual(len(logs), 1)
            self.assertTrue(logs[0].detail["groups_changed"])
            self.assertTrue(logs[0].detail["password_changed"])
            self.assertNotIn("replacement-password", str(logs[0].detail))

    def test_validation_leaves_everything_unchanged(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            for extra, expected in [({"group_ids": [999999]}, 400),
                                    ({"group_ids": None}, 422),
                                    ({"group_ids": [self.second, self.second]}, 422),
                                    ({"group_ids": [self.second], "password": "short"}, 422)]:
                with self.subTest(extra=extra):
                    before = self.snapshot()
                    payload = {"role": "admin", "password": "replacement-password", **extra}
                    response = client.patch(f"/users/{self.user_id}", json=payload)
                    self.assertEqual(response.status_code, expected, response.text)
                    self.assertEqual(self.snapshot(), before)

    def test_audit_failure_rolls_back_staged_account_and_memberships(self):
        before = self.snapshot()
        with TestClient(app_main.app, raise_server_exceptions=False) as client:
            self.login_admin(client)
            with patch("app.routers.admin.audit_event", side_effect=RuntimeError("audit unavailable")):
                response = client.patch(f"/users/{self.user_id}", json={
                    "role": "admin", "password": "replacement-password", "group_ids": [self.second],
                })
            self.assertEqual(response.status_code, 500)
        self.assertEqual(self.snapshot(), before)

    def test_database_failure_rolls_back_all_changes(self):
        before = self.snapshot()
        def reject_commit(session):
            # Flush first so rollback must undo actual account and membership writes.
            session.flush()
            raise IntegrityError("injected failure", {}, Exception("test constraint"))

        with TestClient(app_main.app) as client:
            self.login_admin(client)
            event.listen(self.SessionLocal.class_, "before_commit", reject_commit, once=True)
            try:
                response = client.patch(f"/users/{self.user_id}", json={
                    "role": "admin", "is_active": False, "password": "replacement-password",
                    "group_ids": [self.second],
                })
                self.assertEqual(response.status_code, 409, response.text)
            finally:
                event.remove(self.SessionLocal.class_, "before_commit", reject_commit)
        self.assertEqual(self.snapshot(), before)
        with self.SessionLocal() as db:
            self.assertEqual(db.scalars(select(AuditLog).where(AuditLog.action == "user_updated")).all(), [])

    def test_omitted_memberships_preserved_and_empty_list_clears(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            response = client.patch(f"/users/{self.user_id}", json={"role": "admin"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(self.snapshot()[4], [self.first])
            version = self.snapshot()[3]
            response = client.patch(f"/users/{self.user_id}", json={"group_ids": []})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(self.snapshot()[4], [])
            self.assertEqual(self.snapshot()[3], version)

    def test_self_disable_and_last_admin_demotion_are_atomic(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            for change in [{"is_active": False}, {"role": "user"}]:
                before = self.snapshot(1)
                response = client.patch("/users/1", json={
                    **change, "group_ids": [self.second], "password": "replacement-password",
                })
                self.assertEqual(response.status_code, 400, response.text)
                self.assertEqual(self.snapshot(1), before)

    def test_regular_user_cannot_update_account(self):
        before = self.snapshot()
        with TestClient(app_main.app) as client:
            response = client.post("/auth/login", json={"username": "member", "password": "original-password"})
            self.assertEqual(response.status_code, 200)
            response = client.patch(f"/users/{self.user_id}", json={"group_ids": [], "role": "admin"})
            self.assertEqual(response.status_code, 403)
        self.assertEqual(self.snapshot(), before)
