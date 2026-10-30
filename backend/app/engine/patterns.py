"""Behaviour patterns read from what the user has logged (engine, deterministic).

Each pattern compares two groups of the user's own data and only reports a finding when both groups are big enough and the
gap is big enough to mean something. Until then it says how far it has to go. Nothing here changes a setting: the patterns
are shown on the stats page and handed to the weekly chat as context.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from statistics import mean
from typing import Any, Callable

from app.models import Profile, ReflectionChoice

MIN_EACH = 3            # data points needed on each side of a comparison
ENERGY_GAP = 0.5        # energy levels run 1-5
RATIO_GAP = 0.10        # 10% longer or shorter than planned
RATE_GAP = 0.20         # 20 points of "nailed it" rate


def _day(ts: str) -> date:
    return datetime.fromisoformat(ts).date()


def _ratio(r) -> float:
    return r.actual_minutes / r.planned_minutes if r.planned_minutes else 1.0


SURE = 12            # data points at which a reading is trusted (green); fewer is an early read (yellow)


def confidence(state: str, evidence: int) -> str:
    """high = Otto is sure (green), medium = an early read from a bit of data (yellow), low = not enough yet (grey)."""
    if state == "learning":
        return "low"
    return "high" if evidence >= SURE else "medium"


def _out(key: str, label: str, a: list, b: list, found: str | None, none: str, need: str, short: str = "") -> dict[str, Any]:
    n_a, n_b = len(a), len(b)
    if n_a < MIN_EACH or n_b < MIN_EACH:
        left = max(MIN_EACH - n_a, 0) + max(MIN_EACH - n_b, 0)
        return {"key": key, "label": label, "state": "learning", "evidence": n_a + n_b, "short": "Not enough data yet", "confidence": "low",
                "text": f"Still learning. {need} ({left} more to go)."}
    state = "found" if found else "none"
    return {"key": key, "label": label, "state": state, "evidence": n_a + n_b, "confidence": confidence(state, n_a + n_b),
            "short": short if found else "Nothing there", "text": found or none}


def switching_cost(p: Profile) -> dict[str, Any]:
    short = ""
    rs = [r for r in p.reflections if r.prev_category]
    sw = [_ratio(r) for r in rs if r.prev_category != r.category]
    same = [_ratio(r) for r in rs if r.prev_category == r.category]
    found = None
    if len(sw) >= MIN_EACH and len(same) >= MIN_EACH:
        eff = mean(sw) / mean(same) - 1
        if abs(eff) >= RATIO_GAP:
            found = (f"Work that follows a different kind of work takes about {round(abs(eff) * 100)}% {'longer' if eff > 0 else 'less time'} "
                     f"than work that follows the same kind.")
            short = f"{'+' if eff > 0 else '-'}{round(abs(eff) * 100)}% time after a switch"
    return _out("task_switching", "Cost of switching", sw, same, found, "Switching kinds of work does not change how long things take for you.",
                "Needs finished blocks that follow the same kind of work, and others that follow a different kind", short)


def deadline_pressure(p: Profile) -> dict[str, Any]:
    short = ""
    rs = [r for r in p.reflections if r.days_to_deadline is not None]
    near = [_ratio(r) for r in rs if r.days_to_deadline <= 2]
    far = [_ratio(r) for r in rs if r.days_to_deadline > 2]
    found = None
    if len(near) >= MIN_EACH and len(far) >= MIN_EACH:
        eff = mean(near) / mean(far) - 1
        if abs(eff) >= RATIO_GAP:
            found = (f"Close to a deadline you finish in {round(abs(eff) * 100)}% less time than the plan." if eff < 0
                     else f"Close to a deadline things take {round(eff * 100)}% longer than the plan: pressure slows you down, so Otto should start earlier.")
            short = f"{'-' if eff < 0 else '+'}{round(abs(eff) * 100)}% time near a deadline"
    return _out("deadline_pressure", "Deadline pressure", near, far, found, "How close a deadline is does not change your pace.",
                "Needs finished work due within two days, and finished work due later", short)


def _energy(p: Profile, pred_a: Callable, pred_b: Callable):
    return [e.level for e in p.energy_logs if pred_a(e)], [e.level for e in p.energy_logs if pred_b(e)]


def meeting_drain(p: Profile) -> dict[str, Any]:
    short = ""
    a, b = _energy(p, lambda e: e.after_meeting_min is not None and e.after_meeting_min <= 90, lambda e: e.after_meeting_min is None)
    found = None
    if len(a) >= MIN_EACH and len(b) >= MIN_EACH and abs(mean(a) - mean(b)) >= ENERGY_GAP:
        d = mean(a) - mean(b)
        found = (f"Social time and meetings leave you {'more' if d > 0 else 'less'} energised: about {abs(d):.1f} points {'higher' if d > 0 else 'lower'} on the 5-point scale in the hour and a half after. "
                 + ("Otto will not treat them as a cost." if d > 0 else "Otto leaves room after them."))
        short = f"{d:+.1f} energy after meetings"
    return _out("social_energy", "Social drain or recharge", a, b, found, "Meetings do not change your energy much either way.",
                "Needs energy taps within 90 minutes of a meeting, and others", short)


def post_hard_recovery(p: Profile) -> dict[str, Any]:
    short = ""
    a, b = _energy(p, lambda e: e.after_hard_min is not None and e.after_hard_min <= 60, lambda e: e.after_hard_min is None)
    found = None
    if len(a) >= MIN_EACH and len(b) >= MIN_EACH and mean(b) - mean(a) >= ENERGY_GAP:
        found = f"After a long deep-work block your energy is {mean(b) - mean(a):.1f} points lower for the next hour: leave it free for something light."
        short = f"{mean(a) - mean(b):+.1f} energy after deep work"
    return _out("recovery_after_hard", "Recovery after hard tasks", a, b, found, "A hard block does not leave you flat afterwards.",
                "Needs energy taps within an hour of a long deep-work block, and others", short)


def monday_start(p: Profile) -> dict[str, Any]:
    short = ""
    a, b = _energy(p, lambda e: _day(e.ts).weekday() == 0, lambda e: _day(e.ts).weekday() in (1, 2, 3, 4))
    found = None
    if len(a) >= MIN_EACH and len(b) >= MIN_EACH and abs(mean(a) - mean(b)) >= ENERGY_GAP:
        d = mean(a) - mean(b)
        found = (f"Mondays are {'stronger' if d > 0 else 'weaker'} for you ({abs(d):.1f} points {'above' if d > 0 else 'below'} the rest of the week): "
                 + ("the weekend recharges you, so start the week with the hard work." if d > 0 else "ease into the week and keep the first day lighter."))
        short = f"Mondays {d:+.1f} energy"
    return _out("weekend_recharge", "Weekend recharge", a, b, found, "Your Mondays look like the rest of your week.",
                "Needs energy taps on Mondays, and on Tuesday to Friday", short)


def _by_day(p: Profile) -> dict[date, list]:
    days: dict[date, list] = defaultdict(list)
    for r in sorted(p.reflections, key=lambda r: r.ts):
        days[_day(r.ts)].append(r)
    return days


def _nailed(r) -> bool:
    return r.choice == ReflectionChoice.NAILED


def decision_fatigue(p: Profile) -> dict[str, Any]:
    short = ""
    early, late = [], []
    for rs in _by_day(p).values():
        for i, r in enumerate(rs):
            if i <= 1:
                early.append(_nailed(r))
            elif i >= 3:
                late.append(_nailed(r))
    found = None
    if len(early) >= MIN_EACH and len(late) >= MIN_EACH:
        d = mean(early) - mean(late)
        if d >= RATE_GAP:
            found = f"Your first two tasks of the day land {round(d * 100)} points more often than the fourth and later: put the decisions that matter early."
            short = f"-{round(d * 100)} pts by the 4th task"
    return _out("decision_fatigue", "Decision fatigue", early, late, found, "Your fourth task of the day goes as well as your first.",
                "Needs days with several finished tasks", short)


def _good_day(rs: list) -> bool:
    return mean(1.0 if _nailed(r) else 0.0 for r in rs) >= 0.5


def streak_sensitivity(p: Profile) -> dict[str, Any]:
    short = ""
    days = _by_day(p)
    after_streak, after_other = [], []
    for d in sorted(days):
        prev = [date.fromordinal(d.toordinal() - k) for k in (1, 2, 3)]
        if not (prev[0] in days):
            continue
        streak = all(x in days and _good_day(days[x]) for x in prev)
        (after_streak if streak else after_other).append(_good_day(days[d]))
    found = None
    if len(after_streak) >= MIN_EACH and len(after_other) >= MIN_EACH:
        d = mean(after_streak) - mean(after_other)
        if abs(d) >= RATE_GAP:
            found = (f"After three good days in a row you have a good day {round(abs(d) * 100)} points {'more' if d > 0 else 'less'} often: "
                     + ("momentum carries you." if d > 0 else "a streak seems to make you ease off, so plan a lighter day after one."))
            short = f"{round(d * 100):+d} pts after a streak"
    return _out("streak_sensitivity", "Streaks", after_streak, after_other, found, "A run of good days does not change the next one.",
                "Needs days after three good days in a row, and days after any other", short)


def unfinished_carryover(p: Profile) -> dict[str, Any]:
    short = ""
    days = _by_day(p)
    after_open, after_clean = [], []
    for d in sorted(days):
        prev = date.fromordinal(d.toordinal() - 1)
        if prev not in days:
            continue
        left = any(r.actual_minutes > r.planned_minutes * 1.25 or r.choice.value in ("interrupted",) for r in days[prev])
        (after_open if left else after_clean).append(_good_day(days[d]))
    found = None
    if len(after_open) >= MIN_EACH and len(after_clean) >= MIN_EACH:
        d = mean(after_clean) - mean(after_open)
        if d >= RATE_GAP:
            found = f"A day that ends with something unfinished costs you the next one: {round(d * 100)} points fewer good days. Close open loops before the day ends."
            short = f"-{round(d * 100)} pts after an open day"
    return _out("unfinished_anxiety", "Unfinished tasks", after_open, after_clean, found, "Leaving something unfinished does not drag the next day down.",
                "Needs days that followed an unfinished day, and days that followed a clean one", short)


def activation_energy(p: Profile) -> dict[str, Any]:
    default = Profile().ramp_up_min
    ramps = {k: v for k, v in p.ramp_up_min.items() if v and v != default.get(k)}      # only what was learned, not the starting guesses
    if not ramps:
        return {"key": "activation_energy", "label": "Getting started", "state": "learning", "evidence": 0, "confidence": "low", "short": "Not enough data yet",
                "text": "Still learning how long you take to get going on each kind of work."}
    k, v = max(ramps.items(), key=lambda kv: kv[1])
    return {"key": "activation_energy", "label": "Getting started", "state": "found", "evidence": len(ramps), "confidence": "medium",
            "short": f"{k.replace('_', ' ').capitalize()} ~{v} min to start", "text": f"{k.replace('_', ' ').capitalize()} takes you longest to start: about {v} minutes before you are properly going. Otto adds that to the block."}


_ORDER = {"high": 0, "medium": 1, "low": 2}


def compute(p: Profile) -> list[dict[str, Any]]:
    """Every pattern, the ones Otto is surest of first (then those with something found, then by how much data there is)."""
    out = [f(p) for f in (switching_cost, activation_energy, meeting_drain, deadline_pressure, post_hard_recovery,
                          decision_fatigue, streak_sensitivity, monday_start, unfinished_carryover)]
    return sorted(out, key=lambda x: (_ORDER[x["confidence"]], x["state"] != "found", -x["evidence"]))


def found(p: Profile) -> list[dict[str, str]]:
    """What the weekly chat is told: only the patterns that were actually found."""
    return [{"pattern": x["label"], "finding": x["text"]} for x in compute(p) if x["state"] == "found"]
