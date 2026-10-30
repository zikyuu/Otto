// Editing a proposed arrangement by hand before it is applied. Pure functions over the proposal Otto made: the person drags a
// block in the "After" view, this records the move and says what it would break. Nothing here talks to the server, and a
// problem never blocks Apply: it is shown so the person decides.

// the proposal with one block moved; `edited` remembers which blocks the person placed (so they can be reset)
export function moveInProposal(proposal, id, day, startMin) {
  const edited = new Set(proposal.edited || []);
  edited.add(id);
  return { ...proposal, edited, events: proposal.events.map(e => (e.id === id ? { ...e, day, startMin } : e)) };
}

// back to exactly what Otto proposed (every edit, or just one block)
export function resetEdits(proposal, id = null) {
  const base = new Map((proposal.original || proposal.events).map(e => [e.id, e]));
  const edited = new Set(proposal.edited || []);
  if (id) edited.delete(id); else edited.clear();
  return {
    ...proposal, edited,
    events: proposal.events.map(e => ((id ? e.id === id : edited.size === 0 || !edited.has(e.id)) && base.has(e.id) && (!id || e.id === id) ? { ...e, day: base.get(e.id).day, startMin: base.get(e.id).startMin } : e)),
  };
}

const hit = (a, b) => a.day === b.day && a.startMin < b.startMin + b.durationMin && b.startMin < a.startMin + a.durationMin;

// what the arrangement breaks, for the blocks that changed or were edited: { id, kind, text }
//   overlap  sits on another block        order  starts before something it must follow        window  sits in time that was cleared
export function problemsOf(events, { windows = [], changed = new Set(), edited = new Set() } = {}) {
  const by = Object.fromEntries(events.map(e => [e.id, e]));
  const focus = new Set([...changed, ...edited]);
  for (const e of events) if ((e.prereq_ids || []).some(p => focus.has(p))) focus.add(e.id);      // what waits for a moved block
  const out = [];
  for (const e of events) {
    if (!focus.has(e.id)) continue;
    for (const o of events) {
      if (o.id === e.id || !hit(e, o)) continue;
      if (focus.has(o.id) && o.id < e.id) continue;                      // report a pair once
      out.push({ id: e.id, kind: 'overlap', text: `${e.title} overlaps ${o.title}.` });
    }
    for (const pid of e.prereq_ids || []) {
      const p = by[pid];
      if (p && (e.day < p.day || (e.day === p.day && e.startMin < p.startMin + p.durationMin))) out.push({ id: e.id, kind: 'order', text: `${e.title} starts before ${p.title}, which it must follow.` });
    }
    if (!e.fixed && windows.some(w => w.day === e.day && e.startMin < w.end && w.start < e.startMin + e.durationMin)) {
      out.push({ id: e.id, kind: 'window', text: `${e.title} is back inside the time you cleared.` });
    }
  }
  return out;
}
