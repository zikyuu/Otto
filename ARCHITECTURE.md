# Otto — architecture

A job-application planner that builds itself from the role you want, fits into
your real week, and reshuffles honestly when you fall behind — using a real
scheduling engine, not just an LLM.

> One line: resume + job → live interview signal → learning roadmap → fitted
> into your real week → honestly rebuilt when you fall behind.

---

## 1. The thesis (what makes this not an LLM wrapper)

The **brain is a deterministic scheduling engine.** The LLM is only the *ears*
(resume + JD → structured tasks) and the *mouth* (explaining what the engine
decided). **Exa** is the *signal layer* — it retrieves live interview prep
content so the roadmap reflects what roles actually test, not a static guess.
**Zo** is the *reach layer* — it runs the background feasibility check and
delivers Telegram alerts so Otto comes to the user, not the other way around.

```
   LLM (ears)         EXA (signal)          ENGINE (brain)        LLM (mouth)
 resume + JD  ──►  live interview  ──►  scheduler +  ──►  plain-English
 → structured       signal for role       feasibility       narration of
   skills           → enriched skill      (constraint        what moved
                    set for roadmap       solver,            and why
                                          deterministic)

                                              │
                                           ZO (reach)
                                    background agent + Telegram
                                    "your deadline is tomorrow —
                                     here's the one thing to do"
```

The LLM never touches `/api/plan` or `/api/reshuffle`. Engine endpoints are
deterministic, re-runnable in <50ms, and work with no API key.

---

## 2. Confirmed stack

| Layer | Technology | Role | Status |
|-------|-----------|------|--------|
| **Engine** | Python, pure stdlib | Scheduler + feasibility + gap derivation | ✅ built + tested |
| **LLM ears/mouth** | OpenAI gpt-4o-mini | Resume/JD parsing, narration, direction review | ✅ key set, credits available |
| **Signal** | Exa | Live interview prep retrieval in `gaps.py` | ✅ key set, wired, working |
| **Reach** | Zo Computer | Hosting + scheduled Telegram alerts | Zo LLM access TBD — wire as optional layer once API shape known; for now Zo = hosting + Telegram only |
| **API** | FastAPI | HTTP layer | ✅ built |
| **Frontend** | React + Vite | Week grid, setup screen, chat | ✅ scaffolded |
| **Calendar** | Google Calendar | Read-only wall import | Stubbed in `adapters.py` — stretch goal |

---

## 3. The pipeline (five stages)

1. **Read (LLM + Exa).** Resume → structured skill profile via `parse_resume`.
   JD → required skills via `parse_jd`. Skills must come out lowercase and match
   the `gaps.py` vocabulary (`"data structures"`, `"system design"`, `"sql"`,
   etc.) — this normalization is enforced in the `parse_jd` system prompt.

2. **Derive gaps (engine + Exa).** `derive_tasks(goal, profile)` in `gaps.py`
   compares the role's required skills against the profile. **Exa is now central
   here:** 2–3 searches (`"{role} interview prep skills 2026"`, `"what to study"`,
   `"leetcode patterns"`) retrieve live interview signal; skill mentions are
   extracted via vocabulary matching and merged with `goal.required_skills`
   (deduped, lowercase). `SKILL_TASKS` is the fallback for time estimates and
   prereq chains when `EXA_API_KEY` is absent or Exa returns nothing.

3. **Schedule (engine).** `schedule(tasks, profile, deadline_day)` in
   `scheduler.py`. Greedy weighted scheduler with prereq ordering. Topological
   sort → value-density sort → fill days from now to deadline. Tasks that don't
   fit land in the `at_risk` bucket. Deterministic, <50ms.

4. **Feasibility (engine).** `assess(tasks, profile, goals, deadline_day)` in
   `feasibility.py`. `effective_capacity = nominal_free_hours × velocity`. If
   required work exceeds capacity before the deadline, engine computes a minimal
   cut and surfaces a forced tradeoff: *"Fully prep the onsite OR apply to 3
   roles closing Friday — not both at your real pace. Which?"*

5. **Reshuffle + narrate (engine + LLM).** `/api/reshuffle` re-derives tasks,
   marks missed ones, re-runs assess. `narrate()` explains the new plan in 2–3
   calm sentences naming what moved and why. Direction review (coming) will
   compare the new task list against Exa signal and return a grounded critique.

---

## 4. Data model (locked — do not change)

```
Skill         { id, name, proficiency: 0–3 }
Profile       { skills[], free_hours_per_day, walls[], velocity: 0–1 }
Wall          { day: 0–6, start_min, end_min, label }
Goal          { id, title, jd_text, close_date, required_skills[], fit: 0–1 }
Task          { id, title, skill_served, goal_id, importance,
                full_minutes, lite_minutes, prereq_ids[], status }
Block         { day, start_min, end_min, task_id, lite: bool }
Plan          { blocks[], at_risk[], feasible, tradeoff? }
CompletionEvent { task_id, planned_minutes, done: bool, ts }
```

Skill names throughout the system are **lowercase and clean** (`"system design"`,
not `"System Design"` or `"SD"`). The `parse_jd` prompt enforces this at the
boundary; `gaps.py` normalizes on input as a second defence.

---

## 5. Key file map

