import test from 'node:test';
import assert from 'node:assert/strict';
import { goalsNeedingAttention, severityOf } from './goalAttention.js';

const TODAY = '2026-10-13';
const m = (id, title, h, due, done = false) => ({ id, title, effort_h: h, due, done });
const goal = (id, extra = {}) => ({ id, title: id.toUpperCase(), start: '2026-09-01', target: '2026-12-31', hours_per_week: 10, milestones: [m('a', 'Alpha', 17, '2026-09-20', true), m('b', 'Beta', 3, '2026-12-20')], detours: [], ...extra });

test('goals on plan are left out; none needing attention gives an empty list', () => {
  assert.deepEqual(goalsNeedingAttention({ goals: [goal('ok')], events: [], today: TODAY }), []);
});
test('a goal that is out of reach or behind is listed with a plain reason, worst first', () => {
  const hopeless = goal('late', { target: '2026-10-20', hours_per_week: 2, milestones: [m('a', 'Everything', 80, '2026-10-19')] });
  const behind = goal('slow', { milestones: [m('a', 'Alpha', 10, '2026-09-20'), m('b', 'Beta', 10, '2026-12-20')], target: '2026-12-31' });
  const r = goalsNeedingAttention({ goals: [behind, hopeless], events: [], today: TODAY });
  assert.equal(r[0].goalId, 'late');
  assert.equal(r[0].status, 'impossible');
  assert.match(r[0].reason, /\d/);
  assert.ok(r.some(x => x.goalId === 'slow'));
});
test('a goal on plan whose next milestone has no time booked shows up with the nudge', () => {
  const g = goal('soon', { milestones: [m('a', 'Alpha', 10, '2026-09-20', true), m('b', 'Write the thesis chapter', 8, '2026-10-20')] });
  const r = goalsNeedingAttention({ goals: [g], events: [], today: TODAY });
  assert.equal(r.length, 1);
  assert.equal(r[0].nudge.milestone, 'Write the thesis chapter');
});

test('every goal that is behind can be given time, not only the one whose next milestone is close', () => {
  const far = (id, extra = {}) => goal(id, { milestones: [m('a', 'Alpha', 10, '2026-09-20'), m('b', 'Beta', 20, '2026-12-20')], target: '2026-12-31', ...extra });
  const goals = [far('one'), far('two'), far('three')];
  const r = goalsNeedingAttention({ goals, events: [], today: TODAY });
  assert.equal(r.length, 3);
  assert.ok(r.every(x => x.nudge && x.nudge.shortMin >= 30));
});

test('catch-up asks for the hours between the plan and reality, capped, and counts what is already booked', async () => {
  const { catchUpFor } = await import('./goalNudge.js');
  const g = goal('slow', { milestones: [m('a', 'Alpha', 10, '2026-09-20'), m('b', 'Beta', 30, '2026-12-20')], title: 'Learn Rust' });
  const n = catchUpFor(g, [], TODAY);
  assert.ok(n.needMin >= 300 && n.needMin <= 600);                         // ~10h behind the plan, capped at 10h
  assert.equal(n.milestone, 'Alpha');
  const withBooked = catchUpFor(g, [{ id: 'e', title: 'Learn Rust basics', durationMin: n.needMin }], TODAY);
  assert.equal(withBooked, null);                                         // already covered
  assert.equal(catchUpFor(goal('done', { milestones: [m('a', 'Alpha', 10, '2026-09-20', true)] }), [], TODAY), null);
});

test('severity grows with how far behind and how reachable: 1 slight, 2 clear, 3 severe or out of reach', () => {
  assert.deepEqual([['behind', 8], ['behind', 20], ['behind', 35], ['at_risk', 10], ['at_risk', 32], ['impossible', 0], ['on_track', 2]].map(([s, g]) => severityOf(s, g)), [1, 2, 3, 2, 3, 3, 0]);
});

test('the list is ordered worst first and each goal carries its severity', () => {
  const slight = goal('slight', { milestones: [m('a', 'Alpha', 10, '2026-09-20', true), m('b', 'Beta', 10, '2026-12-20')] });
  const hopeless = goal('hopeless', { target: '2026-10-20', hours_per_week: 2, milestones: [m('a', 'Everything', 80, '2026-10-19')] });
  const r = goalsNeedingAttention({ goals: [slight, hopeless], events: [], today: TODAY });
  assert.equal(r[0].goalId, 'hopeless');
  assert.equal(r[0].severity, 3);
  assert.ok(r.every(x => x.severity >= 1));
});

test('a close milestone request is kept for a goal that is behind, ahead of the catch-up request', () => {
  const g = goal('both', { milestones: [m('a', 'Alpha', 10, '2026-09-20'), m('b', 'Write the thesis chapter', 20, '2026-10-20')] });
  const r = goalsNeedingAttention({ goals: [g], events: [], today: TODAY });
  assert.equal(r[0].nudge.milestone, 'Alpha');           // the first open milestone is the overdue one, and it asks for time
  assert.ok(r[0].nudge.shortMin >= 30);
});
