import test from 'node:test';
import assert from 'node:assert/strict';
import { valueFor, isError, hm } from './rulesForm.js';

test('typed fields become the values the server expects', () => {
  assert.deepEqual(valueFor({ kind: 'hours' }, { a: '9', b: '12' }), [9, 12]);
  assert.ok(isError(valueFor({ kind: 'hours' }, { a: '12', b: '9' })));
  assert.ok(isError(valueFor({ kind: 'hours' }, { a: '', b: '9' })));
  assert.equal(valueFor({ kind: 'clock', key: 'day_start_min' }, { text: '08:30' }), 510);
  assert.equal(valueFor({ kind: 'clock', key: 'day_end_min' }, { text: '01:00', past: true }), 25 * 60);
  assert.equal(valueFor({ kind: 'minutes' }, { num: '45.4' }), 45);
  assert.equal(valueFor({ kind: 'percent' }, { num: '70' }), 0.7);
  assert.equal(valueFor({ kind: 'bool' }, { bool: false }), false);
  assert.equal(valueFor({ kind: 'choice', choices: [['batch', 'x']] }, { choice: '' }), 'batch');
  assert.equal(hm(25 * 60), '01:00');
});

test('a saved setting fills the form back in', async () => {
  const { fieldsFor } = await import('./rulesForm.js');
  assert.deepEqual(fieldsFor({ kind: 'hours', value: [10, 13] }).a, '10');
  assert.equal(fieldsFor({ kind: 'clock', value: 25 * 60, key: 'day_end_min' }).past, true);
  assert.equal(fieldsFor({ kind: 'clock', value: 25 * 60, key: 'day_end_min' }).text, '01:00');
  assert.equal(fieldsFor({ kind: 'percent', value: 0.65 }).num, '65');
  assert.equal(fieldsFor({ kind: 'choice', value: 'spread', choices: [['batch', 'x']] }).choice, 'spread');
});
