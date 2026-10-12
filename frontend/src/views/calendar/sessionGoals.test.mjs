import test from 'node:test';
import assert from 'node:assert/strict';
import {
  siblingsOf, displayTitle, planRows, setGoal, resetGoals, coverage, hasCustomGoals, workDone, reflectionMinutes, remainder, findFreeSlot, REFLECTIONS,
} from './sessionGoals.js';

const piece = (base_id, base_name, base_minutes, minutes, extra = {}) => ({ id: `${base_id}_x`, name: base_name, minutes, base_id, base_name, base_minutes, ...extra });
const session = (id, day, startMin, n, subtasks, extra = {}) => ({ id, title: `Essay (${n}/3)`, base_title: 'Essay', day, startMin, durationMin: 60, split_of: 'essay', session: n, sessions_total: 3, subtasks, ...extra });
const DAYS = [12, 13, 14, 15, 16, 17, 18];
const idx = d => DAYS.indexOf(d);

// research 120m (90 in S1, 30 in S2), write 60m (30 in S2, 30 in S3)
const S1 = session('s1', 12, 540, 1, [piece('r', 'Research', 120, 90)]);
const S2 = session('s2', 13, 540, 2, [piece('r', 'Research', 120, 30), piece('w', 'Write', 60, 30)]);
const S3 = session('s3', 14, 540, 3, [piece('w', 'Write', 60, 30)]);
const ALL = [S1, S2, S3];

test('with nothing set, the plan is Otto\'s own split, as a share of each whole subtask', () => {
  const rows = planRows(S2, ALL);
  assert.deepEqual(rows.map(r => [r.key, r.suggested, r.pct]), [['r', 25, 25], ['w', 50, 50]]);
  assert.equal(hasCustomGoals(S2), false);
});

test('every session lists ALL of the task\'s subtasks, so the user can pull in one Otto left out', () => {
  const rows = planRows(S1, ALL);                                         // Otto only put Research in session 1
  assert.deepEqual(rows.map(r => [r.key, r.suggested]), [['r', 75], ['w', 0]]);
  const out = setGoal(setGoal(ALL, 's1', 'r', 50), 's1', 'w', 50);       // half of subtask 1 and half of subtask 2
  assert.deepEqual(planRows(out.find(e => e.id === 's1'), out).map(r => [r.key, r.pct, r.minutes]), [['r', 50, 60], ['w', 50, 30]]);
});

test('older blocks without base_* fields still resolve to the whole subtask', () => {
  const old = (id, n, mins) => ({ id, title: 't', day: 12, startMin: 540, durationMin: mins, split_of: 'o', subtasks: [{ id: `a_${n}`, name: `few (part ${n})`, minutes: mins }] });
  const a = old('o1', 1, 60), b = old('o2', 2, 20);
  const rows = planRows(a, [a, b]);
  assert.deepEqual(rows.map(r => [r.key, r.name, r.totalMin, r.suggested]), [['a', 'few', 80, 75]]);
});

test('a single, unsplit event with subtasks plans all of each subtask', () => {
  const e = { id: 'one', title: 'One', day: 12, startMin: 540, durationMin: 60, subtasks: [{ id: 'a', name: 'A', minutes: 40 }, { id: 'b', name: 'B', minutes: 20 }] };
  assert.deepEqual(planRows(e).map(r => [r.key, r.pct]), [['a', 100], ['b', 100]]);
});

test('setting one goal pins the whole set and leaves the other suggestions in place', () => {
  const out = setGoal(ALL, 's2', 'r', 60);
  const s2 = out.find(e => e.id === 's2');
  assert.deepEqual(s2.goals, { r: 60, w: 50 });
  assert.equal(hasCustomGoals(s2), true);
  assert.deepEqual(planRows(s2, out).map(r => r.pct), [60, 50]);
  assert.equal(out.find(e => e.id === 's1').goals, undefined);          // other sessions untouched
});

test('goals snap to steps of 5 and stay inside 0-100', () => {
  assert.equal(setGoal(ALL, 's1', 'r', 62).find(e => e.id === 's1').goals.r, 60);
  assert.equal(setGoal(ALL, 's1', 'r', 140).find(e => e.id === 's1').goals.r, 100);
  assert.equal(setGoal(ALL, 's1', 'r', -9).find(e => e.id === 's1').goals.r, 0);
});

test('resetting goes back to Otto\'s suggestion', () => {
  const out = resetGoals(setGoal(ALL, 's2', 'r', 60), 's2');
  assert.equal(hasCustomGoals(out.find(e => e.id === 's2')), false);
});

test('coverage adds up each subtask across every session, so a gap is visible', () => {
  assert.deepEqual(coverage(ALL, S1, idx), { r: 100, w: 100 });
  const short = setGoal(ALL, 's1', 'r', 40);
  assert.equal(coverage(short, S1, idx).r, 65);                          // 40 + 25 + 0: 35% of Research is in no session
});

test('moving session 2 before session 1 renumbers the titles but the goals travel with the session', () => {
  const custom = setGoal(ALL, 's2', 'w', 80);
  const moved = custom.map(e => (e.id === 's2' ? { ...e, day: 12, startMin: 480 } : e));    // now earliest
  assert.deepEqual(siblingsOf(moved, S1, idx).map(e => e.id), ['s2', 's1', 's3']);
  assert.equal(displayTitle(moved, moved.find(e => e.id === 's2'), idx), 'Essay (1/3)');
  assert.equal(displayTitle(moved, moved.find(e => e.id === 's1'), idx), 'Essay (2/3)');
  assert.equal(moved.find(e => e.id === 's2').goals.w, 80);              // the goal did not move to a different session
});

