import test from 'node:test';
import assert from 'node:assert/strict';
import { todaySummary, currentTask, planItems, toggleItem, isDone, isMissed, todaysBlocks } from './today.js';

const ev = (id, day, start, dur, extra = {}) => ({ id, title: id, day, startMin: start, durationMin: dur, ...extra });

test('done means ticked or reflected; missed means flexible, over, and neither', () => {
  assert.deepEqual([{ done: true }, { reflection: { choice: 'nailed' } }, {}].map(isDone), [true, true, false]);
  const e = ev('a', 13, 540, 60);
  assert.equal(isMissed(e, 700), true);
  assert.equal(isMissed(e, 570), false);
  assert.equal(isMissed({ ...e, done: true }, 700), false);
  assert.equal(isMissed({ ...e, fixed: true }, 700), false);
});
test('the summary counts fixed events, flexible blocks still to do, and what is due today', () => {
  const s = todaySummary({
    day: 13, nowMin: 600,
    events: [ev('call', 13, 540, 30, { fixed: true }), ev('b', 13, 660, 60), ev('c', 13, 800, 30), ev('done', 13, 700, 30, { done: true }), ev('d', 14, 540, 30)],
    radar: [{ days: -2 }, { days: 0 }, { days: 1 }],
  });
  assert.deepEqual([s.events, s.tasks, s.hard, s.overdue], [1, 2, 1, 1]);
  assert.deepEqual(s.upcoming.map(e => e.id), ['b', 'c']);
});
test('today\'s blocks come in time order', () => {
  assert.deepEqual(todaysBlocks([ev('b', 13, 700, 5), ev('a', 13, 600, 5), ev('x', 14, 0, 5)], 13).map(e => e.id), ['a', 'b']);
});
test('the current task is what is happening now, else the next flexible one; finished and locked ones never are', () => {
  const events = [ev('lock', 13, 540, 120, { fixed: true }), ev('work', 13, 600, 60), ev('later', 13, 900, 60), ev('finished', 13, 650, 30, { done: true })];
  assert.deepEqual([currentTask({ events, day: 13, nowMin: 620 }).state, currentTask({ events, day: 13, nowMin: 620 }).event.id], ['now', 'work']);
  assert.deepEqual([currentTask({ events, day: 13, nowMin: 700 }).state, currentTask({ events, day: 13, nowMin: 700 }).event.id], ['next', 'later']);
  assert.equal(currentTask({ events, day: 13, nowMin: 1200 }), null);
});
test('subtasks and checklist items share one list and tick independently', () => {
  const e = ev('x', 13, 600, 60, { subtasks: [{ id: 'a', name: 'Chunk', minutes: 30 }], checklist: [{ id: 'k', text: 'Warm up', done: false }] });
  const items = planItems(e);
  assert.deepEqual(items.map(i => [i.text, i.minutes, i.done]), [['Chunk', 30, false], ['Warm up', null, false]]);
  let evs = toggleItem([e, ev('y', 13, 0, 5)], 'x', items[0]);
  evs = toggleItem(evs, 'x', items[1]);
  assert.deepEqual(planItems(evs[0]).map(i => i.done), [true, true]);
  assert.equal(evs[1].subtasks, undefined);
  assert.equal(planItems(toggleItem(evs, 'x', items[0])[0])[0].done, false);
});
