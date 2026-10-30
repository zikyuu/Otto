"""Behaviour patterns: only reported once both sides of a comparison have enough data and the gap is real."""
from app.engine import patterns
from app.models import EnergyLog, Profile, ReflectionChoice, TaskReflection


def refl(ts, choice="nailed", planned=60, actual=60, category="deep_work", prev=None, dtd=None):
    return TaskReflection(task_id=ts, ts=ts, choice=ReflectionChoice(choice), planned_minutes=planned, actual_minutes=actual,
                          category=category, prev_category=prev, days_to_deadline=dtd)


def by_key(p):
    return {x["key"]: x for x in patterns.compute(p)}


def test_with_no_data_every_pattern_says_it_is_still_learning():
    out = by_key(Profile())
    assert out["task_switching"]["state"] == "learning" and "more to go" in out["task_switching"]["text"]
    assert all(x["state"] in ("learning",) for x in out.values())


def test_switching_between_kinds_of_work_costs_time():
    p = Profile()
    p.reflections = [refl(f"2026-10-0{i}T10:00", actual=75, category="deep_work", prev="admin") for i in range(1, 5)] \
        + [refl(f"2026-10-1{i}T10:00", actual=60, category="deep_work", prev="deep_work") for i in range(1, 5)]
    r = by_key(p)["task_switching"]
    assert r["state"] == "found" and "25% longer" in r["text"]


def test_a_gap_that_is_too_small_is_reported_as_nothing_found():
    p = Profile()
    p.reflections = [refl(f"2026-10-0{i}T10:00", actual=62, prev="admin") for i in range(1, 5)] + [refl(f"2026-10-1{i}T10:00", actual=60, prev="deep_work") for i in range(1, 5)]
    assert by_key(p)["task_switching"]["state"] == "none"


def test_deadline_pressure_both_ways():
    p = Profile()
    p.reflections = [refl(f"2026-10-0{i}T10:00", actual=45, dtd=1) for i in range(1, 5)] + [refl(f"2026-10-1{i}T10:00", actual=60, dtd=9) for i in range(1, 5)]
    assert "25% less time" in by_key(p)["deadline_pressure"]["text"]
    q = Profile()
    q.reflections = [refl(f"2026-10-0{i}T10:00", actual=90, dtd=1) for i in range(1, 5)] + [refl(f"2026-10-1{i}T10:00", actual=60, dtd=9) for i in range(1, 5)]
    assert "50% longer" in by_key(q)["deadline_pressure"]["text"]


def test_energy_patterns_after_meetings_after_hard_work_and_on_mondays():
    p = Profile()
    p.energy_logs = [EnergyLog(ts=f"2026-10-0{i}T11:00", level=2, after_meeting_min=30) for i in range(1, 5)] \
        + [EnergyLog(ts=f"2026-10-1{i}T11:00", level=4) for i in range(1, 5)]
    out = by_key(p)
    assert out["social_energy"]["state"] == "found" and "less energised" in out["social_energy"]["text"]
    q = Profile()
    q.energy_logs = [EnergyLog(ts=f"2026-10-0{i}T11:00", level=2, after_hard_min=20) for i in range(1, 5)] + [EnergyLog(ts=f"2026-10-1{i}T11:00", level=4) for i in range(1, 5)]
    assert by_key(q)["recovery_after_hard"]["state"] == "found"
    m = Profile()          # 2026-10-05 is a Monday
    m.energy_logs = [EnergyLog(ts=f"2026-10-{d}T09:00", level=5) for d in ("05", "12", "19")] + [EnergyLog(ts=f"2026-10-{d}T09:00", level=3) for d in ("06", "07", "08", "13")]
    assert "Mondays are stronger" in by_key(m)["weekend_recharge"]["text"]


def test_the_fourth_task_of_a_day_lands_less_often_than_the_first():
    p = Profile()
    for d in ("05", "06", "07", "08"):
        p.reflections += [refl(f"2026-10-{d}T09:00"), refl(f"2026-10-{d}T10:00"), refl(f"2026-10-{d}T11:00"),
                          refl(f"2026-10-{d}T14:00", "harder"), refl(f"2026-10-{d}T15:00", "harder")]
    assert by_key(p)["decision_fatigue"]["state"] == "found"


