"""The remaining learning signals and parameters: stated rules, sleep window, recovery, slump,
planning bias, ramp-up, gym-first, gap flags, actuals — and their HTTP endpoints."""
import pytest
from fastapi.testclient import TestClient

from app.engine import learning as L
from app.main import app
from app.models import EnergyLog, PriorityWindow, Profile, ReflectionChoice as RC, TaskReflection

client = TestClient(app)


def refl(choice, planned, actual, cat="deep_work", ts="2026-08-01T10:00", task="t"):
    return TaskReflection(task_id=task, ts=ts, choice=choice, planned_minutes=planned,
                          actual_minutes=actual, category=cat)


def logs(spec, days=7):
    return [EnergyLog(ts=f"2026-08-{d:02d}T{h:02d}:30", level=l) for d in range(1, days + 1) for h, l in spec]


# ---- stated rules (hierarchy level 1) ----------------------------------------------------

def test_stated_peak_window_is_applied_and_survives_contrary_energy_logs():
    p = Profile()
    L.set_stated_rule(p, "peak_window", [7, 10], note="I'm sharpest early")
    assert p.peak_window == (7, 10) and "I'm sharpest early" in p.stated_rules
    for log in logs([(7, 1), (8, 1), (9, 1), (14, 5), (15, 5), (16, 5)]):
        L.add_energy_log(p, log)
    assert p.peak_window == (7, 10)


def test_clearing_a_stated_rule_hands_it_back_to_learning():
    p = Profile()
    L.set_stated_rule(p, "peak_window", [7, 10])
    L.clear_stated_rule(p, "peak_window")
    for log in logs([(7, 1), (8, 1), (9, 1), (14, 5), (15, 5), (16, 5)]):
        L.add_energy_log(p, log)
    assert p.peak_window == (14, 17)


def test_stated_focus_span_is_not_overwritten_by_signals():
    p = Profile()
    L.set_stated_rule(p, "focus_span_min", 200)
    for _ in range(5):
        L.apply_all_signals(p, refl(RC.NAILED, 200, 200))
    assert p.focus_span_min == 200


@pytest.mark.parametrize("key,value", [
    ("peak_window", [10, 9]), ("peak_window", "9-12"), ("focus_span_min", 10), ("batching_preference", "lots"),
    ("gym_first", "yes"), ("planning_bias", 1.5), ("recovery_after_meeting", -1), ("nonsense", 1),
    ("ramp_up_min:juggling", 5), ("day_end_min", 7 * 60),
])
def test_invalid_stated_rules_are_rejected_and_change_nothing(key, value):
    p = Profile()
    before = p.to_dict()
    with pytest.raises(ValueError):
        L.set_stated_rule(p, key, value)
    assert p.to_dict() == before


def test_stated_ramp_up_and_batching_and_gym():
    p = Profile()
    L.set_stated_rule(p, "ramp_up_min:deep_work", 25)
    L.set_stated_rule(p, "batching_preference", "batch")
    L.set_stated_rule(p, "gym_first", True)
    assert (p.ramp_up_min["deep_work"], p.batching_preference, p.gym_first) == (25, "batch", True)


# ---- sleep window --------------------------------------------------------------------------

def test_sleep_window_allows_past_midnight_and_is_pinned():
    p = Profile()
    L.set_sleep_window(p, 11 * 60, 28 * 60)          # up till 4am
    assert (p.day_start_min, p.day_end_min) == (660, 1680)
    assert {"day_start_min", "day_end_min"} <= set(p.stated_overrides)


def test_sleep_window_must_leave_a_waking_day():
    with pytest.raises(ValueError):
        L.set_sleep_window(Profile(), 10 * 60, 14 * 60)


