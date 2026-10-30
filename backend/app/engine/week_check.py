"""Feasibility, tradeoff and recovery for the calendar (engine, deterministic).

Works on calendar events, the same dicts /api/schedule takes, and the learned profile. No LLM.

week_check  Is the rest of the visible week more than the user honestly gets through? Planned work is stretched by
            the learned velocity of each category and compared with the free time left, scaled by planning bias. When it is over, the two competing pieces of work to choose between are named.
downscope   Shrink the chosen-against work to a lite version instead of dropping it.
recovery    The one thing to start with after a rough stretch, and one thing to shrink instead of skipping.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any

from app.engine.calendar_bridge import to_category
from app.engine.oversleep import score
from app.models import Profile

_SESSION = re.compile(r"\s*\(\d+/\d+\)$")
MIN_LITE = 15


def _group(e: dict[str, Any]) -> str:
    return e.get("split_of") or e["id"]


def _base_title(e: dict[str, Any]) -> str:
    return e.get("base_title") or _SESSION.sub("", e["title"])


def _open(e: dict[str, Any]) -> bool:
    return not e.get("fixed") and not e.get("done") and not (e.get("reflection") or {}).get("choice")


def _upcoming(e: dict[str, Any], week_days: list[int], today_day: int | None, now_min: int) -> bool:
    if e["day"] not in week_days:
        return False
    if today_day is None or today_day not in week_days:
        return True
    i, t = week_days.index(e["day"]), week_days.index(today_day)
    return i > t or (i == t and e["startMin"] + e["durationMin"] > now_min)


def _free_minutes(events: list[dict[str, Any]], week_days: list[int], today_day: int | None, now_min: int, profile: Profile) -> int:
    end = min(profile.day_end_min, 24 * 60)
    total = 0
    for d in week_days:
        if today_day in week_days and week_days.index(d) < week_days.index(today_day):
            continue
        start = max(profile.day_start_min, now_min if d == today_day else 0)
        if end <= start:
            continue
        busy = sum(max(0, min(e["startMin"] + e["durationMin"], end) - max(e["startMin"], start))
                   for e in events if e["day"] == d and e.get("fixed"))
        total += end - start - busy
    return total


def week_check(events: list[dict[str, Any]], week_days: list[int], profile: Profile, *,
               today: date, today_day: int | None, now_min: int) -> dict[str, Any]:
    todo = [e for e in events if _open(e) and _upcoming(e, week_days, today_day, now_min)]
    planned = sum(e["durationMin"] for e in todo)
    pace_need = sum(e["durationMin"] * profile.avg_velocity.get(to_category(e.get("category")).value, 1.0) for e in todo)
    free = _free_minutes(events, week_days, today_day, now_min, profile)
    capacity = int(free * profile.planning_bias)     # the share of free time the user can honestly plan into
    over = pace_need > capacity and bool(todo)
    out: dict[str, Any] = {
        "overcommitted": over, "planned_min": planned, "need_min": int(pace_need), "capacity_min": capacity,
        "free_min": free, "overshoot_min": max(0, int(pace_need - capacity)), "trade": None,
    }
    if not over:
        return out
    # the pieces of work that compete: ranked by what is at stake, grouped so a split task counts once
    groups: dict[str, list[dict[str, Any]]] = {}
    for e in todo:
        groups.setdefault(_group(e), []).append(e)
    ranked = sorted(groups.values(), key=lambda g: -max(score(e, events, today) for e in g))
    picked = [g for g in ranked if any(e.get("deadline_iso") or e.get("non_negotiable") for e in g)][:2]
    if len(picked) < 2:
        picked = (picked + [g for g in ranked if g not in picked])[:2]
    if len(picked) == 2:
        out["trade"] = {"a": _side(picked[0], events, today), "b": _side(picked[1], events, today)}
    return out


def _side(group: list[dict[str, Any]], events: list[dict[str, Any]], today: date) -> dict[str, Any]:
    first = min(group, key=lambda e: (e["day"], e["startMin"]))
    dl = next((e.get("deadline_iso") for e in group if e.get("deadline_iso")), None)
    label = "No deadline"
    if dl:
        try:
            label = date.fromisoformat(dl[:10]).strftime("CLOSES %A").upper() if e_hard(group) else date.fromisoformat(dl[:10]).strftime("%A").upper()
        except ValueError:
            pass
    elif any(e.get("non_negotiable") for e in group):
        label = "NON-NEGOTIABLE"
    return {"ids": [e["id"] for e in group], "title": _base_title(first), "minutes": sum(e["durationMin"] for e in group),
            "label": label, "category": first.get("category", "admin")}


def e_hard(group: list[dict[str, Any]]) -> bool:
    return any(e.get("hard_deadline", True) for e in group if e.get("deadline_iso"))


def downscope(events: list[dict[str, Any]], ids: list[str], factor: float = 0.5) -> dict[str, Any]:
    """Shorten the named events to a lite version (default half, never under 15 min, on a 5-minute step)."""
    want = set(ids)
    out, changed = [], []
    for e in events:
        if e["id"] in want and not e.get("fixed"):
            new = max(MIN_LITE, int(round(e["durationMin"] * factor / 5.0)) * 5)
            if new < e["durationMin"]:
                changed.append({"id": e["id"], "from_min": e["durationMin"], "to_min": new})
                e = {**e, "durationMin": new}
        out.append(e)
    return {"events": out, "changed": changed}


def recovery(events: list[dict[str, Any]], week_days: list[int], profile: Profile, *,
             today: date, today_day: int | None, now_min: int) -> dict[str, Any]:
    todo = [e for e in events if _open(e) and _upcoming(e, week_days, today_day, now_min)]
    if not todo:
        return {"focus": None, "shrink": None}
    ranked = sorted(todo, key=lambda e: (-score(e, events, today), e["day"], e["startMin"]))
    focus = ranked[0]
    # one clean win: a small piece of the top task, so starting is cheap
    start_min = max(MIN_LITE, min(focus["durationMin"], int(round(min(focus["durationMin"], 45) / 5.0)) * 5))
    big = next((e for e in ranked[1:] if e["durationMin"] >= 45), None)
    shrink = None
    if big:
        to = max(MIN_LITE, int(round(big["durationMin"] * 0.3 / 5.0)) * 5)
        shrink = {"id": big["id"], "title": big["title"], "from_min": big["durationMin"], "to_min": to}
    return {"focus": {"id": focus["id"], "title": focus["title"], "minutes": start_min, "category": focus.get("category", "admin")},
            "shrink": shrink}
