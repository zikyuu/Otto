"""The user's importance cards: they give the scheduler a second reason to put something first, and when a low-importance task's
deadline clashes with something marked important, the question goes to the user."""
from datetime import date

from app.engine import importance
from app.engine.calendar_bridge import importance_decisions, reschedule_events
from app.daynum import day_of
from app.models import Profile

MON = date(2026, 10, 12)
WEEK = [day_of(date.fromordinal(MON.toordinal() + i)) for i in range(7)]


def ev(id, d, start, dur, **kw):
    return {"id": id, "title": id, "day": WEEK[d], "startMin": start, "durationMin": dur, "category": "admin", "fixed": False, **kw}


def test_cards_and_tiers_become_one_number_and_unsorted_is_neutral():
    p = lambda cat, tier=1: importance.user_priority({"importance_cat": cat, "importance_tier": tier})
    assert p("important") == 1.0 and p("important", 2) == 0.95 and p("good") == 0.65 and p("whatever") == 0.3
    assert p("important", 3) < p("important", 2) < p("important", 1)                      # lower tier number = more important
    assert p("important", 99) >= 0.7 and p("whatever", 99) >= 0.05                          # never crosses into another card
    assert importance.user_priority({}) is None and importance.value({}) == 0.5
    assert p("good") > p("whatever")


def test_two_otherwise_equal_tasks_the_more_important_one_is_placed_first():
    evs = [ev("meh", 0, 9 * 60, 120, importance_cat="whatever"), ev("big", 0, 9 * 60, 120, importance_cat="important")]
    out = reschedule_events(evs, [], Profile(), WEEK, week_start=MON, today=MON, now_min=0, mode="full")
    by = {e["id"]: e for e in out["events"]}
    assert (by["big"]["day"], by["big"]["startMin"]) <= (by["meh"]["day"], by["meh"]["startMin"])


def test_a_low_importance_deadline_that_cannot_fit_beside_something_important_is_a_question_not_a_guess():
    low = ev("report", 1, 9 * 60, 120, deadline_iso="2026-10-13", importance_cat="whatever", title="Report")
    high = ev("study", 1, 9 * 60, 120, importance_cat="important", title="Study")
    qs = importance_decisions([low, high], ["report"], WEEK, MON)
    assert len(qs) == 1 and qs[0]["low"]["id"] == "report" and qs[0]["high"]["id"] == "study"
    assert "Which matters more?" in qs[0]["question"]


def test_no_question_when_nothing_important_is_in_the_way_or_the_user_already_decided():
    low = ev("report", 1, 9 * 60, 120, deadline_iso="2026-10-13", importance_cat="whatever")
    assert importance_decisions([low], ["report"], WEEK, MON) == []
    other = ev("study", 1, 9 * 60, 120, importance_cat="important")
    assert importance_decisions([{**low, "yielded": True}, other], ["report"], WEEK, MON) == []
    unsorted_low = {k: v for k, v in low.items() if k != "importance_cat"}
    assert importance_decisions([unsorted_low, other], ["report"], WEEK, MON) == []         # only things the user marked low
    soft = {**low, "hard_deadline": False}
    assert importance_decisions([soft, other], ["report"], WEEK, MON) == []
    later = {**other, "day": WEEK[3]}
    assert importance_decisions([low, later], ["report"], WEEK, MON) == []                   # after the deadline: not in the way
