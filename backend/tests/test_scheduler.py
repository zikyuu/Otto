"""Scheduler behaviour: ordering, deadlines, gating, capacity."""
from datetime import date

from app.engine.scheduler import schedule
from app.models import Category, EffortTier, Profile, Status, Task, TimeBlock

MON = date(2026, 8, 3)   # day index 0


def task(id, dur=60, **kw):
    return Task(id=id, title=id, duration_planned=dur, **kw)


def profile(**kw):
    p = Profile(**kw)
    p.avg_velocity = {k: 1.0 for k in p.avg_velocity}   # keep arithmetic obvious
    p.ramp_up_min = {k: 0 for k in p.ramp_up_min}
    p.free_hours_per_day = 15
    p.planning_bias = 1.0
    return p


def blk(plan, tid):
    return [b for b in plan.blocks if b.task_id == tid]


def test_dependent_never_starts_before_prereq_ends():
    # prereq needs the 9-12 peak window; day 0 is blocked 8:00-12:00 so it lands on day 1.
    # the dependent is LOW effort and would love day 0 afternoon — it must wait.
    p = profile(time_blocks=[TimeBlock(0, 8 * 60, 12 * 60)])
    a = task("a", 120, effort_tier=EffortTier.HIGH)
    b = task("b", 20, effort_tier=EffortTier.LOW, prereq_ids=["a"])
    plan = schedule([a, b], p, 6)
    ea = max((x.day, x.end_min) for x in blk(plan, "a"))
    sb = min((x.day, x.start_min) for x in blk(plan, "b"))
    assert plan.feasible and sb >= ea


def test_chain_of_three_is_ordered():
    p = profile()
    ts = [task("a", 30), task("b", 30, prereq_ids=["a"]), task("c", 30, prereq_ids=["b"])]
    plan = schedule(ts, p, 6)
    pos = {t.id: (blk(plan, t.id)[0].day, blk(plan, t.id)[0].start_min) for t in ts}
    assert pos["a"] < pos["b"] < pos["c"]


def test_unplaceable_prereq_leaves_dependent_at_risk():
    p = profile(time_blocks=[TimeBlock(d, 0, 24 * 60) for d in range(7)])
    plan = schedule([task("a"), task("b", prereq_ids=["a"])], p, 6)
    assert set(plan.at_risk) == {"a", "b"}


def test_done_prereq_counts_as_satisfied_and_is_not_rescheduled():
    p = profile()
    a = task("a", status=Status.DONE)
    b = task("b", prereq_ids=["a"])
    plan = schedule([a, b], p, 6)
    assert blk(plan, "a") == [] and "a" not in plan.at_risk and blk(plan, "b")


def test_hard_deadline_is_enforced():
    # whole of day 0 and day 1 blocked, deadline is day 1 -> cannot be placed
    p = profile(time_blocks=[TimeBlock(d, 0, 24 * 60) for d in (0, 1)])
    t = task("a", deadline_iso="2026-08-04", hard_deadline=True)
    plan = schedule([t], p, 6, week_start=MON)
    assert plan.at_risk == ["a"]            # would have been placed on day 2 before


def test_soft_deadline_may_slip():
    p = profile(time_blocks=[TimeBlock(d, 0, 24 * 60) for d in (0, 1)])
    t = task("a", deadline_iso="2026-08-04", hard_deadline=False)
    plan = schedule([t], p, 6, week_start=MON)
    assert plan.feasible and blk(plan, "a")[0].day == 2


def test_high_effort_found_inside_gap_that_opens_before_peak():
    # free from 08:00; peak is 09:00-12:00. Used to be rejected because only 08:00 was tested.
    p = profile()
    t = task("a", 120, effort_tier=EffortTier.HIGH)
    plan = schedule([t], p, 0)
    assert plan.feasible and blk(plan, "a")[0].start_min == 9 * 60


def test_high_effort_never_starts_outside_peak_or_in_slump():
    p = profile()
    ts = [task(f"t{i}", 60, effort_tier=EffortTier.HIGH) for i in range(6)]
    plan = schedule(ts, p, 6)
    for b in plan.blocks:
        assert 9 * 60 <= b.start_min < 12 * 60


