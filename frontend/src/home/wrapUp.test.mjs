import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapUp, quickReflection, WRAP_FROM_MIN } from './wrapUp.js';

const ev = (id, day, start, dur, extra = {}) => ({ id, title: id, day, startMin: start, durationMin: dur, ...extra });

test('only finished, flexible blocks of today are asked about', () => {
  const w = wrapUp({
    today: 13, tomorrow: 14, nowMin: 18 * 60,
    events: [ev('a', 13, 540, 60), ev('b', 13, 600, 60, { reflection: { choice: 'nailed' } }), ev('c', 13, 17 * 60, 120), ev('lock', 13, 540, 30, { fixed: true }), ev('d', 12, 540, 60), ev('t1', 14, 600, 30), ev('t0', 14, 540, 30)],
    tasks: [{ k: '1', checked: true }, { k: '2', checked: false }],
  });
  assert.deepEqual(w.unreflected.map(e => e.id), ['a']);
  assert.equal(w.reflected, 1);
  assert.equal(w.tomorrowFirst.id, 't0');
  assert.deepEqual([w.doneTasks, w.openTasks.length, w.show], [1, 1, true]);
});
test('it only shows from five in the afternoon', () => {
  assert.equal(wrapUp({ today: 13, tomorrow: 14, nowMin: WRAP_FROM_MIN - 1 }).show, false);
});
test('quick answers map to planned vs actual minutes', () => {
  const e = ev('a', 13, 540, 60);
  assert.equal(quickReflection(e, 'nailed').actualMin, 60);
  assert.equal(quickReflection(e, 'harder').actualMin, 80);                 // 78 rounded to the 5-minute step
  assert.equal(quickReflection(e, 'interrupted').actualMin, 0);
  assert.equal(quickReflection(e, 'nailed', 5).reflection.at, 5);
  assert.equal(quickReflection(e, 'nailed').reflection.quick, true);
});
