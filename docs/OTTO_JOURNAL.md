# Otto: a build journal

*A calendar that learns how you actually work, and what I got wrong building it.*

> **How to read this.** It is written as a journal, in the order the thinking happened, not as a feature list. Dates are left out on purpose: the work came in bursts, not a steady line. Where a month helps, it is a vague one. Everything here is checked against the repo (code, git history, tests). Anything that is my own recollection rather than something the repo shows is marked **[my account]**, and the bracketed notes like **[ADD: ...]** are places for you to put in your own words, screenshots or links.

---

## 1. Why I wanted this app (the use case)

**[ADD: 2 to 4 sentences in your own voice about the moment this was a real problem for you. A real example is better than a general one: a week you planned and could not keep, a goal you drifted from without noticing.]**

The problem, as I wrote it down at the start, is this: ordinary calendars and to-do apps are *static*. You put things in boxes, life happens, and the boxes stay where they were. You end up doing the rescheduling by hand, every time, and the app knows nothing about *you*. It does not know that you do your hard thinking in the morning, that a "one hour" task really takes you an hour and a half, or that you go flat after lunch.

What I wanted was a calendar that:

1. **Fits work into the real week**: around meetings, sleep, and how long things really take *you*.
2. **Rebuilds the plan when the day goes wrong**: you overslept, a task ran long, there is too much. And it does that in a way you can see and undo.
3. **Learns how you work** from small signals, and shows you what it learned, so it is a mirror and not a black box.
4. **Keeps long-term goals honest**. Example I kept coming back to: "learn machine learning" while actually spending a month on Python syntax. Something should notice and say so.

The target user is one person managing a messy, goal-heavy week: a student or job seeker juggling a thesis, interview prep and applications (that is who the demo data is about).

---

## 2. What it had to do (the first list of functions)

Before any code, the functions I thought it needed:

| Function | In plain words |
|---|---|
| Calendar | Week, two-week and month views, drag to move, resize, lock |
| Tasks with steps | A task can have ordered subtasks ("prep before the interview") |
| Scheduler | Place flexible work around fixed events, respecting deadlines |
| Rescheduler | Fix the plan after a change, moving as little as possible |
| Learning | Pace, best hours, focus length, learned from what you actually do |
| Recovery | Late start, "I'm overwhelmed", too much for the week |
| Goals | Milestones, progress against a plan, drift detection |
| Reflection | Weekly look back, and a way to tell Otto how things went |

Everything after this was either one of these done properly, or a fix for something I got wrong.

---

## 3. Entry: the hackathon (JUN 2026)

Otto began as a **hackathon project**: a short build (about five hours of build time **[my account; check]**) done as a team. The hackathon required using certain AI tools in the product, and that shaped everything about the first version.

**What we built then** was not the calendar above. It was a *job-application planner*: paste a résumé and a job description, get a learning roadmap that fits into your real week, and get an honest rebuild when you fall behind. The architecture doc from that time describes it as an LLM "ears and mouth" around a scheduling engine:

```
 résumé + JD ─► LLM (parse) ─► Exa (live interview-prep signal) ─► scheduler ─► LLM (explain) ─► Telegram nudge
                 "ears"           "signal"                          "brain"      "mouth"        (via Zo)
```

The services in that first stack: OpenAI for parsing and narration, **Exa** for live web search, **Zo Computer** for hosting and a scheduled **Telegram bot**, Supabase, Google Calendar (read-only), a FastAPI backend and a React frontend.

Honest summary of that version: it *worked*, and it demoed. But we had jammed many AI services and APIs into it because the brief asked for them, not because each one earned its place.

The repo history from that month shows what a rushed team build looks like: about 70 of the project's commits are in that single month, there are pull requests merged on top of each other, a commit that exists only to "resolve leftover merge conflict markers", and a series of "deploy" commits that were reverted and re-applied. **[my account: some work was overwritten by force-pushed changes. The history shows the reverts and conflict fixes; confirm what you want to say about the force-pushes.]**

---

## 4. Entry: was the AI doing too much? (after the hackathon)

After the hackathon I stopped and asked a question that I think more people should ask: **is the AI actually bringing value here, or is it overhead?**

### The thing that made it obvious

The first version asked an LLM to reschedule after every calendar change. In practice:

- **Slow.** Every drag meant a round trip to a model: roughly **2 to 5 seconds** each (the figure recorded in the project notes). A calendar you drag around needs to answer in a blink.
- **Opaque.** The model returned a new schedule with no reasoning I could inspect. When it was wrong, I could not tell why, and neither could the user.
- **Inconsistent.** The same situation could produce different arrangements.
- **Disruptive.** It tended to reshuffle the whole week, not just what the change broke, so people stopped trusting it.
- **Costly.** Every drag was a paid call.

After I replaced it with a plain algorithm, a drag is answered in about **36 ms** (median, my laptop, a 108-event calendar, one pinned move; slowest of 15 runs was 129 ms). A full two-week re-plan of the same calendar took a median of about 330 ms. Same inputs always give the same answer, and every move can be explained.

