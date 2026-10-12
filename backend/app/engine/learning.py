# updates Profile from user signals
# never called by scheduler directly
# flow: user action -> API endpoint logs signal -> learning.py updates Profile
#   -> profile saved -> next /api/schedule call reads the updated profile
# keep this pure: no I/O, no LLM (our own engineered algorithm)

from __future__ import annotations

from app.models import (
    BATCHING_CHOICES, Category, EnergyLog, OffTrackLog, Profile, ReflectionChoice, TaskReflection,
)

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


def _locked(profile: Profile, key: str) -> bool:
    """True if the user has stated this parameter directly. A stated rule outranks anything derived
    (signal hierarchy level 1), so learning keeps collecting evidence but never overwrites it."""
    return key in profile.stated_overrides


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


FOCUS_CATEGORIES    = {"deep_work", "creative"}   # where a "longest stretch" means anything
FOCUS_BREAK_REASONS = {"doomscrolled", "messages", "couldnt_focus"}   # focus failing — not emergencies, not healthy breaks
FOCUS_SPAN_MIN, FOCUS_SPAN_MAX = 45, 480
FOCUS_MIN_BREAK_AT  = 20      # a lapse in the first 20 minutes is distraction, not a sign of fatigue


def _clamp_span(x: float) -> int:
    return int(round(min(max(x, FOCUS_SPAN_MIN), FOCUS_SPAN_MAX)))


def update_focus_span_from_reflection(profile: Profile, reflection: TaskReflection) -> Profile:
    """A long session that finished on plan is evidence the user can sustain that stretch.

    Only sessions near or beyond the current span say anything (a 45-minute success tells us
    nothing about 4 hours), and success only ever raises the span."""
    if reflection.choice != ReflectionChoice.NAILED or _locked(profile, "focus_span_min"):
        return profile
    if getattr(reflection, "category", "deep_work") not in FOCUS_CATEGORIES:
        return profile
    if reflection.actual_minutes <= 0 or reflection.actual_minutes < 0.75 * profile.focus_span_min:
        return profile
    observed = min(reflection.actual_minutes, reflection.planned_minutes * 1.15)
    if observed > profile.focus_span_min:
        profile.focus_span_min = _clamp_span((1 - EMA_WEIGHT) * profile.focus_span_min + EMA_WEIGHT * observed)
    profile.focus_evidence += 1
    return profile


def update_focus_span_from_break(profile: Profile, log: OffTrackLog) -> Profile:
    """A labelled focus break N minutes into a session says focus faded around N. Only lowers."""
    if log.reason not in FOCUS_BREAK_REASONS or log.into_task_min is None or _locked(profile, "focus_span_min"):
        return profile
    if log.into_task_min < FOCUS_MIN_BREAK_AT:
        return profile
    observed = max(log.into_task_min, FOCUS_SPAN_MIN)
    if observed < profile.focus_span_min:
        profile.focus_span_min = _clamp_span((1 - EMA_WEIGHT) * profile.focus_span_min + EMA_WEIGHT * observed)
    profile.focus_evidence += 1
    return profile


def add_off_track(profile: Profile, log: OffTrackLog) -> Profile:
    """Store a labelled off-track block and learn from it."""
    profile.off_track_logs.append(log)
    profile.off_track_logs = profile.off_track_logs[-MAX_HISTORY:]
    return update_focus_span_from_break(profile, log)


def update_peak_window(profile: Profile) -> Profile:
    """Recalculate peak_window from accumulated energy logs.

    Needs at least MIN_ENERGY_LOGS logs spread over MIN_ENERGY_HOURS distinct hours
    before shifting — avoids overreacting to one tired morning, or to a user who only
    ever taps the button at one time of day. Picks the 3-hour window with the highest
    average energy; hours with no logs don't count for or against a window, but a
    window must be backed by logs in at least 2 of its 3 hours."""
    if len(profile.energy_logs) < MIN_ENERGY_LOGS or _locked(profile, "peak_window"):
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


PLANNING_BIAS_MIN, PLANNING_BIAS_MAX = 0.5, 0.95
MIN_COMPLETION_EVIDENCE = 5     # signals before planning_bias starts following completion_rate


