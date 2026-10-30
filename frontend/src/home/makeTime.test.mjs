import test from 'node:test';
import assert from 'node:assert/strict';
import { timeBlockFor, planWindow, sessionsOf, categoryFor } from './makeTime.js';

const nudge = { goalId: 'rag', milestone: 'Add embeddings', due: '2026-10-20', shortMin: 420 };
const ctx = { goalTitle: 'Ship a production RAG app', goalCat: 'LLM engineering', today: '2026-10-13', todayDay: 13, tomorrowDay: 14, nowMin: 600, id: 'mt1' };

test('the block asks for exactly the shortfall, flagged so the scheduler spreads it over free time', () => {
  const b = timeBlockFor(nudge, ctx);
  assert.deepEqual([b.title, b.durationMin, b.span_days, b.category, b.deadline_iso, b.hard_deadline], ['Add embeddings', 420, true, 'llm', '2026-10-20', true]);
});
test('it asks for the start of the learned focus window: today if still ahead, else tomorrow', () => {
  assert.deepEqual([13, 14].map(h => { const b = timeBlockFor(nudge, { ...ctx, nowMin: 600, peak: [h, h + 3] }); return [b.day, b.startMin]; }), [[13, 13 * 60], [13, 14 * 60]]);
  const late = timeBlockFor(nudge, { ...ctx, nowMin: 16 * 60, peak: [14, 17] });
  assert.deepEqual([late.day, late.startMin], [14, 14 * 60]);                 // the window is nearly over: tomorrow
  const running = timeBlockFor(nudge, { ...ctx, nowMin: 14 * 60 + 10, peak: [14, 18] });
  assert.deepEqual([running.day, running.startMin], [13, 15 * 60]);           // inside it with room: the next hour
});
test('an overdue milestone carries no deadline', () => {
  assert.equal(timeBlockFor({ ...nudge, due: '2026-10-10' }, ctx).deadline_iso, undefined);
});
test('tiny and huge shortfalls are kept in range', () => {
  assert.equal(timeBlockFor({ ...nudge, shortMin: 5 }, ctx).durationMin, 30);
  assert.equal(timeBlockFor({ ...nudge, shortMin: 99999 }, ctx).durationMin, 105 * 60);
});
test('the window is the current Monday plus fourteen days of month numbers', () => {
  const w = planWindow('2026-10-13');
  assert.equal(w.monday, '2026-10-12');
  assert.deepEqual(w.days.slice(0, 3), [20738, 20739, 20740]);          // real day numbers: 12, 13, 14 Oct 2026
  assert.equal(w.days.length, 14);
  assert.equal(w.days[13], 20751);
});
test('categories come from the goal, with deep work as the default', () => {
  assert.deepEqual(['Finish Blind 75', 'Pass a system-design interview', 'Learn pottery'].map(t => categoryFor(t)), ['leetcode', 'system-design', 'deep_work']);
});
test('sessions of a block are the block or its split pieces', () => {
  assert.deepEqual(sessionsOf([{ id: 'a' }, { id: 'mt1#1', split_of: 'mt1' }, { id: 'mt1#2', split_of: 'mt1' }, { id: 'b' }], 'mt1').map(e => e.id), ['mt1#1', 'mt1#2']);
});
