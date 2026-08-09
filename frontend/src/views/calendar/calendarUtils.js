//note to myself for whats here lol
// pure math, no react stuff

export const PX_PER_MIN = 1.4;
export const DAY_START  = 8  * 60;
export const DAY_END    = 23 * 60;
export const GRID_H     = (DAY_END - DAY_START) * PX_PER_MIN;
export const SNAP       = 15;
export const HOURS      = Array.from({ length: 15 }, (_, i) => i + 8);
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

// "Jun 2026" or "Jun – Jul 2026" if the week spans two months
export function weekRangeLabel(weekDates) {
  const first = weekDates[0];
  const last  = weekDates[6];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (first.getMonth() === last.getMonth()) {
    return `${MONTHS[first.getMonth()]} ${first.getFullYear()}`;
  }
  return `${MONTHS[first.getMonth()]} – ${MONTHS[last.getMonth()]} ${last.getFullYear()}`;
}
