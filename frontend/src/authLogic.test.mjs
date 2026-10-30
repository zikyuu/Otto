import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerAction, prepareLocalData, clearOttoKeys, isApiCall, OWNER_KEY } from './authLogic.js';

const store = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
};

test('the first sign-in adopts what is already in the browser, the same person keeps it, somebody else clears it', () => {
  assert.equal(ownerAction(null, 'a'), 'adopt');
  assert.equal(ownerAction('a', 'a'), 'keep');
  assert.equal(ownerAction('a', 'b'), 'clear');
});

test('a different person never inherits (or uploads) the last person\'s calendar', () => {
  const s = store({ 'otto.events.v1': '[1]', 'otto.goals.v1': '[2]', [OWNER_KEY]: 'a', other: 'x' });
  assert.equal(prepareLocalData(s, 'b'), 'clear');
  assert.equal(s.getItem('otto.events.v1'), null);
  assert.equal(s.getItem('otto.goals.v1'), null);
  assert.equal(s.getItem(OWNER_KEY), 'b');
  assert.equal(s.getItem('other'), 'x');                         // only Otto's own keys go
});

test('an existing local calendar moves into the first account; the owner marker is not an otto.* key', () => {
  const s = store({ 'otto.events.v1': '[1]' });
  assert.equal(prepareLocalData(s, 'a'), 'adopt');
  assert.equal(s.getItem('otto.events.v1'), '[1]');
  assert.equal(OWNER_KEY.startsWith('otto.'), false);
  assert.equal(prepareLocalData(s, 'a'), 'keep');
});

test('clearing counts what it removed', () => {
  assert.equal(clearOttoKeys(store({ 'otto.a': '1', 'otto.b': '2', c: '3' })), 2);
});

test('the token goes only to our own API', () => {
  assert.equal(isApiCall('/api/state'), true);
  assert.equal(isApiCall('https://evil.example/api/state'), false);
  assert.equal(isApiCall('//evil.example/api/x'), false);
  assert.equal(isApiCall('/assets/app.js'), false);
});
