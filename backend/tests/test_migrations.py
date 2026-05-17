import tempfile
import unittest
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.migrations import migrate_schema
from app.models import DiscordWebhook
from app.webhook_crypto import decrypt_webhook_url, is_encrypted_webhook_url


class MigrationTestCase(unittest.TestCase):
    def test_discord_webhook_urls_are_backfilled_to_encrypted_storage(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            db_path = Path(tempdir) / "migration.db"
            engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
            SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
            Base.metadata.create_all(engine)

            with engine.begin() as connection:
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

            engine.dispose()
