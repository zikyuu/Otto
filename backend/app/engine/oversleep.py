"""Oversleep / late start (engine, deterministic).

The user opens the app 2h+ after the first planned event of the day. Otto does not nag: it ranks what is left,
proposes a "non-negotiable line" (above it still fits today, below it goes to the Meatball Grinder) and applies
whichever of the three recoveries the user picks:

  reschedule   re-place what is above the line from now on; the rest is parked
  keep         change nothing; what already passed stays as ghost blocks
  write_off    flexible work today is parked (fixed events stay); optionally the best of it is held for
               tomorrow morning

Ranking is the same idea as the scheduler's priority (deadline pressure, non-negotiable, blocking others, hard
deadline), computed from the calendar events directly.
"""
from __future__ import annotations

from app import clock

from datetime import date, datetime, timedelta
from typing import Any

from app.engine.calendar_bridge import reschedule_events
from app.models import Profile

GRACE_MIN = 120          # late = the first planned event started this long ago and the app was only just opened
LATE_WEEK_THRESHOLD = 3  # this many late starts in 7 days -> offer to move the planned start


def first_start(events: list[dict[str, Any]], day: int) -> int | None:
    starts = [e["startMin"] for e in events if e["day"] == day]
    return min(starts) if starts else None


def detect(events: list[dict[str, Any]], day: int, now_min: int, grace: int = GRACE_MIN) -> dict[str, Any]:
    first = first_start(events, day)
    late_by = (now_min - first) if first is not None else 0
    return {"late": first is not None and late_by >= grace, "first_start": first, "late_by_min": max(late_by, 0)}


def _days_left(e: dict[str, Any], today: date) -> float | None:
    iso = e.get("deadline_iso")
    if not iso:
        return None
    try:
        return (date.fromisoformat(iso[:10]) - today).days
    except ValueError:
        return None


def score(e: dict[str, Any], events: list[dict[str, Any]], today: date) -> float:
    """0..1, higher = keep it today. Fixed events are not ranked: they cannot be moved."""
    dl = _days_left(e, today)
    urgency = 0.0 if dl is None else max(0.0, min(1.0, 1.0 - dl / 14.0))
    if dl is not None and dl <= 0:
        urgency = 1.0
    hard = 1.0 if (e.get("deadline_iso") and e.get("hard_deadline", True)) else 0.0
    blocks = sum(1 for o in events if e["id"] in (o.get("prereq_ids") or []))
    return round(0.40 * urgency + 0.25 * (1.0 if e.get("non_negotiable") else 0.0)
                 + 0.15 * min(blocks, 3) / 3 + 0.10 * hard + 0.10 * min(float(e.get("importance", 0.5)), 1.0), 4)


def _remaining_capacity(events: list[dict[str, Any]], day: int, now_min: int, profile: Profile) -> int:
    end = min(profile.day_end_min, 24 * 60)
    start = max(now_min, profile.day_start_min)
    if end <= start:
        return 0
    busy = sum(max(0, min(e["startMin"] + e["durationMin"], end) - max(e["startMin"], start))
               for e in events if e["day"] == day and e.get("fixed"))
    return int(max(0, end - start - busy) * profile.planning_bias)


def triage(events: list[dict[str, Any]], day: int, now_min: int, profile: Profile, today: date) -> dict[str, Any]:
    """Today's movable work, ranked, with a proposed line. `line` = how many of `ranked` stay today."""
    todo = [e for e in events if e["day"] == day and not e.get("fixed") and not e.get("done")
            and not (e.get("reflection") or {}).get("choice")]
    # a non-negotiable task is above everything else; the rest are ranked by what is at stake
    ranked = sorted(todo, key=lambda e: (not e.get("non_negotiable"), -score(e, events, today), e["startMin"]))
    cap = _remaining_capacity(events, day, now_min, profile)
    used, line = 0, 0
    for i, e in enumerate(ranked):
        need = e["durationMin"]
        if e.get("non_negotiable") or used + need <= cap:
            used += need
            line = i + 1
        else:
            break                       # the line is a prefix of the ranking: nothing below a dropped task stays
    return {
        "ranked": [{"id": e["id"], "title": e["title"], "minutes": e["durationMin"], "category": e.get("category", "admin"),
                    "score": score(e, events, today), "non_negotiable": bool(e.get("non_negotiable")), "importance_cat": e.get("importance_cat"),
                    "was_start": e["startMin"], "missed": e["startMin"] + e["durationMin"] <= now_min} for e in ranked],
        "line": line, "capacity_min": cap, "fixed_left": [e["id"] for e in events if e["day"] == day and e.get("fixed")
                                                          and e["startMin"] + e["durationMin"] > now_min],
    }


