"""FastAPI app. Engine endpoints are deterministic (no LLM, work without keys).
LLM endpoints are the ears/mouth only.

  POST /api/profile    resume_text        -> Profile
  POST /api/goal       jd_text            -> Goal
  POST /api/plan       profile+goals+walls-> Plan (blocks, at_risk, tradeoff)
  POST /api/reshuffle  plan+completed+missed -> Plan + narration
  POST /api/chat       plan+message       -> narration (+ maybe re-plan)
  GET  /api/health
  GET  /api/demo       -> the seeded demo payload (resume, jd, walls)
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
    user_id: str = ""

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
        name=d.get("name", ""),
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
    if body.user_id and goals:
        try:
            from app.db_helpers import save_plan
            save_plan(body.user_id, profile, goals[0], tasks, result)
        except Exception as e:
            print(f"[db] save_plan failed (non-fatal): {e}")
    return {"plan": result.to_dict(), "tasks": [t.to_dict() for t in tasks]}

@app.get("/api/me/plan")
def get_my_plan(user_id: str):
    try:
        from app.db_helpers import load_plan
        data = load_plan(user_id)
        return data or {}
    except Exception as e:
        print(f"[db] load_plan failed: {e}")
        return {}

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

class AddGoalBody(BaseModel):
    user_id: str
    jd_text: str

@app.get("/api/me/goals")
def get_my_goals(user_id: str):
    try:
        from app.db_helpers import load_plan
        data = load_plan(user_id)
        return data.get("goals", []) if data else []
    except Exception as e:
        print(f"[db] get_my_goals failed: {e}")
        return []

@app.post("/api/me/goals")
def add_my_goal(body: AddGoalBody):
    g = parse_jd(body.jd_text)
    try:
        from app.db_helpers import add_goal_and_rebuild
        return add_goal_and_rebuild(body.user_id, g.title, body.jd_text, g.required_skills, g.fit)
    except Exception as e:
        print(f"[db] add_goal failed: {e}")
        return {"error": str(e)}

@app.delete("/api/me/goals/{goal_id}")
def delete_my_goal(goal_id: str, user_id: str):
    try:
        from app.db_helpers import delete_goal_and_rebuild
        return delete_goal_and_rebuild(user_id, goal_id)
    except Exception as e:
        print(f"[db] delete_goal failed: {e}")
        return {"error": str(e)}

class TaskStatusBody(BaseModel):
    status: str  # "done" | "todo"

@app.patch("/api/tasks/{task_id}/status")
def set_task_status(task_id: str, body: TaskStatusBody):
    try:
        from app.db_helpers import update_task_status
        update_task_status(task_id, body.status)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@app.post("/api/chat")
def chat(body: ChatBody):
    goals = _goals_from(body.goals) if body.goals else []
    review = direction_review([], goals[0]) if goals else ""
    return {"narration": narrate(body.message, body.plan_summary), "review": review}

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
