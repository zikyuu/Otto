// Goals for a block of time, and how it went afterwards. Pure; no React.
//
// A long task is split by the scheduler into sessions. Every session carries pieces of the task's subtasks
// (`subtasks[]`, each piece knowing its `base_id`, `base_name` and `base_minutes`). A GOAL for a session says how much of
// each whole subtask should be done in that block (0-100%). Goals belong to the session itself, not to its position:
// sessions can be done in any order, so moving session 2 in front of session 1 simply makes it the first one you do,
// goals and all. If the user sets nothing, Otto's own split (the pieces the scheduler poured into the block) is the plan.
//
//   ev.goals       { [subtaskKey]: pct }    set by the user (absent = "Otto suggests")
//   ev.reflection  { choice, actual: { [subtaskKey]: pct }, notes, at }   filled in after the block has passed

const STEP = 5;
const snap = x => Math.min(100, Math.max(0, Math.round(x / STEP) * STEP));

// Pieces made before Otto tracked which subtask they came from only have "name (part 2)" and "id_3": recover the whole
// subtask from those so older blocks work too.
export const subtaskKey  = p => p.base_id ?? String(p.id).replace(/_\d+$/, '');
export const subtaskName = p => p.base_name ?? String(p.name).replace(/ \(part \d+\)$/, '');

// ---- sessions ------------------------------------------------------------------------------------

// The sessions of the same task, earliest first. `dayIdx` maps a date-of-month to its column (-1 if not visible).
export function siblingsOf(events, ev, dayIdx = d => d) {
  if (!ev.split_of) return [ev];
  const at = e => (dayIdx(e.day) < 0 ? e.day + 100 : dayIdx(e.day)) * 1440 + e.startMin;
  return events.filter(e => e.split_of === ev.split_of).sort((a, b) => at(a) - at(b));
}

// "Draft essay (2/6)" by the order the sessions will actually happen in, not the order they were created in.
export function displayTitle(events, ev, dayIdx) {
  if (!ev.split_of) return ev.title;
  const sibs = siblingsOf(events, ev, dayIdx);
  const base = ev.base_title ?? ev.title.replace(/ \(\d+\/\d+\)$/, '');
  return `${base} (${sibs.findIndex(e => e.id === ev.id) + 1}/${sibs.length})`;
}

// ---- the plan for one block ----------------------------------------------------------------------

// One row for EVERY subtask of the task, not only the ones Otto happened to put in this block: the user may want half
// of subtask 1 and half of subtask 2 here, or something Otto left for a later session. `suggested` is Otto's own split
// (0 for a subtask it left out); `pct` is the goal that is currently in force.
export function planRows(ev, events = [ev]) {
  const sibs = ev.split_of ? events.filter(e => e.split_of === ev.split_of) : [ev];
  const rows = new Map();
  for (const sib of sibs) {
    for (const p of sib.subtasks || []) {
      const key = subtaskKey(p);
      const r = rows.get(key) || { key, name: subtaskName(p), totalMin: p.base_minutes ?? 0, summed: 0, order: p.order ?? 1e9, mine: 0 };
      r.summed += p.minutes;
      if (p.base_minutes != null) r.totalMin = p.base_minutes;
      r.order = Math.min(r.order, p.order ?? 1e9);
      if (sib.id === ev.id) r.mine += p.minutes;
      rows.set(key, r);
    }
  }
  return [...rows.values()].sort((a, b) => a.order - b.order).map(r => {
    const totalMin = r.totalMin || r.summed;                      // old pieces: the whole subtask is what the sessions add up to
    const suggested = r.mine > 0 ? Math.max(snap((r.mine / totalMin) * 100), STEP) : 0;
    const pct = ev.goals && ev.goals[r.key] != null ? ev.goals[r.key] : suggested;
    return { key: r.key, name: r.name, order: r.order, totalMin, suggested, pct, minutes: Math.round((totalMin * pct) / 100) };
  });
}

export const hasCustomGoals = ev => !!ev.goals;

export function setGoal(events, id, key, pct) {
  return events.map(e => {
    if (e.id !== id) return e;
    const base = e.goals ?? Object.fromEntries(planRows(e, events).map(r => [r.key, r.suggested]));   // pinning one goal pins the full set
    return { ...e, goals: { ...base, [key]: snap(pct) } };
  });
}

export function resetGoals(events, id) {
  return events.map(e => {
    if (e.id !== id) return e;
    const { goals, ...rest } = e;
    return rest;
  });
}

// How much of each subtask is covered by all the sessions together: warns when part of it has no session.
export function coverage(events, ev, dayIdx) {
  const out = {};
  for (const sib of siblingsOf(events, ev, dayIdx)) {
    for (const r of planRows(sib, events)) out[r.key] = (out[r.key] || 0) + r.pct;
  }
  return out;
}

