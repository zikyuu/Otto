import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestRoom, prereqClosure } from './roomSuggest.js';

const ev = (id, day, startMin, durationMin, extra = {}) => ({ id, title: id, day, startMin, durationMin, ...extra });
const DAYS = [12, 13, 14, 15, 16, 17, 18];
const free = () => 480;                                  // nothing has passed

test('the closure is everything the dependent waits for, directly or not', () => {
  const es = [ev('a', 12, 540, 60), ev('b', 12, 600, 60, { prereq_ids: ['a'] }), ev('c', 13, 540, 30, { prereq_ids: ['b'] }), ev('x', 13, 700, 30)];
  assert.deepEqual([...prereqClosure(es, 'c')].sort(), ['a', 'b']);
});

test('a short need is covered by the stretch just before the dependent, on its own day', () => {
  const es = [ev('prep', 14, 11 * 60, 60), ev('apply', 13, 14 * 60, 30, { prereq_ids: ['prep'] })];
  const r = suggestRoom({ events: es, dependentId: 'apply', weekDayNums: DAYS, earliestFree: free });
  assert.equal(r.enough, true);
  assert.equal(r.windows.length, 1);
  assert.equal(r.windows[0].day, 13);
  assert.equal(r.windows[0].end, 14 * 60);                       // ends where the dependent starts
  assert.ok(r.windows[0].end - r.windows[0].start >= 60 && r.windows[0].end - r.windows[0].start <= 90);   // 60 min of work + padding, not the whole day
});

test('a long need spills onto the day before', () => {
  const es = [ev('prep', 15, 9 * 60, 8 * 60), ev('apply', 13, 10 * 60, 30, { prereq_ids: ['prep'] })];   // 8h of prep, 2h of room that day
  const r = suggestRoom({ events: es, dependentId: 'apply', weekDayNums: DAYS, earliestFree: free });
  assert.deepEqual(r.windows.map(w => w.day), [13, 12]);
  assert.equal(r.windows[1].end, 1380);
});

test('locked events do not count as clearable time', () => {
  const es = [ev('prep', 14, 9 * 60, 60), ev('apply', 13, 12 * 60, 30, { prereq_ids: ['prep'] }), ev('meeting', 13, 10 * 60, 60, { fixed: true })];
  const r = suggestRoom({ events: es, dependentId: 'apply', weekDayNums: DAYS, earliestFree: free });
  const w = r.windows[0];
  assert.ok(w.start < 10 * 60, 'stretches back past the locked meeting (10:00-11:00) to find enough time');
  assert.ok(w.start >= 9 * 60, 'but no further than needed');
});

test('time that has already passed is never suggested, and a lack of room is reported', () => {
  const es = [ev('prep', 14, 9 * 60, 5 * 60), ev('apply', 13, 9 * 60, 30, { prereq_ids: ['prep'] })];
  const r = suggestRoom({ events: es, dependentId: 'apply', weekDayNums: DAYS, earliestFree: day => (day === 12 ? 1380 : 8 * 60) });
  assert.equal(r.enough, false);
  assert.ok(r.windows.every(w => w.day !== 12));
});

test('prerequisites already finished before the dependent need no room', () => {
  const es = [ev('prep', 12, 9 * 60, 60), ev('apply', 13, 10 * 60, 30, { prereq_ids: ['prep'] })];
  const r = suggestRoom({ events: es, dependentId: 'apply', weekDayNums: DAYS, earliestFree: free });
  assert.deepEqual(r, { windows: [], need: 0, enough: true });
});

test('a chain counts every link that is still in the way', () => {
  const es = [ev('p1', 15, 9 * 60, 60), ev('p2', 15, 11 * 60, 60, { prereq_ids: ['p1'] }), ev('apply', 13, 15 * 60, 30, { prereq_ids: ['p2'] })];
  const r = suggestRoom({ events: es, dependentId: 'apply', weekDayNums: DAYS, earliestFree: free });
  assert.ok(r.need >= 135 && r.need <= 150);
});
