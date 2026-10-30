// Deadline radar: everything with a date on it, from three places that never meet on the calendar —
// event deadlines, goal milestones and "remind me" items — in one list, most urgent first.
import { daysBetween } from '../views/goals/goalMath.js';

export function buildRadar({ events = [], goals = [], reminders = [], today, limit = 7 }) {
  const rows = [];
  for (const e of events) {
    if (!e.deadline_iso || e.reflection?.choice) continue;
    rows.push({ key: `e${e.id}`, kind: 'event', title: e.title.replace(/ \(\d+\/\d+\)$/, ''), due: e.deadline_iso.slice(0, 10), sub: e.hard_deadline === false ? 'best done by' : 'deadline' });
  }
  for (const g of goals) {
    for (const m of g.milestones || []) {
      if (m.done || !m.due) continue;
      rows.push({ key: `m${g.id}${m.id}`, kind: 'milestone', title: m.title, due: m.due.slice(0, 10), sub: g.title });
    }
  }
  for (const r of reminders) {
    if (r.done || !r.due) continue;
    rows.push({ key: `r${r.id}`, kind: 'reminder', title: r.text, due: r.due, sub: r.repeat ? `repeats ${r.repeat}` : 'reminder' });
  }
  // the same thing entered twice (an event and a reminder with one title and date) shows once
  const seen = new Set();
  return rows
    .map(r => ({ ...r, days: daysBetween(today, r.due) }))
    .filter(r => { const k = `${r.title.toLowerCase()}|${r.due}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.days - b.days)
    .slice(0, limit);
}

export const radarTone = days => (days < 0 ? 'overdue' : days <= 3 ? 'soon' : 'later');
