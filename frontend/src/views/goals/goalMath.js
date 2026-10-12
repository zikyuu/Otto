// Goal tracker maths. Pure, no React, no network: everything the page shows about progress is computed here,
// so it is predictable and testable. The LLM is only asked (about weekly) whether the path itself is right.
//
// A goal:
//   { id, title, cat, start, target, hours_per_week, milestones: [...], detours: [...] }
// A milestone:
//   { id, title, effort_h, due, done, done_on?, subtasks?: [{id, t, done}] }
// Effort is what the user thinks in (hours). A milestone's share of the goal is its share of the total effort,
// so nobody has to do percentage arithmetic, and adding a milestone rescales the rest by itself.

const DAY = 86400000;
export const parseDay = iso => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const isoOf = ms => new Date(ms).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / DAY);
export const addDays = (iso, n) => isoOf(parseDay(iso) + n * DAY);
const clamp01 = x => Math.min(Math.max(x, 0), 1);
const round1 = x => Math.round(x * 10) / 10;

export const sortedMilestones = g => [...g.milestones].sort((a, b) => parseDay(a.due) - parseDay(b.due));
export const totalEffort = g => g.milestones.reduce((s, m) => s + (m.effort_h || 0), 0);

// how finished one milestone is, 0..1 (ticked subtasks count as partial progress)
export function milestoneFraction(m) {
  if (m.done) return 1;
  if (m.subtasks?.length) return m.subtasks.filter(s => s.done).length / m.subtasks.length;
  return 0;
}

export function progressPct(g) {
  const total = totalEffort(g);
  if (!total) return 0;
  return (g.milestones.reduce((s, m) => s + (m.effort_h || 0) * milestoneFraction(m), 0) / total) * 100;
}

export function remainingHours(g) {
  return g.milestones.reduce((s, m) => s + (m.effort_h || 0) * (1 - milestoneFraction(m)), 0);
}

// "at this point the overall goal is N% achieved": cumulative share once this milestone (and all before it) are done
export function cumulativePct(g, id) {
  const total = totalEffort(g);
  if (!total) return 0;
  let acc = 0;
  for (const m of sortedMilestones(g)) { acc += m.effort_h || 0; if (m.id === id) break; }
  return (acc / total) * 100;
}

// where the original plan says the goal should be on `today`: each milestone is worked on between the previous
// milestone's due date and its own, so the planned curve climbs steadily rather than in jumps
export function expectedPct(g, today) {
  const total = totalEffort(g);
  if (!total) return 0;
  let prev = g.start, acc = 0;
  for (const m of sortedMilestones(g)) {
    const span = daysBetween(prev, m.due);
    const f = span <= 0 ? (daysBetween(today, m.due) <= 0 ? 1 : 0) : clamp01(daysBetween(prev, today) / span);
    acc += (m.effort_h || 0) * f;
    prev = m.due;
  }
  return (acc / total) * 100;
}

export const daysLeft = (g, today) => daysBetween(today, g.target);

// hours per week the rest of the work needs, and how that compares with what the user can give
export function requiredPerWeek(g, today) {
  const weeks = Math.max(daysLeft(g, today), 0) / 7;
  const left = remainingHours(g);
  if (left <= 0) return 0;
  return weeks > 0 ? left / weeks : Infinity;
}

// at the pace so far, when does it finish? null when nothing has been done yet
export function projectedFinish(g, today) {
  const left = remainingHours(g);
  if (left <= 0) return today;
  const done = totalEffort(g) - left;
  const weeksSoFar = Math.max(daysBetween(g.start, today) / 7, 1);
  if (done <= 0) return null;
  return addDays(today, Math.ceil((left / (done / weeksSoFar)) * 7));
}

export const STATUS = {
  done:       { label: 'Done',        tone: 'good' },
  ahead:      { label: 'Ahead',       tone: 'good' },
  on_track:   { label: 'On track',    tone: 'good' },
  behind:     { label: 'Behind',      tone: 'warn' },
  at_risk:    { label: 'At risk',     tone: 'warn' },
  impossible: { label: 'Out of reach', tone: 'bad' },
};

// ahead / on track / behind come from plan vs reality; at risk / out of reach from whether the hours exist
export function statusOf(g, today) {
  const pct = progressPct(g);
  if (pct >= 99.5) return 'done';
  if (daysLeft(g, today) < 0) return 'impossible';
  const cap = g.hours_per_week || 0;
  const need = requiredPerWeek(g, today);
  const ratio = cap > 0 ? need / cap : Infinity;
  if (ratio > 1.4) return 'impossible';
  if (ratio > 1) return 'at_risk';
  const gap = pct - expectedPct(g, today);
  if (gap < -5) return 'behind';
  if (gap > 5) return 'ahead';
  return 'on_track';
}

export const detourDays = g => (g.detours || []).reduce((s, d) => s + (d.impact_days || 0), 0);

// planned curve: 0% at the start, then the cumulative share at each milestone's due date
export function plannedCurve(g) {
  const total = totalEffort(g) || 1;
  let acc = 0;
  return [{ date: g.start, pct: 0 }, ...sortedMilestones(g).map(m => ({ date: m.due, pct: ((acc += m.effort_h || 0) / total) * 100 }))];
}

