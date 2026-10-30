"""Google Calendar (read-only) -> calendar events.

OAuth 2 authorization-code flow against Google's endpoints with httpx; nothing here runs unless
GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set, and `status()` says so plainly. Tokens live in the kv store
(`gcal.tokens`). Imported events are marked fixed (Otto plans around them, never moves them) and carry
`source: "gcal"` so a re-sync replaces exactly those and nothing the user made.

Redirect URI (add it to the OAuth client in Google Cloud):  GOOGLE_REDIRECT_URI, default
http://localhost:5173/api/gcal/callback (the Vite dev server proxies /api to the backend).
"""
from __future__ import annotations

import os
import secrets
import time
from datetime import date, datetime, timedelta
from typing import Any
from urllib.parse import urlencode

from app import auth, kv
from app.daynum import day_of

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
TOKENS_KEY = "gcal.tokens"
STATE_KEY = "gcal.state"


class NotConfigured(RuntimeError):
    pass


def configured() -> bool:
    return bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))


def redirect_uri() -> str:
    return os.getenv("GOOGLE_REDIRECT_URI") or "http://localhost:5173/api/gcal/callback"


def status() -> dict[str, Any]:
    tokens = kv.get(TOKENS_KEY)
    return {"configured": configured(), "connected": bool(tokens),
            "redirect_uri": redirect_uri(),
            "hint": None if configured() else "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env, then restart the backend."}


def auth_url() -> str:
    if not configured():
        raise NotConfigured("Google Calendar is not configured")
    state = f"{auth.current_user.get()}~{secrets.token_urlsafe(16)}"      # who is connecting rides along: Google's redirect carries no login
    kv.put(STATE_KEY, state)
    return AUTH_URL + "?" + urlencode({
        "client_id": os.environ["GOOGLE_CLIENT_ID"], "redirect_uri": redirect_uri(), "response_type": "code",
        "scope": SCOPE, "access_type": "offline", "prompt": "consent", "state": state,
    })


def _post_token(data: dict[str, str]) -> dict[str, Any]:
    import httpx
    r = httpx.post(TOKEN_URL, data=data, timeout=15)
    if r.status_code != 200:
        raise RuntimeError(f"Google rejected the request ({r.status_code})")
    return r.json()


def exchange(code: str, state: str) -> None:
    if not configured():
        raise NotConfigured("Google Calendar is not configured")
    if not state or state != kv.get(STATE_KEY):
        raise ValueError("The sign-in did not come from this app")
    kv.delete(STATE_KEY)
    tok = _post_token({"code": code, "client_id": os.environ["GOOGLE_CLIENT_ID"], "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
                       "redirect_uri": redirect_uri(), "grant_type": "authorization_code"})
    kv.put(TOKENS_KEY, {"access_token": tok["access_token"], "refresh_token": tok.get("refresh_token"),
                        "expires_at": time.time() + int(tok.get("expires_in", 3600)) - 60})


def disconnect() -> None:
    kv.delete(TOKENS_KEY)


def _access_token() -> str:
    tokens = kv.get(TOKENS_KEY)
    if not tokens:
        raise NotConfigured("Google Calendar is not connected")
    if tokens.get("expires_at", 0) > time.time():
        return tokens["access_token"]
    if not tokens.get("refresh_token"):
        raise NotConfigured("Google Calendar needs to be connected again")
    fresh = _post_token({"refresh_token": tokens["refresh_token"], "client_id": os.environ["GOOGLE_CLIENT_ID"],
                         "client_secret": os.environ["GOOGLE_CLIENT_SECRET"], "grant_type": "refresh_token"})
    tokens = {**tokens, "access_token": fresh["access_token"], "expires_at": time.time() + int(fresh.get("expires_in", 3600)) - 60}
    kv.put(TOKENS_KEY, tokens)
    return tokens["access_token"]


def to_events(items: list[dict[str, Any]], days: set[date] | None = None) -> list[dict[str, Any]]:
    """Google events -> Otto calendar events. All-day events are skipped (they are not time blocks); an event
    that crosses midnight is clipped to each day it touches."""
    out: list[dict[str, Any]] = []
    for it in items:
        if it.get("status") == "cancelled":
            continue
        s, e = it.get("start", {}), it.get("end", {})
        if "dateTime" not in s or "dateTime" not in e:
            continue
        try:
            a = datetime.fromisoformat(s["dateTime"].replace("Z", "+00:00")).astimezone().replace(tzinfo=None)
            b = datetime.fromisoformat(e["dateTime"].replace("Z", "+00:00")).astimezone().replace(tzinfo=None)
        except ValueError:
            continue
        d = a.date()
        while d <= b.date():
            lo = a if d == a.date() else datetime.combine(d, datetime.min.time())
            hi = b if d == b.date() else datetime.combine(d + timedelta(days=1), datetime.min.time())
            mins = int((hi - lo).total_seconds() // 60)
            if mins > 0 and (days is None or d in days):
                out.append({
                    "id": f"gcal_{it['id']}_{d.isoformat()}", "title": (it.get("summary") or "Busy")[:120],
                    "day": day_of(d), "date_iso": d.isoformat(), "startMin": lo.hour * 60 + lo.minute,
                    "durationMin": min(mins, 24 * 60 - (lo.hour * 60 + lo.minute)), "category": "social" if it.get("attendees") else "admin",
                    "fixed": True, "source": "gcal", "gcal_id": it["id"],
                })
            d += timedelta(days=1)
    return out


def fetch_events(start: date, end: date) -> list[dict[str, Any]]:
    """Events from `start` to `end` inclusive (local dates)."""
    import httpx
    token = _access_token()
    items: list[dict[str, Any]] = []
    params = {"timeMin": datetime.combine(start, datetime.min.time()).astimezone().isoformat(),
              "timeMax": datetime.combine(end + timedelta(days=1), datetime.min.time()).astimezone().isoformat(),
              "singleEvents": "true", "orderBy": "startTime", "maxResults": "250"}
    while True:
        r = httpx.get(EVENTS_URL, params=params, headers={"Authorization": f"Bearer {token}"}, timeout=15)
        if r.status_code == 401:
            raise NotConfigured("Google Calendar needs to be connected again")
        if r.status_code != 200:
            raise RuntimeError(f"Google Calendar returned {r.status_code}")
        body = r.json()
        items += body.get("items", [])
        if not body.get("nextPageToken"):
            break
        params["pageToken"] = body["nextPageToken"]
    days = {start + timedelta(days=i) for i in range((end - start).days + 1)}
    return to_events(items, days)
