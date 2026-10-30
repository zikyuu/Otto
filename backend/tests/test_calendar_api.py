"""HTTP-level: /api/schedule runs the engine (no LLM), and the learning endpoints change
what it does next. Week used: Mon 5 .. Sun 11 (date-of-month), so day 6 = Tuesday."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
WEEK = [5, 6, 7, 8, 9, 10, 11]


def ev(id, day, start, dur, cat="admin", fixed=False, **kw):
    return {"id": id, "title": id, "day": day, "startMin": start, "durationMin": dur,
            "category": cat, "fixed": fixed, **kw}


def schedule(events, pinned=(), mode="displaced", plan_ids=(), **kw):
    r = client.post("/api/schedule", json={"events": events, "pinned_ids": list(pinned), "plan_ids": list(plan_ids),
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


def test_split_sessions_are_placed_in_free_slots_in_order():
    # what the frontend sends for a 6h block split in 3: all stacked on the same spot, chained,
    # first one pinned. Engine must keep #1, then place #2 after #1 and #3 after #2, no overlaps.
    events = [ev(f"s{i}", 6, 9 * 60, 120, cat="leetcode", **({"prereq_ids": [f"s{i - 1}"]} if i > 1 else {}))
              for i in (1, 2, 3)]
    res = schedule(events, pinned=["s1"])
    got = by_id(res)
    assert (got["s1"]["day"], got["s1"]["startMin"]) == (6, 9 * 60)
    end = lambda e: (e["day"], e["startMin"] + e["durationMin"])
    start = lambda e: (e["day"], e["startMin"])
    assert start(got["s2"]) >= end(got["s1"])
    assert start(got["s3"]) >= end(got["s2"])
    assert res["conflicts"] == []
    spans = sorted((e["day"], e["startMin"], e["startMin"] + e["durationMin"]) for e in res["events"])
    for (d1, s1, e1), (d2, s2, e2) in zip(spans, spans[1:]):
        assert d1 != d2 or e1 <= s2


# ---- the scheduler decides splits for new events, from the learned focus span -----

from app import store  # noqa: E402


def set_focus(span, evidence):
    with store.locked_profile() as p:
        p.focus_span_min, p.focus_evidence = span, evidence


def new_event(**kw):
    return ev("new", 6, 9 * 60, 360, cat="llm", **kw)       # a 6h deep-work block


def test_new_long_event_is_left_alone_until_the_scheduler_has_evidence():
    set_focus(120, 1)
    res = schedule([new_event()], pinned=["new"], plan_ids=["new"])
    assert [e["id"] for e in res["events"]] == ["new"]


def test_new_long_event_is_split_when_focus_history_says_it_fades():
    set_focus(120, 6)
    res = schedule([new_event()], pinned=["new"], plan_ids=["new"])
    got = res["events"]
    assert len(got) >= 3 and all(e["split_of"] == "new" for e in got)
    assert sum(e["durationMin"] for e in got) == 360
    assert "focus" in res["explanation"] and "Split" in res["explanation"]
    # placed one after another, but not chained: sessions can be done in any order (unless the task is order-specific)
    assert [e["session"] for e in got] == list(range(1, len(got) + 1))
    for prev, cur in zip(got, got[1:]):
        assert cur["prereq_ids"] == []
        assert (cur["day"], cur["startMin"]) >= (prev["day"], prev["startMin"] + prev["durationMin"])
    assert res["conflicts"] == []


def test_new_long_event_stays_whole_for_someone_who_sustains_long_focus():
    set_focus(480, 8)
    res = schedule([new_event()], pinned=["new"], plan_ids=["new"])
    assert [e["id"] for e in res["events"]] == ["new"] and res["events"][0]["durationMin"] == 360


def test_a_drag_never_splits_an_existing_event():
    set_focus(120, 6)
    res = schedule([new_event()], pinned=["new"])            # no plan_ids: just a move
    assert [e["id"] for e in res["events"]] == ["new"]


def test_fixed_events_are_never_split():
    set_focus(120, 6)
    res = schedule([new_event(fixed=True)], plan_ids=["new"])
    assert [e["id"] for e in res["events"]] == ["new"]


def test_subtasks_are_carried_across_the_sessions_without_losing_minutes():
    set_focus(120, 6)
    subs = [{"id": "a", "name": "Research", "minutes": 180, "order": 1},
            {"id": "b", "name": "Write", "minutes": 180, "order": 2}]
    res = schedule([new_event(subtasks=subs)], pinned=["new"], plan_ids=["new"])
    total = sum(s["minutes"] for e in res["events"] for s in e.get("subtasks", []))
    assert total == 360
    for e in res["events"]:
        assert sum(s["minutes"] for s in e.get("subtasks", [])) == e["durationMin"]


def test_off_track_signals_teach_the_split_through_the_api():
    # three labelled focus breaks ~an hour in -> evidence + a shorter span -> the same 4h block now splits
    ev4 = ev("new", 6, 9 * 60, 240, cat="llm")
    assert [e["id"] for e in schedule([ev4], pinned=["new"], plan_ids=["new"])["events"]] == ["new"]
    for _ in range(3):
        r = client.post("/api/learning/off-track", json={"reason": "couldnt_focus", "duration_min": 20, "into_task_min": 60})
        assert r.status_code == 200, r.text
    learned = client.get("/api/learning").json()
    assert learned["focus_evidence"] == 3 and learned["focus_span_min"] < 120
    res = schedule([ev4], pinned=["new"], plan_ids=["new"])
    assert len(res["events"]) >= 2 and all(e.get("split_of") == "new" for e in res["events"])


def test_off_track_endpoint_validates():
    assert client.post("/api/learning/off-track", json={"reason": "bogus", "duration_min": 5}).status_code == 422
    assert client.post("/api/learning/off-track", json={"reason": "couldnt_focus", "duration_min": 0}).status_code == 422


# ---- two-week view + reschedule selection mode --------------------------------------------

WEEK2 = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]


def schedule2(events, **kw):
    r = client.post("/api/schedule", json={"events": events, "week_days": WEEK2, **kw})
    assert r.status_code == 200, r.text
    return r.json()


def test_week_days_must_be_one_or_two_weeks():
    assert client.post("/api/schedule", json={"events": [], "week_days": list(range(1, 11))}).status_code == 422


def test_two_week_view_can_place_an_event_in_the_second_week():
    events = [ev("pin", 12, 10 * 60, 60, fixed=True), ev("hit", 12, 10 * 60 + 15, 30)]
    res = schedule2(events, pinned_ids=["pin"])
    hit = by_id(res)["hit"]
    assert hit["id"] == "hit" and not (hit["day"] == 12 and 10 * 60 - 30 < hit["startMin"] < 11 * 60)
    assert "Mon" in res["explanation"] or "Tue" in res["explanation"] or hit["day"] != 12


def test_recurring_time_blocks_repeat_in_the_second_week():
    from app import store
    from app.models import TimeBlock
    with store.locked_profile() as p:
        p.time_blocks = [TimeBlock(0, 8 * 60, 18 * 60, "work")]     # every Monday 8-18
    events = [ev("pin", 12, 7 * 60, 30, fixed=True), ev("a", 12, 7 * 60 + 15, 30)]   # day 12 = second Monday
    res = schedule2(events, pinned_ids=["pin"])
    a = by_id(res)["a"]
    assert not (a["day"] == 12 and 8 * 60 <= a["startMin"] < 18 * 60) and not (a["day"] == 5 and 8 * 60 <= a["startMin"] < 18 * 60)


def test_blocked_window_pushes_events_out_of_it():
    events = [ev("a", 6, 10 * 60, 60), ev("b", 6, 12 * 60, 60)]
    res = schedule(events, blocked_windows=[{"day": 6, "start_min": 9 * 60, "end_min": 11 * 60 + 30}])
    out = by_id(res)
    a = out["a"]
    assert not (a["day"] == 6 and a["startMin"] < 11 * 60 + 30 and a["startMin"] + 60 > 9 * 60)
    assert (out["b"]["day"], out["b"]["startMin"]) == (6, 12 * 60)      # untouched
    assert "a" in res["moved"] and "b" not in res["moved"]


def test_nothing_is_placed_inside_a_blocked_window():
    events = [ev("a", 6, 9 * 60, 120), ev("b", 6, 9 * 60 + 30, 30)]
    res = schedule(events, blocked_windows=[{"day": 6, "start_min": 9 * 60, "end_min": 12 * 60}])
    for e in res["events"]:
        assert not (e["day"] == 6 and e["startMin"] < 12 * 60 and e["startMin"] + e["durationMin"] > 9 * 60)


def test_fixed_event_inside_a_blocked_window_stays():
    events = [ev("fx", 6, 10 * 60, 60, fixed=True)]
    res = schedule(events, blocked_windows=[{"day": 6, "start_min": 9 * 60, "end_min": 12 * 60}])
    assert by_id(res)["fx"]["startMin"] == 10 * 60


# ---- ordering violations are named, not "couldn't fit" -----------------------------------

def test_dragging_a_dependent_before_its_prerequisite_names_the_problem():
    events = [ev("prep", 7, 11 * 60, 60), ev("apply", 6, 10 * 60, 30, prereq_ids=["prep"])]
    res = schedule(events, pinned_ids=["apply"])       # the user put "apply" (Tue) before "prep" (Wed)
    assert res["order_violations"] == [{"id": "apply", "prereq_ids": ["prep"]}]
    assert '"apply" has to come after "prep"' in res["explanation"]
    assert "Couldn't fit" not in res["explanation"]
    assert "apply" in res["conflicts"]


def test_unpinning_the_dependent_lets_the_scheduler_move_it_after():
    events = [ev("prep", 7, 11 * 60, 60), ev("apply", 6, 10 * 60, 30, prereq_ids=["prep"])]
    res = schedule(events, pinned_ids=["prep"])        # "Move it after": the prerequisite stays, the dependent moves
    assert res["order_violations"] == []
    apply = by_id(res)["apply"]
    assert (apply["day"], apply["startMin"]) >= (7, 12 * 60)


def test_no_violations_when_the_order_holds():
    events = [ev("prep", 6, 9 * 60, 60), ev("apply", 7, 10 * 60, 30, prereq_ids=["prep"])]
    assert schedule(events, pinned_ids=["apply"])["order_violations"] == []


# ---- fixing a broken order by moving the prerequisites earlier ---------------------------------

def test_pull_prerequisites_earlier_keeps_the_dependent_where_the_user_put_it():
    events = [ev("prep", 7, 11 * 60, 60), ev("apply", 6, 10 * 60, 30, prereq_ids=["prep"])]   # apply (Tue) is before prep (Wed)
    res = schedule(events, pinned_ids=["apply"], fix_order="move_prerequisites")
    out = by_id(res)
    assert (out["apply"]["day"], out["apply"]["startMin"]) == (6, 10 * 60)
    assert (out["prep"]["day"], out["prep"]["startMin"] + out["prep"]["durationMin"]) <= (6, 10 * 60)
    assert res["order_violations"] == []


def test_pull_earlier_moves_a_whole_chain_and_keeps_its_order():
    events = [ev("p1", 8, 9 * 60, 60), ev("p2", 8, 11 * 60, 60, prereq_ids=["p1"]), ev("p3", 8, 14 * 60, 60, prereq_ids=["p2"]),
              ev("apply", 6, 13 * 60, 30, prereq_ids=["p3"])]
    res = schedule(events, pinned_ids=["apply"], fix_order="move_prerequisites")
    out = by_id(res)
    end = lambda e: (e["day"], e["startMin"] + e["durationMin"])
    start = lambda e: (e["day"], e["startMin"])
    assert (out["apply"]["day"], out["apply"]["startMin"]) == (6, 13 * 60)
    assert end(out["p1"]) <= start(out["p2"]) and end(out["p2"]) <= start(out["p3"]) and end(out["p3"]) <= start(out["apply"])
    assert res["order_violations"] == []


def test_pull_earlier_that_cannot_fit_is_reported_not_faked():
    # apply is the very first thing on the first day; nothing can finish before it
    events = [ev("prep", 7, 11 * 60, 60), ev("apply", 5, 8 * 60, 30, prereq_ids=["prep"])]
    res = schedule(events, pinned_ids=["apply"], fix_order="move_prerequisites")
    assert res["order_violations"] == [{"id": "apply", "prereq_ids": ["prep"]}]


def test_pull_earlier_leaves_a_locked_prerequisite_alone():
    events = [ev("prep", 7, 11 * 60, 60, fixed=True), ev("apply", 6, 10 * 60, 30, prereq_ids=["prep"])]
    res = schedule(events, pinned_ids=["apply"], fix_order="move_prerequisites")
    assert by_id(res)["prep"]["startMin"] == 11 * 60 and res["order_violations"]


def test_default_still_moves_the_dependent():
    events = [ev("prep", 7, 11 * 60, 60), ev("apply", 6, 10 * 60, 30, prereq_ids=["prep"])]
    out = by_id(schedule(events, pinned_ids=["prep"]))
    assert (out["apply"]["day"], out["apply"]["startMin"]) >= (7, 12 * 60)


# ---- making room: a window cleared FOR an event and what it waits for ---------------------------

def test_a_reserved_window_clears_other_events_out_and_holds_the_prerequisite():
    events = [
        ev("f1", 6, 8 * 60, 60), ev("f2", 6, 9 * 60, 60),               # flexible fillers packed into Tuesday morning
        ev("apply", 6, 10 * 60, 30, prereq_ids=["prep"]),                # the user put this at 10:00 Tue
        ev("prep", 7, 11 * 60, 60),                                      # ...but it has to wait for prep, which is on Wednesday
        ev("lock", 5, 8 * 60, 15 * 60, fixed=True),                      # Monday is a locked wall
    ]
    plain = schedule(events, pinned_ids=["apply"], fix_order="move_prerequisites")
    assert plain["order_violations"], "no room before 10:00 Tue without clearing something"

    win = [{"day": 6, "start_min": 8 * 60, "end_min": 10 * 60, "for_ids": ["apply"]}]
    res = schedule(events, pinned_ids=["apply"], fix_order="move_prerequisites", blocked_windows=win)
    out = by_id(res)
    assert res["order_violations"] == []
    prep = out["prep"]
    assert (prep["day"], prep["startMin"] + prep["durationMin"]) <= (6, 10 * 60)
    for fid in ("f1", "f2"):                                              # the fillers left the window
        f = out[fid]
        assert not (f["day"] == 6 and f["startMin"] < 10 * 60 and f["startMin"] + f["durationMin"] > 8 * 60)
    assert (out["apply"]["day"], out["apply"]["startMin"]) == (6, 10 * 60)


def test_a_plain_blocked_window_still_keeps_everything_out():
    events = [ev("a", 6, 10 * 60, 60)]
    res = schedule(events, blocked_windows=[{"day": 6, "start_min": 9 * 60, "end_min": 12 * 60}])
    a = by_id(res)["a"]
    assert not (a["day"] == 6 and a["startMin"] < 12 * 60 and a["startMin"] + 60 > 9 * 60)


# ---- split sessions: any order, with the subtask each piece belongs to ---------------------------

def _split_events():
    from app import store
    with store.locked_profile() as p:                      # a user whose focus is known to fade after ~1h
        p.focus_span_min, p.focus_evidence = 60, 5
    return [ev("big", 6, 9 * 60, 240, cat="llm",
               subtasks=[{"id": "s1", "name": "Research", "minutes": 120, "order": 1}, {"id": "s2", "name": "Write", "minutes": 120, "order": 2}])]


def test_split_sessions_are_not_chained_unless_the_task_is_order_specific():
    res = schedule(_split_events(), pinned_ids=[], plan_ids=["big"])
    sessions = [e for e in res["events"] if e.get("split_of") == "big"]
    assert len(sessions) >= 3
    assert all(not any(p.startswith("big#") for p in e.get("prereq_ids", [])) for e in sessions)
    assert res["order_violations"] == []


def test_order_specific_sessions_still_chain():
    evs = _split_events()
    evs[0]["order_specific"] = True
    sessions = sorted([e for e in schedule(evs, plan_ids=["big"])["events"] if e.get("split_of") == "big"], key=lambda e: e["session"])
    assert sessions[1]["prereq_ids"] == [sessions[0]["id"]] or sessions[1]["prereq_ids"] == ["big#1"]


def test_each_piece_remembers_which_subtask_it_came_from():
    sessions = [e for e in schedule(_split_events(), plan_ids=["big"])["events"] if e.get("split_of") == "big"]
    pieces = [p for e in sessions for p in e.get("subtasks", [])]
    assert {p["base_id"] for p in pieces} == {"s1", "s2"}
    for base, total in (("s1", 120), ("s2", 120)):
        mine = [p for p in pieces if p["base_id"] == base]
        assert sum(p["minutes"] for p in mine) == total and all(p["base_minutes"] == total for p in mine)
    assert all(e["base_title"] == "big" for e in sessions)


def test_a_session_can_be_dragged_before_another_without_an_order_error():
    res = schedule(_split_events(), plan_ids=["big"])
    sessions = sorted([e for e in res["events"] if e.get("split_of") == "big"], key=lambda e: e["session"])
    first, second = sessions[0], sessions[1]
    swapped = [{**e, "day": second["day"], "startMin": second["startMin"]} if e["id"] == first["id"] else
               {**e, "day": first["day"], "startMin": first["startMin"]} if e["id"] == second["id"] else e for e in res["events"]]
    out = schedule(swapped, pinned_ids=[second["id"]])
    assert out["order_violations"] == []


# ---- an event longer than a day is spread across days, into whatever time is free -------------------

def test_a_marathon_event_is_split_across_days_even_with_no_focus_history():
    big = ev("marathon", 6, 20 * 60, 600, cat="admin", span_days=True)       # 10 hours, starting at 20:00
    res = schedule([big], plan_ids=["marathon"])
    sessions = [e for e in res["events"] if e.get("split_of") == "marathon"]
    assert len(sessions) >= 4
    assert sum(e["durationMin"] for e in sessions) == 600
    assert all(e["startMin"] + e["durationMin"] <= 23 * 60 for e in sessions), "nothing runs off the end of the day"
    assert len({e["day"] for e in sessions}) >= 4, "spread over several days"
    assert res["conflicts"] == []


def test_a_marathon_keeps_its_subtasks_split_by_piece():
    big = ev("m", 6, 20 * 60, 480, cat="admin", span_days=True,
             subtasks=[{"id": "a", "name": "Part A", "minutes": 240, "order": 1}, {"id": "b", "name": "Part B", "minutes": 240, "order": 2}])
    sessions = [e for e in schedule([big], plan_ids=["m"])["events"] if e.get("split_of") == "m"]
    pieces = [p for e in sessions for p in e.get("subtasks", [])]
    assert {p["base_id"] for p in pieces} == {"a", "b"}
    assert sum(p["minutes"] for p in pieces) == 480


def test_without_the_flag_a_normal_event_is_left_whole():
    res = schedule([ev("plain", 6, 9 * 60, 240, cat="admin")], plan_ids=["plain"])
    assert [e["id"] for e in res["events"]] == ["plain"]


# ---- clearing time must not push a prerequisite past the block that waits for it ----------------------------
# (called on the engine directly with a fixed "today", because the HTTP route uses the real clock)

def _plan(events, blocked, now_min=8 * 60):
    from datetime import date
    from app.engine.calendar_bridge import reschedule_events
    from app.models import Profile
    return reschedule_events(events, [], Profile(), WEEK, week_start=date(2026, 10, 5), today=date(2026, 10, 5), now_min=now_min,
                             mode="displaced", blocked_windows=blocked)


def test_clearing_a_prerequisites_slot_moves_it_earlier_not_after_its_dependent():
    """Thu 9:00 'leet' must come before Thu 14:00 'onsite'. Clearing Thu 8:30-13:45 moves 'leet'; there is room on Mon-Wed, so it
    has to go there, not to Thu evening (after 'onsite') with a 'couldn't fit' warning."""
    events = [ev("leet", 8, 9 * 60, 60, "leetcode"), ev("onsite", 8, 14 * 60, 90, "system-design", prereq_ids=["leet"])]
    res = _plan(events, [{"day": 8, "start_min": 8 * 60 + 30, "end_min": 13 * 60 + 45}])
    got = by_id(res)
    leet, onsite = got["leet"], got["onsite"]
    assert (onsite["day"], onsite["startMin"]) == (8, 14 * 60)                 # the one that was not in the window stays
    assert (leet["day"], leet["startMin"] + leet["durationMin"]) <= (onsite["day"], onsite["startMin"])
    assert not (leet["day"] == 8 and leet["startMin"] < 13 * 60 + 45 and leet["startMin"] + leet["durationMin"] > 8 * 60 + 30)    # not back in the window
    assert not res["order_violations"] and "leet" not in res["conflicts"] and "onsite" not in res["conflicts"]


