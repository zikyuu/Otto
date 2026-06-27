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

from fastapi import FastAPI, File, UploadFile, HTTPException
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

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

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

@app.get("/{path:path}")
def spa(path: str):
    if path == "api" or path.startswith("api/"):
        raise HTTPException(status_code=404)
    if FRONTEND_DIST.exists():
        file_path = FRONTEND_DIST / path if path else FRONTEND_DIST / "index.html"
        if path and file_path.is_file():
            return FileResponse(file_path)
        index = FRONTEND_DIST / "index.html"
        if index.exists():
            return FileResponse(index)
    raise HTTPException(status_code=404)
