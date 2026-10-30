import test from 'node:test';
import assert from 'node:assert/strict';
import { goalNudges } from './goalNudge.js';

const TODAY = '2026-10-13';
const goal = (extra = {}) => ({ id: 'rag', title: 'Ship a production RAG app', milestones: [
  { id: 'a', title: 'Add embeddings and vector search', effort_h: 8, due: '2026-10-20', done: false, ...extra },
  { id: 'b', title: 'Deploy to a live URL', effort_h: 6, due: '2026-12-30', done: false }] });

test('the next milestone with little time booked is flagged, with how short it is', () => {
  const n = goalNudges({ goals: [goal()], events: [{ id: 'x', title: 'Add embeddings pgvector', durationMin: 60 }], today: TODAY });
  assert.equal(n.length, 1);
  assert.deepEqual([n[0].milestone, n[0].days, n[0].needMin, n[0].bookedMin, n[0].shortMin], ['Add embeddings and vector search', 7, 480, 60, 420]);
});
test('enough booked, or too far away, or finished: no nudge', () => {
  assert.equal(goalNudges({ goals: [goal()], events: [{ id: 'x', title: 'Embeddings vector deep dive', durationMin: 400 }], today: TODAY }).length, 0);
  assert.equal(goalNudges({ goals: [goal({ due: '2026-12-01' })], events: [], today: TODAY }).length, 0);
  assert.equal(goalNudges({ goals: [goal({ done: true })], events: [], today: TODAY }).length, 0);       // then the next one (Dec 30) is far
});
test('work already done on the milestone lowers what is needed; locked events do not count as planned work', () => {
  const n = goalNudges({ goals: [goal({ subtasks: [{ id: 1, t: 'a', done: true }, { id: 2, t: 'b', done: false }] })], events: [{ id: 'x', title: 'Embeddings meeting', durationMin: 500, fixed: true }], today: TODAY });
  assert.equal(n[0].needMin, 240);
  assert.equal(n[0].bookedMin, 0);
});
