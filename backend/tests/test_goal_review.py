"""The weekly goal review: the LLM call is replaced; what matters is that whatever comes back is made safe."""
from fastapi.testclient import TestClient

from app import main
from app.main import ReviewGoal, _clean_review, _goal_brief
from datetime import date

client = TestClient(main.app)
TODAY = date(2026, 10, 11)


def goal(id="g1", **kw):
    base = dict(id=id, title="Pass a system-design interview", cat="Skill gap", start_date="2026-09-01", target_date="2026-10-25",
                progress_pct=25, expected_pct=60, status="impossible", hours_remaining=20, hours_per_week=4, required_hours_per_week=10,
                milestones=[dict(title="Read ch 1-3", effort_h=4, due="2026-09-15", done=True, pct_when_done=17)],
                detours=[dict(date="2026-09-20", type="roadblock", text="Laptop died", impact_days=4)])
    return {**base, **kw}


def test_brief_carries_the_numbers_the_model_must_use():
    text = _goal_brief(ReviewGoal(**goal()))
    for needle in ("25% vs 60% expected", "needs 10.0h/week", "user gives 4h/week", "Laptop died", "[x] Read ch 1-3", "goal reaches 17% when done"):
        assert needle in text


def test_review_endpoint_returns_a_clean_per_goal_verdict(monkeypatch):
    monkeypatch.setattr(main, "_llm_json", lambda system, user: {
        "summary": "Two weeks is not enough.",
        "goals": [{"id": "g1", "verdict": "impossible", "headline": "Needs 10h a week and you have 4.",
                   "advice": ["Drop the mock interviews"], "reroute": [{"change": "Move the target to 20 Dec", "why": "fits 4h/week"}],
                   "suggested_target_date": "2026-12-20"}]})
    r = client.post("/api/ai/review-goals", json={"goals": [goal()], "today": "2026-10-11"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["feasibility"] == "infeasible"
    g = body["goals"][0]
    assert (g["id"], g["verdict"], g["suggested_target_date"]) == ("g1", "impossible", "2026-12-20")
    assert g["reroute"] == [{"change": "Move the target to 20 Dec", "why": "fits 4h/week"}]


def test_prompt_includes_today_and_each_goal(monkeypatch):
    seen = {}
    monkeypatch.setattr(main, "_llm_json", lambda system, user: seen.update(user=user) or {"goals": []})
    client.post("/api/ai/review-goals", json={"goals": [goal("a"), goal("b", title="Finish Blind 75")], "today": "2026-10-11"})
    assert "Today is 2026-10-11" in seen["user"] and "Goal id=a" in seen["user"] and "Finish Blind 75" in seen["user"]


def test_missing_goals_are_filled_and_unknown_ids_dropped():
    goals = [ReviewGoal(**goal("a", status="behind")), ReviewGoal(**goal("b", status="on_track"))]
    res = _clean_review({"goals": [{"id": "zzz", "verdict": "impossible", "headline": "x"}]}, goals, TODAY)
    assert [g.id for g in res.goals] == ["a", "b"]
    assert [g.verdict for g in res.goals] == ["at-risk", "on-track"]      # falls back to the computed status
    assert res.feasibility == "at-risk"


def test_bad_verdicts_and_dates_are_discarded():
    goals = [ReviewGoal(**goal("a"))]
    res = _clean_review({"goals": [{"id": "a", "verdict": "doomed", "headline": "h", "suggested_target_date": "yesterday"}]}, goals, TODAY)
    assert res.goals[0].verdict == "impossible" and res.goals[0].suggested_target_date is None


def test_a_suggested_date_in_the_past_is_ignored_and_on_track_goals_get_none():
    goals = [ReviewGoal(**goal("a")), ReviewGoal(**goal("b", status="on_track"))]
    data = {"goals": [{"id": "a", "verdict": "at-risk", "headline": "h", "suggested_target_date": "2026-01-01"},
                      {"id": "b", "verdict": "on-track", "headline": "h", "suggested_target_date": "2027-01-01"}]}
    res = _clean_review(data, goals, TODAY)
    assert [g.suggested_target_date for g in res.goals] == [None, None]


def test_no_api_key_is_a_clear_503(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "")
    r = client.post("/api/ai/review-goals", json={"goals": [goal()]})
    assert r.status_code == 503


def test_empty_goal_list_and_bad_date_are_rejected():
    assert client.post("/api/ai/review-goals", json={"goals": []}).status_code == 422
    assert client.post("/api/ai/review-goals", json={"goals": [goal()], "today": "soon"}).status_code == 422


# ---- proposals the model may make: typed, bounded, never applied by the server ---------------------------

def rich_goal(**kw):
    return goal(milestones=[
        dict(id="m1", title="Read ch 1-3", effort_h=4, due="2026-09-15", done=True, pct_when_done=17),
        dict(id="m2", title="Design a shortener", effort_h=5, due="2026-10-20", done=False, pct_when_done=40),
        dict(id="m3", title="Caching and sharding", effort_h=6, due="2026-10-24", done=False, pct_when_done=70),
        dict(id="m4", title="Mock interviews", effort_h=5, due="2026-10-25", done=False, pct_when_done=100)], **kw)


def clean(changes, new_goals=None, **kw):
    g = ReviewGoal(**rich_goal(**kw))
    return _clean_review({"goals": [{"id": "g1", "verdict": "impossible", "headline": "h", "changes": changes}], "new_goals": new_goals or []}, [g], TODAY)


def test_small_changes_are_kept_and_do_not_need_permission():
    r = clean([{"type": "move_target", "to": "2026-11-05", "why": "two weeks more"}, {"type": "add_milestone", "title": "Sketch notes", "effort_h": 1, "due": "2026-10-18"}])
    a = r.goals[0]
    assert [c["type"] for c in a.changes] == ["move_target", "add_milestone"]
    assert a.needs_permission is False and not any(c["major"] for c in a.changes)
    assert a.changes[0]["id"] == "g1:c1"


def test_a_pivot_dropping_work_or_a_big_shift_needs_the_users_permission():
    pivot = clean([{"type": "pivot", "new_title": "Pass a distributed-systems interview", "why": "wrong target",
                    "milestones": [{"title": "Read DDIA ch 1-5", "effort_h": 12, "due": "2026-11-20"}]}]).goals[0]
    assert pivot.needs_permission and all(c["major"] for c in pivot.changes)
    two_drops = clean([{"type": "drop_milestone", "milestone_id": "m2"}, {"type": "drop_milestone", "milestone_id": "m3"}]).goals[0]
    assert two_drops.needs_permission
    one_drop = clean([{"type": "drop_milestone", "milestone_id": "m4"}]).goals[0]
    assert one_drop.needs_permission is False                        # 5 of 16 open hours
    far = clean([{"type": "move_target", "to": "2027-02-01"}]).goals[0]
    assert far.needs_permission                                       # months later is a change of plan


def test_one_big_change_makes_the_whole_package_big():
    a = clean([{"type": "add_milestone", "title": "Tiny", "effort_h": 1, "due": "2026-10-18"}, {"type": "move_target", "to": "2027-03-01"}]).goals[0]
    assert all(c["major"] for c in a.changes)


def test_nonsense_in_a_proposal_is_dropped_not_passed_on():
    a = clean([{"type": "drop_milestone", "milestone_id": "m1"},                       # finished work is never dropped
               {"type": "drop_milestone", "milestone_id": "nope"},
               {"type": "move_milestone", "milestone_id": "m2", "due": "2020-01-01"},    # in the past
               {"type": "add_milestone", "title": "", "effort_h": 2, "due": "2026-10-18"},
               {"type": "explode", "why": "x"},
               "not even a dict",
               {"type": "move_target", "to": "yesterday"}]).goals[0]
    assert a.changes == [] and a.needs_permission is False


def test_changes_are_only_kept_for_goals_that_are_off_track():
    g = ReviewGoal(**rich_goal())
    r = _clean_review({"goals": [{"id": "g1", "verdict": "on-track", "headline": "fine", "changes": [{"type": "move_target", "to": "2026-12-01"}]}]}, [g], TODAY)
    assert r.goals[0].changes == []


def test_new_goals_are_proposals_that_always_need_approval():
    r = clean([], new_goals=[{"title": "Learn SQL", "target": "2026-12-15", "hours_per_week": 3, "why": "roles ask for it",
                              "milestones": [{"title": "Joins", "effort_h": 4, "due": "2026-11-01"}, {"title": "no date", "effort_h": 1, "due": "soon"}]},
                             {"title": "Bad", "target": "yesterday"}])
    assert len(r.new_goals) == 1 and r.new_goals[0]["major"] is True and len(r.new_goals[0]["milestones"]) == 1


def test_the_endpoint_never_changes_anything_on_the_server(monkeypatch):
    monkeypatch.setattr(main, "_llm_json", lambda s, u: {"summary": "s", "goals": [{"id": "g1", "verdict": "impossible", "headline": "h",
                                                                                   "changes": [{"type": "pivot", "new_title": "X", "milestones": [{"title": "A", "effort_h": 3, "due": "2026-11-01"}]}]}]})
    r = client.post("/api/ai/review-goals", json={"goals": [rich_goal()], "today": "2026-10-11"}).json()
    assert r["goals"][0]["needs_permission"] is True and r["goals"][0]["changes"][0]["type"] == "pivot"


# ---- what the model says in words must match what the page can do --------------------------------------

def clean_with(prose_reroute=(), advice=(), changes=()):
    g = ReviewGoal(**rich_goal())
    return _clean_review({"goals": [{"id": "g1", "verdict": "impossible", "headline": "h", "advice": list(advice),
                                     "reroute": [{"change": t, "why": ""} for t in prose_reroute], "changes": list(changes)}]}, [g], TODAY).goals[0]


def test_cutting_a_milestone_in_words_becomes_a_drop_proposal_next_to_the_date_move():
    a = clean_with(prose_reroute=["Cut the Caching and sharding milestone to save time"], changes=[{"type": "move_target", "to": "2026-11-05", "why": "later"}])
    kinds = [(c["type"], c.get("milestone_id")) for c in a.changes]
    assert ("drop_milestone", "m3") in kinds and ("move_target", None) in kinds
    drop = next(c for c in a.changes if c["type"] == "drop_milestone")
    assert "Caching" in drop["why"]
    assert a.unapplied == []


def test_prose_about_finished_or_unknown_milestones_is_not_turned_into_a_drop():
    a = clean_with(prose_reroute=["Remove Read ch 1-3 from the plan", "Cut the Quantum basket-weaving milestone"])
    assert not any(c["type"] == "drop_milestone" for c in a.changes)
    assert len(a.unapplied) == 2                                         # said, but nothing Otto can do: shown, not hidden


def test_prose_already_covered_by_a_change_is_not_repeated_as_unapplied():
    a = clean_with(prose_reroute=["Extend the target date by two weeks", "Add a milestone for mock interviews"],
                   changes=[{"type": "move_target", "to": "2026-11-05"}, {"type": "add_milestone", "title": "Mocks", "effort_h": 2, "due": "2026-10-20"}])
    assert a.unapplied == []


def test_an_idea_with_no_matching_change_is_surfaced():
    a = clean_with(advice=["Spend your evenings on this instead of the weekend"])
    assert a.unapplied == ["Spend your evenings on this instead of the weekend"]


def test_two_cuts_in_words_make_the_package_a_big_one():
    a = clean_with(prose_reroute=["Drop the Design a shortener milestone", "Skip Caching and sharding"])
    assert len([c for c in a.changes if c["type"] == "drop_milestone"]) == 2 and a.needs_permission
