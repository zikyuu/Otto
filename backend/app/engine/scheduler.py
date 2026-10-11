"""The scheduling engine — THE STAR. Deterministic, no LLM, unit-testable.

Placement logic (in order):
  1. drop DONE tasks (already satisfied) and park MEATBALL_GRINDER tasks
  2. topo-sort tasks by prereqs (drop cycles defensively)
  3. sort by priority (value density, boosted by deadlines)
  4. stretch each task's required slot by the learned velocity for its category
     + ramp-up time, so a 90min deep-work task at velocity 1.3 needs ~132min
  5. for each task, walk candidate days (nearest to prefer_day first, else
     earliest first) up to its hard-deadline day, and take the first start time
     that passes _slot_ok():
       - HIGH/DEEP effort must start inside the learned peak window
       - post-lunch slump excluded
       - physical tasks stay out of the peak window
       - a task never starts before its prerequisites have finished
  6. if no clean slot: try splitting across sessions (optional)
  7. if that fails and the deadline is tight: overpack a slot >= 80% of need (optional)
  8. anything left → at_risk

Keep this pure — no LLM, no I/O, no database calls.
"""
from __future__ import annotations

from datetime import date

from app.models import Block, Category, EffortTier, Plan, Profile, Status, Task, TimeBlock

DAYS_IN_WEEK = 7
OVERPACK_THRESHOLD = 0.80  # slot must be ≥ 80% of required duration to overpack
DEADLINE_BUFFER    = 1.3   # warn when 30% more time than needed remains before deadline
START_GRID         = 15    # candidate start times inside a free interval land on this grid

# minimum useful session length per category
# shorter slots than this aren't worth the context-switch cost
MIN_SESSION: dict[str, int] = {
    "deep_work": 45,
    "admin":     10,
    "creative":  30,
    "physical":  20,
    "social":    30,
}

Interval = tuple[int, int]


# ---------------------------------------------------------------------------
# Free interval helpers
# ---------------------------------------------------------------------------

def _free_intervals(day: int, walls: list[TimeBlock], cap_minutes: int,
                    day_start: int, day_end: int) -> list[Interval]:
    """Free [start, end) intervals on a day, after removing walls, capped to
    the user's daily capacity (free_hours_per_day × planning_bias).
    day_start/day_end come from Profile so the user can drag their sleep block."""
    day_walls = sorted([w for w in walls if w.day == day], key=lambda w: w.start_min)
    free: list[Interval] = []
    cursor = day_start
    for w in day_walls:
        if w.start_min > cursor:
            free.append((cursor, min(w.start_min, day_end)))
        cursor = max(cursor, w.end_min)
    if cursor < day_end:
        free.append((cursor, day_end))

    free = [(s, e) for s, e in free if e > s]
    capped: list[Interval] = []
    remaining = cap_minutes
    for s, e in free:
        if remaining <= 0:
            break
        length = min(e - s, remaining)
        capped.append((s, s + length))
        remaining -= length
    return capped


def _free_minutes_per_day(profile: Profile) -> int:
    """Physical ceiling of available minutes in a day after fixed blocks.
    Uses profile.day_start/end_min so all-nighter mode expands this correctly."""
    total_day = profile.day_end_min - profile.day_start_min  # e.g. 1380-480 = 900min
    fixed_per_day: dict[int, int] = {}
    for tb in profile.time_blocks:
        fixed_per_day[tb.day] = fixed_per_day.get(tb.day, 0) + (tb.end_min - tb.start_min)
    avg_fixed = sum(fixed_per_day.values()) / len(fixed_per_day) if fixed_per_day else 0
    return max(int(total_day - avg_fixed), 0)


def _take(day_free: dict[int, list[Interval]], d: int, i: int, start: int, length: int) -> None:
    """Remove [start, start+length) from interval i of day d, keeping any
    free time left before and after it."""
    s, e = day_free[d][i]
    remainder: list[Interval] = []
    if start > s:
        remainder.append((s, start))
    if start + length < e:
        remainder.append((start + length, e))
    day_free[d][i:i + 1] = remainder


# ---------------------------------------------------------------------------
# Topo sort — prereqs before dependents
# ---------------------------------------------------------------------------

