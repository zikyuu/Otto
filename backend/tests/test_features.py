"""Persistence, oversleep, week check, weekly reflection, the weekly chat, enrichment and Google Calendar.
LLM calls are replaced; HTTP to Google is never made."""
from datetime import date, datetime

from fastapi.testclient import TestClient

from app import kv, main, store
import json
from app.engine import chat, enrich, oversleep, weekly
from app.models import EnergyLog, OffTrackLog, Profile, ReflectionChoice, TaskReflection
from app.sources import gcal

client = TestClient(main.app)
from datetime import date as _date
from app.daynum import day_of


def D(n):
    """Day number of 'n October 2026' (events carry real day numbers, see app/daynum.py)."""
    return day_of(_date(2026, 10, n))


WEEK = [D(n) for n in range(5, 12)]       # Mon 5 Oct 2026 .. Sun 11
TODAY = "2026-10-07"                      # Wednesday


def ev(id, day, start, dur, cat="admin", fixed=False, **kw):
    return {"id": id, "title": id, "day": D(day) if day <= 31 else day, "startMin": start, "durationMin": dur, "category": cat, "fixed": fixed, **kw}


# ---- persistence ------------------------------------------------------------------------------------------

def test_state_round_trips_through_the_store():
    assert client.get("/api/state/otto.events.v1").status_code == 404
    assert client.put("/api/state/otto.events.v1", json={"value": [{"id": "a"}]}).json()["ok"]
    assert client.get("/api/state/otto.events.v1").json()["value"] == [{"id": "a"}]
    assert client.get("/api/state").json()["state"]["otto.events.v1"] == [{"id": "a"}]
    client.delete("/api/state/otto.events.v1")
    assert client.get("/api/state/otto.events.v1").status_code == 404


def test_state_only_serves_the_pages_own_keys_never_server_secrets():
    kv.put("gcal.tokens", {"access_token": "secret"})
    assert client.get("/api/state/gcal.tokens").status_code == 422
    assert client.put("/api/state/gcal.tokens", json={"value": 1}).status_code == 422
    assert "gcal.tokens" not in client.get("/api/state").json()["state"]


def test_kv_falls_back_to_a_file_with_no_supabase():
    assert kv.backend() == "file"
    kv.put("otto.x", {"n": 1})
    assert kv.get("otto.x") == {"n": 1} and kv.get("otto.missing", 7) == 7


# ---- oversleep --------------------------------------------------------------------------------------------

def day_events():
    return [
        ev("standup", 7, 9 * 60, 30, fixed=True),
        ev("deep", 7, 9 * 60 + 30, 120, "deep_work", non_negotiable=True),
        ev("email", 7, 12 * 60, 30),
        ev("report", 7, 13 * 60, 60, deadline_iso="2026-10-08"),
        ev("reading", 7, 15 * 60, 90, "creative"),
        ev("other-day", 8, 10 * 60, 60),
    ]


def test_late_start_is_two_hours_after_the_first_planned_event():
    assert oversleep.detect(day_events(), D(7), 11 * 60 + 30)["late"] is True
    assert oversleep.detect(day_events(), D(7), 10 * 60 + 30)["late"] is False
    assert oversleep.detect([], D(7), 600)["late"] is False


def test_triage_ranks_by_what_is_at_stake_and_proposes_a_line():
    body = {"events": day_events(), "week_days": WEEK, "today_iso": TODAY, "now_min": 12 * 60}
    r = client.post("/api/oversleep/check", json=body).json()
    ids = [t["id"] for t in r["triage"]["ranked"]]
    assert ids[0] == "deep"                                  # non-negotiable first
    assert "standup" not in ids and "other-day" not in ids   # fixed and other days are not ranked
    assert 1 <= r["triage"]["line"] <= len(ids)
    assert ids.index("report") < ids.index("reading")        # the deadline beats the open-ended one


