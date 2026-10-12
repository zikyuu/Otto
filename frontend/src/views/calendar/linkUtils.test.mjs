import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDERED, GROUPED, getLinks, addLink, removeLink, dropEvent, cluster, orderedChain, reorderChain,
  linkProblem, dependsOn, isLinked, linkPath,
} from './linkUtils.js';

const ev = (id, day = 1, startMin = 600, extra = {}) => ({ id, title: id, day, startMin, durationMin: 60, ...extra });
const base = () => [ev('a', 1, 540), ev('b', 1, 660), ev('c', 2, 600), ev('d', 3, 600)];

test('an ordered link makes the second event wait for the first', () => {
  const e = addLink(base(), 'a', 'b', ORDERED);
  assert.deepEqual(e.find(x => x.id === 'b').prereq_ids, ['a']);
  assert.deepEqual(getLinks(e), [{ from: 'a', to: 'b', type: ORDERED }]);
});

test('a grouped link is symmetric and listed once', () => {
  const e = addLink(base(), 'c', 'a', GROUPED);
  assert.deepEqual(e.find(x => x.id === 'a').grouped_with, ['c']);
  assert.deepEqual(e.find(x => x.id === 'c').grouped_with, ['a']);
  assert.equal(getLinks(e).length, 1);
});

test('self links, duplicates and loops are refused and change nothing', () => {
  let e = addLink(base(), 'a', 'b', ORDERED);
  e = addLink(e, 'b', 'c', ORDERED);
  assert.ok(linkProblem(e, 'a', 'a', ORDERED));
  assert.ok(linkProblem(e, 'a', 'b', ORDERED));
  assert.ok(linkProblem(e, 'c', 'a', ORDERED), 'c -> a would close a loop a>b>c>a');
  assert.equal(addLink(e, 'c', 'a', ORDERED), e);
  assert.ok(dependsOn(e, 'c', 'a'));
  assert.ok(!dependsOn(e, 'a', 'c'));
});

test('removing a link leaves no empty arrays behind', () => {
  let e = addLink(base(), 'a', 'b', ORDERED);
  e = removeLink(e, 'a', 'b', ORDERED);
  assert.equal('prereq_ids' in e.find(x => x.id === 'b'), false);
  e = removeLink(addLink(base(), 'a', 'c', GROUPED), 'c', 'a', GROUPED);
  assert.equal(getLinks(e).length, 0);
  assert.equal('grouped_with' in e.find(x => x.id === 'a'), false);
});

test('deleting an event removes the links to it', () => {
  let e = addLink(addLink(base(), 'a', 'b', ORDERED), 'a', 'c', GROUPED);
  e = dropEvent(e, 'a');
  assert.equal(getLinks(e).length, 0);
  assert.equal(e.length, 3);
});

test('a cluster is everything connected, through either kind of link', () => {
  let e = addLink(base(), 'a', 'b', ORDERED);
  e = addLink(e, 'b', 'c', GROUPED);
  assert.deepEqual([...cluster(e, 'a')].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...cluster(e, 'd')], ['d']);
  assert.ok(isLinked(e, 'c') && !isLinked(e, 'd'));
});

test('the chain lists steps in dependency order, not calendar order', () => {
  // c is earliest in the week but waits for b, which waits for a
  let e = [ev('a', 3, 540), ev('b', 2, 540), ev('c', 1, 540)];
  e = addLink(addLink(e, 'a', 'b', ORDERED), 'b', 'c', ORDERED);
  assert.deepEqual(orderedChain(e, 'b'), ['a', 'b', 'c']);
});

test('reordering the chain rewrites the prerequisites one step after another', () => {
  let e = addLink(addLink(base(), 'a', 'b', ORDERED), 'b', 'c', ORDERED);
  e = reorderChain(e, ['c', 'a', 'b']);
  const pre = id => e.find(x => x.id === id).prereq_ids;
  assert.equal(pre('c'), undefined);
  assert.deepEqual(pre('a'), ['c']);
  assert.deepEqual(pre('b'), ['a']);
  assert.deepEqual(orderedChain(e, 'a'), ['c', 'a', 'b']);
});

test('reordering keeps prerequisites that come from outside the chain', () => {
  let e = addLink(base(), 'd', 'a', ORDERED);
  e = addLink(e, 'a', 'b', ORDERED);
  e = reorderChain(e, ['b', 'a']);
  assert.deepEqual(e.find(x => x.id === 'a').prereq_ids.sort(), ['b', 'd']);
});

test('link paths are cubic curves; same-column links bulge right', () => {
  assert.match(linkPath(0, 0, 100, 50), /^M0,0 C.* 100,50$/);
  assert.match(linkPath(10, 0, 10, 80, true), /C48,0 48,80 10,80$/);
});

test('the chain between the sessions of one order-specific task is not a user link', () => {
  const s = (id, prereq) => ({ id, title: id, day: 1, startMin: 600, durationMin: 30, split_of: 'big', ...(prereq ? { prereq_ids: [prereq] } : {}) });
  const evs = [s('big#1'), s('big#2', 'big#1'), s('big#3', 'big#2'), { id: 'x', title: 'x', day: 2, startMin: 600, durationMin: 30, prereq_ids: ['big#3'] }];
  assert.deepEqual(getLinks(evs), [{ from: 'big#3', to: 'x', type: ORDERED }]);
  assert.equal(isLinked(evs, 'big#1'), false);
});
