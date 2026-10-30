import test from 'node:test';
import assert from 'node:assert/strict';
import { localStamp } from './clientClock.js';

test('the stamp is the local wall clock, zero padded, with no zone', () => {
  assert.equal(localStamp(new Date(2026, 9, 5, 7, 3, 9)), '2026-10-05T07:03:09');
  assert.equal(localStamp(new Date(2026, 11, 31, 23, 59, 0)), '2026-12-31T23:59:00');
});
