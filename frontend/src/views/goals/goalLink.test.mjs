import test from 'node:test';
import assert from 'node:assert/strict';
import { creditGoal, workedMinutes, hoursLeft, bookedMinutes } from './goalLink.js';

const goals = () => [{ id: 'g', title: 'RAG', milestones: [{ id: 'a', title: 'Embeddings', effort_h: 8, due: '2026-10-20', done: false }, { id: 'b', title: 'Evals', effort_h: 6, due: '2026-11-01', done: false }] }];

test('time on a linked event is credited to the named step, and only the change is added when it is saved again', () => {
  const ev = { goal_id: 'g', milestone_id: 'b', durationMin: 90 };
  const r1 = creditGoal(goals(), ev, 90);
  assert.equal(r1.goals[0].milestones[1].logged_h, 1.5);
  assert.equal(r1.credited, 90);
  const r2 = creditGoal(r1.goals, { ...ev, credited_min: 90 }, 60);
  assert.equal(r2.goals[0].milestones[1].logged_h, 1);
  const r3 = creditGoal(r2.goals, { ...ev, credited_min: 60 }, 60);
  assert.equal(r3.goals, r2.goals);
});

test('with no step named it goes to the soonest unfinished one; an unknown goal credits nothing', () => {
  const r = creditGoal(goals(), { goal_id: 'g', durationMin: 60 }, 60);
  assert.equal(r.goals[0].milestones[0].logged_h, 1);
  const none = creditGoal(goals(), { goal_id: 'zzz', durationMin: 60 }, 60);
  assert.equal(none.credited, 0);
});

test('how much of the block was worked follows the meters', () => {
  assert.equal(workedMinutes({ durationMin: 60 }, 'nailed', 100, 100), 60);
  assert.equal(workedMinutes({ durationMin: 60 }, 'interrupted', 100, 50), 30);
  assert.equal(workedMinutes({ durationMin: 60 }, 'nailed', 0, 0), 60);
});

test('hours left counts what the calendar logged, never below zero', () => {
  assert.equal(hoursLeft({ effort_h: 8, logged_h: 3 }), 5);
  assert.equal(hoursLeft({ effort_h: 8, logged_h: 12 }), 0);
  assert.equal(hoursLeft({ effort_h: 8, subtasks: [{ done: true }, { done: false }], logged_h: 1 }), 4);
  assert.equal(hoursLeft({ effort_h: 8, done: true }), 0);
});

test('booked time: events tied to this goal count, ones tied to another do not, untied ones match by title', () => {
  const g = goals()[0], m = g.milestones[0];
  const events = [
    { goal_id: 'g', milestone_id: 'a', durationMin: 60, title: 'x' },
    { goal_id: 'g', milestone_id: 'b', durationMin: 90, title: 'x' },       // a later step
    { goal_id: 'other', durationMin: 45, title: 'embeddings' },             // somebody else's
    { durationMin: 30, title: 'embeddings drill' },                         // untied, by title
    { durationMin: 30, title: 'laundry' },
    { fixed: true, goal_id: 'g', durationMin: 500, title: 'meeting' },
  ];
  assert.equal(bookedMinutes({ goal: g, milestone: m, events, matchTitle: t => /embeddings/.test(t) }), 90);
});
