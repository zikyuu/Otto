"""Everything Otto has worked out about how the person works, in plain words, and how the scheduler uses each number.

This is the "no black box" view: each setting has a short name, a one-line meaning, its value, where the value came from (the
person pinned it, Otto learned it from their logs, or it is still a starting guess), and what the scheduler does with it.
`target` is optional: a value the person is trying to move towards (they are not asked to hit it; it only drives reminders).
"""
from __future__ import annotations

from typing import Any

from app.engine import learning
from app.models import Profile

CAT_NAMES = {"deep_work": "Deep work", "admin": "Admin", "creative": "Creative", "physical": "Physical", "social": "Social"}


def _hm(m: int) -> str:
    return f"{(int(m) // 60) % 24:02d}:{int(m) % 60:02d}"


def build(p: Profile, targets: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    targets = targets or {}
    pinned = set(p.stated_overrides)
    n_energy, n_refl = len(p.energy_logs), len(p.reflections)
    D = Profile()

    def m(key, name, blurb, value, display, uses, group, *, evidence=None, default=None, kind=None, unit=None, target_ok=False, learned=True):
        if key in pinned:
            src = "pinned"
        elif not learned:
            src = "measured"
        elif evidence is not None and evidence > 0:
            src = "learned"
        elif default is not None and value != default:
            src = "learned"
        else:
            src = "default"
        row = {"key": key, "name": name, "blurb": blurb, "value": value, "display": display, "uses": uses, "group": group,
               "source": src, "evidence": evidence, "kind": kind, "unit": unit, "editable": kind is not None,
               "target": targets.get(key) if target_ok else None, "can_target": target_ok}
        if kind == "choice":
            row["choices"] = [["batch", "Group them"], ["spread", "Spread them out"], ["none", "No preference"]]
        return row

    out = [
        m("peak_window", "Best focus hours", "When your hardest work goes.", list(p.peak_window), f"{p.peak_window[0]}:00 to {p.peak_window[1]}:00",
          "Deep and long tasks are only placed inside this window; admin and light work fill the hours around it.", "Your rhythm",
          evidence=n_energy, default=list(D.peak_window), kind="hours"),
        m("day_start_min", "Day starts", "When your waking day begins.", p.day_start_min, _hm(p.day_start_min),
          "Nothing is planned before this. Time before it shows as sleep on the calendar.", "Your rhythm", default=D.day_start_min, kind="clock"),
        m("day_end_min", "Day ends", "When your waking day ends.", p.day_end_min, _hm(p.day_end_min),
          "Nothing is planned after this unless a hard deadline cannot be met any other way (then it is flagged).", "Your rhythm", default=D.day_end_min, kind="clock"),
        m("chronotype", "Body clock", "Whether you are a morning, midday or night person.", learning.chronotype(p), f"{learning.chronotype(p)} person",
          "Read from your best focus hours. It decides where the day's hard block sits.", "Your rhythm", learned=False),
        m("post_meal_slump_min", "Lunch slump", "How long you are flat after eating.", p.post_meal_slump_min, f"{p.post_meal_slump_min} min",
          "Otto keeps demanding work out of that stretch after lunch and leaves it for easy things.", "Your rhythm", evidence=n_energy,
          default=D.post_meal_slump_min, kind="minutes", unit="min", target_ok=True),
        m("focus_span_min", "Focus span", "How long you stay locked in for one sitting.", p.focus_span_min, f"{p.focus_span_min} min",
          "Long tasks are cut into sessions of about this length, so you are never asked for a stretch you cannot hold.", "Focus and breaks",
          evidence=p.focus_evidence, default=D.focus_span_min, kind="minutes", unit="min", target_ok=True),
        m("max_deep_run_min", "Longest deep stretch", "The most deep work in a row before a break.", p.max_deep_run_min, f"{p.max_deep_run_min} min",
          "After this much deep work Otto inserts a break before the next block.", "Focus and breaks", default=D.max_deep_run_min, kind="minutes", unit="min", target_ok=True),
        m("break_min", "Break length", "How long your breaks are.", p.break_min, f"{p.break_min} min",
          "The length of the break Otto inserts after a long deep stretch.", "Focus and breaks", default=D.break_min, kind="minutes", unit="min", target_ok=True),
        m("recovery_after_meeting", "After a meeting", "Free time you need after a meeting.", p.recovery_after_meeting, f"{p.recovery_after_meeting} min",
          "Otto leaves this much room after meetings before putting demanding work next to them.", "Focus and breaks", evidence=p.recovery_evidence,
          default=D.recovery_after_meeting, kind="minutes", unit="min", target_ok=True),
        m("planning_bias", "Planning load", "How much of your free time Otto fills.", p.planning_bias, f"{round(p.planning_bias * 100)}% of free time",
          "Otto only plans this share of your free time, so a normal day is not packed solid. It rises when you finish things and falls when you do not.", "Load",
          evidence=p.completion_evidence, default=D.planning_bias, kind="percent"),
        m("completion_rate", "Follow-through", "How much of what you plan, you finish.", p.completion_rate, f"{round(p.completion_rate * 100)}%",
          "Used to warn you when a week is more than you usually get through.", "Load", evidence=p.completion_evidence, default=D.completion_rate, learned=True),
        m("batching_preference", "Small admin tasks", "Whether small tasks are grouped or spread out.", p.batching_preference,
          {"batch": "Group them", "spread": "Spread them out"}.get(p.batching_preference, "No preference"),
          "Decides whether small admin tasks are lined up in one stretch or spread through the week.", "Preferences", default=D.batching_preference, kind="choice"),
        m("gym_first", "Exercise first", "Whether you exercise before deep work.", p.gym_first, "Yes" if p.gym_first else "No",
          "When on, Otto puts exercise ahead of the day's deep work.", "Preferences", evidence=p.gym_evidence, default=D.gym_first, kind="bool"),
    ]
    for cat, v in p.avg_velocity.items():
        out.append(m(f"velocity:{cat}", f"Pace: {CAT_NAMES.get(cat, cat).lower()}", "How your real time compares with your estimates.", v, f"{v:.2f}x",
                     "Your estimates for this kind of work are multiplied by this before Otto books the time. Above 1 means it usually takes you longer.",
                     "Pace", evidence=n_refl, default=D.avg_velocity.get(cat), unit="x"))
    for cat, v in p.ramp_up_min.items():
        out.append(m(f"ramp_up_min:{cat}", f"Getting started: {CAT_NAMES.get(cat, cat).lower()}", "Minutes you need to get going.", v, f"{v} min",
                     "Added to the start of this kind of block, so the time you plan is time you are actually working.", "Pace",
                     evidence=n_refl, default=D.ramp_up_min.get(cat), kind="minutes", unit="min", target_ok=True))
    return out
