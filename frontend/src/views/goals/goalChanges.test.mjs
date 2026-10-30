import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChange, applyChanges, describeChange, overhaulSummary, needsPermission, splitByScale, goalFromProposal } from './goalChanges.js';

const TODAY = '2026-10-13';
const goal = () => ({ id: 'g', title: 'Ship a RAG app', target: '2026-12-01', start: '2026-09-01', hours_per_week: 8, detours: [],
  milestones: [{ id: 'a', title: 'Toy chatbot', effort_h: 5, due: '2026-09-20', done: true }, { id: 'b', title: 'Embeddings', effort_h: 8, due: '2026-10-20', done: false }, { id: 'c', title: 'Deploy', effort_h: 6, due: '2026-12-01', done: false }] });

test('small changes touch only what they name and return a new goal', () => {
  const g = goal();
  assert.equal(applyChange(g, { type: 'move_target', to: '2026-12-20' }, TODAY).target, '2026-12-20');
  assert.equal(g.target, '2026-12-01');                                       // the original is untouched
  const added = applyChange(g, { type: 'add_milestone', title: 'Write evals', effort_h: 4, due: '2026-11-10' }, TODAY);
  assert.deepEqual(added.milestones.map(m => m.title), ['Toy chatbot', 'Embeddings', 'Deploy', 'Write evals']);
  assert.equal(applyChange(g, { type: 'move_milestone', milestone_id: 'b', due: '2026-10-30' }, TODAY).milestones[1].due, '2026-10-30');
});
test('dropping removes an open milestone but never finished work', () => {
  assert.deepEqual(applyChange(goal(), { type: 'drop_milestone', milestone_id: 'c' }, TODAY).milestones.map(m => m.id), ['a', 'b']);
  assert.equal(applyChange(goal(), { type: 'drop_milestone', milestone_id: 'a' }, TODAY).milestones.length, 3);
});
test('a pivot keeps what is done, replaces what is not, retitles, and leaves a note in the detour log', () => {
  const p = applyChange(goal(), { type: 'pivot', new_title: 'Ship a retrieval API', why: 'Roles want evals, not a chatbot', milestones: [{ title: 'Eval harness', effort_h: 10, due: '2026-11-15' }] }, TODAY);
  assert.equal(p.title, 'Ship a retrieval API');
  assert.deepEqual(p.milestones.map(m => m.title), ['Toy chatbot', 'Eval harness']);
  assert.deepEqual([p.detours.at(-1).type, p.detours.at(-1).text], ['pivot', 'Roles want evals, not a chatbot']);
});
test('several changes apply in order', () => {
  const g = applyChanges(goal(), [{ type: 'move_target', to: '2026-12-15' }, { type: 'move_milestone', milestone_id: 'c', due: '2026-12-15' }], TODAY);
  assert.deepEqual([g.target, g.milestones[2].due], ['2026-12-15', '2026-12-15']);
});
test('each change reads as one plain sentence', () => {
  const g = goal();
  assert.match(describeChange(g, { type: 'move_target', to: '2026-12-20' }), /from 2026-12-01 to 2026-12-20 \(19 days later\)/);
  assert.match(describeChange(g, { type: 'drop_milestone', milestone_id: 'c' }), /Drop the milestone "Deploy"/);
  assert.match(describeChange(g, { type: 'pivot', new_title: 'X', milestones: [{}, {}] }), /Change direction to "X": 2 new milestones/);
});
test('the overhaul summary lists what would be lost and what would come in', () => {
  const s = overhaulSummary(goal(), [{ type: 'pivot', new_title: 'New', milestones: [{ title: 'A' }] }]);
  assert.deepEqual(s.replaced.map(m => m.id), ['b', 'c']);
  assert.equal(s.retitle, 'New');
  assert.deepEqual(overhaulSummary(goal(), [{ type: 'drop_milestone', milestone_id: 'a' }]).dropped, []);        // finished work is not "lost"
});
test('major changes are the ones that need permission, and they are kept apart from the small ones', () => {
  const cs = [{ type: 'add_milestone', major: false }, { type: 'pivot', major: true }];
  assert.equal(needsPermission(cs), true);
  assert.equal(needsPermission([cs[0]]), false);
  assert.deepEqual([splitByScale(cs).minor.length, splitByScale(cs).major.length], [1, 1]);
});
test('a proposed new goal becomes a goal only when it is built from the proposal', () => {
  const g = goalFromProposal({ title: 'Learn SQL', target: '2026-12-01', hours_per_week: 3, milestones: [{ title: 'Joins', effort_h: 4, due: '2026-11-01' }] }, TODAY, 'gx');
  assert.deepEqual([g.id, g.start, g.milestones.length, g.milestones[0].done], ['gx', TODAY, 1, false]);
});
