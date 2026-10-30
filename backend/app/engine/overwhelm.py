"""When there is too much (engine, deterministic): the "I'm overwhelmed" planner, and the per-task late-start plan.

triage   today's open work, ranked by what the user said matters, then by deadline, tagged "deadline soon" or "eventually".
plan     given how much the person can do today (hours, or nothing at all), keep the most important work today and move the
         rest: tomorrow, next week, or the Meatball Grinder. If that pushes a hard deadline out of reach, the least important
         flexible work earlier than the deadline is cleared to make room (next week, or the Meatball Grinder). If the deadlines
         still cannot be met, work is placed into sleep hours and flagged, and the plan says what that costs.

Nothing here is applied. The caller shows the plan on the calendar and the person decides.
"""
from __future__ import annotations

from app import clock

from datetime import date, datetime
from typing import Any

from app.engine import importance
from app.engine.calendar_bridge import _reschedule_once, reschedule_events
from app.engine.oversleep import _days_left
from app.models import Profile

SOON_DAYS = 7             # a deadline within a week is "soon"
DEEP_DAY_LIMIT_MIN = 240  # the person's focus tends to fall off after about four hours of deep work in a day
LATE_MIN = 3 * 60         # work this early in the morning (past 3am)


def _open(e: dict[str, Any]) -> bool:
    return not e.get("fixed") and not e.get("done") and not (e.get("reflection") or {}).get("choice")


def _hard(e: dict[str, Any]) -> bool:
    return bool(e.get("deadline_iso")) and e.get("hard_deadline", True) is not False


def _urgency(e: dict[str, Any], today: date) -> float:
    d = _days_left(e, today)
    if d is None:
        return 0.0
    return (1.0 if _hard(e) else 0.5) / (1 + max(d, 0))


def _sort_key(e: dict[str, Any], today: date):
    return (not e.get("non_negotiable"), -importance.value(e), -_urgency(e, today), e["startMin"])


def triage(events, day: int, now_min: int, profile: Profile, today: date, week_days: list[int]) -> dict[str, Any]:
    todo = [e for e in events if e["day"] == day and _open(e)]
    ranked = sorted(todo, key=lambda e: _sort_key(e, today))
    rows = []
    for e in ranked:
        d = _days_left(e, today)
        soon = d is not None and d <= SOON_DAYS
        rows.append({
            "id": e["id"], "title": e["title"], "minutes": e["durationMin"], "category": e.get("category", "admin"),
            "kind": "deadline" if soon else "eventual", "days_left": d, "hard": _hard(e), "must": bool(e.get("non_negotiable")),
            "importance": importance.label(e), "importance_cat": e.get("importance_cat"),
            "missed": e["startMin"] + e["durationMin"] <= now_min,
        })
    end = min(profile.day_end_min, 24 * 60)
    free = max(0, end - max(now_min, profile.day_start_min))
    busy = sum(max(0, min(e["startMin"] + e["durationMin"], end) - max(e["startMin"], now_min)) for e in events if e["day"] == day and e.get("fixed"))
    capacity = int(max(0, free - busy) * profile.planning_bias)
    return {"tasks": rows, "total_min": sum(r["minutes"] for r in rows), "capacity_min": capacity,
            "deadline_min": sum(r["minutes"] for r in rows if r["kind"] == "deadline")}


def default_keep(events, day, budget_min, today) -> list[str]:
    """The most important work that fits the hours: in rank order, until the budget is used. A must-do always stays."""
    todo = sorted((e for e in events if e["day"] == day and _open(e)), key=lambda e: _sort_key(e, today))
    keep, used = [], 0
    for e in todo:
        if e.get("non_negotiable") or used + e["durationMin"] <= budget_min:
            keep.append(e["id"])
            used += e["durationMin"]
    return keep


def _next_week_day(week_days: list[int], day: int, today: date) -> int | None:
    if day not in week_days:
        return None
    i = week_days.index(day) + 7 - today.weekday()
    return week_days[i] if i < len(week_days) else None


def _tomorrow(week_days: list[int], day: int) -> int | None:
    return week_days[week_days.index(day) + 1] if day in week_days and week_days.index(day) + 1 < len(week_days) else None


def _park(e: dict[str, Any], note: str) -> dict[str, Any]:
    return {"id": "g_" + e["id"], "title": e["title"], "minutes": e["durationMin"], "category": e.get("category", "admin"),
            "note": note, "parts": [], "parked_iso": clock.now().isoformat(timespec="seconds"), "from_event": e["id"]}


