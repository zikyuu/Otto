import test from 'node:test';
import assert from 'node:assert/strict';
import {
  progressPct, expectedPct, cumulativePct, remainingHours, requiredPerWeek, projectedFinish, statusOf, plannedCurve, actualCurve,
  toggleMilestone, toggleSubtask, addMilestone, logDetour, insights, reviewPayload, daysBetween, addDays, daysBehind,
} from './goalMath.js';

const m = (id, effort_h, due, extra = {}) => ({ id, title: id, effort_h, due, done: false, ...extra });
// start 1 Sep, target 1 Dec. a: 10h by 1 Oct, b: 10h by 1 Nov, c: 20h by 1 Dec  (40h total)
const goal = (over = {}) => ({
  id: 'g', title: 'g', start: '2026-09-01', target: '2026-12-01', hours_per_week: 5, detours: [],
  milestones: [m('a', 10, '2026-10-01'), m('b', 10, '2026-11-01'), m('c', 20, '2026-12-01')], ...over,
});

test('dates: day arithmetic ignores time zones', () => {
  assert.equal(daysBetween('2026-10-01', '2026-10-31'), 30);
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
});

test('a milestone is worth its share of the total effort', () => {
  const g = goal({ milestones: [m('a', 10, '2026-10-01', { done: true }), m('b', 10, '2026-11-01'), m('c', 20, '2026-12-01')] });
  assert.equal(progressPct(g), 25);
  assert.equal(remainingHours(g), 30);
});

test('ticked subtasks count as partial progress', () => {
  const g = goal({ milestones: [m('a', 10, '2026-10-01', { subtasks: [{ id: 1, done: true }, { id: 2, done: true }, { id: 3, done: false }, { id: 4, done: false }] }), m('b', 30, '2026-12-01')] });
  assert.equal(progressPct(g), 12.5);
});

test('cumulative pct is where the goal stands once that milestone is done', () => {
  const g = goal();
  assert.equal(cumulativePct(g, 'a'), 25);
  assert.equal(cumulativePct(g, 'b'), 50);
  assert.equal(cumulativePct(g, 'c'), 100);
});

test('adding a milestone rescales every share without anyone doing the sum', () => {
  const g = addMilestone(goal(), { title: 'd', effort_h: 40, due: '2026-12-01' }, 'd');
  assert.equal(cumulativePct(g, 'a'), 12.5);
  assert.equal(cumulativePct(g, 'c'), 50);
});

test('the plan climbs steadily between due dates', () => {
  const g = goal();
  assert.equal(expectedPct(g, '2026-09-01'), 0);
  assert.equal(expectedPct(g, '2026-09-16'), 12.5);                 // halfway to a's due date: half of a's 25%
  assert.equal(expectedPct(g, '2026-10-01'), 25);
  assert.equal(expectedPct(g, '2026-11-01'), 50);
  assert.equal(expectedPct(g, '2026-12-01'), 100);
  assert.equal(expectedPct(g, '2027-02-01'), 100);
});

test('status: ahead, on track, behind come from plan versus reality', () => {
  const today = '2026-10-01';                                     // plan says 25%
  assert.equal(statusOf(goal({ milestones: [m('a', 10, '2026-10-01', { done: true }), m('b', 10, '2026-11-01'), m('c', 20, '2026-12-01')] }), today), 'on_track');
  assert.equal(statusOf(goal({ milestones: [m('a', 10, '2026-10-01', { done: true }), m('b', 10, '2026-11-01', { done: true }), m('c', 20, '2026-12-01')], hours_per_week: 8 }), today), 'ahead');
  assert.equal(statusOf(goal({ hours_per_week: 8 }), today), 'behind');
});

test('status: not enough hours is at risk, far too few is out of reach', () => {
  const today = '2026-11-17';                                     // 2 weeks left, 40h to do
  assert.equal(requiredPerWeek(goal(), today), 20);
  assert.equal(statusOf(goal({ hours_per_week: 17 }), today), 'at_risk');   // 20/17 = 1.18
  assert.equal(statusOf(goal({ hours_per_week: 5 }), today), 'impossible');
});

test('status: past the target date with work left is out of reach; finished is done', () => {
  assert.equal(statusOf(goal(), '2026-12-10'), 'impossible');
  assert.equal(statusOf(goal({ milestones: goal().milestones.map(x => ({ ...x, done: true })) }), '2026-12-10'), 'done');
});

test('projected finish follows the pace so far; nothing done means unknown', () => {
  assert.equal(projectedFinish(goal(), '2026-10-01'), null);
  const g = goal({ milestones: [m('a', 10, '2026-10-01', { done: true }), m('b', 10, '2026-11-01'), m('c', 20, '2026-12-01')] });
  // 10h in ~4.3 weeks => 30h more takes ~12.9 weeks
  const fin = projectedFinish(g, '2026-10-01');
  assert.ok(daysBetween('2026-10-01', fin) > 80 && daysBetween('2026-10-01', fin) < 100);
});