### Feature by feature: what needs AI and what does not

I went through each feature and asked what *kind* of problem it is.

| Feature | Kind of problem | Verdict |
|---|---|---|
| Reschedule after a drag or a late start | Constraint satisfaction: fixed rules, known inputs | **Algorithm.** Faster, explainable, free |
| Learning your pace, best hours, focus length | Statistics over your own logs | **Algorithm** (running averages, thresholds) |
| "Will this fit?" feasibility and trade-offs | Arithmetic on capacity vs. demand | **Algorithm** |
| Behaviour patterns (switching cost, decision fatigue...) | Compare two groups of your own data | **Algorithm** |
| Ranking what matters when overwhelmed | Sorting with weights you set | **Algorithm** |
| Weekly check-in: free text to settings | Understanding open language | **LLM is useful, but optional**: a keyword reader covers common sentences, and nothing is applied until the user ticks it |
| Tidying a long, loosely worded task | Rewriting text | **LLM, optional, tiny** (one batched call, 5 a week) |
| Otter-voice weekly recap | Tone | **Deterministic recap by default**; LLM only to rephrase |
| **Long-term goal review ("the wizard")** | Big-picture judgement across any field | **LLM, kept** (see section 6) |
| Résumé and job description parsing (hackathon) | Extraction | Still in the code, **no longer used by the app** |

The pattern is: if a problem has *rules and numbers*, write the rules. Reserve the model for problems where the input is open-ended language or where the answer needs broad world knowledge.

---

## 5. Entry: the brain, a scheduler and a learning loop

So the core became my own deterministic scheduler (`backend/app/engine/scheduler.py`), fed by a learning loop (`engine/learning.py`).

### The scheduler, in the order it decides things

1. Drop finished work; park anything the user parked on purpose.
2. Order tasks so prerequisites come first.
3. Rank by a **priority score**: `0.4 x deadline urgency + 0.3 x fixed + 0.2 x blocks other tasks + 0.1 x importance`, plus a term from the user's own importance cards (section 9).
4. Size each slot as `planned time x your pace for that kind of work + your warm-up time`, so a block is long enough for how *you* actually work.
5. Find a slot that passes the gates: hard work only starts inside your best hours; nothing demanding right after lunch; a break after about 90 minutes of deep work.
6. If there is no room: try splitting, then (for the calendar) try the block at the length shown, marked tight; and for an unavoidable hard deadline only, use sleep hours and flag it.

**Rescheduling is a ripple, not a rebuild.** Moving one event only fixes what it displaces, so everything else stays where the person put it. That one decision is a big part of why people trust it.

### What it learns, and why each number exists

Every learned number exists because the scheduler makes a decision with it. That was my rule: no metric just for show.

| What it learns | How | What the scheduler does with it |
|---|---|---|
| **Pace per kind of work** | Running average (recent counts 20%) of actual vs planned time | Stretches estimates: if deep work takes you 1.3x, it books 1.3x |
| **Best focus hours** | Energy taps over the day; not moved until 10+ taps across 3+ hours of the day | Hard work only starts in this window |
| **Focus span** | Rises from long sessions marked "nailed", falls from labelled focus breaks | Cuts long tasks into sessions you can actually hold. Needs 3+ observations before it overrides your own block |
| **Planning load** | Follows your completion rate after 5+ signals | How much of your free time to fill, so days are not packed solid |
| **Lunch slump** | Low energy taps in the three hours after noon (needs 6+) | Keeps demanding work out of that stretch |
| **Warm-up time** | Regression of actual vs planned duration (needs 5+ points that differ enough) | Added to the front of a block |
| **After a meeting** | Energy taps soon after meetings | Leaves recovery room |
| **Exercise first?** | Of days with both, how often the gym came before deep work (70%, 3+ days) | Orders the day |

**You can always override.** Anything you state directly ("I focus best 9 to 12") is *pinned*: learning keeps running but never overwrites it.

Learning is deliberately cautious. A single bad day must not wreck the profile, so signals are capped, noisy ones (outliers, interruptions, skill gaps) do not change your pace, and several metrics wait for a minimum amount of evidence before they move.

---

## 6. Entry: where I kept the AI, the goal wizard

One feature genuinely cannot be done by an algorithm: **the long-term goal review.**

A goal can be anything: lose weight, learn machine learning, finish a thesis, pass a system-design interview. No rule set I could write has the knowledge to say "your plan to learn ML is going the wrong way because a month of Python syntax drills is not on the path to what you want". That needs broad knowledge of many fields and judgement about *direction*, and it only needs to happen about once a week. That is exactly where a language model earns its cost and its seconds.

Arithmetic still does everything it can: progress, expected progress, pace, status and delays are computed by the app. The model is only asked for what arithmetic cannot give: *is the path itself right, and if the goal cannot be reached, what should be cut or moved?*

**Guardrails, because the model is not trusted to act:**

