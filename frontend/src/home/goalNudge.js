// Goal nudge: the next milestone of a goal is coming up, and the calendar has little or no time for it.
// Booked time = events (anywhere in the loaded weeks) whose title shares a real word with the milestone or its goal.
import { daysBetween, milestoneFraction, progressPct, expectedPct, totalEffort, sortedMilestones } from '../views/goals/goalMath.js';
import { bookedMinutes, hoursLeft } from '../views/goals/goalLink.js';

const STOP = new Set(['with', 'from', 'that', 'this', 'your', 'into', 'build', 'write', 'finish', 'add', 'the', 'and', 'for', 'app', 'set', 'part']);
const words = s => new Set(String(s).toLowerCase().match(/[a-z0-9+#]{4,}/g)?.filter(w => !STOP.has(w)) ?? []);

export function goalNudges({ goals = [], events = [], today, horizonDays = 21, limit = 2 }) {
  const out = [];
  for (const g of goals) {
    const next = [...(g.milestones || [])].filter(m => !m.done && m.due).sort((a, b) => a.due.localeCompare(b.due))[0];
    if (!next) continue;
    const days = daysBetween(today, next.due);
    if (days > horizonDays) continue;
    const need = Math.round(hoursLeft(next) * 60);
    if (need <= 0) continue;
    const mine = new Set([...words(next.title), ...words(g.title)]);
    const booked = bookedMinutes({ goal: g, milestone: next, events, matchTitle: t => [...words(t)].some(w => mine.has(w)) });
    if (booked >= need * 0.6) continue;                       // enough is already planned
    out.push({ goalId: g.id, goal: g.title, cat: g.cat || '', milestone: next.title, milestoneId: next.id, due: next.due, days, needMin: need, bookedMin: booked, shortMin: need - booked });
  }
  return out.sort((a, b) => a.days - b.days).slice(0, limit);
}


const CATCH_UP_CAP_MIN = 10 * 60;      // one request books at most this much; ask again for the rest

// Time to get a goal that is behind back on its plan: the hours between where the plan says it should be and where it is,
// or, if the plan is not behind but the hours do not exist, the rest of the next milestone. Less what the calendar already
// holds for it. Same shape as a goalNudges() entry, so the calendar planner can take it as it is.
export function catchUpFor(g, events, today) {
  const next = sortedMilestones(g).find(m => !m.done);
  if (!next) return null;
  const hoursBehind = Math.max(0, ((expectedPct(g, today) - progressPct(g)) / 100) * totalEffort(g));
  const nextLeft = hoursLeft(next);
  const need = Math.min(CATCH_UP_CAP_MIN, Math.round((hoursBehind > 0.25 ? hoursBehind : nextLeft) * 60 / 5) * 5);
  if (need <= 0) return null;
  const mine = new Set([...words(next.title), ...words(g.title)]);
  const booked = bookedMinutes({ goal: g, milestone: next, events, matchTitle: t => [...words(t)].some(w => mine.has(w)) });
  const short = need - booked;
  if (short < 30) return null;
  return { goalId: g.id, goal: g.title, cat: g.cat || '', milestone: next.title, milestoneId: next.id, due: next.due, days: daysBetween(today, next.due), needMin: need, bookedMin: booked, shortMin: short, catchUp: true };
}
