import test from 'node:test';
import assert from 'node:assert/strict';
import { addItem, toggleItem, removeItem, openItems, carryMinutes, carryOverCandidates, summary, items } from './checklist.js';

const base = () => [{ id: 'a', title: 'Report', durationMin: 90 }, { id: 'b', title: 'Other', durationMin: 30 }];

test('items are added, ticked and removed on the right event only', () => {
  let es = addItem(base(), 'a', '  Charts ');
  es = addItem(es, 'a', 'Summary');
  assert.deepEqual(items(es[0]).map(i => i.text), ['Charts', 'Summary']);
  assert.equal(items(es[1]).length, 0);
  es = toggleItem(es, 'a', items(es[0])[0].id);
  assert.deepEqual(items(es[0]).map(i => i.done), [true, false]);
  es = removeItem(es, 'a', items(es[0])[1].id);
  assert.deepEqual(items(es[0]).map(i => i.text), ['Charts']);
});

test('blank text is ignored and long text is cut', () => {
  assert.equal(addItem(base(), 'a', '   ').length, 2);
  assert.equal(items(addItem(base(), 'a', 'x'.repeat(300))[0])[0].text.length, 120);
});

test('carry-over time is the share of the block the open items stand for', () => {
  let es = base();
  for (const t of ['one', 'two', 'three']) es = addItem(es, 'a', t);
  es = toggleItem(es, 'a', items(es[0])[0].id);
  assert.equal(openItems(es[0]).length, 2);
  assert.equal(carryMinutes(es[0]), 60);                  // 2 of 3 of 90 minutes
  assert.equal(summary(es[0]), '2 items unfinished');
  assert.equal(carryMinutes(addItem(base(), 'b', 'x')[1]), 30);
  assert.equal(carryMinutes({ durationMin: 15, checklist: [{ id: '1', text: 'a', done: false }, { id: '2', text: 'b', done: true }, { id: '3', text: 'c', done: true }, { id: '4', text: 'd', done: true }] }), 15);   // never under 15
});

test('only finished blocks with open items that were not dealt with are asked about', () => {
  let es = addItem(addItem(base(), 'a', 'x'), 'b', 'y');
  es = toggleItem(es, 'b', items(es[1])[0].id);                           // b has nothing open
  assert.deepEqual(carryOverCandidates(es, () => true).map(e => e.id), ['a']);
  assert.deepEqual(carryOverCandidates(es, () => false), []);
  es = es.map(e => (e.id === 'a' ? { ...e, carry_over: { action: 'park' } } : e));
  assert.deepEqual(carryOverCandidates(es, () => true), []);
});
