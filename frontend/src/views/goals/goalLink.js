// Calendar events that count towards a goal. An event carries goal_id (and optionally milestone_id); the time that was really
// spent on it, once the user has said how it went, is added to that milestone as logged_h. The same event is never counted
// twice: the minutes already credited are kept on the event (credited_min) and only the change is added.

// minutes of the block that really went into the work
export function workedMinutes(ev, choice, plannedWork, doneWork) {
  if (choice === 'skipped' || choice === 'skip') return 0;
  const frac = plannedWork > 0 ? Math.min(1, doneWork / plannedWork) : 1;
  return Math.round((ev.durationMin * frac) / 5) * 5;
}

export function creditGoal(goals, ev, minutes) {
  if (!ev.goal_id) return { goals, credited: ev.credited_min || 0 };
  const delta = (minutes - (ev.credited_min || 0)) / 60;
  if (!delta) return { goals, credited: minutes };
  const g = goals.find(x => x.id === ev.goal_id);
  if (!g) return { goals, credited: ev.credited_min || 0 };
  const open = g.milestones.filter(m => !m.done);
  const target = (ev.milestone_id && g.milestones.find(m => m.id === ev.milestone_id)) || open.sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
  if (!target) return { goals, credited: ev.credited_min || 0 };
  const next = goals.map(x => (x.id !== g.id ? x : { ...x, milestones: x.milestones.map(m => (m.id === target.id ? { ...m, logged_h: Math.max(0, +((m.logged_h || 0) + delta).toFixed(2)) } : m)) }));
  return { goals: next, credited: minutes };
}

// hours still needed for a milestone: what is left after what the subtasks show and what the calendar has already logged
export function hoursLeft(m) {
  const total = m.effort_h || 0;
  const bySteps = m.done ? total : m.subtasks?.length ? total * (m.subtasks.filter(s => s.done).length / m.subtasks.length) : 0;
  return Math.max(0, total - Math.max(bySteps, m.logged_h || 0));
}

// time on the calendar that counts for this goal and step: events tied to it explicitly, then untied ones whose title matches
export function bookedMinutes({ goal, milestone, events, matchTitle }) {
  let sum = 0;
  for (const e of events) {
    if (e.fixed) continue;
    if (e.goal_id) { if (e.goal_id === goal.id && (!e.milestone_id || e.milestone_id === milestone.id)) sum += e.durationMin; }
    else if (matchTitle(e.title)) sum += e.durationMin;
  }
  return sum;
}
