"""Google Calendar OAuth + wall extraction for the web app flow."""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials

load_dotenv()

SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]
REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/google/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

_TOKENS_DIR = Path(__file__).parent.parent / "tokens"


def _client_config() -> dict:
    cid = os.getenv("GOOGLE_CLIENT_ID")
    csecret = os.getenv("GOOGLE_CLIENT_SECRET")
    if cid and csecret:
        return {"web": {
            "client_id": cid, "client_secret": csecret,
            "redirect_uris": [REDIRECT_URI],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }}
    p = Path("credentials.json")
    if p.exists():
        return json.loads(p.read_text())
    return {}


def _token_path(user_id: str) -> Path:
    _TOKENS_DIR.mkdir(exist_ok=True)
    return _TOKENS_DIR / f"google_{user_id}.json"


def _load_creds(user_id: str) -> Credentials | None:
    tp = _token_path(user_id)
    if not tp.exists():
        return None
    creds = Credentials.from_authorized_user_file(str(tp), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        tp.write_text(creds.to_json())
    return creds


def is_connected(user_id: str) -> bool:
    return _token_path(user_id).exists()


def get_auth_url(user_id: str) -> str:
    from google_auth_oauthlib.flow import Flow
    config = _client_config()
    if not config:
        raise RuntimeError(
            "Google credentials not set. Add GOOGLE_CLIENT_ID and "
            "GOOGLE_CLIENT_SECRET to backend/.env"
        )
    flow = Flow.from_client_config(config, SCOPES, redirect_uri=REDIRECT_URI)
    url, _ = flow.authorization_url(state=user_id, access_type="offline", prompt="consent")
    return url


def exchange_code(code: str, user_id: str) -> None:
    from google_auth_oauthlib.flow import Flow
    flow = Flow.from_client_config(_client_config(), SCOPES, redirect_uri=REDIRECT_URI)
    flow.fetch_token(code=code)
    _token_path(user_id).write_text(flow.credentials.to_json())


def get_walls(user_id: str) -> list[dict]:
    from googleapiclient.discovery import build
    creds = _load_creds(user_id)
    if not creds:
        return []

    service = build("calendar", "v3", credentials=creds)
    now = datetime.now()
    monday = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    sunday_end = monday + timedelta(days=7)

    events = service.events().list(
        calendarId="primary",
        timeMin=monday.isoformat() + "Z",
        timeMax=sunday_end.isoformat() + "Z",
        singleEvents=True,
        orderBy="startTime",
    ).execute().get("items", [])

    walls: list[dict] = []
    for ev in events:
        start_raw = ev["start"].get("dateTime")
        end_raw = ev["end"].get("dateTime")
        if not start_raw or not end_raw:
            continue
        start_dt = datetime.fromisoformat(start_raw).replace(tzinfo=None)
        end_dt = datetime.fromisoformat(end_raw).replace(tzinfo=None)
        day = (start_dt - monday).days
        if not 0 <= day <= 6:
            continue
        start_min = start_dt.hour * 60 + start_dt.minute
        end_min = end_dt.hour * 60 + end_dt.minute
        walls.append({
            "day": day,
            "start_min": start_min,
            "end_min": max(end_min, start_min + 30),
            "label": ev.get("summary", "Busy"),
        })
    return walls


def disconnect(user_id: str) -> None:
    tp = _token_path(user_id)
    if tp.exists():
        tp.unlink()
