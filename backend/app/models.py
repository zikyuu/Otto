"""The data model — the spine of the whole system.

This is the CONTRACT every teammate codes against. The engine, the LLM layer,
the adapters, and the frontend all read/write these shapes. Lock this tonight;
if it's stable, tomorrow parallelizes cleanly.

Nothing here imports from engine/, llm/, or sources/ — those depend on THIS,
never the reverse. That one-way dependency is what keeps the pieces swappable.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Literal, Optional


class Status(str, Enum):
    TODO = "todo"
    DONE = "done"
    MISSED = "missed"


@dataclass
class Skill:
    id: str
    name: str
    proficiency: int = 0  # 0 none .. 3 strong


@dataclass
class Wall:
    """A blocked time the scheduler must not overlap. From a ScheduleSource."""
    day: int           # 0=Mon .. 6=Sun (demo runs a single week)
    start_min: int     # minutes from midnight, e.g. 540 = 09:00
    end_min: int
    label: str = ""


@dataclass
class Profile:
    skills: list[Skill] = field(default_factory=list)
    free_hours_per_day: float = 3.0
    walls: list[Wall] = field(default_factory=list)
    velocity: float = 0.8
    name: str = ""

    def has_skill(self, name: str, min_prof: int = 2) -> bool:
        return any(s.name.lower() == name.lower() and s.proficiency >= min_prof
                   for s in self.skills)

    def to_dict(self) -> dict[str, Any]:
        return {
            "skills": [asdict(s) for s in self.skills],
            "free_hours_per_day": self.free_hours_per_day,
            "walls": [asdict(w) for w in self.walls],
            "velocity": self.velocity,
        }


@dataclass
class Goal:
    """A job the user is targeting. From a JobSource."""
    id: str
    title: str
    jd_text: str = ""
    close_date: str = ""          # ISO date; the hard deadline
    required_skills: list[str] = field(default_factory=list)
    fit: float = 0.5             # 0..1, becomes a priority weight

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Task:
    """A unit of prep/learning. Produced by gap-derivation, placed by the
    scheduler. full/lite variants enable graceful downscoping when behind."""
    id: str
    title: str
    skill_served: str
    goal_id: str
    importance: float                 # weight = fit * urgency, set by engine
    full_minutes: int
    lite_minutes: int
    prereq_ids: list[str] = field(default_factory=list)
    status: Status = Status.TODO

    @property
    def est_minutes(self) -> int:
        return self.full_minutes

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["status"] = self.status.value
        d["est_minutes"] = self.est_minutes
        return d


@dataclass
class Block:
    """Scheduler output: a task placed in a concrete time slot."""
    day: int
    start_min: int
    end_min: int
    task_id: str
    lite: bool = False  # True if scheduled as the downscoped variant

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Plan:
    """The full scheduler output for a week."""
    blocks: list[Block] = field(default_factory=list)
    at_risk: list[str] = field(default_factory=list)   # task_ids that didn't fit
    feasible: bool = True
    tradeoff: Optional[dict] = None  # {"options": [...], "reason": "..."}

    def to_dict(self) -> dict[str, Any]:
        return {
            "blocks": [b.to_dict() for b in self.blocks],
            "at_risk": self.at_risk,
            "feasible": self.feasible,
            "tradeoff": self.tradeoff,
        }


@dataclass
class CompletionEvent:
    task_id: str
    planned_minutes: int
    done: bool
    ts: str = ""


@dataclass
class Resource:
    """A curated learning resource (article, video, or LeetCode problem) linked to a skill task."""
    title: str
    url: str
    type: Literal["article", "video", "leetcode", "other"]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