- It returns structured changes (move a target, add or drop a milestone, change direction). The server **validates every id, date and number** and decides which changes are "major".
- The server **never applies anything.** The user approves. A major change (a pivot, many drops, a large date move) needs an explicit "I understand this changes my plan".
- Every apply has an undo, finished work is never removed, and if the model's prose recommends something with no matching change, it is shown as "also mentioned" and never hidden.

---

## 7. Entry: architecture (how it was split, and the principles behind it)

### The layers

```
 React app (Vite)                         FastAPI                         storage
 ────────────────                         ───────                         ───────
 screens (.jsx)                           main.py  (endpoints)            profile  = the learned you (JSON)
   │  pure logic modules (.js, tested)      │                             documents = calendar, goals,
   │  localStorage (otto.*) ◄─ mirror ─────►│  engine/ (pure, no I/O)       grinder, summaries (one JSON
   │                                        │   scheduler, learning,        document per key)
   └── fetch /api ─────────────────────────►│   patterns, overwhelm, ...  local file  ─or─  Supabase
                                            │  llm_access.py  (who pays)
                                            └  auth.py, clock.py (who, when)
```

### Principles I tried to follow, and where they show up

| Principle | What it looks like here |
|---|---|
| **Separation of concerns** | The `engine/` package is pure functions with no network or disk. `main.py` is a thin HTTP layer. Screens call pure helper modules for the maths |
| **Determinism and testability** | Same input, same schedule. Because the engine has no I/O, 548 tests run in seconds with nothing faked except the AI and the clock |
| **A single contract** | `models.py` defines the data (dataclasses and enums); the rest of the backend speaks that language |
| **Validate at the trust boundary** | Everything the model returns is checked and clamped before it is used. Everything from the browser is validated by Pydantic |
| **Graceful degradation** | No AI key: the app still works. No Supabase: it writes to a local file. Supabase down: it falls back to the file instead of losing a write |
| **Human in the loop** | AI proposes, the user disposes. Nothing from the model changes a goal or a plan unasked |
| **Least privilege** | The Supabase service key lives only on the server; the table is locked against the public key; saved OpenAI keys are encrypted and never sent back |
| **Idempotence** | Crediting hours to a goal only adds the *change* if you save a reflection twice; recurring events never duplicate (same id for the same day) |
| **Adapters for things that change** | Event sources (manual, pasted, Google Calendar) sit behind one interface |

### Schema design: the original and what it became

The hackathon schema was small: `Skill`, `Profile {skills, free hours, walls, velocity}`, `Wall` (a recurring busy block), `Goal` (a job description), `Task {full and lite minutes, prerequisites}`, `Block`, `Plan`, `CompletionEvent`. It described a *job-prep* world.

Now:

- **Profile** carries what Otto has learned: pace per category, warm-up per category, peak window, focus span (and how much evidence), planning load, lunch slump, recovery, sleep window, plus the raw signals (energy taps, reflections, off-track labels), pinned rules, and the late-start log.
- **Calendar event** (a JSON document the page owns): `id, title, day, startMin, durationMin, category, fixed, non_negotiable`, links (`prereq_ids`, `grouped_with`), deadlines (`deadline_iso`, `hard_deadline`, `best_done_by_iso`), steps and checklist, goal link (`goal_id`, `milestone_id`), repeat (`series_id`), importance (`importance_cat`, `importance_tier`), and what happened (`reflection`).
- **Dates:** `day` started as "day of the month" (1 to 31) and became **days since 1 Jan 1970** (section 8).
- **Storage:** one table, `otto_kv(key, value jsonb, updated_at)`, a document per key; a signed-in person's keys are prefixed with their user id. The learned profile is one document too.

**Why documents instead of proper tables?** The frontend was changing shape every few days. A JSON document per key let me add a field (an importance tier, a repeat id) without a migration. The price is real: no relational integrity, no querying "all events for goal X" in SQL, and the whole calendar is read and written as one blob. I chose speed of iteration on purpose and I would normalise it next (see "What I'd do differently").

### Caching: what exists and what does not

Be honest about this part.

**Implemented:**
- The page keeps a copy of everything in `localStorage` and mirrors writes to the server (debounced), so reloads are instant and a network failure never blocks the page.
- Login tokens are verified with Supabase at most once a minute per token (a small in-memory cache).
- The local-file store acts as a cache when Supabase is unreachable.

**Not implemented (listed under "Areas for improvement"):** caching scheduler results, conditional requests (ETags), caching AI answers, a shared cache such as Redis. They were not needed at this size, and I would rather say so than pretend.

---

## 8. Entry: roadblocks, or "I built this, then realised it could not do what I needed"

These are not bugs so much as *changes of plan*: places where the thing I had built was missing something I only saw by using it.

**1. The AI rescheduler.** Built first, replaced entirely (section 4).

**2. The wrong product.** The hackathon app answered "how do I prepare for this job?" The thing I actually wanted was a general calendar that learns you. That meant keeping the engine and rebuilding almost everything around it.

