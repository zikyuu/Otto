// Per-event checklists and carry-over. An event may carry `checklist: [{id, text, done}]`. When the block is over
// and items are still open, Otto asks once whether to give them a new slot ("2 items unfinished, add to a new slot?").
// Pure functions: nothing here touches React or the clock unless asked to.

let seq = 0;
const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

export const items = ev => (Array.isArray(ev?.checklist) ? ev.checklist : []);
export const openItems = ev => items(ev).filter(i => !i.done);
export const doneCount = ev => items(ev).filter(i => i.done).length;

const withList = (events, id, fn) => events.map(e => (e.id === id ? { ...e, checklist: fn(items(e)) } : e));

export const addItem = (events, id, text) => {
  const t = String(text || '').trim().slice(0, 120);
  return t ? withList(events, id, list => [...list, { id: newId(), text: t, done: false }]) : events;
};
export const toggleItem = (events, id, itemId) => withList(events, id, list => list.map(i => (i.id === itemId ? { ...i, done: !i.done } : i)));
export const removeItem = (events, id, itemId) => withList(events, id, list => list.filter(i => i.id !== itemId));

// how long the unfinished part is worth: the share of the block the open items stand for, at least 15 minutes
export function carryMinutes(ev) {
  const list = items(ev);
  if (!list.length) return 0;
  const share = openItems(ev).length / list.length;
  return Math.max(15, Math.round((ev.durationMin * share) / 5) * 5);
}

// blocks that are over, have open items, and have not been dealt with. `isPast` is the page's own notion of "over".
export function carryOverCandidates(events, isPast) {
  return events.filter(e => items(e).length > 0 && openItems(e).length > 0 && !e.carry_over && isPast(e));
}

export const summary = ev => {
  const n = openItems(ev).length;
  return `${n} item${n === 1 ? '' : 's'} unfinished`;
};
