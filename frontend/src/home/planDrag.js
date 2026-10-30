// Moving a suggested session on the week grid before it is committed. Pure maths, no React.

// where a pointer lands: which column and which snapped start time, keeping the grab point under the cursor
export function dropTarget({ x, y, rect, numDays, pxPerMin, dayStart, dayEnd, grabMin = 0, duration, snap = 15 }) {
  const col = Math.max(0, Math.min(numDays - 1, Math.floor(((x - rect.left) / rect.width) * numDays)));
  const raw = dayStart + (y - rect.top) / pxPerMin - grabMin;
  const start = Math.round(raw / snap) * snap;
  return { col, startMin: Math.max(dayStart, Math.min(start, dayEnd - duration)) };
}

// what a session sits on top of: locked events and the other suggested sessions
export function clashes(session, events, sessions) {
  const hit = (a, b) => a.day === b.day && a.startMin < b.startMin + b.durationMin && b.startMin < a.startMin + a.durationMin;
  return [
    ...events.filter(e => e.fixed && hit(session, e)).map(e => ({ kind: 'locked', title: e.title })),
    ...sessions.filter(o => o.id !== session.id && hit(session, o)).map(o => ({ kind: 'session', title: o.title })),
  ];
}

// can a session go here? Not into a past day, not into the part of today that has gone.
export function allowed({ col, startMin }, { todayCol, nowMin }) {
  if (todayCol >= 0 && col < todayCol) return false;
  return !(col === todayCol && startMin < nowMin);
}
