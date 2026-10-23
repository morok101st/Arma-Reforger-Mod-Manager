import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.migrations import migrate_schema
from app.models import DiscordWebhook
from app.webhook_crypto import decrypt_webhook_url, is_encrypted_webhook_url
from tests.support import ApiTestCase


class MigrationTestCase(unittest.TestCase):
    def test_discord_webhook_urls_are_backfilled_to_encrypted_storage(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            db_path = Path(tempdir) / "migration.db"
            engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
            SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
            Base.metadata.create_all(engine)

            with engine.begin() as connection:
                connection.execute(text("DROP TABLE discord_webhook_modsets"))
                connection.execute(text("INSERT INTO modsets (name, shared) VALUES ('Alpha', 1)"))
                connection.execute(text("INSERT INTO modsets (name, shared) VALUES ('Bravo', 1)"))
                connection.execute(
                    text(
                        "INSERT INTO discord_webhooks (name, webhook_url, is_active) "
                        "VALUES (:name, :webhook_url, :is_active)"
                    ),
                    {
                        "name": "Legacy Webhook",
                        "webhook_url": "https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz",
                        "is_active": True,
                    },
                )

            migrate_schema(engine)

            with SessionLocal() as db:
                webhook = db.query(DiscordWebhook).one()
                self.assertTrue(is_encrypted_webhook_url(webhook.webhook_url))
                self.assertEqual(
                    decrypt_webhook_url(webhook.webhook_url),
                    "https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz",
                )
                association_count = db.execute(text("SELECT COUNT(*) FROM discord_webhook_modsets")).scalar()
                self.assertEqual(int(association_count or 0), 2)

            engine.dispose()


class WebhookScopeStartupTestCase(ApiTestCase):
    def test_backend_restarts_preserve_selected_and_empty_scopes(self) -> None:
        with self.engine.begin() as connection:
            connection.execute(text("INSERT INTO modsets (id, name, shared) VALUES (1, 'Shared', 1), (2, 'Private', 0)"))
            connection.execute(text(
                "INSERT INTO discord_webhooks (id, name, webhook_url, is_active) VALUES "
                "(1, 'Selected', 'https://discord.com/api/webhooks/1/test', 1), "
                "(2, 'Empty', 'https://discord.com/api/webhooks/2/test', 1)"
            ))
            connection.execute(text("INSERT INTO discord_webhook_modsets VALUES (1, 1)"))

        from app.main import app

        for _ in range(2):
            with TestClient(app) as client:
                self.login_admin(client)
                response = client.get("/discord-webhooks")
                self.assertEqual(response.status_code, 200)
                scopes = {webhook["name"]: webhook["modset_ids"] for webhook in response.json()}
                self.assertEqual(scopes, {"Selected": [1], "Empty": []})


class SavedWebhookScopeMigrationTestCase(unittest.TestCase):
    def test_saved_webhook_scopes_survive_repeated_migrations(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            engine = create_engine(f"sqlite:///{Path(tempdir) / 'migration.db'}")
            Base.metadata.create_all(engine)
            with engine.begin() as connection:
                connection.execute(text("INSERT INTO modsets (id, name, shared) VALUES (1, 'Shared', 1), (2, 'Private', 0)"))
                connection.execute(text(
                    "INSERT INTO discord_webhooks (id, name, webhook_url, is_active) VALUES "
                    "(1, 'Selected', 'https://discord.com/api/webhooks/1/test', 1), "
                    "(2, 'Empty', 'https://discord.com/api/webhooks/2/test', 1)"
                ))
                connection.execute(text("INSERT INTO discord_webhook_modsets VALUES (1, 1)"))

            for _ in range(2):
                migrate_schema(engine)
                with engine.connect() as connection:
                    scopes = connection.execute(text(
                        "SELECT webhook_id, modset_id FROM discord_webhook_modsets ORDER BY webhook_id, modset_id"
                    )).all()
                    self.assertEqual(scopes, [(1, 1)])
                with engine.begin() as connection:
                    connection.execute(text("INSERT INTO modsets (name, shared) VALUES ('Later', 1) ON CONFLICT DO NOTHING"))
            engine.dispose()
