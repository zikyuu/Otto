import { DAY_START, DAY_END } from './calendarUtils.js';

// Where a dragged sleep edge lands: 30-minute steps, kept on the grid, keeping a waking day of at least 6 hours
export function dragSleep(edge, minute, wake, sleep) {
  const m = Math.round(minute / 30) * 30;
  if (edge === 'wake') return { wake: Math.max(DAY_START, Math.min(m, 12 * 60, sleep - 360)), sleep };
  return { wake, sleep: Math.max(wake + 360, Math.min(m, DAY_END)) };
}

// the clock minute under the pointer -> wake/sleep, with the rules above
export const WAKE_MAX = 12 * 60;

// Is any of this block outside the waking day? Then it is "crunch" work: placed in protected sleep time on purpose.
export const outsideAwake = (ev, wake, sleep) => ev.startMin < wake || ev.startMin + ev.durationMin > sleep;

// the same event with `crunch` set or removed to match where it now sits
export function withCrunch(ev, wake, sleep) {
  if (ev.fixed) return ev;
  if (outsideAwake(ev, wake, sleep)) return { ...ev, crunch: true };
  const { crunch, ...rest } = ev;          // eslint-disable-line no-unused-vars
  return rest;
}
