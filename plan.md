# Otto — Build2026 game plan

Team: **Nicha · Shianne · Melden · Rayner**

The engine is already built and tested. Tomorrow is about making the demo land:
the two moments that win the room, wired to real LLM keys, deployed, rehearsed.
Stretch goals come **after** the demo is locked — see the Hour-8 gate.

> One-line pitch: *'Sup tells you which jobs to chase and what they require;
> Otto makes sure you chase them with the right work, at a pace you can sustain
> — and when you fall behind, it tells you the truth instead of pretending you
> can catch up.*

---

## Roles

| Person | Role | Owns |
|--------|------|------|
| **A** | Integration & correctness | API seam, LLM-extraction correctness, deploy, keeps `main` green |
| **B** | Frontend — the two demo moments | re-solve animation + tradeoff interaction (the money moments) |
| **C** | Frontend — everything else + polish | setup screen, wall editor, chat UI, responsive, visual polish |
| **D** | LLM tuning + demo craft | prompt tuning, demo script, rehearsal, deploy support |

---

## Timeline (gated)

### Hour 0–1 · Setup together
- [ ] All four: clone, run backend + frontend locally, confirm you can hit the API.
      (Do this together — kills "works on my machine" at hour six.)
- [ ] A: protect `main`, create issues (below), assign, add everyone as collaborators.
- [ ] All: **agree the demo JD + résumé now** so nobody builds against a moving target.

### Hour 1–4 · Parallel build (no blocking)
- [ ] **A:** wire `OPENAI_API_KEY`; test `parse_resume`/`parse_jd` on the real
      demo JD; fix the vocabulary seam (JD skills must match `gaps.py` names —
      silent-breakage spot). Confirm full flow on real LLM, not fallback.
- [ ] **B:** re-solve animation — blocks slide smoothly to new positions on
      reshuffle. Hardest piece; start fresh-brained.
- [ ] **C:** wall editor on setup screen (add/remove fixed blocks live) + visual polish.
- [ ] **D:** tune narration tone (calm, names what moved, no guilt); draft demo script.

### ⛳ Hour 4 · Checkpoint #1 (15 min, all)
*"Does the spine work end-to-end with real keys?"* If the LLM seam is shaky,
A + D swarm it before anything else. A broken roadmap kills the demo.

### Hour 4–8 · The two demo moments get real
- [ ] **B:** tradeoff interaction — "choose one" commits, drops the other
      goal's tasks, re-solves cleanly. Demo moment #2 fully working.
- [ ] **C:** chat UI polish + mobile/responsive + empty & error states.
- [ ] **A:** deploy to a live URL (backend Railway/Render, frontend Vercel).
      Deploy early — it flushes env bugs out now, not at hour 11.
- [ ] **D:** first full rehearsal against the real app; note what's clunky.

### 🚦 Hour 8 · Checkpoint #2 — THE GATE (all, be honest)
*"Is the demo locked?"* = both moments work + deployed + clean start-to-finish run.
- **YES →** proceed to polish, then stretch.
- **NO →** everyone converges on closing the gap. **No stretch goals until this is YES.**

### Hour 8–10 · Polish + rehearse (gate passed only)
- [ ] All: rehearse out loud, twice. Fix the jank rehearsal exposes.
- [ ] D: lock the pitch + the "'Sup is the fuel" framing.
- [ ] A: record a clean screen-capture of a full run as a **stage fallback**.

### Hour 10–11 · ONE stretch goal (everything above done)
Pick **one**, whoever's freest, time-boxed, drop without regret if it fights:
- [ ] Calendar read-only sync (`GoogleCalendarSource` stub) — most demo-relevant.
- [ ] Exa job-match gesture (`ExaJobSource` stub) — flashier, more off-thesis.
- [ ] Engine: constraint-solver swap — only if a technical judge is likely & UI flawless.

### Hour 11–12 · Freeze
- [ ] Code freeze, no new features.
- [ ] Final run-through, charge devices, test on venue wifi, confirm fallback recording.

---

## Two sacred rules
1. **The Hour-8 gate is law.** Stretch + engine improvements live after it, never before.
2. **A keeps `main` green.** Small PRs, fast review, protected branch.

---

## GitHub workflow

**One repo. `main` protected (Settings → Branches → require PR before merge).
Feature branches, small PRs, no forks.**

### Branches
```
main                      always-deployable; nobody pushes direct
feat/llm-wiring           A   — real key + extraction correctness
feat/resolve-animation    B — the signature re-solve motion
feat/tradeoff-interaction B — choose-one commits & re-solves
feat/wall-editor          C  — setup screen wall add/remove
feat/polish               C  — chat UI, responsive, states
feat/narration-tuning     D  — prompt tone
feat/deploy               A   — hosting config
feat/calendar-sync        (stretch) read-only Google Calendar adapter
feat/exa-match            (stretch) Exa job-match adapter
```

Flow: branch off `main` → commit small → PR → one quick review → merge.
Rebase/pull `main` before opening a PR to avoid conflicts.

### Issues to create (Hour 0)
Paste each as an issue; labels in [brackets]; assignee in (parens).

1. [llm] Wire OPENAI_API_KEY + fix JD↔gaps vocabulary seam (A)
2. [llm] Narration tone: calm, names what moved, no guilt (D)
3. [frontend] Re-solve signature animation (B)
4. [frontend] Tradeoff: choose-one commits + re-solves (B)
5. [frontend] Setup screen wall editor (C)
6. [frontend] Chat UI + responsive + empty/error states (C)
7. [infra] Deploy backend + frontend to live URLs (A)
8. [demo] Write + rehearse demo script & pitch (D)
9. [demo] Record stage-fallback screen capture (A)
10. [stretch] Google Calendar read-only sync (unassigned)
11. [stretch] Exa job-match gesture (unassigned)
12. [stretch] Engine: constraint-solver swap (unassigned)

---

## The two demo moments (everything serves these)
1. **Roadmap lands in the week** — tasks derived from the real JD↔résumé gap,
   scheduled around real commitments. *"It scheduled, not just listed."*
2. **Fall behind → honest re-solve** — recompute + the forced "choose one"
   tradeoff + calm rebuild. *"It told me the truth instead of pretending."*