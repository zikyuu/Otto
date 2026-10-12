"""Scheduler rules: priority formula, priority windows, deep-work breaks, gym-first, recovery,
batching, displacement of non-negotiable tasks."""
from datetime import date

import pytest

from app.engine.scheduler import _priority_score, apply_priority_windows, schedule
from app.models import Category, EffortTier, PriorityWindow, Profile, Task, TimeBlock

MON = date(2026, 8, 3)


def task(id, dur=60, **kw):
    return Task(id=id, title=id, duration_planned=dur, **kw)


def profile(**kw):
    p = Profile(**kw)
    p.avg_velocity = {k: 1.0 for k in p.avg_velocity}
    p.ramp_up_min = {k: 0 for k in p.ramp_up_min}
    p.free_hours_per_day = 15
    p.planning_bias = 1.0
    return p


def blk(plan, tid):
    return [b for b in plan.blocks if b.task_id == tid]


def start(plan, tid):
    return min((b.day, b.start_min) for b in blk(plan, tid))


# ---- priority formula (0.4 urgency + 0.3 fixed + 0.2 blocker + 0.1 importance) -----------

def score(t, **kw):
    return _priority_score(t, 6, 0, MON, **kw)


def test_formula_weights_add_up_for_a_task_with_everything():
    t = task("a", deadline_iso="2026-08-03", fixed=True)
    assert score(t, blockers=3, max_importance=1.0) == pytest.approx(1.0)


def test_each_term_is_worth_its_weight():
    assert score(task("a", deadline_iso="2026-08-03")) == pytest.approx(0.4 + 0.1)
    assert score(task("a", fixed=True)) == pytest.approx(0.3 + 0.1)
    assert score(task("a"), blockers=3) == pytest.approx(0.2 + 0.1)
    assert score(task("a", importance=0.5), max_importance=1.0) == pytest.approx(0.05)


def test_nearer_hard_deadline_outranks_farther_one():
    assert score(task("a", deadline_iso="2026-08-04")) > score(task("b", deadline_iso="2026-08-09"))


def test_hard_deadline_outranks_soft_outranks_none_at_equal_slack():
    hard = task("h", deadline_iso="2026-08-05")
    soft = task("s", deadline_iso="2026-08-05", hard_deadline=False)
    assert score(hard) > score(soft) > score(task("n"))


def test_blockers_are_capped_and_count_transitive_dependents():
    from app.engine.scheduler import _blocker_counts
    ts = [task("a"), task("b", prereq_ids=["a"]), task("c", prereq_ids=["b"]), task("d")]
    assert _blocker_counts(ts) == {"a": 2, "b": 1, "c": 0, "d": 0}
    assert score(task("a"), blockers=10) == score(task("a"), blockers=3)


def test_a_task_others_wait_on_is_placed_ahead_of_an_unrelated_one():
    # one slot: the blocker beats an equally important unrelated task even though it is listed second
    p = profile(day_start_min=9 * 60, day_end_min=10 * 60)
    plan = schedule([task("free", category=Category.ADMIN), task("root", category=Category.ADMIN),
                     task("child", prereq_ids=["root"], category=Category.ADMIN)], p, 0)
    assert blk(plan, "root") and "free" in plan.at_risk


def test_urgent_deadline_beats_important_task():
    p = profile(day_start_min=9 * 60, day_end_min=10 * 60)
    plan = schedule([task("big", importance=5.0, category=Category.ADMIN),
                     task("due", importance=0.1, deadline_iso="2026-08-03", category=Category.ADMIN)],
                    p, 0, week_start=MON)
    assert blk(plan, "due") and plan.at_risk == ["big"]


def test_rank_breaks_ties_between_otherwise_equal_tasks():
    p = profile(day_start_min=9 * 60, day_end_min=10 * 60)
    plan = schedule([task("a", category=Category.ADMIN), task("b", user_rank=1, category=Category.ADMIN)], p, 0)
    assert blk(plan, "b") and plan.at_risk == ["a"]


# ---- priority windows ------------------------------------------------------------------

def test_priority_window_fills_rank_and_non_negotiable():
    p = profile(priority_windows=[PriorityWindow("week", "2026-08-03", "2026-08-09", ["b", "a"], ["a"])])
    out = {t.id: t for t in apply_priority_windows([task("a"), task("b"), task("c")], p, MON)}
    assert (out["b"].user_rank, out["a"].user_rank, out["c"].user_rank) == (1, 2, None)
    assert out["a"].non_negotiable and not out["b"].non_negotiable


def test_priority_window_outside_today_is_ignored_and_narrowest_wins():
    p = profile(priority_windows=[
        PriorityWindow("year", "2026-01-01", "2026-12-31", ["a", "b"]),
        PriorityWindow("week", "2026-08-03", "2026-08-09", ["b", "a"]),
        PriorityWindow("week", "2026-07-01", "2026-07-07", ["a"], ["a"]),
    ])
    out = {t.id: t for t in apply_priority_windows([task("a"), task("b")], p, MON)}
    assert out["b"].user_rank == 1 and out["a"].user_rank == 2
    assert not out["a"].non_negotiable


