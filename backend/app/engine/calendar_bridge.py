"""Calendar ⇄ engine bridge.

The week view speaks in calendar events ({id, title, day (date of month),
startMin, durationMin, category, fixed}). The scheduler speaks Tasks and
TimeBlocks on a 0–6 day index. This module translates, runs schedule(), and
translates back. Pure — no I/O, no LLM; `profile` carries everything learned.

Stability first: on a drag, only events the change actually displaces move
(mode="displaced"). mode="full" re-optimises every flexible event against the
learned peak window / velocity, each staying as near its current slot as it can.
"""
from __future__ import annotations

import math
from datetime import date
from typing import Any

import dataclasses

from app.engine import importance
from app.engine.scheduler import DAYS_IN_WEEK, MAX_DAYS, _required_minutes, plan_sessions, schedule
from app.models import Category, EffortTier, Profile, Task, TimeBlock

# frontend category labels (CATEGORY_COLORS keys) → engine categories
CATEGORY_MAP: dict[str, Category] = {
    "llm": Category.DEEP_WORK, "leetcode": Category.DEEP_WORK,
    "system-design": Category.DEEP_WORK, "deep work": Category.DEEP_WORK,
    "interview": Category.SOCIAL, "social": Category.SOCIAL,
    "gym": Category.PHYSICAL,
    "leisure": Category.CREATIVE,
    "admin": Category.ADMIN, "life": Category.ADMIN,
}


def to_category(label: str | None) -> Category:
    """Map any frontend label (or an engine value like 'deep_work') to a Category.
    Unknown labels fall back to ADMIN: the one category with no timing gates."""
    if not label:
        return Category.ADMIN
    key = label.strip().lower()
    if key in CATEGORY_MAP:
        return CATEGORY_MAP[key]
    try:
        return Category(key.replace(" ", "_"))
    except ValueError:
        return Category.ADMIN


def effort_for(minutes: int) -> EffortTier:
    if minutes < 30:
        return EffortTier.LOW
    if minutes < 90:
        return EffortTier.MED
    if minutes < 180:
        return EffortTier.HIGH
    return EffortTier.DEEP


def _overlaps(a: tuple[int, int, int], b: tuple[int, int, int]) -> bool:
    return a[0] == b[0] and a[1] < b[2] and b[1] < a[2]


def _fmt(minute: int) -> str:
    return f"{minute // 60}:{minute % 60:02d}"


def _fmt_dur(m: int) -> str:
    h, r = divmod(int(m), 60)
    return f"{r}m" if h == 0 else (f"{h}h" if r == 0 else f"{h}h {r}m")


def _task_from_event(e: dict[str, Any], pos: dict[str, tuple[int, int, int]]) -> Task:
    d, s, _ = pos[e["id"]]
    dur = e["durationMin"]
    try:
        tier = EffortTier(e["effort_tier"]) if e.get("effort_tier") else effort_for(dur)
    except ValueError:
        tier = effort_for(dur)
    return Task(
        id=e["id"], title=e["title"], duration_planned=dur,
        importance=1.0,   # non-negotiable weight comes from the scheduler's priority formula
        category=to_category(e.get("category")), effort_tier=tier,
        prereq_ids=[p for p in e.get("prereq_ids", []) if p in pos],
        deadline_iso=e.get("deadline_iso") or None,
        hard_deadline=e.get("hard_deadline", True),
        best_done_by_iso=e.get("best_done_by_iso") or None,
        non_negotiable=bool(e.get("non_negotiable")),
        must_split=bool(e.get("span_days")),
        user_priority=importance.user_priority(e),
        prefer_day=d, prefer_start_min=s,
    )


def _with_end_by(task: Task, end_by: dict[str, int]) -> Task:
    return dataclasses.replace(task, end_by=end_by[task.id]) if task.id in end_by else task


