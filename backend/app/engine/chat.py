"""Weekly mascot chat: free text -> stated rules.

The LLM (when a key is set) reads what the user said and proposes rules from a fixed list. Nothing is applied
here: the proposals go back to the user, who confirms each one, and only then does /api/learning/stated-rule pin
it. Whatever the model returns is validated with the same checks as a typed rule, so a bad value never reaches
the profile.

Without a key a small keyword reader covers the common sentences, so the chat still does something useful.
"""
from __future__ import annotations

import re
from typing import Any

from app.engine import learning
from app.models import Profile

RULE_GUIDE = """Rules you may propose (key: value):
- peak_window: [start_hour, end_hour], when they do their best focused work, hours 0-24
- day_start_min / day_end_min: minutes from midnight, when their day starts / ends (end may pass midnight, up to 1680)
- focus_span_min: minutes of deep focus they can sustain, 20-240
- recovery_after_meeting: minutes of buffer after a meeting, 0-120
- post_meal_slump_min: low-energy minutes after lunch, 0-120
- max_deep_run_min: longest deep-work stretch before a break, 30-240
- break_min: break length, 0-60
- batching_preference: "batch" | "spread" | "none" for small admin tasks
- gym_first: true | false, exercise before deep work
- planning_bias: 0.3-1.0, the share of free time they can honestly plan into
- ramp_up_min:<category>: minutes to get started, category one of deep_work, admin, creative, physical, social"""

SYSTEM = (
    "You are Otto, a calm otter who helps someone plan their week. They are reflecting on how the week went. You get what "
    "they said, what the week's logged numbers were, and the settings Otto plans with now. Turn their reflection into "
    "concrete adjustments to those settings, using only the rules below.\n"
    "Two kinds of adjustment:\n"
    "  source \"said\"     - they stated it outright (\"I focus best 9 to 12\").\n"
    "  source \"inferred\" - you conclude it from what happened (they hit their goals but gave up sleep for it, so end the working "
    "day earlier and plan less per day; they say afternoons are a write-off, so move focus work to the morning). Keep inferred "
    "changes small: move a time by at most 1-2 hours, planning_bias by at most 0.2. Give a one-sentence reason that quotes what "
    "they said or the number you used. If nothing in what they said calls for a change, return no rules.\n"
    "Never invent facts. Never change goals or deadlines: you only adjust how time is planned.\n"
    'Return JSON: {"reply": "one or two warm sentences, plain, no exclamation marks", '
    '"rules": [{"key": "...", "value": ..., "source": "said|inferred", "reason": "one sentence", "note": "their words, short"}], '
    '"follow_up": "one question if something important is unclear, else empty"}.\n' + RULE_GUIDE
)

_TIME = r"(\d{1,2})(?::(\d{2}))?\s*(am|pm)?"


def _hour(h: str, ap: str | None) -> int:
    v = int(h)
    if ap == "pm" and v < 12:
        v += 12
    if ap == "am" and v == 12:
        v = 0
    return v


def keyword_rules(text: str) -> list[dict[str, Any]]:
    """The no-key reader. Deliberately small: it only claims what the sentence plainly says."""
    t = text.lower()
    out: list[dict[str, Any]] = []
    m = re.search(r"(?:best|focus|work)[^.]*?\b(?:between|from)\s*" + _TIME + r"\s*(?:to|and|-|until)\s*" + _TIME, t)
    if m:
        a = _hour(m.group(1), m.group(3) or m.group(6))
        b = _hour(m.group(4), m.group(6))
        if 0 <= a < b <= 24:
            out.append({"key": "peak_window", "value": [a, b], "note": text.strip()[:140]})
    if re.search(r"\bmorning person\b|\bbest in the (?:early )?morning", t) and not any(r["key"] == "peak_window" for r in out):
        out.append({"key": "peak_window", "value": [7, 11], "note": text.strip()[:140]})
    if re.search(r"\bnight (?:owl|person)\b|\bbest (?:in the )?(?:evening|at night)", t):
        out.append({"key": "peak_window", "value": [19, 23], "note": text.strip()[:140]})
    m = re.search(r"(?:can|only)?\s*focus (?:for )?(?:about |around )?(\d{2,3})\s*(?:min|minutes)", t)
    if m:
        out.append({"key": "focus_span_min", "value": int(m.group(1)), "note": text.strip()[:140]})
    m = re.search(r"(\d{1,3})\s*(?:min|minutes)[^.]*after (?:a |my )?meetings?", t)
    if m:
        out.append({"key": "recovery_after_meeting", "value": int(m.group(1)), "note": text.strip()[:140]})
    if re.search(r"\b(gym|workout|exercise)\b[^.]*\b(first|before)\b|\bgym first\b", t):
        out.append({"key": "gym_first", "value": True, "note": text.strip()[:140]})
    if re.search(r"\bbatch\b[^.]*\b(admin|emails?|small tasks)\b|\b(admin|emails?)\b[^.]*\bbatch", t):
        out.append({"key": "batching_preference", "value": "batch", "note": text.strip()[:140]})
    elif re.search(r"\bspread\b[^.]*\b(admin|small tasks|emails?)\b", t):
        out.append({"key": "batching_preference", "value": "spread", "note": text.strip()[:140]})
    m = re.search(r"(?:wake|get) up (?:at|around)\s*" + _TIME, t)
    if m:
        out.append({"key": "day_start_min", "value": _hour(m.group(1), m.group(3)) * 60 + int(m.group(2) or 0), "note": text.strip()[:140]})
    m = re.search(r"(?:sleep|go to bed|bed) (?:at|around)\s*" + _TIME, t)
    if m:
        h = _hour(m.group(1), m.group(3))
        mins = (h + (24 if h < 6 else 0)) * 60 + int(m.group(2) or 0)
        out.append({"key": "day_end_min", "value": mins, "note": text.strip()[:140]})
    return out


