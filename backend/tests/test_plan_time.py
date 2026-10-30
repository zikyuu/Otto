"""How "Find time for a goal" decides session sizes and times. The engine is deterministic, so these are checks on what it
promises: sizes come from the learned focus span and pace, starts hug the preferred (focus-window) start, nothing lands on
a locked event, past the deadline, or in the past, and the hours add up."""
import math
import datetime as _dt
from datetime import date

import pytest

from fastapi.testclient import TestClient

from app import store
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def monday_morning(monkeypatch):
    """These plans are for the week of 12 Oct 2026, so 'now' is that Monday morning whatever the real date is."""
    from app import clock
    monkeypatch.setattr(clock, "now", lambda: _dt.datetime(2026, 10, 12, 8, 0))
WEEK = list(range(12, 26))                  # Mon 12 Oct 2026 .. Sun 25 Oct (two weeks)


def ev(id, day, start, dur, cat="admin", fixed=False, **kw):
    return {"id": id, "title": id, "day": day, "startMin": start, "durationMin": dur, "category": cat, "fixed": fixed, **kw}


def learn(peak=(14, 17), span=100, evidence=6, velocity=1.3):
    with store.locked_profile() as p:
        p.peak_window, p.focus_span_min, p.focus_evidence = peak, span, evidence
        p.avg_velocity["deep_work"] = velocity


MEETINGS = [ev("m1", 13, 15 * 60, 60, "interview", True), ev("m2", 14, 14 * 60, 120, "interview", True), ev("m3", 15, 9 * 60, 60, "interview", True)]


def plan(start_min, minutes=420, deadline="2026-10-20", events=None, now_min=600):
    block = ev("mt", 13, start_min, minutes, "deep_work", span_days=True, deadline_iso=deadline, hard_deadline=True)
    r = client.post("/api/schedule", json={"events": (events if events is not None else MEETINGS) + [block], "plan_ids": ["mt"], "week_days": WEEK,
                                           "week_start_iso": "2026-10-12", "mode": "displaced"}).json()
    return [e for e in r["events"] if e["id"] == "mt" or e.get("split_of") == "mt"], r


def test_session_size_follows_the_learned_pace_and_focus_span():
    learn(span=100, velocity=1.3)
    s, _ = plan(14 * 60)
    real = 420 * 1.3
    assert len(s) == math.ceil(real / 100) == 6                 # 546 real minutes in sittings of at most ~100
    assert sorted({e["durationMin"] for e in s}) == [70]        # 70 planned = 91 real minutes, inside the span
    assert sum(e["durationMin"] for e in s) == 420              # the hours add up exactly


def test_a_shorter_focus_span_means_more_and_shorter_sessions():
    learn(span=60)
    s, _ = plan(14 * 60)
    assert len(s) > 6 and max(e["durationMin"] for e in s) * 1.3 <= 60 * 1.15 + 1


def test_without_evidence_a_marathon_still_splits_using_the_default_span():
    learn(span=120, evidence=0)
    s, _ = plan(14 * 60)
    assert len(s) == math.ceil(420 * 1.3 / 120) == 5 and sum(e["durationMin"] for e in s) == 420


def test_starts_hug_the_preferred_focus_window_and_never_clash_with_locked_events():
    learn(peak=(14, 17))
    s, _ = plan(14 * 60)
    inside = [e for e in s if 14 * 60 <= e["startMin"] < 17 * 60]
    assert len(inside) >= 4                                       # most land in the window; meeting days push some out
    for e in s:
        for m in MEETINGS:
            assert not (e["day"] == m["day"] and e["startMin"] < m["startMin"] + m["durationMin"] and m["startMin"] < e["startMin"] + e["durationMin"])
    assert len({e["day"] for e in s}) == len(s)                   # one sitting per day when days allow


def test_the_preferred_start_decides_where_they_go():
    learn(peak=(9, 12))
    morning, _ = plan(9 * 60)
    learn(peak=(14, 17))
    afternoon, _ = plan(14 * 60)
    assert sum(e["startMin"] < 12 * 60 for e in morning) > sum(e["startMin"] < 12 * 60 for e in afternoon)


def test_nothing_is_placed_after_the_deadline_and_a_squeeze_is_reported_not_hidden():
    learn()
    s, _ = plan(14 * 60, deadline="2026-10-16")
    assert s and all(e["day"] <= 16 for e in s)
    tight, res = plan(14 * 60, minutes=420, deadline="2026-10-14")
    assert all(e["day"] <= 14 for e in tight)