def update_completion_rate(profile: Profile, done: bool, planned_minutes: int) -> Profile:
    """Update overall completion_rate after any task is marked done/missed, and — once there are a few
    signals — pull planning_bias towards it: a user who finishes 60% of what is planned should have
    60% of their free hours scheduled, not 80%."""
    signal = 1.0 if done else 0.0
    profile.completion_rate = round(
        (1 - EMA_WEIGHT) * profile.completion_rate + EMA_WEIGHT * signal, 3
    )
    profile.completion_evidence += 1
    if profile.completion_evidence >= MIN_COMPLETION_EVIDENCE and not _locked(profile, "planning_bias"):
        target = min(max(profile.completion_rate, PLANNING_BIAS_MIN), PLANNING_BIAS_MAX)
        profile.planning_bias = round((1 - EMA_WEIGHT) * profile.planning_bias + EMA_WEIGHT * target, 3)
    return profile


# ---------------------------------------------------------------------------
# Energy-derived parameters: post-meal slump, meeting recovery
# ---------------------------------------------------------------------------

SLUMP_MIN, SLUMP_MAX = 15, 120
SLUMP_WINDOW = 180          # only logs in the three hours after noon say anything about a slump
MIN_SLUMP_LOGS = 6
SLUMP_DROP = 0.75           # a log this far under the user's average counts as "slumping"


def update_post_meal_slump(profile: Profile) -> Profile:
    """How long after lunch (12:00) energy stays low. Needs several logs in the afternoon window; the
    slump ends a little after the last low-energy tap. With plenty of logs and none low, it shrinks."""
    if _locked(profile, "post_meal_slump_min") or len(profile.energy_logs) < MIN_ENERGY_LOGS:
        return profile
    avg = sum(l.level for l in profile.energy_logs) / len(profile.energy_logs)
    window: list[tuple[int, int]] = []
    for log in profile.energy_logs:
        try:
            mins = int(log.ts[11:13]) * 60 + int(log.ts[14:16]) - 12 * 60
        except ValueError:
            continue
        if 0 <= mins < SLUMP_WINDOW:
            window.append((mins, log.level))
    if len(window) < MIN_SLUMP_LOGS:
        return profile
    lows = [m for m, lvl in window if lvl <= avg - SLUMP_DROP]
    target = min(max(max(lows) + 15 if lows else SLUMP_MIN, SLUMP_MIN), SLUMP_MAX)
    profile.post_meal_slump_min = int(round(
        min(max((1 - EMA_WEIGHT) * profile.post_meal_slump_min + EMA_WEIGHT * target, SLUMP_MIN), SLUMP_MAX)))
    return profile


RECOVERY_MIN, RECOVERY_MAX = 5, 90
RECOVERY_MAX_GAP = 180      # a tap this long after a meeting says nothing about the meeting


def update_recovery(profile: Profile, log: EnergyLog) -> Profile:
    """meeting hangover: an energy tap labelled with minutes-since-the-meeting-ended.
    Still drained N minutes later → recovery needs to be longer than N. Energised N minutes later while
    the buffer is longer than N → it can shrink."""
    m = log.after_meeting_min
    if m is None or m < 0 or m > RECOVERY_MAX_GAP:
        return profile
    cur = profile.recovery_after_meeting
    if log.level <= 2 and m >= cur:
        target = m + 10
    elif log.level >= 4 and m < cur:
        target = max(m, RECOVERY_MIN)
    else:
        return profile
    profile.recovery_evidence += 1
    if not _locked(profile, "recovery_after_meeting"):
        profile.recovery_after_meeting = int(round(
            min(max((1 - EMA_WEIGHT) * cur + EMA_WEIGHT * target, RECOVERY_MIN), RECOVERY_MAX)))
    return profile


# ---------------------------------------------------------------------------
# Reflection-derived parameters: ramp-up time, gym-first pattern
# ---------------------------------------------------------------------------

RAMP_MAX = 45
MIN_RAMP_POINTS = 5
MIN_RAMP_SPREAD = 30        # planned durations must differ by this much, or intercept and slope are indistinguishable


