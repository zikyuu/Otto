# Otto — Build2026 game plan

The engine is built, tested, and live on Exa. Today is about making the two demo
moments land: wired to real keys, deployed, rehearsed. Stretch goals come
**after** the Hour-8 gate.

> One-line pitch: *Resume + job → live interview signal → roadmap that fits your
> real week → honest reshuffle when you fall behind. When you're behind, Otto
> comes to you.*

---

## What's already done — do not touch

| File | Status |
|------|--------|
| `backend/app/models.py` | ✅ locked — full data model |
| `backend/app/engine/scheduler.py` | ✅ greedy weighted scheduler + prereq ordering |
| `backend/app/engine/feasibility.py` | ✅ feasibility check + forced tradeoff |
| `backend/app/engine/gaps.py` | ✅ live Exa lookup + static fallback · 5 tests passing |
| `backend/app/llm/extract.py` | ✅ OpenAI resume/JD parsing + narration (gpt-4o-mini) |
| `backend/app/sources/adapters.py` | ✅ swappable adapters · Google Calendar stubbed |
| `backend/app/main.py` | ✅ all FastAPI endpoints wired |
| `backend/app/demo_data/demo.json` | ✅ deliberate gap — DS&A + system design missing |
| `backend/tests/test_engine.py` | ✅ 5 tests · all passing |

Engine tests must pass after any engine change. LLM never touches
`/api/plan` or `/api/reshuffle` — engine only, deterministic.

---

## Roles

| Person | Role | Owns |
|--------|------|------|
| **A** | Integration & deploy | LLM seam correctness, direction review, deploy, keeps `main` green |
| **B** | Frontend — demo moments | re-solve animation + tradeoff interaction |
| **C** | Frontend — setup & polish | wall editor, chat UI, responsive, visual polish |
| **D** | LLM tuning + Zo + demo | Zo Telegram agent, prompt tuning, demo script, rehearsal |

---

## Judging criteria (weight every decision against this)

| Criterion | Weight |
|-----------|--------|
| Innovation & creative use of sponsor tech | 30% |
| Proof of Work / Functionality | 25% |
| Problem fit & Market Value | 25% |
| Design, Craft & Taste | 20% |

**Implication:** the Exa + Zo moments are the 30% — make them visible in the
demo. The engine re-computing live is the 25% proof-of-work — judges can poke
it. The two demo moments cover everything else.

---

## Priority order

### 1. Re-solve animation — B · `feat/resolve-animation`
File: `frontend/src/components/WeekGrid.jsx`

Blocks slide smoothly to new positions when the plan recomputes. Stagger the
motion so blocks move in sequence; briefly highlight moved blocks in a lighter
teal before settling to `var(--accent)`. This is the signature demo moment —
spend the boldness here and keep everything else quiet.

### 2. Tradeoff interaction — B · `feat/tradeoff-interaction`
File: `frontend/src/App.jsx`

The amber tradeoff card renders but does nothing. Wire "choose one": drop the
other goal's tasks from state, re-call `/api/reshuffle`, rebuild the plan.
Amber resolves to calm green once rebuilt.

### 3. Zo Telegram alert — D · `feat/zo-telegram`
New file: `backend/zo_agent.py`

A script that runs on Zo on a schedule. Checks the current plan's feasibility;
when a deadline is close or the user is behind, fires a Telegram message with
the one best next action and an offer to reshuffle. This is the "Otto comes to
you" moment — mid-demo, a Telegram ping arrives showing Otto catching a missed
deadline live. Zo LLM access TBD; wire as an optional layer once the API shape
is known. For now: Zo = hosting + Telegram delivery only.

### 4. LLM direction review — A · `feat/direction-review`
File: `backend/app/llm/extract.py`

Add `direction_review(tasks, goal)`. Compares the user's current task list
against the Exa-retrieved skill signal and returns a grounded critique:
*"You're grinding syntax — this role interviews on system design. Shift focus."*
Every critique must cite the Exa signal, never vibes.

### 5. Wall editor — C · `feat/wall-editor`
File: `frontend/src/App.jsx` setup screen

Let the user add/remove fixed blocks (day, start, end, label) live in the UI
instead of only loading from demo data.

### 6. Chat UI polish — C · `feat/chat-polish`
File: `frontend/src/App.jsx`

