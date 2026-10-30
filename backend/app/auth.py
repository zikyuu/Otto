"""Who is making the request.

Login is Supabase Auth (Google). The page signs in with Supabase and sends its access token as `Authorization: Bearer ...`;
this module asks Supabase who the token belongs to and makes that user id available to everything below (kv.py and store.py
read it, so each person only ever sees their own documents and learned profile).

Login is only enforced when OTTO_REQUIRE_LOGIN is on and SUPABASE_URL + SUPABASE_ANON_KEY are set. Otherwise every request is
the single local user, exactly as before: development and the tests need no accounts.
"""
from __future__ import annotations

import os
import time
from contextvars import ContextVar

import httpx

LOCAL = "local"
current_user: ContextVar[str] = ContextVar("otto_user", default=LOCAL)

_CACHE: dict[str, tuple[str, str, float]] = {}      # token -> (user id, email, expires at)
_TTL = 60.0
_MAX = 500
_OPEN = ("/api/health", "/api/auth/config", "/api/gcal/callback")      # callable without a token (the callback proves itself with its state)


def required() -> bool:
    return os.getenv("OTTO_REQUIRE_LOGIN", "").lower() in ("1", "true", "yes") and bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_ANON_KEY"))


def public_config() -> dict:
    """What the page needs to start signing in. The anon key is public by design; nothing secret is returned."""
    if not required():
        return {"required": False}
    return {"required": True, "supabase_url": os.environ["SUPABASE_URL"].rstrip("/"), "anon_key": os.environ["SUPABASE_ANON_KEY"]}


async def fetch_user(token: str) -> tuple[str, str] | None:
    """Ask Supabase who owns this token: (user id, email), or None if it is not valid. Works whatever signing key the project uses."""
    try:
        async with httpx.AsyncClient(timeout=8) as c:
            r = await c.get(os.environ["SUPABASE_URL"].rstrip("/") + "/auth/v1/user",
                            headers={"Authorization": f"Bearer {token}", "apikey": os.environ["SUPABASE_ANON_KEY"]})
        if r.status_code != 200:
            return None
        j = r.json()
        return (str(j["id"]), str(j.get("email") or "")) if j.get("id") else None
    except Exception:
        return None


async def user_for(token: str) -> tuple[str, str] | None:
    now = time.time()
    hit = _CACHE.get(token)
    if hit and hit[2] > now:
        return hit[0], hit[1]
    who = await fetch_user(token)
    if who is None:
        _CACHE.pop(token, None)
        return None
    if len(_CACHE) >= _MAX:
        _CACHE.clear()
    _CACHE[token] = (who[0], who[1], now + _TTL)
    return who


class AuthMiddleware:
    """Plain ASGI middleware (not BaseHTTPMiddleware) so the user id reaches the threadpool the endpoints run in."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not required() or not scope["path"].startswith("/api/") \
                or scope["path"] in _OPEN or scope["method"] == "OPTIONS":
            return await self.app(scope, receive, send)
        auth = dict(scope["headers"]).get(b"authorization", b"").decode()
        who = await user_for(auth[7:]) if auth.lower().startswith("bearer ") and len(auth) > 7 else None
        if who is None:
            body = b'{"detail":"sign in required"}'
            await send({"type": "http.response.start", "status": 401, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
            await send({"type": "http.response.body", "body": body})
            return
        token = current_user.set(who[0])
        try:
            await self.app(scope, receive, send)
        finally:
            current_user.reset(token)
