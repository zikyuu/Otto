import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDue, fileCapture, parseMinutes } from './capture.js';

const TODAY = '2026-10-13';                       // a Tuesday

test('words become dates', () => {
  assert.deepEqual(parseDue('pay rent tomorrow', TODAY), { due: '2026-10-14', rest: 'pay rent' });
  assert.equal(parseDue('call mum today', TODAY).due, TODAY);
  assert.equal(parseDue('submit form in 3 days', TODAY).due, '2026-10-16');
  assert.equal(parseDue('review notes in 2 weeks', TODAY).due, '2026-10-27');
  assert.equal(parseDue('dentist next week', TODAY).due, '2026-10-20');
  assert.equal(parseDue('book flights 2026-11-02', TODAY).due, '2026-11-02');
});
test('a weekday is the next one, never today', () => {
  assert.equal(parseDue('pay rent by friday', TODAY).due, '2026-10-16');
  assert.equal(parseDue('gym on tuesday', TODAY).due, '2026-10-20');
  assert.equal(parseDue('call on monday', TODAY).due, '2026-10-19');
  assert.equal(parseDue('pay rent by friday', TODAY).rest, 'pay rent');
});
test('day and month, either order; a recent past date is overdue, an old one means next year', () => {
  assert.equal(parseDue('renew passport 30 oct', TODAY).due, '2026-10-30');
  assert.equal(parseDue('pay tax by October 31st', TODAY).due, '2026-10-31');
  assert.equal(parseDue('birthday gift 5 Jan', TODAY).due, '2027-01-05');
  assert.equal(parseDue('pay rent due 30 sep', TODAY).due, '2026-09-30');
});
test('no date leaves the text alone', () => {
  assert.deepEqual(parseDue('buy a gift', TODAY), { due: null, rest: 'buy a gift' });
});
test('durations', () => {
  assert.equal(parseMinutes('read the paper 45 min'), 45);
  assert.equal(parseMinutes('clean the flat 1h 30m'), 90);
  assert.equal(parseMinutes('2 hours of reading'), 120);
  assert.equal(parseMinutes('buy a gift'), null);
});
test('every capture is a checklist item: text, a date if there is one, a length as a hint, a repeat only with a date', () => {
  assert.deepEqual(fileCapture('remind me to pay rent by friday', TODAY), { text: 'Pay rent', due: '2026-10-16', repeat: null, minutes: null });
  assert.deepEqual(fileCapture('read the RAG paper 45 min', TODAY), { text: 'Read the RAG paper', due: null, repeat: null, minutes: 45 });
  assert.deepEqual(fileCapture('buy a gift', TODAY), { text: 'Buy a gift', due: null, repeat: null, minutes: null });
  assert.deepEqual(fileCapture('pay rent 30 oct every month', TODAY), { text: 'Pay rent', due: '2026-10-30', repeat: 'monthly', minutes: null });
  assert.equal(fileCapture('water the plants weekly', TODAY).repeat, null);              // no date, nothing to repeat from
  assert.equal(fileCapture('   ', TODAY), null);
});
