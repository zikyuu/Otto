# updates Profile from user signals
# never called by scheduler directly
# expected flow: user action -> API endpoint logs signal -> learning.py updates Profile
#   -> profile saved to DB -> next /api/plan call uses the updated profile
# keep this pure: no I/O, no LLM (our own engineered algorithm)

from __future__ import annotations

from app.models import Profile, ReflectionChoice, TaskReflection

EMA_WEIGHT = 0.2  # recent signal weighs 20%, history 80%
                  # roughly 5 sessions to meaningfully shift a pattern


def update_velocity(profile: Profile, reflection: TaskReflection) -> Profile:
    """Update avg_velocity for the task's category after a post-task reflection.
    Only HARDER and NAILED update velocity.
    OUTLIER, INTERRUPTED, GAP are excluded — not the user's real pace."""
    if reflection.choice in (ReflectionChoice.OUTLIER,
                              ReflectionChoice.INTERRUPTED,
                              ReflectionChoice.GAP):
        return profile

    ratio    = reflection.actual_minutes / max(reflection.planned_minutes, 1)
    category = getattr(reflection, 'category', 'deep_work')  # API endpoint passes real category
    current  = profile.avg_velocity.get(category, 1.0)
    updated  = (1 - EMA_WEIGHT) * current + EMA_WEIGHT * ratio
    profile.avg_velocity[category] = round(updated, 3)
    return profile


def update_peak_window(profile: Profile) -> Profile:
    """Recalculate peak_window from accumulated energy logs.
    Needs at least 10 logs before shifting — avoids overreacting to one tired morning."""
    if len(profile.energy_logs) < 10:
        return profile  # not enough data yet, keep cold-start default

    hour_scores: dict[int, list[int]] = {}
    for log in profile.energy_logs:
        hour = int(log.ts[11:13])  # "2026-07-29T09:30" -> 9
        hour_scores.setdefault(hour, []).append(log.level)

    avg_by_hour = {h: sum(v) / len(v) for h, v in hour_scores.items()}

    best_start, best_score = profile.peak_window[0], 0.0
    for h in range(6, 21):  # scan 6am–9pm
        window_score = sum(avg_by_hour.get(h + i, 0) for i in range(3))  # 3-hour window
        if window_score > best_score:
            best_start, best_score = h, window_score

    profile.peak_window = (best_start, best_start + 3)
    return profile


def update_completion_rate(profile: Profile, done: bool, planned_minutes: int) -> Profile:
    """Update overall completion_rate after any task is marked done/missed."""
    signal = 1.0 if done else 0.0
    profile.completion_rate = round(
        (1 - EMA_WEIGHT) * profile.completion_rate + EMA_WEIGHT * signal, 3
    )
    return profile


def apply_all_signals(profile: Profile, reflection: TaskReflection) -> Profile:
    """Convenience — run all updates from a single reflection signal."""
    profile = update_velocity(profile, reflection)
    profile = update_peak_window(profile)
    profile = update_completion_rate(
        profile,
        done=reflection.actual_minutes > 0,
        planned_minutes=reflection.planned_minutes,
    )
    return profile
