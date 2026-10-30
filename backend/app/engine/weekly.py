"""Weekly reflection and drift review (engine, deterministic).

weekly_metrics   what the last 7 days looked like, from the signals already stored on the profile.
snapshot/drift   which learned parameters have moved since the user last reviewed them. A review is due when
                 something moved noticeably and a week has passed since the last one: that is the trigger for the
                 weekly mascot chat ("your focus span has dropped, did something change?").
recap            a plain-language summary built from the numbers, so the page reads well with no LLM key; the LLM
                 version only rewrites it.
"""
from __future__ import annotations

from app import clock

from datetime import date, datetime, timedelta
from typing import Any

from app.engine import learning
from app.models import Profile, ReflectionChoice

REVIEW_EVERY_DAYS = 7
DRIFT_RULES = {                    # key -> (minimum change worth mentioning, label)
    "focus_span_min": (30, "how long you stay focused"),
    "planning_bias": (0.10, "how much of your day you can plan"),
    "completion_rate": (0.15, "how much of your plan you finish"),
}
VELOCITY_DRIFT = 0.20
PEAK_DRIFT_H = 2


def _day(ts: str) -> date | None:
    try:
        return datetime.fromisoformat(ts).date()
    except ValueError:
        return None


def weekly_metrics(profile: Profile, today: date) -> dict[str, Any]:
    start = today - timedelta(days=6)
    days = [start + timedelta(days=i) for i in range(7)]
    per_day = {d: 0 for d in days}
    planned = actual = 0
    choices: dict[str, int] = {c.value: 0 for c in ReflectionChoice}
    by_cat: dict[str, list[int]] = {}
    n = 0
    for r in profile.reflections:
        d = _day(r.ts)
        if d is None or d not in per_day:
            continue
        n += 1
        per_day[d] += r.actual_minutes
        planned += r.planned_minutes
        actual += r.actual_minutes
        choices[r.choice.value] = choices.get(r.choice.value, 0) + 1
        by_cat.setdefault(r.category, [0, 0])
        by_cat[r.category][0] += r.planned_minutes
        by_cat[r.category][1] += r.actual_minutes
    # streak: consecutive days with a logged session, ending today (or yesterday if today has none yet)
    logged = {d for r in profile.reflections if (d := _day(r.ts))}
    cur = today if today in logged else today - timedelta(days=1)
    streak = 0
    while cur in logged:
        streak += 1
        cur -= timedelta(days=1)
    off = [o for o in profile.off_track_logs if (d := _day(o.ts)) and d in per_day]
    off_by: dict[str, int] = {}
    for o in off:
        off_by[o.reason] = off_by.get(o.reason, 0) + o.duration_min
    energy = [e for e in profile.energy_logs if (d := _day(e.ts)) and d in per_day]
    parts = {"morning": [], "afternoon": [], "evening": []}
    for e in energy:
        h = datetime.fromisoformat(e.ts).hour
        parts["morning" if h < 12 else "afternoon" if h < 17 else "evening"].append(e.level)
    ratio = (actual / planned) if planned else None
    status = ("no data yet" if ratio is None else "ahead" if ratio >= 1.05 else "on track" if ratio >= 0.9
              else "a bit behind" if ratio >= 0.7 else "behind")
    return {
        "range": [start.isoformat(), today.isoformat()],
        "sessions": n, "planned_min": planned, "actual_min": actual,
        "focus_hours": round(actual / 60, 1), "versus_plan": None if ratio is None else round(ratio, 2), "status": status,
        "streak_days": streak, "days_active": sum(1 for v in per_day.values() if v > 0),
        "per_day": [{"date": d.isoformat(), "label": d.strftime("%a")[0], "minutes": per_day[d], "today": d == today} for d in days],
        "reflections": choices,
        "by_category": [{"category": c, "planned_min": v[0], "actual_min": v[1]} for c, v in sorted(by_cat.items())],
        "off_track_min": off_by, "off_track_total_min": sum(off_by.values()),
        "energy_avg": {k: (round(sum(v) / len(v), 1) if v else None) for k, v in parts.items()},
        "late_starts": sum(1 for x in profile.late_starts if (d := _day(x)) and d in per_day),
        "learned": {"peak_window": list(profile.peak_window), "focus_span_min": profile.focus_span_min,
                    "planning_bias": profile.planning_bias, "completion_rate": profile.completion_rate,
                    "chronotype": learning.chronotype(profile), "avg_velocity": dict(profile.avg_velocity)},
    }


