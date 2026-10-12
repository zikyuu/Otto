"""The data model — the spine of the whole system.

This is the CONTRACT every teammate codes against. The engine, the LLM layer,
the adapters, and the frontend all read/write these shapes.

Nothing here imports from engine/, llm/, or sources/ — those depend on THIS,
never the reverse. That one-way dependency is what keeps the pieces swappable.

━━━ CLASS MAP (if anyone is confused HAHAHHA)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  WHO IS THE USER?
    Skill           one skill the user has, with a strength rating (0–3)
    TimeBlock       a dumb blocked slot (recurring meeting, sleep) the scheduler avoids
                    (DIFFERENT from block)
    Profile         full user picture: skills, free time, blocked slots, learnt behaviour

  WHAT DO THEY WANT TO ACHIEVE?
    Goal            a job/target with a deadline and required skills
    Status          label on a Task: todo / done / missed / meatball_grinder
    Category        what type of work a task is (deep_work, admin, physical …)
    EffortTier      how cognitively heavy a task is (derived from duration)
    EventAnchor     the link between a Task and a CalendarEvent ("do before interview")
    LinkRelation    the type of time dependency (before, after, same_day …)
    Task            one schedulable unit of work (study task, errand, deep work block)
                    ← now covers both goal-generated tasks AND manual user tasks

  CALENDAR
    CalendarEvent   a real event with title, time, confirmed/TBC state
                    ← different from TimeBlock: has identity and can anchor linked tasks

  SCHEDULER OUTPUT
    Block           a task placed into a concrete time slot (scheduler output)
    Plan            the full week: all Blocks + what didn't fit + Meatball Grinder basket

  LEARNING SIGNALS (feed the learning engine, never drive the scheduler directly)
    ReflectionChoice  the 5 options in the post-task check-in sheet
    EnergyLog         one tap of the + energy button → feeds peak_window learning
    OffTrackLog       user labels a disruption → excluded from velocity penalty
    TaskReflection    post-task check-in after dragging actual end time
    TaskCompletion    simple done/not-done record for overall completion_rate
                      ← renamed from CompletionEvent
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class Status(str, Enum):
    TODO             = "todo"
    DONE             = "done"
    MISSED           = "missed"
    MEATBALL_GRINDER = "meatball_grinder"  # user explicitly parked this — sits in the Meatball Grinder, never auto-rescheduled


class OversleepTriage(str, Enum):
    RESCHEDULE_TODAY  = "reschedule_today"  # re-slot into remaining free time today
    PUSH_TOMORROW     = "push_tomorrow"     # move to tomorrow's schedule
    MEATBALL_GRINDER  = "meatball_grinder"  # park in the Meatball Grinder, don't auto-reschedule
    DROP              = "drop"              # delete entirely


class Category(str, Enum):
    DEEP_WORK = "deep_work"  # coding, studying, writing — needs peak window
    ADMIN     = "admin"      # emails, scheduling, forms — anytime
    CREATIVE  = "creative"   # design, brainstorming — moderate energy needed
    PHYSICAL  = "physical"   # gym, walk — energy-restoring, not draining
    SOCIAL    = "social"     # meetings, calls — draining, needs recovery after


class EffortTier(str, Enum):
    LOW  = "low"   # < 30 min   — can go anywhere in the day
    MED  = "med"   # 30–90 min  — mild preference for good energy
    HIGH = "high"  # 90–180 min — peak window preferred
    DEEP = "deep"  # 3 hr+      — peak window only, max 1 per day


class LinkRelation(str, Enum):
    BEFORE             = "before"              # must finish before anchor starts
    AFTER              = "after"               # cannot start until anchor ends
    SAME_DAY           = "same_day"            # flexible within anchor's calendar day
    WITHIN_DAYS_BEFORE = "within_days_before"  # before, but no earlier than X days out


class ReflectionChoice(str, Enum):
    OUTLIER     = "outlier"      # just tired today — don't update velocity
    HARDER      = "harder"       # task genuinely harder than estimated
    INTERRUPTED = "interrupted"  # external disruption — don't penalise velocity
    GAP         = "gap"          # fundamental skill gap — flag to goals view
    NAILED      = "nailed"       # finished on time or early — positive signal


# ---------------------------------------------------------------------------
# WHO IS THE USER?
# ---------------------------------------------------------------------------

@dataclass
class Skill:
    """One skill the user has, with a strength rating."""
    id: str
    name: str
    proficiency: int = 0  # 0=none · 1=basic · 2=solid · 3=strong


@dataclass
class TimeBlock:
    """A fixed blocked slot the scheduler must not touch.
    e.g. a recurring standup, lunch, commute.
    Renamed from Wall — same concept, clearer name."""
    day: int        # 0=Mon .. 6=Sun
    start_min: int  # minutes from midnight, e.g. 540 = 09:00
    end_min: int
    label: str = ""
    kind: str = ""  # Category value of what occupies the slot ("social", "deep_work"...), "" = plain block


BATCHING_CHOICES = ("none", "batch", "spread")


@dataclass
class Profile:
    """Full picture of the user: skills, availability, and learnt scheduling behaviour.
    The scheduler reads this on every call — richer profile = smarter schedule."""

    # static setup
    skills: list[Skill] = field(default_factory=list)
    free_hours_per_day: float = 3.0
    time_blocks: list[TimeBlock] = field(default_factory=list)  # renamed from walls

    # overall completion pace
    # what % of planned work the user actually finishes (0..1), cold-start: 0.8
    completion_rate: float = 0.8  # renamed from velocity — more self-explanatory

    priority_windows: list[PriorityWindow] = field(default_factory=list) #user-specified task ranking for a given time window, helps with task displacement when there is a impending deadline but no available slot AT ALL
    # per-category velocity: ratio of actual/planned time
    # >1.0 means user takes longer than planned for that category
    # cold-start defaults are research-backed (people underestimate deep work by ~25-30%)
    avg_velocity: dict[str, float] = field(
        default_factory=lambda: {
            "deep_work": 1.3,
            "admin":     1.0,
            "creative":  1.2,
            "physical":  1.0,
            "social":    1.0,
        }
    )

    # scheduling window — user can drag the sleep block on the calendar to adjust
    # stored as minutes from midnight; supports all-nighters via values > 24*60
    # e.g. sleep at 4am = day_end_min 1680 (28*60), extending the workable window
    day_start_min: int = 8 * 60   # default wake: 08:00 (480)
    day_end_min:   int = 23 * 60  # default sleep: 23:00 (1380)

    # timing preferences — learnt from energy logs + actuals over time
    peak_window: tuple[int, int] = (9, 12)  # hours of day, cold-start default
    post_meal_slump_min: int = 45           # low-energy buffer after 12:00
    planning_bias: float = 0.80            # cap daily scheduled load to 80% of free hours

    # longest stretch of deep focus the user sustains, learnt from long sessions that went well
    # and from labelled focus breaks. The scheduler splits a task longer than this — but only once
    # focus_evidence shows the number is real, not the cold-start default.
    focus_span_min: int = 120
    focus_evidence: int = 0

    # how long it takes to get into the zone per category (cold-start defaults)
    # scheduler adds this to required slot size so short gaps don't get deep work
    ramp_up_min: dict[str, int] = field(
        default_factory=lambda: {
            "deep_work": 15,
            "admin":      0,
            "creative":  10,
            "physical":   5,
            "social":     0,
        }
    )

    # minutes of buffer kept free after a social event (meeting hangover). Learned from energy taps
    # logged with after_meeting_min; recovery_evidence counts those taps.
    recovery_after_meeting: int = 15
    recovery_evidence: int = 0

    # how small admin tasks are laid out: "batch" groups them into one stretch of the day,
    # "spread" keeps them on separate days, "none" leaves placement alone. Set by the user
    # (stated rule / settings) — there is no honest way to infer it from taps.
    batching_preference: str = "none"

    # no more than max_deep_run_min of deep work in a row before an auto-inserted break_min break
    max_deep_run_min: int = 90
    break_min: int = 15

    # gym-first pattern: on a day with a physical task, it goes before the day's deep work.
    # Learned from the order the user actually finishes them (gym_evidence = days observed).
    gym_first: bool = False
    gym_evidence: int = 0

    # completion signals seen so far — planning_bias only starts following completion_rate after a few
    completion_evidence: int = 0

    # learned parameters the user has pinned by stating them directly: learning never overwrites these
    stated_overrides: dict[str, Any] = field(default_factory=dict)

    # tasks the user flagged as a fundamental skill gap (reflection "gap") — surfaced to the goals view
    gap_task_ids: list[str] = field(default_factory=list)

    # learning signal stores — appended to as user interacts, read by learning.py
    energy_logs: list[EnergyLog] = field(default_factory=list)
    reflections: list[TaskReflection] = field(default_factory=list)
    off_track_logs: list[OffTrackLog] = field(default_factory=list)

    # from weekly mascot chat — highest priority, overrides all derived signals
    stated_rules: list[str] = field(default_factory=list)

    def has_skill(self, name: str, min_prof: int = 2) -> bool:
        return any(
            s.name.lower() == name.lower() and s.proficiency >= min_prof
            for s in self.skills
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "skills": [asdict(s) for s in self.skills],
            "free_hours_per_day": self.free_hours_per_day,
            "time_blocks": [asdict(b) for b in self.time_blocks],
            "completion_rate": self.completion_rate,
            "avg_velocity": dict(self.avg_velocity),
            "ramp_up_min": dict(self.ramp_up_min),
            "day_start_min": self.day_start_min,
            "day_end_min": self.day_end_min,
            "peak_window": list(self.peak_window),
            "post_meal_slump_min": self.post_meal_slump_min,
            "planning_bias": self.planning_bias,
            "focus_span_min": self.focus_span_min,
            "focus_evidence": self.focus_evidence,
            "stated_rules": list(self.stated_rules),
            "recovery_after_meeting": self.recovery_after_meeting,
            "recovery_evidence": self.recovery_evidence,
            "batching_preference": self.batching_preference,
            "max_deep_run_min": self.max_deep_run_min,
            "break_min": self.break_min,
            "gym_first": self.gym_first,
            "gym_evidence": self.gym_evidence,
            "completion_evidence": self.completion_evidence,
            "stated_overrides": dict(self.stated_overrides),
            "gap_task_ids": list(self.gap_task_ids),
            "priority_windows": [asdict(w) for w in self.priority_windows],
            "energy_logs": [asdict(e) for e in self.energy_logs],
            "reflections": [{**asdict(r), "choice": r.choice.value} for r in self.reflections],
            "off_track_logs": [asdict(o) for o in self.off_track_logs],
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Profile":
        """Inverse of to_dict. Missing keys fall back to cold-start defaults so a
        partial payload (e.g. just skills) still yields a usable Profile."""
        p = cls()
        p.skills = [Skill(**s) for s in d.get("skills", [])]
        p.free_hours_per_day = d.get("free_hours_per_day", p.free_hours_per_day)
        p.time_blocks = [TimeBlock(**b) for b in d.get("time_blocks", [])]
        p.completion_rate = d.get("completion_rate", p.completion_rate)
        p.avg_velocity = {**p.avg_velocity, **d.get("avg_velocity", {})}
        p.ramp_up_min = {**p.ramp_up_min, **d.get("ramp_up_min", {})}
        p.day_start_min = d.get("day_start_min", p.day_start_min)
        p.day_end_min = d.get("day_end_min", p.day_end_min)
        pw = d.get("peak_window", p.peak_window)
        p.peak_window = (int(pw[0]), int(pw[1]))
        p.post_meal_slump_min = d.get("post_meal_slump_min", p.post_meal_slump_min)
        p.planning_bias = d.get("planning_bias", p.planning_bias)
        p.focus_span_min = d.get("focus_span_min", p.focus_span_min)
        p.focus_evidence = d.get("focus_evidence", p.focus_evidence)
        p.stated_rules = list(d.get("stated_rules", []))
        p.recovery_after_meeting = d.get("recovery_after_meeting", p.recovery_after_meeting)
        p.recovery_evidence = d.get("recovery_evidence", p.recovery_evidence)
        bp = d.get("batching_preference", p.batching_preference)
        p.batching_preference = bp if bp in BATCHING_CHOICES else "none"
        p.max_deep_run_min = d.get("max_deep_run_min", p.max_deep_run_min)
        p.break_min = d.get("break_min", p.break_min)
        p.gym_first = bool(d.get("gym_first", p.gym_first))
        p.gym_evidence = d.get("gym_evidence", p.gym_evidence)
        p.completion_evidence = d.get("completion_evidence", p.completion_evidence)
        p.stated_overrides = dict(d.get("stated_overrides", {}))
        p.gap_task_ids = list(d.get("gap_task_ids", []))
        p.priority_windows = [PriorityWindow(**w) for w in d.get("priority_windows", [])]
        p.energy_logs = [EnergyLog(**e) for e in d.get("energy_logs", [])]
        p.reflections = [
            TaskReflection(**{**r, "choice": ReflectionChoice(r["choice"])})
            for r in d.get("reflections", [])
        ]
        p.off_track_logs = [OffTrackLog(**o) for o in d.get("off_track_logs", [])]
        return p


# ---------------------------------------------------------------------------
# WHAT DO THEY WANT TO ACHIEVE?
# ---------------------------------------------------------------------------

@dataclass
class Goal:
    """A job or target the user is working toward.
    gaps.py compares required_skills against Profile.skills and generates
    Tasks to close the gap."""
    id: str
    title: str
    jd_text: str = ""
    close_date: str = ""           # ISO date — the hard deadline
    required_skills: list[str] = field(default_factory=list)
    fit: float = 0.5              # 0..1 match quality, used as priority weight

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class EventAnchor:
    """The link between a Task and a CalendarEvent.
    Tells the scheduler: place this task before/after/same-day as that event."""
    anchor_event_id: str
    relation: LinkRelation
    within_days: int | None = None  # only used for WITHIN_DAYS_BEFORE


@dataclass
class ChecklistItem:
    """A sub-item of a Task's checklist.
    Incomplete items carry forward to the next day."""
    '''autonormalisation --> when 1 new item is added, all weights rescale to sum to 100 -> DONT MAKE OTTO USERS DO MATH HAHAHHA'''
    text: str
    done: bool = False
    weight: float | None = None  

@dataclass
class Task:
    """One schedulable unit of work.

    Two origins:
      - Goal task: auto-generated by gaps.py from a skill gap (goal_id is set)
      - Manual task: created by the user directly (goal_id is None)

    Both go through the same scheduler."""
    id: str
    title: str
    duration_planned: int   # minutes — replaces full_minutes for manual tasks

    importance: float = 1.0  # priority weight; engine sets this for goal tasks, 1.0 for manual

    # goal connection — optional, only set for goal-generated tasks
    goal_id: str | None = None
    skill_served: str | None = None
    lite_minutes: int | None = None  # shorter downscoped version for when behind

    # what kind of work — used by scheduler for peak-window gating
    category: Category = Category.DEEP_WORK
    effort_tier: EffortTier = EffortTier.MED  # derive from duration if not explicitly set

    # scheduling constraints
    prereq_ids: list[str] = field(default_factory=list)  # task IDs that must be placed first
    link: EventAnchor | None = None                       # time-anchor to a CalendarEvent
    deadline_iso: str | None = None                       # ISO date — hard deadline (scheduler treats as immovable constraint)
    hard_deadline: bool = True                            # False = soft/best-effort; True = must finish by deadline_iso
    best_done_by_iso: str | None = None                   # ISO date — soft preferred completion date (raises urgency score but never blocks)
    fixed: bool = False                                   # True = immovable by scheduler

    # content
    checklist: list[ChecklistItem] = field(default_factory=list)  # sub-items; incomplete ones carry forward
    completion_mode: str = "percentage" #slider only, user drags to adjust 
    completion_percentage: float = 0.0 # 0..1, used for progress bar and learning signals

    non_negotiable: bool = False  # True = user has marked this task as non-negotiable, scheduler will not displace it
    # soft placement hint — scheduler tries this day/time first (nearest-fit) before scanning the week.
    # used when re-placing a displaced calendar event so it lands near where it was, not on Monday.
    prefer_day: int | None = None
    prefer_start_min: int | None = None
    split_of: str | None = None   # id of the task this is one session of (set by the scheduler's focus split)
    must_split: bool = False      # longer than a day can hold: always spread across days into whatever time is free
    keep_out: list[tuple[int, int, int]] = field(default_factory=list)   # (day, start, end) slots this task may not use (time reserved for something else)
    end_by: int | None = None     # latest finish, as absolute minutes from the start of day 0 (day*1440 + minute). Used to pull a prerequisite in front of something that has to wait for it.
    user_rank: int | None = None  # user-specified rank for this task, used in priority windows
    # state
    status: Status = Status.TODO
    carried_forward: bool = False  # True = moved from a previously missed day
    grinder_note: str = ""         # why the user parked it — shown in the Meatball Grinder

    @property
    def est_minutes(self) -> int:
        return self.duration_planned

    @property
    def full_minutes(self) -> int:
        # kept for backwards compatibility with scheduler.py and gaps.py
        return self.duration_planned

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["status"] = self.status.value
        d["category"] = self.category.value
        d["effort_tier"] = self.effort_tier.value
        d["est_minutes"] = self.est_minutes
        if self.link:
            d["link"]["relation"] = self.link.relation.value
        return d


# ---------------------------------------------------------------------------
# CALENDAR
# ---------------------------------------------------------------------------

@dataclass
class CalendarEvent:
    """A real calendar event — meeting, interview, gym class.

    Different from TimeBlock:
      TimeBlock  = dumb blocked slot, no identity, scheduler just avoids it
      CalendarEvent = has a title, confirmed/TBC state, and can be the
                      anchor target for a linked Task"""
    id: str
    title: str
    start_iso: str           # "2026-07-29T10:00"
    end_iso: str
    category: Category = Category.SOCIAL
    fixed: bool = True       # False = user can reschedule it
    confirmed: bool = True   # False = TBC, renders dashed on calendar

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["category"] = self.category.value
        return d


# ---------------------------------------------------------------------------
# SCHEDULER OUTPUT
# ---------------------------------------------------------------------------

@dataclass
class Block:
    """Scheduler output: a Task placed into a concrete time slot.
    This is what gets drawn as a block on the calendar."""
    day: int
    start_min: int
    end_min: int
    task_id: str
    lite: bool = False        # True if scheduled as the downscoped (shorter) variant
    is_split: bool = False    # True if this is one session of a multi-session task
    overpacked: bool = False  # True if slot is slightly tight — shows ! on calendar
    session_notes: str = ""
    session_pct_delta: float = 0.0
    is_break: bool = False    # an auto-inserted break, not work (task_id is "break:<task id>")

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Plan:
    """The full scheduler output for a week."""
    blocks: list[Block] = field(default_factory=list)
    at_risk: list[str] = field(default_factory=list)              # task_ids scheduler couldn't fit — will retry next run
    carried_forward: list[str] = field(default_factory=list)      # task_ids surfaced from yesterday's misses
    meatball_grinder: list[str] = field(default_factory=list)     # task_ids user explicitly parked — never auto-rescheduled
    feasible: bool = True
    tradeoff: Optional[dict] = None  # {"options": [...], "reason": "..."} shown when nothing fits
    splits: dict[str, list[str]] = field(default_factory=dict)  # task id -> its session ids, when the scheduler split it
    breaks: list[Block] = field(default_factory=list)           # auto-inserted breaks (never work, never overlap blocks except inside a long deep-work block)
    displaced: list[str] = field(default_factory=list)          # task_ids bumped to make room for a non-negotiable task

    def to_dict(self) -> dict[str, Any]:
        return {
            "blocks": [b.to_dict() for b in self.blocks],
            "at_risk": self.at_risk,
            "carried_forward": self.carried_forward,
            "meatball_grinder": self.meatball_grinder,
            "feasible": self.feasible,
            "tradeoff": self.tradeoff,
            "splits": self.splits,
            "breaks": [b.to_dict() for b in self.breaks],
            "displaced": self.displaced,
        }


# ---------------------------------------------------------------------------
# LEARNING SIGNALS
# ---------------------------------------------------------------------------

@dataclass
class EnergyLog:
    """One tap of the + energy button on the live timeline.
    Accumulated over weeks → learning.py uses these to update Profile.peak_window."""
    ts: str     # ISO datetime — "2026-07-29T09:30"
    level: int  # 1=drained · 2=tired · 3=neutral · 4=in the zone · 5=energised
    after_meeting_min: int | None = None  # minutes since a meeting/social event ended, if one just did — teaches recovery_after_meeting


@dataclass
class OffTrackLog:
    """User labels a time block where they went off-track.
    Tells the learning model WHY a task overran — so velocity isn't wrongly penalised
    for things outside the user's control (emergency, interruption)."""
    ts: str
    duration_min: int
    reason: str              # "doomscrolled" | "messages" | "couldnt_focus"
                             # | "break" | "medical" | "family" | "work_crisis"
    task_id: str | None = None
    into_task_min: int | None = None   # minutes into the work session when focus broke — teaches focus_span_min


