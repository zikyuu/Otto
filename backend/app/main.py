"""FastAPI app. Engine endpoints are deterministic (no LLM, work without keys).
LLM endpoints are the ears/mouth only.

  POST /api/profile    resume_text        -> Profile
  POST /api/goal       jd_text            -> Goal
  POST /api/plan       profile+goals      -> Plan (blocks, at_risk, tradeoff)
  POST /api/reshuffle  plan+completed+missed -> Plan + narration
  POST /api/schedule   calendar events + pinned ids -> re-placed events (engine, NO LLM)
  POST /api/learning/reflection | /energy | /off-track | /completion | /actual   learning signals -> updated profile
  POST /api/learning/stated-rule | /stated-rule/clear   rules the user states directly (pinned, never overwritten)
  POST /api/profile/sleep-window   wake / sleep times (the edges of the schedulable day)
  GET/PUT /api/priority-windows    ranked + non-negotiable task lists per week / month / year
  GET  /api/learning   -> what Otto has learned about the user so far
  POST /api/chat       plan+message       -> narration (+ maybe re-plan)
  POST /api/ai/review-goals  weekly LLM check that long-term goals are on track
  GET  /api/health
  GET  /api/demo       -> the seeded demo payload (resume, jd, time_blocks)
"""
from __future__ import annotations

import json
import re
import os
from pathlib import Path
from typing import Literal

import io

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.engine.gaps import derive_tasks
from app.engine.feasibility import assess
from app.engine.scheduler import schedule
from app.llm.extract import parse_resume, parse_jd, narrate
from datetime import date, datetime, timedelta

from pydantic import ConfigDict, Field

from app import auth, clock, llm_access, store
from app.engine.calendar_bridge import reschedule_events, to_category
from app.engine import learning
from app.engine.learning import add_energy_log, add_off_track, apply_all_signals
from app.models import (
    EnergyLog, Goal, OffTrackLog, PriorityWindow, Profile, ReflectionChoice, Status, Task, TaskReflection,
)

DEMO = json.loads((Path(__file__).parent / "demo_data" / "demo.json").read_text())

app = FastAPI(title="Otto")
# With login on, only the app's own origin may call the API from a browser (OTTO_ORIGIN, e.g. https://otto.onrender.com); in development it is open.
_ORIGINS = [o.strip() for o in os.getenv("OTTO_ORIGIN", "").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=_ORIGINS if (_ORIGINS and auth.required()) else ["*"],
                   allow_methods=["*"], allow_headers=["*"])
app.add_middleware(auth.AuthMiddleware)
app.add_middleware(clock.ClockMiddleware)       # added last = outermost: it runs first, so everything below sees the person's own time


@app.get("/api/auth/config")
def auth_config():
    return auth.public_config()



# ---- request bodies -------------------------------------------------------

class ResumeBody(BaseModel):
    resume_text: str

class JDBody(BaseModel):
    jd_text: str
    goal_id: str = "job1"

class PlanBody(BaseModel):
    profile: dict
    goals: list[dict]
    deadline_day: int = 4

class ReshuffleBody(BaseModel):
    profile: dict
    goals: list[dict]
    deadline_day: int = 4
    missed_task_ids: list[str] = []

class ChatBody(BaseModel):
    message: str
    plan_summary: dict = {}
    goals: list[dict] = []


# ---- helpers --------------------------------------------------------------

def _profile_from(d: dict) -> Profile:
    """Request profile layered over the stored one, so what Otto has learned
    (velocity, peak window, completion rate) survives requests that only send
    skills / time_blocks."""
    return Profile.from_dict({**store.load_profile().to_dict(), **d})

def _goals_from(items: list[dict]) -> list[Goal]:
    return [Goal(**g) for g in items]

def _all_tasks(profile: Profile, goals: list[Goal]) -> list[Task]:
    tasks: list[Task] = []
    for g in goals:
        tasks += derive_tasks(g, profile)
    return tasks


# ---- endpoints ------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"ok": True}

@app.get("/api/demo")
def demo():
    return DEMO

@app.post("/api/profile")
def profile(body: ResumeBody):
    p = parse_resume(body.resume_text)
    return p.to_dict()

@app.post("/api/parse-resume-file")
async def parse_resume_file(file: UploadFile = File(...)):
    content = await file.read()
    if file.filename and file.filename.lower().endswith(".pdf"):
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception:
            text = content.decode("utf-8", errors="ignore")
    else:
        text = content.decode("utf-8", errors="ignore")
    p = parse_resume(text)
    return p.to_dict()

@app.post("/api/goal")
def goal(body: JDBody):
    g = parse_jd(body.jd_text, goal_id=body.goal_id)
    return g.to_dict()

@app.post("/api/plan")
def plan(body: PlanBody):
    profile = _profile_from(body.profile)
    goals = _goals_from(body.goals)
    tasks = _all_tasks(profile, goals)
    result = assess(tasks, profile, goals, body.deadline_day)
    return {"plan": result.to_dict(), "tasks": [t.to_dict() for t in tasks]}

@app.post("/api/reshuffle")
def reshuffle(body: ReshuffleBody):
    profile = _profile_from(body.profile)
    goals = _goals_from(body.goals)
    tasks = _all_tasks(profile, goals)
    # mark missed tasks; drop their importance slightly so the re-solve adapts
    missed = set(body.missed_task_ids)
    for t in tasks:
        if t.id in missed:
            t.status = Status.MISSED
    result = assess(tasks, profile, goals, body.deadline_day)
    summary = result.to_dict()
    msg = narrate("I fell behind, reshuffle my week", summary)
    return {"plan": summary, "narration": msg,
            "tasks": [t.to_dict() for t in tasks]}

@app.post("/api/chat")
def chat(body: ChatBody):
    goals = _goals_from(body.goals) if body.goals else []
    return {"narration": narrate(body.message, body.plan_summary)}

# ---- calendar scheduling (engine — deterministic, no LLM, no key needed) --------

class CalEvent(BaseModel):
    model_config = ConfigDict(extra="allow")  # extra keys (color, prereq_ids, deadline_iso…) pass through
    id: str
    title: str
    day: int          # date of month, matches week_days
    startMin: int     # minutes from midnight
    durationMin: int = Field(gt=0)
    category: str = "admin"
    fixed: bool = False

class BlockedWindow(BaseModel):
    day: int                      # date of month, matches week_days
    start_min: int = Field(ge=0, le=28 * 60)
    end_min: int = Field(gt=0, le=28 * 60)
    for_ids: list[str] = []       # empty: a window to clear (nothing may use it). Set: cleared FOR these events and what they wait for

