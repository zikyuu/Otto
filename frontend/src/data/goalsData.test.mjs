import test from 'node:test';
import assert from 'node:assert/strict';
import { demoGoals, demoReview } from './goalsData.js';
import { needsPermission, applyChanges } from '../views/goals/goalChanges.js';

const TODAY = '2026-10-13';

test('the sample review only refers to milestones that exist, and its major flags match what the server would say', () => {
  const goals = demoGoals(TODAY);
  const rev = demoReview(goals, TODAY);
  assert.equal(rev.sample, true);
  for (const a of rev.goals) {
    const g = goals.find(x => x.id === a.id);
    assert.ok(g, a.id);
    for (const ch of a.changes) if (ch.milestone_id) assert.ok(g.milestones.some(m => m.id === ch.milestone_id && !m.done), `${a.id} ${ch.milestone_id}`);
    assert.equal(a.needs_permission, needsPermission(a.changes));
  }
});

test('the sample covers every case: small changes, a big package, a pivot, ideas Otto cannot apply, and a new goal', () => {
  const rev = demoReview(demoGoals(TODAY), TODAY);
  const by = Object.fromEntries(rev.goals.map(g => [g.id, g]));
  assert.equal(by.rag.needs_permission, false);
  assert.equal(by.sd.needs_permission, true);
  assert.ok(by.sd.changes.some(c => c.type === 'drop_milestone'));
  assert.ok(by.reel.changes.some(c => c.type === 'pivot'));
  assert.ok(by.rag.unapplied.length > 0);
  assert.equal(rev.new_goals.length, 1);
});

test('applying the sample changes works on the demo goals', () => {
  const goals = demoGoals(TODAY), rev = demoReview(goals, TODAY);
  const sd = applyChanges(goals.find(g => g.id === 'sd'), rev.goals.find(g => g.id === 'sd').changes, TODAY);
  assert.ok(!sd.milestones.some(m => m.id === 'sd3'));
  assert.notEqual(sd.target, goals.find(g => g.id === 'sd').target);
});