def test_reschedule_replans_from_now_and_parks_what_is_below_the_line():
    body = {"events": day_events(), "week_days": WEEK, "today_iso": TODAY, "now_min": 12 * 60, "mode": "reschedule",
            "keep_ids": ["deep", "report"]}
    r = client.post("/api/oversleep/apply", json=body).json()
    byid = {e["id"]: e for e in r["events"]}
    assert "email" not in byid and "reading" not in byid     # below the line: off the calendar
    assert {g["title"] for g in r["grinder"]} == {"email", "reading"}
    assert byid["deep"]["startMin"] >= 12 * 60 or byid["deep"]["day"] != D(7)   # nothing is placed in the past
    assert byid["standup"]["startMin"] == 9 * 60              # fixed events never move


def test_each_task_can_go_its_own_way_on_a_late_start():
    body = {"events": day_events(), "week_days": WEEK, "today_iso": TODAY, "now_min": 11 * 60, "mode": "reschedule",
            "choices": {"deep": "today", "email": "tomorrow", "report": "grinder", "reading": "drop"}}
    r = client.post("/api/oversleep/apply", json=body).json()
    byid = {e["id"]: e for e in r["events"]}
    assert r["outcomes"] == {"deep": "today", "email": "tomorrow", "report": "grinder", "reading": "drop"}
    assert byid["deep"]["day"] == D(7) and byid["deep"]["startMin"] >= 11 * 60      # re-placed from now
    assert byid["email"]["day"] == D(8)                                              # first thing tomorrow
    assert "report" not in byid and [g["title"] for g in r["grinder"]] == ["report"]  # parked, not lost
    assert "reading" not in byid and all(g["title"] != "reading" for g in r["grinder"])   # dropped, not parked
    assert "1 moved to tomorrow" in r["explanation"].lower() and "dropped" in r["explanation"]


def test_a_task_with_no_choice_follows_the_proposed_line():
    body = {"events": day_events(), "week_days": WEEK, "today_iso": TODAY, "now_min": 12 * 60, "mode": "reschedule",
            "keep_ids": ["deep", "report"], "choices": {"email": "tomorrow"}}
    r = client.post("/api/oversleep/apply", json=body).json()
    assert r["outcomes"]["deep"] == "today" and r["outcomes"]["reading"] == "grinder" and r["outcomes"]["email"] == "tomorrow"


def test_keep_changes_nothing_and_marks_the_missed_as_ghosts():
    body = {"events": day_events(), "week_days": WEEK, "today_iso": TODAY, "now_min": 12 * 60 + 40, "mode": "keep"}
    r = client.post("/api/oversleep/apply", json=body).json()
    assert {e["id"] for e in r["events"] if e.get("ghost")} == {"deep", "email"}
    assert [e["startMin"] for e in r["events"]] == [e["startMin"] for e in day_events()]
    assert r["grinder"] == []


def test_write_off_parks_flexible_work_and_can_hold_the_best_for_tomorrow():
    body = {"events": day_events(), "week_days": WEEK, "today_iso": TODAY, "now_min": 12 * 60, "mode": "write_off",
            "protect_tomorrow": True}
    r = client.post("/api/oversleep/apply", json=body).json()
    byid = {e["id"]: e for e in r["events"]}
    assert byid["standup"]["day"] == D(7)                        # fixed stays
    assert byid["deep"]["day"] == D(8) and byid["deep"]["startMin"] == store.load_profile().day_start_min
    assert "email" not in byid and any(g["title"] == "email" for g in r["grinder"])
    plain = client.post("/api/oversleep/apply", json={**body, "protect_tomorrow": False}).json()
    assert not [e for e in plain["events"] if e["id"] in ("deep", "email", "report", "reading")]


def test_three_late_starts_in_a_week_suggest_a_later_planned_start():
    out = None
    for d in ("2026-10-05", "2026-10-06", "2026-10-07"):
        out = client.post("/api/oversleep/apply", json={"events": day_events(), "week_days": WEEK, "today_iso": d, "now_min": 720,
                                                       "mode": "keep"}).json()["late_starts"]
    assert out["late_starts_this_week"] == 3 and out["suggest_later_start"] is True
    assert store.load_profile().late_starts == ["2026-10-05", "2026-10-06", "2026-10-07"]


