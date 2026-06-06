from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import main as app_main
from app.models import AuditLog, DiscordWebhookDelivery, Mod, UserMod
from app.schema_enums import ModStatus, TrackingReason
from app.schemas_mods import ModRead, RefreshResult
from app.scraper import ScrapedMod
from tests.support import ApiTestCase


class ModsApiTestCase(ApiTestCase):
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
            is_core=False,
            dependency_origin=False,
            is_dependency=False,
            tracking_reason=TrackingReason.manual,
            blocking_dependents=[],
            core_dependents=[],
            delete_blocked=False,
            status=ModStatus.update_available,
            versions=[],
        )
        updated_mod = sample_mod.model_copy(update={"current_version": "1.2.0", "status": ModStatus.up_to_date})

        with TestClient(app_main.app) as client:
            self.login_admin(client)
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

    def test_setting_installed_version_auto_tracks_dependencies_for_modset(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            modset_response = client.post("/modsets", json={"name": "Server Alpha"})
            self.assertEqual(modset_response.status_code, 201)
            modset_id = modset_response.json()["id"]

            activate_response = client.post(f"/modsets/{modset_id}/activate")
            self.assertEqual(activate_response.status_code, 200)

            with self.SessionLocal() as db:
                db.add(
                    Mod(
                        id="PARENTMOD001",
                        name="Parent Mod",
                        latest_version="1.0.0",
                        dependencies=[
                            {
                                "name": "Dependency Mod",
                                "url": "https://reforger.armaplatform.com/workshop/DEPMOD001-Dependency-Mod",
                            }
                        ],
                        source_url="https://reforger.armaplatform.com/workshop/PARENTMOD001-Parent-Mod",
                    )
                )
                db.add(UserMod(modset_id=modset_id, mod_id="PARENTMOD001", current_version=None, pinned=False, tracking_reason="manual"))
                db.commit()

            with patch(
                "app.services.WorkshopScraper.fetch_mod",
                autospec=True,
                side_effect=[
                    ScrapedMod(
                        id="PARENTMOD001",
                        name="Parent Mod",
                        latest_version="1.0.0",
                        dependencies=[
                            {
                                "name": "Dependency Mod",
                                "url": "https://reforger.armaplatform.com/workshop/DEPMOD001-Dependency-Mod",
                            }
                        ],
                        source_url="https://reforger.armaplatform.com/workshop/PARENTMOD001-Parent-Mod",
                    ),
                    ScrapedMod(
                        id="DEPMOD001",
                        name="Dependency Mod",
                        latest_version="2.0.0",
                        dependencies=[],
                        source_url="https://reforger.armaplatform.com/workshop/DEPMOD001-Dependency-Mod",
                    ),
                ],
            ):
                update_response = client.patch(f"/mods/PARENTMOD001?modset_id={modset_id}", json={"current_version": "1.0.0"})

            self.assertEqual(update_response.status_code, 200, update_response.text)

            with self.SessionLocal() as db:
                dependency_mapping = db.query(UserMod).filter_by(modset_id=modset_id, mod_id="DEPMOD001").one_or_none()
                self.assertIsNotNone(dependency_mapping)
                self.assertEqual(dependency_mapping.tracking_reason, "dependency")
                self.assertIsNone(dependency_mapping.current_version)

            list_response = client.get(f"/mods?modset_id={modset_id}")
            self.assertEqual(list_response.status_code, 200, list_response.text)
            mods = {entry["id"]: entry for entry in list_response.json()}
            self.assertFalse(mods["PARENTMOD001"]["is_dependency"])
            self.assertTrue(mods["DEPMOD001"]["is_dependency"])

    def test_setting_installed_version_still_tracks_dependencies_when_parent_refresh_fails(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            modset_response = client.post("/modsets", json={"name": "Server Beta"})
            self.assertEqual(modset_response.status_code, 201)
            modset_id = modset_response.json()["id"]

            activate_response = client.post(f"/modsets/{modset_id}/activate")
            self.assertEqual(activate_response.status_code, 200)

            with self.SessionLocal() as db:
                db.add(
                    Mod(
                        id="PARENTMOD002",
                        name="Parent Mod 2",
                        latest_version="1.0.0",
                        dependencies=[
                            {
                                "name": "Dependency Mod 2",
                                "url": "https://reforger.armaplatform.com/workshop/DEPMOD002-Dependency-Mod-2",
                            }
                        ],
                        source_url="https://reforger.armaplatform.com/workshop/PARENTMOD002-Parent-Mod-2",
                    )
                )
                db.add(UserMod(modset_id=modset_id, mod_id="PARENTMOD002", current_version=None, pinned=False, tracking_reason="manual"))
                db.commit()

            with patch(
                "app.services.WorkshopScraper.fetch_mod",
                autospec=True,
                side_effect=RuntimeError("workshop temporarily unavailable"),
            ):
                update_response = client.patch(f"/mods/PARENTMOD002?modset_id={modset_id}", json={"current_version": "1.0.0"})

            self.assertEqual(update_response.status_code, 200, update_response.text)
            with self.SessionLocal() as db:
                dependency_mapping = db.query(UserMod).filter_by(modset_id=modset_id, mod_id="DEPMOD002").one_or_none()
                self.assertIsNotNone(dependency_mapping)
                self.assertEqual(dependency_mapping.tracking_reason, "dependency")

    def test_clearing_installed_version_sets_not_installed_and_keeps_dependency_tracking_origin(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            modset_response = client.post("/modsets", json={"name": "Server Clear"})
            self.assertEqual(modset_response.status_code, 201)
            modset_id = modset_response.json()["id"]

            with self.SessionLocal() as db:
                db.add(
                    Mod(
                        id="PARENTMODCLR",
                        name="Parent Clear",
                        latest_version="1.2.0",
                        dependencies=[
                            {
                                "name": "Dependency Clear",
                                "url": "https://reforger.armaplatform.com/workshop/DEPMODCLR-Dependency-Clear",
                            }
                        ],
                        source_url="https://reforger.armaplatform.com/workshop/PARENTMODCLR-Parent-Clear",
                    )
                )
                db.add(
                    Mod(
                        id="DEPMODCLR",
                        name="Dependency Clear",
                        latest_version="2.0.0",
                        dependencies=[],
                        source_url="https://reforger.armaplatform.com/workshop/DEPMODCLR-Dependency-Clear",
                    )
                )
                db.add(UserMod(modset_id=modset_id, mod_id="PARENTMODCLR", current_version="1.0.0", pinned=False, tracking_reason="manual"))
                db.add(
                    UserMod(
                        modset_id=modset_id,
                        mod_id="DEPMODCLR",
                        current_version="2.0.0",
                        pinned=False,
                        tracking_reason="manual",
                        dependency_origin=True,
                    )
                )
                db.commit()

            update_response = client.patch(f"/mods/PARENTMODCLR?modset_id={modset_id}", json={"current_version": None})
            self.assertEqual(update_response.status_code, 200, update_response.text)
            payload = update_response.json()
            self.assertIsNone(payload["current_version"])
            self.assertEqual(payload["status"], ModStatus.not_installed.value)

            with self.SessionLocal() as db:
                dependency_mapping = db.query(UserMod).filter_by(modset_id=modset_id, mod_id="DEPMODCLR").one_or_none()
                self.assertIsNotNone(dependency_mapping)
                assert dependency_mapping is not None
                self.assertTrue(dependency_mapping.dependency_origin)
                self.assertEqual(dependency_mapping.current_version, "2.0.0")

    def test_clearing_installed_version_keeps_shared_dependency_tracking(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            modset_response = client.post("/modsets", json={"name": "Server Shared"})
            self.assertEqual(modset_response.status_code, 201)
            modset_id = modset_response.json()["id"]

            dependency = {
                "name": "Dependency Shared",
                "url": "https://reforger.armaplatform.com/workshop/DEPMODSHR-Dependency-Shared",
            }
            with self.SessionLocal() as db:
                db.add(Mod(id="PARENTMODA", name="Parent A", latest_version="1.0.0", dependencies=[dependency]))
                db.add(Mod(id="PARENTMODB", name="Parent B", latest_version="1.0.0", dependencies=[dependency]))
                db.add(Mod(id="DEPMODSHR", name="Dependency Shared", latest_version="2.0.0", dependencies=[]))
                db.add(UserMod(modset_id=modset_id, mod_id="PARENTMODA", current_version="1.0.0", pinned=False, tracking_reason="manual"))
                db.add(UserMod(modset_id=modset_id, mod_id="PARENTMODB", current_version="1.0.0", pinned=False, tracking_reason="manual"))
                db.add(
                    UserMod(
                        modset_id=modset_id,
                        mod_id="DEPMODSHR",
                        current_version=None,
                        pinned=False,
                        tracking_reason="dependency",
                        dependency_origin=True,
                    )
                )
                db.commit()

            update_response = client.patch(f"/mods/PARENTMODA?modset_id={modset_id}", json={"current_version": None})
            self.assertEqual(update_response.status_code, 200, update_response.text)

            with self.SessionLocal() as db:
                dependency_mapping = db.query(UserMod).filter_by(modset_id=modset_id, mod_id="DEPMODSHR").one_or_none()
                self.assertIsNotNone(dependency_mapping)
                self.assertEqual(dependency_mapping.tracking_reason, "dependency")

    def test_dependency_tag_persists_after_manual_update(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            modset_response = client.post("/modsets", json={"name": "Server Gamma"})
            self.assertEqual(modset_response.status_code, 201)
            modset_id = modset_response.json()["id"]

            with self.SessionLocal() as db:
                db.add(
                    Mod(
                        id="PARENTMOD003",
                        name="Parent Mod 3",
                        latest_version="1.0.0",
                        dependencies=[
                            {
                                "name": "Dependency Mod 3",
                                "url": "https://reforger.armaplatform.com/workshop/DEPMOD003-Dependency-Mod-3",
                            }
                        ],
                        source_url="https://reforger.armaplatform.com/workshop/PARENTMOD003-Parent-Mod-3",
                    )
                )
                db.add(
                    Mod(
                        id="DEPMOD003",
                        name="Dependency Mod 3",
                        latest_version="2.0.0",
                        dependencies=[],
                        source_url="https://reforger.armaplatform.com/workshop/DEPMOD003-Dependency-Mod-3",
                    )
                )
                db.add(UserMod(modset_id=modset_id, mod_id="PARENTMOD003", current_version="1.0.0", pinned=False, tracking_reason="manual"))
                db.add(
                    UserMod(
                        modset_id=modset_id,
                        mod_id="DEPMOD003",
                        current_version=None,
                        pinned=False,
                        tracking_reason="dependency",
                        dependency_origin=True,
                    )
                )
                db.commit()

            update_response = client.patch(f"/mods/DEPMOD003?modset_id={modset_id}", json={"current_version": "2.0.0"})
            self.assertEqual(update_response.status_code, 200, update_response.text)
            payload = update_response.json()
            self.assertEqual(payload["tracking_reason"], "manual")
            self.assertTrue(payload["is_dependency"])

            list_response = client.get(f"/mods?modset_id={modset_id}")
            self.assertEqual(list_response.status_code, 200, list_response.text)
            mods = {entry["id"]: entry for entry in list_response.json()}
            self.assertTrue(mods["DEPMOD003"]["is_dependency"])

    def test_active_dependency_cannot_be_deleted(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            modset_response = client.post("/modsets", json={"name": "Server Delta"})
            self.assertEqual(modset_response.status_code, 201)
            modset_id = modset_response.json()["id"]

            with self.SessionLocal() as db:
                db.add(
                    Mod(
                        id="PARENTMOD004",
                        name="Parent Mod 4",
                        latest_version="1.0.0",
                        dependencies=[
                            {
                                "name": "Protected Dependency",
                                "url": "https://reforger.armaplatform.com/workshop/DEPMOD004-Protected-Dependency",
                            }
                        ],
                        source_url="https://reforger.armaplatform.com/workshop/PARENTMOD004-Parent-Mod-4",
                    )
                )
                db.add(
                    Mod(
                        id="DEPMOD004",
                        name="Protected Dependency",
                        latest_version="2.0.0",
                        dependencies=[],
                        source_url="https://reforger.armaplatform.com/workshop/DEPMOD004-Protected-Dependency",
                    )
                )
                db.add(UserMod(modset_id=modset_id, mod_id="PARENTMOD004", current_version="1.0.0", pinned=False, tracking_reason="manual", is_core=False))
                db.add(
                    UserMod(
                        modset_id=modset_id,
                        mod_id="DEPMOD004",
                        current_version=None,
                        pinned=False,
                        tracking_reason="dependency",
                        dependency_origin=True,
                    )
                )
                db.commit()

            list_response = client.get(f"/mods?modset_id={modset_id}")
            self.assertEqual(list_response.status_code, 200, list_response.text)
            mods = {entry["id"]: entry for entry in list_response.json()}
            self.assertTrue(mods["DEPMOD004"]["delete_blocked"])
            self.assertEqual([mod["id"] for mod in mods["DEPMOD004"]["blocking_dependents"]], ["PARENTMOD004"])

            delete_response = client.delete(f"/mods/DEPMOD004?modset_id={modset_id}")
            self.assertEqual(delete_response.status_code, 400, delete_response.text)
            self.assertIn("active dependency", delete_response.json().get("detail", ""))

    def test_delete_mod_can_deactivate_orphaned_dependency_origins(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            modset_response = client.post("/modsets", json={"name": "Server Epsilon"})
            self.assertEqual(modset_response.status_code, 201)
            modset_id = modset_response.json()["id"]

            dependency = {
                "name": "Dependency Epsilon",
                "url": "https://reforger.armaplatform.com/workshop/DEPMODEPS-Dependency-Epsilon",
            }
            with self.SessionLocal() as db:
                db.add(Mod(id="PARENTMODEPS", name="Parent Epsilon", latest_version="1.0.0", dependencies=[dependency]))
                db.add(Mod(id="DEPMODEPS", name="Dependency Epsilon", latest_version="2.0.0", dependencies=[]))
                db.add(UserMod(modset_id=modset_id, mod_id="PARENTMODEPS", current_version="1.0.0", pinned=False, tracking_reason="manual"))
                db.add(
                    UserMod(
                        modset_id=modset_id,
                        mod_id="DEPMODEPS",
                        current_version="2.0.0",
                        pinned=False,
                        tracking_reason="manual",
                        dependency_origin=True,
                    )
                )
                db.commit()

            delete_response = client.delete(f"/mods/PARENTMODEPS?modset_id={modset_id}&deactivate_orphan_dependencies=true")
            self.assertEqual(delete_response.status_code, 204, delete_response.text)

            with self.SessionLocal() as db:
                dependency_mapping = db.query(UserMod).filter_by(modset_id=modset_id, mod_id="DEPMODEPS").one_or_none()
                self.assertIsNotNone(dependency_mapping)
                assert dependency_mapping is not None
                self.assertIsNone(dependency_mapping.current_version)
                self.assertTrue(dependency_mapping.dependency_origin)

    def test_clearing_installed_version_can_deactivate_orphaned_dependency_origins(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            modset_response = client.post("/modsets", json={"name": "Server Zeta"})
            self.assertEqual(modset_response.status_code, 201)
            modset_id = modset_response.json()["id"]

            dependency = {
                "name": "Dependency Zeta",
                "url": "https://reforger.armaplatform.com/workshop/DEPMODZET-Dependency-Zeta",
            }
            with self.SessionLocal() as db:
                db.add(Mod(id="PARENTMODZET", name="Parent Zeta", latest_version="1.0.0", dependencies=[dependency]))
                db.add(Mod(id="DEPMODZET", name="Dependency Zeta", latest_version="2.0.0", dependencies=[]))
                db.add(UserMod(modset_id=modset_id, mod_id="PARENTMODZET", current_version="1.0.0", pinned=False, tracking_reason="manual"))
                db.add(
                    UserMod(
                        modset_id=modset_id,
                        mod_id="DEPMODZET",
                        current_version="2.0.0",
                        pinned=False,
                        tracking_reason="manual",
                        dependency_origin=True,
                    )
                )
                db.commit()

            update_response = client.patch(
                f"/mods/PARENTMODZET?modset_id={modset_id}&deactivate_orphan_dependencies=true",
                json={"current_version": None},
            )
            self.assertEqual(update_response.status_code, 200, update_response.text)
            payload = update_response.json()
            self.assertIsNone(payload["current_version"])
            self.assertEqual(payload["status"], ModStatus.not_installed.value)

            with self.SessionLocal() as db:
                dependency_mapping = db.query(UserMod).filter_by(modset_id=modset_id, mod_id="DEPMODZET").one_or_none()
                self.assertIsNotNone(dependency_mapping)
                assert dependency_mapping is not None
                self.assertIsNone(dependency_mapping.current_version)
                self.assertTrue(dependency_mapping.dependency_origin)

    def test_update_alert_is_sent_once_per_latest_version_and_webhook(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            modset_response = client.post("/modsets", json={"name": "Server Alerts"})
            self.assertEqual(modset_response.status_code, 201)
            modset_id = modset_response.json()["id"]

            other_modset_response = client.post("/modsets", json={"name": "Server Alerts Off"})
            self.assertEqual(other_modset_response.status_code, 201)
            other_modset_id = other_modset_response.json()["id"]

            webhook_response = client.post(
                "/discord-webhooks",
                json={
                    "name": "Alerts",
                    "webhook_url": "https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz",
                    "is_active": True,
                    "modset_ids": [modset_id],
                },
            )
            self.assertEqual(webhook_response.status_code, 201, webhook_response.text)

            with self.SessionLocal() as db:
                db.add(
                    Mod(
                        id="UPDATEMOD001",
                        name="Update Mod",
                        latest_version="2.0.0",
                        dependencies=[],
                        source_url="https://reforger.armaplatform.com/workshop/UPDATEMOD001-Update-Mod",
                    )
                )
                db.add(UserMod(modset_id=modset_id, mod_id="UPDATEMOD001", current_version="1.0.0", pinned=False, tracking_reason="manual"))
                db.add(UserMod(modset_id=other_modset_id, mod_id="UPDATEMOD001", current_version="1.0.0", pinned=False, tracking_reason="manual"))
                db.commit()

            with (
                patch(
                    "app.services.WorkshopScraper.fetch_mod",
                    autospec=True,
                    return_value=ScrapedMod(
                        id="UPDATEMOD001",
                        name="Update Mod",
                        latest_version="2.0.0",
                        dependencies=[],
                        source_url="https://reforger.armaplatform.com/workshop/UPDATEMOD001-Update-Mod",
                    ),
                ),
                patch("app.discord_webhooks._post_discord_webhook", autospec=True, return_value=None) as webhook_mock,
            ):
                first_refresh = client.post(f"/mods/UPDATEMOD001/refresh?modset_id={modset_id}")
                self.assertEqual(first_refresh.status_code, 200, first_refresh.text)

                second_refresh = client.post(f"/mods/UPDATEMOD001/refresh?modset_id={modset_id}")
                self.assertEqual(second_refresh.status_code, 200, second_refresh.text)

                other_refresh = client.post(f"/mods/UPDATEMOD001/refresh?modset_id={other_modset_id}")
                self.assertEqual(other_refresh.status_code, 200, other_refresh.text)

            self.assertEqual(webhook_mock.call_count, 1)
            _, payload = webhook_mock.call_args.args
            fields = {entry["name"]: entry["value"] for entry in payload["embeds"][0]["fields"]}
            self.assertIn("Workshop", fields)
            self.assertIn("ARMM", fields)
            self.assertNotIn("Changelog", fields)
            self.assertIn(f"modset={modset_id}", fields["ARMM"])
            self.assertIn("mod=UPDATEMOD001", fields["ARMM"])
            self.assertTrue(fields["ARMM"].startswith("[Open in ARMM]("))
            with self.SessionLocal() as db:
                deliveries = db.query(DiscordWebhookDelivery).all()
                self.assertEqual(len(deliveries), 1)
