import hashlib
import os
import uuid
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, select, text

from app import main as app_main
from app.migrations import _migrate_sync_access, migrate_schema
from app.models import Mod, ModSet, ModsetSyncAccess, User, UserMod, Group, GroupMembership, ModSetGroupPermission
from app.routers.sync import _windows
from tests.support import ApiTestCase


class SyncAccessTestCase(ApiTestCase):
    def setUp(self):
        super().setUp()
        _windows.clear()

    def create(self, client, name="Sync set", **extra):
        response = client.post("/modsets", json={"name": name, **extra})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def issue(self, client, mid):
        response = client.post(f"/modsets/{mid}/sync-access")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")
        return response.json()["access_key"]

    def headers(self, key):
        return {"Authorization": f"Bearer {key}"}

    def test_scoped_export_rotation_disable_and_no_management_access(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            mid = self.create(client)
            other = self.create(client, "Other")
            with self.SessionLocal() as db:
                db.add_all([Mod(id="A", name="Alpha"), Mod(id="B", name="Beta")])
                db.flush()
                db.add_all([UserMod(modset_id=mid, mod_id="A", current_version="1.2"), UserMod(modset_id=mid, mod_id="B", current_version=None)])
                db.commit()
            key = self.issue(client, mid)
            with self.SessionLocal() as db:
                self.assertEqual(db.get(ModsetSyncAccess, mid).key_hash, hashlib.sha256(key.encode()).hexdigest())
            client.cookies.clear()
            path = f"/sync/modsets/{mid}/export"
            self.assertEqual(client.get(path).status_code, 401)
            self.assertEqual(client.get(path, headers=self.headers("armm_sync_bad")).status_code, 401)
            response = client.get(path, headers=self.headers(key))
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json(), [{"modId": "A", "name": "Alpha", "version": "1.2"}])
            self.assertEqual(response.headers["cache-control"], "no-store")
            self.assertEqual(client.get(f"/sync/modsets/{other}/export", headers=self.headers(key)).status_code, 401)
            for url in ["/modsets", "/users", f"/modsets/{mid}/export", f"/modsets/{mid}/sync-access"]:
                self.assertEqual(client.get(url, headers=self.headers(key)).status_code, 401, url)
            self.assertEqual(client.post(f"/modsets/{mid}/sync-access", headers=self.headers(key)).status_code, 401)
            self.login_admin(client)
            status = client.get(f"/modsets/{mid}/sync-access").json()
            self.assertIsNotNone(status["last_used_at"])
            self.assertNotIn("access_key", status)
            replacement = self.issue(client, mid)
            self.assertNotEqual(key, replacement)
            self.assertEqual(client.get(path, headers=self.headers(key)).status_code, 401)
            self.assertEqual(client.get(path, headers=self.headers(replacement)).status_code, 200)
            self.assertEqual(client.delete(f"/modsets/{mid}/sync-access").status_code, 200)
            self.assertEqual(client.get(path, headers=self.headers(replacement)).status_code, 401)

    def test_configuration_contract_and_validation(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            mid = self.create(client)
            key = self.issue(client, mid)
            payload = {"name": "Community", "baseUrl": "https://armm.example.com:8443/", "accessKey": key,
                       "gameServer": {"host": "gameserver.example.com", "port": 2001, "passwordRequired": True}}
            url = f"/modsets/{mid}/sync-configuration"
            response = client.post(url, json=payload)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json(), {"format": "armm-sync", "formatVersion": 1, "name": "Community",
                "armm": {"baseUrl": "https://armm.example.com:8443", "modsetId": mid, "exportPath": f"/api/sync/modsets/{mid}/export", "accessKey": key},
                "gameServer": payload["gameServer"]})
            self.assertIn("armm-sync.json", response.headers["content-disposition"])
            self.assertEqual(response.headers["cache-control"], "no-store")
            del payload["gameServer"]
            self.assertNotIn("gameServer", client.post(url, json=payload).json())
            for bad in ["http://armm.example.com", "https://user:pass@example.com", "https://example.com/api", "https://example.com?key=x", "https://example.com:99999"]:
                self.assertEqual(client.post(url, json={**payload, "baseUrl": bad}).status_code, 422)
            self.assertEqual(client.post(url, json={**payload, "accessKey": "wrong"}).status_code, 409)
            self.assertEqual(client.post(url, json={**payload, "gameServer": {"host":"host", "port":0}}).status_code, 422)
            self.assertEqual(client.post(url, json={**payload, "gameServer": {"host":"host", "port":2001, "password":"secret"}}).status_code, 422)

    def test_child_permissions_versions_order_and_detach_invalidation(self):
        owner = self._create_user("owner", "very-secure-owner-pass")
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            parent = self.create(client, "Parent")
            with self.SessionLocal() as db:
                group = Group(name="Parent readers")
                db.add(group); db.flush()
                group_id = group.id
                db.add_all([GroupMembership(group_id=group_id, user_id=owner.id), ModSetGroupPermission(modset_id=parent, group_id=group_id, permission="read"), Mod(id="P", name="Parent mod"), Mod(id="C", name="Child mod")]); db.flush()
                db.add(UserMod(modset_id=parent, mod_id="P", current_version="2.0")); db.commit()
            client.post("/auth/logout")
            self.assertEqual(client.post("/auth/login", json={"username":"owner", "password":"very-secure-owner-pass"}).status_code, 200)
            child = self.create(client, "Child", parent_modset_id=parent)
            with self.SessionLocal() as db:
                db.add(UserMod(modset_id=child, mod_id="C", current_version="1.0")); db.commit()
            self.assertEqual(client.put(f"/modsets/{child}/export-order", json={"mod_ids":["C","P"]}).status_code, 204)
            key = self.issue(client, child)
            path = f"/sync/modsets/{child}/export"
            response = client.get(path, headers=self.headers(key))
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual([r["modId"] for r in response.json()], ["C", "P"])
            self.assertEqual(response.json()[1]["version"], "2.0")
            self.assertEqual(client.get(f"/sync/modsets/{parent}/export", headers=self.headers(key)).status_code, 401)
            with self.SessionLocal() as db:
                grant = db.get(ModSetGroupPermission, (parent, group_id)); db.delete(grant); db.commit()
            self.assertEqual(client.get(path, headers=self.headers(key)).status_code, 403)
            with self.SessionLocal() as db:
                db.add(ModSetGroupPermission(modset_id=parent, group_id=group_id, permission="read")); db.commit()
            self.assertEqual(client.get(path, headers=self.headers(key)).status_code, 200)
            response = client.patch(f"/modsets/{child}", json={"name":"Child", "parent_modset_id":None, "confirm_parent_conflicts":True})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(client.get(path, headers=self.headers(key)).status_code, 401)

    def test_creator_status_role_ownership_and_reader_writer_boundaries(self):
        owner = self._create_user("owner", "very-secure-owner-pass")
        reader = self._create_user("reader", "very-secure-reader-pass")
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            mid = self.create(client)
            key = self.issue(client, mid)
            path = f"/sync/modsets/{mid}/export"
            with self.SessionLocal() as db:
                admin = db.scalar(select(User).where(User.username == "admin")); admin_id = admin.id
                admin.is_active = False; db.commit()
            self.assertEqual(client.get(path, headers=self.headers(key)).status_code, 403)
            with self.SessionLocal() as db:
                admin = db.get(User, admin_id); admin.is_active = True
                db.get(ModSet, mid).owner_user_id = owner.id
                admin.role = "user"; db.commit()
            self.assertEqual(client.get(path, headers=self.headers(key)).status_code, 403)
            client.cookies.clear()
            client.post("/auth/login", json={"username":"owner", "password":"very-secure-owner-pass"})
            key = self.issue(client, mid)
            with self.SessionLocal() as db:
                group = Group(name="Writers"); db.add(group); db.flush()
                db.add_all([GroupMembership(group_id=group.id, user_id=reader.id), ModSetGroupPermission(modset_id=mid, group_id=group.id, permission="write")]); db.commit()
            client.cookies.clear(); client.post("/auth/login", json={"username":"reader", "password":"very-secure-reader-pass"})
            for method in [client.get, client.post, client.delete]:
                self.assertEqual(method(f"/modsets/{mid}/sync-access").status_code, 403)
            with self.SessionLocal() as db:
                db.get(ModSet, mid).owner_user_id = reader.id; db.commit()
            self.assertEqual(client.get(path, headers=self.headers(key)).status_code, 403)

    def test_rate_limit_and_repeatable_additive_migration(self):
        migrate_schema(self.engine)
        migrate_schema(self.engine)
        self.assertIn("modset_sync_access", inspect(self.engine).get_table_names())
        with self.engine.connect() as conn:
            self.assertEqual(conn.execute(text("SELECT COUNT(*) FROM schema_migrations WHERE version='005_modset_sync_access'")).scalar(), 1)
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            mid = self.create(client)
            key = self.issue(client, mid)
            for _ in range(600):
                self.assertEqual(client.get(f"/sync/modsets/{mid}/export", headers=self.headers(key)).status_code, 200)
            response = client.get(f"/sync/modsets/{mid}/export", headers=self.headers(key))
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.headers["retry-after"], "60")


    def test_sync_migration_rolls_back_and_retries_without_changing_modsets(self):
        migrate_schema(self.engine)
        ModsetSyncAccess.__table__.drop(self.engine)
        with self.engine.begin() as conn:
            conn.execute(text("DELETE FROM schema_migrations WHERE version='005_modset_sync_access'"))
        def fail(*args, **kwargs):
            raise RuntimeError("Interrupted sync migration")
        event.listen(ModsetSyncAccess.__table__, "after_create", fail)
        try:
            with self.assertRaisesRegex(RuntimeError, "Interrupted sync migration"):
                _migrate_sync_access(self.engine)
        finally:
            event.remove(ModsetSyncAccess.__table__, "after_create", fail)
        self.assertNotIn("modset_sync_access", inspect(self.engine).get_table_names())
        _migrate_sync_access(self.engine)
        _migrate_sync_access(self.engine)
        self.assertIn("modset_sync_access", inspect(self.engine).get_table_names())


@unittest.skipUnless(os.getenv("ARMM_UPGRADE_TEST_DATABASE_URL"), "Isolated PostgreSQL test database not configured")
class PostgreSQLSyncAccessTestCase(SyncAccessTestCase):
    def setUp(self):
        self.schema = "sync_" + uuid.uuid4().hex
        self.admin_engine = create_engine(os.environ["ARMM_UPGRADE_TEST_DATABASE_URL"])
        with self.admin_engine.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA "{self.schema}"'))
        engine = create_engine(os.environ["ARMM_UPGRADE_TEST_DATABASE_URL"], connect_args={"options": f"-csearch_path={self.schema}"})
        with patch("tests.support.create_engine", return_value=engine):
            super().setUp()

    def tearDown(self):
        from app.database import Base
        try:
            with patch.object(Base.metadata, "drop_all"):
                super().tearDown()
        finally:
            with self.admin_engine.begin() as conn:
                conn.execute(text(f'DROP SCHEMA "{self.schema}" CASCADE'))
            self.admin_engine.dispose()