class ScheduleRequest(BaseModel):
    events: list[CalEvent]
    pinned_ids: list[str] = []      # events the user just moved — must stay put
    plan_ids: list[str] = []        # events just created — the scheduler decides if a long one is split
    week_days: list[int] = Field(min_length=7, max_length=14)  # date-of-month, Monday first: 7 (one week) or 14 (two)
    blocked_windows: list[BlockedWindow] = []   # time the user wants cleared (reschedule selection mode)
    fix_order: Literal["move_dependents", "move_prerequisites"] = "move_dependents"   # which side moves when an ordered link is broken
    week_start_iso: str | None = None   # ISO date of Monday; enables real deadlines + "don't schedule the past"
    mode: str = "displaced"         # "displaced" = only fix what the change broke · "full" = re-optimise all flexible

class ScheduleResponse(BaseModel):
    events: list[dict]
    conflicts: list[str]            # events the engine couldn't place cleanly / that break prereq order
    moved: list[str]
    explanation: str
    order_violations: list[dict] = []   # [{id, prereq_ids}]: events that start before something they must follow
    decisions: list[dict] = []          # questions only the user can answer (a low-importance deadline vs. something marked important)

@app.post("/api/schedule", response_model=ScheduleResponse)
def api_schedule(body: ScheduleRequest):
    if len(body.week_days) not in (7, 14):
        raise HTTPException(422, detail="week_days must have 7 (one week) or 14 (two weeks) entries")
    if body.mode not in ("displaced", "full"):
        raise HTTPException(422, detail="mode must be 'displaced' or 'full'")
    week_start = None
    if body.week_start_iso:
        try:
            week_start = date.fromisoformat(body.week_start_iso[:10])
        except ValueError:
            raise HTTPException(422, detail="week_start_iso must be an ISO date")
    now = clock.now()
    result = reschedule_events(
        [e.model_dump() for e in body.events], body.pinned_ids,
        store.load_profile(), body.week_days,
        week_start=week_start, today=now.date() if week_start else None,
        now_min=now.hour * 60 + now.minute, mode=body.mode, plan_ids=body.plan_ids,
        blocked_windows=[w.model_dump() for w in body.blocked_windows], order_fix=body.fix_order,
    )
    return ScheduleResponse(**result)


# ---- learning loop: signals in → profile updated → next /api/schedule uses it ----

class ReflectionBody(BaseModel):
    task_id: str
    choice: ReflectionChoice
    planned_minutes: int = Field(gt=0)
    actual_minutes: int = Field(ge=0, le=24 * 60)
    category: str = "deep_work"      # frontend labels like "leetcode" are mapped to engine categories
    ts: str | None = None
    days_to_deadline: int | None = Field(default=None, ge=-365, le=3650)
    prev_category: str | None = None

class OffTrackBody(BaseModel):
    reason: Literal["doomscrolled", "messages", "couldnt_focus", "break", "medical", "family", "work_crisis"]
    duration_min: int = Field(gt=0, le=24 * 60)
    into_task_min: int | None = Field(default=None, ge=0, le=24 * 60)   # minutes into the session it happened
    task_id: str | None = None
    ts: str | None = None

class EnergyBody(BaseModel):
    level: int = Field(ge=1, le=5)
    ts: str | None = None            # defaults to now
    after_meeting_min: int | None = Field(default=None, ge=0, le=24 * 60)   # minutes since a meeting ended, if one just did
    after_hard_min: int | None = Field(default=None, ge=0, le=24 * 60)      # minutes since a long deep-work block ended

def _learned(p: Profile) -> dict:
    return {
        "avg_velocity": p.avg_velocity,
        "peak_window": list(p.peak_window),
        "completion_rate": p.completion_rate,
        "focus_span_min": p.focus_span_min,
        "focus_evidence": p.focus_evidence,
        "energy_logs": len(p.energy_logs),
        "reflections": len(p.reflections),
        "ramp_up_min": p.ramp_up_min,
        "post_meal_slump_min": p.post_meal_slump_min,
        "planning_bias": p.planning_bias,
        "recovery_after_meeting": p.recovery_after_meeting,
        "recovery_evidence": p.recovery_evidence,
        "batching_preference": p.batching_preference,
        "max_deep_run_min": p.max_deep_run_min,
        "break_min": p.break_min,
        "gym_first": p.gym_first,
        "gym_evidence": p.gym_evidence,
        "day_start_min": p.day_start_min,
        "day_end_min": p.day_end_min,
        "chronotype": learning.chronotype(p),
        "stated_overrides": p.stated_overrides,
        "gap_task_ids": p.gap_task_ids,
    }

@app.get("/api/patterns")
def get_patterns():
    """What Otto has noticed about how the user works, and how far it has to go for each one it has not seen yet."""
    return {"patterns": patterns_engine.compute(store.load_profile())}

@app.get("/api/learning")
def get_learning():
    return _learned(store.load_profile())

@app.post("/api/learning/reflection")
def post_reflection(body: ReflectionBody):
    ts = body.ts or clock.now().isoformat(timespec="minutes")
    reflection = TaskReflection(
        task_id=body.task_id, ts=ts, choice=body.choice,
        planned_minutes=body.planned_minutes, actual_minutes=body.actual_minutes,
        category=to_category(body.category).value, days_to_deadline=body.days_to_deadline,
        prev_category=to_category(body.prev_category).value if body.prev_category else None,
    )
    with store.locked_profile() as p:
        apply_all_signals(p, reflection)
        return _learned(p)

@app.post("/api/learning/off-track")
def post_off_track(body: OffTrackBody):
    ts = body.ts or clock.now().isoformat(timespec="minutes")
    log = OffTrackLog(ts=ts, duration_min=body.duration_min, reason=body.reason,
                      task_id=body.task_id, into_task_min=body.into_task_min)
    with store.locked_profile() as p:
        add_off_track(p, log)
        return _learned(p)

@app.post("/api/learning/energy")
def post_energy(body: EnergyBody):
    ts = body.ts or clock.now().isoformat(timespec="minutes")
    with store.locked_profile() as p:
        add_energy_log(p, EnergyLog(ts=ts, level=body.level, after_meeting_min=body.after_meeting_min, after_hard_min=body.after_hard_min))
        return _learned(p)


class CompletionBody(BaseModel):
    task_id: str
    done: bool
    planned_minutes: int = Field(gt=0)

@app.post("/api/learning/completion")
def post_completion(body: CompletionBody):
    """A plain done / missed mark. Feeds completion_rate and (after a few) planning_bias."""
    with store.locked_profile() as p:
        learning.record_completion(p, body.done, body.planned_minutes)
        return _learned(p)


class ActualBody(BaseModel):
    task_id: str
    planned_minutes: int = Field(gt=0)
    actual_minutes: int = Field(ge=0, le=24 * 60)
    category: str = "deep_work"
    ts: str | None = None

