import test from 'node:test';
import assert from 'node:assert/strict';
import { dropTarget, clashes, allowed } from './planDrag.js';

const base = { rect: { left: 100, top: 50, width: 700 }, numDays: 7, pxPerMin: 1.4, dayStart: 480, dayEnd: 1380, duration: 60 };

test('the column comes from x, the start from y, snapped to 15 minutes', () => {
  assert.deepEqual(dropTarget({ ...base, x: 100 + 250, y: 50 + 140 }), { col: 2, startMin: 585 });         // 580 snaps to 585
  assert.equal(dropTarget({ ...base, x: 10, y: 50 }).col, 0);
  assert.equal(dropTarget({ ...base, x: 5000, y: 50 }).col, 6);
});
test('the grab point stays under the cursor; the block stays inside the day', () => {
  assert.equal(dropTarget({ ...base, x: 150, y: 50 + 140, grabMin: 30 }).startMin, 555);
  assert.equal(dropTarget({ ...base, x: 150, y: 50 - 500 }).startMin, 480);
  assert.equal(dropTarget({ ...base, x: 150, y: 50 + 5000 }).startMin, 1380 - 60);
});
test('locked events and other sessions are reported as clashes; flexible events are not', () => {
  const s = { id: 's1', day: 13, startMin: 600, durationMin: 60, title: 'Embeddings' };
  const events = [{ id: 'a', day: 13, startMin: 630, durationMin: 30, fixed: true, title: 'Call' }, { id: 'b', day: 13, startMin: 600, durationMin: 60, title: 'Flexible' }, { id: 'c', day: 14, startMin: 600, durationMin: 60, fixed: true, title: 'Other day' }];
  assert.deepEqual(clashes(s, events, [s, { id: 's2', day: 13, startMin: 650, durationMin: 30, title: 'Embeddings' }]), [{ kind: 'locked', title: 'Call' }, { kind: 'session', title: 'Embeddings' }]);
  assert.deepEqual(clashes(s, [], [s]), []);
});
test('no past days and no past minutes of today', () => {
  const t = { todayCol: 2, nowMin: 600 };
  assert.deepEqual([{ col: 1, startMin: 900 }, { col: 2, startMin: 540 }, { col: 2, startMin: 600 }, { col: 3, startMin: 480 }].map(x => allowed(x, t)), [false, false, true, true]);
  assert.equal(allowed({ col: 0, startMin: 480 }, { todayCol: -1, nowMin: 0 }), true);       // today is not on screen
});