def test_sleep_window_extends_what_the_scheduler_can_use():
    from app.engine.scheduler import schedule
    from app.models import Task
    p = Profile()
    L.set_sleep_window(p, 8 * 60, 26 * 60)           # 2am
    p.free_hours_per_day = 24
    p.planning_bias = 1.0
    plan = schedule([Task(id="a", title="a", duration_planned=60, category=__import__("app.models").models.Category.ADMIN,
                          prefer_day=0, prefer_start_min=25 * 60)], p, 0)
    assert plan.blocks[0].start_min == 25 * 60


# ---- meeting recovery ----------------------------------------------------------------------

def test_still_drained_long_after_a_meeting_lengthens_recovery():
    p = Profile()
    for _ in range(6):
        L.add_energy_log(p, EnergyLog(ts="2026-08-01T11:00", level=1, after_meeting_min=45))
    assert 15 < p.recovery_after_meeting <= 55 and p.recovery_evidence == 6


def test_energised_soon_after_a_meeting_shortens_recovery():
    p = Profile()
    for _ in range(8):
        L.add_energy_log(p, EnergyLog(ts="2026-08-01T11:00", level=5, after_meeting_min=5))
    assert 5 <= p.recovery_after_meeting < 15


def test_taps_unrelated_to_a_meeting_do_not_move_recovery():
    p = Profile()
    L.add_energy_log(p, EnergyLog(ts="2026-08-01T11:00", level=1))
    L.add_energy_log(p, EnergyLog(ts="2026-08-01T11:00", level=1, after_meeting_min=500))
    assert p.recovery_after_meeting == 15 and p.recovery_evidence == 0


def test_recovery_is_clamped_and_respects_stated_rule():
    p = Profile()
    L.set_stated_rule(p, "recovery_after_meeting", 20)
    for _ in range(10):
        L.add_energy_log(p, EnergyLog(ts="2026-08-01T11:00", level=1, after_meeting_min=120))
    assert p.recovery_after_meeting == 20


# ---- post-meal slump -----------------------------------------------------------------------

def test_slump_lengthens_when_energy_stays_low_after_lunch():
    p = Profile()
    for log in logs([(9, 5), (10, 5), (12, 3), (13, 1), (14, 4)], days=3):
        L.add_energy_log(p, log)
    assert 45 < p.post_meal_slump_min <= L.SLUMP_MAX


def test_slump_shrinks_when_afternoons_are_fine():
    p = Profile()
    for log in logs([(9, 4), (10, 4), (12, 4), (13, 4), (14, 4)], days=3):
        L.add_energy_log(p, log)
    assert L.SLUMP_MIN <= p.post_meal_slump_min < 45


def test_slump_needs_enough_afternoon_logs():
    p = Profile()
    for log in logs([(9, 5), (10, 5), (11, 5), (16, 1)], days=4):
        L.add_energy_log(p, log)
    assert p.post_meal_slump_min == 45


# ---- planning bias -------------------------------------------------------------------------

def test_planning_bias_waits_for_evidence_then_follows_completion_rate():
    p = Profile()
    for _ in range(4):
        L.record_completion(p, False, 60)
    assert p.planning_bias == 0.8
    for _ in range(10):
        L.record_completion(p, False, 60)
    assert L.PLANNING_BIAS_MIN <= p.planning_bias < 0.7


def test_planning_bias_is_capped_when_everything_gets_done():
    p = Profile()
    for _ in range(40):
        L.record_completion(p, True, 60)
    assert 0.8 < p.planning_bias <= L.PLANNING_BIAS_MAX


def test_stated_planning_bias_is_kept():
    p = Profile()
    L.set_stated_rule(p, "planning_bias", 0.6)
    for _ in range(20):
        L.record_completion(p, True, 60)
    assert p.planning_bias == 0.6


# ---- ramp-up -------------------------------------------------------------------------------

def feed(p, pairs, cat="deep_work"):
    for planned, actual in pairs:
        L.apply_all_signals(p, refl(RC.HARDER, planned, actual, cat))