def _fill_sessions(subs: list[dict[str, Any]], lens: list[int]) -> list[list[dict[str, Any]]]:
    """Pour subtasks, in order, into sessions of the given lengths. A subtask that spills over
    a session boundary continues in the next one."""
    out: list[list[dict[str, Any]]] = [[] for _ in lens]
    si, room = 0, (lens[0] if lens else 0)
    for st in subs:
        left, part = st["minutes"], 1
        while left > 0 and si < len(out):
            take = min(left, room)
            # base_* remember the whole subtask this piece belongs to, so the UI can set a goal per subtask
            # ("finish 60% of it in this block") and Otto can suggest the share each session takes
            out[si].append({**st, "id": f'{st["id"]}_{si}', "minutes": take,
                            "base_id": st["id"], "base_name": st["name"], "base_minutes": st["minutes"],
                            "name": f'{st["name"]} (part {part})' if part > 1 or left > take else st["name"]})
            left -= take
            room -= take
            part += 1
            if room == 0:
                si += 1
                room = lens[si] if si < len(lens) else 0
    return out


def _reschedule_once(
    events: list[dict[str, Any]],
    pinned_ids: list[str],
    profile: Profile,
    week_days: list[int],
    *,
    week_start: date | None = None,
    today: date | None = None,
    now_min: int | None = None,
    mode: str = "displaced",
    plan_ids: list[str] | None = None,
    blocked_windows: list[dict[str, int]] | None = None,
    order_fix: str = "move_dependents",
) -> dict[str, Any]:
    """Re-place flexible events around a user change.

    events      calendar events (dicts). Extra keys are preserved on the way back.
                Optional per-event keys: prereq_ids, deadline_iso, hard_deadline, best_done_by_iso,
                effort_tier, non_negotiable, subtasks.
    pinned_ids  events the user just moved — they must not move.
    plan_ids    events just created. The scheduler decides whether each stays one block or is split
                into sessions, from what it has learned about the user's focus (see plan_sessions).
    week_days   the date-of-month numbers of the visible days, Monday first: 7 for a week, 14 for two.
    order_fix   what to do when an event sits before something it has to wait for:
                "move_dependents"    (default) the dependent is re-placed after its prerequisites;
                "move_prerequisites" the dependent stays and its prerequisites (and their own chain)
                                     are pulled earlier so they finish before it starts.
    blocked_windows  [{day (date of month), start_min, end_min}] — time the user wants cleared. Flexible
                events overlapping one are re-placed outside it; nothing is placed inside it.
    Returns {events, conflicts, moved, explanation}.
    """
    n_days = min(len(week_days), MAX_DAYS)
    day_idx = {num: i for i, num in enumerate(week_days)}
    pinned = set(pinned_ids)
    windows = [w for w in (blocked_windows or []) if w["day"] in day_idx and w["end_min"] > w["start_min"]]
    blocked = [(day_idx[w["day"]], w["start_min"], w["end_min"]) for w in windows if not w.get("for_ids")]   # nothing goes in
    reserved_raw = [(day_idx[w["day"]], w["start_min"], w["end_min"], list(w["for_ids"])) for w in windows if w.get("for_ids")]

    # --- past days are history; today before `now` is unavailable ------------------
    start_day = 0
    eff_now = None
    if week_start and today:
        idx = (today - week_start).days
        start_day = max(0, min(idx, n_days))
        if idx == start_day:
            eff_now = now_min

    by_id = {e["id"]: e for e in events}
    pos: dict[str, tuple[int, int, int]] = {}  # id -> (dayIdx, start, end) for in-week events
    for e in events:
        if e["day"] in day_idx:
            pos[e["id"]] = (day_idx[e["day"]], e["startMin"], e["startMin"] + e["durationMin"])

    # new events the scheduler wants to cut up: decided from the learned focus span, not by the UI
    split_ids = {
        e["id"] for e in events
        if e["id"] in (plan_ids or []) and e["id"] in pos and not e.get("fixed", False)
        and pos[e["id"]][0] >= start_day
        and plan_sessions(_task_from_event(e, pos), profile)
    }

    def locked(e: dict[str, Any]) -> bool:
        return (e.get("fixed", False) or bool(e.get("crunch")) or (e["id"] in pinned and e["id"] not in split_ids)
                or pos[e["id"]][0] < start_day)

    flexible = [e for e in events if e["id"] in pos and not locked(e)]
    keepers = [e for e in events if e["id"] in pos and locked(e)]

    # --- which flexible events must move -------------------------------------------
    if mode == "full":
        movable_ids = {e["id"] for e in flexible}
    else:
        occupied = [pos[e["id"]] for e in keepers] + blocked + [(d, a, b) for d, a, b, _ in reserved_raw]
        movable_ids = set()
        for e in sorted(flexible, key=lambda x: (pos[x["id"]][0], pos[x["id"]][1])):
            p = pos[e["id"]]
            if any(_overlaps(p, o) for o in occupied):
                movable_ids.add(e["id"])
            else:
                occupied.append(p)
        # a dependent that now starts before its prerequisite ends must move too
        for e in flexible:
            for pid in e.get("prereq_ids", []):
                if pid in pos and (pos[e["id"]][0], pos[e["id"]][1]) < (pos[pid][0], pos[pid][2]):
                    movable_ids.add(e["id"])
    movable_ids |= split_ids

    # "pull the prerequisites earlier": the event the user placed stays; everything it waits for (transitively) is
    # re-placed, each with a latest finish so that the whole chain ends before the dependent begins
    end_by: dict[str, int] = {}
    if order_fix == "move_prerequisites":
        flex_ids = {e["id"] for e in flexible}
        for e in events:
            if e["id"] not in pos:
                continue
            d0, s0, _ = pos[e["id"]]
            late = [p for p in e.get("prereq_ids", []) if p in pos and (d0, s0) < (pos[p][0], pos[p][2])]
            if not late:
                continue
            movable_ids.discard(e["id"])                       # this one stays where the user put it
            base_tasks = {x["id"]: _task_from_event(x, pos) for x in events if x["id"] in pos}
            stack = [(e["id"], d0 * 1440 + s0)]
            while stack:
                q, limit = stack.pop()
                for pid in by_id[q].get("prereq_ids", []):
                    if pid not in pos or pid not in flex_ids:
                        continue
                    movable_ids.add(pid)
                    end_by[pid] = min(end_by.get(pid, limit), limit)
                    stack.append((pid, limit - _required_minutes(base_tasks[pid], profile, False)))

    # A block that stays where it is must still come after what it waits for. If something it waits for is being re-placed (it sat in
    # a window the user cleared, or was displaced), that prerequisite must finish before the block starts, on any day of the week
    # that has not passed. Without this ceiling the engine put the prerequisite at the first free slot near its old place, which
    # could be after the dependent, and the move was reported as "couldn't fit cleanly" although earlier days had room.
    for e in events:
        if e["id"] not in pos or e["id"] in movable_ids:
            continue
        d0, s0, _ = pos[e["id"]]
        stack = [(e["id"], d0 * 1440 + s0)]
        seen: set[str] = set()
        while stack:
            q, limit = stack.pop()
            if q in seen:
                continue
            seen.add(q)
            for pid in by_id[q].get("prereq_ids", []):
                if pid not in pos or pid not in movable_ids:
                    continue
                end_by[pid] = min(end_by.get(pid, limit), limit)
                stack.append((pid, limit - _required_minutes(_task_from_event(by_id[pid], pos), profile, False)))

    kept = [e for e in events if e["id"] in pos and e["id"] not in movable_ids]

    # a reserved window is cleared for certain events *and everything they wait for*; nothing else may use it
    def _closure(ids: list[str]) -> set[str]:
        seen: set[str] = set()
        stack = list(ids)
        while stack:
            i = stack.pop()
            if i in seen or i not in by_id:
                continue
            seen.add(i)
            stack.extend(by_id[i].get("prereq_ids", []))
        return seen
    reserved = [(d, a, b, _closure(ids)) for d, a, b, ids in reserved_raw]

    # --- build the engine problem --------------------------------------------------
    # recurring blocks repeat every week; the engine works on absolute day indexes
    blocks = [TimeBlock(day=b.day + DAYS_IN_WEEK * k, start_min=b.start_min, end_min=b.end_min,
                        label=b.label, kind=b.kind)
              for k in range(math.ceil(n_days / DAYS_IN_WEEK)) for b in profile.time_blocks
              if b.day + DAYS_IN_WEEK * k < n_days]
    blocks += [TimeBlock(day=d, start_min=s, end_min=en, label="blocked") for d, s, en in blocked]
    for e in kept:
        d, s, en = pos[e["id"]]
        blocks.append(TimeBlock(day=d, start_min=s, end_min=en, label=e["title"],
                                kind=to_category(e.get("category")).value))
    work_profile = Profile.from_dict(profile.to_dict())
    work_profile.time_blocks = blocks

    def _prep(e: dict[str, Any]) -> Task:
        t = _with_end_by(_task_from_event(e, pos), end_by)
        keep_out = [(d, a, b) for d, a, b, allowed in reserved if e["id"] not in allowed]
        return dataclasses.replace(t, keep_out=keep_out) if keep_out else t

    tasks = [_prep(e) for e in flexible if e["id"] in movable_ids]
    anchored = {e["id"]: (pos[e["id"]][0], pos[e["id"]][2]) for e in kept}

    plan = schedule(
        tasks, work_profile, deadline_day=n_days - 1,
        start_day=start_day, now_min=eff_now, week_start=week_start,
        allow_split=False, allow_overpack=False, allow_tight=True, apply_cap=False,
        anchored_end=anchored, focus_split_ids=split_ids,
    ) if tasks else None

    # --- map back ------------------------------------------------------------------
    conflicts: set[str] = set()
    moved: list[str] = []
    placed: dict[str, tuple[int, int]] = {}      # task/session id -> (dayIdx, start)
    sessions_of: dict[str, list[tuple[str, int]]] = {}   # parent id -> [(session id, planned minutes)]
    if plan:
        for b in plan.blocks:
            placed[b.task_id] = (b.day, b.start_min)
        for parent, ids in plan.splits.items():
            lens = plan_sessions(_task_from_event(by_id[parent], pos), work_profile) or []
            sessions_of[parent] = list(zip(ids, lens))
        if plan.at_risk:
            conflicts.update(plan.at_risk)

    out: list[dict[str, Any]] = []
    final: dict[str, tuple[int, int, int]] = {}  # output event id -> (dayIdx, start, end)
    split_notes: list[str] = []
    for e in events:
        eid = e["id"]
        if eid in sessions_of:
            sess = sessions_of[eid]
            n = len(sess)
            distributed = _fill_sessions(e.get("subtasks") or [], [m for _, m in sess]) if e.get("subtasks") else [[] for _ in sess]
            for i, (sid, m) in enumerate(sess):
                d, st = placed.get(sid, (pos[eid][0], pos[eid][1]))   # unplaced: stays at the original spot
                if sid not in placed:
                    conflicts.add(sid)
                ev = {**e, "id": sid, "title": f'{e["title"]} ({i + 1}/{n})', "day": week_days[d],
                      "startMin": st, "durationMin": m, "split_of": eid, "session": i + 1, "sessions_total": n,
                      "base_title": e["title"]}
                if distributed[i]:
                    ev["subtasks"] = distributed[i]
                else:
                    ev.pop("subtasks", None)
                # Sessions are doable in any order unless the task itself is order-specific. What it has to wait for
                # (its own prerequisites) applies to every session.
                if e.get("order_specific") and i > 0:
                    ev["prereq_ids"] = [f"{eid}#{i}"]
                else:
                    ev["prereq_ids"] = list(e.get("prereq_ids", []))
                out.append(ev)
                final[sid] = (d, st, st + m)
                moved.append(sid)
            split_notes.append(
                f'Split "{e["title"]}" into {n} sessions of about {_fmt_dur(sess[0][1])}: your focus tends to '
                f'hold for about {_fmt_dur(profile.focus_span_min)} '
                f'(learned from {profile.focus_evidence} sessions).'
            )
        elif eid in pos and eid in placed:
            d, st = placed[eid]
            if (d, st) != (pos[eid][0], pos[eid][1]):
                moved.append(eid)
                out.append({**e, "day": week_days[d], "startMin": st})
            else:
                out.append(e)
            final[eid] = (d, st, st + e["durationMin"])
        else:
            out.append(e)
            if eid in pos:
                final[eid] = pos[eid]

    # sequential-order check on the final layout (catches pinned/fixed dependents too)
    order_violations: list[dict[str, Any]] = []   # [{id, prereq_ids}] — starts before something it must follow
    for e in out:
        if e["id"] not in final:
            continue
        late = [pid for pid in e.get("prereq_ids", [])
                if pid in final and (final[e["id"]][0], final[e["id"]][1]) < (final[pid][0], final[pid][2])]
        if late:
            conflicts.add(e["id"])
            order_violations.append({"id": e["id"], "prereq_ids": late})

    # safety net: whatever is still overlapping after the engine ran must be visible, not silent
    # (e.g. the user dropped something on a day that has already passed, which is never rescheduled)
    involved = pinned | set(moved) | (set(plan.at_risk) if plan else set())
    ids = list(final)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            if (a in involved or b in involved) and _overlaps(final[a], final[b]):
                conflicts.update((a, b))

    titles = {e["id"]: e["title"] for e in out}
    dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    parts = [f'"{titles[i]}" → {dow[final[i][0] % 7]} {_fmt(final[i][1])}' for i in moved
             if i in final and i not in session_ids(sessions_of)]
    explanation = " ".join(split_notes)
    if parts:
        explanation = (explanation + " " if explanation else "") + "Re-placed around your change: " + "; ".join(parts) + "."
    for v in order_violations:   # say exactly what is wrong, not just that something didn't fit
        before = " and ".join(f'"{titles[p]}"' for p in v["prereq_ids"])
        explanation = (explanation + " " if explanation else "") + f'"{titles[v["id"]]}" has to come after {before}.'
    unfit = sorted(i for i in conflicts if i in titles and i not in {v["id"] for v in order_violations})
    if unfit:
        names = ", ".join(f'"{titles[i]}"' for i in unfit)
        explanation = (explanation + " " if explanation else "") + f"Couldn't fit cleanly: {names}."
    if any(i in pos and pos[i][0] < start_day for i in pinned):
        explanation = (explanation + " " if explanation else "") + "That day has already passed, so nothing there is rescheduled."

    return {"events": out, "conflicts": sorted(conflicts), "moved": moved, "explanation": explanation,
            "order_violations": order_violations}


