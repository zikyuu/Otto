import test from 'node:test';
import assert from 'node:assert/strict';
import { dayNum, dateOfDay, isoOfDay, dayOfIso, isLegacyDay, legacyToDay, migrateEvents, getDays } from './calendarUtils.js';

test('a day number is whole days since 1970 and survives a round trip', () => {
  assert.equal(dayNum(new Date(1970, 0, 1)), 0);
  assert.equal(dayNum(new Date(2026, 9, 13)), 20739);
  assert.equal(isoOfDay(20739), '2026-10-13');
  assert.equal(dayOfIso('2026-10-13'), 20739);
  assert.equal(dateOfDay(20739).getDate(), 13);
});

test('consecutive dates are consecutive numbers across month, year and daylight-saving changes', () => {
  assert.equal(dayNum(new Date(2026, 10, 1)) - dayNum(new Date(2026, 9, 31)), 1);
  assert.equal(dayNum(new Date(2027, 0, 1)) - dayNum(new Date(2026, 11, 31)), 1);
  assert.equal(dayNum(new Date(2026, 9, 26)) - dayNum(new Date(2026, 9, 25)), 1);        // the clocks go back in Europe
  assert.equal(dayNum(new Date(2026, 2, 30)) - dayNum(new Date(2026, 2, 29)), 1);
});

test('a week of dates gives seven different numbers, even across a month end', () => {
  const nums = getDays(0, 14).map(dayNum);
  assert.equal(new Set(nums).size, 14);
  assert.ok(nums.every((n, i) => i === 0 || n === nums[i - 1] + 1));
});

test('old events that only know the date of the month are placed at the nearest such date', () => {
  const today = new Date(2026, 9, 13);                                   // 13 Oct 2026
  assert.equal(isLegacyDay(13), true); assert.equal(isLegacyDay(20739), false);
  assert.equal(isoOfDay(legacyToDay(15, today)), '2026-10-15');
  assert.equal(isoOfDay(legacyToDay(1, today)), '2026-10-01');
  assert.equal(isoOfDay(legacyToDay(31, today)), '2026-10-31');
  assert.equal(isoOfDay(legacyToDay(29, new Date(2026, 10, 2))), '2026-10-29');       // 2 Nov: 29th is last month, not the 29th of Nov
  assert.equal(isoOfDay(legacyToDay(30, new Date(2026, 0, 30))), '2026-01-30');       // no 30 Feb: the one in January
});

test('migrating leaves modern events alone and fixes only the old ones', () => {
  const today = new Date(2026, 9, 13);
  const modern = [{ id: 'a', day: 20739 }];
  assert.equal(migrateEvents(modern, today), modern);
  const out = migrateEvents([{ id: 'a', day: 20739 }, { id: 'b', day: 16 }], today);
  assert.deepEqual(out.map(e => e.day), [20739, dayOfIso('2026-10-16')]);
});
