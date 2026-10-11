"""Learning loop: signals in -> Profile updates. Guards against the wonky cases —
runaway averages, junk buckets, one bad entry dominating, noisy peak windows."""
import pytest

from app.engine.learning import (
    MAX_HISTORY, RATIO_MAX, VELOCITY_MAX, VELOCITY_MIN,
    add_energy_log, apply_all_signals, update_peak_window, update_velocity,
)
from app.models import EnergyLog, Profile, ReflectionChoice as RC, TaskReflection


def refl(choice, planned, actual, cat="deep_work"):
    return TaskReflection(task_id="t", ts="2026-08-01T10:00", choice=choice,
                          planned_minutes=planned, actual_minutes=actual, category=cat)


def logs(spec, days=7):
    """spec: [(hour, level)] repeated across `days` days."""
    return [EnergyLog(ts=f"2026-08-{d:02d}T{h:02d}:30", level=l)
            for d in range(1, days + 1) for h, l in spec]


# ---- velocity --------------------------------------------------------------

def test_velocity_converges_to_real_ratio():
    p = Profile()
    for _ in range(20):
        update_velocity(p, refl(RC.HARDER, 60, 90))
    assert p.avg_velocity["deep_work"] == pytest.approx(1.5, abs=0.02)


def test_velocity_moves_gradually_not_in_one_jump():
    p = Profile()
    before = p.avg_velocity["deep_work"]
    update_velocity(p, refl(RC.HARDER, 60, 90))
    after = p.avg_velocity["deep_work"]
    assert before < after < 1.5        # EMA: moved toward 1.5, not to it


def test_nailed_early_lowers_velocity():
    p = Profile()
    for _ in range(10):
        update_velocity(p, refl(RC.NAILED, 60, 45))
    assert p.avg_velocity["deep_work"] < 1.3


@pytest.mark.parametrize("choice", [RC.OUTLIER, RC.INTERRUPTED, RC.GAP])
def test_excluded_choices_never_touch_velocity(choice):
    p = Profile()
    update_velocity(p, refl(choice, 60, 200))
    assert p.avg_velocity == Profile().avg_velocity


def test_zero_actual_minutes_does_not_collapse_velocity():
    p = Profile()
    for _ in range(20):
        update_velocity(p, refl(RC.NAILED, 60, 0))
    assert p.avg_velocity["deep_work"] == Profile().avg_velocity["deep_work"]


def test_single_absurd_entry_is_bounded():
    p = Profile()
    update_velocity(p, refl(RC.HARDER, 60, 600))   # forgot to stop the timer
    step = p.avg_velocity["deep_work"] - 1.3
    assert step <= 0.2 * (RATIO_MAX - 1.3) + 1e-6   # one entry moves at most EMA_WEIGHT of the clamped gap


def test_velocity_stays_inside_band_forever():
    p = Profile()
    for _ in range(200):
        update_velocity(p, refl(RC.HARDER, 10, 9999))
    assert p.avg_velocity["deep_work"] <= VELOCITY_MAX
    for _ in range(200):
        update_velocity(p, refl(RC.NAILED, 600, 1))
    assert p.avg_velocity["deep_work"] >= VELOCITY_MIN


def test_unknown_category_does_not_create_a_bucket():
    p = Profile()
    update_velocity(p, refl(RC.HARDER, 60, 90, cat="leetcode"))
    assert set(p.avg_velocity) == set(Profile().avg_velocity)


def test_categories_learn_independently():
    p = Profile()
    for _ in range(10):
        update_velocity(p, refl(RC.HARDER, 60, 120, cat="creative"))
    assert p.avg_velocity["creative"] > 1.6
    assert p.avg_velocity["deep_work"] == 1.3      # untouched


# ---- peak window -----------------------------------------------------------

def test_peak_window_waits_for_enough_data():
    p = Profile()
    p.energy_logs = logs([(14, 5), (15, 5), (16, 5)], days=3)   # 9 logs
    update_peak_window(p)
    assert p.peak_window == (9, 12)


def test_peak_window_finds_afternoon_peak():
    p = Profile()
    p.energy_logs = logs([(7, 2), (8, 3), (9, 3), (10, 3), (11, 3), (14, 5), (15, 5), (16, 5), (17, 4), (20, 2)])
    update_peak_window(p)
    assert p.peak_window == (14, 17)


def test_peak_window_ignores_users_who_only_log_one_hour():
    p = Profile()
    p.energy_logs = [EnergyLog(ts=f"2026-08-{d:02d}T21:00", level=5) for d in range(1, 12)]
    update_peak_window(p)
    assert p.peak_window == (9, 12)       # one hour of data isn't a pattern


def test_peak_window_ignores_one_lone_great_moment():
    p = Profile()
    p.energy_logs = [EnergyLog(ts="2026-08-01T07:00", level=5)] + logs([(13, 3), (14, 3), (15, 3)], days=4)
    update_peak_window(p)
    assert p.peak_window == (13, 16)


def test_peak_window_is_always_three_hours_inside_the_day():
    p = Profile()
    p.energy_logs = logs([(19, 5), (20, 5), (21, 5), (22, 5)])
    update_peak_window(p)
    s, e = p.peak_window
    assert e - s == 3 and 6 <= s and e <= 24


def test_peak_window_survives_malformed_timestamps():
    p = Profile()
    p.energy_logs = logs([(14, 5), (15, 5), (16, 5), (9, 2)]) + [EnergyLog(ts="garbage", level=3)]
    update_peak_window(p)
    assert p.peak_window == (14, 17)


def test_add_energy_log_updates_window_once_enough_logs():
    p = Profile()
    for d in range(1, 8):
        for h, l in [(9, 2), (10, 2), (11, 2), (15, 5), (16, 5), (17, 5)]:
            add_energy_log(p, EnergyLog(ts=f"2026-08-{d:02d}T{h:02d}:15", level=l))
    assert p.peak_window == (15, 18)


# ---- completion rate + history ---------------------------------------------

def test_completion_rate_drops_on_misses_and_recovers():
    p = Profile()
    for _ in range(10):
        apply_all_signals(p, refl(RC.HARDER, 60, 0))
    low = p.completion_rate
    assert low < 0.3
    for _ in range(15):
        apply_all_signals(p, refl(RC.NAILED, 60, 55))
    assert p.completion_rate > low + 0.4


def test_interrupted_is_not_held_against_the_user():
    p = Profile()
    apply_all_signals(p, refl(RC.INTERRUPTED, 60, 0))
    assert p.completion_rate == Profile().completion_rate


def test_reflections_are_kept_as_history_and_capped():
    p = Profile()
    for i in range(MAX_HISTORY + 25):
        apply_all_signals(p, refl(RC.NAILED, 60, 60))
    assert len(p.reflections) == MAX_HISTORY


def test_profile_survives_save_load_roundtrip_with_learning_state():
    p = Profile()
    apply_all_signals(p, refl(RC.HARDER, 60, 120))
    add_energy_log(p, EnergyLog(ts="2026-08-01T09:00", level=4))
    q = Profile.from_dict(p.to_dict())
    assert q.to_dict() == p.to_dict()
    assert q.reflections[0].choice == RC.HARDER