def test_priority_window_does_not_mutate_input_and_keeps_own_rank():
    t = task("a", user_rank=5)
    p = profile(priority_windows=[PriorityWindow("week", "2026-08-03", "2026-08-09", ["a"])])
    assert apply_priority_windows([t], p, MON)[0].user_rank == 5


def test_window_rank_decides_who_gets_the_only_slot():
    p = profile(day_start_min=9 * 60, day_end_min=10 * 60,
                priority_windows=[PriorityWindow("week", "2026-08-03", "2026-08-09", ["b", "a"])])
    plan = schedule([task("a"), task("b")], p, 0, week_start=MON)
    assert blk(plan, "b") and plan.at_risk == ["a"]


# ---- breaks in long deep work -----------------------------------------------------------

def test_deep_work_over_90_gets_a_break_inside_the_block():
    p = profile()
    plan = schedule([task("d", 150, category=Category.DEEP_WORK, effort_tier=EffortTier.MED)], p, 0)
    b = blk(plan, "d")[0]
    assert b.end_min - b.start_min == 150 + p.break_min
    assert len(plan.breaks) == 1
    br = plan.breaks[0]
    assert br.is_break and b.start_min < br.start_min and br.end_min < b.end_min
    assert br.end_min - br.start_min == p.break_min


def test_deep_work_up_to_90_has_no_break():
    plan = schedule([task("d", 90, category=Category.DEEP_WORK, effort_tier=EffortTier.MED)], profile(), 0)
    assert plan.breaks == [] and blk(plan, "d")[0].end_min - blk(plan, "d")[0].start_min == 90


def test_back_to_back_deep_blocks_are_separated_by_a_break():
    p = profile()
    ts = [task(x, 60, category=Category.DEEP_WORK, effort_tier=EffortTier.MED) for x in "ab"]
    plan = schedule(ts, p, 0)
    first, second = sorted((blk(plan, x)[0] for x in "ab"), key=lambda b: b.start_min)
    assert second.start_min - first.end_min >= p.break_min
    assert any(b.start_min == first.end_min for b in plan.breaks)


def test_breaks_are_off_when_break_min_is_zero():
    p = profile(break_min=0)
    plan = schedule([task("d", 150, category=Category.DEEP_WORK, effort_tier=EffortTier.MED)], p, 0)
    assert plan.breaks == [] and blk(plan, "d")[0].end_min - blk(plan, "d")[0].start_min == 150


def test_non_deep_work_never_gets_breaks():
    plan = schedule([task("a", 150, category=Category.ADMIN)], profile(), 0)
    assert plan.breaks == []


# ---- gym first --------------------------------------------------------------------------

def gym_and_deep(**pk):
    p = profile(**pk)
    deep = task("deep", 60, importance=5.0, category=Category.DEEP_WORK, effort_tier=EffortTier.MED)
    gym = task("gym", 60, category=Category.PHYSICAL)
    return p, [deep, gym]


def test_gym_goes_after_deep_work_without_the_pattern():
    p, ts = gym_and_deep()
    plan = schedule(ts, p, 0)
    assert start(plan, "gym") > start(plan, "deep")


def test_gym_first_puts_the_gym_before_deep_work():
    p, ts = gym_and_deep(gym_first=True)
    plan = schedule(ts, p, 0)
    gym_end = max(b.end_min for b in blk(plan, "gym"))
    assert start(plan, "gym") < start(plan, "deep")
    assert min(b.start_min for b in blk(plan, "deep")) >= gym_end


# ---- recovery after meetings ------------------------------------------------------------

def test_recovery_buffer_after_a_social_block():
    meeting = TimeBlock(0, 9 * 60, 10 * 60, "call", kind="social")
    p = profile(day_start_min=9 * 60, time_blocks=[meeting], recovery_after_meeting=30)
    plan = schedule([task("a", 30, category=Category.ADMIN)], p, 0)
    assert start(plan, "a") == (0, 10 * 60 + 30)


def test_no_recovery_buffer_after_a_plain_block():
    p = profile(day_start_min=9 * 60, time_blocks=[TimeBlock(0, 9 * 60, 10 * 60, "x")], recovery_after_meeting=30)
    assert start(schedule([task("a", 30, category=Category.ADMIN)], p, 0), "a") == (0, 10 * 60)


def test_a_scheduled_social_task_reserves_its_own_recovery():
    p = profile(day_start_min=9 * 60, day_end_min=12 * 60, recovery_after_meeting=30)
    ts = [task("call", 60, importance=5.0, category=Category.SOCIAL), task("a", 30, category=Category.ADMIN)]
    plan = schedule(ts, p, 0)
    assert start(plan, "a")[1] >= 9 * 60 + 60 + 30


# ---- batching ---------------------------------------------------------------------------

def admins(n=3):
    return [task(f"m{i}", 20, category=Category.ADMIN) for i in range(n)]


