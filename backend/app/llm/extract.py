"""LLM layer — the EARS and MOUTH only. Never the brain.

ears:  resume_text -> Profile,  jd_text -> Goal (skill extraction)
mouth: explain what the engine decided, in plain English

Every function has a deterministic fallback so the whole app runs with NO API
key tonight. Tomorrow, set OPENAI_API_KEY and the real extraction/narration
takes over. The engine endpoints never call this module.
"""
from __future__ import annotations

import json
import os
import re

from dotenv import load_dotenv

from app.models import Goal, Profile, Skill, Task

load_dotenv()

try:
    from openai import OpenAI
except Exception:
    OpenAI = None

_client = None
if OpenAI is not None and os.getenv("OPENAI_API_KEY"):
    _client = OpenAI()

MODEL = "gpt-4o-mini"

# Known skills we can match in fallback mode (keyword extraction).
_KNOWN = ["python", "data structures", "algorithms", "system design", "sql",
          "apis", "testing", "portfolio project", "java", "react", "docker"]


def _kw_extract(text: str) -> list[str]:
    low = text.lower()
    return [s for s in _KNOWN if s in low]


def _normalize_skill_name(name: str) -> str:
    name = name.lower().strip()
    return _SKILL_SYNONYMS.get(name, name)


def parse_resume(resume_text: str) -> Profile:
    """resume -> Profile with skills. LLM if available, else keyword match."""
    if _client:
        try:
            r = _client.chat.completions.create(
                model=MODEL, temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content":
                     "Extract skills from this resume. Return JSON: "
                     '{"skills":[{"name":<str>,"proficiency":0-3}]}. '
                     "Use these exact skill names where possible: data structures, "
                     "algorithms, system design, sql, apis, python, testing, "
                     "portfolio project. "
                     "Proficiency: 3=strong/professional, 2=solid, 1=basic."},
                    {"role": "user", "content": resume_text[:6000]},
                ],
            )
            data = json.loads(r.choices[0].message.content)
            skills = [Skill(id=str(i), name=_normalize_skill_name(s["name"]),
                            proficiency=int(s.get("proficiency", 1)))
                      for i, s in enumerate(data.get("skills", []))]
            return Profile(skills=skills)
        except Exception:
            pass
    skills = [Skill(id=str(i), name=n, proficiency=2) for i, n in enumerate(_kw_extract(resume_text))]
    return Profile(skills=skills)


_SKILL_SYNONYMS: dict[str, str] = {
    "dsa": "data structures",
    "ds&a": "data structures",
    "data structures and algorithms": "data structures",
    "algo": "algorithms",
    "algorithm": "algorithms",
    "sd": "system design",
    "sys design": "system design",
    "systems design": "system design",
    "rest": "apis",
    "rest apis": "apis",
    "rest api": "apis",
    "api design": "apis",
    "api": "apis",
    "db": "sql",
    "database": "sql",
    "databases": "sql",
    "postgresql": "sql",
    "mysql": "sql",
    "test": "testing",
    "unit testing": "testing",
    "tdd": "testing",
}

_VALID_SKILLS = {"data structures", "algorithms", "system design", "sql",
                 "apis", "python", "testing", "portfolio project"}


def _normalize_skills(raw: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for s in raw:
        s = s.lower().strip()
        s = _SKILL_SYNONYMS.get(s, s)
        if s in _VALID_SKILLS and s not in seen:
            seen.add(s)
            result.append(s)
    return result


def parse_jd(jd_text: str, goal_id: str = "job1", title: str = "") -> Goal:
    """JD -> Goal with required_skills. LLM if available, else keyword match."""
    if _client:
        try:
            r = _client.chat.completions.create(
                model=MODEL, temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content":
                     "Extract from this job description. Return JSON: "
                     '{"title":<str>,"required_skills":[<str>]}. '
                     "Only return skills from this list: data structures, "
                     "algorithms, system design, sql, apis, python, testing, "
                     "portfolio project. Use these exact names, lowercase."},
                    {"role": "user", "content": jd_text[:6000]},
                ],
            )
            data = json.loads(r.choices[0].message.content)
            skills = _normalize_skills(data.get("required_skills", []))
            return Goal(id=goal_id, title=data.get("title", title or "Role"),
                        jd_text=jd_text, required_skills=skills,
                        fit=0.8)
        except Exception:
            pass
    return Goal(id=goal_id, title=title or "Role", jd_text=jd_text,
                required_skills=_kw_extract(jd_text), fit=0.8)


def direction_review(tasks: list[Task], goal: Goal) -> str:
    """Compare current task list against live Exa signal; return a grounded one-sentence critique."""
    from app.engine.gaps import _exa_skills  # local import — gaps depends on models, not extract
    exa_skills = _exa_skills(goal)
    if not exa_skills:
        return ""  # no signal available; caller should skip display
    current = {t.skill_served.lower() for t in tasks}
    missing = [s for s in exa_skills if s not in current]
    if not missing:
        return f"Your plan covers the key skills Exa found for {goal.title}. You're on track."
    if _client:
        try:
            r = _client.chat.completions.create(
                model=MODEL, temperature=0.3,
                messages=[
                    {"role": "system", "content":
                     "You are a direct, calm career coach. Given what a role actually tests "
                     "(from live interview signal) and what the user is currently studying, "
                     "return ONE sentence naming the most important gap. "
                     "Be specific — name the skill. No filler, no encouragement, no guilt."},
                    {"role": "user", "content":
                     f"Role: {goal.title}\n"
                     f"Live signal shows this role tests: {', '.join(exa_skills)}\n"
                     f"User is currently studying: {', '.join(current) or 'nothing yet'}\n"
                     f"Missing from their plan: {', '.join(missing)}"},
                ],
            )
            return r.choices[0].message.content.strip()
        except Exception:
            pass
    top = missing[:3]
    return (f"Exa signal shows {goal.title} interviews on {', '.join(top)} "
            f"— not covered in your current plan.")


def narrate(message: str, plan_summary: dict) -> str:
    """Explain the engine's decision in plain English. LLM if available."""
    if _client:
        try:
            r = _client.chat.completions.create(
                model=MODEL, temperature=0.3,
                messages=[
                    {"role": "system", "content":
                     "You explain a scheduler's decisions to a job-seeker, "
                     "calmly and concretely. 2-3 sentences. Never invent tasks; "
                     "only describe what the plan summary contains. If work was "
                     "dropped, say which and why (it didn't serve the role / "
                     "lower priority). Protect momentum; no guilt."},
                    {"role": "user", "content":
                     f"User said: {message}\nPlan summary: {json.dumps(plan_summary)}"},
                ],
            )
            return r.choices[0].message.content
        except Exception:
            pass
    # fallback narration
    n_at_risk = len(plan_summary.get("at_risk", []))
    if plan_summary.get("tradeoff"):
        return plan_summary["tradeoff"]["reason"]
    if n_at_risk:
        return (f"Rebuilt your week. {n_at_risk} lower-priority task(s) moved to "
                "the at-risk list so what's closing soonest stays protected.")
    return "Rebuilt your week — everything fits before your deadline."
