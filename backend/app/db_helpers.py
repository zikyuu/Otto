"""Save and load plan data via Supabase REST."""
from __future__ import annotations
import time

from app.database import get_supabase
from app.models import Goal, Plan, Profile, Skill, Task


# ── internal helpers ──────────────────────────────────────────────────────────

def _get_profile_id(user_id: str) -> str | None:
    result = get_supabase().table("profiles").select("id").eq("session_id", user_id).execute()
    return result.data[0]["id"] if result.data else None


def _rebuild_plan_for_profile(profile_id: str) -> dict:
    """Load all goals for this profile, re-derive tasks, re-schedule, persist."""
    from app.engine.gaps import derive_tasks
    from app.engine.feasibility import assess

    sb = get_supabase()

    profile_row = sb.table("profiles").select("*").eq("id", profile_id).execute().data[0]
    skills_data = sb.table("skills").select("*").eq("profile_id", profile_id).execute().data

    goals_rows = sb.table("goals").select("*").eq("profile_id", profile_id).execute()
    if not goals_rows.data:
        return {}

    goals: list[Goal] = []
    for g in goals_rows.data:
        req = sb.table("goal_required_skills").select("skill_name").eq("goal_id", g["id"]).execute()
        goals.append(Goal(
            id=g["id"], title=g["title"], jd_text=g.get("jd_text", ""),
            required_skills=[r["skill_name"] for r in req.data],
            fit=g.get("fit", 0.5),
        ))

    profile = Profile(
        skills=[Skill(id=s["id"], name=s["name"], proficiency=s["proficiency"]) for s in skills_data],
        free_hours_per_day=profile_row["free_hours_per_day"],
        velocity=profile_row["velocity"],
        name=profile_row.get("name", ""),
    )

    all_tasks: list[Task] = []
    for g in goals:
        all_tasks += derive_tasks(g, profile)

    result = assess(all_tasks, profile, goals, 4)

    # Wipe old tasks for all goals, then old plan (blocks cascade)
    for g in goals:
        sb.table("tasks").delete().eq("goal_id", g.id).execute()
    sb.table("plans").delete().eq("profile_id", profile_id).execute()

    if all_tasks:
        sb.table("tasks").upsert([{
            "id": t.id, "goal_id": t.goal_id, "title": t.title,
            "skill_served": t.skill_served, "importance": t.importance,
            "full_minutes": t.full_minutes, "lite_minutes": t.lite_minutes,
            "status": t.status.value if hasattr(t.status, "value") else t.status,
        } for t in all_tasks], on_conflict="id").execute()

    plan_row = sb.table("plans").insert({
        "profile_id": profile_id,
        "feasible": result.feasible,
        "at_risk": result.at_risk,
        "tradeoff": result.tradeoff,
    }).execute().data[0]

    if result.blocks:
        sb.table("blocks").insert([{
            "plan_id": plan_row["id"], "task_id": b.task_id,
            "day": b.day, "start_min": b.start_min, "end_min": b.end_min, "lite": b.lite,
        } for b in result.blocks]).execute()

    block_list = [{"task_id": b.task_id, "day": b.day,
                   "start_min": b.start_min, "end_min": b.end_min, "lite": b.lite}
                  for b in result.blocks]

    goal_dicts = [{"id": g.id, "title": g.title, "jd_text": g.jd_text,
                   "required_skills": g.required_skills, "fit": g.fit, "close_date": ""}
                  for g in goals]

    return {
        "profile": {
            "skills": [{"id": s["id"], "name": s["name"], "proficiency": s["proficiency"]}
                       for s in skills_data],
            "free_hours_per_day": profile_row["free_hours_per_day"],
            "walls": [],
            "velocity": profile_row["velocity"],
            "name": profile_row.get("name", ""),
        },
        "goals": goal_dicts,
        "goal": goal_dicts[0] if goal_dicts else {},
        "tasks": [{
            "id": t.id, "title": t.title, "skill_served": t.skill_served,
            "goal_id": t.goal_id, "importance": t.importance,
            "full_minutes": t.full_minutes, "lite_minutes": t.lite_minutes,
            "status": t.status.value if hasattr(t.status, "value") else t.status,
            "est_minutes": t.full_minutes, "prereq_ids": t.prereq_ids or [],
        } for t in all_tasks],
        "blocks": block_list,
        "plan": {
            "blocks": block_list,
            "at_risk": result.at_risk,
            "feasible": result.feasible,
            "tradeoff": result.tradeoff,
        },
    }


# ── public API ────────────────────────────────────────────────────────────────

