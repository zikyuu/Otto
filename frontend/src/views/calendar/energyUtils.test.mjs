import test from 'node:test';
import assert from 'node:assert/strict';
import { minutesSinceMeeting, ENERGY_LEVELS } from './energyUtils.js';

const ev = (id, day, start, dur, category) => ({ id, day, startMin: start, durationMin: dur, category });

test('the most recent finished meeting today decides', () => {
  const es = [ev('a', 12, 540, 60, 'interview'), ev('b', 12, 600, 30, 'social'), ev('c', 12, 700, 30, 'leetcode')];
  assert.equal(minutesSinceMeeting(es, 12, 660), 30);              // b ended 10:30; c is not a meeting
});
test('a meeting still going, from another day, or long ago does not count', () => {
  assert.equal(minutesSinceMeeting([ev('a', 12, 600, 120, 'interview')], 12, 660), null);
  assert.equal(minutesSinceMeeting([ev('a', 11, 600, 30, 'interview')], 12, 660), null);
  assert.equal(minutesSinceMeeting([ev('a', 12, 300, 30, 'interview')], 12, 660), null);
});
test('five levels, 5 = energised down to 1 = drained', () => {
  assert.deepEqual(ENERGY_LEVELS.map(l => l.level), [5, 4, 3, 2, 1]);
});

import { minutesSinceHard, previousCategory, daysToDeadline } from './energyUtils.js';

test('hard work that just ended is noticed, short or easy blocks are not', () => {
  const evs = [{ day: 5, startMin: 540, durationMin: 120, category: 'llm' }, { day: 5, startMin: 700, durationMin: 30, category: 'leetcode' }, { day: 5, startMin: 600, durationMin: 120, category: 'admin' }];
  assert.equal(minutesSinceHard(evs, 5, 690 + 30), 60);
  assert.equal(minutesSinceHard(evs, 5, 540 + 120 + 200), null);      // too long ago
  assert.equal(minutesSinceHard(evs, 6, 700), null);                  // another day
});

test('the block before this one is the latest one that ended by its start, same day', () => {
  const evs = [{ id: 'a', day: 5, startMin: 540, durationMin: 60, category: 'admin' }, { id: 'b', day: 5, startMin: 600, durationMin: 30, category: 'gym' }, { id: 'c', day: 6, startMin: 600, durationMin: 30, category: 'llm' }, { id: 'd', day: 5, startMin: 660, durationMin: 60, category: 'llm' }];
  assert.equal(previousCategory(evs, evs[3]), 'gym');
  assert.equal(previousCategory(evs, evs[0]), null);
});

test('days to a deadline are whole days from the day it was done', () => {
  assert.equal(daysToDeadline('2026-10-15', '2026-10-13'), 2);
  assert.equal(daysToDeadline('2026-10-12T10:00', '2026-10-13'), -1);
  assert.equal(daysToDeadline(null, '2026-10-13'), null);
});