@app.post("/api/learning/actual")
def post_actual(body: ActualBody):
    """The user dragged a block's end to what really happened. Close to plan = recorded as 'nailed'.
    Anything else returns ask_reflection=true and records nothing: the user's reason (harder, interrupted,
    tired...) decides what Otto learns, so send it via /api/learning/reflection."""
    choice = learning.classify_actual(body.planned_minutes, body.actual_minutes)
    if choice is None:
        return {"recorded": False, "ask_reflection": True}
    ts = body.ts or clock.now().isoformat(timespec="minutes")
    reflection = TaskReflection(
        task_id=body.task_id, ts=ts, choice=choice, planned_minutes=body.planned_minutes,
        actual_minutes=body.actual_minutes, category=to_category(body.category).value,
    )
    with store.locked_profile() as p:
        apply_all_signals(p, reflection)
        return {"recorded": True, "ask_reflection": False, "learned": _learned(p)}


class StatedRuleBody(BaseModel):
    key: str
    value: object = None
    note: str = ""      # the user's own sentence, kept for the record

@app.post("/api/learning/stated-rule")
def post_stated_rule(body: StatedRuleBody):
    with store.locked_profile() as p:
        try:
            learning.set_stated_rule(p, body.key, body.value, body.note)
        except ValueError as e:
            raise HTTPException(422, detail=str(e))
        return _learned(p)

_TARGETS = "targets"      # numbers the person is trying to move towards, e.g. {"post_meal_slump_min": 15}

@app.get("/api/metrics")
def get_metrics():
    """Every learned number with where it came from and how the scheduler uses it."""
    return {"metrics": metrics_engine.build(store.load_profile(), kv.get(_TARGETS) or {}), "targets": kv.get(_TARGETS) or {}}

class TargetBody(BaseModel):
    key: str
    value: float | None = Field(default=None, ge=0, le=1000)

@app.put("/api/targets")
def put_target(body: TargetBody):
    ok = {m["key"] for m in metrics_engine.build(store.load_profile()) if m["can_target"]}
    if body.key not in ok:
        raise HTTPException(422, detail="that setting cannot have a target")
    t = dict(kv.get(_TARGETS) or {})
    if body.value is None:
        t.pop(body.key, None)
    else:
        t[body.key] = int(body.value)
    kv.put(_TARGETS, t)
    return {"targets": t}

@app.get("/api/rules")
def get_rules():
    """The settings the user has pinned (learning never overwrites them), and the rules that can be set by hand."""
    p = store.load_profile()
    pinned = []
    for key, value in p.stated_overrides.items():
        pinned.append({"key": key, "value": value, "label": chat_engine.describe(key, value)})
    return {"pinned": pinned, "catalogue": chat_engine.CATALOGUE, "notes": p.stated_rules[-10:]}

class ClearRuleBody(BaseModel):
    key: str

@app.post("/api/learning/stated-rule/clear")
def post_clear_stated_rule(body: ClearRuleBody):
    with store.locked_profile() as p:
        learning.clear_stated_rule(p, body.key)
        return _learned(p)


class SleepWindowBody(BaseModel):
    wake_min: int         # minutes from midnight, e.g. 480 = 08:00
    sleep_min: int        # may run past midnight: 4am = 1680

@app.post("/api/profile/sleep-window")
def post_sleep_window(body: SleepWindowBody):
    with store.locked_profile() as p:
        try:
            learning.set_sleep_window(p, body.wake_min, body.sleep_min)
        except ValueError as e:
            raise HTTPException(422, detail=str(e))
        return _learned(p)


class PriorityWindowBody(BaseModel):
    window: Literal["week", "month", "year"]
    start_iso: str
    end_iso: str
    ranked_task_ids: list[str] = []
    non_negotiable_ids: list[str] = []

@app.get("/api/priority-windows")
def get_priority_windows():
    return [w.__dict__ for w in store.load_profile().priority_windows]

@app.put("/api/priority-windows")
def put_priority_windows(body: list[PriorityWindowBody]):
    for w in body:
        try:
            if date.fromisoformat(w.end_iso[:10]) < date.fromisoformat(w.start_iso[:10]):
                raise ValueError
        except ValueError:
            raise HTTPException(422, detail="priority window dates must be ISO dates with end on or after start")
    with store.locked_profile() as p:
        p.priority_windows = [PriorityWindow(**w.model_dump()) for w in body]
        return [w.__dict__ for w in p.priority_windows]


# ---- goal review: the weekly "wizard" check ---------------------------------------------------
# The tracker page computes progress, expected progress, pace and status itself (deterministic).
# The LLM is asked, about once a week, only for what arithmetic can't give: is the path itself right,
# and if the goal can't be reached, what to cut or move.

class ReviewMilestone(BaseModel):
    id: str = ""
    title: str
    effort_h: float = 0
    due: str = ""
    done: bool = False
    pct_when_done: float = 0           # overall % the goal reaches once this milestone is done

class ReviewDetour(BaseModel):
    date: str = ""
    type: str = "sidetrack"            # sidetrack | roadblock | pivot
    text: str = ""
    impact_days: float = 0             # older saved goals may still carry it; it is no longer asked for

class ReviewGoal(BaseModel):
    id: str
    title: str
    cat: str = ""
    start_date: str = ""
    target_date: str = ""
    progress_pct: float = 0
    expected_pct: float = 0            # where the original plan says the goal should be today
    status: str = ""                   # ahead | on_track | behind | at_risk | impossible | done
    hours_remaining: float = 0
    hours_per_week: float = 0          # what the user says they can give this goal
    required_hours_per_week: float = 0
    projected_finish: str | None = None
    days_behind: float = 0             # how far behind the original plan, worked out from progress alone
    recent_focus: str = ""             # what the user has actually been spending time on
    milestones: list[ReviewMilestone] = []
    detours: list[ReviewDetour] = []

class GoalReviewRequest(BaseModel):
    goals: list[ReviewGoal] = Field(min_length=1)
    today: str | None = None

class GoalAdvice(BaseModel):
    id: str
    verdict: Literal["on-track", "at-risk", "impossible"]
    headline: str
    advice: list[str] = []
    reroute: list[dict] = []            # [{change, why}]
    suggested_target_date: str | None = None
    unapplied: list[str] = []           # things the model said in prose that no change covers: shown, never hidden
    changes: list[dict] = []            # concrete, typed proposals (see _clean_changes). Never applied by the server.
    needs_permission: bool = False      # true when any change is a big one: the page must get an explicit approval

class GoalReviewResponse(BaseModel):
    feasibility: Literal["on-track", "at-risk", "infeasible"]
    summary: str
    goals: list[GoalAdvice]
    new_goals: list[dict] = []          # goals the model thinks are missing: proposals only, always need approval