def _first_gap(taken: list[tuple[int, int]], lo: int, hi: int, need: int) -> int | None:
    cursor = lo
    for a, b in taken:
        if a - cursor >= need and cursor + need <= hi:
            return cursor
        cursor = max(cursor, b)
    return cursor if cursor + need <= hi else None


def _park(e: dict[str, Any], note: str) -> dict[str, Any]:
    return {"id": "g_" + e["id"], "title": e["title"], "minutes": e["durationMin"], "category": e.get("category", "admin"),
            "note": note, "parts": [], "parked_iso": clock.now().isoformat(timespec="seconds"),
            "from_event": e["id"]}


def apply(mode: str, events: list[dict[str, Any]], *, day: int, now_min: int, profile: Profile, week_days: list[int],
          week_start: date, today: date, keep_ids: list[str] | None = None,
          protect_tomorrow: bool = False, choices: dict[str, str] | None = None) -> dict[str, Any]:
    """Carry out one recovery. Returns {events, grinder, ghosts, moved, conflicts, explanation}.

    `choices` (reschedule only) lets each of today's movable tasks go its own way:
    today (re-placed from now), tomorrow (first thing), grinder (parked) or drop (removed). Anything not named
    follows the proposed line."""
    if mode not in ("reschedule", "keep", "write_off"):
        raise ValueError("mode must be reschedule, keep or write_off")
    tri = triage(events, day, now_min, profile, today)
    ids_today = [r["id"] for r in tri["ranked"]]
    keep = set(keep_ids) if keep_ids is not None else set(ids_today[: tri["line"]])
    grinder: list[dict[str, Any]] = []
    ghosts: list[str] = []

    if mode == "keep":
        ghosts = [r["id"] for r in tri["ranked"] if r["missed"]]
        out = [{**e, "ghost": True} if e["id"] in ghosts else e for e in events]
        return {"events": out, "grinder": [], "ghosts": ghosts, "moved": [], "conflicts": [],
                "explanation": "Kept the plan as it was. What already passed is shown as a ghost, nothing was moved."}

    if mode == "write_off":
        held = [e for e in events if e["id"] in ids_today]
        keep_tomorrow: list[dict[str, Any]] = []
        if protect_tomorrow and day in week_days and week_days.index(day) + 1 < len(week_days):
            tomorrow = week_days[week_days.index(day) + 1]
            window_end = min(profile.day_start_min + 4 * 60, profile.day_end_min)      # "tomorrow morning"
            taken = sorted((e["startMin"], e["startMin"] + e["durationMin"]) for e in events if e["day"] == tomorrow)
            for e in sorted(held, key=lambda e: (not e.get("non_negotiable"), -score(e, events, today))):
                slot = _first_gap(taken, profile.day_start_min, window_end, e["durationMin"])
                if slot is None:
                    continue
                keep_tomorrow.append({**e, "day": tomorrow, "startMin": slot})
                taken = sorted(taken + [(slot, slot + e["durationMin"])])
        moved_ids = {e["id"] for e in keep_tomorrow}
        grinder = [_park(e, "Written off with the rest of the day.") for e in held if e["id"] not in moved_ids]
        out = [e for e in events if e["id"] not in ids_today] + keep_tomorrow
        return {"events": out, "grinder": grinder, "ghosts": [], "moved": sorted(moved_ids), "conflicts": [],
                "explanation": ("Today is written off. " + (f"{len(keep_tomorrow)} task(s) are held for tomorrow morning. " if keep_tomorrow else "")
                                + "The rest is in the Meatball Grinder.")}

    # reschedule from now
    outcomes: dict[str, str] = {}
    tomorrow = week_days[week_days.index(day) + 1] if day in week_days and week_days.index(day) + 1 < len(week_days) else None
    dropped: set[str] = set()
    to_grinder: list[dict[str, Any]] = []
    left = []
    for e in events:
        if e["id"] not in ids_today:
            left.append(e)
            continue
        c = (choices or {}).get(e["id"]) or ("today" if e["id"] in keep else "grinder")
        if c == "tomorrow" and tomorrow is None:
            c = "grinder"                       # nothing after today in view: the grinder keeps it safe
        outcomes[e["id"]] = c
        if c == "today":
            left.append(e)
        elif c == "tomorrow":
            left.append({**e, "day": tomorrow, "startMin": profile.day_start_min})
        elif c == "drop":
            dropped.add(e["id"])
        else:
            to_grinder.append(e)
    grinder = [_park(e, "Did not fit after the late start.") for e in to_grinder]
    moved_ids = {i for i, v in outcomes.items() if v != "today"}
    pinned = [e["id"] for e in left if e["day"] != day and e["id"] not in moved_ids]       # other days stay as they are
    res = reschedule_events(left, pinned, profile, week_days, week_start=week_start, today=today, now_min=now_min, mode="full")
    n = {k: sum(1 for v in outcomes.values() if v == k) for k in ("tomorrow", "grinder", "drop")}
    bits = [f"{n['tomorrow']} moved to tomorrow" if n["tomorrow"] else "", f"{n['grinder']} to the Meatball Grinder" if n["grinder"] else "",
            f"{n['drop']} dropped" if n["drop"] else ""]
    bits = [b for b in bits if b]
    return {"events": res["events"], "grinder": grinder, "ghosts": [], "moved": res["moved"], "conflicts": res["conflicts"], "outcomes": outcomes,
            "explanation": "Re-planned from now. " + (", ".join(bits).capitalize() + "." if bits else "Everything still fits today.")}