```
backend/
  app/
    models.py                 ← data model (locked)
    engine/
      gaps.py                 ← gap derivation + Exa signal retrieval
      scheduler.py            ← greedy weighted scheduler (locked)
      feasibility.py          ← feasibility + tradeoff (locked)
    llm/
      extract.py              ← parse_resume, parse_jd, narrate, direction_review (coming)
    sources/
      adapters.py             ← ManualSource, GoogleCalendarSource (stub), PasteJDSource, ExaJobSource (stub)
    main.py                   ← FastAPI endpoints
    demo_data/demo.json       ← deliberate skill gap (DS&A + system design missing)
  tests/
    test_engine.py            ← 5 tests · must pass after any engine change
  zo_agent.py                 ← (coming) Zo background agent + Telegram alerts

frontend/
  src/
    App.jsx                   ← main app + tradeoff interaction (to wire)
    components/WeekGrid.jsx   ← week grid + re-solve animation (to finish)
    styles.css                ← design tokens (locked)
```

---

## 6. API surface (FastAPI)

```
POST /api/profile     resume_text              → Profile (LLM parse)
POST /api/goal        jd_text, goal_id         → Goal   (LLM parse)
POST /api/plan        profile, goals[], walls  → Plan + tasks[]
POST /api/reshuffle   profile, goals, missed[] → Plan + narration + tasks[]
POST /api/chat        message, plan_summary    → narration
GET  /api/health
GET  /api/demo                                 → seeded demo payload
```

`/api/plan` and `/api/reshuffle` are **pure engine** (no LLM, deterministic).
`/api/profile`, `/api/goal`, and `/api/chat` are the only LLM calls.

---

## 7. UI — design tokens and the two demo moments

### Palette (locked)
```
--ink:         #1A1D24   near-black text
--paper:       #F2F4F3   cool off-white background
--surface:     #FFFFFF   cards
--accent:      #2F6F62   deep teal — on track / primary
--accent-soft: #E4EFEC
--warn:        #C7682E   burnt amber — feasibility moment ONLY
--warn-soft:   #F7E9DF
--line:        #DCE0DE   hairline borders
--muted:       #6B7370
```

Amber appears **nowhere** except the tradeoff moment. If it's everywhere, it
means nothing.

### Typography
- Display / day labels: *Space Grotesk*
- Body: *Inter*
- Data / time labels: *IBM Plex Mono*

### The two demo moments

**Moment 1 — the roadmap lands (Screen 2)**
User pastes JD → Exa retrieves live signal → `derive_tasks` enriches the
roadmap → `/api/plan` → blocks land in the week grid with staggered animation.
B owns the animation in `WeekGrid.jsx`: blocks slide smoothly, moved blocks
briefly highlight in lighter teal before settling. This motion *is* the product.

**Moment 2 — Otto comes to you (Screen 3 + Zo)**
User marks a task missed → `/api/reshuffle` → feasibility check fires → if
infeasible, amber tradeoff card with live buttons → "choose one" drops the
other goal, re-solves, re-animates → calm green rebuild. Simultaneously, Zo
fires a Telegram ping with the best next action. B owns the tradeoff
interaction in `App.jsx`; D owns `zo_agent.py`.

---

## 8. Zo integration

Zo Computer hosts the backend and runs `zo_agent.py` on a schedule.

**What it does:**
- Pulls the current plan state
- Checks feasibility (deadline proximity + missed tasks)
- When behind or close to a deadline, sends a Telegram message:
  the one best next action + an offer to reshuffle

**What it does not do (yet):**
- Zo LLM access is TBD — the agent uses OpenAI for message generation for now,
  and swaps to Zo's LLM layer once the API shape is confirmed
- It does not touch the scheduling engine; it only reads plan state

---

## 9. Build order — what remains

| Priority | Task | Owner | Branch |
|----------|------|-------|--------|
| 1 | Re-solve animation | B | `feat/resolve-animation` |
| 2 | Tradeoff interaction | B | `feat/tradeoff-interaction` |
| 3 | Zo Telegram alert | D | `feat/zo-telegram` |
| 4 | LLM direction review | A | `feat/direction-review` |
| 5 | Wall editor | C | `feat/wall-editor` |
| 6 | Chat UI polish | C | `feat/chat-polish` |
| 7 | Deploy | A | `feat/deploy` |
| 8 | Google Calendar sync | — | `feat/calendar-sync` (stretch) |

---

## 10. Traps

- **LLM out of the engine.** `/api/plan` and `/api/reshuffle` call no LLM.
  Ever. Engine = deterministic.
- **Vocabulary seam.** `parse_jd` must emit skill names that match `gaps.py`'s
  vocabulary (`"data structures"`, `"system design"`, not `"DSA"` or `"SD"`).
  The prompt enforces this; `gaps.py` lowercases on input as a second defence.
  Test the full flow with the real demo JD before declaring hour 4 done.
- **Exa as signal, not the boss.** Exa enriches `required_skills` but the
  engine still controls scheduling. If Exa returns nothing, `SKILL_TASKS` is
  the fallback — the app never hard-fails on a missing key.
- **Zo LLM TBD.** Don't block `zo_agent.py` on Zo's LLM API. Use OpenAI for
  message generation now; make the LLM call swappable later.
- **Amber = feasibility only.** Never render `--warn` outside the tradeoff
  moment. When the week turns amber, it must mean something.
- **Hour-8 gate.** No stretch goals — no Calendar, no Exa job-match, no engine
  upgrades — until both demo moments work end-to-end and the app is deployed.
  Record a screen-capture fallback before passing the gate.
- **Don't build full ILP.** Greedy weighted is finishable and defensible.
  A judge who asks "how does the scheduler work?" gets a satisfying answer from
  the greedy approach. Swap the core later if time allows — the interface
  (`schedule(tasks, profile, deadline_day) → Plan`) stays identical.
