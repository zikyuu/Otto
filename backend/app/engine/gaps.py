"""Gap derivation (engine).

Compares a Goal's required skills against the Profile and produces the Tasks
that close the gap, each weighted by importance (fit * urgency). This is
deterministic structure — the LLM's job was only to EXTRACT required_skills
from the JD; deciding what to do about the gap is the engine's.

A small built-in skill->tasks map keeps the demo grounded and prereq-aware
without an LLM in the loop. Tomorrow you can let the LLM PROPOSE tasks, but the
weighting and prereq structure stay here so the roadmap isn't vibes.
"""
from __future__ import annotations

from app.models import Goal, Profile, Task

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


def derive_tasks(goal: Goal, profile: Profile, urgency: float = 1.0) -> list[Task]:
    """One task per required skill the user is missing, prereq-linked."""
    tasks: list[Task] = []
    # map skill name -> task id for prereq wiring
    made: dict[str, str] = {}

    for skill in goal.required_skills:
        key = skill.lower().strip()
        if profile.has_skill(key):
            continue  # already strong; no task
        full, lite, prereq_skill = SKILL_TASKS.get(key, (45, 10, None))
        tid = f"{goal.id}:{key.replace(' ', '_')}"
        made[key] = tid
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
        key = t.skill_served.lower().strip()
        _, _, prereq_skill = SKILL_TASKS.get(key, (0, 0, None))
        if prereq_skill and prereq_skill in made:
            t.prereq_ids.append(made[prereq_skill])

    return tasks
