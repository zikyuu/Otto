"""Document store for app state that is not the learned profile: calendar events, goals, the grinder,
wizard results, chat history, Google tokens.

One JSON document per key. Supabase (table `otto_kv`, see migrations/001_otto_kv.sql) when SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY are set; otherwise a local JSON file, so the app works with nothing configured.
If Supabase is configured but a call fails (no table yet, offline), the call falls back to the file instead
of losing the write, and `backend()` says which one is live.

Path override for the file: OTTO_KV_PATH.
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app import auth

_LOCK = threading.RLock()
_client = None
_client_tried = False


def _path() -> Path:
    override = os.getenv("OTTO_KV_PATH")
    return Path(override) if override else Path(__file__).parent.parent / "data" / "kv.json"


def _supabase():
    """The Supabase client, or None when it is not configured. database.py raises on import without keys,
    so it is only imported when both are present."""
    global _client, _client_tried
    if os.getenv("OTTO_KV_BACKEND") == "file":
        return None
    if not (os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SERVICE_ROLE_KEY")):
        return None
    if not _client_tried:
        _client_tried = True
        try:
            from app.database import get_supabase
            _client = get_supabase()
        except Exception:
            _client = None
    return _client


def _scope() -> str:
    """Each signed-in person has their own documents: their keys are stored under a prefix. The single local user has none."""
    uid = auth.current_user.get()
    return "" if uid == auth.LOCAL else f"u.{uid}."


def backend() -> str:
    return "supabase" if _supabase() is not None else "file"


def _read_file() -> dict[str, Any]:
    p = _path()
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text())
        return data if isinstance(data, dict) else {}
    except ValueError:
        return {}


def _write_file(data: dict[str, Any]) -> None:
    p = _path()
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=p.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f)
        os.replace(tmp, p)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def get(key: str, default: Any = None, scoped: bool = True) -> Any:
    key = (_scope() if scoped else "sys.") + key
    with _LOCK:
        sb = _supabase()
        if sb is not None:
            try:
                rows = sb.table("otto_kv").select("value").eq("key", key).limit(1).execute().data
                if rows:
                    return rows[0]["value"]
            except Exception:
                pass
        return _read_file().get(key, default)


def put(key: str, value: Any, scoped: bool = True) -> None:
    key = (_scope() if scoped else "sys.") + key
    with _LOCK:
        data = _read_file()
        data[key] = value          # the file is always written: it is the cache if Supabase is unreachable
        _write_file(data)
        sb = _supabase()
        if sb is not None:
            try:
                sb.table("otto_kv").upsert({"key": key, "value": value, "updated_at": datetime.now(timezone.utc).isoformat()}).execute()
            except Exception:
                pass


def delete(key: str) -> None:
    key = _scope() + key
    with _LOCK:
        data = _read_file()
        if data.pop(key, None) is not None:
            _write_file(data)
        sb = _supabase()
        if sb is not None:
            try:
                sb.table("otto_kv").delete().eq("key", key).execute()
            except Exception:
                pass


def all_keys(prefix: str = "") -> dict[str, Any]:
    """Every stored document of the current person whose key starts with `prefix` (used to hydrate the page in one request)."""
    sc = _scope()
    full = sc + prefix
    with _LOCK:
        out = {k: v for k, v in _read_file().items() if k.startswith(full)}
        sb = _supabase()
        if sb is not None:
            try:
                for row in sb.table("otto_kv").select("key,value").like("key", f"{full}%").execute().data:
                    out[row["key"]] = row["value"]
            except Exception:
                pass
        # the local user's keys never start with "u.", so a prefix like "otto." cannot pick up anybody's scoped documents
        return {k[len(sc):]: v for k, v in out.items()}
