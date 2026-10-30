"""What time it is for the person, not for the server.

A hosted server runs on UTC, the person does not. The page sends its own local time with every API call (`X-Client-Now`), and
everything that needs "now" or "today" asks here. With no header (scripts, tests) it is the machine's own clock.
"""
from __future__ import annotations

from contextvars import ContextVar
from datetime import date, datetime

_now: ContextVar[datetime | None] = ContextVar("otto_client_now", default=None)


def now() -> datetime:
    return _now.get() or datetime.now()


def today() -> date:
    return now().date()


def parse(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value.strip()[:19])         # local wall-clock time, no zone: "2026-10-15T12:12:00"
    except ValueError:
        return None


class ClockMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        raw = dict(scope["headers"]).get(b"x-client-now", b"").decode()
        t = _now.set(parse(raw)) if raw else None
        try:
            await self.app(scope, receive, send)
        finally:
            if t is not None:
                _now.reset(t)
