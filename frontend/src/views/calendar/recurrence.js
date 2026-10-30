// Recurring events. A series is a template plus a rule; its occurrences are ordinary calendar events (same id scheme every time:
// `${series.id}@${day}`) laid out a few months ahead and topped up as time passes. Because they are ordinary events, the scheduler,
// reflections, links and the month view all treat them like any other. Editing one occurrence changes just that event; "this and
// following" splits the series; deleting one occurrence is remembered so it is not laid out again.
import { dateOfDay, dayNum } from './calendarUtils.js';
import { dropEvent } from './linkUtils.js';

export const HORIZON_DAYS = 84;                            // twelve weeks ahead
const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// 1 Jan 1970 was a Thursday; Monday = 0
export const weekdayOf = n => (((n + 3) % 7) + 7) % 7;
const mondayOf = n => n - weekdayOf(n);

export const PRESETS = {
  none: null,
  daily: { freq: 'daily', interval: 1 },
  weekdays: { freq: 'weekly', days: [0, 1, 2, 3, 4], interval: 1 },
  weekly: { freq: 'weekly', days: null, interval: 1 },     // the weekday of the first event
  monthly: { freq: 'monthly', interval: 1 },
};

// does `day` fall on the rule, counting from `start`?
export function matches(rule, start, day) {
  if (day < start) return false;
  const k = Math.max(1, rule.interval || 1);
  if (rule.freq === 'daily') return (day - start) % k === 0;
  if (rule.freq === 'weekly') {
    const days = rule.days?.length ? rule.days : [weekdayOf(start)];
    return days.includes(weekdayOf(day)) && Math.floor((mondayOf(day) - mondayOf(start)) / 7) % k === 0;
  }
  if (rule.freq === 'monthly') {
    const s = dateOfDay(start), d = dateOfDay(day);
    const months = (d.getFullYear() - s.getFullYear()) * 12 + d.getMonth() - s.getMonth();
    if (months < 0 || months % k !== 0) return false;
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(s.getDate(), last);       // the 31st falls on the last day of a shorter month
  }
  return false;
}

export const instanceId = (seriesId, day) => `${seriesId}@${day}`;

export function occurrences(series, from, to) {
  const out = [];
  const hi = series.until != null ? Math.min(to, series.until) : to;
  for (let d = Math.max(from, series.start); d <= hi; d++) {
    if (series.exceptions?.[d] === 'skip') continue;
    if (matches(series.rule, series.start, d)) out.push(d);
  }
  return out;
}

