from fastapi.testclient import TestClient

from app import main as app_main
from app.models import DiscordWebhook, Mod, ModSet, UserMod
from app.discord_webhooks import encrypt_webhook_url
from app.scraper import ScrapedMod
from tests.support import ApiTestCase
from unittest.mock import patch


class ModsetsApiTestCase(ApiTestCase):
    def test_modset_crud_and_activate_flow(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            initial = client.get("/modsets")
            self.assertEqual(initial.status_code, 200)
            initial_data = initial.json()
            self.assertGreaterEqual(len(initial_data), 1)
            default_id = initial_data[0]["id"]

            created = client.post("/modsets", json={"name": "Server A"})
            self.assertEqual(created.status_code, 201)
            modset_id = created.json()["id"]

            renamed = client.patch(f"/modsets/{modset_id}", json={"name": "Server Bravo"})
            self.assertEqual(renamed.status_code, 200)
            self.assertEqual(renamed.json()["name"], "Server Bravo")

            activated = client.post(f"/modsets/{modset_id}/activate")
            self.assertEqual(activated.status_code, 200)
            self.assertEqual(activated.json()["active_modset_id"], modset_id)

            deleted = client.delete(f"/modsets/{modset_id}")
            self.assertEqual(deleted.status_code, 200)
            self.assertEqual(deleted.json()["active_modset_id"], default_id)

            after = client.get("/modsets")
            self.assertEqual(after.status_code, 200)
            after_ids = [entry["id"] for entry in after.json()]
            self.assertIn(default_id, after_ids)
            self.assertNotIn(modset_id, after_ids)

    def test_delete_non_empty_modset_removes_it(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            created = client.post("/modsets", json={"name": "Server C"})
            self.assertEqual(created.status_code, 201)
            modset_id = created.json()["id"]

            activated = client.post(f"/modsets/{modset_id}/activate")
            self.assertEqual(activated.status_code, 200)

            with self.SessionLocal() as db:
                db.add(Mod(id="MOD123", name="Test Mod"))
                db.add(UserMod(modset_id=modset_id, mod_id="MOD123", current_version=None, pinned=False, tracking_reason="manual"))
                db.commit()

            delete_response = client.delete(f"/modsets/{modset_id}")
            self.assertEqual(delete_response.status_code, 200)

            after = client.get("/modsets")
            self.assertEqual(after.status_code, 200)
            after_ids = [entry["id"] for entry in after.json()]
            self.assertNotIn(modset_id, after_ids)

    def test_export_modset_returns_mod_config_shape(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            created = client.post("/modsets", json={"name": "Server Export"})
            self.assertEqual(created.status_code, 201)
            modset_id = created.json()["id"]

            with self.SessionLocal() as db:
                db.add(Mod(id="664AFDC993C9CE1A", name="ACE Cook-Off Dev"))
                db.add(Mod(id="65EB440190E0B2DF", name="COE2 Ruha"))
                db.add(UserMod(modset_id=modset_id, mod_id="664AFDC993C9CE1A", current_version="1.2.3", pinned=False, tracking_reason="manual", load_order=500))
                db.add(UserMod(modset_id=modset_id, mod_id="65EB440190E0B2DF", current_version=None, pinned=False, tracking_reason="manual", load_order=100))
                db.commit()

            response = client.get(f"/modsets/{modset_id}/export")
            self.assertEqual(response.status_code, 200)
            payload = response.json()
            self.assertEqual(
                payload,
                [
                    {"modId": "664AFDC993C9CE1A", "name": "ACE Cook-Off Dev", "version": "1.2.3"},
                ],
            )

    def test_export_modset_uses_load_order_before_name_fallback(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            created = client.post("/modsets", json={"name": "Server Ordered Export"})
            self.assertEqual(created.status_code, 201)
            modset_id = created.json()["id"]

            with self.SessionLocal() as db:
                db.add(Mod(id="ORDERALPHA001", name="Alpha"))
                db.add(Mod(id="ORDERZULU001", name="Zulu"))
                db.add(Mod(id="ORDEROVERRIDE", name="Override"))
                db.add(UserMod(modset_id=modset_id, mod_id="ORDERALPHA001", current_version="1.0.0", pinned=False, tracking_reason="manual", load_order=500))
                db.add(UserMod(modset_id=modset_id, mod_id="ORDERZULU001", current_version="1.0.0", pinned=False, tracking_reason="manual", load_order=500))
                db.add(UserMod(modset_id=modset_id, mod_id="ORDEROVERRIDE", current_version="1.0.0", pinned=False, tracking_reason="manual", load_order=510))
                db.commit()

            response = client.get(f"/modsets/{modset_id}/export")
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual([entry["modId"] for entry in response.json()], ["ORDERALPHA001", "ORDERZULU001", "ORDEROVERRIDE"])

            update_response = client.patch(f"/mods/ORDERZULU001?modset_id={modset_id}", json={"load_order": 100})
            self.assertEqual(update_response.status_code, 200, update_response.text)

            reordered_response = client.get(f"/modsets/{modset_id}/export")
            self.assertEqual(reordered_response.status_code, 200, reordered_response.text)
            self.assertEqual([entry["modId"] for entry in reordered_response.json()], ["ORDERZULU001", "ORDERALPHA001", "ORDEROVERRIDE"])

    def test_modset_load_order_batch_update_reorders_export(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            created = client.post("/modsets", json={"name": "Server Batch Ordered Export"})
            self.assertEqual(created.status_code, 201)
            modset_id = created.json()["id"]

            with self.SessionLocal() as db:
                db.add(Mod(id="BATCHORDERA", name="Alpha"))
                db.add(Mod(id="BATCHORDERB", name="Bravo"))
                db.add(Mod(id="BATCHORDERC", name="Charlie"))
                db.add(UserMod(modset_id=modset_id, mod_id="BATCHORDERA", current_version="1.0.0", pinned=False, tracking_reason="manual", load_order=500))
                db.add(UserMod(modset_id=modset_id, mod_id="BATCHORDERB", current_version="1.0.0", pinned=False, tracking_reason="manual", load_order=510))
                db.add(UserMod(modset_id=modset_id, mod_id="BATCHORDERC", current_version="1.0.0", pinned=False, tracking_reason="manual", load_order=520))
                db.add(Mod(id="BATCHORDERX", name="Not tracked"))
                db.commit()

            update_response = client.patch(
                f"/modsets/{modset_id}/load-order",
                json={
                    "entries": [
                        {"mod_id": "BATCHORDERC", "load_order": 500},
                        {"mod_id": "BATCHORDERA", "load_order": 510},
                        {"mod_id": "BATCHORDERB", "load_order": 520},
                    ]
                },
            )
            self.assertEqual(update_response.status_code, 204, update_response.text)

            reordered_response = client.get(f"/modsets/{modset_id}/export")
            self.assertEqual(reordered_response.status_code, 200, reordered_response.text)
            self.assertEqual([entry["modId"] for entry in reordered_response.json()], ["BATCHORDERC", "BATCHORDERA", "BATCHORDERB"])

            invalid_response = client.patch(
                f"/modsets/{modset_id}/load-order",
                json={"entries": [{"mod_id": "BATCHORDERX", "load_order": 500}]},
            )
            self.assertEqual(invalid_response.status_code, 400, invalid_response.text)

    def test_same_mod_can_be_tracked_in_multiple_modsets(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            first = client.post("/modsets", json={"name": "Server One"})
            second = client.post("/modsets", json={"name": "Server Two"})
            self.assertEqual(first.status_code, 201)
            self.assertEqual(second.status_code, 201)
            first_id = first.json()["id"]
            second_id = second.json()["id"]

            with patch(
                "app.services.WorkshopScraper.fetch_mod",
                autospec=True,
                return_value=ScrapedMod(
                    id="MODMULTI001",
                    name="Shared Mod",
                    latest_version="2.0.0",
                    dependencies=[],
                    source_url="https://reforger.armaplatform.com/workshop/MODMULTI001-Shared-Mod",
                ),
            ):
                create_first = client.post(f"/mods?modset_id={first_id}", json={"id": "MODMULTI001", "current_version": "1.0.0"})
                create_second = client.post(f"/mods?modset_id={second_id}", json={"id": "MODMULTI001", "current_version": "2.0.0"})

            self.assertEqual(create_first.status_code, 201, create_first.text)
            self.assertEqual(create_second.status_code, 201, create_second.text)

            with self.SessionLocal() as db:
                first_mapping = db.query(UserMod).filter_by(modset_id=first_id, mod_id="MODMULTI001").one_or_none()
                second_mapping = db.query(UserMod).filter_by(modset_id=second_id, mod_id="MODMULTI001").one_or_none()
                self.assertIsNotNone(first_mapping)
                self.assertIsNotNone(second_mapping)
                self.assertEqual(first_mapping.current_version, "1.0.0")
                self.assertEqual(second_mapping.current_version, "2.0.0")

    def test_private_modset_is_hidden_until_shared(self) -> None:
        with TestClient(app_main.app) as admin_client, TestClient(app_main.app) as user_client:
            self.login_admin(admin_client)
            self._create_user("alice", "very-secure-alice-pass")
            login_response = user_client.post("/auth/login", json={"username": "alice", "password": "very-secure-alice-pass"})
            self.assertEqual(login_response.status_code, 200, login_response.text)

            created = admin_client.post("/modsets", json={"name": "Private Server"})
            self.assertEqual(created.status_code, 201)
            modset_id = created.json()["id"]

            visible_for_user = user_client.get("/modsets")
            self.assertEqual(visible_for_user.status_code, 200)
            visible_ids = [entry["id"] for entry in visible_for_user.json()]
            self.assertNotIn(modset_id, visible_ids)

            shared = admin_client.patch(f"/modsets/{modset_id}", json={"name": "Private Server", "shared": True})
            self.assertEqual(shared.status_code, 200, shared.text)
            self.assertTrue(shared.json()["shared"])

            visible_after_share = user_client.get("/modsets")
            self.assertEqual(visible_after_share.status_code, 200)
            visible_after_ids = [entry["id"] for entry in visible_after_share.json()]
            self.assertIn(modset_id, visible_after_ids)

            with patch(
                "app.services.WorkshopScraper.fetch_mod",
                autospec=True,
                return_value=ScrapedMod(
                    id="MODSHARED001",
                    name="Shared Access Mod",
                    latest_version="1.0.0",
                    dependencies=[],
                    source_url="https://reforger.armaplatform.com/workshop/MODSHARED001-Shared-Access-Mod",
                ),
            ):
                create_shared = user_client.post(f"/mods?modset_id={modset_id}", json={"id": "MODSHARED001", "current_version": "1.0.0"})

            self.assertEqual(create_shared.status_code, 201, create_shared.text)

    def test_duplicate_modset_copies_content_as_private_without_webhook_scope(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            created = client.post("/modsets", json={"name": "Training Shared", "shared": True})
            self.assertEqual(created.status_code, 201, created.text)
            source_id = created.json()["id"]

            with self.SessionLocal() as db:
                db.add(Mod(id="MODCOPY001", name="Copy Source"))
                db.add(
                    UserMod(
                        modset_id=source_id,
                        mod_id="MODCOPY001",
                        current_version="1.2.3",
                        pinned=True,
                        is_core=True,
                        dependency_origin=True,
                        tracking_reason="dependency",
                        load_order=750,
                    )
                )
                webhook = DiscordWebhook(
                    name="Discord Alerts",
                    webhook_url=encrypt_webhook_url("https://discord.com/api/webhooks/test/test"),
                    is_active=True,
                )
                source_modset = db.get(ModSet, source_id)
                webhook.modsets = [source_modset]
                db.add(webhook)
                db.commit()

            duplicate = client.post(f"/modsets/{source_id}/duplicate")
            self.assertEqual(duplicate.status_code, 201, duplicate.text)
            payload = duplicate.json()
            duplicate_id = payload["id"]

            self.assertEqual(payload["name"], "Training Shared (copy)")
            self.assertFalse(payload["shared"])

            with self.SessionLocal() as db:
                duplicate_row = db.query(UserMod).filter_by(modset_id=duplicate_id, mod_id="MODCOPY001").one_or_none()
                self.assertIsNotNone(duplicate_row)
                self.assertEqual(duplicate_row.current_version, "1.2.3")
                self.assertTrue(duplicate_row.pinned)
                self.assertTrue(duplicate_row.is_core)
                self.assertTrue(duplicate_row.dependency_origin)
                self.assertEqual(duplicate_row.tracking_reason, "dependency")
                self.assertEqual(duplicate_row.load_order, 750)

                webhook = db.query(DiscordWebhook).filter_by(name="Discord Alerts").one()
                webhook_modset_ids = sorted(modset.id for modset in webhook.modsets)
                self.assertIn(source_id, webhook_modset_ids)
                self.assertNotIn(duplicate_id, webhook_modset_ids)
