"""HTTP-level: /api/schedule runs the engine (no LLM), and the learning endpoints change
what it does next. Week used: Mon 5 .. Sun 11 (date-of-month), so day 6 = Tuesday."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
WEEK = [5, 6, 7, 8, 9, 10, 11]


def ev(id, day, start, dur, cat="admin", fixed=False, **kw):
    return {"id": id, "title": id, "day": day, "startMin": start, "durationMin": dur,
            "category": cat, "fixed": fixed, **kw}


def schedule(events, pinned=(), mode="displaced", **kw):
    r = client.post("/api/schedule", json={"events": events, "pinned_ids": list(pinned),
                                           "week_days": WEEK, "mode": mode, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def by_id(res):
    return {e["id"]: e for e in res["events"]}


def test_gpt_reschedule_route_is_gone():
    assert client.post("/api/ai/reschedule", json={}).status_code in (404, 405)
    assert "ai/reschedule" not in str([r.path for r in app.routes])


def test_schedule_works_with_no_api_keys():
    res = schedule([ev("a", 6, 600, 60)], pinned=["a"])
    assert res["events"][0]["id"] == "a"


def test_drag_onto_an_event_pushes_the_displaced_one_and_leaves_the_rest():
    events = [
        ev("pinned", 6, 14 * 60, 60),         # user just dropped this at 14:00 Tue
        ev("victim", 6, 14 * 60 + 15, 30),    # overlaps it -> must move
        ev("bystander", 6, 9 * 60, 30),       # unrelated -> must NOT move
        ev("locked", 7, 10 * 60, 60, fixed=True),
    ]
    res = schedule(events, pinned=["pinned"])
    got = by_id(res)
    assert (got["pinned"]["day"], got["pinned"]["startMin"]) == (6, 14 * 60)
    assert (got["bystander"]["day"], got["bystander"]["startMin"]) == (6, 9 * 60)
    assert (got["locked"]["day"], got["locked"]["startMin"]) == (7, 10 * 60)
    assert res["moved"] == ["victim"]
    v = got["victim"]
    assert not (v["day"] == 6 and v["startMin"] < 15 * 60 and v["startMin"] + 30 > 14 * 60)
    assert v["day"] == 6                      # stays on its own day when there's room
    assert res["conflicts"] == []


def test_displaced_event_keeps_duration_and_extra_fields():
    events = [ev("pinned", 6, 600, 60), ev("victim", 6, 600, 45, color="#abc", note="hi")]
    got = by_id(schedule(events, pinned=["pinned"]))["victim"]
    assert got["durationMin"] == 45 and got["color"] == "#abc" and got["note"] == "hi"


def test_nothing_overlaps_after_a_reschedule():
    events = [ev(f"e{i}", 6, 9 * 60 + 15 * i, 60) for i in range(5)] + [ev("pin", 6, 10 * 60, 90)]
    res = schedule(events, pinned=["pin"])
    spans = sorted((e["day"], e["startMin"], e["startMin"] + e["durationMin"]) for e in res["events"])
    for (d1, s1, e1), (d2, s2, e2) in zip(spans, spans[1:]):
        assert d1 != d2 or e1 <= s2, (spans, res["conflicts"])


def test_no_room_means_conflict_not_silent_overlap():
    events = [ev(f"f{d}", d, 8 * 60, 15 * 60, fixed=True) for d in WEEK]
    events += [ev("pin", 6, 10 * 60, 60), ev("victim", 6, 10 * 60, 60)]
    res = schedule(events, pinned=["pin"])
    assert "victim" in res["conflicts"]


def test_past_days_are_never_used():
    # today = Wed (idx 2) 13:00. A displaced Wed event can't move to Mon/Tue or earlier today.
    import app.main as m
    real = m.datetime

    class FakeDT(real):
        @classmethod
        def now(cls, tz=None):
            return real(2026, 8, 5, 13, 0)

    m.datetime = FakeDT
    try:
        events = [ev("pin", 7, 14 * 60, 60), ev("victim", 7, 14 * 60, 60, cat="admin")]
        res = schedule(events, pinned=["pin"], week_start_iso="2026-08-03")
    finally:
        m.datetime = real
    v = by_id(res)["victim"]
    idx = WEEK.index(v["day"])
    assert idx >= 2 and (idx > 2 or v["startMin"] >= 13 * 60)


def test_overlap_on_a_past_day_is_flagged_and_explained_not_silent():
    import app.main as m
    real = m.datetime

    class FakeDT(real):
        @classmethod
        def now(cls, tz=None):
            return real(2026, 8, 7, 12, 0)     # Friday: Mon-Thu are history

    m.datetime = FakeDT
    try:
        events = [ev("a", 6, 10 * 60, 45), ev("b", 6, 10 * 60 + 15, 20)]     # Tuesday, already past
        res = schedule(events, pinned=["b"], week_start_iso="2026-08-03")
    finally:
        m.datetime = real
    assert res["moved"] == []
    assert set(res["conflicts"]) == {"a", "b"}
    assert "already passed" in res["explanation"]


def test_prereq_order_violation_is_fixed_by_moving_the_dependent():
    events = [
        ev("study", 6, 15 * 60, 60),
        ev("interview", 6, 9 * 60, 60, prereq_ids=["study"]),   # starts BEFORE its prereq
    ]
    res = schedule(events, pinned=["study"])
    got = by_id(res)
    s, i = got["study"], got["interview"]
    assert (i["day"], i["startMin"]) >= (s["day"], s["startMin"] + s["durationMin"])
    assert res["conflicts"] == []


def test_pinned_dependent_dragged_before_prereq_is_flagged():
    events = [ev("study", 6, 15 * 60, 60), ev("interview", 6, 9 * 60, 60, prereq_ids=["study"])]
    res = schedule(events, pinned=["interview"])     # user insists; engine can't move it
    assert "interview" in res["conflicts"]


def test_bad_input_is_rejected_cleanly():
    assert client.post("/api/schedule", json={"events": [], "week_days": [1, 2, 3]}).status_code == 422
    assert client.post("/api/schedule", json={"events": [], "week_days": WEEK, "mode": "nope"}).status_code == 422
    assert client.post("/api/schedule", json={"events": [], "week_days": WEEK,
                                              "week_start_iso": "not-a-date"}).status_code == 422


# ---- learning loop -> scheduler ---------------------------------------------

def reflect(planned, actual, choice="harder", cat="deep_work"):
    r = client.post("/api/learning/reflection", json={
        "task_id": "t", "choice": choice, "planned_minutes": planned,
        "actual_minutes": actual, "category": cat})
    assert r.status_code == 200, r.text
    return r.json()


def test_learning_endpoints_validate_input():
    assert client.post("/api/learning/reflection", json={"task_id": "t", "choice": "harder",
                       "planned_minutes": 0, "actual_minutes": 5}).status_code == 422
    assert client.post("/api/learning/reflection", json={"task_id": "t", "choice": "bogus",
                       "planned_minutes": 30, "actual_minutes": 5}).status_code == 422
    assert client.post("/api/learning/energy", json={"level": 9}).status_code == 422


def test_reflection_updates_and_persists_learned_state():
    before = client.get("/api/learning").json()
    after = reflect(60, 120)
    assert after["avg_velocity"]["deep_work"] > before["avg_velocity"]["deep_work"]
    assert after["reflections"] == 1
    assert client.get("/api/learning").json()["avg_velocity"] == after["avg_velocity"]


def test_frontend_category_labels_are_mapped_for_learning():
    after = reflect(60, 120, cat="leetcode")         # -> deep_work
    assert after["avg_velocity"]["deep_work"] > 1.3
    assert set(after["avg_velocity"]) == {"deep_work", "admin", "creative", "physical", "social"}


def test_learned_slowness_changes_where_the_scheduler_puts_things():
    # Tue: 08:00-11:00 locked, 12:20-23:00 locked -> an 80-min gap at 11:00.
    # A 45-min deep-work event sits in it. Cold start needs 45*1.3+15 = 73 min: fits.
    events = [
        ev("A", 6, 8 * 60, 180, fixed=True), ev("B", 6, 12 * 60 + 20, 640, fixed=True),
        ev("task", 6, 11 * 60, 45, cat="deep_work"),
    ]
    assert schedule(events, mode="full")["moved"] == []

    for _ in range(8):                      # user keeps taking 2.5x as long as planned
        reflect(60, 150)
    res = schedule(events, mode="full")     # now needs ~110+15 min: no longer fits that gap
    assert res["moved"] == ["task"]
    t = by_id(res)["task"]
    assert (t["day"], t["startMin"]) != (6, 11 * 60)


def _afternoon_energy():
    for day in range(1, 9):
        for h, lvl in [(9, 2), (10, 2), (11, 2), (14, 5), (15, 5), (16, 5)]:
            r = client.post("/api/learning/energy", json={"level": lvl, "ts": f"2026-08-{day:02d}T{h:02d}:30"})
            assert r.status_code == 200


def test_learned_peak_window_moves_demanding_work_to_the_afternoon():
    events = [ev("deep", 6, 9 * 60, 120, cat="leetcode")]     # 120 min -> HIGH effort, needs peak window
    assert schedule(events, mode="full")["moved"] == []        # 09:00 is inside default peak 9-12
    _afternoon_energy()
    assert client.get("/api/learning").json()["peak_window"] == [14, 17]
    got = by_id(schedule(events, mode="full"))["deep"]
    assert 14 * 60 <= got["startMin"] < 17 * 60 and got["day"] == 6


def test_displaced_mode_does_not_touch_events_that_are_fine():
    events = [ev("deep", 6, 9 * 60, 120, cat="leetcode")]
    _afternoon_energy()
    assert schedule(events)["moved"] == []        # default mode only fixes what a change broke


def test_plan_endpoint_uses_the_same_learned_profile_and_new_field_names():
    for _ in range(8):
        reflect(60, 150)
    r = client.post("/api/plan", json={"profile": {"skills": [], "time_blocks": [
        {"day": 0, "start_min": 540, "end_min": 720, "label": "class"}]},
        "goals": [{"id": "g", "title": "Role", "required_skills": ["python", "sql"], "fit": 0.9}],
        "deadline_day": 6})
    assert r.status_code == 200, r.text
    assert r.json()["plan"]["blocks"]