**3. Signals with no screen.** I built the learning loop (reflections, energy taps, off-track labels) in the backend first, and it worked in tests, but there was *nothing in the UI to produce those signals*. So nothing was ever learned from real use. It forced me to build the reflection panel, the energy button and the off-track prompts, and it taught me that a backend feature without its screen is not a feature.

**4. Dates that were not dates.** Events stored only "day of the month". It worked in a demo week, then fell apart: the calendar did not follow the real date, other months did not exist, and nothing could repeat. I moved every event to a real day number and had to change the backend, the demo data and a lot of tests. It was the most invasive change of the project and the clearest example of "I should have designed the date model first".

**5. "Couldn't fit cleanly", when it clearly fit.** I dragged a task earlier than the task it depended on. Otto said there was no room, though there was a gap right above. The cause: the scheduler books a slot *longer* than the block you see (your pace plus warm-up, so a 60-minute block needs about 93). The gap was 80. I added a fallback that places the block at its planned length and marks it tight, and wrote a test that fails without the fix.

**6. Late start, three versions.** First a single line to drag (above it stays today, below it is parked). Then a choice per task (today, tomorrow, Meatball Grinder, drop). Then, because a result list is a poor way to judge a plan, the plan opens **on the calendar** with Current and New views and you can drag blocks before applying. Each version came from using the previous one.

**7. "I'm overwhelmed" was a platitude.** The first version picked "one thing to start" and one to shrink. It did not help someone with six tasks and a deadline. It became a planner: ranked by importance, split into what has a deadline and what is just eventual, "I only want to work __ hours", and a rest-day view that is honest about the cost when the deadlines cannot move.

**8. A priority form is the wrong shape.** The backend could rank tasks, and I first gave it a form. It was clumsy. It became three cards with tiers, drag and drop, and a rule that Otto asks you, rather than guesses, when something marked unimportant has an unmovable deadline.

**9. Counting the same thing three times.** Three gym sessions showed up as three cards to rank. The fix was not a schema change: group by the work, not the event.

**10. The server's clock.** While preparing to host it, I realised the server decided what "today" was using its own clock, which on a hosted machine is a different time zone. Every request now carries the person's local time.

**11. Tests that expire.** Four tests broke only because the real date moved past the week they were written for. Lesson: freeze the clock in any test that depends on "now".

**12. Process hygiene.** A careless broad "kill the server" command once took down my own backend and produced a baffling error. Now test servers get their own ports and are stopped by process id only.

---

## 9. Entry: the user experience, and the thinking behind it

The interface changed more than the engine did, and almost every change came from using the previous version and feeling something was off. This section covers the nine design decisions I care most about, each as *what was wrong, what I changed, and why*. Screenshots are from the app running locally with a seeded demo profile; the "before" shots are earlier versions of the app (from git history) or my own screenshots at the time.

### 9.1 A calm place, not another minimalist app

**The problem.** The first version was a clean, generic card interface. It worked, but it felt like every other productivity tool, and a tool that is supposed to help when you are behind should not feel like a spreadsheet telling you off. My brief to myself was: *fit the otter, feel calming, and do not be another minimalist UI.*

**What I did.** I tried a flat, minimalist redesign once and dropped it. I rejected plain geometric sans-serif type because it read as generic, "template" output. I worked from a reference palette instead: pine, kombu green, moss, brandy and pale copper, parchment surfaces tinted from the brandy, **Fredoka** (rounded, slightly hand-lettered) for headings, buttons and big numbers, **Nunito** for body text. Cards are "double-bezel" (a tray holding a plate, concentric radii), buttons are soft pills, pages open with a painted forest banner, and the otter appears with a mood to match the moment (reading, sad on a late start, panicked when overwhelmed, a wizard on the goals page).

**Why it matters beyond looks.** The tone does work too. Copy is deliberately gentle ("Rough week. That is completely normal. Nothing is overdue.") and the AI prompts say the same thing in code: never guilt. Warm colours mark problems; I avoided alarm-red except where something is really at risk.

| Hackathon | Third pass | Fourth pass | Now |
|---|---|---|---|
| ![](screenshots/before/home-hackathon.png) | ![](screenshots/before/home-third.png) | ![](screenshots/before/home-fourth.png) | ![](screenshots/current/04-home.png) |

![look evolution home](gifs/look-evolution-home.gif)

![calendar evolution](gifs/calendar-evolution.gif)

### 9.2 A sidebar that gets out of the way

**The problem.** The hackathon sidebar was always fully open, with labels, a profile card and status chip. It took roughly a fifth of the window to hold four links.

**What I did.** The sidebar is a floating dark panel that **collapses to icons** by default and opens when you click it; moving on to a page, or clicking the content, collapses it again. I tried expanding on hover and rejected it, because it opens by accident and makes the layout jump while you are working. The goal was a decluttered, focused view when you are *using* the app, with labels available when you need them. Priorities and Rules joined the nav later without making it feel crowded.

