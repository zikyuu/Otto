"""The scheduling engine — THE STAR. Deterministic, no LLM, unit-testable.

Placement logic (in order):
  1. drop DONE tasks (already satisfied) and park MEATBALL_GRINDER tasks
  2. topo-sort tasks by prereqs (drop cycles defensively)
  3. sort by priority (spec formula: urgency, fixed, dependency blocker, importance)
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
  9. a non-negotiable task that still has no slot displaces the lowest-priority placed
     task that frees a usable slot; the displaced task is re-queued (and listed in plan.displaced)

Other rules layered on top of that:
  - priority = the spec formula: 0.4 urgency + 0.3 fixed + 0.2 dependency blocker + 0.1 importance
  - max_deep_run_min of deep work in a row, then an auto-inserted break_min break (plan.breaks)
  - gym-first: with profile.gym_first, a morning physical task goes before the day's deep work
  - recovery_after_meeting: buffer kept free after social events
  - batching_preference: batch / spread small admin tasks

Keep this pure — no LLM, no I/O, no database calls.
"""
from __future__ import annotations

import dataclasses
import math
from datetime import date, timedelta
from typing import Callable

from app.models import Block, Category, EffortTier, Plan, Profile, Status, Task, TimeBlock

DAYS_IN_WEEK = 7
MAX_DAYS = 14        # the calendar can show two weeks; day indexes run 0..13
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
                    day_start: int, day_end: int, recovery: int = 0) -> list[Interval]:
    """Free [start, end) intervals on a day, after removing walls, capped to
    the user's daily capacity (free_hours_per_day × planning_bias).
    day_start/day_end come from Profile so the user can drag their sleep block.
    recovery: minutes kept free after a social block (meeting hangover)."""
    day_walls = sorted([w for w in walls if w.day == day], key=lambda w: w.start_min)
    free: list[Interval] = []
    cursor = day_start
    for w in day_walls:
        if w.start_min > cursor:
            free.append((cursor, min(w.start_min, day_end)))
        cursor = max(cursor, w.end_min + (recovery if w.kind == "social" else 0))
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


def _reserve(day_free: dict[int, list[Interval]], d: int, start: int, length: int) -> None:
    """Keep [start, start+length) empty (a break / recovery gap). Only the part that is still free is
    removed; if `start` is not free there is nothing to reserve."""
    if length <= 0:
        return
    for i, (s, e) in enumerate(day_free[d]):
        if s <= start < e:
            _take(day_free, d, i, start, min(length, e - start))
            return


