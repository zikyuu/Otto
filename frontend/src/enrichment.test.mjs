import test from 'node:test';
import assert from 'node:assert/strict';
import { wordCount, worthEnriching, applyEnrichment } from './enrichment.js';

const tidy = { title: 'Finish quarterly report', category: 'deep_work', minutes: 120, importance: 4, subtasks: [{ name: 'Charts', minutes: 45 }] };

test('only more than 15 words is worth a call', () => {
  assert.equal(wordCount(' a  b c '), 3);
  assert.equal(worthEnriching({ title: 'one two three four five six seven eight', description: 'nine ten eleven twelve thirteen fourteen fifteen' }), false);
  assert.equal(worthEnriching({ title: 'one two three four five six seven eight', description: 'nine ten eleven twelve thirteen fourteen fifteen sixteen' }), true);
});

test('suggestions fill gaps but never overwrite what the user chose', () => {
  const fresh = applyEnrichment({ id: 'x', title: 'long sentence', durationMin: 60, category: 'admin' }, tidy);
  assert.equal(fresh.title, 'Finish quarterly report');
  assert.equal(fresh.durationMin, 120);
  assert.deepEqual(fresh.subtasks, [{ id: 'x_s0', name: 'Charts', minutes: 45 }]);
  assert.equal(fresh.enriched.from, 'long sentence');
  const chosen = applyEnrichment({ id: 'y', title: 't', durationMin: 90, duration_set: true, category: 'gym', category_set: true, subtasks: [{ id: 's', name: 'Mine', minutes: 90 }] }, tidy);
  assert.equal(chosen.durationMin, 90);
  assert.equal(chosen.category, 'gym');
  assert.deepEqual(chosen.subtasks.map(s => s.name), ['Mine']);
});