| Before: always open | Now: collapsed | Now: opened by a click |
|---|---|---|
| ![](screenshots/before/calendar-week-hackathon.png) | ![](screenshots/current/05-calendar-week.png) | ![](screenshots/current/32-sidebar-expanded.png) |

![sidebar collapse expand](gifs/sidebar-collapse-expand.gif)

### 9.3 Seeing the macro and the micro: Month, 2 weeks, Week

**The problem.** Planning needs two zoom levels. "Is my month sane?" and "what exactly is on Thursday afternoon?" are different questions, and the hackathon calendar mostly answered the first with a mock month.

**What I did.** Three views on one control. **Month** gives the shape of the month with each day's events as chips; **2 weeks** is the planning horizon the scheduler and "Find time" work in (every suggested slot is on screen); **Week** is where you drag, resize, link and reflect. All three follow the real date, so the current week is always the one you land on.

| Month | 2 weeks | Week |
|---|---|---|
| ![](screenshots/current/09-calendar-month.png) | ![](screenshots/current/08-calendar-two-weeks.png) | ![](screenshots/current/05-calendar-week.png) |

![calendar views](gifs/calendar-views.gif)

### 9.4 The 24-hour day, folded in for focus

**The problem.** A planner that only shows 08:00 to 23:00 is wrong for the nights that matter most: the all-nighter before a deadline, the early start. But a full 24-hour grid wastes half the screen on sleep.

**What I did.** The grid models the *whole* day, and **sleep hours are folded away** behind a slim bar ("Show sleep hours (0:00 to 8:00)", which also counts any blocks sitting in there) so the default view is focused. Open it and the shaded, protected sleep time appears; its edges can be dragged, and a Sleep menu handles hours the grid cannot show. The scheduler never plans into sleep on its own, with one exception: a hard deadline that nothing else can meet. Then the work lands in sleep hours and is **flagged "sleep time"**, so the compromise is visible, not hidden. A person can also drag work there by hand and it stays.

| Folded (default) | Opened |
|---|---|
| ![](screenshots/current/05-calendar-week.png) | ![](screenshots/current/07-calendar-sleep-hours.png) |

![sleep fold](gifs/sleep-fold.gif)

### 9.5 Creating an event: fast by default, deep on demand

**The problem.** Most events are a title and a time. Some are a three-hour thesis chapter with steps, a deadline and an order. One form cannot be both quick and complete.

**What I did.** Progressive disclosure. Click a slot and a small popup opens right beside it with the name, time, kind of work and a Must-do switch. The otter "Advanced planning" button expands it into a **two-pane sheet**: details on the left, the plan on the right. The plan has a hard or soft **deadline**, a **best done by** date, and **steps** drawn as a ring chart where the step times always add up exactly to the block (drag a slice to rebalance, pin a step to hold it, switch on "in order" and drag to reorder or lasso steps to group them). Repeat, an editable date and time, and a "Counts towards" goal link were added later, since I kept wanting them while using it.

| Before (earlier popup) | Now: basic | Now: advanced planning |
|---|---|---|
| ![](screenshots/before/event-popup-fourth.png) | ![](screenshots/current/10-event-create-basic.png) | ![](screenshots/current/11-event-create-advanced.png) |

![event create advanced](gifs/event-create-advanced.gif)

### 9.6 Otto proposes, you decide: before and after, always

*This is the design idea the whole product rests on.*

**The problem.** The hackathon promise was in the footer of the calendar: "AI rearranges the rest". In practice that meant a model silently returning a new week. You could not see what it changed, and you could not say no to part of it.

**What I did.** Every time Otto wants to change your calendar, it shows a **proposal, not a result**. You mark time you want cleared; if an event is only partly covered you choose whether to cut it, split it or move it whole; then the calendar previews the new plan with a **Current / New** toggle, a list of exactly which blocks move and where, and the line "Nothing changes until you apply it." You can **drag any block in the proposal** to where you would rather have it, locked events never move, and a "Worth a look" box lists what your arrangement now breaks (an overlap, an order link) without blocking you. The button becomes **Apply my version** once you have edited it, and there is an undo.

The same pattern is used for a late start, for "I'm overwhelmed", and for the Priorities page. And where the engine *should not* guess, it asks: if something you marked unimportant has a hard deadline that can only fit by displacing something you marked important, you get a "Two things cannot both fit" question, and your answer is remembered.

The principle: **the algorithm is an assistant, not a replacement for planning.** It does the tedious arithmetic and shows its work; you keep the authority. That is also why I could make the scheduler deterministic and fast (section 4) without losing the "smart" feel: explanation and control are what make a suggestion trustworthy.

| Hackathon: "AI rearranges the rest" | Mark time to clear | New (proposal) | Current |
|---|---|---|---|
| ![](screenshots/before/calendar-week-hackathon.png) | ![](screenshots/current/15-reschedule-select.png) | ![](screenshots/current/17-reschedule-diff-new.png) | ![](screenshots/current/18-reschedule-diff-current.png) |

| "Your call": the engine will not guess |
|---|
| ![](screenshots/current/24b-importance-conflict.png) |