test('a standalone event keeps its own title', () => {
  const e = { id: 'x', title: 'Gym', day: 12, startMin: 540, durationMin: 60 };
  assert.equal(displayTitle([e], e, idx), 'Gym');
  assert.deepEqual(siblingsOf([e], e, idx), [e]);
});

test('work done compares what was achieved to what was planned, never crediting more than planned', () => {
  const rows = planRows(S2, ALL);                                         // r: 25% of 120 = 30m, w: 50% of 60 = 30m
  assert.deepEqual(workDone(rows, { r: 25, w: 50 }), { planned: 60, done: 60 });
  assert.equal(workDone(rows, { r: 0, w: 50 }).done, 30);
  assert.equal(workDone(rows, { r: 100, w: 50 }).done, 60);
});

test('learning sees "took longer" when the goal was missed, and "on time" when it was met', () => {
  assert.equal(reflectionMinutes(60, 60, 60), 60);
  assert.equal(reflectionMinutes(60, 60, 30), 120);
  assert.equal(reflectionMinutes(60, 60, 0), 150);                        // capped at 2.5x
  assert.equal(reflectionMinutes(60, 0, 0), 60);
});

test('the remainder is what was planned but not done, with a sensible minimum block', () => {
  const rows = planRows(S2, ALL);
  const r = remainder(rows, { r: 25, w: 20 });
  assert.deepEqual(r.parts.map(p => [p.key, p.short]), [['w', 30]]);
  assert.equal(r.minutes, 20);                                            // 30% of 60m = 18m, rounded up to 20m
  assert.deepEqual(remainder(rows, { r: 25, w: 50 }), { parts: [], minutes: 0 });
  assert.equal(remainder(rows, { r: 25, w: 45 }).minutes, 15);            // 3m rounds up to the 15 minute minimum
});

test('the first free gap is found after "now", skipping what is busy', () => {
  const evs = [{ day: 12, startMin: 600, durationMin: 60 }, { day: 12, startMin: 660, durationMin: 120 }];
  assert.deepEqual(findFreeSlot(evs, { dayNums: DAYS, minutes: 60, fromIdx: 0, fromMin: 590 }), { day: 12, startMin: 780 });
  assert.deepEqual(findFreeSlot(evs, { dayNums: DAYS, minutes: 30, fromIdx: 0, fromMin: 480 }), { day: 12, startMin: 480 });
  assert.deepEqual(findFreeSlot(evs, { dayNums: DAYS, minutes: 700, fromIdx: 0, fromMin: 480 }), { day: 13, startMin: 480 });   // too long for day one, so the next day
  assert.equal(findFreeSlot(evs, { dayNums: [12], minutes: 1000, fromIdx: 0, fromMin: 480 }), null);
});

test('there are five ways to say how it went', () => {
  assert.deepEqual(REFLECTIONS.map(r => r.key), ['nailed', 'harder', 'gap', 'interrupted', 'outlier']);
});

import { reflectionRows, uncovered, restSignature, WHOLE } from './sessionGoals.js';

test('a block with no subtasks reflects on the whole block, so "I did not do it" can be recorded', () => {
  const e = { id: 'x', title: 'Reply', day: 12, startMin: 660, durationMin: 15 };
  const rows = reflectionRows(e, [e]);
  assert.deepEqual(rows.map(r => [r.key, r.pct, r.totalMin]), [[WHOLE, 100, 15]]);
  assert.deepEqual(remainder(rows, { [WHOLE]: 0 }), { parts: [{ key: WHOLE, name: 'The whole block', short: 100, minutes: 15 }], minutes: 15 });
  assert.equal(remainder(rows, { [WHOLE]: 100 }).minutes, 0);
});

test('a block with subtasks reflects only on the ones that were planned', () => {
  assert.deepEqual(reflectionRows(S1, ALL).map(r => r.key), ['r']);          // session 1 plans Research only
});

test('goals that leave part of a subtask in no block are reported with the time it needs', () => {
  const one = { id: 'one', title: 'One', day: 12, startMin: 540, durationMin: 60, subtasks: [{ id: 'a', name: 'A', minutes: 40 }, { id: 'b', name: 'B', minutes: 20 }] };
  assert.deepEqual(uncovered([one], one, idx), { parts: [], minutes: 0 });          // by default all of it is in the block
  const half = setGoal([one], 'one', 'a', 50)[0];
  const u = uncovered([half], half, idx);
  assert.deepEqual(u.parts.map(p => [p.key, p.short, p.minutes]), [['a', 50, 20]]);
  assert.equal(u.minutes, 20);
  assert.equal(restSignature(u), 'a:50');
});

test('for a split task, coverage is judged across all of its sessions', () => {
  assert.equal(uncovered(ALL, S1, idx).minutes, 0);
  const trimmed = setGoal(ALL, 's1', 'r', 40);
  const u = uncovered(trimmed, trimmed.find(e => e.id === 's1'), idx);
  assert.deepEqual(u.parts.map(p => [p.key, p.short]), [['r', 35]]);
});
