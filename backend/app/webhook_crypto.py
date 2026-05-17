from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

WEBHOOK_ENCRYPTED_PREFIX = "enc:"


def _get_fernet() -> Fernet:
    secret = get_settings().armm_secret_key.encode("utf-8")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
    return Fernet(key)


def is_encrypted_webhook_url(value: str) -> bool:
    return value.startswith(WEBHOOK_ENCRYPTED_PREFIX)


def encrypt_webhook_url(webhook_url: str) -> str:
    token = _get_fernet().encrypt(webhook_url.encode("utf-8")).decode("utf-8")
    return f"{WEBHOOK_ENCRYPTED_PREFIX}{token}"


def decrypt_webhook_url(stored_value: str) -> str:
    if not is_encrypted_webhook_url(stored_value):
        return stored_value
    token = stored_value[len(WEBHOOK_ENCRYPTED_PREFIX) :]
    try:
        return _get_fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        return ""
