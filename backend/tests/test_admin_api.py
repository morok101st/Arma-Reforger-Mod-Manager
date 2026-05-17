from fastapi.testclient import TestClient
from unittest.mock import patch

from app import main as app_main
from app.models import DiscordWebhook, User
from app.webhook_crypto import decrypt_webhook_url, is_encrypted_webhook_url
from tests.support import ApiTestCase


class AdminApiTestCase(ApiTestCase):
    def test_admin_user_creation_and_audit_log(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

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

    def test_admin_can_delete_user_but_not_self_or_last_active_admin(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            create_response = client.post(
                "/users",
                json={"username": "delete.me", "password": "super-secure-pass", "role": "user"},
            )
            self.assertEqual(create_response.status_code, 201)
            user_id = create_response.json()["id"]

            delete_response = client.delete(f"/users/{user_id}")
            self.assertEqual(delete_response.status_code, 204)

            users_response = client.get("/users")
            self.assertEqual(users_response.status_code, 200)
            usernames = [user["username"] for user in users_response.json()]
            self.assertNotIn("delete.me", usernames)

            audit_response = client.get("/audit?limit=20")
            self.assertEqual(audit_response.status_code, 200)
            actions = [entry["action"] for entry in audit_response.json()]
            self.assertIn("user_deleted", actions)

            self_delete_response = client.delete("/users/1")
            self.assertEqual(self_delete_response.status_code, 400)
            self.assertIn("Cannot delete current user", self_delete_response.json()["detail"])

            last_admin_delete_response = client.delete("/users/1")
            self.assertEqual(last_admin_delete_response.status_code, 400)

    def test_admin_can_delete_inactive_admin(self) -> None:
        second_admin = self._create_user("otheradmin", "very-secure-admin-pass", role="admin")

        with self.SessionLocal() as db:
            target = db.get(User, second_admin.id)
            assert target is not None
            target.is_active = False
            db.commit()

        with TestClient(app_main.app) as client:
            self.login_admin(client)
            delete_response = client.delete(f"/users/{second_admin.id}")
            self.assertEqual(delete_response.status_code, 204)

    def test_admin_can_manage_discord_webhooks(self) -> None:
        with TestClient(app_main.app) as client:
            self.login_admin(client)

            created = client.post(
                "/discord-webhooks",
                json={
                    "name": "Server Alerts",
                    "webhook_url": "https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz",
                    "is_active": True,
                },
            )
            self.assertEqual(created.status_code, 201, created.text)
            webhook_id = created.json()["id"]
            self.assertEqual(created.json()["masked_webhook_url"], "discord.com/api/webhooks/...")
            self.assertGreaterEqual(len(created.json()["modset_ids"]), 1)

            with self.SessionLocal() as db:
                stored = db.get(DiscordWebhook, webhook_id)
                self.assertIsNotNone(stored)
                assert stored is not None
                self.assertTrue(is_encrypted_webhook_url(stored.webhook_url))
                self.assertEqual(
                    decrypt_webhook_url(stored.webhook_url),
                    "https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz",
                )

            listed = client.get("/discord-webhooks")
            self.assertEqual(listed.status_code, 200, listed.text)
            self.assertEqual(len(listed.json()), 1)
            self.assertEqual(listed.json()[0]["name"], "Server Alerts")

            updated = client.patch(
                f"/discord-webhooks/{webhook_id}",
                json={"name": "Server Alerts Updated", "is_active": False},
            )
            self.assertEqual(updated.status_code, 200, updated.text)
            self.assertFalse(updated.json()["is_active"])
            self.assertEqual(updated.json()["name"], "Server Alerts Updated")

            with patch("app.discord_webhooks._post_discord_webhook", autospec=True, return_value=None) as send_mock:
                test_response = client.post(f"/discord-webhooks/{webhook_id}/test")
                self.assertEqual(test_response.status_code, 200, test_response.text)
                self.assertTrue(test_response.json()["sent"])
                self.assertEqual(send_mock.call_count, 1)

            deleted = client.delete(f"/discord-webhooks/{webhook_id}")
            self.assertEqual(deleted.status_code, 204, deleted.text)

            after = client.get("/discord-webhooks")
            self.assertEqual(after.status_code, 200, after.text)
            self.assertEqual(after.json(), [])
