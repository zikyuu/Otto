import test from 'node:test';
import assert from 'node:assert/strict';
import { ageDays, stale, keep, someday, drop, reopen, ageLabel, isStale } from './grinderAge.js';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const at = d => new Date(NOW - d * 86400000).toISOString();
const list = () => [{ id: 'a', parked_iso: at(6) }, { id: 'b', parked_iso: at(4) }, { id: 'c', parked_iso: at(9), someday: true }, { id: 'd' }];

test('an item is stale from the fifth day, unless filed as someday', () => {
  assert.deepEqual(stale(list(), NOW).map(i => i.id), ['a']);
  assert.equal(isStale({ parked_iso: at(5) }, NOW), true);
  assert.equal(isStale({ parked_iso: at(4) }, NOW), false);
});

test('an item with no date never nags', () => {
  assert.equal(ageDays({}, NOW), 0);
  assert.equal(isStale({}, NOW), false);
});

test('keep restarts the clock, someday stops the nudges, delete removes', () => {
  const kept = keep(list(), 'a', NOW);
  assert.equal(ageDays(kept[0], NOW), 0);
  assert.equal(kept[0].kept, 1);
  assert.deepEqual(stale(kept, NOW), []);
  assert.equal(someday(list(), 'a')[0].someday, true);
  assert.deepEqual(stale(someday(list(), 'a'), NOW), []);
  assert.deepEqual(drop(list(), 'a').map(i => i.id), ['b', 'c', 'd']);
  const back = reopen(list(), 'c', NOW);
  assert.equal(back[2].someday, false);
  assert.equal(ageDays(back[2], NOW), 0);
});

test('age reads in plain words', () => {
  assert.equal(ageLabel({ parked_iso: at(0) }, NOW), 'today');
  assert.equal(ageLabel({ parked_iso: at(1) }, NOW), '1 day');
  assert.equal(ageLabel({ parked_iso: at(6) }, NOW), '6 days');
});