let seq = 0;
export const newSeriesId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`;

const TEMPLATE_KEYS = ['title', 'startMin', 'durationMin', 'category', 'fixed', 'non_negotiable', 'description', 'subtasks', 'order_specific', 'checklist', 'goal_id', 'milestone_id', 'deadline_in_days', 'importance_cat', 'importance_tier'];
export function templateOf(ev) {
  const t = {};
  for (const k of TEMPLATE_KEYS) if (ev[k] !== undefined && ev[k] !== null) t[k] = JSON.parse(JSON.stringify(ev[k]));
  if (t.checklist) t.checklist = t.checklist.map(c => ({ ...c, done: false }));
  if (t.subtasks) t.subtasks = t.subtasks.map(({ done, ...s }) => s);       // every occurrence starts with nothing ticked
  return t;
}

export function makeSeries(ev, rule, until = null, id = newSeriesId()) {
  return { id, template: templateOf(ev), rule, start: ev.day, until, exceptions: {} };
}

const instance = (series, day) => ({ ...JSON.parse(JSON.stringify(series.template)), id: instanceId(series.id, day), day, series_id: series.id });

// occurrences in [from, to] that are not on the calendar yet
export function materialize(series, events, from, to) {
  const have = new Set(events.map(e => e.id));
  return occurrences(series, from, to).map(d => instance(series, d)).filter(e => !have.has(e.id));
}

// lay out every series up to the horizon; returns the same array when nothing is missing
export function ensureHorizon(seriesList, events, today, ahead = HORIZON_DAYS) {
  const add = seriesList.flatMap(s => materialize(s, events, today - 7, today + ahead));
  return add.length ? [...events, ...add] : events;
}

// "this and following": the old series ends the day before; a new one starts on `day` with the changes. Its future occurrences
// are replaced; occurrences before `day` and past ones are left alone.
export function splitSeries(series, day, { template = {}, rule = series.rule, until = series.until } = {}) {
  const before = { ...series, until: day - 1 };
  const after = { id: newSeriesId(), template: { ...series.template, ...template }, rule, start: day, until, exceptions: Object.fromEntries(Object.entries(series.exceptions || {}).filter(([d]) => +d >= day)) };
  return { before, after };
}

export const removeFrom = (events, seriesId, day) => events.filter(e => !(e.series_id === seriesId && e.day >= day));
export const skipDay = (series, day) => ({ ...series, exceptions: { ...(series.exceptions || {}), [day]: 'skip' } });
export const endSeries = (series, day) => ({ ...series, until: day - 1 });
export const seriesOf = (list, ev) => list.find(s => s.id === ev.series_id) || null;

// "Every weekday", "Every Thu, Fri", "Every 2 weeks on Mon", "Every month on the 13th"
export function describeRule(rule, start) {
  if (!rule) return 'Does not repeat';
  const k = rule.interval || 1;
  if (rule.freq === 'daily') return k === 1 ? 'Every day' : `Every ${k} days`;
  if (rule.freq === 'monthly') { const d = dateOfDay(start).getDate(); const o = d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'; return `${k === 1 ? 'Every month' : `Every ${k} months`} on the ${d}${o}`; }
  const days = [...(rule.days?.length ? rule.days : [weekdayOf(start)])].sort((a, b) => a - b);
  if (k === 1 && days.length === 7) return 'Every day';
  if (k === 1 && days.join() === '0,1,2,3,4') return 'Every weekday';
  return `${k === 1 ? 'Every' : `Every ${k} weeks on`} ${days.map(d => NAMES[d]).join(', ')}`.replace('Every Mon', 'Every Mon');
}

export const today = () => dayNum(new Date());

// give an event a new id and keep everything that pointed at the old one
export function renameEvent(events, from, to) {
  const re = list => (list ? list.map(x => (x === from ? to : x)) : list);
  return events.map(e => {
    const n = e.id === from ? { ...e, id: to } : { ...e };
    if (n.prereq_ids) n.prereq_ids = re(n.prereq_ids);
    if (n.grouped_with) n.grouped_with = re(n.grouped_with);
    return n;
  });
}

// Saving an edited event. `events` already holds the edited event (`updated`); `list` is every series. Returns the new events and series
// list, and the id the scheduler should look at. `repeat` is { rule, until } from the form (undefined when the form did not offer it).
export function applyEdit({ events, list, original, updated, repeat, scope, horizon = HORIZON_DAYS }) {
  const ser = seriesOf(list, original);
  let next = events, planId = original.id, nextList = list;
  const lay = (s, from) => { next = [...next, ...materialize(s, next, from, from + horizon)]; };
  if (!ser && repeat?.rule) {                                              // an ordinary event becomes the first of a series
    const s = makeSeries(updated, repeat.rule, repeat.until ?? null);
    planId = instanceId(s.id, updated.day);
    next = renameEvent(next, original.id, planId).map(e => (e.id === planId ? { ...e, series_id: s.id } : e));
    lay(s, updated.day);
    nextList = [...list, s];
  } else if (ser && scope === 'following') {
    if (!repeat?.rule) {                                                   // stops repeating: this one stays on its own, the later ones go
      planId = `task_${Date.now()}`;
      next = renameEvent(next, original.id, planId).map(e => { if (e.id !== planId) return e; const { series_id, ...r } = e; return r; });
      next = removeFrom(next, ser.id, original.day + 1);
      nextList = list.map(x => (x.id === ser.id ? endSeries(x, original.day) : x));
    } else {
      const { before, after } = splitSeries(ser, updated.day, { template: makeSeries(updated, repeat.rule).template, rule: repeat.rule, until: repeat.until ?? null });
      next = removeFrom(next, ser.id, original.day);
      planId = instanceId(after.id, updated.day);
      next = [...next, { ...updated, series_id: after.id, id: planId }];
      lay(after, updated.day);
      nextList = list.flatMap(x => (x.id === ser.id ? [before, after] : [x]));
    }
  }
  return { events: next, list: nextList, planId };
}

// Removing one occurrence ('this') or it and everything after ('following')
export function applyRemove({ events, list, ev, scope }) {
  const ser = seriesOf(list, ev);
  if (!ser) return { events: dropEvent(events, ev.id), list };
  if (scope === 'this') return { events: dropEvent(events, ev.id), list: list.map(x => (x.id === ser.id ? skipDay(x, ev.day) : x)) };
  return { events: removeFrom(events, ser.id, ev.day), list: list.map(x => (x.id === ser.id ? endSeries(x, ev.day) : x)) };
}
