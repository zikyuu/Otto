// Small numbers about today, from the calendar events (day = date of month, minutes since midnight).

// minutes between `now` and the end of the day that no event covers (overlaps are counted once)
export function freeMinutesLeft(events, day, nowMin, dayStart = 8 * 60, dayEnd = 23 * 60) {
  const from = Math.max(nowMin, dayStart);
  if (dayEnd <= from) return 0;
  const spans = events.filter(e => e.day === day)
    .map(e => [Math.max(e.startMin, from), Math.min(e.startMin + e.durationMin, dayEnd)])
    .filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  let busy = 0, cursor = from;
  for (const [a, b] of spans) {
    const s = Math.max(a, cursor);
    if (b > s) { busy += b - s; cursor = b; }
  }
  return dayEnd - from - busy;
}

// the next event today that has not started, or null
export function nextEvent(events, day, nowMin) {
  return events.filter(e => e.day === day && e.startMin > nowMin).sort((a, b) => a.startMin - b.startMin)[0] || null;
}
