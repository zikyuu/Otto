// End of day: what is done, what was never told how it went, and what tomorrow opens with. Shown from 5pm.

export const WRAP_FROM_MIN = 17 * 60;

export function wrapUp({ events = [], tasks = [], today, tomorrow, nowMin }) {
  const ended = events.filter(e => e.day === today && !e.fixed && e.startMin + e.durationMin <= nowMin);
  const unreflected = ended.filter(e => !e.reflection?.choice);
  const first = events.filter(e => e.day === tomorrow).sort((a, b) => a.startMin - b.startMin)[0] || null;
  return {
    show: nowMin >= WRAP_FROM_MIN,
    doneTasks: tasks.filter(t => t.checked).length,
    openTasks: tasks.filter(t => !t.checked),
    unreflected,
    reflected: ended.length - unreflected.length,
    tomorrowFirst: first,
  };
}

// one tap, no meters: the three answers that cover most days
export const QUICK = [
  { choice: 'nailed', label: 'As planned' },
  { choice: 'harder', label: 'Took longer' },
  { choice: 'interrupted', label: 'Did not happen' },
];

// -> { reflection, actualMin }; the learning loop gets planned vs actual minutes
export function quickReflection(ev, choice, now = Date.now()) {
  const actualMin = choice === 'nailed' ? ev.durationMin : choice === 'harder' ? Math.round((ev.durationMin * 1.3) / 5) * 5 : 0;
  return { actualMin, reflection: { choice, actual: {}, notes: '', remainder: null, quick: true, at: now } };
}
