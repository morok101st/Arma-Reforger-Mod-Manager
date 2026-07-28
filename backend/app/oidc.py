from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import User
from app.modset_service import ensure_user_active_modset

OIDC_STATE_COOKIE_NAME = "armm_oidc_state"
OIDC_STATE_TTL_SECONDS = 10 * 60


def oidc_is_configured() -> bool:
    settings = get_settings()
    return bool(
        settings.oidc_enabled
        and settings.oidc_issuer_url
        and settings.oidc_client_id
        and settings.oidc_client_secret
        and settings.effective_oidc_redirect_uri
    )


async def build_authorization_redirect(response: Response) -> str:
    settings = get_settings()
    metadata = await _discover_provider()
    authorization_endpoint = metadata.get("authorization_endpoint")
    if not isinstance(authorization_endpoint, str) or not authorization_endpoint:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OIDC provider has no authorization endpoint")

    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(64)
    code_challenge = _b64encode(hashlib.sha256(code_verifier.encode("ascii")).digest())
    _set_state_cookie(response, state=state, nonce=nonce, code_verifier=code_verifier)

    params = {
        "response_type": "code",
        "client_id": settings.oidc_client_id,
        "redirect_uri": settings.effective_oidc_redirect_uri,
        "scope": " ".join(settings.oidc_scope_list),
        "state": state,
        "nonce": nonce,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{authorization_endpoint}?{urlencode(params)}"


async def handle_oidc_callback(request: Request, response: Response, db: Session) -> tuple[User, bool]:
    settings = get_settings()
    if not oidc_is_configured():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OIDC login is not enabled")

    error = request.query_params.get("error")
    if error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"OIDC login failed: {error}")

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OIDC callback is missing code or state")

    state_payload = _read_state_cookie(request)
    _clear_state_cookie(response)
    if not state_payload or state_payload.get("state") != state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OIDC state validation failed")

    metadata = await _discover_provider()
    token_endpoint = metadata.get("token_endpoint")
    if not isinstance(token_endpoint, str) or not token_endpoint:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OIDC provider has no token endpoint")

    token_data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": settings.effective_oidc_redirect_uri,
        "client_id": settings.oidc_client_id,
        "code_verifier": state_payload["code_verifier"],
    }
    token_auth = None
    auth_methods = metadata.get("token_endpoint_auth_methods_supported")
    if isinstance(auth_methods, list) and "client_secret_basic" in auth_methods:
        token_auth = (settings.oidc_client_id, settings.oidc_client_secret)
    else:
        token_data["client_secret"] = settings.oidc_client_secret

    async with httpx.AsyncClient(timeout=15.0) as client:
        token_response = await client.post(
            token_endpoint,
            data=token_data,
            auth=token_auth,
            headers={"Accept": "application/json"},
        )
    if token_response.status_code >= 400:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="OIDC token exchange failed")
    token_payload = token_response.json()
    id_token = token_payload.get("id_token")
    if not isinstance(id_token, str) or not id_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="OIDC provider did not return an ID token")

    claims = await _validate_id_token(id_token, metadata, expected_nonce=str(state_payload["nonce"]))
    user, created = _get_or_create_oidc_user(db, claims)
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is disabled")
    user.last_login_at = datetime.now(timezone.utc)
    ensure_user_active_modset(db, user)
    db.commit()
    db.refresh(user)
    return user, created


