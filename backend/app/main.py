"""FastAPI app. Engine endpoints are deterministic (no LLM, work without keys).
LLM endpoints are the ears/mouth only.

  POST /api/profile    resume_text        -> Profile
  POST /api/goal       jd_text            -> Goal
  POST /api/plan       profile+goals+walls-> Plan (blocks, at_risk, tradeoff)
  POST /api/reshuffle  plan+completed+missed -> Plan + narration
  POST /api/chat       plan+message       -> narration (+ maybe re-plan)
  GET  /api/health
  GET  /api/demo       -> the seeded demo payload (resume, jd, walls)
  GET  /api/resources  skill+role       -> list of curated resources (Exa)
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import io

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.engine.gaps import derive_tasks
from app.engine.feasibility import assess
from app.engine.scheduler import schedule
from app.llm.extract import parse_resume, parse_jd, narrate, direction_review
from app.models import Goal, Profile, Skill, Status, Task, Wall
from app.sources.resources import fetch_resources

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
    return Profile(
        skills=[Skill(**s) for s in d.get("skills", [])],
        free_hours_per_day=d.get("free_hours_per_day", 3.0),
        walls=[Wall(**w) for w in d.get("walls", [])],
        velocity=d.get("velocity", 0.8),
    )

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

@app.get("/api/resources")
def get_resources(skill: str, role: str):
    return [r.to_dict() for r in fetch_resources(skill, role)]

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
    profile_id = None
    if body.user_id and goals:
        try:
            from app.db_helpers import save_plan
            save_plan(body.user_id, profile, goals[0], tasks, result)
            from app.database import get_supabase
            sb = get_supabase()
            row = sb.table("profiles").select("id").eq("session_id", body.user_id).execute()
            if row.data:
                profile_id = row.data[0]["id"]
        except Exception as e:
            print(f"[db] save_plan failed (non-fatal): {e}")
    resp = {"plan": result.to_dict(), "tasks": [t.to_dict() for t in tasks]}
    if profile_id:
        resp["profile_id"] = profile_id
    return resp

@app.get("/api/me/telegram-status")
def telegram_status(user_id: str):
    try:
        from app.database import get_supabase
        sb = get_supabase()
        row = sb.table("profiles").select("telegram_chat_id").eq("session_id", user_id).execute()
        if row.data and row.data[0].get("telegram_chat_id"):
            return {"linked": True}
    except Exception:
        pass
    return {"linked": False}

@app.post("/api/reshuffle")
def reshuffle(body: ReshuffleBody):
    profile = _profile_from(body.profile)
    goals = _goals_from(body.goals)
    tasks = _all_tasks(profile, goals)
    missed = set(body.missed_task_ids)
    for t in tasks:
        if t.id in missed:
            t.status = Status.MISSED
    result  = assess(tasks, profile, goals, body.deadline_day)
    summary = result.to_dict()
    # Build narration without an LLM call so the response is instant.
    # The Recovery view already provides emotional context; this just states what moved.
    n_at_risk = len(summary.get("at_risk", []))
    if summary.get("tradeoff"):
        msg = summary["tradeoff"]["reason"]
    elif n_at_risk:
        msg = (f"Rebuilt your week. {n_at_risk} lower-priority task(s) pushed to "
               "the at-risk list so your highest-priority work stays protected.")
    else:
        msg = "Rebuilt your week — everything fits before your deadline."
    return {"plan": summary, "narration": msg,
            "tasks": [t.to_dict() for t in tasks]}

@app.post("/api/chat")
def chat(body: ChatBody):
    goals = _goals_from(body.goals) if body.goals else []
    review = direction_review([], goals[0]) if goals else ""
    return {"narration": narrate(body.message, body.plan_summary), "review": review}

# ---- Google Calendar endpoints --------------------------------------------

from fastapi.responses import RedirectResponse

@app.get("/api/google/status")
def google_status(user_id: str):
    from app.google_auth import is_connected
    return {"connected": is_connected(user_id)}

@app.get("/api/google/auth-url")
def google_auth_url(user_id: str):
    from app.google_auth import get_auth_url
    return {"url": get_auth_url(user_id)}

@app.get("/api/google/callback")
def google_callback(code: str, state: str):
    from app.google_auth import exchange_code, FRONTEND_URL
    exchange_code(code, user_id=state)
    return RedirectResponse(f"{FRONTEND_URL}?google=connected")

@app.get("/api/google/walls")
def google_walls(user_id: str):
    from app.google_auth import get_walls
    return {"walls": get_walls(user_id)}

@app.delete("/api/google/disconnect")
def google_disconnect(user_id: str):
    from app.google_auth import disconnect
    disconnect(user_id)
    return {"ok": True}

# ---- AI: smart reschedule & goal review ----------------------------------
#
# Require OPENAI_API_KEY in backend/.env  (EXA_API_KEY optional for richer goal review)
# Both endpoints degrade gracefully: 503 lets the frontend fall back to client-side logic.

class CalEvent(BaseModel):
    id: str
    title: str
    day: int          # June date 22-28
    startMin: int     # minutes from midnight, multiples of 15
    durationMin: int
    color: str = ""   # optional — frontend derives display color from category
    category: str
    fixed: bool = False

class RescheduleRequest(BaseModel):
    events: list[CalEvent]
    pinned_ids: list[str]   # IDs user explicitly moved — must stay put

class RescheduleResponse(BaseModel):
    events: list[dict]
    conflicts: list[str]    # IDs the AI couldn't place ideally
    explanation: str

_RESCHEDULE_SYSTEM = """\
You are an expert personal productivity scheduler for a solo job-seeker.
The week is Mon 22 Jun – Sun 28 Jun 2026 (day integers 22-28).

