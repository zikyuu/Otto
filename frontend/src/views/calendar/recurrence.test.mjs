import test from 'node:test';
import assert from 'node:assert/strict';
import { weekdayOf, matches, occurrences, makeSeries, materialize, ensureHorizon, splitSeries, removeFrom, skipDay, endSeries, describeRule, instanceId, PRESETS, templateOf } from './recurrence.js';
import { dayOfIso, isoOfDay } from './calendarUtils.js';

const D = iso => dayOfIso(iso);
const ev = (id, iso, extra = {}) => ({ id, title: 'Standup', day: D(iso), startMin: 540, durationMin: 30, category: 'social', fixed: true, ...extra });

test('weekdays are right: Monday is 0', () => {
  assert.equal(weekdayOf(D('2026-10-12')), 0);                    // Monday
  assert.equal(weekdayOf(D('2026-10-18')), 6);                    // Sunday
  assert.equal(weekdayOf(D('1970-01-01')), 3);                    // a Thursday
});

test('every day, every weekday, and chosen weekdays', () => {
  const start = D('2026-10-12');
  assert.deepEqual(occurrences({ rule: PRESETS.daily, start, until: null, exceptions: {} }, start, start + 6).length, 7);
  const wk = occurrences({ rule: PRESETS.weekdays, start, until: null, exceptions: {} }, start, start + 13).map(isoOfDay);
  assert.deepEqual(wk, ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
  const thuFri = occurrences({ rule: { freq: 'weekly', days: [3, 4], interval: 1 }, start, until: null, exceptions: {} }, start, start + 13).map(isoOfDay);
  assert.deepEqual(thuFri, ['2026-10-15', '2026-10-16', '2026-10-22', '2026-10-23']);
});

test('weekly with no days repeats on the weekday of the first event; every second week skips alternate weeks', () => {
  const start = D('2026-10-14');                                  // a Wednesday
  assert.deepEqual(occurrences({ rule: PRESETS.weekly, start, until: null, exceptions: {} }, start, start + 21).map(isoOfDay), ['2026-10-14', '2026-10-21', '2026-10-28', '2026-11-04']);
  assert.deepEqual(occurrences({ rule: { freq: 'weekly', days: [2], interval: 2 }, start, until: null, exceptions: {} }, start, start + 30).map(isoOfDay), ['2026-10-14', '2026-10-28', '2026-11-11']);
});

test('monthly keeps the date and falls on the last day of a shorter month', () => {
  const start = D('2026-01-31');
  const got = occurrences({ rule: PRESETS.monthly, start, until: null, exceptions: {} }, start, D('2026-05-31')).map(isoOfDay);
  assert.deepEqual(got, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  assert.equal(matches({ freq: 'monthly', interval: 2 }, D('2026-01-15'), D('2026-02-15')), false);
  assert.equal(matches({ freq: 'monthly', interval: 2 }, D('2026-01-15'), D('2026-03-15')), true);
});

test('until stops a series, a skipped day is left out, nothing before the start', () => {
  const start = D('2026-10-12');
  const s = { rule: PRESETS.daily, start, until: start + 3, exceptions: { [start + 1]: 'skip' } };
  assert.deepEqual(occurrences(s, start - 5, start + 10), [start, start + 2, start + 3]);
});

test('occurrences become ordinary events with stable ids, never twice', () => {
  const first = ev('x', '2026-10-12', { subtasks: [{ id: 'a', name: 'A', minutes: 10, done: true }], checklist: [{ id: 'c', text: 'Agenda', done: true }] });
  const s = makeSeries(first, PRESETS.weekdays);
  const week = materialize(s, [], D('2026-10-12'), D('2026-10-18'));
  assert.equal(week.length, 5);
  assert.ok(week.every(e => e.series_id === s.id && e.id === instanceId(s.id, e.day) && e.title === 'Standup'));
  assert.equal(week[0].subtasks[0].done, undefined);                       // every occurrence starts fresh
  assert.equal(week[0].checklist[0].done, false);
  assert.equal(materialize(s, week, D('2026-10-12'), D('2026-10-18')).length, 0);
});

test('topping up the horizon adds only what is missing, and the same array comes back when nothing is', () => {
  const s = makeSeries(ev('x', '2026-10-12'), PRESETS.daily);
  const t = D('2026-10-13');
  const once = ensureHorizon([s], [], t, 14);
  assert.ok(once.length >= 14 && once.length <= 22);
  assert.equal(ensureHorizon([s], once, t, 14), once);
  assert.ok(ensureHorizon([s], once, t + 7, 14).length > once.length);
});

test('a deleted occurrence stays deleted; "this and following" splits the series', () => {
  const first = ev('x', '2026-10-12');
  const s = makeSeries(first, PRESETS.daily);
  const events = materialize(s, [], D('2026-10-12'), D('2026-10-20'));
  const skipped = skipDay(s, D('2026-10-14'));
  assert.equal(materialize(skipped, events.filter(e => e.day !== D('2026-10-14')), D('2026-10-12'), D('2026-10-20')).length, 0);
  const { before, after } = splitSeries(s, D('2026-10-16'), { template: { startMin: 600 } });
  assert.equal(before.until, D('2026-10-15'));
  assert.equal(after.start, D('2026-10-16'));
  assert.equal(after.template.startMin, 600);
  assert.notEqual(after.id, before.id);
  const kept = removeFrom(events, s.id, D('2026-10-16'));
  assert.equal(kept.length, 4);
  assert.deepEqual(occurrences(endSeries(s, D('2026-10-16')), D('2026-10-12'), D('2026-10-30')).length, 4);
});

test('the rule reads in plain words', () => {
  const s = D('2026-10-13');
  assert.equal(describeRule(null, s), 'Does not repeat');
  assert.equal(describeRule(PRESETS.daily, s), 'Every day');
  assert.equal(describeRule(PRESETS.weekdays, s), 'Every weekday');
  assert.equal(describeRule({ freq: 'weekly', days: [3, 4], interval: 1 }, s), 'Every Thu, Fri');
  assert.equal(describeRule({ freq: 'weekly', days: [0], interval: 2 }, s), 'Every 2 weeks on Mon');
  assert.equal(describeRule(PRESETS.monthly, s), 'Every month on the 13th');
  assert.equal(describeRule({ freq: 'weekly', days: null, interval: 1 }, s), 'Every Tue');
});

test('a template keeps what defines the event and drops what belongs to one day', () => {
  const t = templateOf({ id: 'x', day: 5, series_id: 's', reflection: { choice: 'nailed' }, done: true, title: 'T', startMin: 60, durationMin: 30, category: 'gym' });
  assert.deepEqual(Object.keys(t).sort(), ['category', 'durationMin', 'startMin', 'title']);
});

test('renaming an event keeps the links that pointed at it', async () => {
  const { renameEvent } = await import('./recurrence.js');
  const out = renameEvent([{ id: 'a' }, { id: 'b', prereq_ids: ['a'] }, { id: 'c', grouped_with: ['a', 'b'] }], 'a', 'z');
  assert.deepEqual(out.map(e => e.id), ['z', 'b', 'c']);
  assert.deepEqual(out[1].prereq_ids, ['z']);
  assert.deepEqual(out[2].grouped_with, ['z', 'b']);
});

test('editing: an ordinary event becomes a series; "this and following" splits; "does not repeat" ends it', async () => {
  const { applyEdit, applyRemove } = await import('./recurrence.js');
  const base = { id: 'task_1', title: 'Gym', day: D('2026-10-13'), startMin: 600, durationMin: 60, category: 'gym' };
  const a = applyEdit({ events: [base], list: [], original: base, updated: base, repeat: { rule: PRESETS.weekdays }, horizon: 13 });
  assert.equal(a.list.length, 1);
  assert.equal(a.events.filter(e => e.id === instanceId(a.list[0].id, base.day)).length, 1);   // the first day is not doubled
  assert.equal(a.events.length, 10);                                                             // 13 Oct (Tue) .. 26 Oct, weekdays
  assert.equal(a.planId, instanceId(a.list[0].id, base.day));

  const orig = a.events.find(e => e.day === D('2026-10-20'));                                    // a Tuesday a week on
  const moved = { ...orig, startMin: 720 };
  const events = a.events.map(e => (e.id === orig.id ? moved : e));
  const b = applyEdit({ events, list: a.list, original: orig, updated: moved, repeat: { rule: PRESETS.daily }, scope: 'following', horizon: 6 });
  assert.equal(b.list.length, 2);
  assert.equal(b.list[0].until, D('2026-10-19'));
  assert.equal(b.events.filter(e => e.series_id === a.list[0].id).length, 5);                    // 13..19 Oct weekdays kept
  const later = b.events.filter(e => e.series_id === b.list[1].id);
  assert.equal(later.length, 7);                                                                 // daily from the 20th
  assert.ok(later.every(e => e.startMin === 720));

  const c = applyEdit({ events: b.events, list: b.list, original: later[0], updated: later[0], repeat: { rule: null }, scope: 'following' });
  assert.equal(c.events.filter(e => e.series_id === b.list[1].id).length, 0);
  assert.ok(c.events.some(e => e.id === c.planId && e.series_id === undefined));
  assert.equal(c.list[1].until, later[0].day - 1);

  const r1 = applyRemove({ events: a.events, list: a.list, ev: orig, scope: 'this' });
  assert.equal(r1.events.length, a.events.length - 1);
  assert.equal(r1.list[0].exceptions[orig.day], 'skip');
  const r2 = applyRemove({ events: a.events, list: a.list, ev: orig, scope: 'following' });
  assert.equal(r2.events.every(e => e.day < orig.day), true);
  assert.equal(r2.list[0].until, orig.day - 1);
});