_GOAL_REVIEW_SYSTEM = """\
You are a direct, evidence-based coach reviewing a learner's goals. You are given, per goal, numbers that were
already computed (progress, where the plan said they should be, hours left vs hours available, projected finish)
plus their milestones and the detours they logged. Do not recompute or contradict those numbers; use them.

For every goal decide:
  "on-track"   - the current path reaches the target date.
  "at-risk"    - reachable only with a change of pace or scope.
  "impossible" - not reachable by the target date at the hours the user has; say so plainly, don't soften it.

Also judge whether the work being done is the RIGHT work for the outcome (a developer prepping for ML roles
should not spend a month on syntax). When a goal is at-risk or impossible, propose a concrete reroute: milestones to
drop, merge, reorder or add, and when impossible a realistic new target date (ISO, after today) or a scope cut.
Never invent facts about the user. Reference the actual numbers.

When a goal is at-risk or impossible, also give concrete CHANGES. You only ever propose: the user decides, and nothing is applied
without them. Prefer the smallest change that works (move one date, add one missing milestone) over a big one. A change is one of:
  {"type": "move_target", "to": "<ISO date>", "why": "..."}
  {"type": "add_milestone", "title": "...", "effort_h": <hours>, "due": "<ISO date>", "why": "..."}
  {"type": "move_milestone", "milestone_id": "<id from the data>", "due": "<ISO date>", "why": "..."}
  {"type": "drop_milestone", "milestone_id": "<id from the data>", "why": "..."}
  {"type": "pivot", "new_title": "<the goal, re-aimed>", "why": "...", "milestones": [{"title": "...", "effort_h": <hours>, "due": "<ISO date>"}]}
Use "pivot" only when the current direction cannot reach the outcome at all (work done so far is kept). If a whole new goal is
missing for the outcome the person wants, add it under "new_goals". Use milestone ids exactly as given. Everything you recommend must appear as a change: to cut a milestone use drop_milestone, to
move a date use move_target or move_milestone. Do not recommend anything in "advice" or "reroute" that is not also a change.

Return valid JSON only (no markdown fences):
{
  "summary": "<2-3 sentences across all goals>",
  "goals": [
    {
      "id": "<same id as given>",
      "verdict": "on-track|at-risk|impossible",
      "headline": "<one sentence>",
      "advice": ["<short, specific point>", "..."],
      "reroute": [{"change": "<what to change>", "why": "<one line>"}],
      "suggested_target_date": "<ISO date or null>",
      "changes": [ ...as above, or [] ]
    }
  ],
  "new_goals": [{"title": "...", "target": "<ISO date>", "hours_per_week": <n>, "why": "...", "milestones": [{"title": "...", "effort_h": <hours>, "due": "<ISO date>"}]}]
}"""

def _llm_json(system: str, user: str) -> dict:
    """One JSON-mode chat call. Isolated so tests can replace it. Whose key pays, and whether the call is allowed at all, is
    decided by llm_access (the feature is set by the caller with `llm_access.feature(...)`)."""
    try:
        key, source = llm_access.resolve(llm_access.current_feature())
    except llm_access.Blocked as b:
        raise HTTPException(b.status, detail=b.message)
    try:
        from openai import OpenAI as _OAI
        c = _OAI(api_key=key, timeout=25, max_retries=0)      # a stuck call must not hold the page
    except Exception as e:
        raise HTTPException(503, detail=str(e))
    try:
        r = c.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_object"}, temperature=0.35, max_tokens=1800,
        )
    except Exception as e:
        name = type(e).__name__
        if source == "own" and name == "AuthenticationError":
            raise HTTPException(402, detail="OpenAI rejected your saved key. Replace it on the Rules page.")
        if source == "own" and name == "RateLimitError":
            raise HTTPException(402, detail="Your OpenAI account has no credit left or is being rate limited.")
        raise
    out = json.loads(r.choices[0].message.content)
    llm_access.charge(source)
    return out

def _goal_brief(g: ReviewGoal) -> str:
    ms = "\n".join(
        f"    - [{'x' if m.done else ' '}] {f'({m.id}) ' if m.id else ''}{m.title} ({m.effort_h:g}h, due {m.due or '?'}, goal reaches {m.pct_when_done:g}% when done)"
        for m in g.milestones)
    dt = "\n".join(f"    - {d.date} {d.type}: {d.text}" for d in g.detours) or "    (none logged)"
    return (
        f"Goal id={g.id}: {g.title} [{g.cat}]\n"
        f"  Started {g.start_date or '?'}, target {g.target_date or '?'}\n"
        f"  Progress {g.progress_pct:.0f}% vs {g.expected_pct:.0f}% expected today (status: {g.status})\n"
        f"  {g.hours_remaining:g}h of work left; needs {g.required_hours_per_week:.1f}h/week, user gives {g.hours_per_week:g}h/week; "
        f"projected finish {g.projected_finish or 'unknown'}\n"
        f"  Behind the original plan by about {g.days_behind:g} days (read from progress, not from the detours logged)\n"
        f"  Recently spending time on: {g.recent_focus or 'not stated'}\n"
        f"  Milestones:\n{ms}\n  Detours:\n{dt}")

def _valid_future_date(iso: object, today: date) -> str | None:
    if not isinstance(iso, str):
        return None
    try:
        d = date.fromisoformat(iso[:10])
    except ValueError:
        return None
    return d.isoformat() if d > today else None

def _num(x, lo: float, hi: float, default: float) -> float:
    try:
        return max(lo, min(hi, float(x)))
    except (TypeError, ValueError):
        return default

def _date_or_none(x, floor: date) -> str | None:
    """Any real ISO date on or after `floor` (a milestone may be due today; a target must be later: callers pass the floor)."""
    if not isinstance(x, str):
        return None
    try:
        d = date.fromisoformat(x[:10])
    except ValueError:
        return None
    return d.isoformat() if d >= floor else None

MAJOR_SHIFT_DAYS = 21           # moving a target date this far is a change of plan, not a tweak
MAJOR_OPEN_SHARE = 0.4          # touching this share of the work still to do is an overhaul

