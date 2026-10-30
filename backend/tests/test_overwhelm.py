"""The overwhelmed planner: rank by what the user said matters, keep what fits the hours, move the rest sensibly, and be honest
when the deadlines cannot be met."""
from datetime import date

from app import store
from app.daynum import day_of
from app.engine import overwhelm
from app.models import Profile

MON = date(2026, 10, 12)
WEEK = [day_of(date.fromordinal(MON.toordinal() + i)) for i in range(14)]
THU = date(2026, 10, 15)
TODAY = day_of(THU)
NOW = 9 * 60


def ev(id, day_i, start, dur, cat="admin", **kw):
    return {"id": id, "title": id, "day": WEEK[day_i], "startMin": start, "durationMin": dur, "category": cat, "fixed": False, **kw}


def run(events, **kw):
    return overwhelm.plan(events, day=TODAY, now_min=NOW, profile=Profile(), week_days=WEEK, week_start=MON, today=THU, **kw)


def where(res, key="suggested"):
    return {e["id"]: (e["day"], e["startMin"]) for e in res[key]["events"]}


def test_triage_ranks_by_importance_then_deadline_and_tags_what_is_soon():
    evs = [ev("eventually", 3, 9 * 60, 60, importance_cat="good"),
           ev("due-fri", 3, 10 * 60, 60, deadline_iso="2026-10-16", importance_cat="whatever"),
           ev("big", 3, 11 * 60, 60, importance_cat="important", importance_tier=1),
           ev("later-deadline", 3, 12 * 60, 60, deadline_iso="2026-12-01")]
    t = overwhelm.triage(evs, TODAY, NOW, Profile(), THU, WEEK)
    assert [r["id"] for r in t["tasks"]][0] == "big"                                        # importance first
    kinds = {r["id"]: r["kind"] for r in t["tasks"]}
    assert kinds["due-fri"] == "deadline" and kinds["eventually"] == "eventual" and kinds["later-deadline"] == "eventual"
    assert t["total_min"] == 240


def test_the_hours_you_give_decide_what_stays_today_and_the_rest_goes_where_it_belongs():
    evs = [ev("a-important", 3, 9 * 60, 120, importance_cat="important", importance_tier=1),
           ev("b-important", 3, 11 * 60, 120, importance_cat="important", importance_tier=2),
           ev("c-good", 3, 13 * 60, 60, importance_cat="good"),
           ev("d-whatever", 3, 14 * 60, 60, importance_cat="whatever")]
    r = run(evs, hours=2)
    assert r["keep"] == ["a-important"]
    o = r["suggested"]["outcomes"]
    assert o["a-important"] == "today" and o["b-important"] == "tomorrow" and o["c-good"] == "next_week" and o["d-whatever"] == "grinder"
    assert [g["title"] for g in r["suggested"]["grinder"]] == ["d-whatever"]
    pos = where(r)
    assert pos["b-important"][0] == WEEK[4]                                                 # tomorrow, Friday
    assert pos["c-good"][0] >= WEEK[7]                                                      # next week
    assert "d-whatever" not in pos
    assert r["suggested"]["ok"] is True


def test_must_dos_stay_even_over_the_hours():
    evs = [ev("must", 3, 9 * 60, 180, non_negotiable=True), ev("other", 3, 12 * 60, 60, importance_cat="important")]
    assert run(evs, hours=1)["keep"] == ["must"]


def test_a_deadline_never_moves_past_itself():
    evs = [ev("due-today", 3, 9 * 60, 60, deadline_iso="2026-10-15"), ev("x", 3, 10 * 60, 60, importance_cat="important")]
    r = run(evs, hours=0.5)
    assert r["suggested"]["outcomes"]["due-today"] == "today"


def test_when_deadlines_are_all_that_is_left_low_importance_work_is_cleared_to_make_room():
    # three 4h pieces due Friday (tomorrow), all hard; Friday also holds low-importance filler that is in the way
    evs = [ev(f"due{i}", 3, 9 * 60 + i * 60, 240, "deep_work", deadline_iso="2026-10-16", importance_cat="important") for i in range(3)]
    evs += [ev(f"filler{i}", 4, 9 * 60 + i * 120, 120, importance_cat="whatever") for i in range(3)]
    r = run(evs, hours=1)
    s = r["suggested"]
    gone = [k for k, v in s["outcomes"].items() if v in ("grinder", "next_week") and k.startswith("filler")]
    assert gone                                                                              # Friday filler made way
    placed = {e["id"] for e in s["events"]}
    assert all(f"due{i}" in placed for i in range(3))


def test_twenty_hours_due_tomorrow_cannot_be_rested_away_and_the_cost_is_shown():
    evs = [ev(f"job{i}", 3, 9 * 60, 240, "deep_work", deadline_iso="2026-10-16", importance_cat="important") for i in range(5)]
    r = run(evs, hours=0)
    assert r["rest_ok"] is False
    rest = r["rest"]
    assert rest["crunch"] > 0 or rest["conflicts"]
    texts = " ".join(w["text"] for w in rest["warnings"])
    assert "sleep hours" in texts or "does not fit" in texts
    assert r["shortfall_min"] > 0
    assert any(w["level"] in ("bad", "warn") for w in rest["warnings"])


def test_a_light_day_can_be_rested_with_no_cost():
    evs = [ev("a", 3, 9 * 60, 60, importance_cat="good"), ev("b", 3, 10 * 60, 60, importance_cat="whatever")]
    r = run(evs, hours=0)
    assert r["rest_ok"] is True
    assert r["rest"]["warnings"][0]["level"] == "good"
    assert all(e["day"] != TODAY for e in r["rest"]["events"] if not e.get("fixed"))


def test_the_endpoint_returns_both_plans():
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app)
    evs = [ev("a", 3, 9 * 60, 60, importance_cat="important"), ev("b", 3, 10 * 60, 60, importance_cat="whatever")]
    body = {"events": evs, "week_days": WEEK, "today_iso": "2026-10-15", "now_min": NOW, "hours": 1}
    t = c.post("/api/overwhelm/triage", json=body).json()
    assert [x["id"] for x in t["tasks"]] == ["a", "b"]
    p = c.post("/api/overwhelm/plan", json=body).json()
    assert p["suggested"]["outcomes"] == {"a": "today", "b": "grinder"} and "rest" in p and p["budget_min"] == 60


def test_only_what_has_to_move_moves():
    evs = [ev("a-important", 3, 9 * 60, 120, importance_cat="important"), ev("b-meh", 3, 11 * 60, 120, importance_cat="good"),
           ev("wed", 2, 10 * 60, 90), ev("next-mon", 7, 13 * 60, 60), ev("sat", 5, 9 * 60, 60)]
    r = run(evs, hours=2)
    before = {e["id"]: (e["day"], e["startMin"]) for e in evs}
    after = where(r)
    for stay in ("wed", "next-mon", "sat"):
        assert after[stay] == before[stay]                                                   # the rest of the calendar is untouched
    assert after["a-important"][0] == WEEK[3]
