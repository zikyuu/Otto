import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWindow, mergeWindows, clipInfo, affectedEvents, applyClipChoices, diffEvents } from './selectionMath.js';

const ev = (id, day, startMin, durationMin, extra = {}) => ({ id, title: id, day, startMin, durationMin, ...extra });
const w = (day, start, end) => ({ day, start, end });

test('a dragged window snaps to the grid and is at least 15 minutes', () => {
  assert.deepEqual(makeWindow(3, 607, 544), { day: 3, start: 540, end: 600 });
  assert.deepEqual(makeWindow(3, 600, 603), { day: 3, start: 600, end: 615 });
  assert.equal(makeWindow(3, 1430, 1440, 15, 15, 0, 1430), null);
});

test('touching or overlapping windows merge, different days do not', () => {
  assert.deepEqual(mergeWindows([w(1, 600, 660), w(1, 650, 720), w(1, 720, 780), w(2, 600, 660)]),
    [w(1, 600, 780), w(2, 600, 660)]);
});

test('events are untouched, fully covered, or clipped', () => {
  const ws = [w(1, 600, 660)];
  assert.equal(clipInfo(ev('a', 1, 700, 30), ws).kind, 'none');
  assert.equal(clipInfo(ev('a', 2, 600, 30), ws).kind, 'none');
  assert.equal(clipInfo(ev('a', 1, 610, 30), ws).kind, 'inside');
  const c = clipInfo(ev('a', 1, 630, 60), ws);       // 10:30-11:30, window 10:00-11:00
  assert.deepEqual([c.kind, c.keep, c.lost], ['clipped', { start: 660, end: 690 }, 30]);
  const t = clipInfo(ev('a', 1, 570, 60), ws);       // 9:30-10:30, covered 10:00-10:30
  assert.deepEqual([t.keep, t.lost], [{ start: 570, end: 600 }, 30]);
});

test('an event that spans a window keeps its longer side', () => {
  const c = clipInfo(ev('a', 1, 540, 240), [w(1, 600, 630)]);   // 9:00-13:00, window 10:00-10:30
  assert.deepEqual(c.keep, { start: 630, end: 780 });
  assert.equal(c.lost, 90);
});

test('locked events are never offered for a decision', () => {
  const list = affectedEvents([ev('a', 1, 600, 60, { fixed: true }), ev('b', 1, 600, 60)], [w(1, 600, 660)]);
  assert.deepEqual(list.map(x => x.ev.id), ['b']);
});

test('clip choices: whole leaves it, cut shortens it, split adds the covered part as its own event', () => {
  const events = [ev('a', 1, 630, 60, { subtasks: [{ id: 's' }] })];
  const ws = [w(1, 600, 660)];
  assert.deepEqual(applyClipChoices(events, ws, {}), events);
  const cut = applyClipChoices(events, ws, { a: 'cut' });
  assert.deepEqual(cut.map(e => [e.id, e.startMin, e.durationMin]), [['a', 660, 30]]);
  assert.equal('subtasks' in cut[0], false);
  const split = applyClipChoices(events, ws, { a: 'split' });
  assert.deepEqual(split.map(e => [e.id, e.startMin, e.durationMin]), [['a', 660, 30], ['a~rest', 630, 30]]);
  assert.equal(split[1].title, 'a (rest)');
});

test('the diff names what moved, resized, appeared or went', () => {
  const before = [ev('a', 1, 600, 60), ev('b', 1, 700, 30), ev('c', 2, 600, 30), ev('x', 2, 900, 30)];
  const after = [ev('a', 1, 660, 60), ev('b', 1, 700, 45), ev('c', 2, 600, 30), ev('n', 3, 600, 30)];
  const d = Object.fromEntries(diffEvents(before, after).map(x => [x.id, x.kind]));
  assert.deepEqual(d, { a: 'moved', b: 'resized', n: 'added', x: 'removed' });
});
