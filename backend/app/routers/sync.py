"""Scoped export-only credentials, independent from browser sessions."""
import hashlib
import hmac
import ipaddress
import secrets
import threading
import time
from collections import OrderedDict
from datetime import datetime, timezone
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import require_admin_user
from app.config import get_settings
from app.database import get_db
from app.models import ModSet, ModsetSyncAccess, User
from app.modset_permissions import require_modset_permission
from app.modset_service import export_modset
from app.router_helpers import audit_event
from app.base_modsets import lock_inheritance_graph
from app.sync_crypto import encrypt_sync_key, decrypt_sync_key

router = APIRouter(tags=["sync"])
NO_CACHE = {"Cache-Control": "no-store", "Pragma": "no-cache"}
# Per-process fixed windows, bounded independently of attacker-controlled input.
_windows: OrderedDict[str, tuple[float, int]] = OrderedDict()
_window_lock = threading.Lock()


def _rate_limit(bucket: str, limit: int) -> None:
    now = time.monotonic()
    with _window_lock:
        start, count = _windows.get(bucket, (now, 0))
        if now - start >= 60:
            start, count = now, 0
        _windows[bucket] = (start, count + 1)
        _windows.move_to_end(bucket)
        while len(_windows) > 4096:
            _windows.popitem(last=False)
        if count >= limit:
            raise HTTPException(429, "Too many sync requests. Try again in a minute.", headers={**NO_CACHE, "Retry-After": "60"})


def _digest(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _creator(db: Session, access: ModsetSyncAccess) -> User | None:
    user = db.get(User, access.creator_user_id) if access.creator_user_id else None
    modset = db.get(ModSet, access.modset_id)
    if not user or not user.is_active or user.role != "admin" or not modset or modset.base_modset_id != access.parent_id_at_creation:
        return None
    try:
        require_modset_permission(db, user, modset.id, "manage")
    except HTTPException:
        return None
    return user


def _status(db: Session, access: ModsetSyncAccess | None) -> dict:
    usable = bool(access and access.is_active and _creator(db, access))
    return {"enabled": bool(access and access.is_active), "usable": usable,
            "created_at": access.created_at.isoformat() if access else None,
            "last_used_at": access.last_used_at.isoformat() if access and access.last_used_at else None,
            "base_url": (get_settings().armm_public_url or "").rstrip("/"),
            "configuration": access.configuration if access else None,
            "key_available": bool(access and access.encrypted_key),
            "downloadable": bool(access and access.configuration and access.encrypted_key and usable)}


@router.get("/admin/sync-access")
def sync_overview(db: Session = Depends(get_db), user: User = Depends(require_admin_user)):
    modsets = db.scalars(select(ModSet).order_by(ModSet.name, ModSet.id)).all()
    accesses = {row.modset_id: row for row in db.scalars(select(ModsetSyncAccess)).all()}
    users = {row.id: row for row in db.scalars(select(User)).all()}
    by_id = {row.id: row for row in modsets}
    rows = []
    for modset in modsets:
        access = accesses.get(modset.id)
        if access is None:
            continue
        parent = by_id.get(modset.base_modset_id)
        owner = users.get(modset.owner_user_id)
        creator = users.get(access.creator_user_id) if access else None
        rows.append({"modset_id": modset.id, "modset_name": modset.name,
                     "owner_username": owner.username if owner else None,
                     "parent_modset_id": modset.base_modset_id,
                     "parent_modset_name": parent.name if parent else None,
                     "created_by": creator.username if creator else None,
                     **_status(db, access)})
    return JSONResponse(rows, headers=NO_CACHE)


@router.get("/modsets/{modset_id}/sync-access")
def sync_status(modset_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin_user)):
    require_modset_permission(db, user, modset_id, "manage")
    return JSONResponse(_status(db, db.get(ModsetSyncAccess, modset_id)), headers=NO_CACHE)


@router.post("/modsets/{modset_id}/sync-access")
def create_sync_access(modset_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin_user)):
    lock_inheritance_graph(db)
    modset = require_modset_permission(db, user, modset_id, "manage")
    # Lock the modset row even when no credential exists yet.
    db.execute(select(ModSet).where(ModSet.id == modset_id).with_for_update()).scalar_one()
    access = db.get(ModsetSyncAccess, modset_id)
    key = "armm_sync_" + secrets.token_urlsafe(32)
    if access is None:
        access = ModsetSyncAccess(modset_id=modset_id)
        db.add(access)
    access.creator_user_id = user.id
    access.key_hash = _digest(key)
    access.encrypted_key = encrypt_sync_key(key)
    access.is_active = True
    access.parent_id_at_creation = modset.base_modset_id
    access.created_at = datetime.now(timezone.utc)
    access.last_used_at = None
    audit_event(db, action="sync_access_created", entity_type="modset", entity_id=str(modset_id), actor=user, request=request)
    return JSONResponse({**_status(db, access), "access_key": key}, headers=NO_CACHE)