def _clean_changes(raw, g: ReviewGoal, today: date) -> list[dict]:
    """Typed, bounded change proposals for one goal. The model only proposes; this makes every proposal safe to show, and
    the server (not the model) decides which ones are big enough to need the user's explicit approval:
      - a pivot, or more than one dropped milestone;
      - a target moved more than three weeks;
      - changes that touch 40% or more of the work still to do.
    A big change makes the whole package big, so it is approved or declined as one."""
    by_id = {m.id: m for m in g.milestones if m.id}
    open_effort = sum(m.effort_h for m in g.milestones if not m.done) or 1.0
    out: list[dict] = []
    touched = 0.0
    drops = 0
    shift_big = False
    pivot = False
    for r in (raw or [])[:8]:
        if not isinstance(r, dict):
            continue
        t, why = r.get("type"), str(r.get("why") or "").strip()[:240]
        if t == "move_target":
            to = _valid_future_date(r.get("to"), today)
            if not to:
                continue
            try:
                shift = abs((date.fromisoformat(to) - date.fromisoformat(g.target_date[:10])).days) if g.target_date else 0
            except ValueError:
                shift = 0
            shift_big = shift_big or shift > MAJOR_SHIFT_DAYS
            out.append({"type": t, "to": to, "why": why})
        elif t == "add_milestone":
            title, due = str(r.get("title") or "").strip()[:120], _date_or_none(r.get("due"), today)
            if not title or not due:
                continue
            eff = _num(r.get("effort_h"), 0.5, 200, 2)
            touched += eff
            out.append({"type": t, "title": title, "effort_h": round(eff, 1), "due": due, "why": why})
        elif t == "move_milestone":
            m, due = by_id.get(str(r.get("milestone_id"))), _date_or_none(r.get("due"), today)
            if not m or m.done or not due:
                continue
            out.append({"type": t, "milestone_id": m.id, "due": due, "why": why})
        elif t == "drop_milestone":
            m = by_id.get(str(r.get("milestone_id")))
            if not m or m.done:
                continue
            drops += 1
            touched += m.effort_h
            out.append({"type": t, "milestone_id": m.id, "why": why})
        elif t == "pivot":
            title = str(r.get("new_title") or "").strip()[:120]
            ms = [{"title": str(x.get("title") or "").strip()[:120], "effort_h": round(_num(x.get("effort_h"), 0.5, 200, 2), 1), "due": _date_or_none(x.get("due"), today)}
                  for x in (r.get("milestones") or [])[:8] if isinstance(x, dict) and str(x.get("title") or "").strip()]
            ms = [m for m in ms if m["due"]]
            if not title or not ms or pivot:
                continue
            pivot = True
            out.append({"type": t, "new_title": title, "milestones": ms, "why": why})
    major = pivot or drops > 1 or shift_big or touched / open_effort >= MAJOR_OPEN_SHARE
    return [{**c, "id": f"{g.id}:c{i + 1}", "major": bool(major)} for i, c in enumerate(out)]

def _clean_new_goals(raw, today: date) -> list[dict]:
    out = []
    for r in (raw or [])[:2]:
        if not isinstance(r, dict):
            continue
        title, target = str(r.get("title") or "").strip()[:120], _valid_future_date(r.get("target"), today)
        ms = [{"title": str(x.get("title") or "").strip()[:120], "effort_h": round(_num(x.get("effort_h"), 0.5, 200, 2), 1), "due": _date_or_none(x.get("due"), today)}
              for x in (r.get("milestones") or [])[:8] if isinstance(x, dict) and str(x.get("title") or "").strip()]
        ms = [m for m in ms if m["due"]]
        if title and target:
            out.append({"id": f"new{len(out) + 1}", "title": title, "target": target, "hours_per_week": round(_num(r.get("hours_per_week"), 0.5, 40, 4), 1),
                        "why": str(r.get("why") or "").strip()[:240], "milestones": ms, "major": True})
    return out

_CUT = re.compile(r"\b(cut|drop|remove|skip|delete|scrap)\b", re.I)