def _destination(e: dict[str, Any], today: date, have_tomorrow: bool, have_next_week: bool) -> str:
    """Where work goes when it is not done today. Deadlines keep it close; the user's own importance decides the rest."""
    if _hard(e):
        d = _days_left(e, today)
        return "stay" if d is not None and d <= 0 else ("tomorrow" if have_tomorrow else "grinder")
    if e.get("deadline_iso"):
        return "tomorrow" if have_tomorrow else "grinder"
    if importance.is_important(e):
        return "tomorrow" if have_tomorrow else "next_week"
    if e.get("importance_cat") == "whatever":
        return "grinder"
    return "next_week" if have_next_week else "grinder"


def _place(e, dest, profile, tomorrow, next_week) -> dict[str, Any]:
    if dest == "tomorrow":
        return {**e, "day": tomorrow, "startMin": profile.day_start_min}
    if dest == "next_week":
        return {**e, "day": next_week, "startMin": profile.day_start_min}
    return e


def _warnings(events, original, profile: Profile, week_days: list[int], day: int, unmet: list[dict[str, Any]], cleared_today: bool) -> list[dict[str, str]]:
    """What this plan costs. Only what the plan itself changed is counted: a late-night block the person put there themselves,
    or a heavy day that was already heavy, is not Otto's doing."""
    out: list[dict[str, str]] = []
    names = {d: i for i, d in enumerate(week_days)}
    was = {e["id"]: (e["day"], e["startMin"], bool(e.get("crunch"))) for e in original}
    changed = {e["id"] for e in events if e["id"] not in was or was[e["id"]][:2] != (e["day"], e["startMin"])}
    touched_days = {e["day"] for e in events if e["id"] in changed}
    deep: dict[int, int] = {}
    for e in events:
        if e.get("fixed") or e["day"] not in names or e["day"] not in touched_days:
            continue
        if e.get("category") in ("llm", "leetcode", "system_design", "deep_work", "interview") or e["durationMin"] >= 90:
            deep[e["day"]] = deep.get(e["day"], 0) + e["durationMin"]
    crunch = [e for e in events if e.get("crunch") and e["id"] in changed and not (e["id"] in was and was[e["id"]][2])]
    if crunch:
        days = sorted({e["day"] for e in crunch})
        latest = max(e["startMin"] + e["durationMin"] for e in crunch)
        out.append({"level": "bad", "text": f"{len(crunch)} block{'s' if len(crunch) != 1 else ''} had to go into your sleep hours"
                    + (f", running until {latest // 60 % 24:02d}:{latest % 60:02d}" if latest > profile.day_end_min else "") + f" on {len(days)} day{'s' if len(days) != 1 else ''}."})
    if any(e["startMin"] < LATE_MIN for e in crunch):
        out.append({"level": "bad", "text": "Some of it lands before 3am. Otto has seen your focus fall away that late; expect it to take longer and be worse."})
    for d, m in sorted(deep.items()):
        if m > DEEP_DAY_LIMIT_MIN:
            out.append({"level": "warn", "text": f"{m // 60}h {m % 60}m of deep work on one day. Your focus usually drops after about {DEEP_DAY_LIMIT_MIN // 60} hours (your learned focus span is {profile.focus_span_min} minutes at a stretch)."})
            break
    for e in unmet:
        out.append({"level": "bad", "text": f"“{e['title']}” (due {e['deadline_iso'][:10]}) still does not fit anywhere. It will be late unless something else gives."})
    if cleared_today and not out:
        out.append({"level": "good", "text": "Resting today costs nothing: everything with a deadline still fits."})
    return out


