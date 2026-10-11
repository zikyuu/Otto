"""FastAPI app. Engine endpoints are deterministic (no LLM, work without keys).
LLM endpoints are the ears/mouth only.

  POST /api/profile    resume_text        -> Profile
  POST /api/goal       jd_text            -> Goal
  POST /api/plan       profile+goals      -> Plan (blocks, at_risk, tradeoff)
  POST /api/reshuffle  plan+completed+missed -> Plan + narration
  POST /api/schedule   calendar events + pinned ids -> re-placed events (engine, NO LLM)
  POST /api/learning/reflection | /energy   learning signals -> updated profile
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
from app.engine.learning import add_energy_log, apply_all_signals
from app.models import EnergyLog, Goal, Profile, ReflectionChoice, Status, Task, TaskReflection

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

class ScheduleRequest(BaseModel):
    events: list[CalEvent]
    pinned_ids: list[str] = []      # events the user just moved — must stay put
    week_days: list[int] = Field(min_length=7, max_length=7)  # date-of-month for Mon..Sun
    week_start_iso: str | None = None   # ISO date of Monday; enables real deadlines + "don't schedule the past"
    mode: str = "displaced"         # "displaced" = only fix what the change broke · "full" = re-optimise all flexible

class ScheduleResponse(BaseModel):
    events: list[dict]
    conflicts: list[str]            # events the engine couldn't place cleanly / that break prereq order
    moved: list[str]
    explanation: str

@app.post("/api/schedule", response_model=ScheduleResponse)
def api_schedule(body: ScheduleRequest):
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
        now_min=now.hour * 60 + now.minute, mode=body.mode,
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

class EnergyBody(BaseModel):
    level: int = Field(ge=1, le=5)
    ts: str | None = None            # defaults to now

def _learned(p: Profile) -> dict:
    return {
        "avg_velocity": p.avg_velocity,
        "peak_window": list(p.peak_window),
        "completion_rate": p.completion_rate,
        "energy_logs": len(p.energy_logs),
        "reflections": len(p.reflections),
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

@app.post("/api/learning/energy")
def post_energy(body: EnergyBody):
    ts = body.ts or datetime.now().isoformat(timespec="minutes")
    with store.locked_profile() as p:
        add_energy_log(p, EnergyLog(ts=ts, level=body.level))
        return _learned(p)


class GoalInput(BaseModel):
    id: str
    title: str
    cat: str
    pct: int
    label: str
    subnote: str
    direction: str
    subs: list[dict]

class GoalReviewRequest(BaseModel):
    goals: list[GoalInput]
    timeline_weeks: int = 8

class GoalReviewResponse(BaseModel):
    feasibility: str        # "on-track" | "at-risk" | "infeasible"
    summary: str
    timeline_analysis: str
    focus_recommendation: str
    suggested_adjustments: list[str]
    exa_grounded: bool = False

_GOAL_REVIEW_SYSTEM = """\
You are a direct, evidence-based productivity coach reviewing a learner's goal portfolio.
Be honest and specific — reference the actual numbers in their progress.

Determine feasibility:
• "on-track"   — current pace × weeks remaining covers remaining work
• "at-risk"    — possible but needs significant acceleration or scope cut
• "infeasible" — mathematically impossible at current pace without a major change

Also judge whether they are focused on the RIGHT activities for the outcome they want.
Example: a developer prepping for ML engineering shouldn't spend all time on syntax —
they need retrieval pipelines, evals, and live system-design practice.
Call out the most important specific gap.

Return valid JSON only (no markdown fences):
{
  "feasibility": "on-track|at-risk|infeasible",
  "summary": "<2-3 sentences: honest overall assessment>",
  "timeline_analysis": "<specific numbers for the most at-risk goal: pace, remaining %, weeks left>",
  "focus_recommendation": "<what to spend more time on; what to cut or de-prioritise>",
  "suggested_adjustments": ["<action 1>", "<action 2>", "<action 3>"]
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

@app.post("/api/ai/review-goals", response_model=GoalReviewResponse)
def ai_review_goals(body: GoalReviewRequest):
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise HTTPException(503, detail="OPENAI_API_KEY not configured")
    try:
        from openai import OpenAI as _OAI
        c = _OAI(api_key=key)
    except Exception as e:
        raise HTTPException(503, detail=str(e))
    goals_txt = "\n\n".join(
        f"Goal: {g.title} ({g.cat})\n"
        f"Progress: {g.label} ({g.pct}%)\n"
        f"Subtasks done: {sum(1 for s in g.subs if s.get('done'))}/{len(g.subs)}\n"
        f"Direction note: {g.direction}\n"
        f"Subtasks: {', '.join(s['t'] + (' ✓' if s.get('done') else '') for s in g.subs)}"
        for g in body.goals
    )
    exa_ctx = _exa_goal_context([g.title for g in body.goals])
    exa_block = f"\n\nLive signal from Exa:\n{exa_ctx}" if exa_ctx else ""
    user_msg = (
        f"Timeline: {body.timeline_weeks} weeks remaining.\n\n"
        f"{goals_txt}{exa_block}\n\n"
        "Review feasibility and focus. Be specific about the most at-risk goal."
    )
    r = c.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _GOAL_REVIEW_SYSTEM},
            {"role": "user",   "content": user_msg},
        ],
        response_format={"type": "json_object"},
        temperature=0.35,
        max_tokens=1200,
    )
    data = json.loads(r.choices[0].message.content)
    return GoalReviewResponse(**data, exa_grounded=bool(exa_ctx))


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