def test_a_whole_chain_of_prerequisites_is_kept_before_the_block_that_stays():
    events = [ev("a", 8, 9 * 60, 60), ev("b", 8, 10 * 60, 60, prereq_ids=["a"]), ev("c", 8, 14 * 60, 60, prereq_ids=["b"])]
    res = _plan(events, [{"day": 8, "start_min": 8 * 60, "end_min": 12 * 60}])
    g = by_id(res)
    end = lambda e: (e["day"], e["startMin"] + e["durationMin"])
    assert (g["c"]["day"], g["c"]["startMin"]) == (8, 14 * 60)
    assert end(g["a"]) <= (g["b"]["day"], g["b"]["startMin"]) and end(g["b"]) <= (g["c"]["day"], g["c"]["startMin"])
    assert not res["order_violations"]


def test_when_there_truly_is_no_time_before_it_the_failure_is_still_reported():
    # Monday 8:00 is "now"; 'onsite' stays at 10:00; the only time before it (8:00-10:00) is the window being cleared
    events = [ev("leet", 5, 9 * 60, 60), ev("onsite", 5, 10 * 60, 60, prereq_ids=["leet"])]
    res = _plan(events, [{"day": 5, "start_min": 8 * 60, "end_min": 10 * 60}], now_min=8 * 60)
    assert res["conflicts"] or res["order_violations"]