def _merge(intervals: list[Interval]) -> list[Interval]:
    out: list[Interval] = []
    for s, e in sorted(intervals):
        if out and s <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out


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
                floor: int = 0, extra: Callable[[int], bool] | None = None,
                target: int | None = None, ceiling: int | None = None) -> int | None:
    """Best start time inside free interval [s, e) for a block of `minutes`.

    Scans a 15-min grid (plus the interval's own start) rather than only
    testing s, so a gap that opens at 08:00 still yields a 09:00 peak-window
    start. Returns the start closest to task.prefer_start_min when set,
    otherwise the earliest valid one. `target` overrides prefer_start_min (batching pulls
    small tasks towards each other); `extra` is a further per-start veto (deep-work run limit)."""
    lo = max(s, floor)
    hi = e - minutes
    if ceiling is not None:      # must be finished by `ceiling`
        hi = min(hi, ceiling - minutes)
    if hi < lo:
        return None
    candidates = [lo] + list(range(((lo // START_GRID) + 1) * START_GRID, hi + 1, START_GRID))
    valid = [t for t in candidates if t <= hi and _slot_ok(task, t, profile)
             and (extra is None or extra(t))]
    if not valid:
        return None
    pref = target if target is not None else task.prefer_start_min
    if pref is not None:
        return min(valid, key=lambda t: (abs(t - pref), t))
    return valid[0]


def _base_minutes(task: Task, downscope: bool) -> int:
    return (task.lite_minutes or task.full_minutes) if downscope else task.full_minutes


def _is_deep(task: Task) -> bool:
    return _cat(task) == Category.DEEP_WORK.value


def _internal_breaks(task: Task, profile: Profile, downscope: bool) -> int:
    """Breaks that must sit inside one deep-work block: planned focus beyond max_deep_run_min
    gets a break every max_deep_run_min."""
    if not _is_deep(task) or profile.break_min <= 0 or profile.max_deep_run_min <= 0:
        return 0
    return max(math.ceil(_base_minutes(task, downscope) / profile.max_deep_run_min) - 1, 0)


def _required_minutes(task: Task, profile: Profile, downscope: bool) -> int:
    """Task duration stretched by velocity buffer + ramp-up time (+ breaks inside long deep work).
    This is the actual slot size needed, not just the planned duration."""
    cat = _cat(task)
    base     = _base_minutes(task, downscope)
    velocity = profile.avg_velocity.get(cat, 1.0)
    ramp_up  = profile.ramp_up_min.get(cat, 0)
    return int(base * velocity) + ramp_up + _internal_breaks(task, profile, downscope) * profile.break_min


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
    if task.end_by is not None:
        last_day = min(last_day, task.end_by // 1440)
    if task.hard_deadline:
        idx = _iso_day_index(task.deadline_iso, week_start)
        if idx is not None:
            return min(last_day, idx)
    return last_day


# Priority formula (from the spec). Each term is 0..1:
#   score = 0.4 × deadline urgency + 0.3 × fixed + 0.2 × dependency blocker + 0.1 × importance
#   urgency     1 / (1 + days of slack to the deadline) — due today = 1, a week out ~0.13, none = 0.
#               A soft deadline / best-done-by counts SOFT_URGENCY_SCALE as much as a hard one.
#   fixed       1 if the task is immovable
#   blocker     how many tasks wait on this one (directly or not), capped at BLOCKER_CAP, as a fraction of it
#   importance  task importance relative to the most important task in this run
# Ties go to the user's rank (PriorityWindow / user_rank, 1 = first), then value density (importance / minutes).
W_URGENCY, W_FIXED, W_BLOCKER, W_IMPORTANCE = 0.4, 0.3, 0.2, 0.1
W_USER = 0.3            # the user's own importance cards: adds up to +0.15 for the most important, takes up to 0.15 off the least; nothing when unsorted
SOFT_URGENCY_SCALE = 0.5
BLOCKER_CAP = 3


def _urgency(task: Task, first_day: int, week_start: date | None) -> float:
    if task.deadline_iso and task.hard_deadline:
        scale, iso = 1.0, task.deadline_iso
    elif task.best_done_by_iso or task.deadline_iso:
        scale, iso = SOFT_URGENCY_SCALE, task.best_done_by_iso or task.deadline_iso
    else:
        return 0.0
    idx = _iso_day_index(iso, week_start)
    slack = 0 if idx is None else max(idx - first_day, 0)   # no usable date: treat as due now
    return scale / (1 + slack)


def _blocker_counts(tasks: list[Task]) -> dict[str, int]:
    """task id -> number of tasks that (transitively) depend on it."""
    by_id = {t.id: t for t in tasks}
    dependents: dict[str, set[str]] = {t.id: set() for t in tasks}
    for t in tasks:
        for p in t.prereq_ids:
            if p in by_id:
                dependents[p].add(t.id)

    def reach(i: str, seen: set[str]) -> set[str]:
        for d in dependents[i]:
            if d not in seen:
                seen.add(d)
                reach(d, seen)
        return seen

    return {i: len(reach(i, set())) for i in dependents}


def _priority_score(task: Task, deadline_day: int, first_day: int = 0,
                    week_start: date | None = None, *, blockers: int = 0,
                    max_importance: float = 1.0) -> float:
    """The spec's priority score, 0..1. Higher = placed earlier. See the constants above."""
    importance = min(task.importance / max_importance, 1.0) if max_importance > 0 else 0.0
    return (W_URGENCY * _urgency(task, first_day, week_start)
            + W_FIXED * (1.0 if task.fixed else 0.0)
            + W_BLOCKER * min(blockers, BLOCKER_CAP) / BLOCKER_CAP
            + W_IMPORTANCE * importance
            + (W_USER * (task.user_priority - 0.5) if task.user_priority is not None else 0.0))


def _priority_key(task: Task, deadline_day: int, first_day: int, week_start: date | None,
                  blockers: dict[str, int], max_importance: float) -> tuple[float, float, float]:
    rank = 1.0 / task.user_rank if task.user_rank and task.user_rank > 0 else 0.0
    return (_priority_score(task, deadline_day, first_day, week_start,
                            blockers=blockers.get(task.id, 0), max_importance=max_importance),
            rank, task.importance / max(task.est_minutes, 1))


def apply_priority_windows(tasks: list[Task], profile: Profile, today: date | None) -> list[Task]:
    """Copy of `tasks` with user_rank / non_negotiable filled in from the user's PriorityWindows.

    Windows that contain `today` apply (all of them when today is unknown); the narrowest window wins
    when a task is ranked in several. A rank the task already carries is kept."""
    if not profile.priority_windows:
        return tasks

    def span(w) -> int:
        try:
            return (date.fromisoformat(w.end_iso[:10]) - date.fromisoformat(w.start_iso[:10])).days
        except ValueError:
            return 10 ** 6

    def active(w) -> bool:
        if today is None:
            return True
        try:
            return date.fromisoformat(w.start_iso[:10]) <= today <= date.fromisoformat(w.end_iso[:10])
        except ValueError:
            return True

    windows = sorted((w for w in profile.priority_windows if active(w)), key=span)
    out: list[Task] = []
    for t in tasks:
        rank, nn = t.user_rank, t.non_negotiable
        for w in windows:
            if rank is None and t.id in w.ranked_task_ids:
                rank = w.ranked_task_ids.index(t.id) + 1
            if t.id in w.non_negotiable_ids:
                nn = True
        out.append(t if (rank, nn) == (t.user_rank, t.non_negotiable)
                   else dataclasses.replace(t, user_rank=rank, non_negotiable=nn))
    return out


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
# Focus-aware splitting — the scheduler, not the user, decides when a long task is split
# ---------------------------------------------------------------------------

FOCUS_CATEGORIES   = {"deep_work", "creative"}
MIN_FOCUS_EVIDENCE = 3      # observations needed before the learned span is trusted
SPLIT_TOLERANCE    = 1.15   # a task up to 15% over the span still goes in one piece


def _tier_for(minutes: int) -> EffortTier:
    if minutes < 30:
        return EffortTier.LOW
    if minutes < 90:
        return EffortTier.MED
    if minutes < 180:
        return EffortTier.HIGH
    return EffortTier.DEEP


def plan_sessions(task: Task, profile: Profile, downscope: bool = False) -> list[int] | None:
    """Session lengths (planned minutes) if this task is longer than the user can sustain, else None.

    Two things must hold before a task is split:
      - it is demanding work (deep work / creative) — admin or gym has no "focus span";
      - the profile has real evidence about the user's span. With none, the user's own block is
        respected as-is: a cold-start default is not a reason to override what they asked for.
    A user whose history shows long stretches going well has a long span, so a 7h block on a free
    day stays 7h; a user whose focus fades after ~2h gets it cut into ~2h sessions."""
    # A task flagged must_split (it is longer than the day can hold) is cut up regardless of category or evidence:
    # the alternative is a block that runs off the end of the day.
    if not task.must_split and (_cat(task) not in FOCUS_CATEGORIES or profile.focus_evidence < MIN_FOCUS_EVIDENCE):
        return None
    base = (task.lite_minutes or task.full_minutes) if downscope else task.full_minutes
    real = base * profile.avg_velocity.get(_cat(task), 1.0)      # time it will actually take
    span = profile.focus_span_min
    if real <= span * SPLIT_TOLERANCE:
        return None
    n = math.ceil(real / span)
    return [base // n + (1 if i < base % n else 0) for i in range(n)]


def _focus_split(tasks: list[Task], profile: Profile, downscope: bool,
                 eligible: set[str] | None) -> tuple[list[Task], dict[str, list[str]]]:
    """Replace each over-long task by a chain of sessions (each depends on the one before).
    Anything that depended on the task now waits for its last session."""
    out: list[Task] = []
    splits: dict[str, list[str]] = {}
    last_of: dict[str, str] = {}
    for t in tasks:
        lens = plan_sessions(t, profile, downscope) if (eligible is None or t.id in eligible) else None
        if not lens:
            out.append(t)
            continue
        base = (t.lite_minutes or t.full_minutes) if downscope else t.full_minutes
        ids = [f"{t.id}#{i + 1}" for i in range(len(lens))]
        for i, m in enumerate(lens):
            out.append(dataclasses.replace(
                t, id=ids[i], title=f"{t.title} ({i + 1}/{len(lens)})", duration_planned=m,
                lite_minutes=max(1, round(t.lite_minutes * m / base)) if t.lite_minutes else None,
                # a spread-out marathon fills whatever time is free, so its sessions are not held to the peak window
                effort_tier=EffortTier.MED if t.must_split else _tier_for(m), checklist=[], split_of=t.id,
                prereq_ids=list(t.prereq_ids) if i == 0 else [ids[i - 1]],
                prefer_day=None if t.prefer_day is None else t.prefer_day + i,
            ))
        splits[t.id] = ids
        last_of[t.id] = ids[-1]
    if last_of:
        out = [dataclasses.replace(x, prereq_ids=[last_of.get(p, p) for p in x.prereq_ids])
               if any(p in last_of for p in x.prereq_ids) else x for x in out]
    return out, splits


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
               placed_end: dict[str, tuple[int, int]],
               day_floor: Callable[[Task, int], int] | None = None) -> list[Block]:
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
        if day_floor:
            floor = max(floor, day_floor(task, d))
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


def _deep_gap_ok(deep: list[tuple[int, int, int]], s: int, e: int, work: int, profile: Profile) -> bool:
    """May a deep-work block [s, e) with `work` planned minutes sit here, given the day's other deep
    blocks `deep` as (start, end, work)? Blocks closer than break_min chain into one run; a run is only
    allowed if it totals max_deep_run_min or less and no block in it needs breaks of its own."""
    gap = profile.break_min
    if gap <= 0 or not deep:
        return True
    cand = (s, e, work)
    items = sorted(deep + [cand])
    i = items.index(cand)
    lo = hi = i
    while lo > 0 and items[lo][0] - items[lo - 1][1] < gap:
        lo -= 1
    while hi < len(items) - 1 and items[hi + 1][0] - items[hi][1] < gap:
        hi += 1
    if lo == hi:
        return True
    run = items[lo:hi + 1]
    return sum(w for _, _, w in run) <= profile.max_deep_run_min and all(w <= profile.max_deep_run_min for _, _, w in run)


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
             allow_displace: bool = True,
             allow_tight: bool = False,
             apply_cap: bool = True,
             anchored_end: dict[str, tuple[int, int]] | None = None,
             focus_split_ids: set[str] | None = None) -> Plan:
    """Place tasks into the week.

    deadline_day  last day index (inclusive) tasks may be placed on.
    start_day     first day index available (days before it are in the past).
    now_min       if set, time before this on start_day is unavailable.
    week_start    date of day index 0; enables real ISO hard-deadline enforcement.
    allow_split / allow_overpack   disable for callers (the calendar) that need
                  every task to stay one whole block.
    allow_displace  let a non-negotiable task with no slot bump a lower-priority one.
    allow_tight   when a task finds no slot with its pace buffer and ramp-up included, try again with just the length it was
                  planned at (the block the person sees), and mark it tight. A 60-minute block fits a 75-minute gap.
    apply_cap     cap each day's load at free_hours_per_day × planning_bias.
                  The calendar disables this: events already on it ARE the load.
    anchored_end  {task_id: (day, end_min)} for prerequisites that already sit at a
                  fixed place (calendar events that aren't being moved). Dependents
                  are placed after them.
    focus_split_ids  which tasks the scheduler may split by the user's learned focus span
                  (None = any task; the calendar passes only newly created events).
    """
    grinder_ids = [t.id for t in tasks if t.status == Status.MEATBALL_GRINDER]
    done_ids    = {t.id for t in tasks if t.status == Status.DONE}
    tasks       = [t for t in tasks if t.status not in (Status.MEATBALL_GRINDER, Status.DONE)]

    first_day = max(start_day, 0)
    today = None if week_start is None else week_start + timedelta(days=first_day)
    tasks = apply_priority_windows(tasks, profile, today)
    tasks, splits = _focus_split(tasks, profile, downscope, focus_split_ids)
    by_id = {t.id: t for t in tasks}

    cap = (int(profile.free_hours_per_day * profile.planning_bias * 60) if apply_cap
           else profile.day_end_min - profile.day_start_min)
    ordered = _topo_order(tasks)
    blockers = _blocker_counts(tasks)
    max_imp = max((t.importance for t in tasks), default=1.0)
    prio = lambda t: _priority_key(t, deadline_day, first_day, week_start, blockers, max_imp)
    ordered.sort(key=prio, reverse=True)
    if profile.gym_first:   # stable: the gym is placed before everything else, so deep work can wait for it
        ordered.sort(key=lambda t: 0 if t.category == Category.PHYSICAL else 1)

    placed_end: dict[str, tuple[int, int]] = dict(anchored_end or {})
    satisfied: set[str] = set(done_ids) | set(placed_end)
    placed: set[str] = set()
    blocks: list[Block] = []
    displaced: list[str] = []
    live_ids = {t.id for t in tasks}
    used_days: dict[str, set[int]] = {}   # sessions of one task prefer different days

    last_day = min(deadline_day, MAX_DAYS - 1)
    day_free: dict[int, list[Interval]] = {}
    for d in range(first_day, last_day + 1):
        floor_min = max(profile.day_start_min, now_min) if (d == first_day and now_min is not None) \
            else profile.day_start_min
        day_free[d] = _free_intervals(d, profile.time_blocks, cap, floor_min, profile.day_end_min,
                                      profile.recovery_after_meeting)

    peak_start = profile.peak_window[0] * 60

    # ---- views derived from what is placed so far (recomputed, so displacement can't leave them stale)
    def deep_on(d: int) -> list[tuple[int, int, int]]:
        out = [(b.start_min, b.end_min, b.end_min - b.start_min) for b in profile.time_blocks
               if b.day == d and b.kind == Category.DEEP_WORK.value]
        out += [(b.start_min, b.end_min, _base_minutes(by_id[b.task_id], b.lite))
                for b in blocks if b.day == d and _is_deep(by_id[b.task_id])]
        return out

    def batchable(t: Task) -> bool:
        return _cat(t) == Category.ADMIN.value and _base_minutes(t, downscope) <= 45

    def batch_on(d: int) -> list[Interval]:
        return [(b.start_min, b.end_min) for b in blocks if b.day == d and batchable(by_id[b.task_id])]

    def gym_end(d: int) -> int:
        """End of a morning physical block on day d (0 = none): deep work waits for it."""
        if not profile.gym_first:
            return 0
        return max((b.end_min for b in blocks if b.day == d and by_id[b.task_id].category == Category.PHYSICAL
                    and b.start_min < peak_start), default=0)

    def day_floor(t: Task, d: int) -> int:
        if profile.gym_first and t.category != Category.PHYSICAL and (_is_deep(t) or t.effort_tier in (EffortTier.HIGH, EffortTier.DEEP)):
            return gym_end(d)
        return 0

    def prereqs_met(t: Task) -> bool:
        return all(p in satisfied for p in t.prereq_ids if p in live_ids or p in done_ids)

    def days_for(t: Task, last_allowed: int) -> list[int]:
        days = _day_order(t, first_day, last_allowed)
        if t.split_of:
            used = used_days.get(t.split_of, set())
            days = [d for d in days if d not in used] + [d for d in days if d in used]
        if profile.batching_preference != "none" and batchable(t) and t.prefer_day is None:
            if profile.batching_preference == "batch":
                days.sort(key=lambda d: (0 if batch_on(d) else 1, d))
            else:
                days.sort(key=lambda d: (len(batch_on(d)), d))
        return days

    def start_in(t: Task, d: int, s: int, e: int, minutes: int, floor: int) -> int | None:
        vetoes: list[Callable[[int], bool]] = []
        if _is_deep(t):
            work = _base_minutes(t, downscope)
            deep = deep_on(d)
            vetoes.append(lambda st: _deep_gap_ok(deep, st, st + minutes, work, profile))
        out = [(a, b) for dd, a, b in t.keep_out if dd == d]       # time reserved for something else
        if out:
            vetoes.append(lambda st: all(st + minutes <= a or st >= b for a, b in out))
        extra = (lambda st: all(v(st) for v in vetoes)) if vetoes else None
        target = None
        if profile.batching_preference == "batch" and batchable(t) and t.prefer_day is None:
            near = batch_on(d)
            if near:
                target = max(en for _, en in near)
        # a latest-finish (end_by) only bites on the day it falls on; earlier days are unrestricted
        ceiling = None
        if t.end_by is not None and t.end_by < (d + 1) * 1440:
            ceiling = t.end_by - d * 1440
        return _find_start(t, s, e, minutes, profile, floor, extra, target, ceiling)

    def reserve_after(t: Task, bks: list[Block]) -> None:
        """Keep the gap after a deep block empty (the break) and after a social block (recovery)."""
        gap = profile.break_min if _is_deep(t) else profile.recovery_after_meeting if _cat(t) == Category.SOCIAL.value else 0
        if gap > 0:
            for b in bks:
                _reserve(day_free, b.day, b.end_min, gap)

    def commit(t: Task, new_blocks: list[Block]) -> None:
        if t.split_of:
            used_days.setdefault(t.split_of, set()).update(b.day for b in new_blocks)
        blocks.extend(new_blocks)
        placed.add(t.id)
        satisfied.add(t.id)
        placed_end[t.id] = max((b.day, b.end_min) for b in new_blocks)
        reserve_after(t, new_blocks)

    def place_clean(t: Task, last_allowed: int, minutes: int, tight: bool = False) -> bool:
        for d in days_for(t, last_allowed):
            floor = _prereq_floor(t, d, placed_end)
            if floor is None:
                continue
            floor = max(floor, day_floor(t, d))
            options = []
            for i, (s, e) in enumerate(day_free[d]):
                start = start_in(t, d, s, e, minutes, floor)
                if start is not None:
                    options.append((i, start))
            if not options:
                continue
            pref = t.prefer_start_min
            if pref is None and profile.batching_preference == "batch" and batchable(t) and batch_on(d):
                pref = max(en for _, en in batch_on(d))
            if pref is not None:
                i, start = min(options, key=lambda o: (abs(o[1] - pref), o[1]))
            else:
                i, start = min(options, key=lambda o: o[1])
            _take(day_free, d, i, start, minutes)
            commit(t, [Block(day=d, start_min=start, end_min=start + minutes,
                             task_id=t.id, lite=downscope, overpacked=tight)])
            return True
        return False

    def displace_for(t: Task, last_allowed: int, minutes: int) -> bool:
        """A non-negotiable task with no slot bumps the lowest-priority placed task that frees one.
        Never touches other non-negotiable tasks, fixed tasks, or a task something else is waiting on."""
        waited_on = {p for x in tasks if x.id in placed for p in x.prereq_ids}
        for d in days_for(t, last_allowed):
            floor = _prereq_floor(t, d, placed_end)
            if floor is None:
                continue
            floor = max(floor, day_floor(t, d))
            victims = []
            for b in blocks:
                v = by_id[b.task_id]
                if (b.day == d and not v.non_negotiable and not v.fixed and v.id not in waited_on
                        and v.id != t.id):
                    victims.append(v)
            victims = sorted({v.id: v for v in victims}.values(),
                             key=lambda v: (bool(v.deadline_iso and v.hard_deadline),
                                            prio(v)))
            for v in victims:
                before = list(blocks)
                mine = [b for b in blocks if b.task_id == v.id]
                saved = day_free[d]
                # try the slot with the victim gone (also keeps it out of the deep-work run check)
                blocks[:] = [b for b in blocks if b.task_id != v.id]
                day_free[d] = _merge(saved + [(b.start_min, b.end_min) for b in mine if b.day == d])
                found = None
                for s_, e_ in day_free[d]:
                    found = start_in(t, d, s_, e_, minutes, floor)
                    if found is not None:
                        break
                if found is None:
                    blocks[:] = before
                    day_free[d] = saved
                    continue
                for b in mine:   # a split victim may span other days: give those back too
                    if b.day != d:
                        day_free[b.day] = _merge(day_free[b.day] + [(b.start_min, b.end_min)])
                placed.discard(v.id)
                satisfied.discard(v.id)
                placed_end.pop(v.id, None)
                if v.id not in displaced:
                    displaced.append(v.id)
                for j, (s2, e2) in enumerate(day_free[d]):
                    if s2 <= found and found + minutes <= e2:
                        _take(day_free, d, j, found, minutes)
                        break
                commit(t, [Block(day=d, start_min=found, end_min=found + minutes,
                                 task_id=t.id, lite=downscope)])
                return True
        return False

    progress = True
    while progress:
        progress = False
        for t in ordered:
            if t.id in placed or not prereqs_met(t):
                continue

            minutes      = _required_minutes(t, profile, downscope)
            last_allowed = _last_allowed_day(t, last_day, week_start)

            # --- pass 1: find a clean slot ---
            if place_clean(t, last_allowed, minutes):
                progress = True
                continue

            # --- pass 2: split across sessions ---
            if allow_split:
                split = _try_split(t, profile, day_free, first_day, last_allowed, downscope, placed_end, day_floor)
                if split:
                    commit(t, split)
                    progress = True
                    continue

            # --- pass 2b: no room for the pace buffer, but the block as planned fits: place it tight ---
            if allow_tight and _base_minutes(t, downscope) < minutes and place_clean(t, last_allowed, _base_minutes(t, downscope), tight=True):
                progress = True
                continue

            # --- pass 3: overpack — only if tight deadline, no better fit ---
            if allow_overpack and t.end_by is None and _has_tight_deadline(t, first_day, last_allowed, profile):
                min_session = MIN_SESSION.get(_cat(t), 30)
                for d in days_for(t, last_allowed):
                    floor = _prereq_floor(t, d, placed_end)
                    if floor is None:
                        continue
                    floor = max(floor, day_floor(t, d))
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
                if t.id in placed:
                    continue

            # --- pass 4: a non-negotiable task displaces a lower-priority one ---
            if allow_displace and t.non_negotiable and displace_for(t, last_allowed, minutes):
                progress = True

    at_risk = [t.id for t in tasks if t.id not in placed]
    return Plan(blocks=blocks, at_risk=at_risk, meatball_grinder=grinder_ids,
                feasible=len(at_risk) == 0, splits=splits, displaced=displaced,
                breaks=_breaks(blocks, by_id, profile, downscope))


def _breaks(blocks: list[Block], by_id: dict[str, Task], profile: Profile, downscope: bool) -> list[Block]:
    """The auto-inserted breaks: inside a long deep-work block (every max_deep_run_min of focus), and
    after a deep block that the next deep block follows closely."""
    if profile.break_min <= 0:
        return []
    out: list[Block] = []
    deep = [b for b in blocks if _is_deep(by_id[b.task_id])]
    for b in deep:
        t = by_id[b.task_id]
        n = _internal_breaks(t, profile, b.lite)
        if n and not b.is_split and not b.overpacked and b.end_min - b.start_min == _required_minutes(t, profile, b.lite):
            chunk = ((b.end_min - b.start_min) - n * profile.break_min) / (n + 1)
            for k in range(1, n + 1):
                st = b.start_min + round(k * chunk) + (k - 1) * profile.break_min
                out.append(Block(day=b.day, start_min=st, end_min=st + profile.break_min,
                                 task_id=f"break:{b.task_id}", is_break=True))
    by_day: dict[int, list[Block]] = {}
    for b in deep:
        by_day.setdefault(b.day, []).append(b)
    for d, bs in by_day.items():
        bs.sort(key=lambda b: b.start_min)
        for cur, nxt in zip(bs, bs[1:]):
            gap = nxt.start_min - cur.end_min
            if profile.break_min <= gap < profile.break_min + START_GRID:
                out.append(Block(day=d, start_min=cur.end_min, end_min=cur.end_min + profile.break_min,
                                 task_id=f"break:{cur.task_id}", is_break=True))
    return sorted(out, key=lambda b: (b.day, b.start_min))