![reschedule flow](gifs/reschedule-flow.gif)

![current new toggle](gifs/current-new-toggle.gif)

![edit proposal drag](gifs/edit-proposal-drag.gif)

![link two events](gifs/link-two-events.gif)

### 9.7 Late start: telling passed from outstanding, and what matters from what does not

**The problem.** My first late-start screen listed what was left to do, ranked. You could not tell which tasks had *already passed* unless you read the small print "passed 8:15", and you could not see how important anything was. The only way to read it was to read every row. (It also had a stray `}` printed at the bottom, a small embarrassment that shipped.)

**What I did.** Colour and typography now carry the meaning so you do not have to read:
- Work whose time has **already gone is greyed out** and labelled; the rest is full colour.
- Each task is **tinted and edged by the importance you gave it**: red for important, yellow for good to accomplish, green for whatever, so the keep, tomorrow, **Meatball Grinder** or drop decision is made with confidence.
- A task you choose to drop is **struck through**; on the Home list, a block whose time passed without being ticked is struck through in red.
- Each task gets its own four-way choice instead of one draggable line, and the result opens on the calendar as a proposal (9.6), not as a list.

| Before | Now | The plan on the calendar |
|---|---|---|
| ![](screenshots/before/late-start-first-version.png) | ![](screenshots/current/01-late-start-modal.png) | ![](screenshots/current/02-late-start-plan-new.png) |

![late start flow](gifs/late-start-flow.gif)

![late start before after](gifs/late-start-before-after.gif)

### 9.8 "I'm overwhelmed": from a feature with no value to one that earns its place

**The problem.** The first version of this was, honestly, useless. It picked *one thing to start* and *one thing to shrink* and said "Rough week, that is completely normal." Reassuring, but it knew nothing about deadlines or importance, could not take "I only have four hours", and changed nothing on the calendar. If you had six tasks and a deadline, it did nothing for you.

**What I did.** I rebuilt it as a planner:
1. **Today's work is ranked by importance first**, then deadline, and split into **"Due soon"** (with how many days left and whether it is a hard deadline) and **"Has to happen eventually"**.
2. You say **"I only want to work __ hours today"** (or tick what you still want to do) and the most important work that fits stays today; must-dos always stay.
3. The rest is moved sensibly: a deadline keeps it close, important work goes to tomorrow, good-to-do work to next week, and *whatever* work to the **Meatball Grinder**. If that pushes a hard deadline out of reach, the *least* important flexible work before the deadline is cleared to make room, one piece at a time, and **only what has to move moves**.
4. The result opens on the calendar with three views to compare: **Current plan, Otto's suggestion, Rest today** (clear the whole afternoon).
5. The honest edge case. If there are, say, 20 hours of hard-deadline work due tomorrow, you *cannot* simply rest. Otto says so: **"Otto suggests you pull through today."** You can still choose to rest anyway, and it shows you the real cost: work pushed into sleep hours, flagged as not ideal because of what it learned about you (focus fades after about four hours of deep work, and badly after 3am).

| Before | Now: ranked, with deadlines | Now: Otto's plan on the calendar | The honest warning |
|---|---|---|---|
| ![](screenshots/before/overwhelmed-first-version.png) | ![](screenshots/current/20b-overwhelmed-deadlines.png) | ![](screenshots/current/21-overwhelmed-plan-suggested.png) | ![](screenshots/current/23b-overwhelmed-pull-through-warning.png) |

![overwhelmed flow](gifs/overwhelmed-flow.gif)

![overwhelmed pull through](gifs/overwhelmed-pull-through.gif)

![overwhelmed before after](gifs/overwhelmed-before-after.gif)

### 9.9 Priorities: a second signal besides the deadline

**The problem.** A scheduler that only knows deadlines makes poor calls. A gym session and a thesis chapter can both be "not due yet", yet they do not matter equally. I first added a priority *form* inside the Rules page; it was clumsy and did not belong there.

**What I did.** A dedicated **Priorities page** with three cards, **Important, Good to accomplish, Whatever**, and, inside each card, **ranked tiers**: tier 1 matters most; several tasks on the same tier have no order between them (one tier can hold two tasks, the next one, the next five). You **drag and drop** a task to re-sort it, and a new tier can be inserted *between* two others by holding a dragged card over the gap (the gap only opens after a moment, because always-visible insert zones wasted space).

The scheduler reads these as an extra term in its priority score, next to deadline urgency. Two details cut friction:
- **Same work is sorted once.** Events are grouped by name, so three "Gym session"s are one card, and a repeating event carries its sorting to future occurrences. A new event with the same name as one you have already sorted starts sorted the same way, so Otto does not ask you to categorise another gym session again.
- **No guessing on a clash.** If low importance and a hard deadline collide with something important, Otto asks (see "Your call" in 9.6).

| Before: a form inside Rules | Before: insert zones always on show | Now |
|---|---|---|
| ![](screenshots/before/rules-with-priority-form.png) | ![](screenshots/before/priorities-gaps-always-visible.png) | ![](screenshots/current/25-priorities.png) |

