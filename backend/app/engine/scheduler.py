"""The scheduling engine — THE STAR. Deterministic, no LLM, unit-testable.

Placement logic (in order):
  1. topo-sort tasks by prereqs (drop cycles defensively)
  2. sort by value density (importance / minutes) — higher = placed first
  3. apply velocity buffer: stretch each task's required slot by avg_velocity[category]
     so a 90min deep-work task becomes a 117min slot if velocity=1.3
  4. walk days now→deadline, find first slot that passes _slot_ok():
       - peak window gating for HIGH/DEEP effort tasks
       - post-meal slump exclusion
       - ramp-up time: slot must be large enough to absorb warm-up
       - physical tasks blocked from peak window (don't burn focus time on gym)
  5. if no perfect slot: try splitting the task across multiple sessions
  6. if split also fails and task has a tight deadline: try overpacked slot (shows !)
  7. tasks that still don't fit → at_risk bucket

Keep this pure — no LLM, no I/O, no database calls.
"""
from __future__ import annotations

from app.models import Block, Category, EffortTier, Plan, Profile, Status, Task, TimeBlock as Wall

DAYS_IN_WEEK = 7
OVERPACK_THRESHOLD = 0.80  # slot must be ≥ 80% of required duration to overpack
DEADLINE_BUFFER    = 1.3   # warn when 30% more time than needed remains before deadline
                           # e.g. 10h task → flags when only 13h of free time left

# minimum useful session length per category
# shorter slots than this aren't worth the context-switch cost
MIN_SESSION: dict[str, int] = {
    "deep_work": 45,
    "admin":     10,
    "creative":  30,
    "physical":  20,
    "social":    30,
}


# ---------------------------------------------------------------------------
# Free interval helpers
# ---------------------------------------------------------------------------

def _free_intervals(day: int, walls: list[Wall], cap_minutes: int,
                    day_start: int, day_end: int) -> list[tuple[int, int]]:
    """Free [start, end) intervals on a day, after removing walls, capped to
    the user's daily capacity (free_hours_per_day × planning_bias).
    day_start/day_end come from Profile so the user can drag their sleep block."""
    day_walls = sorted([w for w in walls if w.day == day], key=lambda w: w.start_min)
    free: list[tuple[int, int]] = []
    cursor = day_start
    for w in day_walls:
        if w.start_min > cursor:
            free.append((cursor, min(w.start_min, day_end)))
        cursor = max(cursor, w.end_min)
    if cursor < day_end:
        free.append((cursor, day_end))

    capped: list[tuple[int, int]] = []
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
    # average fixed time across days that have time_blocks defined
    fixed_per_day: dict[int, int] = {}
    for tb in profile.time_blocks:
        fixed_per_day[tb.day] = fixed_per_day.get(tb.day, 0) + (tb.end_min - tb.start_min)
    avg_fixed = sum(fixed_per_day.values()) / len(fixed_per_day) if fixed_per_day else 0
    return max(int(total_day - avg_fixed), 0)


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

def _slot_ok(task: Task, start_min: int, profile: Profile) -> bool:
    """Returns False if this start time violates a timing constraint for this task."""
    cat = task.category.value if hasattr(task.category, 'value') else str(task.category)

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


def _required_minutes(task: Task, profile: Profile, downscope: bool) -> int:
    """Task duration stretched by velocity buffer + ramp-up time.
    This is the actual slot size needed, not just the planned duration."""
    cat = task.category.value if hasattr(task.category, 'value') else str(task.category)
    base     = (task.lite_minutes or task.full_minutes) if downscope else task.full_minutes
    velocity = profile.avg_velocity.get(cat, 1.0)
    ramp_up  = profile.ramp_up_min.get(cat, 0)
    return int(base * velocity) + ramp_up


def _has_tight_deadline(task: Task, last_day: int, profile: Profile) -> bool:
    """True if there is not enough physically available time to complete this task
    before its deadline, even after displacing everything else.

    Uses a 30% buffer (DEADLINE_BUFFER=1.3) — warns early rather than on the day.
    Example: 10h task, 7h free/day → needs 1.43 days × 1.3 buffer = 1.86 days.
    Flags when days_remaining ≤ 1.86, so warns ~2 days before deadline.

    Also respects profile.day_end_min so all-nighter mode widens the window:
    extending to 4am adds ~4h, shrinking days_needed and pushing the warning later."""
    if not task.deadline_iso:
        return False

    required      = _required_minutes(task, profile, downscope=False)
    free_per_day  = _free_minutes_per_day(profile)

    if free_per_day <= 0:
        return True  # no free time at all — always tight

    days_needed    = required / free_per_day
    days_remaining = last_day  # TODO: replace with real ISO date diff once Supabase wired

    # tight if days needed (with 30% buffer) ≥ days remaining
    return (days_needed * DEADLINE_BUFFER) >= days_remaining