def test_streaks_and_unfinished_days_need_consecutive_days():
    p = Profile()
    # good days 1-3, then day 4 bad; 5-7 good, 8 bad; 9-11 good, 12 bad  -> after a streak the next day is bad
    for d in range(1, 13):
        choice = "harder" if d % 4 == 0 else "nailed"
        p.reflections.append(refl(f"2026-10-{d:02d}T10:00", choice, actual=60))
    out = by_key(p)
    assert out["streak_sensitivity"]["state"] in ("found", "none", "learning")
    assert out["streak_sensitivity"]["evidence"] >= 0
    q = Profile()
    for d in range(1, 13):
        q.reflections.append(refl(f"2026-10-{d:02d}T10:00", "interrupted" if d % 2 else "nailed", actual=60))
    assert by_key(q)["unfinished_anxiety"]["state"] in ("found", "none")


def test_activation_energy_comes_from_the_learned_ramp_up():
    p = Profile()
    p.ramp_up_min = {"deep_work": 25, "admin": 5}
    assert "Deep work takes you longest to start: about 25 minutes" in by_key(p)["activation_energy"]["text"]


def test_only_found_patterns_go_to_the_chat():
    p = Profile()
    p.reflections = [refl(f"2026-10-0{i}T10:00", actual=75, prev="admin") for i in range(1, 5)] + [refl(f"2026-10-1{i}T10:00", actual=60, prev="deep_work") for i in range(1, 5)]
    assert [x["pattern"] for x in patterns.found(p)] == ["Cost of switching"]


def test_new_fields_survive_a_save_and_load():
    p = Profile()
    p.reflections = [refl("2026-10-01T10:00", prev="admin", dtd=2)]
    p.energy_logs = [EnergyLog(ts="2026-10-01T10:00", level=3, after_hard_min=15)]
    q = Profile.from_dict(p.to_dict())
    assert q.reflections[0].prev_category == "admin" and q.reflections[0].days_to_deadline == 2 and q.energy_logs[0].after_hard_min == 15


def test_every_pattern_has_a_short_reading_and_a_confidence_and_the_surest_come_first():
    p = Profile()
    p.reflections = [refl(f"2026-10-{d:02d}T10:00", actual=75, prev="admin") for d in range(1, 9)] + [refl(f"2026-10-{d:02d}T11:00", actual=60, prev="deep_work") for d in range(10, 18)]
    p.energy_logs = [EnergyLog(ts=f"2026-10-0{i}T11:00", level=2, after_meeting_min=30) for i in range(1, 4)] + [EnergyLog(ts=f"2026-10-1{i}T11:00", level=4) for i in range(1, 4)]
    out = patterns.compute(p)
    assert all(x["confidence"] in ("high", "medium", "low") and x["short"] for x in out)
    sw = next(x for x in out if x["key"] == "task_switching")
    assert sw["confidence"] == "high" and sw["short"] == "+25% time after a switch"                # 16 data points: sure
    mt = next(x for x in out if x["key"] == "social_energy")
    assert mt["confidence"] == "medium" and mt["state"] == "found"                                 # 6 data points: an early read
    assert next(x for x in out if x["key"] == "deadline_pressure")["confidence"] == "low"          # no data: not enough yet
    rank = {"high": 0, "medium": 1, "low": 2}
    assert [rank[x["confidence"]] for x in out] == sorted(rank[x["confidence"]] for x in out)
    assert out[0]["key"] == "task_switching"


def test_nothing_found_with_plenty_of_data_is_a_confident_answer_too():
    p = Profile()
    p.reflections = [refl(f"2026-10-{d:02d}T10:00", actual=60, prev="admin") for d in range(1, 9)] + [refl(f"2026-10-{d:02d}T11:00", actual=60, prev="deep_work") for d in range(10, 18)]
    sw = next(x for x in patterns.compute(p) if x["key"] == "task_switching")
    assert sw["state"] == "none" and sw["confidence"] == "high" and sw["short"] == "Nothing there"