def recap(m: dict[str, Any]) -> dict[str, str]:
    """A headline and a paragraph from the numbers alone. Calm, no guilt."""
    if not m["sessions"]:
        return {"headline": "A quiet week so far.",
                "body": "Nothing was logged in the last 7 days, so there is nothing to compare yet. Reflect on a session or two and this page fills in."}
    head = {"ahead": "A genuinely good week.", "on track": "A steady week.", "a bit behind": "A little behind, and that is fine.",
            "behind": "A harder week."}.get(m["status"], "Your week.")
    bits = [f"You logged {m['sessions']} session{'s' if m['sessions'] != 1 else ''} across {m['days_active']} day{'s' if m['days_active'] != 1 else ''}, about {m['focus_hours']}h of focused time."]
    if m["versus_plan"] is not None:
        bits.append(f"That is {round(m['versus_plan'] * 100)}% of what you planned.")
    if m["streak_days"] >= 2:
        bits.append(f"{m['streak_days']} days in a row.")
    if m["reflections"].get("interrupted"):
        bits.append(f"{m['reflections']['interrupted']} session{'s were' if m['reflections']['interrupted'] != 1 else ' was'} interrupted, which Otto does not hold against your pace.")
    if m["off_track_total_min"]:
        top = max(m["off_track_min"], key=m["off_track_min"].get)
        bits.append(f"About {m['off_track_total_min']} minutes went off track, mostly {top.replace('_', ' ')}.")
    if m["late_starts"] >= 2:
        bits.append(f"You started late {m['late_starts']} times. If mornings are the issue, a later planned start may suit you better.")
    return {"headline": head, "body": " ".join(bits)}


# ---- drift ------------------------------------------------------------------------------------------------

def snapshot(profile: Profile, now: datetime | None = None) -> dict[str, Any]:
    return {"at": (now or clock.now()).isoformat(timespec="minutes"),
            "focus_span_min": profile.focus_span_min, "planning_bias": profile.planning_bias,
            "completion_rate": profile.completion_rate, "peak_window": list(profile.peak_window),
            "avg_velocity": dict(profile.avg_velocity)}


def drift(profile: Profile, snap: dict[str, Any] | None, now: datetime | None = None) -> dict[str, Any]:
    """What moved since `snap`, and whether a review is due. With no snapshot nothing is due: the first one is
    taken silently so the user is not asked to review a change that never happened."""
    now = now or clock.now()
    if not snap:
        return {"due": False, "drifts": [], "since": None, "first": True}
    out: list[dict[str, Any]] = []
    for key, (gap, label) in DRIFT_RULES.items():
        a, b = snap.get(key), getattr(profile, key)
        if a is not None and abs(b - a) >= gap:
            out.append({"key": key, "label": label, "from": a, "to": round(b, 2), "direction": "up" if b > a else "down"})
    pa, pb = snap.get("peak_window"), list(profile.peak_window)
    if pa and abs(pb[0] - pa[0]) >= PEAK_DRIFT_H:
        out.append({"key": "peak_window", "label": "when you do your best work", "from": pa, "to": pb,
                    "direction": "later" if pb[0] > pa[0] else "earlier"})
    for cat, v in profile.avg_velocity.items():
        a = (snap.get("avg_velocity") or {}).get(cat)
        if a is not None and abs(v - a) >= VELOCITY_DRIFT:
            out.append({"key": f"avg_velocity:{cat}", "label": f"how long {cat.replace('_', ' ')} takes you", "from": a, "to": round(v, 2),
                        "direction": "slower" if v > a else "faster"})
    try:
        since = (now - datetime.fromisoformat(snap["at"])).days
    except (KeyError, ValueError):
        since = REVIEW_EVERY_DAYS
    return {"due": bool(out) and since >= REVIEW_EVERY_DAYS, "drifts": out, "since": since, "first": False}
