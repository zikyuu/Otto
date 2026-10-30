// Imported events are fixed (Otto plans around them) and tagged source:'gcal', so a sync replaces exactly those and
// never anything the user made. Events from outside the synced range are left alone.
export function syncGcalInto(events, incoming, { startIso, endIso }) {
  const mine = events.filter(e => e.source !== 'gcal');
  const inRange = d => d >= startIso && d <= endIso;
  const keepOutside = events.filter(e => e.source === 'gcal' && !inRange(e.date_iso || ''));
  const known = new Set(incoming.map(e => e.id));
  return [...mine, ...keepOutside.filter(e => !known.has(e.id)), ...incoming];
}