def test_physical_stays_out_of_peak_window():
    p = profile()
    plan = schedule([task("gym", 60, category=Category.PHYSICAL)], p, 0)
    s = blk(plan, "gym")[0].start_min
    assert not (9 * 60 <= s < 12 * 60)


def test_failed_split_does_not_leak_free_time():
    # day 0 has two 50-min gaps. A 120-min task can't split into them (100 < 120) and must
    # leave both gaps intact for the small task that follows.
    p = profile(time_blocks=[TimeBlock(0, 8 * 60 + 50, 9 * 60), TimeBlock(0, 9 * 60 + 50, 24 * 60)])
    big = task("big", 120, importance=2.0)
    small = task("small", 45, importance=0.5)
    plan = schedule([big, small], p, 0)
    assert "big" in plan.at_risk
    assert blk(plan, "small")


# free: day 0 08:00-09:00 (60 min), day 1 08:00-08:30 (30 min) — no single 90-min slot anywhere
_TIGHT = [TimeBlock(0, 9 * 60, 24 * 60), TimeBlock(1, 8 * 60 + 30, 24 * 60)]


def test_split_used_when_no_single_slot_fits():
    plan = schedule([task("a", 90, category=Category.ADMIN)], profile(time_blocks=_TIGHT), 1)
    bs = blk(plan, "a")
    assert sorted((b.day, b.end_min - b.start_min) for b in bs) == [(0, 60), (1, 30)]
    assert all(b.is_split for b in bs)


def test_split_can_be_disabled():
    plan = schedule([task("a", 90, category=Category.ADMIN)], profile(time_blocks=_TIGHT), 1, allow_split=False)
    assert plan.at_risk == ["a"]


def test_start_day_and_now_exclude_the_past():
    p = profile()
    plan = schedule([task("a", 60)], p, 6, start_day=2, now_min=13 * 60)
    b = blk(plan, "a")[0]
    assert (b.day, b.start_min) == (2, 13 * 60)
    plan = schedule([task("a", 60)], p, 6, start_day=7)
    assert plan.at_risk == ["a"]


def test_prefer_day_and_time_pull_task_toward_where_it_was():
    p = profile()
    t = task("a", 60, prefer_day=4, prefer_start_min=15 * 60)
    plan = schedule([t], p, 6)
    b = blk(plan, "a")[0]
    assert (b.day, b.start_min) == (4, 15 * 60)


def test_blocks_never_overlap_each_other_or_walls():
    p = profile(time_blocks=[TimeBlock(0, 10 * 60, 11 * 60)])
    ts = [task(f"t{i}", 50 + 5 * i) for i in range(12)]
    plan = schedule(ts, p, 6)
    spans = sorted((b.day, b.start_min, b.end_min) for b in plan.blocks)
    for (d1, s1, e1), (d2, s2, e2) in zip(spans, spans[1:]):
        assert d1 != d2 or e1 <= s2
    for b in plan.blocks:
        if b.day == 0:
            assert b.end_min <= 600 or b.start_min >= 660


def test_slot_includes_velocity_buffer_and_ramp_up():
    p = Profile()                                  # defaults: deep_work velocity 1.3, ramp 15
    p.free_hours_per_day, p.planning_bias = 15, 1.0
    plan = schedule([task("a", 60)], p, 0)
    b = blk(plan, "a")[0]
    assert b.end_min - b.start_min == int(60 * 1.3) + 15


def test_daily_cap_limits_load():
    p = Profile(free_hours_per_day=2.0, planning_bias=1.0)
    p.avg_velocity = {k: 1.0 for k in p.avg_velocity}
    p.ramp_up_min = {k: 0 for k in p.ramp_up_min}
    plan = schedule([task(f"t{i}", 60, category=Category.ADMIN) for i in range(5)], p, 0)
    assert sum(b.end_min - b.start_min for b in plan.blocks) <= 120


def test_meatball_grinder_tasks_are_parked_not_scheduled():
    plan = schedule([task("a", status=Status.MEATBALL_GRINDER)], profile(), 6)
    assert plan.meatball_grinder == ["a"] and not plan.blocks and plan.feasible
