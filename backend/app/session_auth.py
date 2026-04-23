from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User

SESSION_COOKIE_NAME = "armm_session"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 7


def create_session_token(user: User) -> str:
    settings = get_settings()
    issued_at = int(time.time())
    payload = {
        "sub": user.id,
        "username": user.username,
        "role": user.role,
        "iat": issued_at,
        "exp": issued_at + SESSION_TTL_SECONDS,
    }
    payload_part = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _sign(payload_part, settings.armm_secret_key)
    return f"{payload_part}.{signature}"


def decode_session_token(token: str) -> dict[str, object] | None:
    settings = get_settings()
    try:
        payload_part, signature = token.split(".", 1)
    except ValueError:
        return None

    expected_signature = _sign(payload_part, settings.armm_secret_key)
    if not hmac.compare_digest(signature, expected_signature):
        return None

    try:
        payload = json.loads(_b64decode(payload_part))
    except (ValueError, json.JSONDecodeError):
        return None

    exp = payload.get("exp")
    if not isinstance(exp, int) or exp < int(time.time()):
        return None
    return payload


def session_expires_at(token: str | None) -> datetime | None:
    if not token:
        return None
    payload = decode_session_token(token)
    exp = payload.get("exp") if payload else None
    if not isinstance(exp, int):
        return None
    return datetime.fromtimestamp(exp, tz=timezone.utc)


def set_session_cookie(response: Response, user: User) -> None:
    settings = get_settings()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=create_session_token(user),
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=SESSION_TTL_SECONDS,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        secure=settings.is_production,
        samesite="lax",
        httponly=True,
    )


def require_current_user(
    session_token: Annotated[str | None, Cookie(alias=SESSION_COOKIE_NAME)] = None,
    db: Session = Depends(get_db),
) -> User:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    payload = decode_session_token(session_token)
    user_id = payload.get("sub") if payload else None
    if not isinstance(user_id, int):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return user


def require_admin_user(current_user: User = Depends(require_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return current_user


def _sign(payload_part: str, secret: str) -> str:
    return _b64encode(hmac.new(secret.encode("utf-8"), payload_part.encode("ascii"), hashlib.sha256).digest())


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))
