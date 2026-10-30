// The server may be in another time zone (a hosted one runs on UTC). Every call to our own API carries the person's own local
// time, so "today" and "now" mean the same thing on both sides.
import { isApiCall } from './authLogic.js';

export const localStamp = (d = new Date()) => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

let installed = false;
export function installClientClock() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const raw = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (!isApiCall(url)) return raw(input, init);
    const headers = new Headers(init.headers || {});
    headers.set('X-Client-Now', localStamp());
    return raw(input, { ...init, headers });
  };
}
