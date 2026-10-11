"""Calendar ⇄ engine bridge.

The week view speaks in calendar events ({id, title, day (date of month),
startMin, durationMin, category, fixed}). The scheduler speaks Tasks and
TimeBlocks on a 0–6 day index. This module translates, runs schedule(), and
translates back. Pure — no I/O, no LLM; `profile` carries everything learned.

Stability first: on a drag, only events the change actually displaces move
(mode="displaced"). mode="full" re-optimises every flexible event against the
learned peak window / velocity, each staying as near its current slot as it can.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from app.engine.scheduler import DAYS_IN_WEEK, schedule
from app.models import Category, EffortTier, Profile, Task, TimeBlock

# frontend category labels (CATEGORY_COLORS keys) → engine categories
CATEGORY_MAP: dict[str, Category] = {
    "llm": Category.DEEP_WORK, "leetcode": Category.DEEP_WORK,
    "system-design": Category.DEEP_WORK, "deep work": Category.DEEP_WORK,
    "interview": Category.SOCIAL, "social": Category.SOCIAL,
    "gym": Category.PHYSICAL,
    "leisure": Category.CREATIVE,
    "admin": Category.ADMIN, "life": Category.ADMIN,
}


def to_category(label: str | None) -> Category:
    """Map any frontend label (or an engine value like 'deep_work') to a Category.
    Unknown labels fall back to ADMIN: the one category with no timing gates."""
    if not label:
        return Category.ADMIN
    key = label.strip().lower()
    if key in CATEGORY_MAP:
        return CATEGORY_MAP[key]
    try:
        return Category(key.replace(" ", "_"))
    except ValueError:
        return Category.ADMIN


def effort_for(minutes: int) -> EffortTier:
    if minutes < 30:
        return EffortTier.LOW
    if minutes < 90:
        return EffortTier.MED
    if minutes < 180:
        return EffortTier.HIGH
    return EffortTier.DEEP


def _overlaps(a: tuple[int, int, int], b: tuple[int, int, int]) -> bool:
    return a[0] == b[0] and a[1] < b[2] and b[1] < a[2]


def _fmt(minute: int) -> str:
    return f"{minute // 60}:{minute % 60:02d}"


def reschedule_events(
    events: list[dict[str, Any]],
    pinned_ids: list[str],
    profile: Profile,
    week_days: list[int],
    *,
    week_start: date | None = None,
    today: date | None = None,
    now_min: int | None = None,
    mode: str = "displaced",
) -> dict[str, Any]:
    """Re-place flexible events around a user change.

    events      calendar events (dicts). Extra keys are preserved on the way back.
                Optional per-event keys: prereq_ids, deadline_iso, hard_deadline,
                effort_tier, non_negotiable.
    pinned_ids  events the user just moved — they must not move.
    week_days   the 7 date-of-month numbers for Mon..Sun of the visible week.
    Returns {events, conflicts, moved, explanation}.
    """
    day_idx = {num: i for i, num in enumerate(week_days)}
    pinned = set(pinned_ids)

    # --- past days are history; today before `now` is unavailable ------------------
    start_day = 0
    eff_now = None
    if week_start and today:
        idx = (today - week_start).days
        start_day = max(0, min(idx, DAYS_IN_WEEK))
        if idx == start_day:
            eff_now = now_min

    by_id = {e["id"]: e for e in events}
    pos: dict[str, tuple[int, int, int]] = {}  # id -> (dayIdx, start, end) for in-week events
    for e in events:
        if e["day"] in day_idx:
            pos[e["id"]] = (day_idx[e["day"]], e["startMin"], e["startMin"] + e["durationMin"])

    def locked(e: dict[str, Any]) -> bool:
        return (e.get("fixed", False) or e["id"] in pinned
                or pos[e["id"]][0] < start_day)

    flexible = [e for e in events if e["id"] in pos and not locked(e)]
    keepers = [e for e in events if e["id"] in pos and locked(e)]

    # --- which flexible events must move -------------------------------------------
    if mode == "full":
        movable_ids = {e["id"] for e in flexible}
    else:
        occupied = [pos[e["id"]] for e in keepers]
        movable_ids = set()
        for e in sorted(flexible, key=lambda x: (pos[x["id"]][0], pos[x["id"]][1])):
            p = pos[e["id"]]
            if any(_overlaps(p, o) for o in occupied):
                movable_ids.add(e["id"])
            else:
                occupied.append(p)
        # a dependent that now starts before its prerequisite ends must move too
        for e in flexible:
            for pid in e.get("prereq_ids", []):
                if pid in pos and (pos[e["id"]][0], pos[e["id"]][1]) < (pos[pid][0], pos[pid][2]):
                    movable_ids.add(e["id"])

    kept = [e for e in events if e["id"] in pos and e["id"] not in movable_ids]

    # --- build the engine problem --------------------------------------------------
    blocks = list(profile.time_blocks)
    for e in kept:
        d, s, en = pos[e["id"]]
        blocks.append(TimeBlock(day=d, start_min=s, end_min=en, label=e["title"]))
    work_profile = Profile.from_dict(profile.to_dict())
    work_profile.time_blocks = blocks

    tasks: list[Task] = []
    for e in flexible:
        if e["id"] not in movable_ids:
            continue
        d, s, _ = pos[e["id"]]
        dur = e["durationMin"]
        try:
            tier = EffortTier(e["effort_tier"]) if e.get("effort_tier") else effort_for(dur)
        except ValueError:
            tier = effort_for(dur)
        tasks.append(Task(
            id=e["id"], title=e["title"], duration_planned=dur,
            importance=3.0 if e.get("non_negotiable") else 1.0,
            category=to_category(e.get("category")), effort_tier=tier,
            prereq_ids=[p for p in e.get("prereq_ids", []) if p in pos],
            deadline_iso=e.get("deadline_iso") or None,
            hard_deadline=e.get("hard_deadline", True),
            non_negotiable=bool(e.get("non_negotiable")),
            prefer_day=d, prefer_start_min=s,
        ))

    anchored = {e["id"]: (pos[e["id"]][0], pos[e["id"]][2]) for e in kept}

    plan = schedule(
        tasks, work_profile, deadline_day=DAYS_IN_WEEK - 1,
        start_day=start_day, now_min=eff_now, week_start=week_start,
        allow_split=False, allow_overpack=False, apply_cap=False,
        anchored_end=anchored,
    ) if tasks else None

    # --- map back ------------------------------------------------------------------
    conflicts: set[str] = set()
    new_pos = dict(pos)
    moved: list[str] = []
    if plan:
        for b in plan.blocks:
            old = pos[b.task_id]
            if (b.day, b.start_min) != (old[0], old[1]):
                moved.append(b.task_id)
            new_pos[b.task_id] = (b.day, b.start_min, b.start_min + by_id[b.task_id]["durationMin"])
        conflicts.update(plan.at_risk)  # couldn't be placed: stays where it was, flagged

    # sequential-order check on the final layout (catches pinned/fixed dependents too)
    for e in events:
        if e["id"] not in new_pos:
            continue
        for pid in e.get("prereq_ids", []):
            if pid in new_pos and (new_pos[e["id"]][0], new_pos[e["id"]][1]) < (new_pos[pid][0], new_pos[pid][2]):
                conflicts.add(e["id"])

    # safety net: whatever is still overlapping after the engine ran must be visible, not silent
    # (e.g. the user dropped something on a day that has already passed, which is never rescheduled)
    involved = pinned | set(moved) | set(plan.at_risk if plan else [])
    placed_ids = list(new_pos)
    for i, a in enumerate(placed_ids):
        for b in placed_ids[i + 1:]:
            if (a in involved or b in involved) and _overlaps(new_pos[a], new_pos[b]):
                conflicts.update((a, b))

    out = []
    for e in events:
        if e["id"] in new_pos and e["id"] in moved:
            d, s, _ = new_pos[e["id"]]
            out.append({**e, "day": week_days[d], "startMin": s})
        else:
            out.append(e)

    dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    parts = [f'"{by_id[i]["title"]}" → {dow[new_pos[i][0]]} {_fmt(new_pos[i][1])}' for i in moved]
    explanation = ""
    if parts:
        explanation = "Re-placed around your change: " + "; ".join(parts) + "."
    if conflicts:
        names = ", ".join(f'"{by_id[i]["title"]}"' for i in sorted(conflicts) if i in by_id)
        explanation = (explanation + " " if explanation else "") + f"Couldn't fit cleanly: {names}."
    if any(i in pos and pos[i][0] < start_day for i in pinned):
        explanation = (explanation + " " if explanation else "") + "That day has already passed, so nothing there is rescheduled."

    return {"events": out, "conflicts": sorted(conflicts), "moved": moved, "explanation": explanation}