def _topo_order(tasks: list[Task]) -> list[Task]:
    """Tasks sorted so prereqs come first. Cycles broken defensively."""
    by_id = {t.id: t for t in tasks}
    visited: set[str] = set()
    order: list[Task] = []
    temp: set[str] = set()

    def visit(t: Task) -> None:
        if t.id in visited:
            return
        if t.id in temp:
            return  # cycle — skip rather than recurse infinitely
        temp.add(t.id)
        for pid in t.prereq_ids:
            if pid in by_id:
                visit(by_id[pid])
        temp.discard(t.id)
        visited.add(t.id)
        order.append(t)

    for t in tasks:
        visit(t)
    return order


# ---------------------------------------------------------------------------
# Slot gating — returns False if this slot is wrong for this task
# ---------------------------------------------------------------------------

def _cat(task: Task) -> str:
    return task.category.value if hasattr(task.category, "value") else str(task.category)


def _slot_ok(task: Task, start_min: int, profile: Profile) -> bool:
    """Returns False if this start time violates a timing constraint for this task."""
    peak_start = profile.peak_window[0] * 60
    peak_end   = profile.peak_window[1] * 60
    LUNCH      = 12 * 60
    slump_end  = LUNCH + profile.post_meal_slump_min

    # HIGH and DEEP effort: must start inside peak window
    if task.effort_tier in (EffortTier.HIGH, EffortTier.DEEP):
        if not (peak_start <= start_min < peak_end):
            return False
        # also exclude post-meal slump even if it overlaps peak window
        if LUNCH <= start_min < slump_end:
            return False

    # physical tasks: don't burn peak window on gym — prefer morning or evening
    if task.category == Category.PHYSICAL:
        if peak_start <= start_min < peak_end:
            return False

    return True


