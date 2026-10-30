# Otto: every UI change, with before and after

How this was put together:

- **"After" screenshots** are the app running locally, with a seeded demo profile and a pretend "now" of **Thursday 15 Oct 2026, 13:24**, so every screen shows the same week. Files are in [`screenshots/current/`](screenshots/current/).
- **"Before" screenshots** are earlier versions of the app, checked out from git history and run the same way. Files are in [`screenshots/before/`](screenshots/before/). The stages are: **hackathon** (the cream and brown card UI), **third** (dark forest sidebar, parchment, serif headings) and **fourth** (the Plus Jakarta Sans "double bezel" redesign).
- The list is rebuilt from your requests in this project and from `OTTO_CONTEXT.md`, so a tiny tweak from early on may be missing. Items marked **★** have a before/after pair.

---

## The list (pick the ones you want in the deep dive)

### Look and feel
1. **★ A generic app look becomes a place: the forest cabin.** Pine, kombu, moss, brandy and pale copper (`#202808 #33432B #6A784D #DEC59E #C4866D`), Fredoka for headings and big numbers, Nunito for body.
2. **Redesigns you rejected on the way.** The flat minimalist attempt was dropped; plain geometric sans ("looks vibe-coded") was rejected; the otter stays.
3. **Component language.** Double-bezel cards, pill buttons with an icon island, segmented controls, a wooden plaque on the sidebar, a yellow sticky note, scenic page banners.
4. **Sidebar.** Floating dark panel, collapsed to icons by default and opened by clicking (hover-to-expand was rejected). Priorities and Rules were added later.
5. **The otter has moods.** Reading in the sidebar, sad on a late start, panicked when overwhelmed, a wizard on the goals page.
6. **Big-number stat cards, a "this week" node timeline, workload bars and a sticky current-task note** (borrowed from the references you sent).

### Home (Now)
7. **★ Home as a decision dashboard.** Today's schedule sits inside the welcome banner ("0 events, 3 tasks, 0 hard deadlines"); "Today, in order" highlights the current block as *up next*, and a missed block is struck through in red.
8. **★ "I fell behind" is split in two:** **I started late** and **I'm overwhelmed**.
9. **Remind me** (one box that reads "pay rent by friday"), a **Deadline radar**, and a **Wrap up the day** card.
10. **"This week's load" removed.** In its place, "These goals need attention", or "All goals on track" when none do.
11. **Severity on goals.** One to three warning triangles (yellow, orange, red) and "Find time" buttons coloured to match; a catch-up request for every goal that is behind.
12. **"Find time" opens the calendar planner**, with draggable session suggestions and a plain-language reason for each.
13. **The "Try the 11am demo" button** was added to test late starts, then removed.

### Calendar
14. **Click an empty slot** for a ghost block and an Apple-Calendar-style popup, with a discard confirmation.
15. **Event chips.** Drag the edges to resize, the grip to move; hover shows nodes (delete beside the chip, lock, link, edit pencil); delete asks first, beside the chip.
16. **The drag bug.** The top handle used to flatten an event to 15 minutes when the grid was scrolled.
17. **★ Event creation.** A basic popup plus an *Advanced planning* two-pane sheet: steps with a ring chart, pins, lasso grouping, an "in order" switch, hard/soft deadlines, best-done-by.
18. **Cleanups.** QuickAdd and EventCreation merged; the lock relabelled **Must-do**; colour means category only; the difficulty stars were dropped.
19. **★ Month, 2 weeks and Week**, with real dates; the week follows today.
20. **The 24-hour grid with sleep folded away.** Only waking hours show by default, arrows open the rest, sleep bands can be dragged, and work pushed into sleep is flagged "sleep time".
21. **Links.** Drag from the node on an event to another event (ordered or grouped), bezier lines, a links panel, a long-press highlight, and a "make room" suggested window.
22. **★ Reschedule mode.** The page dims, you drag windows across the grid, choose how partly covered events are cut, and review a **Current / New** compare. You can drag blocks in the proposal and press "Apply my version".
23. **Reflection panel.** Five choices ("Nailed it", "Harder than expected", "Gap", "Interrupted", "Outlier"), a meter per subtask, off-track labels, checklist carry-over.
24. **Meatball Grinder.** The name replaced "Grinder" everywhere; the panel nudges after five days (Keep, Delete, Someday).
25. **Motion.** Moved events spring in from where they were, a short "thinking" beat with the otter, and a summary toast.
26. **Repeat, edit and goal link.** A Repeat control, an edit pencil on hover, and a "Counts towards" goal picker.

### Goals
27. **★ Mock goal cards become a checklist tracker.** Milestones with effort, a plan-against-reality chart, detours logged without day counts, and plain-language insights.
28. **The wizard review.** Proposed changes with approval gates, a "this changes the direction of the plan" warning, "Also mentioned" for advice that has no matching action, and a **sample review** with no AI call.

### Stats
29. **★ Stats restyled.** Stat cards, bars by kind of work, the yellow recap note, "What Otto learned".
30. **"How you work" table.** Pattern, short reading, a confidence pill (green confident, yellow early read, grey still learning, hidden until opened).
31. **Past check-ins.** A short note of what you decided, not the conversation.

