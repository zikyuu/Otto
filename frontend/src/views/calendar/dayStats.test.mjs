import test from 'node:test';
import assert from 'node:assert/strict';
import { freeMinutesLeft, nextEvent } from './dayStats.js';

const e = (day, startMin, durationMin) => ({ day, startMin, durationMin });

test('free time is what is left of the day minus what events cover, counting overlaps once', () => {
  const evs = [e(13, 600, 60), e(13, 630, 60), e(13, 900, 30), e(14, 600, 600)];
  assert.equal(freeMinutesLeft(evs, 13, 540), (1380 - 540) - 90 - 30);        // 10:00-11:30 and 15:00-15:30
});
test('the part of an event that already passed does not count, and time before the day starts is ignored', () => {
  assert.equal(freeMinutesLeft([e(13, 600, 120)], 13, 660), 1380 - 660 - 60);
  assert.equal(freeMinutesLeft([], 13, 300), 1380 - 480);
  assert.equal(freeMinutesLeft([], 13, 1400), 0);
});
test('the next event is the earliest one that has not started', () => {
  const evs = [e(13, 600, 30), e(13, 900, 30), e(13, 700, 30)];
  assert.equal(nextEvent(evs, 13, 650).startMin, 700);
  assert.equal(nextEvent(evs, 13, 1000), null);
});