def test_a_block_that_fits_the_gap_as_planned_is_placed_even_without_room_for_its_pace_buffer():
    """Pulling a prerequisite earlier: 'Full LeetCode set' is 60 min, the free time before "Onsite prep" is 80 min. With the pace
    buffer and ramp-up Otto wants 93, but the block as planned fits, so it goes there (marked tight) instead of 'couldn't fit'."""
    from datetime import date
    from app.daynum import day_of
    mon = date(2026, 10, 12)
    week = [day_of(date.fromordinal(mon.toordinal() + i)) for i in range(7)]
    thu, fri = week[3], week[4]
    onsite = {"id": "onsite", "title": "Onsite prep", "day": thu, "startMin": 15 * 60, "durationMin": 90, "category": "system_design", "fixed": False, "prereq_ids": ["leet"]}
    leet = {"id": "leet", "title": "Full LeetCode set", "day": fri, "startMin": 9 * 60 + 30, "durationMin": 60, "category": "leetcode", "fixed": False}
    body = {"events": [onsite, leet], "pinned_ids": ["onsite"], "week_days": week, "week_start_iso": "2026-10-12", "mode": "displaced", "fix_order": "move_prerequisites"}
    r = client.post("/api/schedule", json=body, headers={"X-Client-Now": "2026-10-15T13:40:00"}).json()
    by = {e["id"]: e for e in r["events"]}
    assert r["conflicts"] == [] and r["order_violations"] == []
    assert by["leet"]["day"] == thu and by["leet"]["startMin"] >= 13 * 60 + 40 and by["leet"]["startMin"] + 60 <= 15 * 60
    assert by["leet"]["durationMin"] == 60                                                     # still the block the person made
