// The numbers and the one task for the top of the home page.

// A block counts as finished once it is ticked or has been reflected on.
export const isDone = e => !!(e.done || e.reflection?.choice);
// A flexible block whose time has passed without being ticked: missed (shown struck through in red).
export const isMissed = (e, nowMin) => !e.fixed && !isDone(e) && e.startMin + e.durationMin <= nowMin;

// today's blocks in time order
export const todaysBlocks = (events, day) => events.filter(e => e.day === day).sort((a, b) => a.startMin - b.startMin);

// "3 events, 2 tasks, 0 hard deadlines": events = fixed things (meetings, calls), tasks = flexible blocks still to do,
// hard deadlines = things due today (overdue ones are counted apart)
export function todaySummary({ events = [], radar = [], day, nowMin }) {
  const mine = todaysBlocks(events, day);
  return {
    events: mine.filter(e => e.fixed).length,
    tasks: mine.filter(e => !e.fixed && !isDone(e)).length,
    hard: radar.filter(r => r.days === 0).length,
    overdue: radar.filter(r => r.days < 0).length,
    upcoming: mine.filter(e => e.startMin + e.durationMin > nowMin && !isDone(e)).slice(0, 4),
  };
}

// The block happening now, else the next flexible one today. -> { state: 'now' | 'next', event } | null
export function currentTask({ events = [], day, nowMin }) {
  const mine = todaysBlocks(events, day).filter(e => !e.fixed && !isDone(e));
  const now = mine.find(e => e.startMin <= nowMin && nowMin < e.startMin + e.durationMin);
  if (now) return { state: 'now', event: now };
  const next = mine.find(e => e.startMin > nowMin);
  return next ? { state: 'next', event: next } : null;
}

// what to show under the title: the planned subtasks and any checklist items, in one list
export function planItems(ev) {
  const subs = (ev.subtasks || []).map(s => ({ id: `s:${s.id}`, text: s.name, minutes: s.minutes, done: !!s.done, source: 'subtask', key: s.id }));
  const checks = (ev.checklist || []).map(c => ({ id: `c:${c.id}`, text: c.text, minutes: null, done: !!c.done, source: 'checklist', key: c.id }));
  return [...subs, ...checks];
}

// tick one of those items
export function toggleItem(events, evId, item) {
  return events.map(e => {
    if (e.id !== evId) return e;
    if (item.source === 'subtask') return { ...e, subtasks: e.subtasks.map(s => (s.id === item.key ? { ...s, done: !s.done } : s)) };
    return { ...e, checklist: e.checklist.map(c => (c.id === item.key ? { ...c, done: !c.done } : c)) };
  });
}