def _norm(t: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", t.lower()).strip()

def _align_prose(prose: list[str], g: ReviewGoal, changes: list[dict]) -> tuple[list[dict], list[str]]:
    """The model sometimes writes "cut the caching milestone" in prose and forgets to make it a change, so the page would
    offer only the date shift. Close that gap: a prose line that names an open milestone together with a cutting verb becomes
    a drop proposal (same safety rules as any change), and any prose that still matches no change is returned so it can be
    shown as "mentioned, not applicable" rather than silently dropped."""
    open_ms = [m for m in g.milestones if m.id and not m.done]
    dropped = {c["milestone_id"] for c in changes if c["type"] == "drop_milestone"}
    touched = {c.get("milestone_id") for c in changes}
    out = list(changes)
    unapplied: list[str] = []
    for line in prose:
        text = _norm(line)
        named = [m for m in open_ms if _norm(m.title) and _norm(m.title) in text]
        if named and _CUT.search(line):
            for m in named:
                if m.id not in dropped:
                    dropped.add(m.id)
                    touched.add(m.id)
                    out.append({"type": "drop_milestone", "milestone_id": m.id, "why": line.strip()[:240]})
            continue
        covered = (any(m.id in touched for m in named)
                   or (re.search(r"target|deadline|\bdate\b|extend", line, re.I) and any(c["type"] == "move_target" for c in out))
                   or (re.search(r"\badd\b|new milestone", line, re.I) and any(c["type"] == "add_milestone" for c in out))
                   or (re.search(r"pivot|direction|re-?aim", line, re.I) and any(c["type"] == "pivot" for c in out)))
        if not covered and line.strip():
            unapplied.append(line.strip()[:240])
    return out, unapplied

def _clean_review(data: dict, goals: list[ReviewGoal], today: date) -> GoalReviewResponse:
    """Whatever the model returned becomes a well-formed response: every requested goal appears exactly once,
    unknown ids are dropped, verdicts are coerced, bad dates are discarded."""
    raw = {str(x.get("id")): x for x in data.get("goals", []) if isinstance(x, dict)}
    out: list[GoalAdvice] = []
    for g in goals:
        x = raw.get(g.id, {})
        verdict = x.get("verdict")
        if verdict not in ("on-track", "at-risk", "impossible"):
            verdict = {"impossible": "impossible", "at_risk": "at-risk", "behind": "at-risk"}.get(g.status, "on-track")
        reroute = [{"change": str(r.get("change", "")).strip(), "why": str(r.get("why", "")).strip()}
                   for r in (x.get("reroute") or []) if isinstance(r, dict) and str(r.get("change", "")).strip()]
        advice = [str(a).strip() for a in (x.get("advice") or []) if str(a).strip()]
        changes, unapplied = [], []
        if verdict != "on-track":
            raw_changes = [c for c in (x.get("changes") or []) if isinstance(c, dict)]
            raw_changes, unapplied = _align_prose([r["change"] for r in reroute] + advice, g, raw_changes)
            changes = _clean_changes(raw_changes, g, today)
        out.append(GoalAdvice(
            id=g.id, verdict=verdict, headline=str(x.get("headline") or "").strip() or "No comment from the wizard on this one.",
            advice=advice[:5], reroute=reroute[:5],
            suggested_target_date=_valid_future_date(x.get("suggested_target_date"), today) if verdict != "on-track" else None,
            changes=changes, unapplied=unapplied[:4], needs_permission=any(c["major"] for c in changes)))
    worst = "infeasible" if any(a.verdict == "impossible" for a in out) else "at-risk" if any(a.verdict == "at-risk" for a in out) else "on-track"
    return GoalReviewResponse(feasibility=worst, summary=str(data.get("summary") or "").strip(), goals=out, new_goals=_clean_new_goals(data.get("new_goals"), today))

@app.post("/api/ai/review-goals", response_model=GoalReviewResponse)
def ai_review_goals(body: GoalReviewRequest):
    try:
        today = date.fromisoformat(body.today[:10]) if body.today else clock.today()
    except ValueError:
        raise HTTPException(422, detail="today must be an ISO date")
    user_msg = (f"Today is {today.isoformat()}.\n\n" + "\n\n".join(_goal_brief(g) for g in body.goals)
                + "\n\nReview every goal. Be specific about the most at-risk one.")
    with llm_access.feature("review"):
        data = _llm_json(_GOAL_REVIEW_SYSTEM, user_msg)
    return _clean_review(data, body.goals, today)


# ---- persistence: one JSON document per key (Supabase if configured, else a local file) ----

import re as _re
from app import kv
from app.daynum import day_of
from app.engine import metrics as metrics_engine, patterns as patterns_engine, chat as chat_engine, enrich as enrich_engine, oversleep as oversleep_engine, summaries as summaries_engine, weekly as weekly_engine
from app.engine import week_check as week_check_engine

_STATE_KEY = _re.compile(r"^otto\.[a-z0-9._-]{1,60}$")      # the page's own state; server-side secrets never use this prefix
_STATE_MAX = 4_000_000                                          # bytes of JSON per document

@app.get("/api/state")
def get_all_state():
    return {"backend": kv.backend(), "state": kv.all_keys("otto.")}

@app.get("/api/state/{key}")
def get_state(key: str):
    if not _STATE_KEY.match(key):
        raise HTTPException(422, detail="bad state key")
    val = kv.get(key, None)
    if val is None:
        raise HTTPException(404, detail="nothing stored")
    return {"key": key, "value": val}

class StateBody(BaseModel):
    value: object

@app.put("/api/state/{key}")
@app.post("/api/state/{key}")          # POST too: navigator.sendBeacon can only POST, and it saves state as the tab closes
def put_state(key: str, body: StateBody):
    if not _STATE_KEY.match(key):
        raise HTTPException(422, detail="bad state key")
    if len(json.dumps(body.value)) > _STATE_MAX:
        raise HTTPException(413, detail="state document too large")
    kv.put(key, body.value)
    return {"ok": True, "backend": kv.backend()}

@app.delete("/api/state/{key}")
def delete_state(key: str):
    if not _STATE_KEY.match(key):
        raise HTTPException(422, detail="bad state key")
    kv.delete(key)
    return {"ok": True}


# ---- oversleep / late start -----------------------------------------------------------------------------

def _today_of(iso: str | None) -> date:
    try:
        return date.fromisoformat(iso[:10]) if iso else clock.today()
    except ValueError:
        raise HTTPException(422, detail="today_iso must be an ISO date")

def _week_start(today: date, week_days: list[int]) -> date:
    """Monday of the visible week: the first listed day sits before or on `today`."""
    n = day_of(today)
    return today - timedelta(days=week_days.index(n)) if n in week_days else today

class OversleepBody(BaseModel):
    events: list[CalEvent]
    week_days: list[int] = Field(min_length=7, max_length=14)
    today_iso: str | None = None
    now_min: int | None = Field(default=None, ge=0, le=24 * 60)

@app.post("/api/oversleep/check")
def oversleep_check(body: OversleepBody):
    today = _today_of(body.today_iso)
    now = clock.now()
    now_min = body.now_min if body.now_min is not None else now.hour * 60 + now.minute
    evs = [e.model_dump() for e in body.events]
    out = oversleep_engine.detect(evs, day_of(today), now_min)
    if out["late"]:
        out["triage"] = oversleep_engine.triage(evs, day_of(today), now_min, store.load_profile(), today)
    return out

class OversleepApplyBody(OversleepBody):
    mode: Literal["reschedule", "keep", "write_off"]
    keep_ids: list[str] | None = None        # what stays today (above the line); default = the proposed line
    protect_tomorrow: bool = False
    choices: dict[str, Literal["today", "tomorrow", "grinder", "drop"]] | None = None    # per task, for "reschedule"
    dry_run: bool = False            # the late-start demo: work out the result without counting it as a late start

@app.post("/api/oversleep/apply")
def oversleep_apply(body: OversleepApplyBody):
    today = _today_of(body.today_iso)
    now = clock.now()
    now_min = body.now_min if body.now_min is not None else now.hour * 60 + now.minute
    if day_of(today) not in body.week_days:
        raise HTTPException(422, detail="today is not in week_days")
    def run(p):
        res = oversleep_engine.apply(
            body.mode, [e.model_dump() for e in body.events], day=day_of(today), now_min=now_min, profile=p,
            week_days=body.week_days, week_start=_week_start(today, body.week_days), today=today,
            keep_ids=body.keep_ids, protect_tomorrow=body.protect_tomorrow, choices=body.choices)
        if not body.dry_run:
            evs0 = [e.model_dump() for e in body.events]
            res["late_starts"] = oversleep_engine.log_late_start(p, today.isoformat(), oversleep_engine.first_start(evs0, day_of(today)), now_min)
        return res
    if body.dry_run:
        return run(store.load_profile())
    with store.locked_profile() as p:
        res = run(p)
    return res


# ---- "I'm overwhelmed": rank today, keep what matters for the hours given, show the plan ---------------

from app.engine import overwhelm as overwhelm_engine

class OverwhelmBody(OversleepBody):
    hours: float | None = Field(default=None, ge=0, le=16)      # "I only want to work this many hours today"
    keep_ids: list[str] | None = None                           # what the person ticked to still do today

@app.post("/api/overwhelm/triage")
def overwhelm_triage(body: OversleepBody):
    today = _today_of(body.today_iso)
    now = clock.now()
    now_min = body.now_min if body.now_min is not None else now.hour * 60 + now.minute
    return overwhelm_engine.triage([e.model_dump() for e in body.events], day_of(today), now_min, store.load_profile(), today, body.week_days)

@app.post("/api/overwhelm/plan")
def overwhelm_plan(body: OverwhelmBody):
    today = _today_of(body.today_iso)
    now = clock.now()
    now_min = body.now_min if body.now_min is not None else now.hour * 60 + now.minute
    if day_of(today) not in body.week_days:
        raise HTTPException(422, detail="today is not in week_days")
    return overwhelm_engine.plan(
        [e.model_dump() for e in body.events], day=day_of(today), now_min=now_min, profile=store.load_profile(), week_days=body.week_days,
        week_start=_week_start(today, body.week_days), today=today, hours=body.hours, keep_ids=body.keep_ids)


class LateLogBody(BaseModel):
    first_start: int | None = Field(default=None, ge=0, le=28 * 60)     # when the day was planned to begin
    now_min: int | None = Field(default=None, ge=0, le=24 * 60)
    today_iso: str | None = None

@app.post("/api/oversleep/log")
def oversleep_log(body: LateLogBody):
    """Count a late start once the person has actually applied a recovery plan (planning it alone does not count)."""
    today = _today_of(body.today_iso)
    now = clock.now()
    with store.locked_profile() as p:
        return oversleep_engine.log_late_start(p, today.isoformat(), body.first_start, body.now_min if body.now_min is not None else now.hour * 60 + now.minute)


# ---- feasibility, tradeoff, recovery on the real calendar ----------------------------------------------

class WeekCheckBody(OversleepBody):
    pass

@app.post("/api/week-check")
def api_week_check(body: WeekCheckBody):
    today = _today_of(body.today_iso)
    now = clock.now()
    return week_check_engine.week_check(
        [e.model_dump() for e in body.events], body.week_days, store.load_profile(),
        today=today, today_day=day_of(today), now_min=body.now_min if body.now_min is not None else now.hour * 60 + now.minute)

class DownscopeBody(BaseModel):
    events: list[CalEvent]
    ids: list[str]
    factor: float = Field(default=0.5, gt=0.1, le=0.9)

@app.post("/api/week-check/downscope")
def api_downscope(body: DownscopeBody):
    return week_check_engine.downscope([e.model_dump() for e in body.events], body.ids, body.factor)

@app.post("/api/recovery")
def api_recovery(body: WeekCheckBody):
    today = _today_of(body.today_iso)
    now = clock.now()
    return week_check_engine.recovery(
        [e.model_dump() for e in body.events], body.week_days, store.load_profile(),
        today=today, today_day=day_of(today), now_min=body.now_min if body.now_min is not None else now.hour * 60 + now.minute)


# ---- weekly reflection, drift review, the weekly chat ---------------------------------------------------

_SNAP_KEY = "weekly.snapshot"
_CHAT_KEY = "weekly.chat"          # only when the last check-in happened: the conversation itself is never stored

@app.get("/api/ai/status")
def ai_status():
    """Is a language model connected? The weekly chat, the otter-voice recap, task tidying and the goal wizard use it;
    everything else (the scheduler, learning, the plain recap) never does."""
    st = llm_access.status()
    ai = llm_access.available("chat")
    return {"llm": ai, "model": "gpt-4o" if ai else None, "gated": st["gated"], "mode": st["mode"], "free_left": st["free_left"]}


@app.get("/api/reflection/weekly")
def api_weekly(today_iso: str | None = None):
    today = _today_of(today_iso)
    p = store.load_profile()
    m = weekly_engine.weekly_metrics(p, today)
    snap = kv.get(_SNAP_KEY)
    if snap is None:                      # first look: remember where the numbers are, ask for nothing
        kv.put(_SNAP_KEY, weekly_engine.snapshot(p))
    return {"metrics": m, "recap": weekly_engine.recap(m), "drift": weekly_engine.drift(p, snap),
            "last_chat": (kv.get(_CHAT_KEY) or {}).get("at")}

class NarrateBody(BaseModel):
    today_iso: str | None = None

@app.post("/api/reflection/weekly/narrate")
def api_weekly_narrate(body: NarrateBody):
    """The same recap in the otter's voice. Falls back to the deterministic recap with no key."""
    today = _today_of(body.today_iso)
    m = weekly_engine.weekly_metrics(store.load_profile(), today)
    base = weekly_engine.recap(m)
    if not llm_access.available("narrate") or not m["sessions"]:
        return {**base, "llm": False}
    try:
        with llm_access.feature("narrate"):
            data = _llm_json(
                "You are Otto, a calm otter coach. Rewrite this weekly recap in 2-4 warm, plain sentences. Never guilt, never "
                "invent numbers, keep every number you use exactly. Return JSON: {\"headline\": \"...\", \"body\": \"...\"}.",
                json.dumps({"recap": base, "metrics": {k: m[k] for k in ("sessions", "focus_hours", "versus_plan", "status", "streak_days", "off_track_min", "late_starts")}}))
        return {"headline": str(data.get("headline") or base["headline"])[:120], "body": str(data.get("body") or base["body"])[:900], "llm": True}
    except Exception:
        return {**base, "llm": False}

@app.post("/api/reflection/drift/ack")
def api_drift_ack():
    """The user has looked at what moved: take a new snapshot so it is not raised again."""
    kv.put(_SNAP_KEY, weekly_engine.snapshot(store.load_profile()))
    return {"ok": True}

# ---- whose OpenAI key pays ------------------------------------------------------------------------------

@app.get("/api/llm/status")
def api_llm_status():
    return llm_access.status()

class LLMKeyBody(BaseModel):
    key: str = Field(min_length=20, max_length=300)

@app.put("/api/llm/key")
def api_llm_key(body: LLMKeyBody):
    """Save the person's own OpenAI key (checked with OpenAI first, stored encrypted, never returned)."""
    key = body.key.strip()
    if not _re.match(r"^sk-[A-Za-z0-9_\-]{16,}$", key):
        raise HTTPException(422, detail="That does not look like an OpenAI key (it starts with sk-).")
    try:
        llm_access.check_key(key)
        llm_access.save_key(key)
    except llm_access.Blocked as b:
        raise HTTPException(b.status, detail=b.message)
    return llm_access.status()

@app.delete("/api/llm/key")
def api_llm_key_remove():
    llm_access.remove_key()
    return llm_access.status()

class ChatRulesBody(BaseModel):
    text: str = Field(min_length=1, max_length=2000)

def _chat_context(p: Profile) -> dict:
    m = weekly_engine.weekly_metrics(p, clock.today())
    return {
        "week": {k: m[k] for k in ("sessions", "focus_hours", "versus_plan", "status", "streak_days", "late_starts", "off_track_min", "energy_avg", "reflections")},
        "patterns_found": patterns_engine.found(p),
        "earlier_check_ins": summaries_engine.brief(kv.get(summaries_engine.KEY)),
        "settings_now": {
            "day_start_min": p.day_start_min, "day_end_min": p.day_end_min, "peak_window": list(p.peak_window), "planning_bias": p.planning_bias,
            "focus_span_min": p.focus_span_min, "max_deep_run_min": p.max_deep_run_min, "break_min": p.break_min,
            "recovery_after_meeting": p.recovery_after_meeting, "post_meal_slump_min": p.post_meal_slump_min,
            "batching_preference": p.batching_preference, "gym_first": p.gym_first,
        },
    }

@app.post("/api/chat/rules")
def api_chat_rules(body: ChatRulesBody):
    """Reflection in, proposed adjustments out. Nothing is applied until the user confirms (/api/chat/rules/apply).
    Adjustments are either things they said outright or small changes Otto infers from how the week went."""
    p = store.load_profile()
    reply, follow_up, rules, via = "", "", [], "keywords"
    if llm_access.available("chat"):
        try:
            with llm_access.feature("chat"):
                data = _llm_json(chat_engine.SYSTEM, json.dumps({"user_said": body.text, **_chat_context(p)}))
            rules = chat_engine.validate(p, data.get("rules") or [])
            reply, follow_up, via = str(data.get("reply") or "")[:400], str(data.get("follow_up") or "")[:240], "llm"
        except Exception:
            rules = []
    if not rules and via != "llm":
        rules = chat_engine.validate(p, chat_engine.keyword_rules(body.text) + chat_engine.infer_rules(body.text, p))
    if not reply:
        reply = ("Here is what I would change, and why. Tick the ones you agree with." if rules
                 else "I could not turn that into a change yet. Tell me what happened, e.g. \"I got everything done but slept less\" or \"I focus best from 9 to 12\".")
    return {"reply": reply, "follow_up": follow_up, "rules": rules, "via": via}

class ChatRuleBody(StatedRuleBody):
    label: str = ""
    source: str = ""
    reason: str = ""

class ApplyRulesBody(BaseModel):
    rules: list[ChatRuleBody]

@app.post("/api/chat/rules/apply")
def api_chat_rules_apply(body: ApplyRulesBody):
    applied, rejected = [], []
    with store.locked_profile() as p:
        for r in body.rules:
            try:
                learning.set_stated_rule(p, r.key, r.value, r.note)
                applied.append(r.key)
            except ValueError as e:
                rejected.append({"key": r.key, "error": str(e)})
        learned = _learned(p)
    if applied:                      # keep what was decided, not what was said
        done = [r for r in body.rules if r.key in applied]
        labels = [r.label or r.key for r in done]
        entry = summaries_engine.make("weekly_chat", "Changed " + "; ".join(labels) + ".", [r.model_dump() for r in done])
        kv.put(summaries_engine.KEY, summaries_engine.add(kv.get(summaries_engine.KEY), entry))
    kv.put(_CHAT_KEY, {"at": clock.now().isoformat(timespec="minutes")})
    kv.put(_SNAP_KEY, weekly_engine.snapshot(store.load_profile()))      # a chat counts as the review
    return {"applied": applied, "rejected": rejected, "learned": learned, "replan": any(k in chat_engine.REPLAN_KEYS for k in applied)}

@app.get("/api/chat/history")
def api_chat_history():
    """When the last check-in was, and the summaries of the recent ones. (Older versions stored every message: that is dropped.)"""
    hist = kv.get(_CHAT_KEY) or {}
    if "messages" in hist:
        hist = {k: v for k, v in hist.items() if k != "messages"}
        kv.put(_CHAT_KEY, hist)
    sums = kv.get(summaries_engine.KEY) or []
    return {"at": hist.get("at"), "summaries": sums[-5:], "opener": summaries_engine.recap_line(sums[-1]) if sums else None}

class SummaryBody(BaseModel):
    kind: Literal["weekly_chat", "goal_review"]
    text: str = Field(min_length=1, max_length=400)
    items: list[dict] = Field(default_factory=list, max_length=12)

@app.post("/api/summaries")
def api_add_summary(body: SummaryBody):
    """The goal wizard records what the user approved. Only a short summary is kept, never the conversation."""
    entry = summaries_engine.make(body.kind, body.text, body.items)
    kv.put(summaries_engine.KEY, summaries_engine.add(kv.get(summaries_engine.KEY), entry))
    return entry

@app.get("/api/summaries")
def api_summaries():
    return {"summaries": list(reversed(kv.get(summaries_engine.KEY) or []))}


# ---- async task enrichment -----------------------------------------------------------------------------

_ENRICH_KEY = "enrich.quota"

class EnrichTask(BaseModel):
    id: str
    text: str

class EnrichBody(BaseModel):
    tasks: list[EnrichTask] = Field(max_length=10)
    today_iso: str | None = None

@app.post("/api/tasks/enrich")
def api_enrich(body: EnrichBody):
    """One batched call for the tasks that are long enough to be worth it, at most 5 per week."""
    today = _today_of(body.today_iso)
    week = (today - timedelta(days=today.weekday())).isoformat()
    q = kv.get(_ENRICH_KEY) or {}
    used = q.get("used", 0) if q.get("week") == week else 0
    asked = {t.id: t.text for t in body.tasks if enrich_engine.needs_enrichment(t.text)}
    left = enrich_engine.WEEKLY_QUOTA - used
    skipped = [i for i in asked if left <= 0]
    asked = dict(list(asked.items())[: max(left, 0)])
    if not asked:
        return {"enriched": [], "quota_left": max(left, 0), "reason": "quota" if skipped else "short"}
    if not llm_access.available("enrich"):
        return {"enriched": [], "quota_left": max(left, 0), "reason": "no_key"}
    try:
        with llm_access.feature("enrich"):
            data = _llm_json(enrich_engine.SYSTEM, json.dumps({"tasks": [{"id": i, "text": t} for i, t in asked.items()]}))
    except HTTPException:
        raise
    except Exception:
        return {"enriched": [], "quota_left": max(left, 0), "reason": "failed"}
    rows = enrich_engine.clean(data, asked)
    kv.put(_ENRICH_KEY, {"week": week, "used": used + len(rows)})
    return {"enriched": rows, "quota_left": max(left - len(rows), 0), "reason": None}


# ---- Google Calendar (read-only; needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) ---------------------------

from fastapi.responses import RedirectResponse
from app.sources import gcal

@app.get("/api/gcal/status")
def gcal_status():
    return gcal.status()

@app.get("/api/gcal/auth-url")
def gcal_auth_url():
    try:
        return {"url": gcal.auth_url()}
    except gcal.NotConfigured as e:
        raise HTTPException(503, detail=str(e))

@app.get("/api/gcal/callback")
def gcal_callback(code: str = "", state: str = "", error: str = ""):
    if error or not code:
        return RedirectResponse("/?gcal=denied")
    token = auth.current_user.set(state.split("~", 1)[0] if "~" in state else auth.LOCAL)      # the state says whose connection this is
    try:
        gcal.exchange(code, state)
    except (gcal.NotConfigured, ValueError, RuntimeError):
        return RedirectResponse("/?gcal=failed")
    finally:
        auth.current_user.reset(token)
    return RedirectResponse("/?gcal=connected")

@app.get("/api/gcal/events")
def gcal_events(start: str, end: str):
    try:
        a, b = date.fromisoformat(start[:10]), date.fromisoformat(end[:10])
    except ValueError:
        raise HTTPException(422, detail="start and end must be ISO dates")
    if b < a or (b - a).days > 31:
        raise HTTPException(422, detail="ask for at most 31 days")
    try:
        return {"events": gcal.fetch_events(a, b)}
    except gcal.NotConfigured as e:
        raise HTTPException(503, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(502, detail=str(e))

@app.post("/api/gcal/disconnect")
def gcal_disconnect():
    gcal.disconnect()
    return {"ok": True}


# ---- SPA static file serving ---------------------------------------------

_DIST = Path(__file__).parent.parent.parent / "frontend" / "dist"

if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")

@app.get("/{path:path}")
def spa_fallback(path: str):
    candidate = _DIST / path
    if candidate.is_file():
        return FileResponse(str(candidate))
    return FileResponse(str(_DIST / "index.html"))