━━━ ABSOLUTE HARD RULES (violating any = wrong answer) ━━━
1. Events in pinned_ids: NEVER change their day or startMin. Copy them exactly.
2. Events with fixed=true: NEVER change their day or startMin. Copy them exactly.
3. Zero overlaps on any day: for any two events on the same day,
   (earlier.startMin + earlier.durationMin) <= later.startMin
4. Every startMin must be a multiple of 15.
5. Every event must sit inside [480, 1380) minutes (08:00–23:00).
6. Return ALL events — never drop one.

━━━ DISTRIBUTION RULE (most important scheduling goal) ━━━
SPREAD events across the whole week. Do NOT cluster flexible events onto one day.
Target load per day: 2–3 events. Hard cap: 4 events per day maximum.
If moving an event to a day would push that day over 4 events, pick a different day.
Empty days are wasted capacity — fill them before adding a 4th event to any day.

━━━ PRODUCTIVITY PATTERN (apply after distribution) ━━━
Category → optimal time of day:
  gym / life    → earliest morning slot available (before 09:00 ideally)
  leetcode      → 08:00–12:00 (needs fresh focus)
  llm / system-design / deep work → 09:00–13:00 (peak cognitive window)
  interview     → whenever fixed/pinned dictates; otherwise morning
  admin / life  → 13:00–18:00 (lower cognitive load tasks)

On any day that already has a gym event → schedule it first, then put all
deep-work (llm, leetcode, system-design) next, then admin last.
This gym-first pattern produces ~90% efficiency on those days — preserve it.

Do NOT stack more than 3 hours of deep-work without at least a 15-min gap.

━━━ OUTPUT FORMAT ━━━
Return valid JSON only — no markdown, no explanation outside the JSON:
{
  "events": [ /* ALL events; each must have every original field plus updated day & startMin */ ],
  "conflicts": [ /* ids of events you could not place without a compromise */ ],
  "explanation": "One sentence: what you changed and why (mention specific days)."
}"""


def _build_day_load(events: list) -> str:
    """Return a human-readable summary of how many events are on each day."""
    counts: dict[int, list[str]] = {d: [] for d in range(22, 29)}
    for e in events:
        if e.day in counts:
            counts[e.day].append(f"{e.title}({e.category})")
    day_names = {22:"Mon", 23:"Tue", 24:"Wed", 25:"Thu", 26:"Fri", 27:"Sat", 28:"Sun"}
    lines = []
    for d, items in counts.items():
        tag = " ← HEAVY" if len(items) >= 4 else (" ← light" if len(items) <= 1 else "")
        lines.append(f"  {day_names[d]} {d}: {len(items)} events{tag}  [{', '.join(items) or 'empty'}]")
    return "\n".join(lines)


@app.post("/api/ai/reschedule", response_model=RescheduleResponse)
def ai_reschedule(body: RescheduleRequest):
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise HTTPException(503, detail="OPENAI_API_KEY not configured")
    try:
        from openai import OpenAI as _OAI
        c = _OAI(api_key=key)
    except Exception as e:
        raise HTTPException(503, detail=str(e))

    day_load = _build_day_load(body.events)
    events_json = json.dumps([e.model_dump() for e in body.events], indent=2)

    user_msg = (
        f"Pinned IDs (must not move at all): {body.pinned_ids}\n\n"
        f"Current day load BEFORE your reschedule:\n{day_load}\n\n"
        f"Full event list:\n{events_json}\n\n"
        "Redistribute flexible events so the week is balanced (2–3 events/day). "
        "Apply the productivity patterns (gym-first days, deep-work in the morning). "
        "Move events to lighter days before adding a 4th event to any day."
    )

    r = c.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _RESCHEDULE_SYSTEM},
            {"role": "user",   "content": user_msg},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=3000,
    )
    data = json.loads(r.choices[0].message.content)

    # Sanity-check: reject if AI dropped events
    returned_ids = {e["id"] for e in data.get("events", [])}
    sent_ids     = {e.id for e in body.events}
    if returned_ids != sent_ids:
        # AI dropped or invented events — fall back by returning input unchanged
        raise HTTPException(500, detail=f"AI returned wrong event set: missing={sent_ids-returned_ids}")

    return RescheduleResponse(**data)


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


# ---- AI: smart reschedule & goal review ----------------------------------
#
# Require OPENAI_API_KEY in backend/.env  (EXA_API_KEY optional for richer goal review)
# Both endpoints degrade gracefully: 503 lets the frontend fall back to client-side logic.

class CalEvent(BaseModel):
    id: str
    title: str
    day: int          # June date 22-28
    startMin: int     # minutes from midnight, multiples of 15
    durationMin: int
    color: str = ""   # optional — frontend derives display color from category
    category: str
    fixed: bool = False

class RescheduleRequest(BaseModel):
    events: list[CalEvent]
    pinned_ids: list[str]   # IDs user explicitly moved — must stay put

class RescheduleResponse(BaseModel):
    events: list[dict]
    conflicts: list[str]    # IDs the AI couldn't place ideally
    explanation: str

_RESCHEDULE_SYSTEM = """\
You are an expert personal productivity scheduler for a solo job-seeker.
The week is Mon 22 Jun – Sun 28 Jun 2026 (day integers 22-28).

