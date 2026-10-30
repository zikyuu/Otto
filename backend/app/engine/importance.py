"""How much the user says a piece of work matters (engine, deterministic).

The user sorts tasks into three cards, and inside each card into tiers (tier 1 is the most important; tasks that share a tier
have no order between them):

    important     what has to go well
    good          good to get done
    whatever      fine if it slips

An event carries `importance_cat` and `importance_tier`. This turns that into one number from 0 to 1 that the scheduler adds
to its priority (so a deadline is no longer the only thing that decides order), and that the late-start and overwhelmed
planners sort by. A task the user has not sorted has no number: it is neutral (0.5) and the scheduler adds nothing for it.
"""
from __future__ import annotations

from typing import Any

CATS = ("important", "good", "whatever")
LABELS = {"important": "Important", "good": "Good to accomplish", "whatever": "Whatever"}
_TOP = {"important": 1.0, "good": 0.65, "whatever": 0.3}
_STEP = {"important": 0.05, "good": 0.05, "whatever": 0.04}
_FLOOR = {"important": 0.7, "good": 0.4, "whatever": 0.05}
NEUTRAL = 0.5
HIGH = 0.7          # at or above: counts as important


def tier_of(e: dict[str, Any]) -> int:
    try:
        return max(1, int(e.get("importance_tier") or 1))
    except (TypeError, ValueError):
        return 1


def user_priority(e: dict[str, Any]) -> float | None:
    cat = e.get("importance_cat")
    if cat not in CATS:
        return None
    return round(max(_FLOOR[cat], _TOP[cat] - _STEP[cat] * (tier_of(e) - 1)), 3)


def value(e: dict[str, Any]) -> float:
    p = user_priority(e)
    return NEUTRAL if p is None else p


def is_important(e: dict[str, Any]) -> bool:
    return value(e) >= HIGH


def is_low(e: dict[str, Any]) -> bool:
    """Marked good-to-do or whatever (not just unsorted)."""
    return e.get("importance_cat") in ("good", "whatever")


def label(e: dict[str, Any]) -> str | None:
    cat = e.get("importance_cat")
    if cat not in CATS:
        return None
    return f"{LABELS[cat]}, tier {tier_of(e)}"