@router.delete("/modsets/{modset_id}/sync-access")
def disable_sync_access(modset_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin_user)):
    lock_inheritance_graph(db)
    require_modset_permission(db, user, modset_id, "manage")
    access = db.get(ModsetSyncAccess, modset_id)
    if access:
        access.is_active = False
    audit_event(db, action="sync_access_disabled", entity_type="modset", entity_id=str(modset_id), actor=user, request=request)
    return JSONResponse(_status(db, access), headers=NO_CACHE)


class GameServer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(ge=1, le=65535)
    passwordRequired: bool = False

    @field_validator("host")
    @classmethod
    def valid_host(cls, value: str) -> str:
        value = value.strip()
        if not value or any(c.isspace() for c in value) or any(c in value for c in "/?#@"):
            raise ValueError("Enter a server hostname or IP address without a URL or port.")
        if ":" in value:
            try:
                ipaddress.ip_address(value)
            except ValueError:
                raise ValueError("Enter the host without its port; IPv6 addresses are accepted.")
        return value


class SyncSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=120)
    baseUrl: str = Field(min_length=1, max_length=2048)
    gameServer: GameServer | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Enter a display name.")
        return value.strip()

    @field_validator("baseUrl")
    @classmethod
    def valid_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        parts = urlsplit(value)
        if parts.scheme != "https" or not parts.hostname or parts.username or parts.password or parts.query or parts.fragment or parts.path or any(c.isspace() for c in value):
            raise ValueError("Use the public HTTPS origin, optionally including its port.")
        try:
            if parts.port is not None and not 1 <= parts.port <= 65535:
                raise ValueError()
        except ValueError:
            raise ValueError("Invalid HTTPS port.")
        return value


class SyncConfiguration(SyncSettings):
    accessKey: str = Field(min_length=1, max_length=128, repr=False)


class SyncCreate(SyncSettings):
    modset_id: int = Field(gt=0)


class SyncUpdate(SyncSettings):
    accessKey: str | None = Field(default=None, min_length=1, max_length=128, repr=False)
    replaceKey: bool = False


def _import_file(modset_id: int, settings: dict, key: str) -> JSONResponse:
    config = {"format": "armm-sync", "formatVersion": 1, "name": settings["name"],
              "armm": {"baseUrl": settings["baseUrl"], "modsetId": modset_id,
                       "exportPath": f"/api/sync/modsets/{modset_id}/export", "accessKey": key}}
    if settings.get("gameServer") is not None:
        config["gameServer"] = settings["gameServer"]
    return JSONResponse(config, headers={**NO_CACHE, "Content-Disposition": 'attachment; filename="armm-sync.json"'})


@router.post("/admin/sync-access", status_code=201)
def create_configured_sync(payload: SyncCreate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin_user)):
    lock_inheritance_graph(db)
    modset = require_modset_permission(db, user, payload.modset_id, "manage")
    if db.get(ModsetSyncAccess, modset.id) is not None:
        raise HTTPException(409, "This modset already has sync access. Edit the existing entry.")
    key = "armm_sync_" + secrets.token_urlsafe(32)
    access = ModsetSyncAccess(modset_id=modset.id, creator_user_id=user.id,
        key_hash=_digest(key), encrypted_key=encrypt_sync_key(key), is_active=True,
        parent_id_at_creation=modset.base_modset_id, created_at=datetime.now(timezone.utc),
        configuration=payload.model_dump(exclude={"modset_id"}, exclude_none=True))
    db.add(access)
    audit_event(db, action="sync_access_created", entity_type="modset", entity_id=str(modset.id), actor=user, request=request)
    return JSONResponse(_status(db, access), status_code=201, headers=NO_CACHE)


