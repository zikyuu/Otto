// How long ago did a meeting end? The energy tap sends this so Otto can learn how much recovery time a meeting costs.
// A "meeting" is an event whose category is social or interview. Only the same day counts, and only the last two hours.

const MEETING = new Set(['interview', 'social', 'meeting', 'call']);
export const RECENT_MIN = 120;

// events: calendar events (day = date of month); today: the day number; nowMin: minutes since midnight
export function minutesSinceMeeting(events, today, nowMin) {
  let best = null;
  for (const e of events) {
    if (e.day !== today || !MEETING.has(String(e.category || '').toLowerCase())) continue;
    const end = e.startMin + e.durationMin;
    if (end > nowMin) continue;                           // not over yet
    const ago = nowMin - end;
    if (ago <= RECENT_MIN && (best === null || ago < best)) best = ago;
  }
  return best;
}

// minutes since a long deep-work block ended today (within the last RECENT_MIN), else null: energy right after hard work
const HARD = new Set(['llm', 'leetcode', 'system design', 'system_design', 'deep work', 'deep_work', 'interview']);
export const HARD_MIN = 90;
export function minutesSinceHard(events, today, nowMin) {
  let best = null;
  for (const e of events) {
    if (e.day !== today || e.durationMin < HARD_MIN || !HARD.has(String(e.category || '').toLowerCase())) continue;
    const end = e.startMin + e.durationMin;
    if (end > nowMin) continue;
    const ago = nowMin - end;
    if (ago <= RECENT_MIN && (best === null || ago < best)) best = ago;
  }
  return best;
}

// what came just before this block on the same day (the latest block that ended by its start): the kind of work, else null
export function previousCategory(events, ev) {
  let best = null;
  for (const e of events) {
    if (e.id === ev.id || e.day !== ev.day) continue;
    const end = e.startMin + e.durationMin;
    if (end <= ev.startMin && (best === null || end > best.end)) best = { end, category: e.category };
  }
  return best ? best.category : null;
}

// whole days from the day the work was done to its deadline (negative once it has passed), or null with no deadline
export function daysToDeadline(deadlineIso, doneIso) {
  if (!deadlineIso) return null;
  const a = Date.parse(`${String(deadlineIso).slice(0, 10)}T00:00:00Z`), b = Date.parse(`${doneIso}T00:00:00Z`);
  return Number.isNaN(a) || Number.isNaN(b) ? null : Math.round((a - b) / 86400000);
}

export const ENERGY_LEVELS = [
  { level: 5, label: 'Energised' },
  { level: 4, label: 'In the zone' },
  { level: 3, label: 'Neutral' },
  { level: 2, label: 'Tired' },
  { level: 1, label: 'Drained' },
];
