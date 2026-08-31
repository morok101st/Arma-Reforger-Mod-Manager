#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import signal
import subprocess
import tempfile
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

INSTALL_DIR = Path(os.environ.get("REFORGER_INSTALL_DIR", "/opt/reforger-server"))
BINARY = INSTALL_DIR / "ArmaReforgerServer"
PORT = int(os.environ.get("REFORGER_METADATA_PORT", "8081"))
TIMEOUT_SECONDS = int(os.environ.get("REFORGER_METADATA_TIMEOUT_SECONDS", "180"))
SETTLE_SECONDS = float(os.environ.get("REFORGER_METADATA_SETTLE_SECONDS", "8"))
POLL_SECONDS = float(os.environ.get("REFORGER_METADATA_POLL_SECONDS", "0.5"))
KEEP_WORKDIR = os.environ.get("REFORGER_KEEP_WORKDIR", "false").casefold() == "true"
BASE_WORKDIR = Path(os.environ.get("REFORGER_WORKDIR", "/tmp"))


def fetch_metadata(mod_ids: list[str]) -> list[dict[str, Any]]:
    normalized_ids = [mod_id.strip().upper() for mod_id in mod_ids if mod_id.strip()]
    if not normalized_ids:
        return []

    resolved: list[dict[str, Any]] = []
    for mod_id in dict.fromkeys(normalized_ids):
        resolved.append(_probe_metadata_for_one(mod_id))
    return resolved


def _probe_metadata_for_one(mod_id: str) -> dict[str, Any]:
    if not BINARY.exists():
        raise RuntimeError(f"ArmaReforgerServer not found at {BINARY}")

    workdir = Path(tempfile.mkdtemp(prefix="armm-reforger-metadata-", dir=str(BASE_WORKDIR)))
    profile_dir = workdir / "profile"
    profile_dir.mkdir(parents=True, exist_ok=True)
    started_at = time.monotonic()
    print(f"metadata probe started mod={mod_id}", flush=True)
    try:
        (workdir / BINARY.name).symlink_to(BINARY)
        addon_source = INSTALL_DIR / "addons"
        if addon_source.exists():
            (workdir / "addons").symlink_to(addon_source, target_is_directory=True)

        config_path = workdir / "download_queue.json"
        config_path.write_text(json.dumps(_server_config([mod_id]), indent=2), encoding="utf-8")
        stdout_path = workdir / "stdout.log"
        stderr_path = workdir / "stderr.log"
        with stdout_path.open("wb") as stdout_file, stderr_path.open("wb") as stderr_file:
            process = subprocess.Popen(
                [
                    f"./{BINARY.name}",
                    "-config",
                    str(config_path),
                    "-profile",
                    str(profile_dir),
                    "-headless",
                    "-backendlog",
                    "-noHome",
                ],
                cwd=str(workdir),
                stdout=stdout_file,
                stderr=stderr_file,
            )
            deadline = time.monotonic() + TIMEOUT_SECONDS
            first_seen_at: float | None = None
            last_change_at: float | None = None
            last_seen_ids: set[str] = set()
            while time.monotonic() < deadline:
                parsed = _read_server_data(profile_dir, ignore_invalid=True)
                if mod_id in parsed:
                    now = time.monotonic()
                    parsed_ids = {mod_id}
                    if first_seen_at is None:
                        first_seen_at = now
                        last_change_at = now
                        last_seen_ids = parsed_ids
                    elif parsed_ids != last_seen_ids:
                        last_change_at = now
                        last_seen_ids = parsed_ids
                    elif last_change_at is not None and now - last_change_at >= SETTLE_SECONDS:
                        _terminate(process)
                        result = parsed[mod_id]
                        _log_probe_result(mod_id, result, started_at)
                        return result
                if process.poll() is not None:
                    parsed = _read_server_data(profile_dir, ignore_invalid=False)
                    if mod_id not in parsed:
                        raise RuntimeError(_failure_message(process.returncode, [mod_id], stdout_path, stderr_path))
                    result = parsed[mod_id]
                    _log_probe_result(mod_id, result, started_at)
                    return result
                time.sleep(POLL_SECONDS)

            parsed = _read_server_data(profile_dir, ignore_invalid=True)
            _terminate(process)
            if mod_id in parsed:
                result = parsed[mod_id]
                _log_probe_result(mod_id, result, started_at)
                return result
            raise TimeoutError(_failure_message(None, [mod_id], stdout_path, stderr_path, prefix=f"Timed out after {TIMEOUT_SECONDS}s"))
    finally:
        if not KEEP_WORKDIR:
            shutil.rmtree(workdir, ignore_errors=True)


