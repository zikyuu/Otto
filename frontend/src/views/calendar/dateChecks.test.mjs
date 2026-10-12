// Run: node --test src/views/calendar/dateChecks.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDates } from './dateChecks.js';

const base = { eventIso: '2026-10-14', todayIso: '2026-10-11' };

test('a deadline 25 years in the past is flagged', () => {
  assert.equal(checkDates({ ...base, deadline: '2001-10-05' }).deadline, 'That date has already passed');
});

test('best-done-by in the past is flagged too', () => {
  assert.equal(checkDates({ ...base, bestDoneBy: '2001-10-04' }).bestDoneBy, 'That date has already passed');
});

test('same day as the event is fine; the day before is not', () => {
  assert.deepEqual(checkDates({ ...base, deadline: '2026-10-14' }), {});
  assert.match(checkDates({ ...base, deadline: '2026-10-13' }).deadline, /before this event/);
});

test('future dates are fine', () => {
  assert.deepEqual(checkDates({ ...base, deadline: '2026-12-01', bestDoneBy: '2026-11-20' }), {});
});

test('best-done-by after the deadline is flagged', () => {
  assert.match(checkDates({ ...base, deadline: '2026-10-20', bestDoneBy: '2026-10-25' }).bestDoneBy, /on or before the deadline/);
});

test('today is allowed when the event is today', () => {
  assert.deepEqual(checkDates({ eventIso: '2026-10-11', todayIso: '2026-10-11', deadline: '2026-10-11' }), {});
});

test('empty and half-typed values are not errors until they are a full bad date', () => {
  assert.deepEqual(checkDates({ ...base, deadline: '', bestDoneBy: '' }), {});
  assert.equal(checkDates({ ...base, deadline: '20000-01-01' }).deadline, 'Enter a full date');
});

test('a past event day does not lower the floor below today', () => {
  const r = checkDates({ eventIso: '2026-10-05', todayIso: '2026-10-11', deadline: '2026-10-08' });
  assert.equal(r.deadline, 'That date has already passed');
});