def log_late_start(profile: Profile, day_iso: str, planned: int | None = None, opened: int | None = None) -> dict[str, Any]:
    """Remember a late start (once per date). After 3 in a week, say so, and suggest the start the user really keeps."""
    if day_iso not in profile.late_starts:
        profile.late_starts.append(day_iso)
        profile.late_starts = profile.late_starts[-60:]
        if planned is not None and opened is not None:
            profile.late_log = (profile.late_log + [{"d": day_iso, "planned": int(planned), "opened": int(opened)}])[-30:]
    d = date.fromisoformat(day_iso)
    week = [x for x in profile.late_starts if 0 <= (d - date.fromisoformat(x)).days < 7]
    out: dict[str, Any] = {"late_starts_this_week": len(week), "suggest_later_start": len(week) >= LATE_WEEK_THRESHOLD}
    if out["suggest_later_start"]:
        out.update(suggest_start(profile, d))
    return out


def suggest_start(profile: Profile, today: date) -> dict[str, Any]:
    """A later day start taken from when the app was really opened on this week's late days (median, nearest half hour)."""
    opened = sorted(x["opened"] for x in profile.late_log if 0 <= (today - date.fromisoformat(x["d"])).days < 7)
    if not opened:
        return {}
    med = opened[len(opened) // 2]
    sug = int(round(med / 30.0) * 30)
    sug = min(sug, profile.day_end_min - 6 * 60)
    if sug <= profile.day_start_min:
        return {}
    return {"suggested_start_min": sug, "current_start_min": profile.day_start_min, "current_end_min": profile.day_end_min}
