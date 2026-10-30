import test from 'node:test';
import assert from 'node:assert/strict';
import { moveInProposal, resetEdits, problemsOf } from './proposalEdit.js';

const ev = (id, day, startMin, durationMin, extra = {}) => ({ id, title: id.toUpperCase(), day, startMin, durationMin, ...extra });
const proposal = () => {
  const events = [ev('a', 14, 540, 60), ev('b', 15, 840, 90, { prereq_ids: ['a'] }), ev('lock', 14, 600, 60, { fixed: true })];
  return { events, original: events.map(e => ({ ...e })), edited: new Set(), conflicts: [] };
};

test('a drag moves one block and remembers that the person placed it', () => {
  const p = moveInProposal(proposal(), 'a', 13, 600);
  assert.deepEqual(p.events.map(e => [e.id, e.day, e.startMin]), [['a', 13, 600], ['b', 15, 840], ['lock', 14, 600]]);
  assert.deepEqual([...p.edited], ['a']);
  assert.equal(p.original[0].day, 14);                                       // what Otto proposed is kept
});

test('reset puts one block, or all of them, back to what Otto proposed', () => {
  let p = moveInProposal(moveInProposal(proposal(), 'a', 13, 600), 'b', 16, 480);
  const one = resetEdits(p, 'a');
  assert.deepEqual([one.events[0].day, one.events[0].startMin, one.events[1].day], [14, 540, 16]);
  assert.deepEqual([...one.edited], ['b']);
  const all = resetEdits(p);
  assert.deepEqual(all.events.map(e => [e.day, e.startMin]), [[14, 540], [15, 840], [14, 600]]);
  assert.equal(all.edited.size, 0);
});

test('overlaps with locked blocks, order breaks and the cleared window are named', () => {
  const p = moveInProposal(proposal(), 'a', 14, 570);                          // onto the locked block
  const q = problemsOf(p.events, { edited: p.edited });
  assert.deepEqual(q.map(x => x.kind), ['overlap']);
  assert.match(q[0].text, /A overlaps LOCK/);
  const late = moveInProposal(proposal(), 'a', 16, 540);                       // after b
  assert.ok(problemsOf(late.events, { edited: late.edited }).some(x => x.kind === 'order' && /B starts before A/.test(x.text)));
  const inWin = moveInProposal(proposal(), 'b', 15, 500);
  assert.ok(problemsOf(inWin.events, { edited: inWin.edited, windows: [{ day: 15, start: 510, end: 825 }] }).some(x => x.kind === 'window'));
});

test('a clean arrangement has no problems, and an overlapping pair is reported once', () => {
  assert.deepEqual(problemsOf(proposal().events, { changed: new Set(['a', 'b']) }), []);
  const both = [ev('x', 14, 540, 60), ev('y', 14, 560, 60)];
  assert.equal(problemsOf(both, { changed: new Set(['x', 'y']) }).length, 1);
});
