// The Meatball Grinder holds work parked on purpose. After 5 days an item is nudged once: Keep it (clock restarts),
// Delete it, or file it as Someday (no scheduling pressure, no more nudges). Pure functions over the grinder list.

export const NUDGE_AFTER_DAYS = 5;
const DAY = 86400000;

export const ageDays = (item, now = Date.now()) => {
  const t = Date.parse(item.parked_iso || '');
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : 0;
};

export const isStale = (item, now = Date.now()) => !item.someday && ageDays(item, now) >= NUDGE_AFTER_DAYS;
export const stale = (items, now = Date.now()) => items.filter(i => isStale(i, now));

export const keep = (items, id, now = Date.now()) => items.map(i => (i.id === id ? { ...i, parked_iso: new Date(now).toISOString(), kept: (i.kept || 0) + 1 } : i));
export const someday = (items, id) => items.map(i => (i.id === id ? { ...i, someday: true } : i));
export const drop = (items, id) => items.filter(i => i.id !== id);
export const reopen = (items, id, now = Date.now()) => items.map(i => (i.id === id ? { ...i, someday: false, parked_iso: new Date(now).toISOString() } : i));

export const ageLabel = (item, now = Date.now()) => {
  const d = ageDays(item, now);
  return d === 0 ? 'today' : d === 1 ? '1 day' : `${d} days`;
};