| A new tier opens between two others, only while dragging |
|---|
| ![](screenshots/current/26-priorities-insert-tier.png) |

![priorities drag](gifs/priorities-drag.gif)

![priorities before after](gifs/priorities-before-after.gif)

### 9.10 Rules and learned signals: no black box

**The problem.** Otto learns your pace, best hours, focus length and more. If it quietly plans around numbers you cannot see, it is a black box: you cannot correct it and you cannot learn from it. I also found the first Rules page confusing: a long dropdown of vaguely named options, mixed with that priority form.

**What I did.**
- **Everything it learned is on the page**, as a short name plus a one-line meaning ("Lunch slump: how long you are flat after eating"), the value, **where it came from** (set by you, learned from N logs, or a starting guess) and **how the scheduler uses it**. That is both an insight into your working style and a chance to reflect on it.
- **Pinned rules come first.** Only the rules you set are shown by default. A "Show N" arrow opens everything else Otto has worked out; each row can be pinned with its own value, or handed back to learning. That replaced the long dropdown.
- **"Try to move towards"**: for time settings you can name a target without overwriting reality. Set the lunch slump from 45 minutes to 15 and Otto keeps planning with the true value, but gives you a nudge at lunch: *"Freshen up!! You promised you would stop your doomscroll in 15 min this time!"*
- **"How you work"** started as a block of text per pattern. It is now a **table**: pattern, a short reading, and a **confidence pill**. Green means Otto is confident (a dozen or more data points), yellow is an early read ("I need more data, but here is what I think"), grey means still learning, and grey rows stay hidden until you open them. The surest findings sit at the top.

| Before: Rules | Before: patterns as paragraphs | Now: Rules | Now: confidence pills |
|---|---|---|---|
| ![](screenshots/before/rules-with-priority-form.png) | ![](screenshots/before/how-you-work-text-version.png) | ![](screenshots/current/27-rules.png) | ![](screenshots/current/28-stats.png) |

![rules reveal](gifs/rules-reveal.gif)

![how you work](gifs/how-you-work.gif)

![rules before after](gifs/rules-before-after.gif)

![how you work before after](gifs/how-you-work-before-after.gif)

### 9.11 The one AI feature: the goal wizard

Because this is the only place a model decides anything, its interface is the most careful. The tracker shows progress against where the plan says you should be, with milestones, a chart and detours logged as a kind and a sentence (never as a number of days lost, which Otto works out itself). The wizard's advice appears as **proposed changes** that nothing applies until you press a button; a major change shows what would be replaced and needs an extra confirmation, and every apply has an undo. Advice that the model gave in prose with no matching action is listed under **"Also mentioned"** and never hidden. A **sample review** with made-up data lets you see all of it without spending an AI call.

| Before: goals as progress bars | Now: tracker with a sample review open |
|---|---|
| ![](screenshots/before/goals-hackathon.png) | ![](screenshots/current/24-goals-wizard-sample.png) |

![goal wizard](gifs/goal-wizard.gif)

![goals before after](gifs/goals-before-after.gif)

---

## 10. Entry: the refactor (from a rushed hackathon build to something I could stand behind)

The hackathon code was written fast, by several people, to a deadline. By the end it contained dead code, mock data standing in for real data, overlapping features, and the scars of merge conflicts.

What changed:

- **Removed:** Exa (live web search), the Telegram bot and the Zo agent (a 446-line file), the hosting plan around Zo Computer, and dead database code. All three of those services were there because the brief asked for them. None of them was something the calendar needed, and each was an extra key, an extra failure mode and an extra thing to explain.
- **Replaced mock data with real data** end to end, and persisted it.
- **Reorganised the backend** into `engine/` (pure logic), `llm/`, `sources/`, and thin endpoints.
- **Added accounts and hosting groundwork:** Google sign-in through Supabase Auth, each person's data kept separate, a Postgres-backed store on Supabase, a Dockerfile and a Render blueprint. Supabase is Postgres underneath; at the moment the app uses it as a document store (one JSONB table), not a set of relational tables.
- **Code size now:** about 6,200 lines of backend, about 9,700 lines of frontend logic and screens, about 3,400 lines of backend tests, and about 58 API endpoints.

---

## 11. The product today

Six screens and a handful of focused flows:

- **Now:** today in order, capture, goals needing attention, deadline radar, "I started late" and "I'm overwhelmed".
- **Calendar:** week, two-week and month; drag, link, repeat, edit; clear-this-time with a before/after proposal; "make room"; Meatball Grinder.
- **Goals:** milestones, planned vs actual, detours (inferred, never typed in as day counts), the review wizard.
- **Stats:** the week in numbers, an honest recap, what Otto learned, **how you work** (nine behaviour patterns with confidence), past check-ins.
- **Priorities:** three importance cards with tiers.
- **Rules:** everything Otto has learned, how the scheduler uses it, pin or "try to move towards" with a lunch reminder.

