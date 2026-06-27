"""Swappable adapters — the "integrations are next" story, kept honest.

ScheduleSource -> Wall[] :  ManualSource (works) | GoogleCalendarSource (works)
JobSource      -> Goal   :  PasteJDSource (works) | ExaJobSource (stub)

The engine reads only Wall[] and Goal. It never knows which adapter produced
them, so adding Calendar or Exa tomorrow is a drop-in, not a rewrite.
"""
from __future__ import annotations

import os
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from pathlib import Path

from app.models import Goal, Wall
from app.llm.extract import parse_jd


# ---- schedule sources -----------------------------------------------------

class ScheduleSource(ABC):
    @abstractmethod
    def walls(self) -> list[Wall]: ...


class ManualSource(ScheduleSource):
    """Walls the user typed into our own UI. The demo backbone."""
    def __init__(self, raw_walls: list[dict]):
        self._raw = raw_walls

    def walls(self) -> list[Wall]:
        return [Wall(day=w["day"], start_min=w["start_min"],
                     end_min=w["end_min"], label=w.get("label", "")) for w in self._raw]


class GoogleCalendarSource(ScheduleSource):
    """Read-only Google Calendar sync. OAuth2, pulls busy-blocks, maps to Wall[].

    Usage:
        source = GoogleCalendarSource(credentials_path="credentials.json",
                                      token_path="token.json")
        walls = source.walls()  # Wall[] for the current week

    First run opens a browser for OAuth consent. Subsequent runs reuse the
    saved token. Requires a Google Cloud project with the Calendar API enabled
    and an OAuth 2.0 client ID (Desktop type) downloaded as credentials.json.
    """

    SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]

    def __init__(
        self,
        credentials_path: str = "credentials.json",
        token_path: str = "token.json",
        calendar_id: str = "primary",
        week_start: datetime | None = None,
    ):
        self._credentials_path = credentials_path
        self._token_path = token_path
        self._calendar_id = calendar_id
        self._week_start = week_start

    def _get_credentials(self):
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow

        creds = None
        token = Path(self._token_path)
        if token.exists():
            creds = Credentials.from_authorized_user_file(str(token), self.SCOPES)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(
                    self._credentials_path, self.SCOPES,
                )
                creds = flow.run_local_server(port=0)
            token.write_text(creds.to_json())
        return creds

    def _monday_of_week(self) -> datetime:
        if self._week_start:
            return self._week_start
        now = datetime.now()
        return now - timedelta(days=now.weekday())

    def walls(self) -> list[Wall]:
        from googleapiclient.discovery import build

        creds = self._get_credentials()
        service = build("calendar", "v3", credentials=creds)

        monday = self._monday_of_week()
        monday_midnight = monday.replace(hour=0, minute=0, second=0, microsecond=0)
        sunday_end = monday_midnight + timedelta(days=7)

        events_result = service.events().list(
            calendarId=self._calendar_id,
            timeMin=monday_midnight.isoformat() + "Z",
            timeMax=sunday_end.isoformat() + "Z",
            singleEvents=True,
            orderBy="startTime",
        ).execute()

        walls: list[Wall] = []
        for event in events_result.get("items", []):
            start_raw = event["start"].get("dateTime")
            end_raw = event["end"].get("dateTime")

            if not start_raw or not end_raw:
                # all-day event — block the full waking window
                date_str = event["start"].get("date", "")
                try:
                    d = datetime.fromisoformat(date_str)
                    day = (d - monday_midnight).days
                    if 0 <= day <= 6:
                        walls.append(Wall(day=day, start_min=0, end_min=24 * 60,
                                          label=event.get("summary", "All day")))
                except ValueError:
                    continue
                continue

            start_dt = datetime.fromisoformat(start_raw).replace(tzinfo=None)
            end_dt = datetime.fromisoformat(end_raw).replace(tzinfo=None)
            day = (start_dt - monday_midnight).days
            if not 0 <= day <= 6:
                continue

            start_min = start_dt.hour * 60 + start_dt.minute
            end_min = end_dt.hour * 60 + end_dt.minute
            if end_min <= start_min:
                end_min = start_min + 30

            walls.append(Wall(
                day=day,
                start_min=start_min,
                end_min=end_min,
                label=event.get("summary", "Busy"),
            ))

        return walls


# ---- job sources ----------------------------------------------------------

class JobSource(ABC):
    @abstractmethod
    def goals(self) -> list[Goal]: ...


class PasteJDSource(JobSource):
    """User pastes one or more JDs. The demo backbone."""
    def __init__(self, jds: list[str]):
        self._jds = jds

    def goals(self) -> list[Goal]:
        return [parse_jd(jd, goal_id=f"job{i+1}") for i, jd in enumerate(self._jds)]


class ExaJobSource(JobSource):
    """STRETCH. Light 'roles matching your resume' gesture via Exa semantic
    search. Time-boxed tomorrow; NOT the focus (matching is 'Sup's turf)."""
    def goals(self) -> list[Goal]:
        raise NotImplementedError("Exa job-match adapter — stretch goal.")