def validate(profile: Profile, rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep only proposals that would be accepted as typed rules (checked on a throwaway copy). Inferred ones are first
    pulled to a small step from where the setting is now."""
    import copy
    ok, seen = [], set()
    for r in rules:
        key, value = r.get("key"), r.get("value")
        if not isinstance(key, str) or key in seen:
            continue
        source = "inferred" if r.get("source") == "inferred" else "said"
        if source == "inferred":
            value = bound_inferred(profile, key, value)
        try:
            learning.set_stated_rule(copy.deepcopy(profile), key, value, "")
        except ValueError:
            continue
        seen.add(key)
        ok.append({"key": key, "value": value, "note": str(r.get("note") or "")[:200], "label": describe(key, value),
                   "source": source, "reason": str(r.get("reason") or "")[:240], "current": current_value(profile, key),
                   "current_label": describe(key, current_value(profile, key)) if current_value(profile, key) is not None else ""})
    return ok


def describe(key: str, value: Any) -> str:
    def hm(m: int) -> str:
        m = int(m)
        return f"{(m // 60) % 24:02d}:{m % 60:02d}"
    if key == "peak_window":
        return f"Your best focus hours are {value[0]:02d}:00 to {value[1]:02d}:00"
    if key == "day_start_min":
        return f"Your day starts at {hm(value)}"
    if key == "day_end_min":
        return f"Your day ends at {hm(value)}"
    if key == "focus_span_min":
        return f"You can focus for about {value} minutes at a time"
    if key == "recovery_after_meeting":
        return f"Leave {value} minutes free after a meeting"
    if key == "post_meal_slump_min":
        return f"Expect a {value}-minute slump after lunch"
    if key == "max_deep_run_min":
        return f"No more than {value} minutes of deep work in a row"
    if key == "break_min":
        return f"Breaks are {value} minutes"
    if key == "batching_preference":
        return {"batch": "Group small admin tasks into one stretch", "spread": "Spread small admin tasks across days"}.get(value, "Do not group admin tasks")
    if key == "gym_first":
        return "Exercise comes before deep work" if value else "Exercise has no fixed place before deep work"
    if key == "planning_bias":
        return f"Plan about {round(float(value) * 100)}% of your free time"
    if key.startswith("ramp_up_min:"):
        return f"{key.split(':', 1)[1].replace('_', ' ').title()} needs {value} minutes to get started"
    return key


# the rules a person can set by hand: what each one is called and what it accepts (the forms are drawn from this)
CATALOGUE = [
    {"key": "peak_window", "name": "Best focus hours", "kind": "hours", "min": 0, "max": 24},
    {"key": "day_start_min", "name": "Day starts", "kind": "clock", "min": 0, "max": 12 * 60},
    {"key": "day_end_min", "name": "Day ends", "kind": "clock", "min": 6 * 60, "max": 28 * 60},
    {"key": "focus_span_min", "name": "Focus span (minutes)", "kind": "minutes", "min": 20, "max": 240},
    {"key": "max_deep_run_min", "name": "Longest deep-work stretch (minutes)", "kind": "minutes", "min": 30, "max": 240},
    {"key": "break_min", "name": "Break length (minutes)", "kind": "minutes", "min": 0, "max": 60},
    {"key": "recovery_after_meeting", "name": "Free time after a meeting (minutes)", "kind": "minutes", "min": 0, "max": 120},
    {"key": "post_meal_slump_min", "name": "Lunch slump (minutes)", "kind": "minutes", "min": 0, "max": 120},
    {"key": "planning_bias", "name": "Share of free time to plan", "kind": "percent", "min": 30, "max": 100},
    {"key": "batching_preference", "name": "Small admin tasks", "kind": "choice", "choices": [["batch", "Group them"], ["spread", "Spread them out"], ["none", "No preference"]]},
    {"key": "gym_first", "name": "Exercise before deep work", "kind": "bool"},
]


# ---- adjustments inferred from how the week went --------------------------------------------------------------------

_SLEEP = re.compile(r"(sacrific\w*|lost|less|not enough|skipp\w*|cut|gave up|short on)[^.]{0,30}sleep|sleep[^.]{0,30}(suffer\w*|slipp\w*|short)|stayed up|up late|all.?nighter|slept (only|late|badly|little)|burn(ed|t) out|exhaust\w*", re.I)
_TOO_MUCH = re.compile(r"too much|overload\w*|overwhelm\w*|over.?committed|didn.?t get through|couldn.?t finish|everything took longer|behind on everything|crammed", re.I)
_MORNING = re.compile(r"(morning|early)[^.]{0,25}(better|best|productive)|afternoons? (are|were) (a )?(write.?off|useless|dead)|slump", re.I)


def current_value(profile: Profile, key: str):
    if key.startswith("ramp_up_min:"):
        return profile.ramp_up_min.get(key.split(":", 1)[1])
    v = getattr(profile, key, None)
    return list(v) if isinstance(v, tuple) else v


def infer_rules(text: str, profile: Profile) -> list[dict[str, Any]]:
    """What a person's own account of the week implies, without a model. Small, explained, and only ever a proposal."""
    out: list[dict[str, Any]] = []
    if _SLEEP.search(text):
        end = max(profile.day_start_min + 9 * 60, profile.day_end_min - 60)
        if end < profile.day_end_min:
            out.append({"key": "day_end_min", "value": end, "source": "inferred", "note": text.strip()[:140],
                        "reason": "You gave up sleep to get things done, so Otto will stop planning an hour earlier and keep your evenings clear."})
        out.append({"key": "planning_bias", "value": round(max(0.5, profile.planning_bias - 0.1), 2), "source": "inferred", "note": text.strip()[:140],
                    "reason": "Planning a little less per day leaves room so work does not spill into the night."})
    elif _TOO_MUCH.search(text):
        out.append({"key": "planning_bias", "value": round(max(0.5, profile.planning_bias - 0.1), 2), "source": "inferred", "note": text.strip()[:140],
                    "reason": "You felt overloaded, so Otto will plan about a tenth less of your free time."})
    if _MORNING.search(text) and profile.peak_window[0] > 8:
        a = profile.peak_window[0] - 2
        out.append({"key": "peak_window", "value": [a, a + (profile.peak_window[1] - profile.peak_window[0])], "source": "inferred", "note": text.strip()[:140],
                    "reason": "You work better earlier in the day, so hard work moves two hours earlier."})
    return out


# an inferred change may move a setting only so far in one go; what the person says outright is not limited
_MAX_STEP = {"day_start_min": 120, "day_end_min": 120, "peak_window": 3, "planning_bias": 0.2, "focus_span_min": 40, "max_deep_run_min": 45,
             "break_min": 10, "recovery_after_meeting": 20, "post_meal_slump_min": 30}


def bound_inferred(profile: Profile, key: str, value):
    """Clamp an inferred value to a small step from the current one (said rules pass through)."""
    cur = current_value(profile, key)
    step = _MAX_STEP.get(key)
    if cur is None or step is None:
        return value
    if key == "peak_window" and isinstance(value, (list, tuple)) and len(value) == 2:
        d = max(-step, min(step, value[0] - cur[0]))
        return [cur[0] + d, cur[1] + d + ((value[1] - value[0]) - (cur[1] - cur[0]))]
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        lo, hi = cur - step, cur + step
        v = max(lo, min(hi, value))
        return round(v, 2) if isinstance(cur, float) else int(v)
    return value


REPLAN_KEYS = {"day_start_min", "day_end_min", "peak_window", "planning_bias", "max_deep_run_min", "break_min", "recovery_after_meeting",
               "post_meal_slump_min", "batching_preference", "gym_first"}