def save_plan(user_id: str, profile: Profile, goal: Goal, tasks: list[Task], plan: Plan) -> None:
    sb = get_supabase()

    existing = sb.table("profiles").select("id").eq("session_id", user_id).execute()
    if existing.data:
        profile_id = existing.data[0]["id"]
        sb.table("profiles").update({
            "free_hours_per_day": profile.free_hours_per_day,
            "velocity": profile.velocity,
            "name": profile.name,
        }).eq("id", profile_id).execute()
    else:
        profile_id = sb.table("profiles").insert({
            "session_id": user_id,
            "free_hours_per_day": profile.free_hours_per_day,
            "velocity": profile.velocity,
            "name": profile.name,
        }).execute().data[0]["id"]

    sb.table("skills").delete().eq("profile_id", profile_id).execute()
    if profile.skills:
        sb.table("skills").insert([
            {"id": f"{profile_id}_{i}", "profile_id": profile_id,
             "name": s.name, "proficiency": s.proficiency}
            for i, s in enumerate(profile.skills)
        ]).execute()

    db_goal_id = f"goal_{profile_id}"
    sb.table("goal_required_skills").delete().eq("goal_id", db_goal_id).execute()
    sb.table("tasks").delete().eq("goal_id", db_goal_id).execute()
    sb.table("goals").delete().eq("id", db_goal_id).execute()
    sb.table("goals").insert({
        "id": db_goal_id, "profile_id": profile_id,
        "title": goal.title, "jd_text": goal.jd_text[:2000], "fit": goal.fit,
    }).execute()
    if goal.required_skills:
        sb.table("goal_required_skills").insert([
            {"goal_id": db_goal_id, "skill_name": s} for s in goal.required_skills
        ]).execute()

    if tasks:
        sb.table("tasks").upsert([{
            "id": t.id, "goal_id": db_goal_id, "title": t.title,
            "skill_served": t.skill_served, "importance": t.importance,
            "full_minutes": t.full_minutes, "lite_minutes": t.lite_minutes,
            "status": t.status.value if hasattr(t.status, "value") else t.status,
        } for t in tasks], on_conflict="id").execute()

    sb.table("plans").delete().eq("profile_id", profile_id).execute()
    plan_row = sb.table("plans").insert({
        "profile_id": profile_id, "feasible": plan.feasible,
        "at_risk": plan.at_risk, "tradeoff": plan.tradeoff,
    }).execute().data[0]

    if plan.blocks:
        sb.table("blocks").insert([{
            "plan_id": plan_row["id"], "task_id": b.task_id,
            "day": b.day, "start_min": b.start_min, "end_min": b.end_min, "lite": b.lite,
        } for b in plan.blocks]).execute()


def add_goal_and_rebuild(user_id: str, title: str, jd_text: str,
                          required_skills: list[str], fit: float = 0.8) -> dict:
    sb = get_supabase()
    profile_id = _get_profile_id(user_id)
    if not profile_id:
        return {}

    db_goal_id = f"goal_{profile_id}_{int(time.time())}"
    sb.table("goals").insert({
        "id": db_goal_id, "profile_id": profile_id,
        "title": title, "jd_text": jd_text[:2000], "fit": fit,
    }).execute()
    if required_skills:
        sb.table("goal_required_skills").insert([
            {"goal_id": db_goal_id, "skill_name": s} for s in required_skills
        ]).execute()

    return _rebuild_plan_for_profile(profile_id)


def delete_goal_and_rebuild(user_id: str, goal_id: str) -> dict:
    sb = get_supabase()
    profile_id = _get_profile_id(user_id)
    if not profile_id:
        return {}

    # FK cascades handle tasks + goal_required_skills
    sb.table("goals").delete().eq("id", goal_id).eq("profile_id", profile_id).execute()

    return _rebuild_plan_for_profile(profile_id)


def update_task_status(task_id: str, status: str) -> None:
    get_supabase().table("tasks").update({"status": status}).eq("id", task_id).execute()


def load_plan(user_id: str) -> dict | None:
    sb = get_supabase()

    profiles = sb.table("profiles").select("*").eq("session_id", user_id).execute()
    if not profiles.data:
        return None
    p = profiles.data[0]
    profile_id = p["id"]

    plans = (sb.table("plans").select("*").eq("profile_id", profile_id)
               .order("created_at", desc=True).limit(1).execute())
    if not plans.data:
        return None
    plan_row = plans.data[0]

    # Load ALL goals for this user
    goals_rows = sb.table("goals").select("*").eq("profile_id", profile_id).execute()
    if not goals_rows.data:
        return None

    goal_dicts = []
    for g in goals_rows.data:
        req = sb.table("goal_required_skills").select("skill_name").eq("goal_id", g["id"]).execute()
        goal_dicts.append({
            "id": g["id"], "title": g["title"], "jd_text": g.get("jd_text", ""),
            "required_skills": [r["skill_name"] for r in req.data],
            "fit": g.get("fit", 0.5), "close_date": g.get("close_date", ""),
        })

    goal_ids = [g["id"] for g in goals_rows.data]
    skills = sb.table("skills").select("*").eq("profile_id", profile_id).execute()
    # supabase-py v2: filter by multiple values
    tasks_data: list[dict] = []
    for gid in goal_ids:
        rows = sb.table("tasks").select("*").eq("goal_id", gid).execute()
        tasks_data.extend(rows.data)

    blocks = sb.table("blocks").select("*").eq("plan_id", plan_row["id"]).execute()
    block_list = [{"task_id": b["task_id"], "day": b["day"],
                   "start_min": b["start_min"], "end_min": b["end_min"], "lite": b["lite"]}
                  for b in blocks.data]

    return {
        "profile": {
            "skills": [{"id": s["id"], "name": s["name"], "proficiency": s["proficiency"]}
                       for s in skills.data],
            "free_hours_per_day": p["free_hours_per_day"],
            "walls": [], "velocity": p["velocity"], "name": p.get("name", ""),
        },
        "goals": goal_dicts,
        "goal": goal_dicts[0] if goal_dicts else {},
        "tasks": [{
            "id": t["id"], "title": t["title"], "skill_served": t["skill_served"],
            "goal_id": t["goal_id"], "importance": t["importance"],
            "full_minutes": t["full_minutes"], "lite_minutes": t["lite_minutes"],
            "status": t["status"], "est_minutes": t["full_minutes"], "prereq_ids": [],
        } for t in tasks_data],
        "blocks": block_list,
        "plan": {
            "blocks": block_list,
            "at_risk": plan_row.get("at_risk") or [],
            "feasible": plan_row["feasible"],
            "tradeoff": plan_row.get("tradeoff"),
        },
    }