# ---------------------------------------------------------------------------
# Task splitting
# ---------------------------------------------------------------------------

def _try_split(task: Task, profile: Profile, day_free: dict[int, list[tuple[int, int]]],
               last_day: int, downscope: bool) -> list[Block]:
    """Try to split task across multiple sessions.

    Strategy:
    - If task has checklist items, each item becomes its own session (natural split)
    - Otherwise: fill the largest available slot, schedule remainder in next slot
    - Never create a session shorter than MIN_SESSION[category]

    Returns list of Blocks if split succeeded, empty list if not possible."""
    cat = task.category.value if hasattr(task.category, 'value') else str(task.category)
    min_session = MIN_SESSION.get(cat, 30)
    total_needed = _required_minutes(task, profile, downscope)
    remaining = total_needed
    split_blocks: list[Block] = []

    for d in range(last_day + 1):
        if remaining <= 0:
            break
        for i, (s, e) in enumerate(day_free[d]):
            slot_size = e - s
            if slot_size < min_session:
                continue
            if not _slot_ok(task, s, profile):
                continue

            session_len = min(slot_size, remaining)
            if session_len < min_session:
                continue

            split_blocks.append(Block(
                day=d, start_min=s, end_min=s + session_len,
                task_id=task.id, lite=downscope, is_split=True,
            ))
            day_free[d][i] = (s + session_len, e)
            remaining -= session_len
            break

    if remaining > 0:
        return []  # couldn't fit all sessions — split failed
    return split_blocks


# ---------------------------------------------------------------------------
# Main schedule function
# ---------------------------------------------------------------------------

def schedule(tasks: list[Task], profile: Profile, deadline_day: int,
             downscope: bool = False) -> Plan:
    """Place tasks into the week. deadline_day caps placement (inclusive)."""
    # Meatball Grinder tasks are user-parked — never schedule them, just pass through
    grinder_ids = [t.id for t in tasks if t.status == Status.MEATBALL_GRINDER]
    tasks       = [t for t in tasks if t.status != Status.MEATBALL_GRINDER]

    cap = int(profile.free_hours_per_day * profile.planning_bias * 60)
    ordered = _topo_order(tasks)
    ordered.sort(key=lambda t: t.importance / max(t.est_minutes, 1), reverse=True)
    # important/minutes -> value density: importance per minute (high important short tasks score the highest for max productivity
    # reverse = True -> allows highest density to be ranked first 

    satisfied: set[str] = set()
    placed: set[str] = set()
    blocks: list[Block] = []

    last_day = min(deadline_day, DAYS_IN_WEEK - 1)
    day_free = {
        d: _free_intervals(d, profile.time_blocks, cap,
                           profile.day_start_min, profile.day_end_min)
        for d in range(last_day + 1)
    }

    def prereqs_met(t: Task) -> bool:
        return all(p in satisfied for p in t.prereq_ids if p in {x.id for x in tasks})

    progress = True
    while progress:
        progress = False
        for t in ordered:
            if t.id in placed or not prereqs_met(t):
                continue

            minutes = _required_minutes(t, profile, downscope)

            # --- pass 1: find a perfect slot ---
            for d in range(last_day + 1):
                slot_idx = None
                for i, (s, e) in enumerate(day_free[d]):
                    if e - s >= minutes and _slot_ok(t, s, profile):
                        slot_idx = i
                        break
                if slot_idx is not None:
                    s, e = day_free[d][slot_idx]
                    blocks.append(Block(day=d, start_min=s, end_min=s + minutes,
                                        task_id=t.id, lite=downscope))
                    day_free[d][slot_idx] = (s + minutes, e)
                    placed.add(t.id)
                    satisfied.add(t.id)
                    progress = True
                    break

            if t.id in placed:
                continue

            # --- pass 2: try splitting across sessions ---
            split = _try_split(t, profile, day_free, last_day, downscope)
            if split:
                blocks.extend(split)
                placed.add(t.id)
                satisfied.add(t.id)
                progress = True
                continue

            # --- pass 3: overpack — only if tight deadline, no better fit ---
            if _has_tight_deadline(t, last_day, profile):
                cat = t.category.value if hasattr(t.category, 'value') else str(t.category)
                min_session = MIN_SESSION.get(cat, 30)
                for d in range(last_day + 1):
                    for i, (s, e) in enumerate(day_free[d]):
                        slot_size = e - s
                        # accept slot if ≥ 80% of needed AND above minimum session length
                        if slot_size >= minutes * OVERPACK_THRESHOLD and slot_size >= min_session:
                            blocks.append(Block(
                                day=d, start_min=s, end_min=s + slot_size,
                                task_id=t.id, lite=downscope, overpacked=True,
                            ))
                            day_free[d][i] = (s + slot_size, e)
                            placed.add(t.id)
                            satisfied.add(t.id)
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