def test_ramp_up_rises_when_every_session_has_a_fixed_startup_cost():
    p = Profile()
    feed(p, [(pl, pl + 40) for pl in (20, 40, 60, 90, 120, 30, 75, 100)])
    assert p.ramp_up_min["deep_work"] > 15


def test_ramp_up_falls_when_there_is_no_startup_cost():
    p = Profile()
    feed(p, [(pl, pl) for pl in (20, 40, 60, 90, 120, 30, 75, 100)])
    assert p.ramp_up_min["deep_work"] < 15


def test_ramp_up_needs_spread_in_durations():
    p = Profile()
    feed(p, [(60, 100)] * 10)
    assert p.ramp_up_min["deep_work"] == 15


def test_ramp_up_ignores_other_categories_and_stated_values():
    p = Profile()
    feed(p, [(pl, pl + 40) for pl in (20, 40, 60, 90, 120, 30)], cat="admin")
    assert p.ramp_up_min["deep_work"] == 15
    L.set_stated_rule(p, "ramp_up_min:admin", 3)
    feed(p, [(pl, pl + 40) for pl in (20, 40, 60, 90, 120, 30)], cat="admin")
    assert p.ramp_up_min["admin"] == 3


# ---- gym-first pattern ---------------------------------------------------------------------

def day_pair(p, day, gym_ts, deep_ts):
    L.apply_all_signals(p, refl(RC.NAILED, 60, 60, "physical", f"2026-08-{day:02d}T{gym_ts}", "gym"))
    L.apply_all_signals(p, refl(RC.NAILED, 60, 60, "deep_work", f"2026-08-{day:02d}T{deep_ts}", "deep"))


def test_gym_first_is_learned_from_order():
    p = Profile()
    for d in (1, 2, 3):
        day_pair(p, d, "09:00", "12:00")
    assert p.gym_first and p.gym_evidence == 3


def test_gym_after_work_keeps_it_off():
    p = Profile()
    for d in (1, 2, 3, 4):
        day_pair(p, d, "18:00", "11:00")
    assert not p.gym_first


def test_gym_pattern_needs_a_few_days_and_a_clear_majority():
    p = Profile()
    for d in (1, 2):
        day_pair(p, d, "09:00", "12:00")
    assert not p.gym_first
    day_pair(p, 3, "18:00", "11:00")      # 2 of 3 = 67% < 70%
    assert not p.gym_first


def test_stated_gym_first_is_not_overturned():
    p = Profile()
    L.set_stated_rule(p, "gym_first", True)
    for d in (1, 2, 3, 4):
        day_pair(p, d, "18:00", "11:00")
    assert p.gym_first


# ---- gap flags, actuals, chronotype ---------------------------------------------------------

def test_gap_reflection_flags_the_task_once():
    p = Profile()
    for _ in range(2):
        L.apply_all_signals(p, refl(RC.GAP, 60, 90, task="sysdesign"))
    assert p.gap_task_ids == ["sysdesign"]


def test_actual_close_to_plan_counts_as_nailed_else_asks():
    assert L.classify_actual(60, 63) == RC.NAILED
    assert L.classify_actual(60, 54) == RC.NAILED
    assert L.classify_actual(60, 90) is None
    assert L.classify_actual(60, 0) is None


def test_chronotype_from_peak_window():
    p = Profile()
    assert L.chronotype(p) == "morning"
    p.peak_window = (11, 14)
    assert L.chronotype(p) == "midday"
    p.peak_window = (15, 18)
    assert L.chronotype(p) == "night"


# ---- persistence --------------------------------------------------------------------------

def test_new_fields_survive_a_round_trip():
    p = Profile()
    L.set_stated_rule(p, "batching_preference", "spread")
    L.set_stated_rule(p, "recovery_after_meeting", 40)
    p.gym_first, p.gap_task_ids = True, ["x"]
    p.priority_windows = [PriorityWindow("week", "2026-08-03", "2026-08-09", ["a"], ["a"])]
    q = Profile.from_dict(p.to_dict())
    assert q.to_dict() == p.to_dict()
    assert q.priority_windows[0].non_negotiable_ids == ["a"]


