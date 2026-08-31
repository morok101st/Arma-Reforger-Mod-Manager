import unittest

from pydantic import ValidationError

from app.config import Settings


class ConfigTestCase(unittest.TestCase):
    def test_production_rejects_default_secret_key(self) -> None:
        with self.assertRaises(ValidationError) as context:
            Settings(
                armm_env="production",
                armm_secret_key="change-me-long-random-secret",
                armm_admin_username="admin",
                armm_admin_password="very-secure-admin-pass",
                database_url="sqlite:///./test.db",
            )
        self.assertIn("ARMM_SECRET_KEY must be set to a unique strong value in production", str(context.exception))

    def test_production_accepts_strong_secret_key(self) -> None:
        settings = Settings(
            armm_env="production",
            armm_secret_key="a-very-long-random-secret-value",
            armm_admin_username="admin",
            armm_admin_password="very-secure-admin-pass",
            database_url="sqlite:///./test.db",
        )
        self.assertEqual(settings.armm_secret_key, "a-very-long-random-secret-value")

    def test_rejects_unknown_scheduler_timezone(self) -> None:
        with self.assertRaises(ValidationError) as context:
            Settings(
                armm_env="production",
                armm_secret_key="a-very-long-random-secret-value",
                armm_admin_username="admin",
                armm_admin_password="very-secure-admin-pass",
                armm_scheduler_timezone="Mars/Phobos",
                database_url="sqlite:///./test.db",
            )
        self.assertIn("Unknown ARMM_SCHEDULER_TIMEZONE", str(context.exception))

    def test_rejects_unknown_workshop_metadata_provider(self) -> None:
        with self.assertRaises(ValidationError) as context:
            Settings(
                armm_env="production",
                armm_secret_key="a-very-long-random-secret-value",
                armm_admin_username="admin",
                armm_admin_password="very-secure-admin-pass",
                workshop_metadata_provider="unknown",
                database_url="sqlite:///./test.db",
            )
        self.assertIn("WORKSHOP_METADATA_PROVIDER must be either 'scraper' or 'reforger'", str(context.exception))

    def test_rejects_invalid_reforger_metadata_timeout(self) -> None:
        with self.assertRaises(ValidationError) as context:
            Settings(
                armm_env="production",
                armm_secret_key="a-very-long-random-secret-value",
                armm_admin_username="admin",
                armm_admin_password="very-secure-admin-pass",
                reforger_metadata_timeout_seconds=0,
                database_url="sqlite:///./test.db",
            )
        self.assertIn("REFORGER_METADATA_TIMEOUT_SECONDS must be greater than zero", str(context.exception))