**[ADD: demo link and a short screen recording once it is hosted. At the time of writing, the hosting setup is prepared but not yet deployed.]**

---

## 12. Testing

548 automated tests: 332 backend (pytest) and 216 frontend (Node's test runner), all written alongside the features. They are mostly unit tests of the pure logic, plus API tests that send real requests through the whole backend. The AI, the clock and storage are faked, so they are fast, free and repeatable.

White-box tests know the formulas and thresholds (scheduler, learning, patterns). The API tests lean black-box (request in, response out). There are no browser end-to-end tests; the screens were checked by hand. Full details, file by file, in [`TESTING.md`](../TESTING.md).

A habit worth keeping: when a bug was reported, I first wrote a test that fails because of it, then fixed the code. The "block fits the gap as planned" test came from exactly that.

---

## 13. Entry: the demo, and keeping the AI bill sane

Putting an AI feature behind a public link means someone else can spend your money. So the AI is gated:

- **One free goal-review (wizard) call per account**, on my key. Nothing else on my key.
- A **daily cap** across everyone (30 calls) so many new accounts cannot run up a bill.
- A person can paste **their own OpenAI key**. It is checked with OpenAI, stored encrypted, never shown again, and used for all AI features instead of mine. A rate limit (10 a minute) applies.
- Without a key the weekly chat and recap fall back to keyword reading and plain text, so the app is useful with no AI at all.
- Legacy endpoints that would have used my key unmetered were switched off when login is on.

There is also a no-AI "sample review" in Goals that shows the wizard's screens on made-up data, which works as a demo that costs nothing.

---

## 14. Then vs now

| | Hackathon version | Now |
|---|---|---|
| **Idea** | Job-application prep planner | A calendar that learns how you work |
| **Scheduling** | Greedy weighted, first an LLM per change | Deterministic engine, ripple rescheduling, learned per-user parameters |
| **AI** | Parsing, search, narration, rescheduling, direction review, Telegram alerts | One feature that needs it (goal review), plus optional helpers with non-AI fallbacks |
| **External services** | OpenAI, Exa, Zo, Telegram, Supabase, Google Calendar | OpenAI (gated), Supabase (storage and sign-in), Google Calendar (optional, read-only) |
| **Dates** | Day of the month | Real dates (days since 1970) |
| **Data** | Small relational-style model for jobs | Profile + JSON documents per key, per user |
| **Auth** | None | Google sign-in, per-user data |
| **Tests** | 5 | 548 |
| **Trust** | "The AI said so" | Every change shown first, undoable, explainable |

**What I would do differently next time**

1. **Decide where AI belongs before writing code**, with a table like the one in section 4, not after.
2. **Design the date model first.** It cost me the most rework.
3. **Build the screen with the signal**, not weeks later.
4. **Write the use case and a "this is what done looks like" page before the hackathon**, so the brief's tools are chosen to serve it and not the other way round.
5. **Use proper tables for the calendar** from the start of a real build, and keep documents for settings only.
6. **Agree a branching rule in a team build** (no force-push, small PRs) before hour one.
7. **Freeze the clock in tests** from the first test.

---

## 15. Areas for improvement (AFI) / kept in view

**Things I deliberately have not built yet:**

- **Caching.** Scheduler result caching, ETags and conditional requests, caching AI answers by input, a shared cache (Redis) if it ever has many users.
- **A relational schema.** Events, goals and links as real tables with per-row security, instead of one JSON blob per key, so the database can enforce integrity and answer questions.
- **Acting on the new patterns.** The nine behaviour patterns are measured and shown, but the scheduler does not yet use them (for example, leave room after hard blocks, start deadline work earlier if pressure slows you).
- **Real end-to-end tests** in a browser, a coverage report, and a live test against Supabase and Google Calendar with real keys.
- **Hosting and a demo link.** The container and blueprint are ready; it still needs deploying and testing in the wild.
- **Goal progress by hours**, not only by finished steps.
- **Month-scale goal planning** (the planner currently looks at two weeks), a post-session "after action" panel, confirmed/tentative events, travel time.
- **A screen-time signal** (a browser extension is the realistic source), notifications, a mobile layout, onboarding.
- **AI cost controls:** trying a cheaper model for the chat and wizard, and logging spend per user.
- **Known rough edges:** an occurrence of a repeating event that is parked in the Meatball Grinder comes back; double-click to edit is unreliable (the pencil is dependable).

---

## 16. The takeaway

> **Before adding AI to something, step back and ask: will this actually bring value?**

Everyone is eager to ship "AI powered". It is easy to bolt a model onto every feature because you *can*, and the demo looks impressive. But each model call costs time, money and predictability, and many problems that look like they need intelligence are really rules and arithmetic that you can write once, test, explain and run in milliseconds.

For Otto, that meant removing most of the AI I had put in, and keeping it for the one place where nothing else would do. The product got faster, cheaper, more trustworthy and easier to explain, and the AI that remained did a job that mattered.