def _get_or_create_oidc_user(db: Session, claims: dict[str, Any]) -> tuple[User, bool]:
    settings = get_settings()
    issuer = str(claims.get("iss") or "")
    subject = str(claims.get("sub") or "")
    if not issuer or not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="OIDC identity is missing issuer or subject")

    user = db.scalar(select(User).where(User.oidc_issuer == issuer, User.oidc_subject == subject))
    if user:
        email = claims.get(settings.oidc_email_claim)
        if isinstance(email, str) and email:
            user.email = email[:255]
        return user, False

    username = _unique_username(db, _username_from_claims(claims))
    email = claims.get(settings.oidc_email_claim)
    user = User(
        username=username,
        password_hash="",
        oidc_issuer=issuer,
        oidc_subject=subject,
        email=email[:255] if isinstance(email, str) and email else None,
        role="user",
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user, True


def _username_from_claims(claims: dict[str, Any]) -> str:
    settings = get_settings()
    candidates = [
        claims.get(settings.oidc_username_claim),
        claims.get("preferred_username"),
        claims.get("email"),
        claims.get("name"),
        claims.get("sub"),
    ]
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            value = candidate.strip().split("@", 1)[0]
            sanitized = "".join(char if char.isalnum() or char in "_.-" else "-" for char in value)
            sanitized = sanitized.strip(".-_")
            if len(sanitized) >= 3:
                return sanitized[:80]
    return f"oidc-{secrets.token_hex(4)}"


def _unique_username(db: Session, base_username: str) -> str:
    username = base_username[:80]
    suffix = 2
    while db.scalar(select(User).where(func.lower(User.username) == username.casefold())):
        suffix_text = f"-{suffix}"
        username = f"{base_username[: 80 - len(suffix_text)]}{suffix_text}"
        suffix += 1
    return username


async def _discover_provider() -> dict[str, Any]:
    settings = get_settings()
    if not oidc_is_configured():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OIDC login is not enabled")
    issuer = settings.oidc_issuer_url.rstrip("/")
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(f"{issuer}/.well-known/openid-configuration", headers={"Accept": "application/json"})
    if response.status_code >= 400:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OIDC discovery failed")
    metadata = response.json()
    discovered_issuer = metadata.get("issuer")
    if discovered_issuer and str(discovered_issuer).rstrip("/") != issuer:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OIDC issuer mismatch")
    return metadata


async def _validate_id_token(id_token: str, metadata: dict[str, Any], *, expected_nonce: str) -> dict[str, Any]:
    settings = get_settings()
    jwks_uri = metadata.get("jwks_uri")
    if not isinstance(jwks_uri, str) or not jwks_uri:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OIDC provider has no JWKS URI")
    async with httpx.AsyncClient(timeout=15.0) as client:
        jwks_response = await client.get(jwks_uri, headers={"Accept": "application/json"})
    if jwks_response.status_code >= 400:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OIDC JWKS fetch failed")
    jwks = jwks_response.json()
    header = jwt.get_unverified_header(id_token)
    key = _select_jwk(jwks, header)
    algorithms = metadata.get("id_token_signing_alg_values_supported")
    if not isinstance(algorithms, list) or not algorithms:
        algorithms = ["RS256"]
    try:
        claims = jwt.decode(
            id_token,
            key=jwt.PyJWK.from_dict(key).key,
            algorithms=[str(algorithm) for algorithm in algorithms],
            audience=settings.oidc_client_id,
            issuer=settings.oidc_issuer_url.rstrip("/") if settings.oidc_issuer_url else None,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="OIDC ID token validation failed") from exc
    if claims.get("nonce") != expected_nonce:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="OIDC nonce validation failed")
    return claims


def _select_jwk(jwks: dict[str, Any], header: dict[str, Any]) -> dict[str, Any]:
    keys = jwks.get("keys")
    if not isinstance(keys, list):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OIDC JWKS payload is invalid")
    kid = header.get("kid")
    for key in keys:
        if isinstance(key, dict) and (not kid or key.get("kid") == kid):
            return key
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="OIDC signing key not found")


def _set_state_cookie(response: Response, *, state: str, nonce: str, code_verifier: str) -> None:
    settings = get_settings()
    payload = {
        "state": state,
        "nonce": nonce,
        "code_verifier": code_verifier,
        "exp": int(time.time()) + OIDC_STATE_TTL_SECONDS,
    }
    payload_part = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _sign(payload_part, settings.armm_secret_key)
    response.set_cookie(
        key=OIDC_STATE_COOKIE_NAME,
        value=f"{payload_part}.{signature}",
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=OIDC_STATE_TTL_SECONDS,
        path="/",
    )


def _read_state_cookie(request: Request) -> dict[str, Any] | None:
    settings = get_settings()
    token = request.cookies.get(OIDC_STATE_COOKIE_NAME)
    if not token:
        return None
    try:
        payload_part, signature = token.split(".", 1)
    except ValueError:
        return None
    if not hmac.compare_digest(signature, _sign(payload_part, settings.armm_secret_key)):
        return None
    try:
        payload = json.loads(_b64decode(payload_part))
    except (ValueError, json.JSONDecodeError):
        return None
    exp = payload.get("exp")
    if not isinstance(exp, int) or exp < int(time.time()):
        return None
    return payload


def _clear_state_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=OIDC_STATE_COOKIE_NAME,
        path="/",
        secure=settings.is_production,
        samesite="lax",
        httponly=True,
    )


def _sign(payload_part: str, secret: str) -> str:
    return _b64encode(hmac.new(secret.encode("utf-8"), payload_part.encode("ascii"), hashlib.sha256).digest())


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))