def _find_start(task: Task, s: int, e: int, minutes: int, profile: Profile,
                floor: int = 0) -> int | None:
    """Best start time inside free interval [s, e) for a block of `minutes`.

    Scans a 15-min grid (plus the interval's own start) rather than only
    testing s, so a gap that opens at 08:00 still yields a 09:00 peak-window
    start. Returns the start closest to task.prefer_start_min when set,
    otherwise the earliest valid one."""
    lo = max(s, floor)
    hi = e - minutes
    if hi < lo:
        return None
    candidates = [lo] + list(range(((lo // START_GRID) + 1) * START_GRID, hi + 1, START_GRID))
    valid = [t for t in candidates if t <= hi and _slot_ok(task, t, profile)]
    if not valid:
        return None
    if task.prefer_start_min is not None:
        return min(valid, key=lambda t: (abs(t - task.prefer_start_min), t))
    return valid[0]


def _required_minutes(task: Task, profile: Profile, downscope: bool) -> int:
    """Task duration stretched by velocity buffer + ramp-up time.
    This is the actual slot size needed, not just the planned duration."""
    cat = _cat(task)
    base     = (task.lite_minutes or task.full_minutes) if downscope else task.full_minutes
    velocity = profile.avg_velocity.get(cat, 1.0)
    ramp_up  = profile.ramp_up_min.get(cat, 0)
    return int(base * velocity) + ramp_up


# ---------------------------------------------------------------------------
# Deadlines
# ---------------------------------------------------------------------------

def _iso_day_index(iso: str | None, week_start: date | None) -> int | None:
    """Index (0 = week_start) of an ISO date/datetime string, or None if unparseable."""
    if not iso or week_start is None:
        return None
    try:
        return (date.fromisoformat(iso[:10]) - week_start).days
    except ValueError:
        return None


def _last_allowed_day(task: Task, last_day: int, week_start: date | None) -> int:
    """A hard deadline caps placement: the task must be finished by that day."""
    if task.hard_deadline:
        idx = _iso_day_index(task.deadline_iso, week_start)
        if idx is not None:
            return min(last_day, idx)
    return last_day


def _priority_score(task: Task, deadline_day: int) -> float:
    """Priority score for sort order.

    Base = value density (importance / minutes).
    Hard deadline: if set, apply a large urgency multiplier.
    Best-done-by: if set (and no hard deadline), apply a smaller soft-urgency boost.
    Hard deadline always dominates best-done-by.
    """
    base = task.importance / max(task.est_minutes, 1)

    if task.deadline_iso and task.hard_deadline:
        return base * 3.0

    if task.best_done_by_iso:
        return base * 1.5

    if task.deadline_iso and not task.hard_deadline:
        return base * 1.5

    return base


def _has_tight_deadline(task: Task, first_day: int, last_allowed: int, profile: Profile) -> bool:
    """True if there is not enough physically available time to complete this task
    before its deadline, even after displacing everything else.

    Uses a 30% buffer (DEADLINE_BUFFER=1.3) — warns early rather than on the day.
    Example: 10h task, 7h free/day → needs 1.43 days × 1.3 buffer = 1.86 days.

    Also respects profile.day_end_min so all-nighter mode widens the window."""
    # Only hard deadlines trigger overpack mode; soft/best-done-by never override slot limits
    if not task.deadline_iso or not task.hard_deadline:
        return False

    required     = _required_minutes(task, profile, downscope=False)
    free_per_day = _free_minutes_per_day(profile)

    if free_per_day <= 0:
        return True  # no free time at all — always tight

    days_needed    = required / free_per_day
    days_remaining = max(last_allowed - first_day + 1, 0)

    return (days_needed * DEADLINE_BUFFER) >= days_remaining


# ---------------------------------------------------------------------------
# Placement helpers
# ---------------------------------------------------------------------------

def _day_order(task: Task, first_day: int, last_allowed: int) -> list[int]:
    """Days to try, in order. Nearest to prefer_day first when set, else earliest first."""
    days = list(range(first_day, last_allowed + 1))
    if task.prefer_day is not None:
        days.sort(key=lambda d: (abs(d - task.prefer_day), d))
    return days


def _prereq_floor(task: Task, d: int, placed_end: dict[str, tuple[int, int]]) -> int | None:
    """Earliest start allowed on day d given where prerequisites finish.
    None = day d is before a prerequisite finishes (not allowed)."""
    floor = 0
    for pid in task.prereq_ids:
        if pid not in placed_end:
            continue
        pd, pe = placed_end[pid]
        if d < pd:
            return None
        if d == pd:
            floor = max(floor, pe)
    return floor


def _try_split(task: Task, profile: Profile, day_free: dict[int, list[Interval]],
               first_day: int, last_allowed: int, downscope: bool,
               placed_end: dict[str, tuple[int, int]]) -> list[Block]:
    """Split a task across multiple sessions. Works on a copy of day_free and only
    commits if the whole task fits — a failed split must not eat free time.

    Never creates a session shorter than MIN_SESSION[category]."""
    min_session = MIN_SESSION.get(_cat(task), 30)
    remaining = _required_minutes(task, profile, downscope)
    scratch = {d: list(iv) for d, iv in day_free.items()}
    blocks: list[Block] = []

    for d in sorted(_day_order(task, first_day, last_allowed)):  # sessions in chronological order
        if remaining <= 0:
            break
        floor = _prereq_floor(task, d, placed_end)
        if floor is None:
            continue
        for i, (s, e) in enumerate(scratch[d]):
            lo = max(s, floor)
            if e - lo < min_session or not _slot_ok(task, lo, profile):
                continue
            length = min(e - lo, remaining)
            if length < min_session:
                continue
            blocks.append(Block(day=d, start_min=lo, end_min=lo + length,
                                task_id=task.id, lite=downscope, is_split=True))
            _take(scratch, d, i, lo, length)
            remaining -= length
            break

    if remaining > 0:
        return []
    for d, iv in scratch.items():
        day_free[d] = iv
    return blocks


# ---------------------------------------------------------------------------
# Main schedule function
# ---------------------------------------------------------------------------

def schedule(tasks: list[Task], profile: Profile, deadline_day: int,
             downscope: bool = False, *,
             start_day: int = 0,
             now_min: int | None = None,
             week_start: date | None = None,
             allow_split: bool = True,
             allow_overpack: bool = True,
             apply_cap: bool = True,
             anchored_end: dict[str, tuple[int, int]] | None = None) -> Plan:
    """Place tasks into the week.

    deadline_day  last day index (inclusive) tasks may be placed on.
    start_day     first day index available (days before it are in the past).
    now_min       if set, time before this on start_day is unavailable.
    week_start    date of day index 0; enables real ISO hard-deadline enforcement.
    allow_split / allow_overpack   disable for callers (the calendar) that need
                  every task to stay one whole block.
    apply_cap     cap each day's load at free_hours_per_day × planning_bias.
                  The calendar disables this: events already on it ARE the load.
    anchored_end  {task_id: (day, end_min)} for prerequisites that already sit at a
                  fixed place (calendar events that aren't being moved). Dependents
                  are placed after them.
    """
    grinder_ids = [t.id for t in tasks if t.status == Status.MEATBALL_GRINDER]
    done_ids    = {t.id for t in tasks if t.status == Status.DONE}
    tasks       = [t for t in tasks if t.status not in (Status.MEATBALL_GRINDER, Status.DONE)]

    cap = (int(profile.free_hours_per_day * profile.planning_bias * 60) if apply_cap
           else profile.day_end_min - profile.day_start_min)
    ordered = _topo_order(tasks)
    ordered.sort(key=lambda t: _priority_score(t, deadline_day), reverse=True)

    placed_end: dict[str, tuple[int, int]] = dict(anchored_end or {})
    satisfied: set[str] = set(done_ids) | set(placed_end)
    placed: set[str] = set()
    blocks: list[Block] = []
    live_ids = {t.id for t in tasks}

    last_day = min(deadline_day, DAYS_IN_WEEK - 1)
    first_day = max(start_day, 0)
    day_free: dict[int, list[Interval]] = {}
    for d in range(first_day, last_day + 1):
        floor_min = max(profile.day_start_min, now_min) if (d == first_day and now_min is not None) \
            else profile.day_start_min
        day_free[d] = _free_intervals(d, profile.time_blocks, cap, floor_min, profile.day_end_min)

    def prereqs_met(t: Task) -> bool:
        return all(p in satisfied for p in t.prereq_ids if p in live_ids or p in done_ids)

    def commit(t: Task, new_blocks: list[Block]) -> None:
        blocks.extend(new_blocks)
        placed.add(t.id)
        satisfied.add(t.id)
        placed_end[t.id] = max((b.day, b.end_min) for b in new_blocks)

    progress = True
    while progress:
        progress = False
        for t in ordered:
            if t.id in placed or not prereqs_met(t):
                continue

            minutes      = _required_minutes(t, profile, downscope)
            last_allowed = _last_allowed_day(t, last_day, week_start)

            # --- pass 1: find a clean slot ---
            for d in _day_order(t, first_day, last_allowed):
                floor = _prereq_floor(t, d, placed_end)
                if floor is None:
                    continue
                options = []
                for i, (s, e) in enumerate(day_free[d]):
                    start = _find_start(t, s, e, minutes, profile, floor)
                    if start is not None:
                        options.append((i, start))
                if not options:
                    continue
                if t.prefer_start_min is not None:
                    i, start = min(options, key=lambda o: (abs(o[1] - t.prefer_start_min), o[1]))
                else:
                    i, start = min(options, key=lambda o: o[1])
                _take(day_free, d, i, start, minutes)
                commit(t, [Block(day=d, start_min=start, end_min=start + minutes,
                                 task_id=t.id, lite=downscope)])
                progress = True
                break
            if t.id in placed:
                continue

            # --- pass 2: split across sessions ---
            if allow_split:
                split = _try_split(t, profile, day_free, first_day, last_allowed, downscope, placed_end)
                if split:
                    commit(t, split)
                    progress = True
                    continue

            # --- pass 3: overpack — only if tight deadline, no better fit ---
            if allow_overpack and _has_tight_deadline(t, first_day, last_allowed, profile):
                min_session = MIN_SESSION.get(_cat(t), 30)
                for d in _day_order(t, first_day, last_allowed):
                    floor = _prereq_floor(t, d, placed_end)
                    if floor is None:
                        continue
                    for i, (s, e) in enumerate(day_free[d]):
                        lo = max(s, floor)
                        slot_size = e - lo
                        if (slot_size >= minutes * OVERPACK_THRESHOLD and slot_size >= min_session
                                and _slot_ok(t, lo, profile)):
                            _take(day_free, d, i, lo, slot_size)
                            commit(t, [Block(day=d, start_min=lo, end_min=lo + slot_size,
                                             task_id=t.id, lite=downscope, overpacked=True)])
                            progress = True
                            break
                    if t.id in placed:
                        break

            # TODO: displacement pass for non_negotiable tasks — V2
            # when task.non_negotiable and still unplaced: find lowest-ranked placed
            # block, displace it, place this task, re-queue the displaced one

    at_risk = [t.id for t in tasks if t.id not in placed]
    return Plan(blocks=blocks, at_risk=at_risk, meatball_grinder=grinder_ids,
                feasible=len(at_risk) == 0)
