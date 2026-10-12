// Run: node --test src/views/calendar/subtaskMath.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { spread, refit, parseDuration, MIN_SUB } from './subtaskMath.js';

const sum = a => a.reduce((x, y) => x + y, 0);
const L = (...mins) => mins.map((m, i) => ({ id: i + 1, name: `s${i + 1}`, mins: m, pinned: false }));

test('spread always sums exactly to the amount (no stray minutes)', () => {
  for (let n = 1; n <= 7; n++) for (const amt of [60, 61, 80, 345, 7, 1000]) {
    for (const w of [Array(n).fill(1), Array.from({ length: n }, (_, i) => i + 1), Array.from({ length: n }, (_, i) => (i ? 0 : 5))]) {
      assert.equal(sum(spread(w, amt)), amt, `n=${n} amt=${amt} w=${w}`);
    }
  }
});

test('spread keeps ratios: 1:1:2 over 80 -> 20/20/40', () => {
  assert.deepEqual(spread([1, 1, 2], 80), [20, 20, 40]);
});

test('spread respects the minimum slice when there is room', () => {
  assert.ok(spread([100, 1, 1], 60).every(m => m >= MIN_SUB));
});

test('refit hits the block length exactly, pinned subtasks untouched', () => {
  const l = L(30, 30, 30); l[1].pinned = true;
  const out = refit(l, 120);
  assert.equal(sum(out.map(s => s.mins)), 120);
  assert.equal(out[1].mins, 30);
});

test('refit scales proportionally when the block grows or shrinks', () => {
  const out = refit(L(20, 20, 40), 160);
  assert.deepEqual(out.map(s => s.mins), [40, 40, 80]);
  const back = refit(out, 80);
  assert.deepEqual(back.map(s => s.mins), [20, 20, 40]);
});

test('dragging the pie never changes the block: refit after editing one slice', () => {
  // emulate handlePieDrag: set slice 0 to 45, treat as pinned, refit the rest
  let l = L(20, 20, 20); l[0] = { ...l[0], mins: 45, pinned: true };
  const out = refit(l, 60);
  assert.equal(sum(out.map(s => s.mins)), 60);
  assert.equal(out[0].mins, 45);
  assert.equal(out[1].mins + out[2].mins, 15);
});

test('repeated refits are stable (no drift on re-render)', () => {
  let l = L(33, 17, 10);
  for (let i = 0; i < 50; i++) l = refit(l, 60);
  assert.deepEqual(l.map(s => s.mins), [33, 17, 10]);
});

test("the spec example: ratio 1:1:2:1, subtask 2 set to 20 -> the other three share 40 as 10/20/10", () => {
  // 60m block at 1:1:2:1 = 12/12/24/12. User types 20 on subtask 2 and keeps the block at 60.
  let l = L(12, 12, 24, 12);
  l[1] = { ...l[1], mins: 20, pinned: true };
  const out = refit(l, 60);
  assert.deepEqual(out.map(s => s.mins), [10, 20, 20, 10]);
});

test('keep-the-ratios option: scaling by the edited subtask factor keeps every share', () => {
  // 12/12/24/12 (60m), subtask 2 -> 20: factor 20/12; everyone scales, block becomes 100
  const l = L(12, 12, 24, 12);
  const k = 20 / 12;
  const T = Math.round((60 * k) / 5) * 5;
  const others = spread([l[0].mins, l[2].mins, l[3].mins], T - 20, 1);
  assert.equal(T, 100);
  assert.deepEqual(others, [20, 40, 20]);
});

test('parseDuration reads the ways people type a block length', () => {
  const cases = { '2h': 120, '1h30': 90, '1h 30m': 90, '1.5h': 90, '90': 90, '90m': 90, '2': 120, '45': 45, '30 min': 30, '': 0, 'abc': 0 };
  for (const [input, want] of Object.entries(cases)) assert.equal(parseDuration(input), want, input);
});