def update_ramp_up(profile: Profile, category: str) -> Profile:
    """Ramp-up = the fixed cost on top of the proportional cost. Fit actual = velocity × planned + ramp
    over this category's reflections; the intercept is the time it takes to get going."""
    if category not in _KNOWN_CATEGORIES or _locked(profile, f"ramp_up_min:{category}"):
        return profile
    pts = [(r.planned_minutes, r.actual_minutes) for r in profile.reflections
           if getattr(r, "category", "deep_work") == category and r.choice not in _NO_VELOCITY_SIGNAL
           and r.planned_minutes > 0 and r.actual_minutes > 0][-30:]
    if len(pts) < MIN_RAMP_POINTS or max(p for p, _ in pts) - min(p for p, _ in pts) < MIN_RAMP_SPREAD:
        return profile
    n = len(pts)
    sx, sy = sum(p for p, _ in pts), sum(a for _, a in pts)
    sxx, sxy = sum(p * p for p, _ in pts), sum(p * a for p, a in pts)
    denom = n * sxx - sx * sx
    if denom == 0:
        return profile
    slope = (n * sxy - sx * sy) / denom
    intercept = min(max((sy - slope * sx) / n, 0.0), RAMP_MAX)
    cur = profile.ramp_up_min.get(category, 0)
    profile.ramp_up_min[category] = int(round((1 - EMA_WEIGHT) * cur + EMA_WEIGHT * intercept))
    return profile


GYM_MIN_DAYS = 3
GYM_FIRST_SHARE = 0.7       # of days with both gym and deep work, how many the gym came first


def update_gym_pattern(profile: Profile) -> Profile:
    """Gym-first: on days the user did both, did the gym come before the deep work? Order is read from
    when the reflections were logged. With enough such days, a clear majority either way sets the rule."""
    first = total = 0
    by_day: dict[str, dict[str, str]] = {}
    for r in profile.reflections:
        cat = getattr(r, "category", "")
        if cat in ("physical", "deep_work") and len(r.ts) >= 16:
            slot = by_day.setdefault(r.ts[:10], {})
            if cat not in slot or r.ts < slot[cat]:
                slot[cat] = r.ts
    for slot in by_day.values():
        if "physical" in slot and "deep_work" in slot:
            total += 1
            first += slot["physical"] < slot["deep_work"]
    profile.gym_evidence = total
    if total >= GYM_MIN_DAYS and not _locked(profile, "gym_first"):
        share = first / total
        if share >= GYM_FIRST_SHARE:
            profile.gym_first = True
        elif share <= 1 - GYM_FIRST_SHARE:
            profile.gym_first = False
    return profile


def chronotype(profile: Profile) -> str:
    """Derived pattern: morning / night / midday person, read from the learned peak window."""
    start = profile.peak_window[0]
    return "morning" if start <= 9 else "night" if start >= 14 else "midday"


# ---------------------------------------------------------------------------
# Signals the user gives directly (hierarchy level 1) and cheap derived ones
# ---------------------------------------------------------------------------

def _int_in(v, lo: int, hi: int, name: str) -> int:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not (lo <= v <= hi):
        raise ValueError(f"{name} must be a number between {lo} and {hi}")
    return int(v)


def _validate_rule(profile: Profile, key: str, value):
    """Return the normalised value for a stated rule or raise ValueError."""
    if key == "peak_window":
        if not (isinstance(value, (list, tuple)) and len(value) == 2):
            raise ValueError("peak_window must be [start_hour, end_hour]")
        a, b = _int_in(value[0], 0, 23, "peak_window start"), _int_in(value[1], 1, 24, "peak_window end")
        if b <= a:
            raise ValueError("peak_window end must be after start")
        return (a, b)
    if key == "day_start_min":
        v = _int_in(value, 0, 12 * 60, key)
        if profile.day_end_min - v < 6 * 60:
            raise ValueError("the waking day must be at least 6 hours")
        return v
    if key == "day_end_min":
        v = _int_in(value, 6 * 60, 28 * 60, key)   # past midnight is allowed (all-nighters)
        if v - profile.day_start_min < 6 * 60:
            raise ValueError("the waking day must be at least 6 hours")
        return v
    if key == "focus_span_min":
        return _int_in(value, FOCUS_SPAN_MIN, FOCUS_SPAN_MAX, key)
    if key == "recovery_after_meeting":
        return _int_in(value, 0, RECOVERY_MAX, key)
    if key == "post_meal_slump_min":
        return _int_in(value, 0, SLUMP_MAX, key)
    if key == "max_deep_run_min":
        return _int_in(value, 30, 240, key)
    if key == "break_min":
        return _int_in(value, 0, 60, key)
    if key == "batching_preference":
        if value not in BATCHING_CHOICES:
            raise ValueError(f"batching_preference must be one of {', '.join(BATCHING_CHOICES)}")
        return value
    if key == "gym_first":
        if not isinstance(value, bool):
            raise ValueError("gym_first must be true or false")
        return value
    if key == "planning_bias":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not (0.3 <= value <= 1.0):
            raise ValueError("planning_bias must be between 0.3 and 1.0")
        return float(value)
    if key.startswith("ramp_up_min:"):
        if key.split(":", 1)[1] not in _KNOWN_CATEGORIES:
            raise ValueError(f"unknown category in {key}")
        return _int_in(value, 0, RAMP_MAX, key)
    raise ValueError(f"unknown rule {key!r}")