def session_ids(sessions_of: dict[str, list[tuple[str, int]]]) -> set[str]:
    return {sid for sess in sessions_of.values() for sid, _ in sess}


def _is_hard(e: dict[str, Any]) -> bool:
    return bool(e.get("deadline_iso")) and e.get("hard_deadline", True) is not False


def _reschedule_crunch(events, pinned_ids, profile, week_days, **kw):
    """Same as _reschedule_once, plus the crunch fallback.

    Sleep hours are protected: the engine never plans into them. The one exception is a hard deadline that cannot
    otherwise be met (10 hours of work still to do, due in 12 hours). Then, and only then, the work that did not fit is
    tried again with the day stretched first into the late evening and then into the early morning, and anything placed
    out of the normal hours is flagged `crunch` so the page can say so. A person can also drag anything into those hours
    by hand; a `crunch` event is left where it is by later reschedules."""
    res = _reschedule_once(events, pinned_ids, profile, week_days, **kw)
    by_id = {e["id"]: e for e in res["events"]}
    bad = {v["id"] for v in res["order_violations"]}
    pinned = set(pinned_ids)
    unfit = [i for i in res["conflicts"]
             if i in by_id and i not in bad and i not in pinned and not by_id[i].get("fixed") and not by_id[i].get("crunch") and _is_hard(by_id[i])]
    if not unfit:
        return res
    tiers = [(profile.day_start_min, 24 * 60), (0, 24 * 60)]
    for lo, hi in tiers:
        if (lo, hi) == (profile.day_start_min, profile.day_end_min):
            continue
        wide = Profile.from_dict(profile.to_dict())
        wide.day_start_min, wide.day_end_min = lo, hi
        keep = [e["id"] for e in res["events"] if e["id"] not in unfit]
        kw2 = {k: v for k, v in kw.items() if k not in ("mode", "plan_ids")}
        # out of hours there is no "peak window" to honour: the rush job goes wherever it can
        relaxed = [{**e, "effort_tier": "med"} if e["id"] in unfit else e for e in res["events"]]
        retry = _reschedule_once(relaxed, keep, wide, week_days, mode="full", plan_ids=[], **kw2)
        got = {e["id"]: e for e in retry["events"]}
        if any(i in retry["conflicts"] for i in unfit):
            continue                      # still not enough: try the next, wider tier
        out = []
        named = []
        for e in retry["events"]:
            if e["id"] in unfit:
                if "effort_tier" in by_id[e["id"]]:
                    e = {**e, "effort_tier": by_id[e["id"]]["effort_tier"]}
                else:
                    e = {k: v for k, v in e.items() if k != "effort_tier"}
                outside = e["startMin"] < profile.day_start_min or e["startMin"] + e["durationMin"] > profile.day_end_min
                if outside:
                    e = {**e, "crunch": True}
                    named.append(e["title"])
            out.append(e)
        note = ""
        if named:
            note = ("Sleep time is protected, but " + ", ".join(f'"{t}"' for t in named)
                    + " has a hard deadline that nothing else could meet, so it was placed in your sleep hours. Move it if you can.")
        explanation = (res["explanation"] + " " + note).strip()
        return {"events": out, "conflicts": [c for c in res["conflicts"] if c not in unfit], "moved": res["moved"] + [i for i in unfit if i not in res["moved"]],
                "explanation": explanation, "order_violations": res["order_violations"]}
    return res


