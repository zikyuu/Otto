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
from app.llm.extract import parse_resume, parse_jd, narrate, direction_review
from datetime import date, datetime

from pydantic import ConfigDict, Field

from app import store
from app.engine.calendar_bridge import reschedule_events, to_category
from app.engine import learning
from app.engine.learning import add_energy_log, add_off_track, apply_all_signals
from app.models import (
    EnergyLog, Goal, OffTrackLog, PriorityWindow, Profile, ReflectionChoice, Status, Task, TaskReflection,
)

DEMO = json.loads((Path(__file__).parent / "demo_data" / "demo.json").read_text())

app = FastAPI(title="Otto")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])



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
    return {"ok": True, "openai_key": bool(os.getenv("OPENAI_API_KEY"))}

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
    review = direction_review([], goals[0]) if goals else ""
    return {"narration": narrate(body.message, body.plan_summary), "review": review}

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
    now = datetime.now()
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

@app.get("/api/learning")
def get_learning():
    return _learned(store.load_profile())

@app.post("/api/learning/reflection")
def post_reflection(body: ReflectionBody):
    ts = body.ts or datetime.now().isoformat(timespec="minutes")
    reflection = TaskReflection(
        task_id=body.task_id, ts=ts, choice=body.choice,
        planned_minutes=body.planned_minutes, actual_minutes=body.actual_minutes,
        category=to_category(body.category).value,
    )
    with store.locked_profile() as p:
        apply_all_signals(p, reflection)
        return _learned(p)

@app.post("/api/learning/off-track")
def post_off_track(body: OffTrackBody):
    ts = body.ts or datetime.now().isoformat(timespec="minutes")
    log = OffTrackLog(ts=ts, duration_min=body.duration_min, reason=body.reason,
                      task_id=body.task_id, into_task_min=body.into_task_min)
    with store.locked_profile() as p:
        add_off_track(p, log)
        return _learned(p)

@app.post("/api/learning/energy")
def post_energy(body: EnergyBody):
    ts = body.ts or datetime.now().isoformat(timespec="minutes")
    with store.locked_profile() as p:
        add_energy_log(p, EnergyLog(ts=ts, level=body.level, after_meeting_min=body.after_meeting_min))
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
    ts = body.ts or datetime.now().isoformat(timespec="minutes")
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
    title: str
    effort_h: float = 0
    due: str = ""
    done: bool = False
    pct_when_done: float = 0           # overall % the goal reaches once this milestone is done

class ReviewDetour(BaseModel):
    date: str = ""
    type: str = "sidetrack"            # sidetrack | roadblock | pivot
    text: str = ""
    impact_days: float = 0

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

class GoalReviewResponse(BaseModel):
    feasibility: Literal["on-track", "at-risk", "infeasible"]
    summary: str
    goals: list[GoalAdvice]
    exa_grounded: bool = False

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
      "suggested_target_date": "<ISO date or null>"
    }
  ]
}"""

def _exa_goal_context(titles: list[str]) -> str:
    api_key = os.environ.get("EXA_API_KEY")
    if not api_key:
        return ""
    try:
        from exa_py import Exa  # type: ignore
        client = Exa(api_key=api_key)
        blobs: list[str] = []
        for title in titles[:3]:
            res = client.search_and_contents(
                f"realistic timeline how long to {title} self-study 2025",
                num_results=2, text={"max_characters": 800},
            )
            for r in res.results:
                blobs.append(getattr(r, "text", "") or "")
        return " ".join(blobs)[:4000]
    except Exception:
        return ""

def _llm_json(system: str, user: str) -> dict:
    """One JSON-mode chat call. Isolated so tests can replace it."""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise HTTPException(503, detail="OPENAI_API_KEY not configured")
    try:
        from openai import OpenAI as _OAI
        c = _OAI(api_key=key)
    except Exception as e:
        raise HTTPException(503, detail=str(e))
    r = c.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"}, temperature=0.35, max_tokens=1800,
    )
    return json.loads(r.choices[0].message.content)

def _goal_brief(g: ReviewGoal) -> str:
    ms = "\n".join(
        f"    - [{'x' if m.done else ' '}] {m.title} ({m.effort_h:g}h, due {m.due or '?'}, goal reaches {m.pct_when_done:g}% when done)"
        for m in g.milestones)
    dt = "\n".join(f"    - {d.date} {d.type}: {d.text} (cost ~{d.impact_days:g} days)" for d in g.detours) or "    (none logged)"
    return (
        f"Goal id={g.id}: {g.title} [{g.cat}]\n"
        f"  Started {g.start_date or '?'}, target {g.target_date or '?'}\n"
        f"  Progress {g.progress_pct:.0f}% vs {g.expected_pct:.0f}% expected today (status: {g.status})\n"
        f"  {g.hours_remaining:g}h of work left; needs {g.required_hours_per_week:.1f}h/week, user gives {g.hours_per_week:g}h/week; "
        f"projected finish {g.projected_finish or 'unknown'}\n"
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

def _clean_review(data: dict, goals: list[ReviewGoal], today: date, exa: bool) -> GoalReviewResponse:
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
        out.append(GoalAdvice(
            id=g.id, verdict=verdict, headline=str(x.get("headline") or "").strip() or "No comment from the wizard on this one.",
            advice=advice[:5], reroute=reroute[:5],
            suggested_target_date=_valid_future_date(x.get("suggested_target_date"), today) if verdict != "on-track" else None))
    worst = "infeasible" if any(a.verdict == "impossible" for a in out) else "at-risk" if any(a.verdict == "at-risk" for a in out) else "on-track"
    return GoalReviewResponse(feasibility=worst, summary=str(data.get("summary") or "").strip(), goals=out, exa_grounded=exa)

@app.post("/api/ai/review-goals", response_model=GoalReviewResponse)
def ai_review_goals(body: GoalReviewRequest):
    try:
        today = date.fromisoformat(body.today[:10]) if body.today else date.today()
    except ValueError:
        raise HTTPException(422, detail="today must be an ISO date")
    exa_ctx = _exa_goal_context([g.title for g in body.goals])
    exa_block = f"\n\nLive signal from Exa:\n{exa_ctx}" if exa_ctx else ""
    user_msg = (f"Today is {today.isoformat()}.\n\n" + "\n\n".join(_goal_brief(g) for g in body.goals)
                + exa_block + "\n\nReview every goal. Be specific about the most at-risk one.")
    data = _llm_json(_GOAL_REVIEW_SYSTEM, user_msg)
    return _clean_review(data, body.goals, today, bool(exa_ctx))


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
