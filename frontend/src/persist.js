// Everything the page keeps under an `otto.*` localStorage key is mirrored to the server (Supabase when it is
// configured, a local file otherwise), so a reload on another device or after clearing the browser loses nothing.
// The components keep reading and writing localStorage exactly as before; this module sits underneath them:
//
//   hydrate()        before the first render: server copies win; keys only this browser has are sent up once
//   installMirror()  after that: every localStorage write/remove under `otto.` is sent on, debounced
//
// Network failure never blocks the page: localStorage stays the working copy.

import { tokenNow } from './auth.js';

const PREFIX = 'otto.';
const DEBOUNCE = 600;
const timers = new Map();
let status = { backend: 'local', ok: true };
const listeners = new Set();

export const syncStatus = () => status;
export function onSyncStatus(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setStatus(next) { status = { ...status, ...next }; listeners.forEach(fn => fn(status)); }

const isOurs = k => typeof k === 'string' && k.startsWith(PREFIX);

async function put(key, raw) {
  let value;
  try { value = JSON.parse(raw); } catch { return; }       // only JSON documents are mirrored
  try {
    const r = await fetch(`/api/state/${encodeURIComponent(key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value }) });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    setStatus({ ok: true, backend: j.backend || status.backend });
  } catch { setStatus({ ok: false }); }
}
async function del(key) {
  try { await fetch(`/api/state/${encodeURIComponent(key)}`, { method: 'DELETE' }); setStatus({ ok: true }); } catch { setStatus({ ok: false }); }
}

export async function hydrate({ timeoutMs = 2500 } = {}) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch('/api/state', { signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) throw new Error(String(r.status));
    const { state, backend } = await r.json();
    for (const [k, v] of Object.entries(state || {})) {
      if (isOurs(k)) try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ }
    }
    // data this browser has that the server has never seen (from before persistence existed): send it up once
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (isOurs(k) && !(k in (state || {}))) put(k, localStorage.getItem(k));
      }
    } catch { /* ignore */ }
    setStatus({ ok: true, backend: backend || 'file' });
    return true;
  } catch {
    setStatus({ ok: false });
    return false;
  }
}

let installed = false;
export function installMirror() {
  if (installed) return;
  installed = true;
  const set = Storage.prototype.setItem, rem = Storage.prototype.removeItem;
  const queue = (key, fn) => {
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { timers.delete(key); fn(); }, DEBOUNCE));
  };
  Storage.prototype.setItem = function (k, v) {
    set.call(this, k, v);
    if (this === window.localStorage && isOurs(k)) queue(k, () => put(k, v));
  };
  Storage.prototype.removeItem = function (k) {
    rem.call(this, k);
    if (this === window.localStorage && isOurs(k)) queue(k, () => del(k));
  };
  // flush what is pending if the tab closes
  window.addEventListener('pagehide', () => {
    for (const [k, t] of timers) {
      clearTimeout(t);
      try { fetch(`/api/state/${encodeURIComponent(k)}`, { method: 'PUT', keepalive: true, headers: { 'Content-Type': 'application/json', ...(tokenNow() ? { Authorization: `Bearer ${tokenNow()}` } : {}) }, body: JSON.stringify({ value: JSON.parse(localStorage.getItem(k)) }) }).catch(() => {}); } catch { /* ignore */ }
    }
  });
}