def reschedule_events(events, pinned_ids, profile, week_days, **kw):
    """The scheduler's answer, plus `decisions`: questions the user has to answer because the engine will not guess them
    (see importance_decisions)."""
    res = _reschedule_crunch(events, pinned_ids, profile, week_days, **kw)
    res["decisions"] = importance_decisions(res["events"], res["conflicts"], week_days, kw.get("week_start"))
    return res


def importance_decisions(events: list[dict[str, Any]], conflicts: list[str], week_days: list[int], week_start: date | None) -> list[dict[str, Any]]:
    """A task the user marked low importance has a hard deadline it cannot meet, while something they marked important sits in
    the time before that deadline. Which one gives way is the user's call, not the scheduler's: it returns the pair as a question.
    A task the user already answered for (`yielded`) is not asked about again."""
    if not week_start:
        return []
    by_id = {e["id"]: e for e in events}
    day_idx = {n: i for i, n in enumerate(week_days)}
    out: list[dict[str, Any]] = []
    for cid in conflicts:
        low = by_id.get(cid)
        if not low or low.get("fixed") or low.get("yielded") or not low.get("deadline_iso") or low.get("hard_deadline", True) is False:
            continue
        if not importance.is_low(low):
            continue
        try:
            limit = (date.fromisoformat(low["deadline_iso"][:10]) - week_start).days
        except ValueError:
            continue
        rivals = [e for e in events if e["id"] != cid and not e.get("fixed") and e["id"] not in conflicts and importance.is_important(e)
                  and e["day"] in day_idx and day_idx[e["day"]] <= limit and not e.get("done")
                  and not (e.get("deadline_iso") and e.get("hard_deadline", True) and e["deadline_iso"][:10] <= low["deadline_iso"][:10])]
        if not rivals:
            continue
        high = sorted(rivals, key=lambda e: (importance.value(e), -e["durationMin"]))[0]
        out.append({
            "low": {"id": low["id"], "title": low["title"], "deadline_iso": low["deadline_iso"][:10], "importance": importance.label(low)},
            "high": {"id": high["id"], "title": high["title"], "importance": importance.label(high)},
            "question": f"“{low['title']}” is due {low['deadline_iso'][:10]} but you marked it {importance.LABELS[low['importance_cat']].lower()}, and there is no room for it "
                        f"unless “{high['title']}”, which you marked important, gives way. Which matters more?",
        })
    return out
