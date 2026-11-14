import hashlib
import os
import uuid
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, select, text

from app import main as app_main
from app.migrations import _migrate_sync_access, _migrate_sync_configuration, migrate_schema
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
            self.assertEqual(client.post(f"/modsets/{child}/sync-access").status_code, 403)
            client.cookies.clear()
            self.login_admin(client)
            key = self.issue(client, child)
            path = f"/sync/modsets/{child}/export"
            response = client.get(path, headers=self.headers(key))
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual([r["modId"] for r in response.json()], ["C", "P"])
            self.assertEqual(response.json()[1]["version"], "2.0")
            self.assertEqual(client.get(f"/sync/modsets/{parent}/export", headers=self.headers(key)).status_code, 401)
            with self.SessionLocal() as db:
                grant = db.get(ModSetGroupPermission, (parent, group_id)); db.delete(grant); db.commit()
            # The administrator explicitly authorizes the child export independently of the owner grants.
            self.assertEqual(client.get(path, headers=self.headers(key)).status_code, 200)
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
            self.assertEqual(client.post(f"/modsets/{mid}/sync-access").status_code, 403)
            self.assertEqual(client.get("/admin/sync-access").status_code, 403)
            self.assertEqual(client.post(f"/modsets/{mid}/sync-configuration", json={"name":"Owner", "baseUrl":"https://example.com", "accessKey":key}).status_code, 403)
            with self.SessionLocal() as db:
                group = Group(name="Writers"); db.add(group); db.flush()
                db.add_all([GroupMembership(group_id=group.id, user_id=reader.id), ModSetGroupPermission(modset_id=mid, group_id=group.id, permission="write")]); db.commit()
            client.cookies.clear(); client.post("/auth/login", json={"username":"reader", "password":"very-secure-reader-pass"})
            for method in [client.get, client.post, client.delete]:
                self.assertEqual(method(f"/modsets/{mid}/sync-access").status_code, 403)
            with self.SessionLocal() as db:
                db.get(ModSet, mid).owner_user_id = reader.id; db.commit()
            self.assertEqual(client.get(path, headers=self.headers(key)).status_code, 403)

    def test_admin_overview_and_legacy_owner_keys_are_blocked(self):
        owner = self._create_user("owner", "very-secure-owner-pass")
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            parent = self.create(client, "Parent")
            child = self.create(client, "Child", parent_modset_id=parent)
            key = self.issue(client, child)
            with self.SessionLocal() as db:
                db.get(ModSet, child).owner_user_id = owner.id
                db.commit()
            response = client.get("/admin/sync-access")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["cache-control"], "no-store")
            rows = {row["modset_id"]:row for row in response.json()}
            self.assertEqual(rows[child]["owner_username"], "owner")
            self.assertEqual(rows[child]["parent_modset_name"], "Parent")
            self.assertEqual(rows[child]["created_by"], "admin")
            self.assertTrue(rows[child]["usable"])
            self.assertNotIn(parent, rows)
            self.assertNotIn(key, response.text)
            self.assertNotIn("key_hash", response.text)
            with self.SessionLocal() as db:
                # Simulate a release issued by an owner before admin-only management.
                db.get(ModsetSyncAccess, child).creator_user_id = owner.id
                db.commit()
            self.assertEqual(client.get(f"/sync/modsets/{child}/export", headers=self.headers(key)).status_code, 403)
            rows = {row["modset_id"]:row for row in client.get("/admin/sync-access").json()}
            self.assertFalse(rows[child]["usable"])
            self.assertTrue(rows[child]["enabled"])
            client.cookies.clear()
            self.assertEqual(client.get("/admin/sync-access", headers=self.headers(key)).status_code, 401)

    def test_wizard_persists_settings_and_repeated_download_does_not_rotate_key(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            mid = self.create(client)
            untouched = self.create(client, "No access")
            settings = {"name":"Community access", "baseUrl":"https://armm.example.com:8443", "gameServer":{"host":"gameserver.example.com","port":2001,"passwordRequired":True}}
            response = client.post("/admin/sync-access", json={"modset_id":mid, **settings})
            self.assertEqual(response.status_code, 201, response.text)
            self.assertNotIn("access_key", response.json())
            self.assertTrue(response.json()["downloadable"])
            path = f"/admin/sync-access/{mid}/configuration"
            first = client.get(path)
            self.assertEqual(first.status_code, 200, first.text)
            self.assertEqual(first.headers["cache-control"], "no-store")
            config = first.json()
            key = config["armm"]["accessKey"]
            self.assertEqual(config["gameServer"], settings["gameServer"])
            self.assertEqual(config["armm"]["exportPath"], f"/api/sync/modsets/{mid}/export")
            self.assertEqual(client.get(path).json(), config)
            with self.SessionLocal() as db:
                row = db.get(ModsetSyncAccess, mid)
                self.assertNotIn(key, row.encrypted_key)
                self.assertEqual(row.key_hash, hashlib.sha256(key.encode()).hexdigest())
                self.assertEqual(row.configuration, settings)
            overview = client.get("/admin/sync-access")
            self.assertEqual([r["modset_id"] for r in overview.json()], [mid])
            self.assertNotIn(key, overview.text)
            self.assertNotIn("encrypted_key", overview.text)
            self.assertEqual(client.post("/admin/sync-access", json={"modset_id":mid, **settings}).status_code, 409)
            edited = {"name":"Renamed", "baseUrl":"https://new.example.com"}
            self.assertEqual(client.put(f"/admin/sync-access/{mid}", json=edited).status_code, 200)
            updated = client.get(path).json()
            self.assertEqual(updated["name"], "Renamed")
            self.assertNotIn("gameServer", updated)
            self.assertEqual(updated["armm"]["accessKey"], key)
            self.assertEqual(client.get(f"/sync/modsets/{mid}/export",headers=self.headers(key)).status_code, 200)
            self.assertEqual(client.put(f"/admin/sync-access/{mid}", json={**edited, "modset_id":untouched}).status_code, 422)
            client.delete(f"/modsets/{mid}/sync-access")
            self.assertEqual(client.get(path).status_code, 409)
            self.assertEqual(client.put(f"/admin/sync-access/{mid}", json=edited).status_code, 200)
            self.assertEqual(client.get(path).status_code, 409)
            self.assertEqual(client.put(f"/admin/sync-access/{mid}", json={**edited,"replaceKey":True}).status_code, 200)
            new_key = client.get(path).json()["armm"]["accessKey"]
            self.assertNotEqual(new_key, key)
            self.assertEqual(client.get(f"/sync/modsets/{mid}/export",headers=self.headers(key)).status_code, 401)
            client.cookies.clear()
            self.assertEqual(client.get(path,headers=self.headers(new_key)).status_code, 401)

    def test_legacy_key_can_be_restored_without_rotation_and_bad_cipher_fails_closed(self):
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            mid = self.create(client)
            key = self.issue(client, mid)
            with self.SessionLocal() as db:
                db.get(ModsetSyncAccess,mid).encrypted_key=None
                db.commit()
            settings = {"name":"Legacy", "baseUrl":"https://example.com"}
            url = f"/admin/sync-access/{mid}"
            self.assertEqual(client.put(url,json=settings).status_code,409)
            self.assertEqual(client.put(url,json={**settings,"accessKey":"wrong"}).status_code,409)
            self.assertEqual(client.put(url,json={**settings,"accessKey":key}).status_code,200)
            path = url+"/configuration"
            self.assertEqual(client.get(path).json()["armm"]["accessKey"],key)
            with self.SessionLocal() as db:
                db.get(ModsetSyncAccess,mid).encrypted_key="corrupt ciphertext"
                db.commit()
            self.assertEqual(client.get(path).status_code,409)
            self.assertEqual(client.get(f"/sync/modsets/{mid}/export",headers=self.headers(key)).status_code,200)
            self.assertEqual(client.put(url,json={**settings,"replaceKey":True}).status_code,200)
            self.assertNotEqual(client.get(path).json()["armm"]["accessKey"],key)

    def test_sync_settings_upgrade_preserves_existing_hashes_and_is_retryable(self):
        migrate_schema(self.engine)
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            mid=self.create(client)
            key=self.issue(client,mid)
        with self.engine.begin() as conn:
            conn.execute(text("ALTER TABLE modset_sync_access DROP COLUMN encrypted_key"))
            conn.execute(text("ALTER TABLE modset_sync_access DROP COLUMN configuration"))
            conn.execute(text("DELETE FROM schema_migrations WHERE version='006_sync_configuration'"))
        def fail(conn,cursor,statement,*args):
            if statement.startswith("ALTER TABLE modset_sync_access ADD COLUMN configuration"):
                raise RuntimeError("Interrupted sync settings migration")
        event.listen(self.engine,"before_cursor_execute",fail)
        try:
            with self.assertRaisesRegex(RuntimeError,"Interrupted sync settings migration"):
                _migrate_sync_configuration(self.engine)
        finally:
            event.remove(self.engine,"before_cursor_execute",fail)
        self.assertNotIn("encrypted_key",{c["name"] for c in inspect(self.engine).get_columns("modset_sync_access")})
        _migrate_sync_configuration(self.engine)
        migrate_schema(self.engine)
        with self.SessionLocal() as db:
            row=db.get(ModsetSyncAccess,mid)
            self.assertEqual(row.key_hash,hashlib.sha256(key.encode()).hexdigest())
            self.assertIsNone(row.encrypted_key)
            self.assertIsNone(row.configuration)

    def test_wizard_endpoints_are_admin_only_and_reject_password_storage(self):
        owner=self._create_user("owner", "very-secure-owner-pass")
        with TestClient(app_main.app) as client:
            self.login_admin(client)
            mid=self.create(client)
            with self.SessionLocal() as db:
                db.get(ModSet,mid).owner_user_id=owner.id
                db.commit()
            settings={"name":"Access", "baseUrl":"https://example.com"}
            response=client.post("/admin/sync-access",json={"modset_id":mid,**settings,"gameServer":{"host":"host","port":2001,"password":"secret"}})
            self.assertEqual(response.status_code,422)
            self.assertEqual(client.get("/admin/sync-access").json(),[])
            client.cookies.clear()
            client.post("/auth/login",json={"username":"owner","password":"very-secure-owner-pass"})
            self.assertEqual(client.post("/admin/sync-access",json={"modset_id":mid,**settings}).status_code,403)
            self.assertEqual(client.put(f"/admin/sync-access/{mid}",json=settings).status_code,403)
            self.assertEqual(client.get(f"/admin/sync-access/{mid}/configuration").status_code,403)

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