Message history, clear input, calm narration style. Already wired to
`/api/chat` — this is purely UI.

### 7. Deploy — A · `feat/deploy`
Backend → Railway or Render. Frontend → Vercel. Set `OPENAI_API_KEY` and
`EXA_API_KEY` as env vars on the host. **Do this by hour 4** — env bugs must
surface now, not at hour 11.

### 8. Google Calendar sync — stretch · `feat/calendar-sync`
File: `backend/app/sources/adapters.py`

Implement `GoogleCalendarSource.walls()`. Read-only, OAuth, map busy-blocks to
`Wall[]`. Only after the Hour-8 gate.

---

## Timeline

### Hour 0–1 · Orient together
- [ ] All four: clone, run backend + frontend locally, hit `/api/health`.
- [ ] A: protect `main`, create branches, assign.
- [ ] All: confirm demo JD + résumé (already in `demo.json`).

### Hour 1–4 · Parallel build
- [ ] **A:** confirm `parse_jd` output skills match `gaps.py` vocabulary
      (normalization seam — the silent-breakage spot). Start deploy config.
- [ ] **B:** re-solve animation. Hardest piece; start fresh-brained.
- [ ] **C:** wall editor on setup screen.
- [ ] **D:** Zo Telegram agent draft. Tune narration tone.

### ⛳ Hour 4 · Checkpoint #1 (15 min, all four)
*"Does the spine work end-to-end with real keys?"*
If the LLM seam is shaky, A + D swarm it before anything else.

### Hour 4–8 · Demo moments get real
- [ ] **B:** tradeoff interaction — choose one, drop other goal's tasks,
      re-solve, amber → green.
- [ ] **C:** chat UI polish + responsive + empty/error states.
- [ ] **A:** deploy to live URL. Direction review wired end-to-end.
- [ ] **D:** Zo Telegram agent running on Zo. First full rehearsal.

### 🚦 Hour 8 · THE GATE (all four, be honest)
*"Is the demo locked?"* = both moments work end-to-end + deployed + clean
start-to-finish run.
- **YES →** record screen-capture fallback, then polish + stretch.
- **NO →** everyone converges. **No stretch goals until this is YES.**

**Record a clean screen-capture of a full demo run before leaving this gate.**
That recording is the stage fallback if anything breaks during judging.

### Hour 8–10 · Polish + rehearse (gate passed only)
- [ ] All: rehearse out loud, twice. Fix what rehearsal exposes.
- [ ] D: lock pitch + "'Sup is the fuel" framing.
- [ ] A: confirm fallback recording is crisp.

### Hour 10–11 · ONE stretch goal (everything above done)
Pick one, hard time-box, drop without regret if it fights:
- [ ] Google Calendar sync — most demo-relevant.
- [ ] Exa job-match gesture (`ExaJobSource`) — flashier, more off-thesis.

### Hour 11–12 · Freeze
- [ ] Code freeze. Final run-through. Charge devices. Test on venue wifi.

---

## Two sacred rules

1. **The Hour-8 gate is law.** No stretch goals until both demo moments work
   end-to-end and the app is deployed.
2. **A keeps `main` green.** Small PRs, one quick review, protected branch.

---

## GitHub branches

```
main                        protected — nobody pushes direct
feat/resolve-animation      B — signature re-solve motion
feat/tradeoff-interaction   B — choose-one commits & re-solves
feat/zo-telegram            D — Zo Telegram alert agent
feat/direction-review       A — LLM grounded critique via Exa signal
feat/wall-editor            C — setup screen wall add/remove
feat/chat-polish            C — chat UI, responsive, states
feat/deploy                 A — hosting config
feat/calendar-sync          (stretch) Google Calendar read-only
```

Flow: branch off `main` → commit small → PR → one quick review → merge.
Rebase before opening a PR.

---

## The two demo moments (everything serves these)

**Moment 1 — the roadmap lands**
User pastes JD → Exa retrieves live interview signal → roadmap derives from
real gaps → blocks land in the week grid with a smooth staggered animation.
*"It scheduled, not just listed — and it knew what the interview actually tests."*

**Moment 2 — Otto comes to you**
User marks a task missed → feasibility check fires → Zo sends a Telegram ping
with the best next action → user reshuffles → amber tradeoff if infeasible →
blocks re-animate → calm green rebuild.
*"It told me the truth instead of pretending I could catch up."*
