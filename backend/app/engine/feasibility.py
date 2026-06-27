"""Feasibility + forced tradeoff (engine, deterministic).

Decides whether a plan can actually close at the user's REAL pace, and when it
can't, computes the minimal set of goals to drop and surfaces it as a calm
choice instead of cramming. This is the "you can't do both — choose" moment,
and it comes from math, not a prompt.
"""
from __future__ import annotations

from app.engine.scheduler import DAY_START, DAY_END, schedule
from app.models import Plan, Profile, Task, Wall


def required_minutes(tasks: list[Task], downscope: bool = False) -> int:
    return sum(t.lite_minutes if downscope else t.full_minutes for t in tasks)


def effective_capacity(profile: Profile, deadline_day: int) -> int:
    """Nominal free time up to the deadline, discounted by real velocity."""
    nominal = profile.free_hours_per_day * 60 * (deadline_day + 1)
    return int(nominal * profile.velocity)


def assess(tasks: list[Task], profile: Profile, goals: list, deadline_day: int) -> Plan:
    """Schedule, then if anything is at risk, decide if it's truly infeasible
    and build a forced-tradeoff between goals."""
    plan = schedule(tasks, profile, deadline_day)
    if plan.feasible:
        return plan

    # try downscoping before declaring infeasible — protects momentum
    lite_plan = schedule(tasks, profile, deadline_day, downscope=True)
    if lite_plan.feasible:
        lite_plan.feasible = True
        return lite_plan

    # genuinely can't fit: build a tradeoff between goals by importance
    need = required_minutes(tasks, downscope=True)
    have = effective_capacity(profile, deadline_day)

    goals_by_id = {g.id: g for g in goals}
    # group remaining work by goal
    per_goal: dict[str, int] = {}
    for t in tasks:
        per_goal[t.goal_id] = per_goal.get(t.goal_id, 0) + t.lite_minutes

    ranked = sorted(per_goal.items(),
                    key=lambda kv: goals_by_id.get(kv[0]).fit if kv[0] in goals_by_id else 0,
                    reverse=True)

    options = [
        {"goal_id": gid,
         "label": goals_by_id.get(gid).title if gid in goals_by_id else gid,
         "minutes": mins}
        for gid, mins in ranked
    ]
    plan.feasible = False
    plan.tradeoff = {
        "reason": (f"At your real pace you have about {have // 60}h before the "
                   f"deadline, but finishing everything needs about {need // 60}h. "
                   f"You can fully commit to one of these — not all. Which?"),
        "options": options,
    }
    return plan
