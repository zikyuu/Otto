"""Sleep time is protected from automatic planning. A hard deadline that nothing else can meet is the one exception; a person
can also drag work into sleep hours by hand and it stays there."""
from datetime import date

from app.engine.calendar_bridge import reschedule_events
from app.models import Profile

WEEK = [5, 6, 7, 8, 9, 10, 11]
KW = dict(week_start=date(2026, 10, 5), today=date(2026, 10, 6), now_min=9 * 60)


def ev(id, day, start, dur, cat="admin", fixed=False, **kw):
    return {"id": id, "title": id, "day": day, "startMin": start, "durationMin": dur, "category": cat, "fixed": fixed, **kw}


def profile(end=20 * 60):
    p = Profile()
    p.day_start_min, p.day_end_min = 8 * 60, end
    return p


# Tuesday 6 Oct: a meeting fills 10:00 to 19:30, the awake day ends at 20:00
MEETING = ev("meeting", 6, 10 * 60, 9 * 60 + 30, "interview", True)


def run(task, **extra):
    return reschedule_events([MEETING, task], [], profile(), WEEK, mode="full", **{**KW, **extra})


def by_id(res):
    return {e["id"]: e for e in res["events"]}


def test_a_hard_deadline_that_cannot_fit_is_planned_into_the_evening_and_flagged():
    res = run(ev("report", 6, 9 * 60, 120, deadline_iso="2026-10-06", hard_deadline=True))
    r = by_id(res)["report"]
    assert r["day"] == 6 and r["startMin"] >= 19 * 60 + 30            # after the meeting, past the 20:00 bedtime edge
    assert r["startMin"] + r["durationMin"] > 20 * 60 and r.get("crunch") is True
    assert "sleep" in res["explanation"].lower() and "report" in res["explanation"]
    assert "report" not in res["conflicts"]


def test_without_a_hard_deadline_sleep_hours_stay_protected():
    res = run(ev("report", 6, 9 * 60, 120))
    r = by_id(res)["report"]
    assert not r.get("crunch")
    assert not (r["day"] == 6 and r["startMin"] + r["durationMin"] > 20 * 60)       # never ends after 20:00 on its own
    soft = run(ev("report", 6, 9 * 60, 120, deadline_iso="2026-10-06", hard_deadline=False))
    assert not by_id(soft)["report"].get("crunch")


def test_a_deadline_that_fits_normally_does_not_touch_sleep_time():
    res = run(ev("report", 6, 9 * 60, 30, deadline_iso="2026-10-08", hard_deadline=True))
    assert not by_id(res)["report"].get("crunch")


def test_work_dragged_into_sleep_hours_by_hand_stays_put_through_a_full_reschedule():
    mine = ev("night", 6, 22 * 60, 90, crunch=True)
    res = reschedule_events([MEETING, mine, ev("other", 6, 9 * 60, 60)], [], profile(), WEEK, mode="full", **KW)
    n = by_id(res)["night"]
    assert (n["day"], n["startMin"], n["durationMin"]) == (6, 22 * 60, 90)
