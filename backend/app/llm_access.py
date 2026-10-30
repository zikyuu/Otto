"""Whose OpenAI key pays for an AI call, and how many calls are allowed.

Without login (local use) nothing changes: the key in OPENAI_API_KEY is used, with no limits.

With login on, the host's key is never open-ended:
  * a person who has saved their own OpenAI key uses it for every AI feature (their cost, not the host's);
  * everyone else gets FREE_REVIEW_CALLS (default 1) goal-review ("wizard") calls on the host's key, ever, and nothing else;
  * the host key also has a daily cap across all people (HOST_DAILY_CAP), so many new accounts cannot run up the bill.
Saved keys are encrypted at rest and are never sent back to the page (only the last four characters).
"""
from __future__ import annotations

import base64
import hashlib
import os
import threading
import time
from collections import deque
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date
from typing import Any

import httpx

from app import auth, kv

FEATURES = ("review", "chat", "narrate", "enrich")      # review = the goal wizard
_feature: ContextVar[str] = ContextVar("otto_llm_feature", default="chat")
_LOCK = threading.RLock()
_RECENT: dict[str, deque] = {}
PER_MINUTE = 10

KEY_DOC, FREE_DOC, HOST_DOC = "llm.key", "llm.free", "llm.host.day"


class Blocked(Exception):
    """The call may not go ahead. `code` tells the page why; `message` is for the person."""

    def __init__(self, code: str, message: str, status: int = 402):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def free_calls() -> int:
    return int(os.getenv("OTTO_FREE_WIZARD_CALLS", "1"))


def host_daily_cap() -> int:
    return int(os.getenv("OTTO_HOST_DAILY_CAP", "30"))


def host_key() -> str | None:
    return os.getenv("OPENAI_API_KEY") or None


@contextmanager
def feature(name: str):
    """Mark which feature the next AI call is for (the call itself is made by main._llm_json)."""
    t = _feature.set(name)
    try:
        yield
    finally:
        _feature.reset(t)


def current_feature() -> str:
    return _feature.get()


# ---- the saved key ---------------------------------------------------------------------------------------

def _fernet():
    from cryptography.fernet import Fernet
    secret = os.getenv("OTTO_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not secret:
        raise Blocked("not_configured", "The server has no secret to protect saved keys with (set OTTO_SECRET_KEY).", 503)
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest()))


def save_key(key: str) -> dict[str, Any]:
    enc = _fernet().encrypt(key.encode()).decode()
    kv.put(KEY_DOC, {"enc": enc, "hint": key[-4:]})
    return {"hint": key[-4:]}


def remove_key() -> None:
    kv.delete(KEY_DOC)


def own_key() -> str | None:
    doc = kv.get(KEY_DOC)
    if not isinstance(doc, dict) or "enc" not in doc:
        return None
    try:
        return _fernet().decrypt(doc["enc"].encode()).decode()
    except Exception:
        return None


def check_key(key: str) -> None:
    """Ask OpenAI whether the key is real (listing models costs nothing). Raises Blocked if it is not."""
    try:
        r = httpx.get("https://api.openai.com/v1/models", headers={"Authorization": f"Bearer {key}"}, timeout=8)
    except Exception:
        raise Blocked("unreachable", "Could not reach OpenAI to check that key. Try again in a moment.", 503)
    if r.status_code in (401, 403):
        raise Blocked("bad_key", "OpenAI did not accept that key.", 422)
    if r.status_code >= 400:
        raise Blocked("bad_key", f"OpenAI answered {r.status_code} when checking that key.", 422)


# ---- the allowance ---------------------------------------------------------------------------------------

def _free_used() -> int:
    d = kv.get(FREE_DOC)
    return int(d.get("used", 0)) if isinstance(d, dict) else 0


def _host_today() -> int:
    d = kv.get(HOST_DOC, scoped=False)
    return int(d["n"]) if isinstance(d, dict) and d.get("day") == date.today().isoformat() else 0


def status() -> dict[str, Any]:
    if not auth.required():
        return {"gated": False, "mode": "host" if host_key() else "none", "ai": bool(host_key()), "own_hint": None, "free_left": 0}
    doc = kv.get(KEY_DOC)
    own = isinstance(doc, dict) and "enc" in doc
    left = max(free_calls() - _free_used(), 0) if host_key() else 0
    return {"gated": True, "mode": "own" if own else ("free" if left else "none"), "ai": own,
            "own_hint": doc["hint"] if own else None, "free_left": left}


def available(feat: str) -> bool:
    """Would an AI call for this feature be allowed right now? (So callers can fall back quietly instead of failing.)"""
    if not auth.required():
        return bool(host_key())
    s = status()
    if s["mode"] == "own":
        return True
    return feat == "review" and s["free_left"] > 0 and _host_today() < host_daily_cap()


def resolve(feat: str) -> tuple[str, str]:
    """-> (key, source) with source 'host', 'own' or 'free'. Raises Blocked."""
    if not auth.required():
        k = host_key()
        if not k:
            raise Blocked("no_key", "OPENAI_API_KEY not configured", 503)
        return k, "host"
    uid = auth.current_user.get()
    now = time.time()
    with _LOCK:
        q = _RECENT.setdefault(uid, deque())
        while q and q[0] < now - 60:
            q.popleft()
        if len(q) >= PER_MINUTE:
            raise Blocked("slow_down", "That is a lot of AI calls in a minute. Wait a moment.", 429)
        q.append(now)
    k = own_key()
    if k:
        return k, "own"
    if feat != "review":
        raise Blocked("needs_key", "This AI feature uses your own OpenAI key. Add it on the Rules page; everything else in Otto works without one.")
    if free_calls() - _free_used() <= 0:
        raise Blocked("free_used", "Your free goal review has been used. Add your own OpenAI key on the Rules page to keep using the wizard.")
    if not host_key():
        raise Blocked("needs_key", "AI is not switched on for this server. Add your own OpenAI key on the Rules page.")
    if _host_today() >= host_daily_cap():
        raise Blocked("host_cap", "The free AI allowance for today has run out. Add your own OpenAI key on the Rules page, or try tomorrow.")
    return host_key(), "free"


def charge(source: str) -> None:
    """Count a successful call against the allowance it used."""
    if source != "free":
        return
    with _LOCK:
        kv.put(FREE_DOC, {"used": _free_used() + 1})
        n = _host_today() + 1
        kv.put(HOST_DOC, {"day": date.today().isoformat(), "n": n}, scoped=False)
