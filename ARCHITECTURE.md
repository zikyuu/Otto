# Otto — architecture & UI plan

A to-do list that builds itself from the job you want, and re-solves itself
when life gets in the way — using a real scheduling engine, not just an LLM.

> One line: resume + job → learning roadmap → fitted into your real week →
> honestly rebuilt when you fall behind.

---

## 1. The thesis (what makes this not an LLM wrapper)

The **brain is a deterministic scheduling engine.** The LLM is only the
*ears* (resume + JD → structured tasks) and the *mouth* (explaining what the
engine decided). When a judge pokes it — "add another deadline" — the engine
**recomputes and shows its work**, which a wrapper cannot do.

```
   LLM (ears)            ENGINE (brain)              LLM (mouth)
 resume + JD  ──►  scheduler + feasibility  ──►  plain-English narration
 → structured       (constraint solver,          of what moved & why
   tasks            real pace, downscoping)
```

Everything below protects that inversion: the LLM never touches the
scheduling math.

---

## 2. The pipeline (five stages)

1. **Read (LLM).** Resume → structured skill profile. JD → required skills +
   weighted prep tasks. NER-style extraction; your wheelhouse.
2. **Derive gaps (engine).** Compare role's required skills vs. profile →
   the set of tasks that actually close the gap, each tagged with the skill
   it serves and an estimated time cost.
3. **Schedule (engine — THE STAR).** Constraint solver places weighted tasks
   into real free hours, around fixed walls, working back from the hard
   deadline. Deterministic. Re-runnable in <50ms.
4. **Feasibility (engine).** Weighs remaining work against observed pace. If
   the plan can't close, it doesn't cram — it surfaces a forced tradeoff.
5. **Reshuffle + narrate (engine + LLM).** User says "I'm behind" → engine
   re-solves and downscopes → LLM explains the new plan in one calm message.

---

## 3. The engine, specified (build this FIRST)

