# updates Profile from user signals
# never called by scheduler directly
# flow: user action -> API endpoint logs signal -> learning.py updates Profile
#   -> profile saved -> next /api/schedule call reads the updated profile
# keep this pure: no I/O, no LLM (our own engineered algorithm)

from __future__ import annotations

from app.models import Category, EnergyLog, Profile, ReflectionChoice, TaskReflection

EMA_WEIGHT = 0.2  # recent signal weighs 20%, history 80%
                  # roughly 5 sessions to meaningfully shift a pattern

# One reflection can't swing the model: a forgotten timer (600min vs 60) must not
# make every future slot 10x. Ratios are clamped before they enter the average,
# and the average itself stays inside a sane band.
RATIO_MIN, RATIO_MAX = 0.5, 2.5
VELOCITY_MIN, VELOCITY_MAX = 0.6, 2.5

MIN_ENERGY_LOGS = 10        # don't shift peak_window before this many logs
MIN_ENERGY_HOURS = 3        # ...or before logs cover this many distinct hours of the day
MAX_HISTORY = 500           # cap stored signal lists so the saved profile stays small

_KNOWN_CATEGORIES = {c.value for c in Category}
_NO_VELOCITY_SIGNAL = (ReflectionChoice.OUTLIER, ReflectionChoice.INTERRUPTED, ReflectionChoice.GAP)


def update_velocity(profile: Profile, reflection: TaskReflection) -> Profile:
    """Update avg_velocity for the task's category after a post-task reflection.

    Only HARDER and NAILED update velocity.
    OUTLIER, INTERRUPTED, GAP are excluded — not the user's real pace.
    Also skipped: no time actually logged (actual<=0), unknown category."""
    if reflection.choice in _NO_VELOCITY_SIGNAL:
        return profile
    if reflection.actual_minutes <= 0 or reflection.planned_minutes <= 0:
        return profile

    category = getattr(reflection, "category", "deep_work")
    if category not in _KNOWN_CATEGORIES:
        return profile  # the scheduler only reads known buckets; don't grow junk keys

    ratio = reflection.actual_minutes / reflection.planned_minutes
    ratio = min(max(ratio, RATIO_MIN), RATIO_MAX)
    current = profile.avg_velocity.get(category, 1.0)
    updated = (1 - EMA_WEIGHT) * current + EMA_WEIGHT * ratio
    profile.avg_velocity[category] = round(min(max(updated, VELOCITY_MIN), VELOCITY_MAX), 3)
    return profile


def update_peak_window(profile: Profile) -> Profile:
    """Recalculate peak_window from accumulated energy logs.

    Needs at least MIN_ENERGY_LOGS logs spread over MIN_ENERGY_HOURS distinct hours
    before shifting — avoids overreacting to one tired morning, or to a user who only
    ever taps the button at one time of day. Picks the 3-hour window with the highest
    average energy; hours with no logs don't count for or against a window, but a
    window must be backed by logs in at least 2 of its 3 hours."""
    if len(profile.energy_logs) < MIN_ENERGY_LOGS:
        return profile

    hour_scores: dict[int, list[int]] = {}
    for log in profile.energy_logs:
        try:
            hour = int(log.ts[11:13])  # "2026-07-29T09:30" -> 9
        except ValueError:
            continue
        hour_scores.setdefault(hour, []).append(log.level)

    if len(hour_scores) < MIN_ENERGY_HOURS:
        return profile

    avg_by_hour = {h: sum(v) / len(v) for h, v in hour_scores.items()}

    best_start, best_key = None, (0.0, 0)
    for h in range(6, 21):  # scan 6am–9pm starts
        covered = [avg_by_hour[h + i] for i in range(3) if (h + i) in avg_by_hour]
        if len(covered) < 2:
            continue
        # highest average energy wins; on a tie, the window backed by more hours of data
        # wins (a 2-hour sliver mustn't beat a full 3-hour window); then the earlier start
        key = (round(sum(covered) / len(covered), 6), len(covered))
        if key > best_key:
            best_start, best_key = h, key

    if best_start is not None:
        profile.peak_window = (best_start, best_start + 3)
    return profile


def update_completion_rate(profile: Profile, done: bool, planned_minutes: int) -> Profile:
    """Update overall completion_rate after any task is marked done/missed."""
    signal = 1.0 if done else 0.0
    profile.completion_rate = round(
        (1 - EMA_WEIGHT) * profile.completion_rate + EMA_WEIGHT * signal, 3
    )
    return profile


def add_energy_log(profile: Profile, log: EnergyLog) -> Profile:
    """Append one energy tap, then re-derive peak_window."""
    profile.energy_logs.append(log)
    profile.energy_logs = profile.energy_logs[-MAX_HISTORY:]
    return update_peak_window(profile)


def apply_all_signals(profile: Profile, reflection: TaskReflection) -> Profile:
    """Run every update from a single post-task reflection, and keep it as history.

    INTERRUPTED is an external disruption — it must not count against completion_rate
    any more than it counts against velocity."""
    profile.reflections.append(reflection)
    profile.reflections = profile.reflections[-MAX_HISTORY:]

    profile = update_velocity(profile, reflection)
    if reflection.choice != ReflectionChoice.INTERRUPTED:
        profile = update_completion_rate(
            profile,
            done=reflection.actual_minutes > 0,
            planned_minutes=reflection.planned_minutes,
        )
    return profile