STATED_RULE_KEYS = ("peak_window", "day_start_min", "day_end_min", "focus_span_min", "recovery_after_meeting",
                    "post_meal_slump_min", "max_deep_run_min", "break_min", "batching_preference", "gym_first",
                    "planning_bias", "ramp_up_min:<category>")


def set_stated_rule(profile: Profile, key: str, value, note: str = "") -> Profile:
    """The user told Otto this directly (weekly chat, settings). It is applied now and pinned: learning
    from signals keeps running but never overwrites it. `note` keeps the original sentence."""
    value = _validate_rule(profile, key, value)
    if key.startswith("ramp_up_min:"):
        profile.ramp_up_min[key.split(":", 1)[1]] = value
    else:
        setattr(profile, key, value)
    profile.stated_overrides[key] = list(value) if isinstance(value, tuple) else value
    if note and note not in profile.stated_rules:
        profile.stated_rules.append(note)
    return profile


def clear_stated_rule(profile: Profile, key: str) -> Profile:
    """Hand the parameter back to learning (its current value stays until a signal moves it)."""
    profile.stated_overrides.pop(key, None)
    return profile


def set_sleep_window(profile: Profile, wake_min: int, sleep_min: int) -> Profile:
    """The user's sleep window = the edges of the schedulable day. `sleep_min` may run past midnight
    (e.g. 4am = 28*60) for all-nighters. Validated together, so a pair that is only valid as a pair works."""
    wake = _int_in(wake_min, 0, 12 * 60, "wake_min")
    sleep = _int_in(sleep_min, 6 * 60, 28 * 60, "sleep_min")
    if sleep - wake < 6 * 60:
        raise ValueError("the waking day must be at least 6 hours")
    profile.day_start_min, profile.day_end_min = wake, sleep
    profile.stated_overrides["day_start_min"] = wake
    profile.stated_overrides["day_end_min"] = sleep
    return profile


def record_completion(profile: Profile, done: bool, planned_minutes: int) -> Profile:
    """A plain done / missed mark (TaskCompletion). Feeds completion_rate and planning_bias."""
    return update_completion_rate(profile, done, planned_minutes)


ACTUAL_TOLERANCE = 0.10


def classify_actual(planned_minutes: int, actual_minutes: int) -> ReflectionChoice | None:
    """The user dragged a block's end to what really happened. Within tolerance of the plan it is a plain
    'nailed'; anything else needs the user's reason (harder? interrupted? just tired?) so None is returned
    and the caller asks for a reflection instead of guessing."""
    if planned_minutes <= 0 or actual_minutes <= 0:
        return None
    if abs(actual_minutes - planned_minutes) <= ACTUAL_TOLERANCE * planned_minutes:
        return ReflectionChoice.NAILED
    return None
def add_energy_log(profile: Profile, log: EnergyLog) -> Profile:
    """Append one energy tap, then re-derive peak_window."""
    profile.energy_logs.append(log)
    profile.energy_logs = profile.energy_logs[-MAX_HISTORY:]
    update_recovery(profile, log)
    update_post_meal_slump(profile)
    return update_peak_window(profile)


def apply_all_signals(profile: Profile, reflection: TaskReflection) -> Profile:
    """Run every update from a single post-task reflection, and keep it as history.

    INTERRUPTED is an external disruption — it must not count against completion_rate
    any more than it counts against velocity."""
    profile.reflections.append(reflection)
    profile.reflections = profile.reflections[-MAX_HISTORY:]

    profile = update_velocity(profile, reflection)
    profile = update_focus_span_from_reflection(profile, reflection)
    profile = update_ramp_up(profile, getattr(reflection, "category", "deep_work"))
    profile = update_gym_pattern(profile)
    if reflection.choice == ReflectionChoice.GAP and reflection.task_id not in profile.gap_task_ids:
        profile.gap_task_ids.append(reflection.task_id)    # a fundamental skill gap — the goals view shows it
    if reflection.choice != ReflectionChoice.INTERRUPTED:
        profile = update_completion_rate(
            profile,
            done=reflection.actual_minutes > 0,
            planned_minutes=reflection.planned_minutes,
        )
    return profile