@router.delete("/admin/sync-access/{modset_id}", status_code=204)
def delete_configured_sync(modset_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin_user)):
    lock_inheritance_graph(db)
    modset = require_modset_permission(db, user, modset_id, "manage")
    access = db.get(ModsetSyncAccess, modset_id)
    if access is None:
        raise HTTPException(404, "Sync access not found.")
    db.delete(access)
    audit_event(db, action="sync_access_deleted", entity_type="modset", entity_id=str(modset_id),
                actor=user, request=request, detail={"modset_name": modset.name})
    return Response(status_code=204, headers=NO_CACHE)


@router.put("/admin/sync-access/{modset_id}")
def update_configured_sync(modset_id: int, payload: SyncUpdate, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin_user)):
    lock_inheritance_graph(db)
    modset = require_modset_permission(db, user, modset_id, "manage")
    access = db.get(ModsetSyncAccess, modset_id)
    if access is None:
        raise HTTPException(404, "Sync access not found.")
    if payload.replaceKey:
        key = "armm_sync_" + secrets.token_urlsafe(32)
        access.key_hash = _digest(key)
        access.encrypted_key = encrypt_sync_key(key)
        access.creator_user_id = user.id
        access.parent_id_at_creation = modset.base_modset_id
        access.created_at = datetime.now(timezone.utc)
        access.last_used_at = None
        access.is_active = True
    else:
        key = decrypt_sync_key(access.encrypted_key)
        if not key:
            key = payload.accessKey or ""
            if not key or not hmac.compare_digest(access.key_hash, _digest(key)):
                raise HTTPException(409, "Enter the existing sync key or explicitly replace it to enable future downloads.")
            access.encrypted_key = encrypt_sync_key(key)
        if not hmac.compare_digest(access.key_hash, _digest(key)):
            raise HTTPException(409, "The stored key cannot be recovered. Replace it explicitly.")
    access.configuration = payload.model_dump(exclude={"accessKey", "replaceKey"}, exclude_none=True)
    audit_event(db, action="sync_access_updated", entity_type="modset", entity_id=str(modset_id), actor=user, request=request)
    return JSONResponse(_status(db, access), headers=NO_CACHE)


@router.get("/admin/sync-access/{modset_id}/configuration")
def download_configured_sync(modset_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin_user)):
    require_modset_permission(db, user, modset_id, "manage")
    access = db.get(ModsetSyncAccess, modset_id)
    if not access or not access.is_active or not _creator(db, access) or not access.configuration:
        raise HTTPException(409, "Complete setup and enable sync access before downloading.", headers=NO_CACHE)
    key = decrypt_sync_key(access.encrypted_key)
    if not key or not hmac.compare_digest(access.key_hash, _digest(key)):
        raise HTTPException(409, "The stored key cannot be recovered. Edit this access to restore or replace it.", headers=NO_CACHE)
    return _import_file(modset_id, access.configuration, key)


@router.post("/modsets/{modset_id}/sync-configuration")
def sync_configuration(modset_id: int, payload: SyncConfiguration, db: Session = Depends(get_db), user: User = Depends(require_admin_user)):
    require_modset_permission(db, user, modset_id, "manage")
    access = db.get(ModsetSyncAccess, modset_id)
    if not access or not access.is_active or not _creator(db, access) or not hmac.compare_digest(access.key_hash, _digest(payload.accessKey)):
        raise HTTPException(409, "Enter the current active key or replace the key first.", headers=NO_CACHE)
    return _import_file(modset_id, payload.model_dump(exclude={"accessKey"}, exclude_none=True), payload.accessKey)


@router.get("/sync/modsets/{modset_id}/export")
def sync_export(modset_id: int, request: Request, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    scheme, _, key = (authorization or "").partition(" ")
    access = db.get(ModsetSyncAccess, modset_id)
    if scheme.lower() != "bearer" or not key.startswith("armm_sync_") or len(key) > 128 or not access or not access.is_active or not hmac.compare_digest(access.key_hash, _digest(key)):
        _rate_limit("ip:" + (request.client.host if request.client else "unknown"), 120)
        raise HTTPException(401, "Invalid sync access.", headers={**NO_CACHE, "WWW-Authenticate": "Bearer"})
    _rate_limit(f"modset:{modset_id}", 600)
    creator = _creator(db, access)
    if creator is None:
        raise HTTPException(403, "Sync access is unavailable. Ask an administrator to renew sync access.", headers=NO_CACHE)
    rows = export_modset(db, creator, modset_id)
    access.last_used_at = datetime.now(timezone.utc)
    db.commit()
    return JSONResponse([row.model_dump() for row in rows], headers=NO_CACHE)
