import test from 'node:test';
import assert from 'node:assert/strict';
import { add, toggle, remove, setDue, nextDue, daysUntil, dueLabel, urgency, sorted, dueSoon } from './reminders.js';

const TODAY = '2026-10-13';

test('blank text is ignored; a repeat needs a date', () => {
  assert.equal(add([], { text: '  ' }).length, 0);
  const [r] = add([], { text: 'Pay rent', repeat: 'monthly' });
  assert.equal(r.repeat, null);
  const [s] = add([], { text: 'Pay rent', due: '2026-11-01', repeat: 'monthly' });
  assert.equal(s.repeat, 'monthly');
});

test('monthly repeats keep the day and clamp to short months', () => {
  assert.equal(nextDue('2026-09-30', 'monthly'), '2026-10-30');
  assert.equal(nextDue('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(nextDue('2026-12-15', 'monthly'), '2027-01-15');
  assert.equal(nextDue('2026-10-13', 'weekly'), '2026-10-20');
  assert.equal(nextDue('2026-10-13', null), null);
});

test('ticking a repeating reminder moves it on; ticking a one-off finishes it; unticking restores', () => {
  let l = add(add([], { text: 'Pay rent', due: '2026-09-30', repeat: 'monthly' }), { text: 'Renew passport', due: '2026-11-20' });
  l = toggle(l, l[0].id, 1000);
  assert.equal(l[0].due, '2026-10-30'); assert.equal(l[0].done, false);
  l = toggle(l, l[1].id, 2000);
  assert.equal(l[1].done, true);
  l = toggle(l, l[1].id);
  assert.equal(l[1].done, false);
  assert.deepEqual(remove(l, l[0].id).map(r => r.text), ['Renew passport']);
});

test('how far away it is reads in plain words', () => {
  const at = due => ({ due });
  assert.equal(dueLabel(at('2026-09-30'), TODAY), '13 days overdue');
  assert.equal(dueLabel(at('2026-10-12'), TODAY), 'Due yesterday');
  assert.equal(dueLabel(at('2026-10-13'), TODAY), 'Due today');
  assert.equal(dueLabel(at('2026-10-14'), TODAY), 'Due tomorrow');
  assert.equal(dueLabel(at('2026-10-17'), TODAY), 'Due in 4 days');
  assert.equal(dueLabel({ due: null }, TODAY), 'Whenever');
  assert.equal(daysUntil(at('2026-10-20'), TODAY), 7);
});

test('urgency bands', () => {
  assert.deepEqual(['2026-10-01', '2026-10-15', '2026-12-01', null].map(due => urgency({ due }, TODAY)), ['overdue', 'soon', 'later', 'open']);
});

test('overdue first, then soonest, undated last, finished at the end', () => {
  let l = [];
  for (const [text, due] of [['later', '2026-11-30'], ['whenever', null], ['overdue', '2026-10-01'], ['soon', '2026-10-15']]) l = add(l, { text, due });
  l = toggle(l, l.find(r => r.text === 'soon').id, 5);
  assert.deepEqual(sorted(l, TODAY).map(r => r.text), ['overdue', 'later', 'whenever', 'soon']);
  assert.equal(dueSoon(l, TODAY), 1);                         // only the overdue one; 'soon' is finished, 'later' is weeks away
  assert.equal(dueSoon(l, TODAY, 60), 2);
});

test('a deadline can be changed, added, or cleared (clearing also ends a repeat)', () => {
  let l = add(add([], { text: 'Pay rent', due: '2026-10-30', repeat: 'monthly' }), { text: 'Gift' });
  l = setDue(l, l[0].id, '2026-11-02');
  assert.deepEqual([l[0].due, l[0].repeat], ['2026-11-02', 'monthly']);
  l = setDue(l, l[1].id, '2026-12-01');
  assert.equal(l[1].due, '2026-12-01');
  l = setDue(l, l[0].id, '');
  assert.deepEqual([l[0].due, l[0].repeat], [null, null]);
  assert.equal(l[1].text, 'Gift');
});
