# GitHub issues to open tonight (paste each as an issue, assign tomorrow)

Open these so tomorrow you assign-and-go instead of planning. Suggested labels
in [brackets]. The engine ones are mostly DONE — left as verification tasks.

---

### [engine] Verify + extend scheduler  ✅ mostly done
The greedy weighted scheduler with prereq ordering is built and tested
(`tests/test_engine.py` passes). Tomorrow: stress-test with more goals, tune
importance weighting (fit × deadline-urgency), confirm re-solve <100ms.
Stretch: swap greedy core for a real constraint solver — interface unchanged.

### [engine] Velocity model from completion history
Right now `profile.velocity` is a seeded constant. Replace with a rolling
completion rate computed from `CompletionEvent`s. Keep it simple (rolling avg);
the behaviour matters more than the model. Feeds the feasibility check.

### [llm] Wire OPENAI_API_KEY + tune extraction
Set the key tomorrow. Test `parse_resume` and `parse_jd` on the real demo
résumé/JD; make sure `required_skills` come out in the lowercase vocabulary the
gap engine knows (`data structures`, `system design`, etc.). Tune prompts.

### [llm] Coach chat narration quality
`/api/chat` + `narrate()` work. Improve the tone: calm, concrete, names what
moved and why, protects momentum. Test the "I'm behind, reshuffle" path.

### [frontend] Re-solve signature animation
WeekGrid blocks already transition on `top`. Make the re-solve visceral:
when blocks move, ensure the motion reads clearly (stagger? highlight moved
blocks?). This is THE memorable moment — spend polish here.

### [frontend] Setup screen: wall editor
Walls load from demo data. Add a small UI to add/remove fixed blocks
(day, start, end, label) so a judge can edit the week live.

### [frontend] Tradeoff + recovery screen polish
The amber tradeoff card renders. Make the "choose one" interaction commit a
choice (drop the other goal's tasks, re-solve). This is demo moment #2.

### [adapter] Google Calendar read-only sync  [stretch]
Implement `GoogleCalendarSource.walls()`. OAuth, pull busy-blocks, map to
Wall[]. READ ONLY. Only after core is done; hard time-box; drop without regret.

### [adapter] Exa job-match gesture  [stretch]
Implement `ExaJobSource.goals()`. Light "roles matching your résumé" via Exa
semantic search. NOT the focus. Time-box 2h max.

### [demo] Write + rehearse the demo script
Lock the résumé + JD (deliberate skill gap — done in demo.json). Rehearse the
two moments end to end. Prepare the one-line pitch: "'Sup tells you which jobs
to chase; we make sure you chase them with the right work at a pace you can
sustain."
