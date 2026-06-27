"""Engine tests — prove the moat works before building around it.
Run: cd backend && python -m pytest tests/ -v   (or just `python tests/test_engine.py`)
"""
from app.models import Goal, Profile, Skill, Wall
from app.engine.gaps import derive_tasks
from app.engine.scheduler import schedule
from app.engine.feasibility import assess


def _profile(free_hours=3.0, velocity=0.8):
    return Profile(
        skills=[Skill("py", "python", 3)],
        free_hours_per_day=free_hours,
        walls=[Wall(day=0, start_min=540, end_min=720, label="class")],  # Mon 9-12
        velocity=velocity,
    )


def _goal():
    return Goal(
        id="job1", title="Backend Intern",
        required_skills=["data structures", "algorithms", "system design", "sql"],
        fit=0.9, close_date="2026-07-11",
    )


def test_gap_derivation_skips_known_skills():
    p = Profile(skills=[Skill("ds", "data structures", 3)], free_hours_per_day=3)
    tasks = derive_tasks(_goal(), p)
    names = {t.skill_served.lower() for t in tasks}
    assert "data structures" not in names      # already known -> skipped
    assert "algorithms" in names
    print("PASS: gap derivation skips known skills")


def test_prereq_ordering():
    tasks = derive_tasks(_goal(), _profile())
    plan = schedule(tasks, _profile(), deadline_day=6)
    pos = {b.task_id: (b.day, b.start_min) for b in plan.blocks}
    ds = next(t for t in tasks if t.skill_served == "data structures")
    algo = next(t for t in tasks if t.skill_served == "algorithms")
    # data structures must be scheduled before algorithms (its dependent)
    assert pos[ds.id] <= pos[algo.id]
    print("PASS: prereqs scheduled before dependents")


def test_walls_never_overlapped():
    tasks = derive_tasks(_goal(), _profile())
    plan = schedule(tasks, _profile(), deadline_day=6)
    for b in plan.blocks:
        if b.day == 0:  # Monday has a 9-12 class wall
            assert b.end_min <= 540 or b.start_min >= 720
    print("PASS: scheduler never overlaps walls")


def test_feasibility_forces_tradeoff_when_impossible():
    # almost no free time + low velocity + tight deadline => infeasible
    p = _profile(free_hours=0.5, velocity=0.5)
    g1 = _goal()
    g2 = Goal(id="job2", title="ML Intern",
              required_skills=["python", "apis", "portfolio project"],
              fit=0.7, close_date="2026-07-11")
    tasks = derive_tasks(g1, p) + derive_tasks(g2, p)
    plan = assess(tasks, p, [g1, g2], deadline_day=2)
    assert plan.feasible is False
    assert plan.tradeoff is not None
    assert len(plan.tradeoff["options"]) >= 2
    print("PASS: infeasible plan forces a tradeoff between goals")


def test_feasible_plan_has_no_tradeoff():
    p = _profile(free_hours=4.0, velocity=0.95)
    g = _goal()
    tasks = derive_tasks(g, p)
    plan = assess(tasks, p, [g], deadline_day=6)
    assert plan.tradeoff is None
    print("PASS: feasible plan needs no tradeoff")


if __name__ == "__main__":
    test_gap_derivation_skips_known_skills()
    test_prereq_ordering()
    test_walls_never_overlapped()
    test_feasibility_forces_tradeoff_when_impossible()
    test_feasible_plan_has_no_tradeoff()
    print("\nAll engine tests passed.")
