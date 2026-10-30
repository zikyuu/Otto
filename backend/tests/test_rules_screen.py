from fastapi.testclient import TestClient

from app import main, store
from app.engine import chat

client = TestClient(main.app)


def test_pinned_rules_are_listed_in_words_and_can_be_released():
    assert client.post("/api/learning/stated-rule", json={"key": "gym_first", "value": True, "note": "gym first"}).status_code == 200
    assert client.post("/api/learning/stated-rule", json={"key": "peak_window", "value": [10, 13]}).status_code == 200
    got = client.get("/api/rules").json()
    labels = {r["key"]: r["label"] for r in got["pinned"]}
    assert labels["gym_first"] == "Exercise comes before deep work" and labels["peak_window"].endswith("10:00 to 13:00")
    client.post("/api/learning/stated-rule/clear", json={"key": "gym_first"})
    assert "gym_first" not in {r["key"] for r in client.get("/api/rules").json()["pinned"]}


def test_every_rule_in_the_catalogue_is_one_the_engine_accepts():
    p = store.load_profile()
    samples = {"hours": [9, 12], "clock": 9 * 60, "minutes": 45, "percent": 0.7, "choice": "batch", "bool": True}
    from app.engine import learning
    for r in chat.CATALOGUE:
        v = samples[r["kind"]]
        if r["key"] == "day_end_min":
            v = 23 * 60
        if r["key"] == "post_meal_slump_min" or r["key"] == "recovery_after_meeting":
            v = 20
        learning._validate_rule(p, r["key"], v)