@dataclass
class TaskReflection:
    """Post-task check-in, triggered when user drags the actual end time on the timeline.
    The single most important learning signal — determines whether and how velocity updates."""
    task_id: str
    ts: str
    choice: ReflectionChoice
    planned_minutes: int
    actual_minutes: int       # captured from the drag
    category: str = "deep_work"  # passed by API from task — tells learning.py which velocity bucket to update


@dataclass
class TaskCompletion:
    """Simple done/not-done record used for overall completion_rate tracking.
    Renamed from CompletionEvent — same data, clearer name."""
    task_id: str
    planned_minutes: int
    done: bool
    ts: str = ""

@dataclass 
class PriorityWindow: 
    #ranks importance list for a given time window
    #helps with task displacement when there is a impending deadline but no availabe slot AT ALL
    window: str #week, month, year 
    start_iso: str
    end_iso: str
    ranked_task_ids: list[str] = field(default_factory=list)     # most → least important, user-ordered
    non_negotiable_ids: list[str] = field(default_factory=list)  # these can displace other tasks when deadline hits


# ---------------------------------------------------------------------------
# OVERSLEEP
# ---------------------------------------------------------------------------

@dataclass
class OversleepEvent:
    """Recorded when the user wakes up later than their intended day_start_min.
    Triggers the triage UI — each displaced task gets an OversleepTriage choice.
    After triage, scheduler re-runs with actual_wake_min as the new day_start_min."""
    date_iso: str          # which day this happened — "2026-08-04"
    intended_wake_min: int # profile.day_start_min before oversleep e.g. 480 (8am)
    actual_wake_min: int   # when they actually woke e.g. 660 (11am)
    displaced_task_ids: list[str] = field(default_factory=list)
    # task IDs whose scheduled blocks fell in the lost window (intended→actual wake)

    @property
    def lost_minutes(self) -> int:
        return self.actual_wake_min - self.intended_wake_min


@dataclass
class OversleepTriageDecision:
    """The user's triage choice for one displaced task after an oversleep event."""
    task_id: str
    choice: OversleepTriage
    date_iso: str  # which oversleep event this belongs to


# ---------------------------------------------------------------------------
# MEATBALL GRINDER 🍖
# ---------------------------------------------------------------------------

@dataclass
class MeatballGrinderEntry:
    """A task the user has explicitly parked — not auto-rescheduled, sits in the Meatball Grinder.
    Different from at_risk (scheduler couldn't fit it) — this is a deliberate user choice.
    User can pull it back into the active schedule at any time."""
    task_id: str
    parked_iso: str        # when it was parked
    note: str = ""         # why they parked it (copied from task.grinder_note)
    source: str = "manual" # "manual" | "oversleep_triage" | "displacement"
    # source tells the UI where this came from so it can show the right context