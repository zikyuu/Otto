// The repeating-event series, kept in the browser (and mirrored to the server like every otto.* key).
export const SERIES_KEY = 'otto.series.v1';
let cache = null;
const subs = new Set();

export function getSeries() {
  if (cache) return cache;
  try { const v = JSON.parse(localStorage.getItem(SERIES_KEY)); cache = Array.isArray(v) ? v : []; } catch { cache = []; }
  return cache;
}
export function setSeriesList(upd) {
  const next = typeof upd === 'function' ? upd(getSeries()) : upd;
  cache = next;
  try { localStorage.setItem(SERIES_KEY, JSON.stringify(next)); } catch { /* private window: it still works for this visit */ }
  subs.forEach(f => f());
}
export const subscribeSeries = f => { subs.add(f); return () => subs.delete(f); };
// after the server copy has been loaded into localStorage
export function reloadSeries() { cache = null; subs.forEach(f => f()); }
