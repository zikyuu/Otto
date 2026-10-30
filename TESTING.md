# Testing Otto

Otto has **548 automated tests**: 332 on the backend (Python, pytest) and 216 on the frontend (JavaScript, Node's built-in test runner). Each test is a small function with its own input and expected result; the runner executes every one and reports passes and failures. There are no browser or end-to-end tests (see "Not covered").

## How to run

```bash
# backend: all 332
cd backend && .venv/bin/python -m pytest -q
# one file, or tests matching a name
.venv/bin/python -m pytest -q tests/test_scheduler.py
.venv/bin/python -m pytest -q -k "overwhelm"

# frontend: all 216
cd frontend && node --test src/*.test.mjs src/views/*.test.mjs src/views/*/*.test.mjs src/home/*.test.mjs src/data/*.test.mjs
# one file
node --test src/views/calendar/recurrence.test.mjs

# the frontend must also build
cd frontend && npx vite build
```

## What kind of tests these are

| Kind | What it checks | Where |
|---|---|---|
| **Unit tests** | One function in isolation: no server, no browser, no network. Given an input, is the output right? | All frontend tests; `test_scheduler`, `test_learning`, `test_patterns`, `test_importance`, `test_metrics`, `test_overwhelm`, `test_crunch`, `test_plan_time`, `test_rules`, `test_signals` (engine part) |
| **Integration / API tests** | A real request through FastAPI (`TestClient`), the engine behind it, and the stored result. The only thing missing is a real network. | `test_calendar_api`, `test_features`, `test_auth`, `test_llm_access`, `test_goal_review`, `test_rules_screen`, `test_signals` (HTTP part) |

**White box vs black box.** White-box tests are written knowing the code's internals; black-box tests only check inputs against outputs. This project is a mix, often called grey-box:
- The engine and scheduler tests are **white-box**: they know the priority formula, the slot-finding passes, the thresholds (for example "12 data points is confident").
- The API tests are closer to **black-box**: send a request, check the response and what was stored, without caring how the engine got there. (They were still written by someone who knows the code, so they are not purely black-box.)

## What is faked, and why

`backend/tests/conftest.py` makes every test start clean and safe:
- **OpenAI** is never called. The key is blanked, and tests that need an AI answer replace the call with a canned one (`test_llm_access`, `test_goal_review`, `test_features`). So tests are free, fast and repeatable.
- **Storage** points at a temporary folder, with a fresh profile and key-value store for each test, and Supabase is switched off.
- **The clock** is pinned in tests that depend on "today" (`test_plan_time` pins to Monday 12 Oct 2026; others send an `X-Client-Now` header), so they do not break as real dates pass.
- **Login** (`test_auth`, `test_llm_access`): the Supabase token check is replaced with a fake user table, so two people can be tested side by side.

## Backend tests (332)

| File | Tests | What it covers |
|---|---|---|
| `test_calendar_api.py` | 54 | `/api/schedule`: moving, resizing, ordering links, blocked windows, clearing time, "make room", end-by ceilings, tight placement, sessions |
| `test_features.py` | 48 | Saved state API, late start (triage, per-task choices, dry run, three late starts), week check, weekly reflection, weekly chat, enrichment, Google Calendar, client clock |
| `test_signals.py` | 47 | Stated rules, sleep window, recovery, lunch slump, planning bias, ramp-up, gym-first, skill gaps, actuals and their endpoints |
| `test_learning.py` | 37 | The learning loop: signals in, profile out. Guards against runaway averages and one bad entry dominating |
| `test_rules.py` | 32 | Scheduler rules: priority formula, priority windows, deep-work breaks, gym-first, batching, displacement |
| `test_scheduler.py` | 31 | Ordering, deadlines, gating, capacity |
| `test_goal_review.py` | 20 | The goal wizard: whatever the AI returns is checked and made safe; major changes flagged |
| `test_patterns.py` | 12 | The nine behaviour patterns, confidence levels, ordering |
| `test_llm_access.py` | 9 | One free wizard call, saving your own key (encrypted, never returned), daily cap, rate limit |
| `test_overwhelm.py` | 9 | The "I'm overwhelmed" planner: ranking, hours, where work goes, rest-day cost, only what must move moves |
| `test_auth.py` | 8 | Login on and off, token checks, each person's data separate, Google Calendar tied to whoever started it |
| `test_plan_time.py` | 6 | "Find time for a goal": session sizes, starts, no clashes, hours add up |
| `test_engine.py` | 5 | Core engine smoke tests |
| `test_importance.py` | 4 | Importance cards, scheduler weight, the "which matters more" question |
| `test_crunch.py` | 4 | Sleep hours protected, except for an unavoidable hard deadline |
| `test_metrics.py` | 4 | The Rules page data: names, sources, targets |
| `test_rules_screen.py` | 2 | Pinned rules listing and the catalogue of rules |

## Frontend tests (216)

All unit tests of the pure logic modules (the parts with no screen). The screens themselves (`.jsx` files) are not unit-tested.

| Area | Files (tests) |
|---|---|
| **Calendar logic** `src/views/calendar/` | `sessionGoals` (19), `recurrence` (12), `linkUtils` (11), `subtaskMath` (10), `dateChecks` (8), `roomSuggest` (7), `selectionMath` (7), `energyUtils` (6), `calendarUtils` (5), `checklist` (4), `grinderAge` (4), `proposalEdit` (4), `sleepMath` (4), `dayStats` (3), `gcalSync` (2) |
| **Goals** `src/views/goals/` | `goalMath` (18), `goalChanges` (8), `goalLink` (5) |
| **Priorities and rules** `src/views/` | `priorityBoard` (9), `rules` (2) |
| **Home page logic** `src/home/` | `goalAttention` (8), `makeTime` (7), `capture` (6), `today` (5), `overwhelm` (4), `planDrag` (4), `radar` (4), `goalNudge` (3), `lunchNudge` (3), `planWhy` (3), `wrapUp` (3) |
| **App-level** `src/` | `reminders` (7), `authLogic` (5), `enrichment` (2), `clientClock` (1), `data/goalsData` (3) |

## Not covered

- **No end-to-end (browser) tests.** Screens were checked by hand in the browser; that is not repeatable. A tool such as Playwright would be the next step.
- **No coverage measurement** is configured, so there is no percentage to quote.
- **Nothing has been run against real services:** not a real Supabase project, not real OpenAI, not Google Calendar with live keys, not the Render deployment.
- **Screens (`.jsx`)** are only exercised through the pure logic they call.
- Drag and drop on the calendar and Priorities page depends on browser events and is checked by hand.

## Adding a test

- **Backend:** add a function named `test_...` in the matching `backend/tests/test_*.py`. Name it as a sentence describing the behaviour (the existing ones do), build the input events or profile, call the function or endpoint, and `assert` the result.
- **Frontend:** add `test('what it should do', () => { ... })` in the `*.test.mjs` next to the module, using `node:assert/strict`.
- When fixing a bug, first write a test that fails because of it, then fix the code until it passes. (The "block fits the gap as planned" test in `test_calendar_api.py` was written this way.)
