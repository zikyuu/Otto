from fastapi.testclient import TestClient

from app import main, store
from app.engine import metrics
from app.models import Profile

client = TestClient(main.app)


def by(ms):
    return {m["key"]: m for m in ms}


def test_every_setting_has_a_short_name_a_one_line_meaning_and_how_the_scheduler_uses_it():
    ms = metrics.build(Profile())
    assert len(ms) >= 14
    for m in ms:
        assert m["name"] and m["blurb"] and m["uses"] and m["group"] and m["display"] != ""
        assert len(m["name"]) <= 32 and len(m["blurb"]) <= 70                           # short names, one-line descriptions


def test_a_fresh_profile_is_all_starting_guesses_and_the_source_changes_as_things_happen():
    ms = by(metrics.build(Profile()))
    assert ms["focus_span_min"]["source"] == "default" and ms["peak_window"]["source"] == "default"
    p = Profile()
    p.focus_evidence, p.focus_span_min = 5, 80
    p.stated_overrides["break_min"] = 20
    p.break_min = 20
    ms = by(metrics.build(p))
    assert ms["focus_span_min"]["source"] == "learned" and ms["break_min"]["source"] == "pinned"
    assert ms["chronotype"]["source"] == "measured" and ms["chronotype"]["editable"] is False


def test_pace_and_getting_started_are_listed_per_kind_of_work():
    ms = by(metrics.build(Profile()))
    assert "velocity:deep_work" in ms and "ramp_up_min:deep_work" in ms
    assert ms["velocity:deep_work"]["editable"] is False and ms["ramp_up_min:deep_work"]["can_target"] is True


def test_a_target_can_be_set_read_back_and_cleared_but_only_where_it_makes_sense():
    assert client.put("/api/targets", json={"key": "post_meal_slump_min", "value": 15}).json()["targets"] == {"post_meal_slump_min": 15}
    got = by(client.get("/api/metrics").json()["metrics"])
    assert got["post_meal_slump_min"]["target"] == 15 and got["focus_span_min"]["target"] is None
    assert client.put("/api/targets", json={"key": "peak_window", "value": 3}).status_code == 422
    assert client.put("/api/targets", json={"key": "post_meal_slump_min", "value": None}).json()["targets"] == {}
