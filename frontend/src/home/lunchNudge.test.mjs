import test from 'node:test';
import assert from 'node:assert/strict';
import { nudgeFor } from './lunchNudge.js';

const base = { nowMin: 13 * 60, today: '2026-10-15', shownOn: null, target: 15, current: 25 };

test('a reminder at lunch, in the person\'s own words, once a day', () => {
  const n = nudgeFor(base);
  assert.match(n.text, /Freshen up!! You promised you would stop your doomscroll in 15 min this time!/);
  assert.match(n.sub, /about 25 min/);
  assert.equal(nudgeFor({ ...base, shownOn: '2026-10-15' }), null);
});

test('only around lunch, and only when a target has been set', () => {
  assert.equal(nudgeFor({ ...base, nowMin: 11 * 60 }), null);
  assert.equal(nudgeFor({ ...base, nowMin: 15 * 60 }), null);
  assert.equal(nudgeFor({ ...base, target: null }), null);
  assert.equal(nudgeFor({ ...base, snoozedUntil: 14 * 60 }), null);
  assert.ok(nudgeFor({ ...base, nowMin: 14 * 60, snoozedUntil: 14 * 60 }));
});

test('when the slump is already at or under the target it says keep going', () => {
  assert.match(nudgeFor({ ...base, current: 12 }).sub, /already close/);
});
