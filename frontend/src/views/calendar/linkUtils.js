// Event links, as plain data on the events themselves (no separate store to keep in sync):
//   ordered  event.prereq_ids   — this event can only start once every listed event has ended.
//                                 The scheduler already enforces it (and moves dependents).
//   grouped  event.grouped_with — symmetric, no order: shown together, never enforced.
// Everything here is pure so it can be tested without React.

export const ORDERED = 'ordered';
export const GROUPED = 'grouped';

const has = (events, id) => events.some(e => e.id === id);

// Every link once: { from, to, type }. For ordered, `to` waits for `from`.
export function getLinks(events) {
  const out = [];
  const by = new Map(events.map(e => [e.id, e]));
  for (const e of events) {
    for (const p of e.prereq_ids || []) {
      // an order-specific task chains its own sessions: that is the task's own structure, not a link the user drew
      if (e.split_of && by.get(p)?.split_of === e.split_of) continue;
      if (has(events, p)) out.push({ from: p, to: e.id, type: ORDERED });
    }
    for (const g of e.grouped_with || []) if (e.id < g && has(events, g)) out.push({ from: e.id, to: g, type: GROUPED });
  }
  return out;
}

// Does `id` wait (directly or not) on `onId`?
export function dependsOn(events, id, onId, seen = new Set()) {
  if (seen.has(id)) return false;
  seen.add(id);
  const e = events.find(x => x.id === id);
  return (e?.prereq_ids || []).some(p => p === onId || dependsOn(events, p, onId, seen));
}

export function linkExists(events, a, b, type) {
  return getLinks(events).some(l => l.type === type &&
    (type === GROUPED ? (l.from === a && l.to === b) || (l.from === b && l.to === a) : l.from === a && l.to === b));
}

// Why a link can't be made, or null if it can.
export function linkProblem(events, fromId, toId, type) {
  if (fromId === toId) return 'An event can\'t link to itself.';
  if (!has(events, fromId) || !has(events, toId)) return 'Both events must exist.';
  if (linkExists(events, fromId, toId, type)) return 'Those events are already linked.';
  if (type === ORDERED && dependsOn(events, fromId, toId)) return 'That would make a loop: the first event already waits on the second.';
  return null;
}

// New events array with the link added, or the same array if it isn't allowed.
export function addLink(events, fromId, toId, type) {
  if (linkProblem(events, fromId, toId, type)) return events;
  return events.map(e => {
    if (type === ORDERED && e.id === toId) return { ...e, prereq_ids: [...(e.prereq_ids || []), fromId] };
    if (type === GROUPED && e.id === fromId) return { ...e, grouped_with: [...(e.grouped_with || []), toId] };
    if (type === GROUPED && e.id === toId) return { ...e, grouped_with: [...(e.grouped_with || []), fromId] };
    return e;
  });
}

export function removeLink(events, a, b, type) {
  return events.map(e => {
    const next = { ...e };
    if (type === ORDERED && e.id === b) next.prereq_ids = (e.prereq_ids || []).filter(p => p !== a);
    if (type === GROUPED && (e.id === a || e.id === b)) {
      const other = e.id === a ? b : a;
      next.grouped_with = (e.grouped_with || []).filter(g => g !== other);
    }
    for (const k of ['prereq_ids', 'grouped_with']) if (next[k] && next[k].length === 0) delete next[k];
    return next;
  });
}

// When an event is deleted its links go with it.
export function dropEvent(events, id) {
  return events.filter(e => e.id !== id).map(e => {
    const next = { ...e };
    if (e.prereq_ids) next.prereq_ids = e.prereq_ids.filter(p => p !== id);
    if (e.grouped_with) next.grouped_with = e.grouped_with.filter(g => g !== id);
    for (const k of ['prereq_ids', 'grouped_with']) if (next[k] && next[k].length === 0) delete next[k];
    return next;
  });
}

// Everything connected to `id` by any link, itself included.
export function cluster(events, id) {
  const links = getLinks(events);
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.pop();
    for (const l of links) {
      const other = l.from === cur ? l.to : l.to === cur ? l.from : null;
      if (other && !seen.has(other)) { seen.add(other); queue.push(other); }
    }
  }
  return seen;
}

export const isLinked = (events, id) => getLinks(events).some(l => l.from === id || l.to === id);

// The ordered steps connected to `id`, first step first. Ties (independent steps) fall back to time.
export function orderedChain(events, id) {
  const ids = new Set();
  const queue = [id];
  const ord = getLinks(events).filter(l => l.type === ORDERED);
  while (queue.length) {
    const cur = queue.pop();
    if (ids.has(cur)) continue;
    ids.add(cur);
    for (const l of ord) { if (l.from === cur) queue.push(l.to); if (l.to === cur) queue.push(l.from); }
  }
  const members = events.filter(e => ids.has(e.id));
  const depth = {};
  const d = x => depth[x] ??= 1 + Math.max(-1, ...ord.filter(l => l.to === x).map(l => d(l.from)));
  members.forEach(m => d(m.id));
  const when = e => e.day * 1440 + e.startMin;
  return members.sort((a, b) => depth[a.id] - depth[b.id] || when(a) - when(b)).map(m => m.id);
}

// The user dragged the steps into a new order: make the chain run exactly that way.
// Links from outside the chain are kept; links between chain members are replaced by one step after another.
export function reorderChain(events, orderedIds) {
  const inChain = new Set(orderedIds);
  return events.map(e => {
    const i = orderedIds.indexOf(e.id);
    if (i < 0) return e;
    const outside = (e.prereq_ids || []).filter(p => !inChain.has(p));
    const prereqs = i === 0 ? outside : [...outside, orderedIds[i - 1]];
    const next = { ...e, prereq_ids: prereqs };
    if (!prereqs.length) delete next.prereq_ids;
    return next;
  });
}

// Cubic bezier between two points. Same-column links bulge out to the right so they don't cut through chips.
export function linkPath(x1, y1, x2, y2, sameColumn = false) {
  if (sameColumn) {
    const bulge = 38;
    return `M${x1},${y1} C${x1 + bulge},${y1} ${x2 + bulge},${y2} ${x2},${y2}`;
  }
  const k = Math.max(36, Math.abs(x2 - x1) * 0.45);
  const dir = x2 >= x1 ? 1 : -1;
  return `M${x1},${y1} C${x1 + dir * k},${y1} ${x2 - dir * k},${y2} ${x2},${y2}`;
}

export function pathMidpoint(x1, y1, x2, y2, sameColumn = false) {
  return sameColumn ? { x: (x1 + x2) / 2 + 28, y: (y1 + y2) / 2 } : { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}
