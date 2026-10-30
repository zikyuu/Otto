// "I'm overwhelmed": today's work as the engine ranked it (importance first), split into what has a deadline coming and what only
// has to happen eventually, and the hours the person says they can give.

// tasks come ranked from the server. Keep the most important that fit the hours; a must-do always stays.
export function defaultKeep(tasks, budgetMin) {
  const keep = [];
  let used = 0;
  for (const t of tasks) {
    if (t.must || used + t.minutes <= budgetMin) { keep.push(t.id); used += t.minutes; }
  }
  return keep;
}

export const sections = tasks => ({ soon: tasks.filter(t => t.kind === 'deadline'), eventually: tasks.filter(t => t.kind !== 'deadline') });

export const minutesOf = (tasks, ids) => tasks.filter(t => ids.includes(t.id)).reduce((s, t) => s + t.minutes, 0);

// how a deadline reads on a card
export function dueText(t) {
  if (t.days_left == null) return null;
  if (t.days_left < 0) return `${-t.days_left} day${t.days_left === -1 ? '' : 's'} overdue`;
  if (t.days_left === 0) return 'due today';
  if (t.days_left === 1) return 'due tomorrow';
  return `due in ${t.days_left} days`;
}

// the variants of a plan, ready for the calendar's compare view; `restFirst` opens on the rest-day plan
export function variantsOf(plan, { restFirst = false } = {}) {
  const one = (key, label, v, applyLabel) => ({ key, label, events: v.events, grinder: v.grinder, dropped: [], conflicts: v.conflicts, decisions: v.decisions, warnings: v.warnings, explanation: key === 'suggested' ? plan.explanation : 'Today is cleared. This is what that does to the rest of the week.', applyLabel });
  const sug = one('suggested', "Otto's suggestion", plan.suggested, 'Use this plan');
  const rest = one('rest', 'Rest today', plan.rest, 'Rest today and use this plan');
  return restFirst ? [rest, sug] : [sug, rest];
}