// ---- looking back --------------------------------------------------------------------------------

export const REFLECTIONS = [
  { key: 'nailed',      label: 'Nailed it',            icon: 'check', hint: 'It went as planned or better' },
  { key: 'harder',      label: 'Harder than expected', icon: 'clock', hint: 'It took longer than the plan' },
  { key: 'gap',         label: 'Gap',                  icon: 'target', hint: 'I realised I am missing a skill' },
  { key: 'interrupted', label: 'Interrupted',          icon: 'stop', hint: 'Something outside my control got in' },
  { key: 'outlier',     label: 'Outlier',              icon: 'leaf', hint: 'Just an off day, do not learn from it' },
];

// Work (minutes of subtask effort) the plan promised, and what was actually achieved
export function workDone(rows, actual = {}) {
  const planned = rows.reduce((s, r) => s + (r.totalMin * r.pct) / 100, 0);
  const done = rows.reduce((s, r) => s + (r.totalMin * Math.min(actual[r.key] ?? r.pct, r.pct)) / 100, 0);
  return { planned, done };
}

// For the learning loop: how long the block "really" took relative to plan. Hitting the goal = on time; falling short means
// the planned work needed more time than was given (capped, and never below 40% done so a zero doesn't explode it).
export function reflectionMinutes(plannedMin, planned, done) {
  if (planned <= 0 || done >= planned) return plannedMin;
  const ratio = Math.min(planned / Math.max(done, planned * 0.4), 2.5);
  return Math.round(plannedMin * ratio);
}

// What was planned but not done, per subtask, and the time it would take
export function remainder(rows, actual = {}) {
  const parts = rows.map(r => ({ key: r.key, name: r.name, short: Math.max(r.pct - (actual[r.key] ?? r.pct), 0), minutes: Math.round((r.totalMin * Math.max(r.pct - (actual[r.key] ?? r.pct), 0)) / 100) }))
    .filter(p => p.short > 0);
  const raw = parts.reduce((s, p) => s + p.minutes, 0);
  const minutes = raw === 0 ? 0 : Math.max(Math.ceil(raw / 5) * 5, 15);
  return { parts, minutes };
}

// ---- finding a place for it ----------------------------------------------------------------------

// First gap of `minutes` on or after (fromIdx, fromMin) in the visible days. dayNums are date-of-month numbers in order.
export function findFreeSlot(events, { dayNums, minutes, fromIdx = 0, fromMin = 0, dayStart = 480, dayEnd = 1380, snapTo = 15 }) {
  for (let i = Math.max(fromIdx, 0); i < dayNums.length; i++) {
    const busy = events.filter(e => e.day === dayNums[i]).map(e => [e.startMin, e.startMin + e.durationMin]).sort((a, b) => a[0] - b[0]);
    let cursor = i === fromIdx ? Math.max(dayStart, Math.ceil(fromMin / snapTo) * snapTo) : dayStart;
    for (const [s, e] of busy) {
      if (s - cursor >= minutes) return { day: dayNums[i], startMin: cursor };
      cursor = Math.max(cursor, Math.ceil(e / snapTo) * snapTo);
    }
    if (dayEnd - cursor >= minutes) return { day: dayNums[i], startMin: cursor };
  }
  return null;
}

// ---- events with nothing to pull ------------------------------------------------------------------

export const WHOLE = '_all';

// What the reflection meters are about. A block with subtasks reflects on the ones that were planned; a block with none
// is a single thing that either got done or did not, so it gets one meter for the whole block ("Interrupted" must be
// able to mean "I did not do it").
export function reflectionRows(ev, events = [ev]) {
  const rows = planRows(ev, events).filter(r => r.pct > 0);
  if (rows.length) return rows;
  return [{ key: WHOLE, name: 'The whole block', totalMin: ev.durationMin, suggested: 100, pct: 100, minutes: ev.durationMin, order: 0 }];
}

// ---- goals that leave part of the work in no block at all ----------------------------------------

// What the goals of this event (and its sibling sessions) do not cover, with the time it would take.
// Same shape as remainder(): { parts: [{key, name, short, minutes}], minutes }.
export function uncovered(events, ev, dayIdx) {
  const rows = planRows(ev, events);
  if (!rows.length) return { parts: [], minutes: 0 };
  const cov = coverage(events, ev, dayIdx);
  return remainder(rows.map(r => ({ ...r, pct: 100 })), Object.fromEntries(rows.map(r => [r.key, Math.min(cov[r.key] ?? 0, 100)])));
}

// a short fingerprint of what is uncovered, so the page can tell "already dealt with" from "changed since"
export const restSignature = rest => rest.parts.map(p => `${p.key}:${p.short}`).join(',');
