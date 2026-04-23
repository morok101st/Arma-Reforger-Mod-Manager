import time

from fastapi import HTTPException, Request, status

FAILED_LOGIN_WINDOW_SECONDS = 60
FAILED_LOGIN_LIMIT = 8

_failed_logins: dict[str, list[float]] = {}


def check_login_rate_limit(request: Request, username: str) -> None:
    key = _login_attempt_key(request, username)
    now = time.time()
    attempts = [attempt for attempt in _failed_logins.get(key, []) if now - attempt < FAILED_LOGIN_WINDOW_SECONDS]
    _failed_logins[key] = attempts
    if len(attempts) >= FAILED_LOGIN_LIMIT:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many login attempts")


def record_failed_login(request: Request, username: str) -> None:
    _failed_logins.setdefault(_login_attempt_key(request, username), []).append(time.time())


def clear_failed_logins(request: Request, username: str) -> None:
    _failed_logins.pop(_login_attempt_key(request, username), None)


def _login_attempt_key(request: Request, username: str) -> str:
    return f"{request.client.host if request.client else 'unknown'}:{username.casefold()}"
