"""Domain-separated encryption for downloadable sync credentials."""
import base64
import hashlib
from cryptography.fernet import Fernet, InvalidToken
from app.config import get_settings


def _cipher() -> Fernet:
    material = b"armm-sync-access-v1\0" + get_settings().armm_secret_key.encode()
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(material).digest()))


def encrypt_sync_key(key: str) -> str:
    return _cipher().encrypt(key.encode()).decode()


def decrypt_sync_key(value: str | None) -> str:
    if not value:
        return ""
    try:
        return _cipher().decrypt(value.encode()).decode()
    except (InvalidToken, ValueError, UnicodeError):
        return ""