━━━ ABSOLUTE HARD RULES (violating any = wrong answer) ━━━
1. Events in pinned_ids: NEVER change their day or startMin. Copy them exactly.
2. Events with fixed=true: NEVER change their day or startMin. Copy them exactly.
3. Zero overlaps on any day: for any two events on the same day,
   (earlier.startMin + earlier.durationMin) <= later.startMin
4. Every startMin must be a multiple of 15.
5. Every event must sit inside [480, 1380) minutes (08:00–23:00).
6. Return ALL events — never drop one.

━━━ DISTRIBUTION RULE (most important scheduling goal) ━━━
SPREAD events across the whole week. Do NOT cluster flexible events onto one day.
Target load per day: 2–3 events. Hard cap: 4 events per day maximum.
If moving an event to a day would push that day over 4 events, pick a different day.
Empty days are wasted capacity — fill them before adding a 4th event to any day.

━━━ PRODUCTIVITY PATTERN (apply after distribution) ━━━
Category → optimal time of day:
  gym / life    → earliest morning slot available (before 09:00 ideally)
  leetcode      → 08:00–12:00 (needs fresh focus)
  llm / system-design / deep work → 09:00–13:00 (peak cognitive window)
  interview     → whenever fixed/pinned dictates; otherwise morning
  admin / life  → 13:00–18:00 (lower cognitive load tasks)

On any day that already has a gym event → schedule it first, then put all
deep-work (llm, leetcode, system-design) next, then admin last.
This gym-first pattern produces ~90% efficiency on those days — preserve it.

Do NOT stack more than 3 hours of deep-work without at least a 15-min gap.

━━━ OUTPUT FORMAT ━━━
Return valid JSON only — no markdown, no explanation outside the JSON:
{
  "events": [ /* ALL events; each must have every original field plus updated day & startMin */ ],
  "conflicts": [ /* ids of events you could not place without a compromise */ ],
  "explanation": "One sentence: what you changed and why (mention specific days)."
}"""


def _build_day_load(events: list) -> str:
    """Return a human-readable summary of how many events are on each day."""
    counts: dict[int, list[str]] = {d: [] for d in range(22, 29)}
    for e in events:
        if e.day in counts:
            counts[e.day].append(f"{e.title}({e.category})")
    day_names = {22:"Mon", 23:"Tue", 24:"Wed", 25:"Thu", 26:"Fri", 27:"Sat", 28:"Sun"}
    lines = []
    for d, items in counts.items():
        tag = " ← HEAVY" if len(items) >= 4 else (" ← light" if len(items) <= 1 else "")
        lines.append(f"  {day_names[d]} {d}: {len(items)} events{tag}  [{', '.join(items) or 'empty'}]")
    return "\n".join(lines)


@app.post("/api/ai/reschedule", response_model=RescheduleResponse)
def ai_reschedule(body: RescheduleRequest):
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise HTTPException(503, detail="OPENAI_API_KEY not configured")
    try:
        from openai import OpenAI as _OAI
        c = _OAI(api_key=key)
    except Exception as e:
        raise HTTPException(503, detail=str(e))

    day_load = _build_day_load(body.events)
    events_json = json.dumps([e.model_dump() for e in body.events], indent=2)

    user_msg = (
        f"Pinned IDs (must not move at all): {body.pinned_ids}\n\n"
        f"Current day load BEFORE your reschedule:\n{day_load}\n\n"
        f"Full event list:\n{events_json}\n\n"
        "Redistribute flexible events so the week is balanced (2–3 events/day). "
        "Apply the productivity patterns (gym-first days, deep-work in the morning). "
        "Move events to lighter days before adding a 4th event to any day."
    )

    r = c.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _RESCHEDULE_SYSTEM},
            {"role": "user",   "content": user_msg},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=3000,
    )
    data = json.loads(r.choices[0].message.content)

    # Sanity-check: reject if AI dropped events
    returned_ids = {e["id"] for e in data.get("events", [])}
    sent_ids     = {e.id for e in body.events}
    if returned_ids != sent_ids:
        # AI dropped or invented events — fall back by returning input unchanged
        raise HTTPException(500, detail=f"AI returned wrong event set: missing={sent_ids-returned_ids}")

    return RescheduleResponse(**data)


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
