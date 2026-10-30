import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultKeep, sections, minutesOf, dueText, variantsOf } from './overwhelm.js';

const T = (id, minutes, extra = {}) => ({ id, minutes, kind: 'eventual', ...extra });

test('the hours given keep the most important work, in the order it was ranked, and a must-do always stays', () => {
  const tasks = [T('a', 120), T('b', 120), T('c', 60), T('d', 30)];
  assert.deepEqual(defaultKeep(tasks, 180), ['a', 'c']);                   // b does not fit, but the smaller one after it still can; then the hours are used up
  assert.deepEqual(defaultKeep(tasks, 210), ['a', 'c', 'd']);
  assert.deepEqual(defaultKeep(tasks, 0), []);
  assert.deepEqual(defaultKeep([T('m', 300, { must: true }), T('x', 30)], 60), ['m']);
});

test('what has a deadline coming is separated from what only has to happen eventually', () => {
  const s = sections([T('a', 1, { kind: 'deadline' }), T('b', 1), T('c', 1, { kind: 'deadline' })]);
  assert.deepEqual([s.soon.map(t => t.id), s.eventually.map(t => t.id)], [['a', 'c'], ['b']]);
  assert.equal(minutesOf([T('a', 30), T('b', 45)], ['b']), 45);
});

test('deadlines read plainly', () => {
  assert.equal(dueText({ days_left: 0 }), 'due today');
  assert.equal(dueText({ days_left: 1 }), 'due tomorrow');
  assert.equal(dueText({ days_left: 4 }), 'due in 4 days');
  assert.equal(dueText({ days_left: -2 }), '2 days overdue');
  assert.equal(dueText({ days_left: null }), null);
});

test('both plans go to the calendar, the one asked for first', () => {
  const v = () => ({ events: [], grinder: [], conflicts: [], decisions: [], warnings: [] });
  const plan = { suggested: v(), rest: v(), explanation: 'x' };
  assert.deepEqual(variantsOf(plan).map(x => x.key), ['suggested', 'rest']);
  assert.deepEqual(variantsOf(plan, { restFirst: true }).map(x => x.key), ['rest', 'suggested']);
});