def test_spread_puts_small_admin_tasks_on_different_days():
    plan = schedule(admins(), profile(batching_preference="spread"), 4)
    assert len({b.day for b in plan.blocks}) == 3


def test_batch_keeps_small_admin_tasks_together_and_close():
    p = profile(batching_preference="batch", time_blocks=[TimeBlock(0, 8 * 60 + 60, 12 * 60, "busy")])
    plan = schedule(admins(), p, 4)
    bs = sorted(plan.blocks, key=lambda b: (b.day, b.start_min))
    assert len({b.day for b in bs}) == 1
    assert all(b2.start_min == b1.end_min for b1, b2 in zip(bs, bs[1:]))


def test_none_leaves_default_placement_alone():
    plan = schedule(admins(), profile(), 4)
    assert len({b.day for b in plan.blocks}) == 1


# ---- displacement -----------------------------------------------------------------------

def one_slot(**kw):
    return profile(day_start_min=9 * 60, day_end_min=10 * 60, **kw)


def test_non_negotiable_displaces_a_lower_priority_task():
    low = task("low", 60, importance=5.0)
    nn = task("nn", 60, importance=0.2, non_negotiable=True)
    plan = schedule([low, nn], one_slot(), 0)
    assert blk(plan, "nn") and not blk(plan, "low")
    assert plan.displaced == ["low"] and plan.at_risk == ["low"]


def test_displaced_task_is_replaced_elsewhere_when_there_is_room():
    # day 0 is free 9-10 only (inside the peak window); day 1 only 14-16. The must-do needs the peak.
    p = profile(time_blocks=[TimeBlock(0, 0, 9 * 60), TimeBlock(0, 10 * 60, 24 * 60),
                             TimeBlock(1, 0, 14 * 60), TimeBlock(1, 16 * 60, 24 * 60)])
    low = task("low", 60, importance=5.0, category=Category.ADMIN)
    nn = task("nn", 60, importance=0.2, non_negotiable=True, effort_tier=EffortTier.HIGH)
    plan = schedule([low, nn], p, 1)
    assert start(plan, "nn") == (0, 9 * 60)
    assert start(plan, "low") == (1, 14 * 60) and plan.feasible and plan.displaced == ["low"]


def test_displacement_can_be_switched_off():
    low = task("low", 60, importance=5.0)
    nn = task("nn", 60, importance=0.2, non_negotiable=True)
    plan = schedule([low, nn], one_slot(), 0, allow_displace=False)
    assert plan.at_risk == ["nn"] and plan.displaced == []


def test_non_negotiable_never_displaces_another_non_negotiable():
    a = task("a", 60, importance=5.0, non_negotiable=True)
    b = task("b", 60, importance=0.2, non_negotiable=True)
    plan = schedule([a, b], one_slot(), 0)
    assert blk(plan, "a") and plan.at_risk == ["b"] and plan.displaced == []


def test_task_others_depend_on_is_not_displaced():
    a = task("a", 60, importance=5.0, category=Category.ADMIN)
    dep = task("dep", 30, prereq_ids=["a"], category=Category.ADMIN)
    nn = task("nn", 60, importance=0.2, non_negotiable=True, category=Category.ADMIN)
    p = profile(day_start_min=9 * 60, day_end_min=10 * 60 + 30)
    plan = schedule([a, dep, nn], p, 0)
    assert blk(plan, "a") and "a" not in plan.displaced


def test_displacement_prefers_a_victim_without_a_hard_deadline():
    p = profile(day_start_min=9 * 60, day_end_min=11 * 60)
    urgent = task("urgent", 60, importance=1.0, deadline_iso="2026-08-03", category=Category.ADMIN)
    lazy = task("lazy", 60, importance=1.0, category=Category.ADMIN)
    nn = task("nn", 60, importance=0.1, non_negotiable=True, effort_tier=EffortTier.HIGH)
    plan = schedule([urgent, lazy, nn], p, 0, week_start=MON)
    assert plan.displaced == ["lazy"] and blk(plan, "urgent") and blk(plan, "nn")


# ---- the schedule stays valid with every rule on ----------------------------------------

def test_no_overlaps_with_all_rules_on():
    p = profile(gym_first=True, batching_preference="batch", recovery_after_meeting=20,
                time_blocks=[TimeBlock(1, 10 * 60, 11 * 60, "call", kind="social")])
    ts = [task("d1", 150, category=Category.DEEP_WORK, effort_tier=EffortTier.MED),
          task("d2", 60, category=Category.DEEP_WORK, effort_tier=EffortTier.MED),
          task("g", 60, category=Category.PHYSICAL),
          task("c", 45, category=Category.SOCIAL, non_negotiable=True),
          *admins(4)]
    plan = schedule(ts, p, 4)
    assert plan.feasible
    spans = sorted((b.day, b.start_min, b.end_min) for b in plan.blocks)
    for (d1, _, e1), (d2, s2, _) in zip(spans, spans[1:]):
        assert d1 != d2 or e1 <= s2