### 3.1 The scheduling problem
Given:
- `tasks[]` — each with `est_minutes`, `importance` (weight), `skill_served`,
  and optional `prereq_ids[]` (can't schedule "system design" before "data
  structures").
- `walls[]` — blocked time (class, gym, 9–5). The scheduler must not overlap.
- `free_hours` — per-day capacity (derived from walls + waking window).
- `deadline` — hard; tasks serving the goal must land before it.

Produce: an ordered assignment of tasks → time blocks that (a) respects walls,
prereqs, and the deadline, and (b) maximises total `importance` placed when
not everything fits.

### 3.2 The algorithm (finishable version)
A **greedy weighted scheduler with prerequisite ordering** — not full ILP,
which is over-scope for 12h:
1. Topologically sort tasks by prereqs (drop cycles defensively).
2. Sort the ready set by `importance / est_minutes` (value density).
3. Walk days from now → deadline, fill each day's free blocks with the
   highest-density ready task that fits; mark its skill satisfied so
   dependents unlock.
4. Tasks that don't fit before the deadline land in an **"at risk"** bucket —
   this bucket is what drives the feasibility warning.

This is real, defensible optimization a judge can stress-test, and it
recomputes instantly on any input change. (Stretch: swap the greedy core for
a proper constraint solver if time allows — the interface stays identical.)

### 3.3 Feasibility + forced tradeoff
- `velocity` = rolling completion rate from `CompletionEvent`s
  (planned_minutes vs. actually-done). Cold start: seed a believable history.
- `effective_capacity = nominal_free_hours * velocity`.
- If `required_minutes_before_deadline > effective_capacity` → infeasible.
  Engine computes the **minimal cut**: the smallest set of goals/tasks to drop
  to make it feasible, and surfaces it as a choice:
  *"Fully prep Thursday's onsite OR apply to 3 roles closing Friday — not
  both at your real pace. Which?"*

### 3.4 Downscoping (the calm recovery)
Each task carries a `full` and a `lite` variant (e.g. 60-min deep practice vs.
10-min review). When behind, the engine swaps `full`→`lite` for lower-priority
tasks before it drops anything, protecting momentum and what's closing soonest.

---

## 4. Data model (the spine — lock this tonight)

```
Skill         { id, name, proficiency 0-3 }
Profile       { skills[], free_hours_per_day, walls[] }
Wall          { day, start, end, label }           # from ScheduleSource
Goal (job)    { id, title, jd_text, close_date, required_skills[], fit }
Task          { id, title, skill_served, est_minutes,
                importance, prereq_ids[], status,
                full_minutes, lite_minutes, scheduled_block? }
Block         { day, start, end, task_id }          # scheduler output
CompletionEvent { task_id, planned_minutes, done: bool, ts }
```

### Two swappable adapters (same discipline as before)
- **ScheduleSource** → emits `Wall[]`. `ManualSource` (works tomorrow) |
  `GoogleCalendarSource` (stretch, read-only, drops in here, no rewrite).
- **JobSource** → emits `Goal`. `PasteJDSource` (works tomorrow) |
  `ExaJobSource` (optional light "matching" gesture, time-boxed).

The engine reads only `Wall[]` and `Goal` — it never knows which adapter
produced them. That's the whole "integrations are next" story, kept honest.

---

## 5. API surface (FastAPI)

```
POST /api/profile        body: resume_text        → Profile (LLM parse)
POST /api/goal           body: jd_text            → Goal   (LLM parse)
POST /api/plan           body: {profile, goals[], walls[]} → {blocks[], at_risk[], feasible, tradeoff?}
POST /api/reshuffle      body: {plan, completed[], missed[]} → {blocks[], narration}
POST /api/chat           body: {plan, message}    → {narration, maybe re-plan}
GET  /api/health
```

`/api/plan` and `/api/reshuffle` are pure engine (fast, deterministic).
`/api/profile`, `/api/goal`, and the narration in `/api/chat` are the only
LLM calls. Engine endpoints work with NO API key — same safety net as before.

---

## 6. UI plan

### 6.1 Visual direction (deliberate, not the cream-serif default)
**Concept: "the week as a workbench."** The schedule is the hero — a real
week grid where roadmap tasks visibly *land* in your free time. The emotional
beat is watching blocks rearrange when you fall behind.

- **Palette** — not warm-cream-and-terracotta. A cool, focused "deep-work"
  set:
  - `--ink: #1A1D24` (near-black text)
  - `--paper: #F2F4F3` (cool off-white bg)
  - `--surface: #FFFFFF` (cards)
  - `--accent: #2F6F62` (deep teal — "on track", primary)
  - `--warn: #C7682E` (burnt amber — "at risk / choose", used ONLY for the
    feasibility moment so it carries real weight)
  - `--line: #DCE0DE` (hairline borders)
- **Type** — display: a confident grotesque (e.g. *Space Grotesk*) for
  headers and the week-grid day labels; body: *Inter*; data/time labels:
  a mono (*IBM Plex Mono*) so the schedule reads like a real planner.
- **Signature** — the **re-solve animation**: when you mark a task missed,
  blocks visibly slide/recompute into their new positions. That motion *is*
  the product — it's the one thing they remember, so spend the boldness here
  and keep everything else quiet.
- **Restraint** — amber appears nowhere except the feasibility/tradeoff
  moment, so when the week turns amber it means something.

### 6.2 Screens (4, in build priority)

```
┌─ SCREEN 1 · Setup ────────────────────────────────┐
│  Upload résumé  [drop / paste]                     │
│  Add a job      [paste JD ▸]   (or pick sample)    │
│  Your week      [+ class] [+ gym] [+ block]        │
│  Hours free/day [ ███░░ 3h ]                       │
│                              [ Build my plan → ]   │
└────────────────────────────────────────────────────┘

┌─ SCREEN 2 · The Plan (THE HERO) ──────────────────┐
│  Goal: Backend Intern @ X · closes Fri 11 Jul      │
│  ┌─────────────────────────────────────────────┐  │
│  │  MON   TUE   WED   THU   FRI   (week grid)   │  │
│  │  ▓class ░    ▓gym  ░     ░                    │  │
│  │  [DS&A] [Sys] ...  tasks land in free blocks │  │
│  └─────────────────────────────────────────────┘  │
│  On track ●  ·  3 tasks this week  ·  gap: Sys Dsn │
└────────────────────────────────────────────────────┘

┌─ SCREEN 3 · Fell behind → re-solve ───────────────┐
│  "Didn't finish: System Design practice"   [mark]  │
│  → blocks recompute (signature animation)          │
│  ⚠ Amber state: "You can fully prep the onsite OR  │
│     apply to 3 roles closing Fri — not both.       │
│     [ Prep onsite ]   [ Apply to roles ]"          │
└────────────────────────────────────────────────────┘

┌─ SCREEN 4 · Coach chat (thin LLM layer) ──────────┐
│  you: "I'm behind, reshuffle my week"              │
│  ◇  "Moved DS&A to Wed, dropped the formatting     │
│      task — it wasn't serving this role. Onsite    │
│      prep is protected. Here's the new week."      │
└────────────────────────────────────────────────────┘
```

### 6.3 The two demo moments (design everything around these)
1. **Roadmap lands in the week** (Screen 2): tasks visibly derived from the
   JD↔resume gap, slotted around real walls. "It scheduled, not just listed."
2. **Fall behind → honest re-solve** (Screen 3): the amber forced-tradeoff +
   calm rebuild. "It told me the truth instead of pretending I could catch up."

---

## 7. Build order tomorrow (engine-first, risk-front-loaded)

- **0–1h** — scaffold runs (this repo). Lock the data model.
- **1–4h** — THE ENGINE: greedy weighted scheduler + prereq ordering +
  at-risk bucket. Unit-test it on fixtures with NO LLM. This is the moat;
  if it's solid by hour 4, you've de-risked the whole project.
- **4–5h** — feasibility + minimal-cut tradeoff + downscoping.
- **5–7h** — LLM ears: resume→profile, JD→tasks. Wire real OpenAI key.
- **7–9h** — the week-grid UI + the re-solve signature animation (Screen 2+3).
- **9–10h** — coach chat (thin narration over the engine).
- **10–11h** — polish the two demo moments; rehearse the click path.
- **11–12h** — STRETCH, time-boxed: Google Calendar read-only OR Exa job
  match. Only if core is done. Drop without regret if either fights you.

---

## 8. Traps (read before building)
- Keep the LLM out of `/api/plan` and `/api/reshuffle`. Engine = deterministic.
- Don't build full ILP. Greedy weighted is finishable and defensible.
- Cold-start velocity: seed a believable completion history for the demo.
- Calendar sync & Exa matching are STRETCH adapters, never dependencies.
- Don't center job-matching — that's 'Sup's turf. Center the roadmap+engine.
- Amber = feasibility moment only. If it's everywhere, it means nothing.