def _replan(events, *, day, now_min, profile, week_days, week_start, today, keep: set[str], block_today: bool) -> dict[str, Any]:
    """Keep `keep` today, send the rest of today's open work where it belongs, then make the deadlines fit."""
    tomorrow, nweek = _tomorrow(week_days, day), _next_week_day(week_days, day, today)
    outcomes: dict[str, str] = {}
    grinder: list[dict[str, Any]] = []
    work: list[dict[str, Any]] = []
    for e in events:
        if e["day"] == day and _open(e) and e["id"] not in keep:
            dest = _destination(e, today, tomorrow is not None, nweek is not None)
            if dest == "stay":
                outcomes[e["id"]] = "today"
                work.append(e)
            elif dest == "grinder":
                outcomes[e["id"]] = "grinder"
                grinder.append(_park(e, "Moved out to make today lighter."))
            else:
                outcomes[e["id"]] = dest
                work.append(_place(e, dest, profile, tomorrow, nweek))
        else:
            if e["day"] == day and _open(e):
                outcomes[e["id"]] = "today"
            work.append(e)
    blocked = [{"day": day, "start_min": max(now_min, profile.day_start_min), "end_min": profile.day_end_min}] if block_today else []
    kw = dict(week_start=week_start, today=today, now_min=now_min, mode="full", blocked_windows=blocked)

    def pins() -> list[str]:
        """Only what has to move may move: today's work and anything we sent elsewhere. The rest of the calendar stays put."""
        free = {e["id"] for e in work if (e["day"] == day and _open(e)) or outcomes.get(e["id"], "today") != "today"}
        return [e["id"] for e in work if e["id"] not in free]

    # make the deadlines fit: clear the least important flexible work that is in the way, one piece at a time
    for _ in range(12):
        res = _reschedule_once(work, pins(), profile, week_days, **kw)
        by = {e["id"]: e for e in res["events"]}
        unfit = [by[c] for c in res["conflicts"] if c in by and _hard(by[c]) and not by[c].get("fixed")]
        if not unfit:
            break
        limit = max((week_days.index(by[u["id"]]["day"]) if by[u["id"]]["day"] in week_days else 0) for u in unfit)
        pool = [e for e in res["events"] if _open(e) and not _hard(e) and not e.get("non_negotiable") and e["day"] in week_days
                and week_days.index(e["day"]) <= limit + 1 and not importance.is_important(e)
                and not (e["day"] == day and e["startMin"] + e["durationMin"] <= now_min)]
        if not pool:
            break
        victim = sorted(pool, key=lambda e: (importance.value(e), -e["durationMin"]))[0]
        dest = "grinder" if (victim.get("importance_cat") == "whatever" or nweek is None) else "next_week"
        outcomes[victim["id"]] = dest
        work = [e for e in work if e["id"] != victim["id"]]
        if dest == "grinder":
            grinder.append(_park(victim, "Cleared to make room for work with a hard deadline."))
        else:
            work.append(_place(victim, "next_week", profile, tomorrow, nweek))

    res = reschedule_events(work, pins(), profile, week_days, **kw)          # the full answer: sleep hours only if a hard deadline truly needs them
    by = {e["id"]: e for e in res["events"]}
    unmet = [by[c] for c in res["conflicts"] if c in by and _hard(by[c]) and not by[c].get("fixed")]
    return {"events": res["events"], "grinder": grinder, "outcomes": outcomes, "conflicts": res["conflicts"], "unmet": unmet,
            "decisions": res.get("decisions", []), "crunch": sum(1 for e in res["events"] if e.get("crunch"))}


def plan(events, *, day: int, now_min: int, profile: Profile, week_days: list[int], week_start: date, today: date,
         hours: float | None = None, keep_ids: list[str] | None = None) -> dict[str, Any]:
    """Two plans side by side: Otto's suggestion for the hours given, and what it costs to rest today completely."""
    tri = triage(events, day, now_min, profile, today, week_days)
    budget = int(hours * 60) if hours is not None else tri["capacity_min"]
    keep = set(keep_ids) if keep_ids is not None else set(default_keep(events, day, budget, today))
    common = dict(day=day, now_min=now_min, profile=profile, week_days=week_days, week_start=week_start, today=today)
    sug = _replan(events, keep=keep, block_today=False, **common)
    rest = _replan(events, keep=set(), block_today=True, **common)

    def pack(r, cleared):
        return {"events": r["events"], "grinder": r["grinder"], "outcomes": r["outcomes"], "conflicts": r["conflicts"], "decisions": r["decisions"],
                "warnings": _warnings(r["events"], events, profile, week_days, day, r["unmet"], cleared), "crunch": r["crunch"],
                "ok": not r["unmet"] and not any(e.get("crunch") and e["id"] not in {x["id"] for x in events if x.get("crunch")} for e in r["events"]),
                "moved_out": sum(1 for v in r["outcomes"].values() if v != "today")}
    s, r = pack(sug, False), pack(rest, True)
    # what resting would leave undone or push into sleep hours: the part that cannot honestly wait
    had = {x["id"] for x in events if x.get("crunch")}
    short = sum(e["durationMin"] for e in rest["events"] if e.get("crunch") and e["id"] not in had) + sum(e["durationMin"] for e in rest["unmet"])
    return {"triage": tri, "keep": sorted(keep), "budget_min": budget, "suggested": s, "rest": r,
            "rest_ok": r["ok"], "shortfall_min": short,
            "explanation": (f"Kept the most important {len(keep)} thing{'s' if len(keep) != 1 else ''} for today"
                            + (f"; {s['moved_out']} moved out." if s["moved_out"] else "."))}