def _server_config(mod_ids: list[str]) -> dict[str, Any]:
    return {
        "bindAddress": "127.0.0.1",
        "bindPort": 2001,
        "publicAddress": "127.0.0.1",
        "publicPort": 2001,
        "game": {
            "name": "ARMM metadata probe",
            "scenarioId": "{ECC61978EDCC2B5A}Missions/23_Campaign.conf",
            "maxPlayers": 1,
            "visible": False,
            "mods": [{"modId": mod_id, "name": mod_id, "version": ""} for mod_id in mod_ids],
        },
    }


def _read_server_data(workdir: Path, *, ignore_invalid: bool) -> dict[str, dict[str, Any]]:
    parsed: dict[str, dict[str, Any]] = {}
    for path in workdir.rglob("ServerData.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8").lstrip("\ufeff"))
            mod = _metadata_from_server_data(payload)
        except Exception:
            if ignore_invalid:
                continue
            raise
        parsed[mod["id"]] = mod
    return parsed


def _metadata_from_server_data(data: dict[str, Any]) -> dict[str, Any]:
    revision = data.get("revision") if isinstance(data.get("revision"), dict) else {}
    mod_id = _string_value(data, "id") or _string_value(data, "modId")
    if not mod_id:
        raise ValueError("ServerData.json has no id")
    latest_version = _string_value(revision, "version") or _string_value(data, "version")
    return {
        "id": mod_id.upper(),
        "name": _string_value(data, "name"),
        "summary": _string_value(data, "summary"),
        "description": _string_value(data, "description"),
        "latest_version": latest_version,
        "game_version": _string_value(revision, "gameVersion") or _string_value(data, "gameVersion"),
        "size": _string_value(revision, "size") or _string_value(data, "size"),
        "changelog": _string_value(revision, "changelog"),
        "dependencies": _parse_dependencies(revision.get("dependencies")),
    }


def _parse_dependencies(value: Any) -> list[dict[str, str | None]]:
    if not isinstance(value, list):
        return []
    dependencies: list[dict[str, str | None]] = []
    for entry in value:
        if isinstance(entry, str):
            dependency_id = entry.strip().upper()
            if dependency_id:
                dependencies.append({"id": dependency_id, "name": dependency_id, "url": None})
            continue
        if not isinstance(entry, dict):
            continue
        dependency_id = _string_value(entry, "id") or _string_value(entry, "modId")
        name = _string_value(entry, "name") or dependency_id
        if not name:
            continue
        dependency = {"name": name, "url": None}
        if dependency_id:
            dependency["id"] = dependency_id.upper()
        dependencies.append(dependency)
    return dependencies


def _log_probe_result(mod_id: str, mod: dict[str, Any], started_at: float) -> None:
    dependency_count = len(mod.get("dependencies", []))
    elapsed = time.monotonic() - started_at
    print(
        f"metadata probe finished mod={mod_id} dependencies={dependency_count} elapsed={elapsed:.1f}s",
        flush=True,
    )


def _string_value(data: dict[str, Any], key: str) -> str | None:
    value = data.get(key)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _terminate(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=10)


def _failure_message(return_code: int | None, missing: list[str], stdout_path: Path, stderr_path: Path, *, prefix: str = "Reforger metadata failed") -> str:
    stderr = _tail(stderr_path)
    stdout = _tail(stdout_path)
    detail = stderr or stdout or "no output"
    code = f" exit={return_code}" if return_code is not None else ""
    return f"{prefix}{code}; missing={','.join(missing)}; {detail}"


def _tail(path: Path, max_chars: int = 1000) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")[-max_chars:].strip()
    except FileNotFoundError:
        return ""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if urlparse(self.path).path != "/health":
            self._json({"detail": "Not found"}, HTTPStatus.NOT_FOUND)
            return
        self._json({"status": "ok", "binary": str(BINARY), "binary_exists": BINARY.exists()})

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/mods":
            self._json({"detail": "Not found"}, HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            mod_ids = payload.get("mod_ids")
            if not isinstance(mod_ids, list) or not all(isinstance(mod_id, str) for mod_id in mod_ids):
                self._json({"detail": "mod_ids must be a list of strings"}, HTTPStatus.BAD_REQUEST)
                return
            self._json({"mods": fetch_metadata(mod_ids)})
        except TimeoutError as exc:
            self._json({"detail": str(exc)}, HTTPStatus.GATEWAY_TIMEOUT)
        except Exception as exc:
            self._json({"detail": str(exc)}, HTTPStatus.BAD_GATEWAY)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} - {format % args}", flush=True)

    def _json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Reforger metadata service listening on 0.0.0.0:{PORT}", flush=True)
    signal.signal(signal.SIGTERM, lambda _signum, _frame: server.shutdown())
    server.serve_forever()


if __name__ == "__main__":
    main()
