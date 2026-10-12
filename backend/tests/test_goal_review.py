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
    res = _clean_review({"goals": [{"id": "zzz", "verdict": "impossible", "headline": "x"}]}, goals, TODAY, False)
    assert [g.id for g in res.goals] == ["a", "b"]
    assert [g.verdict for g in res.goals] == ["at-risk", "on-track"]      # falls back to the computed status
    assert res.feasibility == "at-risk"


def test_bad_verdicts_and_dates_are_discarded():
    goals = [ReviewGoal(**goal("a"))]
    res = _clean_review({"goals": [{"id": "a", "verdict": "doomed", "headline": "h", "suggested_target_date": "yesterday"}]}, goals, TODAY, False)
    assert res.goals[0].verdict == "impossible" and res.goals[0].suggested_target_date is None


def test_a_suggested_date_in_the_past_is_ignored_and_on_track_goals_get_none():
    goals = [ReviewGoal(**goal("a")), ReviewGoal(**goal("b", status="on_track"))]
    data = {"goals": [{"id": "a", "verdict": "at-risk", "headline": "h", "suggested_target_date": "2026-01-01"},
                      {"id": "b", "verdict": "on-track", "headline": "h", "suggested_target_date": "2027-01-01"}]}
    res = _clean_review(data, goals, TODAY, False)
    assert [g.suggested_target_date for g in res.goals] == [None, None]


def test_no_api_key_is_a_clear_503(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "")
    r = client.post("/api/ai/review-goals", json={"goals": [goal()]})
    assert r.status_code == 503


def test_empty_goal_list_and_bad_date_are_rejected():
    assert client.post("/api/ai/review-goals", json={"goals": []}).status_code == 422
    assert client.post("/api/ai/review-goals", json={"goals": [goal()], "today": "soon"}).status_code == 422