// what actually happened: a step each time a milestone was finished, ending at today's real number
export function actualCurve(g, today) {
  const total = totalEffort(g) || 1;
  const finished = g.milestones.filter(m => m.done).sort((a, b) => parseDay(a.done_on || g.start) - parseDay(b.done_on || g.start));
  let acc = 0;
  const pts = [{ date: g.start, pct: 0 }];
  for (const m of finished) pts.push({ date: m.done_on || g.start, pct: ((acc += m.effort_h || 0) / total) * 100 });
  pts.push({ date: today, pct: progressPct(g) });
  return pts;
}

// plain-language lines for the insights panel
export function insights(g, today) {
  const pct = progressPct(g), exp = expectedPct(g, today), gap = pct - exp;
  const out = [];
  if (pct >= 99.5) return [{ tone: 'good', text: 'Every milestone is done.' }];
  out.push({
    tone: gap < -5 ? 'warn' : 'good',
    text: `By now the plan expected ${Math.round(exp)}%. You're at ${Math.round(pct)}%` +
      (Math.abs(gap) < 1 ? ', right on plan.' : gap > 0 ? `, ${Math.round(gap)} points ahead.` : `, ${Math.round(-gap)} points behind.`),
  });
  const need = requiredPerWeek(g, today), cap = g.hours_per_week || 0;
  if (daysLeft(g, today) < 0) out.push({ tone: 'bad', text: `The target date passed ${-daysLeft(g, today)} days ago with ${round1(remainingHours(g))}h of work left.` });
  else out.push({
    tone: cap && need > cap ? (need / cap > 1.4 ? 'bad' : 'warn') : 'good',
    text: `${round1(remainingHours(g))}h of work left in ${Math.round(daysLeft(g, today) / 7 * 10) / 10} weeks needs ${round1(need)}h a week; you set aside ${cap}h.`,
  });
  const fin = projectedFinish(g, today);
  if (fin) {
    const late = daysBetween(g.target, fin);
    out.push({ tone: late > 0 ? 'warn' : 'good', text: late > 0 ? `At your pace so far you finish on ${fin}, ${late} days after the target.` : `At your pace so far you finish around ${fin}, in time.` });
  }
  const lost = detourDays(g);
  if (lost > 0) out.push({ tone: 'warn', text: `${(g.detours || []).length} detour${g.detours.length === 1 ? '' : 's'} cost about ${round1(lost)} days.` });
  return out;
}

export function summarize(goals, today) {
  const by = { good: 0, warn: 0, bad: 0 };
  for (const g of goals) by[STATUS[statusOf(g, today)].tone]++;
  return by;
}

// ---- edits (all return a new goal) -------------------------------------------------------------

export function toggleMilestone(g, id, today) {
  return { ...g, milestones: g.milestones.map(m => {
    if (m.id !== id) return m;
    const done = !m.done;
    return { ...m, done, done_on: done ? today : undefined, ...(m.subtasks ? { subtasks: m.subtasks.map(s => ({ ...s, done })) } : {}) };
  }) };
}

export function toggleSubtask(g, mid, sid, today) {
  return { ...g, milestones: g.milestones.map(m => {
    if (m.id !== mid) return m;
    const subtasks = m.subtasks.map(s => (s.id === sid ? { ...s, done: !s.done } : s));
    const done = subtasks.every(s => s.done);
    return { ...m, subtasks, done, done_on: done ? (m.done_on || today) : undefined };
  }) };
}

export function addMilestone(g, { title, effort_h, due }, id) {
  return { ...g, milestones: [...g.milestones, { id, title, effort_h: Math.max(Number(effort_h) || 1, 0.25), due, done: false }] };
}

export function removeMilestone(g, id) { return { ...g, milestones: g.milestones.filter(m => m.id !== id) }; }

export function addSubtask(g, mid, text, id) {
  return { ...g, milestones: g.milestones.map(m => (m.id === mid
    ? { ...m, done: false, done_on: undefined, subtasks: [...(m.subtasks || []), { id, t: text, done: false }] } : m)) };
}

export function logDetour(g, { type, text, impact_days, date }) {
  return { ...g, detours: [{ date, type, text, impact_days: Math.max(Number(impact_days) || 0, 0) }, ...(g.detours || [])] };
}

// what the weekly review is shown about this goal
export function reviewPayload(g, today) {
  const sorted = sortedMilestones(g);
  return {
    id: g.id, title: g.title, cat: g.cat, start_date: g.start, target_date: g.target,
    progress_pct: round1(progressPct(g)), expected_pct: round1(expectedPct(g, today)), status: statusOf(g, today),
    hours_remaining: round1(remainingHours(g)), hours_per_week: g.hours_per_week || 0,
    required_hours_per_week: Number.isFinite(requiredPerWeek(g, today)) ? round1(requiredPerWeek(g, today)) : 999,
    projected_finish: projectedFinish(g, today), recent_focus: g.recent_focus || '',
    milestones: sorted.map(m => ({ title: m.title, effort_h: m.effort_h, due: m.due, done: !!m.done, pct_when_done: round1(cumulativePct(g, m.id)) })),
    detours: (g.detours || []).map(d => ({ date: d.date, type: d.type, text: d.text, impact_days: d.impact_days })),
  };
}
