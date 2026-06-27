"""Gap derivation (engine).

Compares a Goal's required skills against the Profile and produces the Tasks
that close the gap, each weighted by importance (fit * urgency). This is
deterministic structure — the LLM's job was only to EXTRACT required_skills
from the JD; deciding what to do about the gap is the engine's.

A small built-in skill->tasks map keeps the demo grounded and prereq-aware
without an LLM in the loop. Exa search enriches the skill list with live
interview signal when EXA_API_KEY is available; SKILL_TASKS is the fallback.
"""
from __future__ import annotations

import os
import re

from dotenv import load_dotenv

from app.models import Goal, Profile, Task

load_dotenv()

# skill -> (full_min, lite_min, prereq_skill or None)
# prereqs encode learning order: can't do system design before data structures
SKILL_TASKS: dict[str, tuple[int, int, str | None]] = {
    "data structures": (60, 15, None),
    "algorithms": (60, 15, "data structures"),
    "system design": (90, 20, "algorithms"),
    "sql": (45, 10, None),
    "apis": (45, 10, None),
    "python": (45, 10, None),
    "testing": (30, 10, "python"),
    "portfolio project": (120, 30, "apis"),
}

# Vocabulary used to extract skill mentions from Exa search results
_SKILL_VOCAB: frozenset[str] = frozenset({
    "data structures", "algorithms", "dynamic programming", "graph algorithms",
    "binary search", "sorting", "recursion", "bit manipulation",
    "system design", "distributed systems", "scalability", "caching",
    "load balancing", "sql", "nosql", "message queues",
    "microservices", "api design", "rest", "grpc", "apis",
    "python", "java", "javascript", "typescript", "go", "rust",
    "concurrency", "multithreading", "object oriented programming",
    "design patterns", "machine learning", "deep learning", "statistics",
    "data analysis", "testing", "portfolio project", "docker", "kubernetes",
    "networking", "operating systems", "behavioral interview",
})


def _exa_skills(goal: Goal) -> list[str]:
    """Return lowercase skill names found via Exa for this role; [] on any failure."""
    api_key = os.environ.get("EXA_API_KEY")
    if not api_key:
        return []
    try:
        from exa_py import Exa  # type: ignore
        client = Exa(api_key=api_key)
        role = goal.title
        queries = [
            f"{role} interview prep skills 2026",
            f"{role} what to study interview",
            f"{role} leetcode patterns interview",
        ]
        blobs: list[str] = []
        for q in queries:
            res = client.search_and_contents(q, num_results=3, text={"max_characters": 1500})
            for r in res.results:
                blobs.append((getattr(r, "text", "") or "").lower())
        combined = " ".join(blobs)
        return [s for s in _SKILL_VOCAB if re.search(r"\b" + re.escape(s) + r"\b", combined)]
    except Exception:
        return []


def derive_tasks(goal: Goal, profile: Profile, urgency: float = 1.0) -> list[Task]:
    """One task per required skill the user is missing, prereq-linked."""
    # Normalise required skills then append any live Exa signal (deduped)
    base = [s.lower().strip() for s in goal.required_skills]
    exa = _exa_skills(goal)
    all_skills = list(dict.fromkeys(base + [s for s in exa if s not in base]))

    tasks: list[Task] = []
    # map skill name -> task id for prereq wiring
    made: dict[str, str] = {}

    for skill in all_skills:
        if profile.has_skill(skill):
            continue  # already strong; no task
        full, lite, prereq_skill = SKILL_TASKS.get(skill, (45, 10, None))
        tid = f"{goal.id}:{skill.replace(' ', '_')}"
        made[skill] = tid
        tasks.append(Task(
            id=tid,
            title=f"Build skill: {skill}",
            skill_served=skill,
            goal_id=goal.id,
            importance=goal.fit * urgency,
            full_minutes=full,
            lite_minutes=lite,
            prereq_ids=[],  # wired below once all ids exist
        ))

    # wire prereqs that are themselves in the task set
    for t in tasks:
        _, _, prereq_skill = SKILL_TASKS.get(t.skill_served, (0, 0, None))
        if prereq_skill and prereq_skill in made:
            t.prereq_ids.append(made[prereq_skill])

    return tasks
