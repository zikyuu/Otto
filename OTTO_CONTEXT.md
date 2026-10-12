# OTTO: full project context (handoff for a new Claude session)

Written 2026-10-11 from the whole working history. Read this first. It replaces having the old conversation.
Repo: `/Users/shianne/coding/Otto` (branch `shianne-(revamp)`). Owner: shianne (GitHub org/repo `zikyuu/Otto`).

---

## 0. TL;DR

Otto is an all-in-one calendar OS that learns how the user actually works and schedules around it.

- **The scheduler is our own deterministic algorithm. No LLM is in the scheduling path.** It learns per-user patterns (pace per category, peak hours, focus span) from small signals.
- The LLM is only used at the edges and rarely: goal-drift review (about weekly), resume/JD parsing, narration. Reason: keep cost low and behaviour predictable.
- Backend: Python/FastAPI. Frontend: React + Vite with inline styles (no CSS framework).
- The user wants to **ship quickly** (deadline was "tomorrow" as of 2026-10-11). Prefer working, tested increments over big redesigns.

---

## 1. Working rules for Claude (from the user)

1. **Never echo API credentials back.** `backend/.env` holds `OPENAI_API_KEY`, `EXA_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`. Never print their values in any response. Do not read `.env` aloud. Tests blank the keys on purpose.
2. **Don't commit or push unless asked.** (Attribution lines for commits are set by the harness.)
3. **Never use broad `pkill -f` patterns** (e.g. `pkill -f "uvicorn app.main"` or `pkill -f vite`). That killed the user's own backend once and caused a confusing "HTTP 500". Start test servers on their own ports and stop only by PID.
4. User style: short, direct answers; wants to know *what is built / fixed / needs fixing / not built*. Likes being told the cause of a bug plainly.
5. The user dislikes LLM calls for interactions (slow, inconsistent, costly, opaque). Anything per-drag or per-create must be deterministic.
6. Splits of long tasks are **the scheduler's decision from learned data**, never a UI prompt (see section 6.3).
7. For UI work: keep the existing look unless told otherwise (cream/brown palette, Quicksand, otter mascot). The `taste-skill` plugin was installed (user scope, see section 12); start a new session to use it.
8. Verify UI changes in the browser pane before claiming done (type checks and tests don't prove UI works).

---

## 2. Repo map

```
Otto/
  OTTO_CONTEXT.md        (this file)
  plan.md, ARCHITECTURE.md, GITHUB_ISSUES.md   OLD hackathon docs (job-interview-prep version). Outdated; don't trust for status.
  backend/
    app/
      main.py            FastAPI app + all endpoints
      models.py          the data contract (dataclasses + enums)
      store.py           JSON persistence of the learned Profile (backend/data/profile.json, gitignored)
      engine/
        scheduler.py     the scheduling engine (deterministic)
        learning.py      updates Profile from user signals (EMA etc.)
        calendar_bridge.py  translates calendar events <-> engine tasks, runs schedule(), maps back
        feasibility.py   "can this close at the user's real pace?" + forced tradeoff
        gaps.py          goal skill-gap -> tasks (Exa signal, SKILL_TASKS fallback)
      llm/extract.py     LLM: parse resume/JD, narrate, direction_review (edges only)
      sources/adapters.py  ManualSource etc; Google Calendar / Exa job adapters are STUBS
      demo_data/demo.json  seeded demo (key `time_blocks`, was `walls`)
      db_models.py, database.py   dead code (SQLAlchemy/Supabase); db_models imports a Base that doesn't exist. Renamed only.
    schema.sql           Supabase schema (renamed tables: time_blocks, task_completions)
    tests/               conftest.py, test_engine.py, test_scheduler.py, test_learning.py, test_calendar_api.py
  frontend/
    vite.config.js       dev server; proxies /api -> http://127.0.0.1:8000 (IPv4 on purpose; "localhost" resolves to IPv6 and fails)
    src/
      App.jsx, api.js (learning-signal helpers), data/fixtures.js (MOCK data), assets/mascots/
      components/ DeleteButton, PieChart, Sidebar, WeekGrid
      modals/ Feasibility, Tradeoff, TaskCreateModal (mostly mock/legacy)
      views/ Now, Goals, Stats, Recovery (mock data except Goals' AI review button)
      views/calendar/
        Calendar.jsx, MonthView.jsx, WeekView.jsx (EventChip, DraftGhost, hover card), EventCreation.jsx (popup)
        useDragResize.js, calendarUtils.js
        subtaskMath.js (+ .test.mjs)  pure allocation math for the subtask planner
        dateChecks.js (+ .test.mjs)   deadline / best-done-by validation
```

### Run it
Backend (first time: create venv; user's venv is `backend/.venv`):
```bash
cd /Users/shianne/coding/Otto/backend
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt   # once
uvicorn app.main:app --reload --port 8000
```
Frontend:
```bash
cd /Users/shianne/coding/Otto/frontend && npm install && npm run dev      # http://localhost:5173
```
Tests:
```bash
cd backend && python -m pytest tests -q                       # 179 pass (pytest is installed in backend/.venv)
cd frontend && node --test src/views/calendar/subtaskMath.test.mjs src/views/calendar/dateChecks.test.mjs   # 10 + 8 pass
```
Tests blank OPENAI/EXA keys and point the profile store at a temp file (never touch the real profile or the network).

The backend can also serve the built frontend (`frontend/dist`) as an SPA fallback.

---

## 3. The product vision (user's own words, condensed)

- Calendar OS: tracks goals, habits, waking times, most productive hours, deadlines.
- Tasks have **subtasks with sequential ranking** (e.g. interview prep must come before the interview).
- The algorithm reschedules to the best possible schedule to keep deliverables met, taking personal work habits into account.
- Tracks **long-term goals across months** and uses periodic LLM calls to check the user is on track. Example: goal "learn Machine Learning" but the user spends a month on Python syntax -> flag it and redirect.
- A mascot (otter) and a "Meatball Grinder" (parking basket, section 7.2) give it personality.

---

## 4. Backend architecture (what exists)

### 4.1 Data model (`models.py`, the contract)
- `Profile`: skills, `free_hours_per_day`, `time_blocks` (recurring fixed blocks, was `Wall`), `completion_rate` (was `velocity`), `avg_velocity` per category, `ramp_up_min`, `day_start_min`/`day_end_min` (sleep window, default 08:00-23:00; supports >24h for all-nighters), `peak_window` (default 9-12), `post_meal_slump_min` (45), `planning_bias` (0.8), **`focus_span_min` (120) and `focus_evidence` (0)**, `energy_logs`, `reflections`, `off_track_logs`, `stated_rules`. Has `to_dict()` / `from_dict()` (round-trips; used by the store).
- `Task`: `duration_planned`, `importance`, `category` (deep_work/admin/creative/physical/social), `effort_tier` (derived from duration: <30 low, 30-90 med, 90-180 high, 3h+ deep), `prereq_ids`, `deadline_iso` + `hard_deadline` + `best_done_by_iso`, `fixed`, `non_negotiable`, `checklist`, `status`, `prefer_day`/`prefer_start_min` (placement hints), **`split_of`** (id of the task this is a session of).
- `Block` (scheduler output: day, start/end, task_id, lite/is_split/overpacked), `Plan` (blocks, at_risk, meatball_grinder, carried_forward, feasible, tradeoff, **splits** {parent id: [session ids]}).
- Signals: `EnergyLog` (1-5), `TaskReflection` (nailed/harder/outlier/interrupted/gap), `OffTrackLog` (reason, duration, **into_task_min**), `TaskCompletion`.
- Others (models only, not wired): `OversleepEvent`, `OversleepTriageDecision`, `MeatballGrinderEntry`, `PriorityWindow`, `EventAnchor`/`LinkRelation`, `CalendarEvent`.

### 4.2 Scheduler (`engine/scheduler.py`)
Pure, no I/O. `schedule(tasks, profile, deadline_day, ...)` places tasks into a 7-day week.

Order of operations:
1. Drop DONE tasks (count as satisfied); park MEATBALL_GRINDER tasks.
2. **Focus split** (section 6.3): replace over-long demanding tasks by chained sessions.
3. Topological sort by `prereq_ids`; sort by priority (importance/minutes; hard deadline x3, soft/best-done-by x1.5).
4. Slot size = `planned * avg_velocity[category] + ramp_up_min[category]`.
5. For each task: walk days (nearest to `prefer_day` first, else earliest; sessions of one split task prefer *different* days) up to the task's hard-deadline day; first valid start that passes the gates:
   - HIGH/DEEP effort must start inside `peak_window`; never during post-lunch slump (12:00 + `post_meal_slump_min`).
   - physical tasks stay out of the peak window.
   - a task never starts before its prerequisites finish (`placed_end`, plus `anchored_end` for fixed calendar prerequisites).
   - candidate starts are scanned on a 15-min grid inside each free gap (so a gap opening at 08:00 still yields a 09:00 peak start).
6. If no clean slot: split across sessions (one per day max; optional `allow_split`), then overpack to >=80% of need if the deadline is tight (optional `allow_overpack`).
7. Anything left -> `at_risk`.

Parameters the calendar uses: `start_day` (past days excluded), `now_min`, `week_start` (real ISO deadlines), `allow_split=False`, `allow_overpack=False`, `apply_cap=False` (events on the calendar *are* the load), `anchored_end`, `focus_split_ids`.

Fixed in this project (bugs found by tests): prerequisite order was only accidentally respected; hard deadlines weren't enforced; a failed split leaked free time; gating only tested a gap's start; DONE tasks were rescheduled.

Added in the second build (all tested, `tests/test_rules.py`):
- **Priority = the spec formula** `0.4 urgency + 0.3 fixed + 0.2 dependency blocker + 0.1 importance` (each 0..1; constants `W_*` in scheduler.py). Ties: `user_rank`, then value density.
- **PriorityWindow / user_rank** are used: `apply_priority_windows` fills rank + non_negotiable from the narrowest window containing today. `GET/PUT /api/priority-windows`.
- **Displacement:** a `non_negotiable` task with no slot bumps the lowest-priority placed task (never another non-negotiable, fixed, or depended-on task; prefers victims without a hard deadline). Result in `plan.displaced`; the victim is re-queued.
- **Deep-work breaks:** max `max_deep_run_min` (90) of deep work, then `break_min` (15). Long blocks get breaks inside (`plan.breaks`, `Block.is_break`); every deep block keeps a break gap after it.
- **Gym-first:** with `profile.gym_first`, a morning physical task is placed first and deep work waits until it ends.
- **recovery_after_meeting:** free buffer after social blocks (`TimeBlock.kind == "social"`) and after scheduler-placed social tasks.
- **batching_preference** `none|batch|spread` for small admin tasks (<=45 min).
- `allow_displace` flag on `schedule()`.

### 4.3 Learning engine (`engine/learning.py`)
Flow: user signal -> API endpoint -> learning updates Profile -> saved (`store.py`) -> next `/api/schedule` or `/api/plan` reads it. EMA weight 0.2 (recent 20%, history 80%).

- `update_velocity`: only HARDER and NAILED reflections; ratio actual/planned clamped to [0.5, 2.5]; velocity clamped to [0.6, 2.5]; ignores actual<=0 and unknown categories.
- `update_peak_window`: needs >=10 energy logs spread over >=3 distinct hours; picks the best 3-hour window (average energy; ties broken by more hours of data, then earlier).
- `update_completion_rate`: INTERRUPTED does not count against the user.
- **Second build:** `set_stated_rule` / `clear_stated_rule` (level-1 rules, pinned in `profile.stated_overrides`; learning never overwrites them), `set_sleep_window` (past midnight OK), `update_post_meal_slump` (afternoon energy logs), `update_recovery` (energy taps with `after_meeting_min`), `update_ramp_up` (intercept of actual-vs-planned per category), `update_gym_pattern` (order gym vs deep work finished, >=3 days, >=70%), `planning_bias` follows `completion_rate` after 5 completion signals, GAP reflections fill `gap_task_ids`, `classify_actual`, `chronotype`.
- **Focus span** (new): `update_focus_span_from_reflection` (a NAILED long session, >=0.75x current span, raises the span and counts as evidence) and `update_focus_span_from_break` (a labelled focus break at least 20 min into a session lowers it; emergencies, healthy breaks, early lapses ignored). `add_off_track`. Span clamped 45-480 min.
- History lists capped at 500.

Probing the old learning code found these wonky behaviours, now fixed: 0-minute entries collapsed velocity; one 10x outlier jumped it to 3.0; junk category buckets; single-hour energy logs moved the peak window; interrupted tasks hurt completion rate; reflections weren't stored.

### 4.4 Calendar bridge (`engine/calendar_bridge.py`)
`reschedule_events(events, pinned_ids, profile, week_days, week_start, today, now_min, mode, plan_ids)`:
- Maps frontend categories to engine categories (llm/leetcode/system-design/deep work -> deep_work; interview/social -> social; gym -> physical; leisure -> creative; admin/life/unknown -> admin).
- Locked (never moved): `fixed`, the pinned event (the one the user just moved), past days. Everything else is flexible.
- **mode "displaced" (default, ripple):** only flexible events that now overlap something (or start before their prerequisite ends) are re-placed, near where they were. **mode "full":** re-optimise every flexible event against learned habits (not used by the UI yet).
- Events keep their own duration; extra keys (subtasks, description, deadlines...) pass through.
- **`plan_ids`** = just-created events: the scheduler may split them (section 6.3). Sessions are returned as new events (`split_of`, `session`, `sessions_total`, chained `prereq_ids`), with subtasks distributed across them.
- Safety net: any leftover overlap involving a moved/pinned/unplaced event is returned in `conflicts` instead of silently overlapping; dropping onto a past day yields an explanation ("That day has already passed...").
- Returns `{events, conflicts, moved, explanation}`.

### 4.5 API endpoints (`main.py`)
| Endpoint | Purpose |
|---|---|
| `POST /api/schedule` | calendar reschedule (engine only). Body: `events[]`, `pinned_ids[]`, `plan_ids[]`, `week_days[7]` (date-of-month numbers Mon-Sun), `week_start_iso`, `mode` |
| `GET /api/learning` | learned state (velocity, peak window, completion rate, focus span/evidence, counts) |
| `POST /api/learning/reflection` | `{task_id, choice, planned_minutes, actual_minutes, category}` |
| `POST /api/learning/energy` | `{level 1-5, ts?}` |
| `POST /api/learning/off-track` | `{reason, duration_min, into_task_min?, task_id?, ts?}` reasons: doomscrolled, messages, couldnt_focus, break, medical, family, work_crisis |
| `POST /api/learning/completion` | `{task_id, done, planned_minutes}` -> completion_rate / planning_bias |
| `POST /api/learning/actual` | dragged actual end. Within 10% of plan -> recorded as nailed; else `{ask_reflection: true}`, nothing recorded |
| `POST /api/learning/stated-rule` , `/stated-rule/clear` | `{key, value, note?}` pinned user rule (keys listed in `api.js`) |
| `POST /api/profile/sleep-window` | `{wake_min, sleep_min}` (sleep may be > 1440) |
| `GET/PUT /api/priority-windows` | ranked + non-negotiable task ids per week/month/year |
| `POST /api/plan`, `/api/reshuffle` | goal-based planning (older hackathon flow), uses the learned profile merged under the request profile |
| `POST /api/profile`, `/api/parse-resume-file`, `/api/goal`, `/api/chat` | LLM edges (resume/JD parse, narration) |
| `POST /api/ai/review-goals` | the LLM goal-drift review (Exa-grounded). **The only LLM call in the calendar app.** Button-triggered; no weekly trigger yet |
| `GET /api/health`, `/api/demo` | misc |

**Removed on purpose:** `/api/ai/reschedule` (GPT scheduling).

Event JSON the frontend sends: `{id, title, day (date of month), startMin, durationMin, category, fixed}` plus optional `prereq_ids, deadline_iso, hard_deadline, best_done_by_iso, non_negotiable, description, subtasks[{id,name,minutes,order}], order_specific`.

### 4.6 Other backend pieces (older hackathon "job prep" flow, still present)
- `gaps.py` derives tasks from a Goal's required skills (Exa live signal, `SKILL_TASKS` fallback), `feasibility.py` builds a forced tradeoff when infeasible, `llm/extract.py` has `parse_resume`, `parse_jd`, `narrate`, `direction_review`, `zo_agent.py` sends Telegram nudges. The frontend doesn't use these flows yet.

---

## 5. The full feature spec (as designed in the discussion) and its status

Legend: DONE = built and working; BACKEND ONLY = engine/API exist, no UI; PARTIAL; NOT BUILT.

### 5.1 Learning signals (the "6 levels")
| # | Signal | Status |
|---|---|---|
| 1 | User-stated rules from the weekly mascot chat (override everything) | BACKEND ONLY: structured rules via `/api/learning/stated-rule` pin parameters. Free-text -> rules (the chat) NOT BUILT |
| 2 | Post-task reflection (after dragging the actual end time): nailed / harder / outlier ("just tired") / interrupted / fundamental gap | BACKEND ONLY |
| 3 | Energy logs: a `+` button on the live timeline, 5 levels (energised, in the zone, neutral, tired, drained), optional, never nag | BACKEND ONLY |
| 4 | Off-track block labels (doomscrolled, messages, couldn't focus, break; medical, family, work crisis) | BACKEND ONLY (endpoint feeds focus span; no UI) |
| 5 | Actuals drag | BACKEND ONLY (`/api/learning/actual`); UI resize doesn't call it yet |
| 6 | Algorithm-derived patterns | PARTIAL: gym-first, ramp-up, slump, recovery, planning bias, chronotype. Rest of 5.3 NOT BUILT |

### 5.2 Learned parameters
`peak_window` DONE; `avg_velocity` per category DONE; `completion_rate` DONE (only used by feasibility); `focus_span_min` DONE (new); `planning_bias`, `post_meal_slump_min`, `ramp_up_min`, `recovery_after_meeting` (default 15) are now learned (BACKEND ONLY); `batching_preference` (default none) is user-set only; `gym_first` learned. Sleep window: scheduler respects it and `/api/profile/sleep-window` sets it, but the calendar grid is hard-coded 08:00-23:00 and there is no draggable sleep block (no UI).

Cold-start defaults: peak 9-12, post-meal slump 45, planning bias 0.8, velocity deep_work 1.3 / admin 1.0 / creative 1.2 / physical 1.0 / social 1.0, ramp-up deep_work 15 / creative 10 / physical 5, focus span 120 (unproven until 3 observations).

### 5.3 Behavioural metrics listed in the spec (all NOT BUILT except where noted above)
Core: morning vs night person, post-meal slump, over/under planner, energy curve, sleep-start effect. Derived: task-switching cost, activation energy, meeting hangover, deadline-proximity effect, recovery after hard tasks, decision-fatigue curve, streak sensitivity, weekend recharge, social drain vs recharge, unfinished-task anxiety. User-stated: any constraint they name in the weekly chat (e.g. "I can't get things done if I wake after 2pm").

### 5.4 Scheduler rules from the spec
DONE: never overlap fixed events; hard tasks only in the peak window; velocity buffer; daily load cap by planning bias (not on the calendar path); prerequisite order; hard-deadline enforcement; 30% deadline warning buffer; split across sessions; overpack when tight.
Also DONE (second build): the spec priority formula; gym-first day pattern; max 90 min deep work then a 15-min auto-break; displacement for non-negotiable tasks; PriorityWindow/user_rank. NOT BUILT: nothing from this list.

### 5.5 Other features
- **Deadline buffer:** 30% (so a 10h task warns when only 13h free remain). DONE in `_has_tight_deadline` (needs real dates; calendar path passes `week_start`).
- **Hard deadline vs "best done by":** hard wins; best-done-by only boosts priority. DONE (engine + popup).
- **Feasibility + forced tradeoff** ("you can't do both, choose one"): DONE in the engine; the Feasibility/Tradeoff/Recovery screens are mock UI, not wired.
- **Checklist carry-over** ("2 items unfinished, add to a new slot?"): NOT BUILT.
- **Async task enrichment** (one batched LLM call per new task with >15 words, 3-5/week): NOT BUILT.
- **Weekly reflection**: metrics dashboard first, then mascot chat; the single most valuable LLM call (about 1/week). NOT BUILT (`Stats.jsx` is mock).
- **Screen time**: web = tab-visibility API only (weak signal), iOS blocked, Android needs a permission, browser extension is the best real source. NOT BUILT (KIV).
- **Event types**: fixed (DONE, lock icon), flexible (DONE), confirmed/tbc (dashed) NOT BUILT, travel buffer KIV.
- **Google Calendar sync, Exa job-match adapter**: stubs.
- **Long-term goals across months**: Goals view is mock data; planner is single-week.

---

## 6. Key design decisions (with reasons)

### 6.1 No LLM in scheduling
The first version asked an LLM to reschedule after every drag: slow (2-5s), inconsistent, costly, opaque, and it shuffled the whole week so users lost trust. Replaced by the deterministic engine; `/api/ai/reschedule` deleted.

### 6.2 Rescheduling = ripple by default
Moving one event only fixes what it displaces (overlaps, broken prerequisite order), keeping other events put and re-placed ones near where they were. Planned but NOT BUILT: "selection mode" (Reschedule button, dim page, drag to select one or several time windows, edge-clip handling "cut short / reschedule other half / whole event", proposals for unlocked events outside the selection, diff panel), then before/after staggered animation (build logic first, animate last).

### 6.3 Long tasks: the scheduler decides splits from learned focus
- Triggered only for **newly created events** (`plan_ids`); dragging an existing event never splits it.
- Only demanding categories (deep_work, creative). Admin/gym/social never split.
- Only when `focus_evidence >= 3`. With no evidence the user's own block is respected (a cold-start default isn't a reason to override them).
- Split when `planned x velocity > focus_span x 1.15`; sessions = ceil(real / span), equal lengths, **chained** (each depends on the previous), **one per day** when possible, each placed by the engine in peak hours.
- The explanation shown: `Split "X" into N sessions of about Yh: your focus tends to hold for about Zh (learned from K sessions).`
- A user with a long learned span keeps a 7h block whole on a free day; one whose focus fades gets ~2h sessions.
- The span only rises from long sessions marked "nailed" and falls from labelled focus breaks. Since there is no UI for those signals yet, real users won't see splits until the reflection/off-track prompts exist.

### 6.4 Subtask time allocator (event popup, "Advanced planning")
Rule: **the block length is a budget, and subtask minutes always add up to it exactly** (largest-remainder integer rounding in `subtaskMath.js`).
- Block length is editable at the top (type "2h", "1h30", "90"; bare number <= 12 = hours).
- Drag the pie: changes ratios only; block length never moves; other (unpinned) subtasks absorb the change.
- Type a subtask time: a choice card asks:
  - **Keep the block** (typed subtask stays; the others share the remainder by their ratio. Example: ratio 1:1:2:1 at 60m, set subtask 2 to 20 -> the others get 10/20/10), or
  - **Keep the ratios** (everything scales by the same factor; block resizes. Example: 1:1:2 at 80 -> 20/20/40 after setting one).
- Typed times are **pinned** (pin icon) so they hold while others change; click the pin to unpin.
- Changing the block length from the grid rescales unpinned subtasks. If everything is pinned and no longer matches the block, a small banner offers "Make block X" or "Unpin and re-spread".
- Earlier broken versions (don't reintroduce): mixing absolute minutes with percentages caused drifting totals and "5m unplanned".

### 6.5 Dates
`dateChecks.js`: Deadline and "Best done by" must be today-or-later **and not before the event's own day**; best-done-by must be on/before the deadline. Errors are inline and "Add to Calendar" says "Fix the dates to continue". The date picker's `min` is set to the earliest allowed date. Engine side: a past hard deadline just makes the event unplaceable (flagged), it doesn't crash.

### 6.6 Other decisions
- "Outstanding tasks basket": originally KIV ("keep in view"), then "carried forward", **finally named "Meatball Grinder"** by the user. A user-parked task is never auto-rescheduled and is distinct from `at_risk` (scheduler couldn't fit it).
- Effort tier is derived from duration; the 1-5 difficulty star input was dropped; the creative/deep-work/analytical category field was removed from creation to avoid friction.
- The popup lock was relabelled **"Must-do"** (= non_negotiable) because it shared the lock icon with "fixed" on calendar chips.
- Event colour = category only; lock/fixed shown by icon, not colour.
- Sidebar: collapsed (icons) by default; click to expand; navigating or clicking content collapses it. (Hover-expand and logo-toggle were rejected.)
- QuickAddPopup and EventCreation were redundant; merged into one `EventCreation` component with basic and advanced states.
- Mascot images live in `frontend/src/assets/mascots/`.
- Multi-session tasks: no explicit toggle; adding checklist items signals multi-session. Checklist items are natural split points; weights auto-normalise to 100%.
- Oversleep: grace buffer (about 2h after the first planned event), prompt on app open, not a push notification.
- The user wondered whether to call an LLM to check plan feasibility while creating an event; the decision was to use learned insights from the engine instead (not built yet).

---

## 7. Frontend UI: what exists and how it behaves

### 7.1 Calendar week view (`WeekView.jsx`, `useDragResize.js`)
- Click an empty slot -> ghost block (dashed) + an Apple-Calendar-style popup near it (not a full-height sidebar).
- Event chip interactions:
  - **Top 8px edge**: drag to change start time. **Bottom 8px edge**: drag to change end time. **Centre grip pill**: drag to move (same duration), including to another day. (Clicking elsewhere on the chip must not move it; this was an explicit bug fix.)
  - **Left-middle x button (hover)**: delete, with a confirmation card. The card opens **beside** the chip (right for Mon-Thu columns, left for Fri-Sun) because the scroll area clips anything above it under the date header.
  - **Lock/unlock** button (visible on locked events, on hover for others). Locked = `fixed`: can't be dragged and the scheduler never moves it.
  - Hover card: for events with a description / subtasks / deadlines, a read-only card appears beside the chip; tall chips also show subtask lines inline.
  - Conflict highlight (red, wobble) for `conflicts` returned by the scheduler; Undo (last 5 moves); a note banner shows the scheduler's `explanation`.
- Draft block (`DraftGhost`): drag top/bottom edges to resize, drag body to move; x to cancel; click outside the popup dismisses (document `pointerdown` listener; `stopPropagation` on the popup and on the column's own pointerdown so creating a draft doesn't instantly dismiss it).
- **Discard confirmation** when closing the popup (x, Esc, click outside) *if a title is typed*; state lives in WeekView (`confirmingCancel`) because it owns the title. This took three attempts (stale closures); **the user has not yet confirmed it works**.
- The grid is 08:00-23:00, 1.4 px/min, 15-min snap. Week shown follows the real current date; the week navigator has "Today", month and 1-week views (a 2-week view was promised but isn't built).
- New events are added as drawn and then sent to `/api/schedule` with `plan_ids=[id]`: this may re-place events they displace and may split them. If the scheduler is unreachable, the event is kept and a warning shows. Drags revert on scheduler failure.

### 7.2 Event creation popup (`EventCreation.jsx`)
Basic: title, description, time range + editable duration pill, colour dots (category), **Must-do** pill, the otter "Advanced planning" button, "Add to Calendar".
Advanced: deadline (+ "Hard" checkbox), best done by (soft), "Order specific" checkbox, pie chart + subtask list (name, pin, editable time, remove), add subtask.
- Order specific: `≡` drag handles to reorder; **right-click-drag lasso (Canva-style)** to select several subtasks and group them at the same order number (e.g. intro/body/conclusion all "order 2"); click the number to ungroup.
- On commit the event keeps description, subtasks (every subtask once any is named; blanks become "Subtask N"), order info, deadlines and flags.
- The otter button shrinks to a small inline "Advanced planning" label once expanded.

### 7.3 Other views
`Now` (today dashboard, mock tasks, "I fell behind"), `Goals` (mock goals + live AI review button), `Stats` (mock bars), `Recovery`, `Feasibility`, `Tradeoff` modals (mock), `TaskCreateModal` (legacy). Mock events in `fixtures.js` are dated Aug 4-10; the app shows the real current week, so those events can look like "past" events.

### 7.4 Node-linking UI (designed, NOT BUILT)
Link types: ORDERED (scheduler enforces chronology; violation = dismissible warning; e.g. interview prep -> mock interview -> interview; move the interview and the mock must move too) and GROUPED (no order; visual grouping, e.g. drawing/sound/lighting). Interaction: right-edge handle on hover -> drag to another event or empty slot, draws a bezier line; **long-press** on a linked event highlights the whole connected cluster (rings + lines, rest dims); sidebar dependency list under the parent with `=` drag handles to reorder (calls the scheduler); dual reorder (calendar drag vs list order). Neo4j-style graph storage was floated. Backend has `prereq_ids`, `EventAnchor`, `LinkRelation`; `/api/schedule` honours `prereq_ids` on events, but no UI sets them.

### 7.8 Broken order and link visibility
When an ordered link is violated (an event is dropped before something it waits for) the banner offers: move the dependent later (prerequisites stay), **move the prerequisites earlier** (the dependent stays; `fix_order: "move_prerequisites"` on `/api/schedule`, built on `Task.end_by`, a latest-finish the scheduler honours; the whole prerequisite chain is pulled in front of it), remove the link, or keep as is. If either fix can't fit it says so and disables that button. Links are not drawn by default: linked events carry a small link badge, and the lines for a group appear when you click one of its events, hold it, or while its order is broken.

### 7.10 Session goals, reflection, Meatball Grinder
- **Sessions are unordered.** When the scheduler splits a long task, its sessions can be done in any order (they are only chained when the task is order-specific). Each piece of a session remembers its whole subtask (`base_id/base_name/base_minutes`), and the session carries `base_title`; titles like "Essay (2/6)" are computed from the sessions' actual chronological order (`sessionGoals.js displayTitle`), so moving one earlier renumbers them.
- **Goals per block** (`ev.goals { subtaskKey: pct }`): a gauge per subtask, "how much of this subtask to finish in this block". Unset = Otto's own split (the pieces the scheduler poured in). Goals travel with the session, so dragging session 2 before session 1 moves its goal with it. A warning shows when a subtask's goals across all sessions don't add up to 100.
- **Event panel** shows only what applies: goals (with a strip of the task's sessions), links (only real ordered/grouped links, never a task's own session chain), reflection once the block has passed. A plain standalone event opens no panel.
- **Reflection** (`ev.reflection`): five choices (nailed / harder / gap / interrupted / outlier; art slots `reflect-*`, emoji until supplied), a second gauge per subtask pulled against the planned marker, notes. It posts to `/api/learning/reflection` with planned minutes and an "actual" derived from how much of the plan was achieved (`reflectionMinutes`). If the plan was not met it asks "Reschedule remainder?": *fit into this week* (first free gap from now, `findFreeSlot`) or *leave it in the Meatball Grinder* (`otto.grinder.v1` in localStorage, panel behind the toolbar's Grinder button, "Find a slot this week" per item). Saving again replaces the earlier remainder rather than duplicating it.
- **Drag bug fixed:** `useDragResize` added `scrollTop` to positions measured with `getBoundingClientRect()` (which already includes scroll), so any drag while the grid was scrolled misplaced the pointer; the top handle flattened the event to 15 minutes. The new-event popup position had the mirror-image error.

### 7.9 Make room
If "pull the prerequisites earlier" can't fit, the page drops straight into reschedule selection mode with a **suggested window**: `roomSuggest.js` finds the smallest block before the dependent (its own day first, then the latest part of earlier days) that holds the prerequisites still in the way, ignoring locked events and time that has passed. The user drags a window's edge handles, removes it, or drags across the grid to add more, then Review -> Propose -> Apply as usual. The banner also has a standing "Make room" button. Backend: a blocked window with `for_ids` is *reserved* for those events and everything they wait for (`Task.keep_out` keeps all other tasks out of it, and flexible events inside it are moved out); a window without `for_ids` still means "nothing goes here". Locked events now show a solid dark badge with a white padlock (an outlined open padlock appears on hover when unlocked).

### 7.7 Design system (fourth redesign)
One typeface (Plus Jakarta Sans; no serif, no mono, numbers use tabular figures). Tokens and components live in `styles.css`: the **double bezel** (`.bezel` tray holding a `.core` plate, concentric radii), pill buttons with a nested icon island (`.btn--primary` + `.btn__icon`), segmented control, and a motion vocabulary on one easing (`--ease` heavy settle, `--spring` slight overshoot): `.rise` (staggered fade-up out of a blur via `--i`), `popIn`, `bob`, `sweep`, `breathe`, `ghostFade`, `arriveGlow`, `toastIn`. Paper grain is a fixed inert overlay. **All art goes through `assets/otto/index.js`**: drop a correctly named file into `assets/otto/` and it replaces the placeholder (`placeholders/`), and `assets/otto/icons/<name>.svg` replaces a built-in icon. The full list of names and sizes is `ASSETS_NEEDED.md`. Components: `Mascot` (contains real art, crops the old 16:9 placeholders), `Banner`.
**Reschedule choreography** (`WeekView`): an explicit scheduler call (new event, link, reorder, "move it after", reschedule selection) gets a 650 ms thinking beat (floating otter pill, a light sweep across the grid, flexible events breathing), then moved events spring in from where they were with a dashed ghost left at the old spot, a glow ring on arrival, and a summary toast. Plain drags skip the thinking beat. Reduced motion collapses all of it.
**Advanced planning** (`EventCreation.jsx`) is a two-pane sheet: details on the left (name, note, time and length, kind tiles, must-do switch), plan on the right (deadline with hard/soft, best done by, steps with a ring chart and rows, "in order" switch, inline decision cards), footer with the summary and the one action. The allocation logic (`subtaskMath.js`, budget rule, pins, lasso grouping) is unchanged.

### 7.6 Goals tracker (`frontend/src/views/goals/`)
One checklist tracker per goal instead of cards. Each goal has milestones with an effort in hours; a milestone's share of the goal is its share of total effort (so "goal at N% once this is done" needs no user maths), optional subtasks count as partial progress, and each has a due date. Per goal the page shows progress against where the plan says you should be today, hours left against hours per week you can give, projected finish at your pace, a planned-vs-actual chart, and a log of detours (sidetrack / roadblock / pivot, with days lost). Status (ahead / on track / behind / at risk / out of reach) is deterministic; all the maths is in `goalMath.js` (tested). Goals and the last wizard result persist in localStorage (`otto.goals.v1`, `otto.wizard.v1`). The "wizard" (reading otter in a hat, `WizardOtter.jsx`) is the weekly LLM call: `POST /api/ai/review-goals` now takes the computed numbers plus milestones and detours and returns a per-goal verdict, reroute suggestions and an optional new target date (sanitised server-side). Advice is marked stale once the goal changes. Demo goals are in `data/goalsData.js` (dates relative to today); there is no backend persistence for goals yet.

### 7.5 Calendar UI added in the third build (all in `frontend/src/views/calendar/`)
- **Look (forest / parchment / wood):** Geist + Geist Mono, tokens in `styles.css` (`--forest`, `--parchment`, `--wood`, `--accent`, `--ink*`; old variable names kept and pointed at the new palette). Structure follows a sleek reference calendar (floating dark sidebar, pill day cards, rounded cards with a category icon medallion, dashed now-line with a time badge), aesthetic follows a cosy island-sim reference (forest green, parchment, wooden `.plaque` sign, pine skyline banner, the otter via `components/Mascot.jsx`, which crops the 16:9 mascot art). SVG icons live in `Icons.jsx`; earthy category palette in `fixtures.js`. The calendar and sidebar were redesigned in depth; Now/Goals/Stats/Recovery got the palette via a colour remap but keep their old layouts.
- **Views:** Month (real calendar of the current month), 2 weeks (14 columns; backend `week_days` accepts 7 or 14, recurring time blocks repeat each week), Week. Header has prev / Today / next.
- **Links:** drag from the node on an event's right edge to another event (popover: Ordered / Grouped) or to an empty slot (new event that follows it). Data lives on the events: ordered = `prereq_ids` (scheduler enforces), grouped = `grouped_with` (visual only). Pure logic + tests in `linkUtils.js`. Lines are SVG beziers in `LinkLayer.jsx`; click the midpoint dot to remove. Long-press (450 ms) a linked event lights up its whole cluster (Esc / click to clear).
- **Links panel** (click an event): its ordered steps with drag handles to reorder (rewrites `prereq_ids`, re-runs the scheduler) and its grouped partners.
- **Reschedule selection mode** (`Reschedule` button): page dims, drag windows across the grid (past time is blocked), Review -> choose whole / cut / split for events a window only partly covers (`selectionMath.js`) -> Propose -> diff panel with Before/After toggle -> Apply. Backend: `blocked_windows` on `/api/schedule` (events overlapping one are re-placed outside it).
- **Animation:** any scheduler result (drag, link, apply) plays a staggered `flipMove` on the events that moved.
- **Demo data:** `INITIAL_EVENTS` is re-dated onto the current week (next week when today is Fri-Sun, `DEMO_WEEK_OFFSET`). Still mock, still not persisted.
- Known: `frontend/src/assets/mascots/main logo.png` is a 42-byte text file (looks like a Git LFS pointer), so the sidebar logo is a broken image.

---

## 8. Not built: oversleep, Meatball Grinder UI, others (design detail kept for later)

- **Oversleep / late start**: triggered when the first login is 2h+ after the first planned event; slides up on app open. Options: (1) Reschedule from now (recommended): triage screen with tasks ranked by priority and a draggable "non-negotiable" line; above the line is placed in the remaining day, below goes to the Meatball Grinder. (2) Keep original plan (missed tasks as ghost blocks). (3) Write off today (fixed events stay, flexible tasks parked; optional "Protect tomorrow morning?"). After 3+ late starts in a week, surface it in the weekly reflection and offer to change the planned start. Each displaced task gets a triage choice: reschedule today / push tomorrow / grinder / drop (`OversleepTriage` enum). Recurring tasks get a "skip today's or reschedule?" micro-decision.
- **Meatball Grinder UI**: list, "Find best slot" (one tap through the scheduler), drag into a free slot, age nudge after 5 days ("Keep / Delete / Someday"; Someday = no scheduling pressure). Engine already skips grinder tasks and returns them in `plan.meatball_grinder`; no endpoint to park/unpark.
- **Weekly mascot chat**: free text -> LLM extracts structured rules -> `stated_rules` -> scheduler hard preferences. Adapts depth to the user (verbose gets follow-ups).
- **AAR panel** (time-based, post-session) was mentioned as a separate component; not built.

---

## 9. Status summary (as of this handoff)

**Done and tested**: engine-only `/api/schedule`; scheduler fixes; learning loop incl. focus span; persistence; focus-aware splitting; ripple rescheduling; calendar drag/resize/lock/delete-confirm/undo; event popup with subtasks, pin, lasso/reorder, ratio/budget allocator, editable duration, date validation; hover details; clear "backend unreachable" errors.

**Backend only (needs UI)**: reflection prompt, energy `+` button, off-track labelling, meatball grinder park/unpark, feasibility/tradeoff screens.

**Not built**: oversleep flow, weekly chat/stated rules, node linking, selection-mode reschedule, animation layer, checklist carry-over, task enrichment, tab-visibility signal, draggable sleep block, 2-week view, month-scale goal planning, weekly drift-review trigger, Google Calendar, persistence of events (calendar events live only in React state; reload loses them).

**Needs your check**: discard-confirmation on closing the popup; order-specific grouping/reorder were not re-tested after the allocator rewrite.

---

## 10. Gotchas and lessons learned

- Frontend dev proxy must target `127.0.0.1:8000` (not `localhost`). If the backend isn't running the proxy returns an error; the UI now says "Otto's server isn't reachable...". Restart `npm run dev` once for the proxy message (config change); the banner wording works without restart.
- Don't use broad `pkill`. Use PIDs.
- Real calendar uses today's date: past days are never rescheduled, so overlaps there are flagged, not moved.
- The mock `INITIAL_EVENTS` don't match the real week; create events in a future week to test.
- Vite may auto-switch ports if 5173 is taken; pass `--port N --strictPort` for test instances.
- The browser-pane test tool: popups animate (wait ~1s before clicking), date inputs can't be overwritten by typing once filled (set value through input events), screenshots can lag a render.
- React patterns used: `useRef` for drag state, `setPointerCapture` on the grid, document-level pointerdown for click-outside, state lifted to the owner of the data (stale-closure bug source).
- Python: `Task` takes `duration_planned` (not `full_minutes`; that's a property). Frontend event `day` is the date-of-month number, not an index.
- Dead code: `db_models.py`, `database.py`. `plan.md`/`ARCHITECTURE.md` describe the old hackathon.

---

## 11. Git state

Branch `shianne-(revamp)`. Committed earlier: engine-only scheduler (`aedf36f removed gpt scheduler, now engine only`) and frontend work (`478f204 frontend stuff...`).
**Uncommitted at the time of writing** (everything from the focus-split / allocator / date-validation / proxy work): backend `calendar_bridge.py`, `learning.py`, `scheduler.py`, `main.py`, `models.py`, three test files; frontend `EventCreation.jsx`, `WeekView.jsx`, `vite.config.js`, plus new `subtaskMath.js(+test)`, `dateChecks.js(+test)`. Suggested split: one backend commit, one frontend commit. Don't commit unless the user asks.

---

## 12. Tooling / environment notes

- Claude desktop app + Claude Code; the `claude` CLI is not on PATH. The bundled one is at `~/Library/Application Support/Claude/claude-code/<version>/<hash>/claude.app/Contents/MacOS/claude` (version/hash change on update).
- **`taste-skill` plugin** (https://github.com/Leonxlnx/taste-skill, MIT) was added as a marketplace and installed at user scope. Its metadata declares no hooks or commands; skills are markdown (`design-taste-frontend` with dials DESIGN_VARIANCE, MOTION_INTENSITY, VISUAL_DENSITY, plus minimalist/brutalist/soft/redesign variants). Its SKILL.md files, `scripts/` and `skill.sh` were not audited. Needs a new session to load. Use it for a polish pass but keep Otto's palette/mascot unless the user says otherwise.
- Auto-memory: `/Users/shianne/.claude/projects/-Users-shianne-YukizCo-Web/memory/` has `project_otto_design.md` (principles).
- Earlier standalone docs written during the design discussion (feature spec, dev log) lived in a temp scratchpad and are gone; their content is folded into this file.

---

## 13. Suggested next steps (ship-by-tomorrow order)

1. Confirm the discard-confirm and order-specific grouping/reorder still work (quick manual pass).
2. Replace fixture events with current-week data, or persist events (the calendar loses everything on reload).
3. Add the post-task reflection prompt (calls `/api/learning/reflection`) and the energy `+` button. Add off-track labelling so the focus-span learning and splitting actually trigger for real users.
4. Wire the Meatball Grinder (park / list / pull back) and the feasibility/tradeoff screens to the engine.
5. Weekly goal-drift review trigger (cache last review; skip if < 7 days).
6. Polish pass with the taste skill.
7. Deferred: node linking UI, oversleep flow, weekly chat, selection-mode reschedule + animation, 2-week view, month-scale planning.
