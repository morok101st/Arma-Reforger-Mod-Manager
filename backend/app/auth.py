from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.admin_bootstrap import bootstrap_admin
from app.config import get_settings
from app.login_protection import check_login_rate_limit, clear_failed_logins, record_failed_login
from app.models import User
from app.passwords import PASSWORD_ITERATIONS, hash_password, verify_password
from app.session_auth import (
    SESSION_COOKIE_NAME,
    SESSION_TTL_SECONDS,
    clear_session_cookie,
    create_session_token,
    decode_session_token,
    require_admin_user,
    require_current_user,
    session_expires_at,
    set_session_cookie,
)


def authenticate_user(db: Session, username: str, password: str) -> User | None:
    user = db.scalar(select(User).where(func.lower(User.username) == username.casefold()))
    if not user or not user.is_active:
        return None
    if not user.password_hash:
        return None
    if not verify_password(password, user.password_hash):
        return None
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return user


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
