"""Direct 0.2.7 upgrade: frozen tagged DDL plus inherited exports and group access."""
import json
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app import main as app_main
from app.database import get_db
from app.models import User
from app.modset_service import export_modset
from app.session_auth import create_session_token, decode_session_token
from app.webhook_crypto import decrypt_webhook_url
from tests.support import DummyScheduler
from tests import test_upgrade_0_2_4 as old


class Upgrade027Mixin:
    fixture_version = "0_2_7"
    load_legacy = old.Upgrade024Mixin.load_legacy
    def snapshot(self):
        inspector=inspect(self.engine)
        if not hasattr(self,"legacy_columns"):
            self.legacy_columns={table:[c["name"] for c in inspector.get_columns(table)] for table in self.legacy_tables}
        with self.engine.connect() as conn:
            result={}
            for table,columns in self.legacy_columns.items():
                keys=inspector.get_pk_constraint(table)["constrained_columns"]
                fields=", ".join(f'"{c}"' for c in columns)
                ordering=", ".join(f'"{c}"' for c in keys)
                result[table]=conn.execute(text(f'SELECT {fields} FROM "{table}" ORDER BY {ordering}')).all()
            return result

    def test_upgrade_027_preserves_rows_sessions_inheritance_exports_and_enables_sync(self):
        self.load_legacy()
        with self.engine.begin() as conn:
            conn.execute(text("INSERT INTO groups (id,name,description) VALUES (1,'Readers','Retain me')"))
            conn.execute(text("INSERT INTO group_memberships (group_id,user_id) VALUES (1,2)"))
            conn.execute(text("INSERT INTO modset_group_permissions (modset_id,group_id,permission) VALUES (1,1,'read'),(2,1,'read')"))
            conn.execute(text("UPDATE modsets SET base_modset_id=1, export_order_mode='base' WHERE id=2"))
            conn.execute(text("INSERT INTO mods (id,name,dependencies) VALUES ('CHILD','Child local','[]')"))
            conn.execute(text("UPDATE user_mods SET mod_id='CHILD',current_version='3.0' WHERE id=3"))
            conn.execute(text("INSERT INTO modset_export_orders (modset_id,mod_id,load_order,before_mod_ids) VALUES (2,'CHILD',10,'[\"PARENT\"]')"))
            conn.execute(text("INSERT INTO mod_refresh_jobs (modset_id,mod_id,attempt,state,requested_at,completed_at,actor_user_id) VALUES (1,'PARENT','legacy-attempt','succeeded','2026-11-01 10:00:00+00:00','2026-11-01 10:01:00+00:00',1)"))
        self.legacy_tables = [t for t in self.legacy_tables if t != "schema_migrations"]
        before = self.snapshot()
        with Session(self.engine) as db:
            admin = db.get(User,1)
            token = create_session_token(admin)
            exports = {mid:[r.model_dump() for r in export_modset(db,admin,mid)] for mid in (1,2)}
            self.assertEqual([r["modId"] for r in exports[2]],["CHILD","PARENT"])
            self.assertEqual(exports[2][1]["version"],"1.0")
        factory=sessionmaker(bind=self.engine)
        def override_db():
            with factory() as db:
                yield db
        previous=app_main.app.dependency_overrides.get(get_db)
        app_main.app.dependency_overrides[get_db]=override_db
        try:
            for _ in range(2):
                with patch.object(app_main,"engine",self.engine), patch.object(app_main,"SessionLocal",factory), patch.object(app_main,"start_scheduler",return_value=DummyScheduler()):
                    with TestClient(app_main.app) as client:
                        self.assertEqual(client.get("/health").status_code,200)
                        client.cookies.set("armm_session",token)
                        self.assertEqual(client.get("/auth/me").status_code,200)
                        for mid in (1,2):
                            self.assertEqual(client.get(f"/modsets/{mid}/export").json(),exports[mid])
                self.assertEqual(self.snapshot(),before)
            with self.engine.connect() as conn:
                self.assertEqual(conn.execute(text("SELECT COUNT(*) FROM schema_migrations")).scalar(),6)
                self.assertEqual(conn.execute(text("SELECT COUNT(*) FROM modset_sync_access")).scalar(),0)
            with Session(self.engine) as db:
                self.assertEqual(decode_session_token(token)["sv"],db.get(User,1).session_version)
                self.assertEqual([r.model_dump() for r in export_modset(db,db.get(User,2),2)],exports[2])
                self.assertEqual(decrypt_webhook_url(db.execute(text("SELECT webhook_url FROM discord_webhooks WHERE id=1")).scalar()),"https://discord.com/api/webhooks/legacy/test")
            with patch.object(app_main,"engine",self.engine), patch.object(app_main,"SessionLocal",factory), patch.object(app_main,"start_scheduler",return_value=DummyScheduler()):
                with TestClient(app_main.app) as client:
                    client.cookies.set("armm_session",token)
                    created=client.post("/admin/sync-access",json={"modset_id":2,"name":"After upgrade","baseUrl":"https://example.com"})
                    self.assertEqual(created.status_code,201,created.text)
                    config=client.get("/admin/sync-access/2/configuration")
                    self.assertEqual(config.status_code,200,config.text)
                    key=config.json()["armm"]["accessKey"]
                    client.cookies.clear()
                    exported=client.get("/sync/modsets/2/export",headers={"Authorization":"Bearer "+key})
                    self.assertEqual(exported.status_code,200,exported.text)
                    self.assertEqual(exported.json(),exports[2])
        finally:
            if previous is None: app_main.app.dependency_overrides.pop(get_db,None)
            else: app_main.app.dependency_overrides[get_db]=previous


class SQLiteUpgrade027TestCase(Upgrade027Mixin,unittest.TestCase):
    setUp=old.SQLiteUpgrade024TestCase.setUp
    tearDown=old.SQLiteUpgrade024TestCase.tearDown


@unittest.skipUnless(os.getenv("ARMM_UPGRADE_TEST_DATABASE_URL"),"Isolated PostgreSQL upgrade database not configured")
class PostgreSQLUpgrade027TestCase(Upgrade027Mixin,unittest.TestCase):
    setUp=old.PostgreSQLUpgrade024TestCase.setUp
    tearDown=old.PostgreSQLUpgrade024TestCase.tearDown
