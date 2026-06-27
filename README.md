# Otto

**Resume + job → live interview signal → roadmap that fits your real week → honest reshuffle when you fall behind.**

When you're behind, Otto comes to you.

---

## The problem

You have a backend internship application closing in two weeks. The interview tests data structures and system design — things you haven't touched in months. You have lectures, a part-time job, gym, and maybe six free hours a day if everything goes perfectly.

Every to-do app gives you a list. None of them tell you whether you'll actually make it. None of them reshuffle when Wednesday goes sideways. None of them say *"you can fully prep the onsite OR apply to three more roles before Friday — not both at your pace."*

Otto does.

---

## The two moments

### 1. The roadmap lands

Paste a job description. Otto does three things at once:

- **Reads your résumé** — LLM extracts your current skill profile.
- **Retrieves live interview signal** — Exa searches what this specific role actually tests in 2026, not a static guess.
- **Derives your real gaps and schedules them** — a deterministic engine compares your profile against the role's requirements, builds a learning roadmap, and fits it into your actual week around your fixed commitments (lectures, gym, whatever you block).

The result lands in a week grid. Blocks slide into place. The schedule is not a suggestion — it is the only plan that fits.

### 2. Otto comes to you

You miss a task. Life happened.

- The feasibility engine re-runs against your remaining time and real pace.
- If the plan is still viable, blocks reshuffle quietly and the grid rebuilds.
- If it isn't, Otto surfaces a forced tradeoff instead of pretending: *"Fully prep the onsite OR apply to three roles closing Friday — not both at your pace. Which?"*
- You choose. The other goal's tasks drop. The plan re-animates in calm green.
- Simultaneously, Zo fires a Telegram ping with the one best next action — so Otto reaches you even if you haven't opened the app.

No false reassurance. No infinite backlog. Just an honest picture of what's possible and one clear next step.

---

## Why this isn't an LLM wrapper

Most "AI planners" are LLMs asked to generate a plan. They have no concept of your real schedule, no feasibility check, and no way to tell you when the plan breaks.

Otto's architecture separates these concerns cleanly:

```
LLM (ears)          EXA (signal)         ENGINE (brain)        LLM (mouth)
resume + JD  ──►  live interview  ──►  scheduler +       ──►  plain-English
→ structured        signal for role      feasibility           narration of
  skills            → enriched skill     (constraint           what moved
                    set for roadmap      solver,               and why
                                         deterministic)

                                              │
                                          ZO (reach)
                                   background agent + Telegram
                                   "your deadline is tomorrow —
                                    here's the one thing to do"
```

The engine — scheduling, feasibility, tradeoff — **never calls an LLM**. It is deterministic, re-runnable in under 50ms, and works with no API key. The LLM only handles the edges: reading your résumé, reading the JD, and narrating what the engine decided in plain English. Exa makes the roadmap reflect what roles actually test right now. Zo closes the loop by bringing the plan to you.

---

## Market value

**Who this is for:** students and early-career job seekers managing multiple applications against a real schedule — the person who has three deadlines, five commitments, and genuinely doesn't know if they'll make it.

**What exists today:**
- To-do apps and Notion templates generate lists, not schedules.
- LLM "plan my week" prompts have no feasibility check and go stale the moment anything changes.
- Calendar tools block time but don't know what work matters or in what order.

**Otto's wedge:** it is the only tool that combines live role-specific signal (Exa), a real scheduling engine, and proactive delivery (Zo + Telegram) into a loop that stays honest when plans break. The reshuffle is not a workaround — it is the product.

---

## Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Engine | Python, pure stdlib | Scheduler, feasibility, gap derivation — deterministic |
| API | FastAPI | HTTP layer |
| LLM | OpenAI gpt-4o-mini | Resume/JD parsing, narration |
| Signal | Exa | Live interview prep retrieval |
| Reach | Zo Computer + Telegram | Hosting, scheduled background agent, Telegram alerts |
| Frontend | React + Vite | Week grid, setup screen, chat |

---

## Live deployment

Otto is deployed on **Zo Computer**. Zo hosts the backend and runs the background scheduling agent that fires Telegram alerts when deadlines are close or tasks are missed — so the "Otto comes to you" moment works even when you're not in the app.

> **Live URL coming soon.** The app will be publicly accessible at a Zo-hosted URL once deployment is finalised.

---

## Getting started (local development)

### Prerequisites

- Python 3.11+
- Node.js 18+
- API keys: `OPENAI_API_KEY`, `EXA_API_KEY`
- Optional: Telegram bot token for Zo alerts

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Fill in OPENAI_API_KEY and EXA_API_KEY in .env

uvicorn app.main:app --reload
# API available at http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# UI available at http://localhost:5173
```

### Try the demo

```bash
curl http://localhost:8000/api/demo
```

Returns a seeded payload with a deliberate skill gap (data structures and system design missing from the résumé against a JD that requires both) — the exact scenario that drives the demo roadmap and tradeoff moment.

### Run the engine tests

```bash
cd backend
pytest tests/test_engine.py -v
```

All 5 tests must pass. The engine is deterministic — if these tests fail after any change to `engine/`, something broke.

---

## API reference

| Method | Endpoint | Input | Output |
|--------|----------|-------|--------|
| `POST` | `/api/profile` | `resume_text` | `Profile` (LLM parse) |
| `POST` | `/api/goal` | `jd_text`, `goal_id` | `Goal` (LLM parse) |
| `POST` | `/api/plan` | `profile`, `goals[]`, `walls` | `Plan` + `tasks[]` |
| `POST` | `/api/reshuffle` | `profile`, `goals`, `missed[]` | `Plan` + narration + `tasks[]` |
| `POST` | `/api/chat` | `message`, `plan_summary` | narration |
| `GET` | `/api/demo` | — | seeded demo payload |

`/api/plan` and `/api/reshuffle` are pure engine — no LLM, fully deterministic.

---

## Project structure

```
backend/
  app/
    models.py              data model (locked)
    engine/
      gaps.py              gap derivation + Exa signal retrieval
      scheduler.py         greedy weighted scheduler with prereq ordering
      feasibility.py       feasibility check + forced tradeoff surface
    llm/
      extract.py           parse_resume, parse_jd, narrate
    sources/
      adapters.py          ManualSource, GoogleCalendarSource (stub), PasteJDSource
    main.py                FastAPI endpoints
    demo_data/demo.json    deliberate skill gap for demo
  tests/
    test_engine.py         5 engine tests — must pass after any engine change

frontend/
  src/
    App.jsx                main app + tradeoff interaction
    components/
      WeekGrid.jsx         week grid + re-solve animation
    styles.css             design tokens
```
