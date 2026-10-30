// "Make time": turn a goal's shortfall into one calendar block that the scheduler cuts into sessions and places at
// times that are actually free (span_days: the same mechanism as a very long event).
import { addDays } from '../views/goals/goalMath.js';
import { dayOfIso } from '../views/calendar/calendarUtils.js';

const MAX_MIN = 105 * 60;

export function categoryFor(goalTitle = '', cat = '') {
  const s = `${goalTitle} ${cat}`.toLowerCase();
  if (/leetcode|blind|algorithm|coding problem/.test(s)) return 'leetcode';
  if (/system.?design/.test(s)) return 'system-design';
  if (/\brag\b|llm|embedding|machine learning|\bml\b/.test(s)) return 'llm';
  if (/gym|fitness|run|steps|weight|kg/.test(s)) return 'gym';
  if (/interview|apply|recruit/.test(s)) return 'interview';
  return 'deep_work';
}

// -> a calendar event ready for /api/schedule with plan_ids = [event.id]
export function timeBlockFor(nudge, { goalTitle, goalCat, today, todayDay, tomorrowDay, nowMin, id, peak = [9, 12] }) {
  // Sessions hug the start this block asks for, so ask for the start of the user's learned focus window: today if it is
  // still ahead (or running with time to spare), otherwise tomorrow at its start.
  const peakStart = peak[0] * 60, peakEnd = peak[1] * 60;
  const soonest = Math.ceil((nowMin + 15) / 60) * 60;
  const useToday = soonest + 60 <= peakEnd;
  const startMin = useToday ? Math.max(peakStart, soonest) : peakStart;
  const due = nudge.due;
  const block = {
    id,
    title: nudge.milestone,
    day: useToday ? todayDay : tomorrowDay,
    startMin,
    durationMin: Math.max(30, Math.min(nudge.shortMin, MAX_MIN)),
    category: categoryFor(goalTitle, goalCat),
    fixed: false,
    span_days: true,
    goal_id: nudge.goalId,
    ...(nudge.milestoneId ? { milestone_id: nudge.milestoneId } : {}),
    made_for: nudge.milestone,
  };
  if (due >= today) { block.deadline_iso = due; block.hard_deadline = true; }
  return block;
}

// the 14 date-of-month numbers and the Monday the scheduler needs, for the current two weeks
export function planWindow(todayIso) {
  const d = new Date(`${todayIso}T00:00:00`);
  const back = (d.getDay() + 6) % 7;
  const monday = addDays(todayIso, -back);
  const days = Array.from({ length: 14 }, (_, i) => dayOfIso(addDays(monday, i)));
  return { monday, days };
}

// which of the returned events are new sessions for this block
export const sessionsOf = (events, blockId) => events.filter(e => e.id === blockId || e.split_of === blockId);
