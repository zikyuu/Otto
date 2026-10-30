"""What each weekly check-in and goal review decided, kept as a short summary instead of the whole conversation.

A full transcript every week would grow without end and nobody reads it back. What is worth keeping is what changed
and why: the settings the user agreed to, the goal changes they approved. Only that is stored, newest last, capped.
"""
from __future__ import annotations

from app import clock

from datetime import datetime
from typing import Any

KEY = "weekly.summaries"
KEEP = 26                   # about six months of weekly check-ins
KINDS = ("weekly_chat", "goal_review")


def clean_item(x: dict[str, Any]) -> dict[str, Any]:
    out = {"label": str(x.get("label") or x.get("key") or "")[:80]}
    for k in ("key", "source", "reason"):
        if x.get(k) not in (None, ""):
            out[k] = str(x[k])[:200]
    if "value" in x and x["value"] is not None:
        out["value"] = x["value"]
    return out


def make(kind: str, text: str, items: list[dict[str, Any]], at: str | None = None) -> dict[str, Any]:
    if kind not in KINDS:
        raise ValueError(f"kind must be one of {KINDS}")
    return {"kind": kind, "at": at or clock.now().isoformat(timespec="minutes"),
            "text": text.strip()[:400], "items": [clean_item(i) for i in items][:12]}


def add(existing: list[dict[str, Any]] | None, entry: dict[str, Any]) -> list[dict[str, Any]]:
    return ((existing or []) + [entry])[-KEEP:]


def brief(existing: list[dict[str, Any]] | None, n: int = 3) -> list[dict[str, str]]:
    """What the chat model is told about earlier check-ins: when, and in one line what was decided."""
    return [{"at": e["at"][:10], "kind": e["kind"], "decided": e["text"]} for e in (existing or [])[-n:]]


def recap_line(entry: dict[str, Any]) -> str:
    """How Otto opens the next check-in."""
    day = datetime.fromisoformat(entry["at"]).strftime("%-d %b")
    return f"Last time ({day}) we settled this: {entry['text']} How has that been working?"
