import test from 'node:test';
import assert from 'node:assert/strict';
import { dragSleep, outsideAwake, withCrunch } from './sleepMath.js';

test('wake is dragged in half-hour steps, never before midnight or past noon', () => {
  assert.deepEqual(dragSleep('wake', 7 * 60 + 20, 480, 1380), { wake: 450, sleep: 1380 });     // 07:20 -> 07:30
  assert.deepEqual(dragSleep('wake', 9 * 60 + 50, 480, 1380), { wake: 600, sleep: 1380 });     // 09:50 -> 10:00
  assert.equal(dragSleep('wake', -100, 480, 1380).wake, 0);
  assert.equal(dragSleep('wake', 15 * 60, 480, 1380).wake, 720);                                // 12:00 at most
});
test('bedtime is dragged within the day and keeps a six hour day', () => {
  assert.equal(dragSleep('sleep', 22 * 60 + 10, 480, 1380).sleep, 1320);
  assert.equal(dragSleep('sleep', 23 * 60 + 50, 480, 1320).sleep, 1440);                        // as late as midnight by dragging
  assert.equal(dragSleep('sleep', 5000, 480, 1320).sleep, 1440);
  assert.equal(dragSleep('sleep', 10 * 60, 480, 1380).sleep, 840);                              // wake + 6h
});
test('wake cannot be dragged so late that the day is shorter than six hours', () => {
  assert.equal(dragSleep('wake', 12 * 60, 480, 17 * 60).wake, 660);
});

test('work that touches sleep hours is crunch work; moving it back clears the flag; locked events are left alone', () => {
  const night = { id: 'a', day: 13, startMin: 22 * 60, durationMin: 120 };       // 22:00 to midnight, awake until 23:00
  assert.equal(outsideAwake(night, 480, 1380), true);
  assert.equal(outsideAwake({ ...night, startMin: 9 * 60 }, 480, 1380), false);
  assert.equal(withCrunch(night, 480, 1380).crunch, true);
  assert.equal('crunch' in withCrunch({ ...night, startMin: 9 * 60, crunch: true }, 480, 1380), false);
  assert.equal(withCrunch({ ...night, fixed: true }, 480, 1380).crunch, undefined);
  assert.equal(outsideAwake({ ...night, startMin: 6 * 60, durationMin: 60 }, 480, 1380), true);          // before waking
});