### Recovery and late start
32. **Late start.** From one draggable line to a choice per task (Today, Tomorrow, **Meatball Grinder**, Drop); work that has passed is greyed out; tasks are tinted red, yellow or green by importance; the stray `}` was removed.
33. **Plans open on the calendar.** Late start, overwhelmed and Priorities all show their plan on the calendar with a **Current / New** toggle, drag-to-adjust and an Apply button.
34. **★ "I'm overwhelmed" rebuilt.** Ranked by importance, split into "Due soon" and "Has to happen eventually", an "I only want to work __ hours" box, and three views (Current plan, Otto's suggestion, Rest today) with a "pull through today" warning when resting is not possible.
35. **Weekly check-in chat.** Otto proposes settings, you tick the ones you agree with, nothing changes until Apply.

### New pages and pop-ups
36. **Priorities.** Three cards (Important, Good to accomplish, Whatever) with ranked tiers; drag to re-sort; a new tier can be inserted between two others by holding a dragged card over the gap; repeats and same-named events are one card.
37. **Rules rebuilt.** Your pinned rules first; a "Show N" arrow for everything Otto has worked out; short names with one-line meanings; each setting shows where it came from and how the scheduler uses it, and can be pinned or given a "try to move towards" target.
38. **"Two things cannot both fit".** A pop-up that asks you which matters more instead of letting the scheduler guess.
39. **Lunch reminder.** "Freshen up!! You promised you would stop your doomscroll in 15 min this time!" (not shown in a screenshot: it only appears 12:30 to 15:00 when a target is set).
40. **Login screen, "AI features" key panel and sign out.**

---

## Before and after pairs

### 1. The look: hackathon, then the middle versions, then now
| Hackathon | Third | Fourth | Now |
|---|---|---|---|
| ![](screenshots/before/home-hackathon.png) | ![](screenshots/before/home-third.png) | ![](screenshots/before/home-fourth.png) | ![](screenshots/current/04-home.png) |

### 2. Calendar
| Hackathon (week) | Fourth (week) | Now (week) |
|---|---|---|
| ![](screenshots/before/calendar-week-hackathon.png) | ![](screenshots/before/calendar-week-fourth.png) | ![](screenshots/current/05-calendar-week.png) |

### 3. Event creation
| Fourth | Now: basic | Now: advanced |
|---|---|---|
| ![](screenshots/before/event-popup-fourth.png) | ![](screenshots/current/10-event-create-basic.png) | ![](screenshots/current/11-event-create-advanced.png) |

### 4. Goals
| Hackathon | Now (tracker with a sample review open) |
|---|---|
| ![](screenshots/before/goals-hackathon.png) | ![](screenshots/current/24-goals-wizard-sample.png) |

### 5. Stats
| Hackathon | Now |
|---|---|
| ![](screenshots/before/stats-hackathon.png) | ![](screenshots/current/28-stats.png) |

### 6. "I fell behind" to "I'm overwhelmed"
| Before (hackathon "I fell behind") | Now: the page | Now: the plan on the calendar |
|---|---|---|
| ![](screenshots/before/fell-behind-hackathon.png) | ![](screenshots/current/20b-overwhelmed-deadlines.png) | ![](screenshots/current/21-overwhelmed-plan-suggested.png) |

---

## The rest of the gallery (no "before": these did not exist)

### Home and late start
| | |
|---|---|
| Late start, per-task choices, importance colours, passed work greyed | ![](screenshots/current/01-late-start-modal.png) |
| The late-start plan on the calendar, **New** | ![](screenshots/current/02-late-start-plan-new.png) |
| The same plan, **Current** | ![](screenshots/current/03-late-start-plan-current.png) |

### Calendar
| | |
|---|---|
| Hover nodes on an event (delete, lock, link, edit) | ![](screenshots/current/06-event-hover-nodes.png) |
| Sleep hours folded away, opened | ![](screenshots/current/07-calendar-sleep-hours.png) |
| Two weeks | ![](screenshots/current/08-calendar-two-weeks.png) |
| Month | ![](screenshots/current/09-calendar-month.png) |
| Per-block goals panel | ![](screenshots/current/12-event-panel-goals.png) |
| Reflection panel | ![](screenshots/current/13-reflection.png) |
| An ordered link and its panel | ![](screenshots/current/14-links-panel.png) |
| Reschedule: marking time to clear | ![](screenshots/current/15-reschedule-select.png) |
| Reschedule: how partly covered events are cut | ![](screenshots/current/16-reschedule-clip.png) |
| Reschedule proposal, **New** | ![](screenshots/current/17-reschedule-diff-new.png) |
| Reschedule proposal, **Current** | ![](screenshots/current/18-reschedule-diff-current.png) |
| Meatball Grinder | ![](screenshots/current/19-meatball-grinder.png) |

### "I'm overwhelmed"
| | |
|---|---|
| Rest-day view | ![](screenshots/current/22-overwhelmed-plan-rest-day.png) |
| "Otto suggests you pull through today" | ![](screenshots/current/23b-overwhelmed-pull-through-warning.png) |
| "Two things cannot both fit" (importance conflict) | ![](screenshots/current/24b-importance-conflict.png) |

### Goals, Stats, Priorities, Rules
| | |
|---|---|
| Goals tracker | ![](screenshots/current/23-goals.png) |
| Priorities | ![](screenshots/current/25-priorities.png) |
| Priorities: a new tier opens between two others | ![](screenshots/current/26-priorities-insert-tier.png) |
| Rules | ![](screenshots/current/27-rules.png) |
| Weekly check-in | ![](screenshots/current/29-weekly-checkin.png) |

### Accounts
| | |
|---|---|
| Login | ![](screenshots/current/30-login.png) |
| AI features key panel (bottom of Rules, shown when login is on) | ![](screenshots/current/31-rules-ai-key.png) |