test('curves: planned has a point per milestone; actual steps when milestones were finished and ends at today', () => {
  const g = goal({ milestones: [m('a', 10, '2026-10-01', { done: true, done_on: '2026-09-25' }), m('b', 10, '2026-11-01'), m('c', 20, '2026-12-01')] });
  assert.deepEqual(plannedCurve(g).map(p => p.pct), [0, 25, 50, 100]);
  const act = actualCurve(g, '2026-10-05');
  assert.deepEqual(act.map(p => [p.date, p.pct]), [['2026-09-01', 0], ['2026-09-25', 25], ['2026-10-05', 25]]);
});

test('ticking a milestone ticks its subtasks and stamps the date; unticking clears both', () => {
  const g = goal({ milestones: [m('a', 10, '2026-10-01', { subtasks: [{ id: 1, t: 'x', done: false }, { id: 2, t: 'y', done: false }] })] });
  const on = toggleMilestone(g, 'a', '2026-10-03').milestones[0];
  assert.deepEqual([on.done, on.done_on, on.subtasks.every(s => s.done)], [true, '2026-10-03', true]);
  const off = toggleMilestone({ ...g, milestones: [on] }, 'a', '2026-10-04').milestones[0];
  assert.deepEqual([off.done, off.done_on, off.subtasks.some(s => s.done)], [false, undefined, false]);
});

test('finishing the last subtask finishes the milestone; reopening one reopens it', () => {
  let g = goal({ milestones: [m('a', 10, '2026-10-01', { subtasks: [{ id: 1, t: 'x', done: true }, { id: 2, t: 'y', done: false }] })] });
  g = toggleSubtask(g, 'a', 2, '2026-10-02');
  assert.equal(g.milestones[0].done, true);
  g = toggleSubtask(g, 'a', 1, '2026-10-03');
  assert.equal(g.milestones[0].done, false);
});

test('a detour is logged with a kind and a sentence: no day count is asked for or stored', () => {
  const g = logDetour(goal(), { type: 'roadblock', text: 'laptop died', date: '2026-10-02' });
  assert.deepEqual(g.detours[0], { date: '2026-10-02', type: 'roadblock', text: 'laptop died' });
  assert.equal(logDetour(g, { type: 'sidetrack', text: 'tutorial rabbit hole', date: '2026-10-05' }).detours[0].text, 'tutorial rabbit hole');   // newest first
});

test('days behind is read off the plan: when did the plan reach today\'s progress?', () => {
  const done = goal({ milestones: [m('a', 10, '2026-10-01', { done: true }), m('b', 10, '2026-11-01'), m('c', 20, '2026-12-01')] });   // 25% = what the plan wanted by 1 Oct
  assert.equal(daysBehind(done, '2026-10-11'), 10);
  assert.equal(daysBehind(done, '2026-10-01'), 0);
  assert.equal(daysBehind(done, '2026-09-20'), 0);                          // ahead of plan is not "behind"
  assert.equal(daysBehind(goal(), '2026-09-11'), 10);                       // nothing done: behind by the days since the start
});

test('a logged detour shows the delay it actually caused, not a number somebody typed', () => {
  const g = logDetour(goal({ milestones: [m('a', 10, '2026-10-01', { done: true }), m('b', 10, '2026-11-01'), m('c', 20, '2026-12-01')] }), { type: 'roadblock', text: 'laptop died', date: '2026-10-02' });
  assert.ok(insights(g, '2026-10-11').some(i => /1 detour logged\. Against the original plan you are about 10 days behind/.test(i.text)));
  const fine = logDetour(goal({ milestones: [m('a', 10, '2026-10-01', { done: true }), m('b', 10, '2026-11-01'), m('c', 20, '2026-12-01')] }), { type: 'sidetrack', text: 'x', date: '2026-09-10' });
  assert.ok(insights(fine, '2026-09-20').some(i => /still on the original plan/.test(i.text)));
});

test('insights are plain sentences with a tone', () => {
  const lines = insights(goal({ hours_per_week: 5 }), '2026-11-17');
  assert.ok(lines.every(l => ['good', 'warn', 'bad'].includes(l.tone) && l.text.length > 10));
  assert.ok(lines.some(l => l.tone === 'bad' && /needs 20h a week; you set aside 5h/.test(l.text)));
});

test('the review payload carries the computed numbers and per-milestone cumulative percentages', () => {
  const p = reviewPayload(goal(), '2026-10-01');
  assert.equal(p.expected_pct, 25);
  assert.equal(p.progress_pct, 0);
  assert.deepEqual(p.milestones.map(x => x.pct_when_done), [25, 50, 100]);
  assert.equal(p.status, 'behind');
  assert.equal(p.days_behind, 30);                                         // nothing done 30 days in
});
