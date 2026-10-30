import test from 'node:test';
import assert from 'node:assert/strict';
import { syncGcalInto } from './gcalSync.js';

const mine = { id: 'm', title: 'Mine', day: 7 };
const old = { id: 'gcal_a_2026-10-07', source: 'gcal', date_iso: '2026-10-07' };
const outside = { id: 'gcal_z_2026-11-01', source: 'gcal', date_iso: '2026-11-01' };
const fresh = { id: 'gcal_b_2026-10-08', source: 'gcal', date_iso: '2026-10-08' };

test('a sync replaces imported events in range, keeps those outside, and never touches the user\'s own', () => {
  const out = syncGcalInto([mine, old, outside], [fresh], { startIso: '2026-10-05', endIso: '2026-10-11' });
  assert.deepEqual(out.map(e => e.id), ['m', 'gcal_z_2026-11-01', 'gcal_b_2026-10-08']);
});
test('syncing twice does not duplicate', () => {
  const once = syncGcalInto([mine], [fresh], { startIso: '2026-10-05', endIso: '2026-10-11' });
  assert.equal(syncGcalInto(once, [fresh], { startIso: '2026-10-05', endIso: '2026-10-11' }).filter(e => e.id === fresh.id).length, 1);
});
