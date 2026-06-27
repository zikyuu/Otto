"""Swappable adapters — the "integrations are next" story, kept honest.

ScheduleSource -> Wall[] :  ManualSource (works) | GoogleCalendarSource (stub)
JobSource      -> Goal   :  PasteJDSource (works) | ExaJobSource (stub)

The engine reads only Wall[] and Goal. It never knows which adapter produced
them, so adding Calendar or Exa tomorrow is a drop-in, not a rewrite.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

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
    """STRETCH (read-only). Day-two: OAuth, pull busy-blocks, map to Wall[].
    Lands here with zero downstream change. Not wired tonight."""
    def walls(self) -> list[Wall]:
        raise NotImplementedError("Google Calendar adapter — stretch goal.")


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
