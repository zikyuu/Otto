import test from 'node:test';
import assert from 'node:assert/strict';
import { items, board, place, normalize, resolve, groupKey, inherit } from './priorityBoard.js';

const ev = (id, extra = {}) => ({ id, title: id, day: 10, startMin: 600, durationMin: 60, category: 'admin', fixed: false, ...extra });

test('one card per piece of work: sessions, repeats and same-named events are one card, only open work from today on', () => {
  const evs = [ev('a'), ev('a2', { split_of: 'a', title: 'a (2/2)', day: 11 }), ev('r1', { series_id: 's1', title: 'Gym', day: 10 }), ev('r2', { series_id: 's1', title: 'Gym', day: 12 }),
    ev('g3', { title: 'gym ', day: 13 }), ev('past', { day: 5 }), ev('done', { done: true }), ev('lock', { fixed: true }), ev('d', { deadline_iso: '2026-10-20T00:00', day: 12 })];
  const it = items(evs, 10);
  assert.deepEqual(it.map(i => i.title).sort(), ['Gym', 'a', 'd']);
  const a = it.find(i => i.title === 'a');
  assert.deepEqual(a.ids.sort(), ['a', 'a2']);
  assert.equal(a.minutes, 120);
  const gym = it.find(i => i.title === 'Gym');
  assert.deepEqual([gym.ids.length, gym.count, gym.repeats], [3, 3, true]);                   // three gym sessions, one card
  assert.equal(it.find(i => i.title === 'd').deadline, '2026-10-20');
});

test('cards come out in tiers, several to a tier, and unsorted work is its own pile', () => {
  const evs = [ev('a', { importance_cat: 'important', importance_tier: 1 }), ev('b', { importance_cat: 'important', importance_tier: 1 }), ev('c', { importance_cat: 'important', importance_tier: 2 }),
    ev('d', { importance_cat: 'whatever', importance_tier: 1 }), ev('e')];
  const b = board(items(evs, 0));
  assert.deepEqual(b.important.map(t => t.map(i => i.key).sort()), [['t:a', 't:b'], ['t:c']]);
  assert.deepEqual(b.good, []);
  assert.deepEqual(b.unsorted.map(i => i.key), ['t:e']);
});

test('dropping into a tier, a new bottom tier or a new top tier, and tiers stay numbered 1..n', () => {
  let evs = [ev('a'), ev('b'), ev('c')];
  evs = place(evs, 't:a', 'important', 'new');
  evs = place(evs, 't:b', 'important', 'new');
  evs = place(evs, 't:c', 'important', 1);
  const t = id => evs.find(e => e.id === id).importance_tier;
  assert.deepEqual([t('a'), t('b'), t('c')], [1, 2, 1]);                  // c joined a's tier
  evs = place(evs, 't:b', 'important', 'top');
  assert.deepEqual([t('b'), t('a'), t('c')], [1, 2, 2]);                  // b is now above both
  evs = place(evs, 't:a', 'whatever', 'new');
  assert.deepEqual([evs.find(e => e.id === 'a').importance_cat, t('a')], ['whatever', 1]);
  assert.deepEqual([t('b'), t('c')], [1, 2]);                             // the gap left in important closed
  evs = place(evs, 't:a', null);
  assert.equal('importance_cat' in evs.find(e => e.id === 'a'), false);
});

test('a new tier can go between two tiers that are already set', () => {
  let evs = [ev('laundry'), ev('gym'), ev('walk')];
  evs = place(evs, groupKey(evs[0]), 'whatever', 'new');
  evs = place(evs, groupKey(evs[1]), 'whatever', 'new');
  evs = place(evs, groupKey(evs[2]), 'whatever', 'before:2');                    // between laundry (tier 1) and gym (tier 2)
  const t = id => evs.find(e => e.id === id).importance_tier;
  assert.deepEqual([t('laundry'), t('walk'), t('gym')], [1, 2, 3]);
  evs = place(evs, groupKey(evs[0]), 'whatever', 'before:1');                    // above everything
  assert.deepEqual([t('laundry'), t('walk'), t('gym')], [1, 2, 3].map(x => x));
});

test('moving a repeating event or a split task moves every piece of it', () => {
  const evs = [ev('r1', { series_id: 's', title: 'Gym' }), ev('r2', { series_id: 's', title: 'Gym', day: 11 }), ev('x')];
  const out = place(evs, groupKey(evs[0]), 'good', 'new');
  assert.deepEqual(out.map(e => e.importance_cat), ['good', 'good', undefined]);
});

test('an event made later with the same name starts out sorted the same way', () => {
  const evs = [ev('g1', { title: 'Gym', importance_cat: 'good', importance_tier: 2 })];
  const made = inherit(evs, ev('g2', { title: 'gym' }));
  assert.deepEqual([made.importance_cat, made.importance_tier], ['good', 2]);
  assert.equal(inherit(evs, ev('x', { title: 'Other' })).importance_cat, undefined);
});

test('tiers are renumbered without gaps', () => {
  const out = normalize([ev('a', { importance_cat: 'good', importance_tier: 3 }), ev('b', { importance_cat: 'good', importance_tier: 7 }), ev('c', { importance_cat: 'good', importance_tier: 7 })]);
  assert.deepEqual(out.map(e => e.importance_tier), [1, 2, 2]);
});

test('answering which matters more: the low one is promoted above the other, or is let go and not asked again', () => {
  const evs = [ev('low', { importance_cat: 'whatever', importance_tier: 1 }), ev('high', { importance_cat: 'important', importance_tier: 1 })];
  const d = { low: { id: 'low' }, high: { id: 'high' } };
  const a = resolve(evs, d, 'low');
  const low = a.find(e => e.id === 'low'), high = a.find(e => e.id === 'high');
  assert.equal(low.importance_cat, 'important');
  assert.ok(low.importance_tier < high.importance_tier);
  const b = resolve(evs, d, 'high');
  assert.equal(b.find(e => e.id === 'low').yielded, true);
  assert.equal(b.find(e => e.id === 'high').importance_cat, 'important');
});

import { syncTemplates } from './priorityBoard.js';
test('repeating-event templates follow how their occurrences are sorted', () => {
  const list = [{ id: 's', template: { title: 't' } }];
  const out = syncTemplates(list, [ev('x', { series_id: 's', importance_cat: 'good', importance_tier: 2 })]);
  assert.deepEqual([out[0].template.importance_cat, out[0].template.importance_tier], ['good', 2]);
  assert.equal(syncTemplates(out, [ev('x', { series_id: 's', importance_cat: 'good', importance_tier: 2 })]), out);
  assert.equal('importance_cat' in syncTemplates(out, [ev('x', { series_id: 's' })])[0].template, false);
});
