//note to myself for whats here lol
// pure math, no react stuff

export const PX_PER_MIN = 1.4;
// The grid shows the whole day. Sleep hours are shaded and protected (the scheduler never plans into them on its own),
// but you can still drag work into them by hand, e.g. to rush a project.
export const DAY_START  = 0;
export const DAY_END    = 24 * 60;
export const GRID_H     = (DAY_END - DAY_START) * PX_PER_MIN;
export const SNAP       = 15;
export const HOURS      = Array.from({ length: 24 }, (_, i) => i);
export const DOW_NAMES  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function fmtTime(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

export function snapMin(min) {
  return Math.round(min / SNAP) * SNAP;
}

// Returns 7 Date objects Mon–Sun for the week `offsetWeeks` away from today.
export function getWeekDates(offsetWeeks = 0) {
  const today = new Date();
  const dow   = today.getDay(); // 0 = Sunday
  const toMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(today);
  monday.setDate(today.getDate() + toMonday + offsetWeeks * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

// `count` consecutive days starting at the Monday `offsetWeeks` away (7 = one week, 14 = two).
export function getDays(offsetWeeks = 0, count = 7) {
  const first = getWeekDates(offsetWeeks)[0];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    return d;
  });
}

export function fmtDur(m) {
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return h === 0 ? `${r}m` : r === 0 ? `${h}h` : `${h}h ${r}m`;
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export function monthLabel(offsetMonths = 0) {
  const t = new Date();
  const d = new Date(t.getFullYear(), t.getMonth() + offsetMonths, 1);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

// "Jun 2026" or "Jun – Jul 2026" if the week spans two months
export function weekRangeLabel(weekDates) {
  const first = weekDates[0];
  const last  = weekDates[weekDates.length - 1];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (first.getMonth() === last.getMonth()) {
    return `${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
  }
  return `${MONTHS[first.getMonth()]} – ${MONTHS[last.getMonth()]} ${last.getFullYear()}`;
}

// Local-date ISO string ("2026-08-03"). toISOString() would shift the day for users east/west of UTC.
export function isoDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}


// ---- real dates -------------------------------------------------------------------------------------------------------------
// An event's `day` is a day number: whole days since 1 Jan 1970 (local calendar). It is unique across months and years, so a
// week or a month can be shown for any date, and the same number means the same date everywhere (the server only compares them).
export const dayNum = d => {
  const x = d instanceof Date ? d : new Date(d);
  return Math.round(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86400000);
};
export const dateOfDay = n => new Date(1970, 0, 1 + n);
export const isoOfDay = n => isoDate(dateOfDay(n));
export const dayOfIso = iso => dayNum(new Date(`${String(iso).slice(0, 10)}T00:00:00`));

// events saved before real dates carried only the date of the month (1 to 31); read them as the nearest such date to today
export const isLegacyDay = n => Number.isInteger(n) && n >= 1 && n <= 31;
export function legacyToDay(n, today = new Date()) {
  let best = null, bestGap = Infinity;
  for (const m of [-1, 0, 1]) {
    const d = new Date(today.getFullYear(), today.getMonth() + m, n);
    if (d.getDate() !== n) continue;                       // the month has no such day (31 in a 30-day month)
    const gap = Math.abs(dayNum(d) - dayNum(today));
    if (gap < bestGap) { best = dayNum(d); bestGap = gap; }
  }
  return best ?? dayNum(today);
}
export function migrateEvents(events, today = new Date()) {
  if (!Array.isArray(events) || !events.some(e => isLegacyDay(e.day))) return events;
  return events.map(e => (isLegacyDay(e.day) ? { ...e, day: legacyToDay(e.day, today) } : e));
}