def test_bad_batching_value_in_stored_profile_falls_back():
    assert Profile.from_dict({"batching_preference": "???"}).batching_preference == "none"


# ---- HTTP ---------------------------------------------------------------------------------

def test_stated_rule_endpoint_applies_and_rejects():
    r = client.post("/api/learning/stated-rule", json={"key": "batching_preference", "value": "batch", "note": "batch my admin"})
    assert r.status_code == 200 and r.json()["batching_preference"] == "batch"
    assert r.json()["stated_overrides"]["batching_preference"] == "batch"
    assert client.post("/api/learning/stated-rule", json={"key": "batching_preference", "value": "x"}).status_code == 422
    r = client.post("/api/learning/stated-rule/clear", json={"key": "batching_preference"})
    assert "batching_preference" not in r.json()["stated_overrides"]


def test_sleep_window_endpoint():
    r = client.post("/api/profile/sleep-window", json={"wake_min": 600, "sleep_min": 1680})
    assert r.status_code == 200 and (r.json()["day_start_min"], r.json()["day_end_min"]) == (600, 1680)
    assert client.post("/api/profile/sleep-window", json={"wake_min": 600, "sleep_min": 700}).status_code == 422


def test_completion_endpoint_updates_completion_rate():
    before = client.get("/api/learning").json()["completion_rate"]
    r = client.post("/api/learning/completion", json={"task_id": "t", "done": False, "planned_minutes": 60})
    assert r.json()["completion_rate"] < before


def test_actual_endpoint_records_close_to_plan_and_asks_otherwise():
    r = client.post("/api/learning/actual", json={"task_id": "t", "planned_minutes": 60, "actual_minutes": 62, "category": "leetcode"})
    assert r.json()["recorded"] and r.json()["learned"]["reflections"] == 1
    r = client.post("/api/learning/actual", json={"task_id": "t", "planned_minutes": 60, "actual_minutes": 100})
    assert r.json() == {"recorded": False, "ask_reflection": True}
    assert client.get("/api/learning").json()["reflections"] == 1


def test_energy_endpoint_accepts_after_meeting_min():
    for _ in range(5):
        r = client.post("/api/learning/energy", json={"level": 1, "after_meeting_min": 40})
    assert r.json()["recovery_after_meeting"] > 15


def test_priority_windows_round_trip_and_validation():
    w = [{"window": "week", "start_iso": "2026-08-03", "end_iso": "2026-08-09",
          "ranked_task_ids": ["a", "b"], "non_negotiable_ids": ["a"]}]
    assert client.put("/api/priority-windows", json=w).status_code == 200
    assert client.get("/api/priority-windows").json()[0]["ranked_task_ids"] == ["a", "b"]
    bad = [{**w[0], "end_iso": "2026-08-01"}]
    assert client.put("/api/priority-windows", json=bad).status_code == 422
    assert client.get("/api/priority-windows").json()[0]["end_iso"] == "2026-08-09"


def test_recovery_changes_what_api_schedule_does():
    WEEK = [5, 6, 7, 8, 9, 10, 11]
    client.post("/api/learning/stated-rule", json={"key": "recovery_after_meeting", "value": 60})
    events = [
        {"id": "call", "title": "call", "day": 6, "startMin": 9 * 60, "durationMin": 60, "category": "interview", "fixed": True},
        {"id": "a", "title": "a", "day": 6, "startMin": 9 * 60 + 30, "durationMin": 30, "category": "admin", "fixed": False},
    ]
    r = client.post("/api/schedule", json={"events": events, "pinned_ids": ["call"], "week_days": WEEK})
    a = {e["id"]: e for e in r.json()["events"]}["a"]
    # without the buffer it would sit right after the call at 10:00; with it, never inside 10:00-11:00
    assert a["day"] != 6 or not (10 * 60 - 30 < a["startMin"] < 11 * 60)
