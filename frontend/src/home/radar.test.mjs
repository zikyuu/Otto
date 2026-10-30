import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRadar, radarTone } from './radar.js';

const TODAY = '2026-10-13';

test('events, milestones and reminders share one list, most urgent first', () => {
  const r = buildRadar({
    today: TODAY,
    events: [{ id: 'a', title: 'Apply to 3 roles', deadline_iso: '2026-10-16', hard_deadline: true }, { id: 'b', title: 'No deadline' }],
    goals: [{ id: 'g', title: 'Ship a RAG app', milestones: [{ id: 'm1', title: 'Build retrieval', due: '2026-10-11' }, { id: 'm2', title: 'Deploy', due: '2026-11-20' }, { id: 'm3', title: 'Done one', due: '2026-10-01', done: true }] }],
    reminders: [{ id: 'r1', text: 'Pay rent', due: '2026-10-14', repeat: 'monthly' }, { id: 'r2', text: 'Whenever', due: null }, { id: 'r3', text: 'Finished', due: '2026-10-13', done: true }],
  });
  assert.deepEqual(r.map(x => [x.kind, x.title, x.days]), [['milestone', 'Build retrieval', -2], ['reminder', 'Pay rent', 1], ['event', 'Apply to 3 roles', 3], ['milestone', 'Deploy', 38]]);
  assert.equal(r[1].sub, 'repeats monthly');
});
test('the same title on the same day shows once, sessions lose their (n/m)', () => {
  const r = buildRadar({ today: TODAY, events: [{ id: 'a', title: 'Thesis (1/3)', deadline_iso: '2026-10-20' }, { id: 'b', title: 'Thesis (2/3)', deadline_iso: '2026-10-20' }] });
  assert.deepEqual(r.map(x => x.title), ['Thesis']);
});
test('reflected events drop off, the list is capped', () => {
  const evs = Array.from({ length: 12 }, (_, i) => ({ id: `e${i}`, title: `T${i}`, deadline_iso: `2026-10-${14 + i}` }));
  evs[0].reflection = { choice: 'nailed' };
  assert.equal(buildRadar({ today: TODAY, events: evs }).length, 7);
  assert.equal(buildRadar({ today: TODAY, events: evs })[0].title, 'T1');
});
test('tone bands', () => { assert.deepEqual([-1, 0, 3, 4].map(radarTone), ['overdue', 'soon', 'soon', 'later']); });
