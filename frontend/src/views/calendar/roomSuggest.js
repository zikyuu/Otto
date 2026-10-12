// "Make room": when an event has to wait for others but there is no free time before it, suggest which block of time
// to clear. Pure; the page lets the user stretch or shrink what this proposes.
//
// Idea: the prerequisites (and their own prerequisites) that still end after the dependent starts need `need` minutes
// before it. Walk back from the dependent's start, first over the rest of its own day, then over the working hours of
// the days before. Locked events and time that has passed can't be cleared, so they don't count. Stop as soon as
// enough clearable time is covered, so the window is as small as it can be.

const SNAP = 15;
const BUFFER = 1.15;                                   // the scheduler pads tasks (pace + ramp-up), so ask for a little more

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const roundUp = (n, to) => Math.ceil(n / to) * to;

export function prereqClosure(events, id) {
  const by = new Map(events.map(e => [e.id, e]));
  const seen = new Set();
  const stack = [...(by.get(id)?.prereq_ids || [])];
  while (stack.length) {
    const i = stack.pop();
    if (seen.has(i) || !by.has(i)) continue;
    seen.add(i);
    stack.push(...(by.get(i).prereq_ids || []));
  }
  return seen;
}

// events        every event
// dependentId   the event that is in front of what it waits for
// weekDayNums   date-of-month numbers of the visible days, in order
// earliestFree  (dayNum) => first minute that can still be changed that day (DAY_END if the whole day has passed)
export function suggestRoom({ events, dependentId, weekDayNums, earliestFree, dayStart = 480, dayEnd = 1380 }) {
  const D = events.find(e => e.id === dependentId);
  if (!D) return { windows: [], need: 0, enough: false };
  const di = weekDayNums.indexOf(D.day);
  if (di < 0) return { windows: [], need: 0, enough: false };

  const closure = prereqClosure(events, dependentId);
  const movable = events.filter(e => closure.has(e.id) && !e.fixed);
  // only what still sits at or after the dependent's start has to be re-placed
  const late = movable.filter(e => {
    const di2 = weekDayNums.indexOf(e.day);
    return di2 > di || (di2 === di && e.startMin + e.durationMin > D.startMin);
  });
  const need = roundUp(late.reduce((a, e) => a + e.durationMin, 0) * BUFFER, SNAP);
  if (need === 0) return { windows: [], need: 0, enough: true };

  // time in [a, b) on `day` that cannot be cleared: locked events
  const locked = (day, a, b) => events
    .filter(e => e.day === day && e.fixed && !closure.has(e.id) && e.id !== dependentId)
    .reduce((s, e) => s + overlap(a, b, e.startMin, e.startMin + e.durationMin), 0);

  const windows = [];
  let remaining = need;

  // 1. the rest of the dependent's own day, before it starts
  {
    const floor = Math.max(dayStart, earliestFree(D.day));
    const end = D.startMin;
    if (end - floor >= SNAP) {
      let start = end;
      while (start - SNAP >= floor && remaining > 0) {
        const step = Math.min(SNAP, end - start + SNAP);
        const take = SNAP - locked(D.day, start - SNAP, start);
        start -= SNAP;
        remaining -= Math.max(take, 0);
        void step;
      }
      if (start < end) windows.push({ day: D.day, start, end });
    }
  }

  // 2. the days before, latest part of each day first
  for (let i = di - 1; i >= 0 && remaining > 0; i--) {
    const day = weekDayNums[i];
    const floor = Math.max(dayStart, earliestFree(day));
    if (dayEnd - floor < SNAP) continue;                     // that day is over
    let start = dayEnd;
    while (start - SNAP >= floor && remaining > 0) {
      start -= SNAP;
      remaining -= Math.max(SNAP - locked(day, start, start + SNAP), 0);
    }
    if (start < dayEnd) windows.push({ day, start, end: dayEnd });
  }

  return { windows, need, enough: remaining <= 0 };
}
