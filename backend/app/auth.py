from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import User

SESSION_COOKIE_NAME = "armm_session"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 7
PASSWORD_ITERATIONS = 210_000
FAILED_LOGIN_WINDOW_SECONDS = 60
FAILED_LOGIN_LIMIT = 8

_failed_logins: dict[str, list[float]] = {}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PASSWORD_ITERATIONS,
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations_value, salt_value, digest_value = password_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_value)
        salt = base64.urlsafe_b64decode(salt_value.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_value.encode("ascii"))
    except (ValueError, TypeError):
        return False

    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(actual, expected)


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
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


def bootstrap_admin(db: Session) -> None:
    settings = get_settings()
    existing_admin = db.scalar(select(User).where(User.role == "admin"))
    if existing_admin:
        return

    if not settings.armm_admin_username or not settings.armm_admin_password:
        if settings.is_production:
            raise RuntimeError("ARMM_ADMIN_USERNAME and ARMM_ADMIN_PASSWORD are required for first production startup")
        return

    db.add(
        User(
            username=settings.armm_admin_username,
            password_hash=hash_password(settings.armm_admin_password),
            role="admin",
            is_active=True,
        )
    )
    db.commit()


def authenticate_user(db: Session, username: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.username == username))
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


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


def enforce_origin_for_unsafe_methods(request: Request) -> None:
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return

    origin = request.headers.get("origin")
    if not origin:
        return

    settings = get_settings()
    allowed_origins = set(settings.cors_origin_list)
    forwarded_proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("host")
    if host:
        allowed_origins.add(f"{forwarded_proto}://{host}")

    if origin not in allowed_origins:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Origin not allowed")


def check_login_rate_limit(request: Request, username: str) -> None:
    key = f"{request.client.host if request.client else 'unknown'}:{username.casefold()}"
    now = time.time()
    attempts = [attempt for attempt in _failed_logins.get(key, []) if now - attempt < FAILED_LOGIN_WINDOW_SECONDS]
    _failed_logins[key] = attempts
    if len(attempts) >= FAILED_LOGIN_LIMIT:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many login attempts")


def record_failed_login(request: Request, username: str) -> None:
    key = f"{request.client.host if request.client else 'unknown'}:{username.casefold()}"
    _failed_logins.setdefault(key, []).append(time.time())


def clear_failed_logins(request: Request, username: str) -> None:
    key = f"{request.client.host if request.client else 'unknown'}:{username.casefold()}"
    _failed_logins.pop(key, None)


def _sign(payload_part: str, secret: str) -> str:
    return _b64encode(hmac.new(secret.encode("utf-8"), payload_part.encode("ascii"), hashlib.sha256).digest())


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))