# ---- week check / tradeoff / recovery -----------------------------------------------------------------------

def packed():
    es = [ev(f"w{i}", 7 + (i % 3), 9 * 60 + (i // 3) * 120, 120, "deep_work") for i in range(9)]
    es += [ev(f"work{d}", d, 8 * 60, 8 * 60, fixed=True) for d in (7, 8, 9, 10, 11)]
    es += [ev("onsite", 9, 9 * 60, 240, "interview", deadline_iso="2026-10-09", non_negotiable=True),
           ev("apply", 9, 14 * 60, 240, "admin", deadline_iso="2026-10-09")]
    return es


def test_an_overfull_week_is_flagged_with_the_two_competing_things():
    r = client.post("/api/week-check", json={"events": packed(), "week_days": WEEK, "today_iso": TODAY, "now_min": 600}).json()
    assert r["overcommitted"] and r["need_min"] > r["capacity_min"]
    t = r["trade"]
    assert t and t["a"]["title"] != t["b"]["title"] and t["a"]["minutes"] > 0
    assert {t["a"]["title"], t["b"]["title"]} == {"onsite", "apply"}


def test_a_light_week_is_fine():
    r = client.post("/api/week-check", json={"events": [ev("a", 8, 600, 60)], "week_days": WEEK, "today_iso": TODAY, "now_min": 600}).json()
    assert r["overcommitted"] is False and r["trade"] is None


def test_downscope_shortens_to_a_lite_version_and_never_below_15():
    r = client.post("/api/week-check/downscope", json={"events": [ev("a", 8, 600, 120), ev("b", 8, 800, 20), ev("c", 8, 900, 60, fixed=True)],
                                                      "ids": ["a", "b", "c"]}).json()
    d = {e["id"]: e["durationMin"] for e in r["events"]}
    assert d == {"a": 60, "b": 15, "c": 60}                  # fixed untouched; 20 -> 15
    assert {c["id"] for c in r["changed"]} == {"a", "b"}


def test_recovery_names_one_win_and_one_thing_to_shrink():
    es = [ev("small", 7, 15 * 60, 30, deadline_iso="2026-10-07"), ev("big", 8, 600, 120, "deep_work"), ev("past", 7, 540, 30)]
    r = client.post("/api/recovery", json={"events": es, "week_days": WEEK, "today_iso": TODAY, "now_min": 14 * 60}).json()
    assert r["focus"]["id"] == "small" and r["focus"]["minutes"] <= 45
    assert r["shrink"]["id"] == "big" and r["shrink"]["to_min"] < r["shrink"]["from_min"]


# ---- weekly reflection ----------------------------------------------------------------------------------------

def seed_week():
    with store.locked_profile() as p:
        for i, (d, plan, act, ch) in enumerate([("2026-10-05", 60, 60, ReflectionChoice.NAILED), ("2026-10-06", 60, 90, ReflectionChoice.HARDER),
                                                ("2026-10-07", 60, 20, ReflectionChoice.INTERRUPTED)]):
            p.reflections.append(TaskReflection(task_id=f"t{i}", ts=f"{d}T10:00", choice=ch, planned_minutes=plan, actual_minutes=act, category="deep_work"))
        p.off_track_logs.append(OffTrackLog(ts="2026-10-06T11:00", duration_min=25, reason="doomscrolled"))
        p.energy_logs.append(EnergyLog(ts="2026-10-06T09:30", level=4))
        p.late_starts += ["2026-10-05", "2026-10-07"]


def test_weekly_metrics_come_from_the_stored_signals():
    seed_week()
    m = weekly.weekly_metrics(store.load_profile(), date(2026, 10, 7))
    assert (m["sessions"], m["planned_min"], m["actual_min"]) == (3, 180, 170)
    assert m["streak_days"] == 3 and m["days_active"] == 3
    assert m["off_track_min"] == {"doomscrolled": 25} and m["energy_avg"]["morning"] == 4.0
    assert m["late_starts"] == 2 and m["status"] == "on track"
    assert [d["minutes"] for d in m["per_day"]][-3:] == [60, 90, 20]


def test_an_empty_week_says_so_calmly():
    r = client.get("/api/reflection/weekly", params={"today_iso": TODAY}).json()
    assert r["metrics"]["sessions"] == 0 and "quiet" in r["recap"]["headline"].lower()
    assert r["drift"]["due"] is False and r["drift"]["first"] is True


def test_drift_is_due_only_when_something_moved_and_a_week_passed():
    p = store.load_profile()
    snap = weekly.snapshot(p, datetime(2026, 9, 25, 9, 0))
    p.focus_span_min = 60
    p.avg_velocity["deep_work"] = 1.7
    d = weekly.drift(p, snap, datetime(2026, 10, 7, 9, 0))
    assert d["due"] and {x["key"] for x in d["drifts"]} == {"focus_span_min", "avg_velocity:deep_work"}
    assert weekly.drift(p, snap, datetime(2026, 9, 28, 9, 0))["due"] is False        # moved, but only 3 days ago
    assert weekly.drift(store.load_profile(), weekly.snapshot(store.load_profile()), datetime.now())["drifts"] == []


def test_ack_takes_a_new_snapshot_so_it_is_not_raised_again():
    client.get("/api/reflection/weekly")                      # first look takes the silent snapshot
    snap = kv.get("weekly.snapshot")
    snap["at"] = "2026-09-01T09:00"
    snap["focus_span_min"] = 200
    kv.put("weekly.snapshot", snap)
    assert client.get("/api/reflection/weekly").json()["drift"]["due"] is True
    client.post("/api/reflection/drift/ack")
    assert client.get("/api/reflection/weekly").json()["drift"]["due"] is False


def test_narrate_falls_back_to_the_deterministic_recap_without_a_key():
    seed_week()
    r = client.post("/api/reflection/weekly/narrate", json={"today_iso": TODAY}).json()
    assert r["llm"] is False and r["headline"]


def test_narrate_uses_the_model_when_there_is_one(monkeypatch):
    seed_week()
    monkeypatch.setenv("OPENAI_API_KEY", "x")
    monkeypatch.setattr(main, "_llm_json", lambda s, u: {"headline": "Good one.", "body": "Three sessions."})
    r = client.post("/api/reflection/weekly/narrate", json={"today_iso": TODAY}).json()
    assert r == {"headline": "Good one.", "body": "Three sessions.", "llm": True}


# ---- the weekly chat ------------------------------------------------------------------------------------------

def test_keywords_read_the_plain_sentences():
    rules = chat.validate(store.load_profile(), chat.keyword_rules(
        "I focus best between 9am and 12pm. I need 20 minutes after meetings. Gym first, please. I can focus for 50 minutes."))
    got = {r["key"]: r["value"] for r in rules}
    assert got == {"peak_window": [9, 12], "recovery_after_meeting": 20, "gym_first": True, "focus_span_min": 50}
    assert all(r["label"] for r in rules)


def test_proposals_that_would_be_rejected_never_reach_the_user(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "x")
    monkeypatch.setattr(main, "_llm_json", lambda s, u: {"reply": "Got it.", "follow_up": "Is that every day?", "rules": [
        {"key": "peak_window", "value": [10, 13], "note": "n"}, {"key": "planning_bias", "value": 7},
        {"key": "made_up", "value": 1}, {"key": "peak_window", "value": [1, 2]}]})
    r = client.post("/api/chat/rules", json={"text": "I do my best work late morning"}).json()
    assert [x["key"] for x in r["rules"]] == ["peak_window"] and r["rules"][0]["value"] == [10, 13]
    assert r["via"] == "llm" and r["follow_up"] == "Is that every day?"


def test_chat_does_not_apply_anything_until_confirmed():
    r = client.post("/api/chat/rules", json={"text": "gym first"}).json()
    assert r["rules"][0]["key"] == "gym_first" and store.load_profile().gym_first is False
    a = client.post("/api/chat/rules/apply", json={"rules": [{"key": "gym_first", "value": True, "note": "gym first"},
                                                              {"key": "planning_bias", "value": 9}]}).json()
    assert a["applied"] == ["gym_first"] and a["rejected"][0]["key"] == "planning_bias"
    assert store.load_profile().gym_first is True and "gym first" in store.load_profile().stated_rules
    h = client.get("/api/chat/history").json()
    assert h["at"] and "messages" not in h
    assert h["summaries"][-1]["kind"] == "weekly_chat" and h["summaries"][-1]["items"][0]["key"] == "gym_first"
    assert "gym first" not in json.dumps(kv.get("weekly.chat"))             # what they typed is not stored


def test_an_unreadable_message_gets_a_helpful_reply_not_an_error():
    r = client.post("/api/chat/rules", json={"text": "hmm"}).json()
    assert r["rules"] == [] and "9 to 12" in r["reply"]


# ---- enrichment -----------------------------------------------------------------------------------------------

LONG = "Finish the quarterly report for the finance team, including the charts and the summary page and send it round"


def test_only_long_tasks_are_worth_a_call():
    assert enrich.needs_enrichment(LONG) and not enrich.needs_enrichment("Write report")


def test_enrichment_is_one_batched_call_bounded_and_clamped(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "x")
    calls = []
    monkeypatch.setattr(main, "_llm_json", lambda s, u: (calls.append(u), {"tasks": [
        {"id": "a", "title": "Finish quarterly report", "category": "wat", "minutes": 7000, "importance": 99,
         "subtasks": [{"name": "Charts", "minutes": 33}, {"name": " ", "minutes": 5}]},
        {"id": "zzz", "title": "not asked"}]})[1])
    r = client.post("/api/tasks/enrich", json={"tasks": [{"id": "a", "text": LONG}, {"id": "b", "text": "short"}], "today_iso": TODAY}).json()
    assert len(calls) == 1 and [t["id"] for t in r["enriched"]] == ["a"]
    t = r["enriched"][0]
    assert (t["category"], t["minutes"], t["importance"]) == ("admin", 480, 5) and t["subtasks"] == [{"name": "Charts", "minutes": 35}]
    assert r["quota_left"] == 4


def test_at_most_five_enrichments_a_week(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "x")
    monkeypatch.setattr(main, "_llm_json", lambda s, u: {"tasks": [{"id": f"t{i}", "title": "x", "minutes": 30} for i in range(10)]})
    ids = [{"id": f"t{i}", "text": LONG} for i in range(8)]
    first = client.post("/api/tasks/enrich", json={"tasks": ids[:7], "today_iso": TODAY}).json()
    assert len(first["enriched"]) == 5 and first["quota_left"] == 0
    again = client.post("/api/tasks/enrich", json={"tasks": ids[:1], "today_iso": TODAY}).json()
    assert again == {"enriched": [], "quota_left": 0, "reason": "quota"}
    nextweek = client.post("/api/tasks/enrich", json={"tasks": ids[:1], "today_iso": "2026-10-14"}).json()
    assert len(nextweek["enriched"]) == 1


def test_enrichment_without_a_key_does_nothing_quietly():
    r = client.post("/api/tasks/enrich", json={"tasks": [{"id": "a", "text": LONG}], "today_iso": TODAY}).json()
    assert r["enriched"] == [] and r["reason"] == "no_key"


# ---- Google Calendar ------------------------------------------------------------------------------------------

def test_gcal_says_plainly_when_it_is_not_configured():
    s = client.get("/api/gcal/status").json()
    assert s["configured"] is False and s["connected"] is False and "GOOGLE_CLIENT_ID" in s["hint"]
    assert client.get("/api/gcal/auth-url").status_code == 503
    assert client.get("/api/gcal/events", params={"start": "2026-10-05", "end": "2026-10-11"}).status_code == 503


def test_gcal_events_become_fixed_blocks_and_skip_all_day(monkeypatch):
    items = [
        {"id": "e1", "summary": "Standup", "start": {"dateTime": "2026-10-07T09:00:00+00:00"}, "end": {"dateTime": "2026-10-07T09:30:00+00:00"}, "attendees": [{}]},
        {"id": "e2", "summary": "Holiday", "start": {"date": "2026-10-08"}, "end": {"date": "2026-10-09"}},
        {"id": "e3", "status": "cancelled", "start": {"dateTime": "2026-10-07T10:00:00+00:00"}, "end": {"dateTime": "2026-10-07T11:00:00+00:00"}},
    ]
    monkeypatch.setenv("TZ", "UTC")
    import time; time.tzset()
    out = gcal.to_events(items)
    assert [(e["title"], e["day"], e["startMin"], e["durationMin"], e["fixed"], e["source"]) for e in out] == [("Standup", D(7), 540, 30, True, "gcal")]
    assert out[0]["category"] == "social"


def test_gcal_oauth_state_must_match(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "secret")
    url = client.get("/api/gcal/auth-url").json()["url"]
    assert "accounts.google.com" in url and "calendar.readonly" in url and "access_type=offline" in url
    r = client.get("/api/gcal/callback", params={"code": "c", "state": "forged"}, follow_redirects=False)
    assert r.headers["location"] == "/?gcal=failed" and kv.get("gcal.tokens") is None


def test_gcal_exchange_stores_tokens_and_events_are_fetched(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "secret")
    state = gcal.auth_url().split("state=")[1].split("&")[0]
    monkeypatch.setattr(gcal, "_post_token", lambda data: {"access_token": "a", "refresh_token": "r", "expires_in": 3600})
    r = client.get("/api/gcal/callback", params={"code": "c", "state": state}, follow_redirects=False)
    assert r.headers["location"] == "/?gcal=connected" and client.get("/api/gcal/status").json()["connected"] is True

    class R:
        status_code = 200
        def json(self): return {"items": [{"id": "x", "summary": "Dentist", "start": {"dateTime": "2026-10-08T14:00:00+00:00"}, "end": {"dateTime": "2026-10-08T15:00:00+00:00"}}]}
    import httpx
    monkeypatch.setattr(httpx, "get", lambda *a, **k: R())
    monkeypatch.setenv("TZ", "UTC")
    import time; time.tzset()
    ev_ = client.get("/api/gcal/events", params={"start": "2026-10-05", "end": "2026-10-11"}).json()["events"]
    assert [e["title"] for e in ev_] == ["Dentist"]
    client.post("/api/gcal/disconnect")
    assert client.get("/api/gcal/status").json()["connected"] is False


def test_exa_is_gone():
    import app.sources.adapters as a
    assert not hasattr(a, "ExaJobSource")
    assert "exa" not in open("requirements.txt").read().lower()


def test_ai_status_says_whether_a_model_is_connected(monkeypatch):
    first = client.get("/api/ai/status").json()
    assert first["llm"] is False and first["model"] is None and first["gated"] is False
    monkeypatch.setenv("OPENAI_API_KEY", "x")
    assert client.get("/api/ai/status").json()["llm"] is True


# ---- reflection -> adjustments ----------------------------------------------------------------------------

def test_a_reflection_about_lost_sleep_proposes_an_earlier_cutoff_and_a_lighter_plan():
    r = client.post("/api/chat/rules", json={"text": "I hit all my goals but sacrificed a lot of sleep for it"}).json()
    got = {x["key"]: x for x in r["rules"]}
    assert got["day_end_min"]["value"] == 22 * 60 and got["day_end_min"]["current"] == 23 * 60
    assert got["planning_bias"]["value"] == 0.7
    assert all(x["source"] == "inferred" and x["reason"] for x in r["rules"])
    assert store.load_profile().day_end_min == 23 * 60                 # a proposal: nothing changed yet


def test_confirming_applies_them_and_says_the_week_could_be_replanned():
    r = client.post("/api/chat/rules", json={"text": "I stayed up late all week to finish things"}).json()
    a = client.post("/api/chat/rules/apply", json={"rules": [{"key": x["key"], "value": x["value"], "note": "late nights"} for x in r["rules"]]}).json()
    assert set(a["applied"]) == {"day_end_min", "planning_bias"} and a["replan"] is True
    p = store.load_profile()
    assert p.day_end_min == 22 * 60 and p.stated_overrides["day_end_min"] == 22 * 60


def test_the_model_may_infer_but_only_small_steps_from_where_a_setting_is_now(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "x")
    seen = {}
    monkeypatch.setattr(main, "_llm_json", lambda s, u: (seen.update(user=u), {"reply": "Sleep matters.", "rules": [
        {"key": "day_end_min", "value": 17 * 60, "source": "inferred", "reason": "You said you lost sleep."},
        {"key": "peak_window", "value": [5, 8], "source": "inferred", "reason": "Mornings suit you."},
        {"key": "gym_first", "value": True, "source": "said", "note": "gym first"}]})[1])
    r = client.post("/api/chat/rules", json={"text": "I lost a lot of sleep"}).json()
    got = {x["key"]: x for x in r["rules"]}
    assert got["day_end_min"]["value"] == 21 * 60                       # asked for 17:00, limited to two hours earlier
    assert got["peak_window"]["value"] == [6, 9]                        # three hours earlier at most, same width
    assert got["gym_first"]["source"] == "said"
    ctx = __import__("json").loads(seen["user"])
    assert ctx["user_said"] == "I lost a lot of sleep" and "settings_now" in ctx and "week" in ctx      # the model is given the evidence


def test_a_stated_rule_is_not_clamped():
    r = client.post("/api/chat/rules", json={"text": "I focus best between 5am and 8am"}).json()
    assert r["rules"][0]["key"] == "peak_window" and r["rules"][0]["value"] == [5, 8] and r["rules"][0]["source"] == "said"


def test_an_earlier_cutoff_changes_where_the_scheduler_puts_work():
    from datetime import date as d
    from app.engine.calendar_bridge import reschedule_events
    from app.models import Profile
    block = {"id": "x", "title": "x", "day": D(6), "startMin": 21 * 60 + 30, "durationMin": 60, "category": "admin", "fixed": False}
    kw = dict(week_start=d(2026, 10, 5), today=d(2026, 10, 6), now_min=9 * 60, mode="full")
    late, early = Profile(), Profile()
    early.day_end_min = 21 * 60
    placed_late = reschedule_events([block], [], late, WEEK, **kw)["events"][0]
    placed_early = reschedule_events([block], [], early, WEEK, **kw)["events"][0]
    assert placed_early["startMin"] + placed_early["durationMin"] <= 21 * 60 or placed_early["day"] > D(6)
    assert placed_late["startMin"] + placed_late["durationMin"] <= 23 * 60


def test_three_late_starts_suggest_the_start_the_user_really_keeps():
    p = store.load_profile()
    out = {}
    for i, opened in enumerate((10 * 60 + 10, 10 * 60 + 40, 10 * 60 + 20)):
        out = oversleep.log_late_start(p, f"2026-10-{5 + i:02d}", 8 * 60, opened)
    assert out["late_starts_this_week"] == 3 and out["suggest_later_start"]
    assert out["suggested_start_min"] == 10 * 60 + 30                 # median 10:20, nearest half hour
    assert out["current_start_min"] == p.day_start_min
    again = oversleep.log_late_start(p, "2026-10-07", 8 * 60, 12 * 60)   # the same date is not counted twice
    assert again["late_starts_this_week"] == 3
    assert Profile.from_dict(p.to_dict()).late_log == p.late_log


def test_no_suggestion_when_the_late_days_are_not_later_than_the_current_start():
    p = Profile()
    p.day_start_min = 11 * 60
    out = {}
    for i in range(3):
        out = oversleep.log_late_start(p, f"2026-10-{5 + i:02d}", 8 * 60, 10 * 60)
    assert out["suggest_later_start"] and "suggested_start_min" not in out


def test_a_dry_run_gives_the_result_but_does_not_count_as_a_late_start():
    before = list(store.load_profile().late_starts)
    body = {"events": day_events(), "week_days": WEEK, "today_iso": TODAY, "now_min": 12 * 60, "mode": "reschedule",
            "choices": {"email": "tomorrow"}, "dry_run": True}
    r = client.post("/api/oversleep/apply", json=body).json()
    assert r["outcomes"]["email"] == "tomorrow" and "late_starts" not in r
    assert store.load_profile().late_starts == before


def test_only_a_summary_of_each_check_in_is_kept_and_it_is_capped():
    from app.engine import summaries
    assert client.post("/api/summaries", json={"kind": "goal_review", "text": "Moved the RAG target two weeks.", "items": [{"label": "Move target", "value": "2026-11-20"}]}).status_code == 200
    got = client.get("/api/summaries").json()["summaries"]
    assert got[0]["text"].startswith("Moved the RAG") and got[0]["items"][0]["label"] == "Move target"
    for i in range(40):
        client.post("/api/summaries", json={"kind": "goal_review", "text": f"n{i}"})
    assert len(kv.get(summaries.KEY)) == summaries.KEEP
    assert client.post("/api/summaries", json={"kind": "nope", "text": "x"}).status_code == 422


def test_the_chat_is_told_what_earlier_check_ins_decided_and_opens_with_it():
    from app.engine import summaries
    kv.put(summaries.KEY, [summaries.make("weekly_chat", "Changed Peak focus window.", [{"label": "Peak focus window"}], "2026-10-06T09:00")])
    assert main._chat_context(store.load_profile())["earlier_check_ins"] == [{"at": "2026-10-06", "kind": "weekly_chat", "decided": "Changed Peak focus window."}]
    assert client.get("/api/chat/history").json()["opener"].startswith("Last time (6 Oct)")


def test_a_legacy_stored_conversation_is_dropped_on_read():
    kv.put("weekly.chat", {"messages": [{"who": "you", "text": "secret"}], "at": "2026-10-01T10:00"})
    assert "messages" not in client.get("/api/chat/history").json()
    assert "messages" not in kv.get("weekly.chat")


def test_the_server_uses_the_persons_clock_not_its_own():
    from app import clock
    assert clock.now().year >= 2025                                         # no header: the machine's own clock
    r = client.post("/api/oversleep/check", json={"events": [ev("a", 7, 9 * 60, 60)], "week_days": WEEK},
                    headers={"X-Client-Now": "2026-10-07T12:30:00"}).json()
    assert r["late"] is True and r["late_by_min"] == 12 * 60 + 30 - 9 * 60          # 'today' and 'now' came from the header
    assert clock.parse("nonsense") is None


def test_a_planned_recovery_is_only_counted_as_a_late_start_when_it_is_applied():
    before = list(store.load_profile().late_starts)
    dry = {"events": day_events(), "week_days": WEEK, "today_iso": TODAY, "now_min": 12 * 60, "mode": "reschedule", "dry_run": True}
    client.post("/api/oversleep/apply", json=dry)
    assert store.load_profile().late_starts == before
    r = client.post("/api/oversleep/log", json={"first_start": 9 * 60, "now_min": 12 * 60, "today_iso": TODAY}).json()
    assert r["late_starts_this_week"] == 1 and store.load_profile().late_starts == before + [TODAY]
