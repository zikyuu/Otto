// Reschedule selection mode: the user drags out windows of time they want cleared. Pure helpers.

const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

// Snap a drag to the grid and make sure it is at least `min` long.
export function makeWindow(day, a, b, snap = 15, min = 15, lo = 0, hi = 1440) {
  let s = Math.round(Math.min(a, b) / snap) * snap;
  let e = Math.round(Math.max(a, b) / snap) * snap;
  if (e - s < min) e = s + min;
  s = Math.max(lo, s); e = Math.min(hi, e);
  return e - s >= min ? { day, start: s, end: e } : null;
}

// Overlapping / touching windows on the same day become one.
export function mergeWindows(windows) {
  const out = [];
  for (const w of [...windows].sort((a, b) => a.day - b.day || a.start - b.start)) {
    const last = out[out.length - 1];
    if (last && last.day === w.day && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else out.push({ ...w });
  }
  return out;
}

// How a window set cuts an event.
//   none     untouched
//   inside   completely covered — it has to move whole
//   clipped  part of it is covered; keep = the longest piece left outside, lost = minutes covered
export function clipInfo(ev, windows) {
  const ws = mergeWindows(windows.filter(w => w.day === ev.day));
  const s = ev.startMin, e = ev.startMin + ev.durationMin;
  const covered = ws.reduce((m, w) => m + overlap(s, e, w.start, w.end), 0);
  if (covered === 0) return { kind: 'none', lost: 0 };
  if (covered >= ev.durationMin) return { kind: 'inside', lost: ev.durationMin };
  // pieces of the event outside every window
  let cursor = s;
  const pieces = [];
  for (const w of ws) {
    if (w.end <= s || w.start >= e) continue;
    if (w.start > cursor) pieces.push([cursor, w.start]);
    cursor = Math.max(cursor, w.end);
  }
  if (cursor < e) pieces.push([cursor, e]);
  const [ks, ke] = pieces.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
  return { kind: 'clipped', keep: { start: ks, end: ke }, lost: ev.durationMin - (ke - ks) };
}

// Events the windows touch that the user is allowed to decide about (not locked).
export function affectedEvents(events, windows) {
  return events.filter(e => !e.fixed)
    .map(e => ({ ev: e, info: clipInfo(e, windows) }))
    .filter(x => x.info.kind !== 'none');
}

// choices: { [eventId]: 'whole' | 'cut' | 'split' } for clipped events (default 'whole').
//   whole  the whole event is re-placed outside the windows
//   cut    keep the part outside, drop the covered part
//   split  keep the part outside, re-place the covered part as its own event
export function applyClipChoices(events, windows, choices = {}) {
  const out = [];
  for (const e of events) {
    const info = e.fixed ? { kind: 'none' } : clipInfo(e, windows);
    const choice = choices[e.id] || 'whole';
    if (info.kind !== 'clipped' || choice === 'whole') { out.push(e); continue; }
    out.push({ ...e, startMin: info.keep.start, durationMin: info.keep.end - info.keep.start,
               ...(e.subtasks ? { subtasks: undefined } : {}) });
    if (choice === 'split') {
      out.push({ ...e, id: `${e.id}~rest`, title: `${e.title} (rest)`, startMin: e.startMin,
                 durationMin: info.lost, subtasks: undefined, prereq_ids: undefined, grouped_with: undefined });
    }
  }
  return out.map(e => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined)));
}

// Before/after, for the diff panel and the staggered animation.
export function diffEvents(before, after) {
  const b = new Map(before.map(e => [e.id, e]));
  const a = new Map(after.map(e => [e.id, e]));
  const out = [];
  for (const e of after) {
    const o = b.get(e.id);
    if (!o) { out.push({ id: e.id, title: e.title, kind: 'added', to: pick(e) }); continue; }
    const moved = o.day !== e.day || o.startMin !== e.startMin;
    const resized = o.durationMin !== e.durationMin;
    if (moved || resized) out.push({ id: e.id, title: e.title, kind: moved ? 'moved' : 'resized', from: pick(o), to: pick(e) });
  }
  for (const e of before) if (!a.has(e.id)) out.push({ id: e.id, title: e.title, kind: 'removed', from: pick(e) });
  return out;
}

const pick = e => ({ day: e.day, startMin: e.startMin, durationMin: e.durationMin });
