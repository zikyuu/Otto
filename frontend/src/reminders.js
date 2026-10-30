// "Remind me" items: things that have no place on the calendar but must happen by some date (pay rent, renew passport).
// Pure functions over a list of { id, text, due: 'YYYY-MM-DD' | null, repeat: 'weekly' | 'monthly' | null, done, doneAt }.

let seq = 0;
const newId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;
const DAY = 86400000;
const parse = iso => new Date(`${iso}T00:00:00`);

export const REPEATS = [[null, 'Once'], ['weekly', 'Every week'], ['monthly', 'Every month']];

export function add(list, { text, due = null, repeat = null, minutes = null }) {
  const t = String(text || '').trim().slice(0, 140);
  if (!t) return list;
  return [...list, { id: newId(), text: t, due: due || null, repeat: due ? repeat : null, ...(minutes ? { minutes } : {}), done: false }];
}
export const remove = (list, id) => list.filter(r => r.id !== id);

// change (or clear, with an empty value) a reminder's deadline; clearing it also ends any repeat, which needs a date to repeat from
export const setDue = (list, id, due) => list.map(r => (r.id === id ? { ...r, due: due || null, repeat: due ? r.repeat : null } : r));

// the next due date for a repeating item: same weekday a week on, or the same day of the next month (clamped: 31 Jan -> 28 Feb)
export function nextDue(iso, repeat) {
  const d = parse(iso);
  if (repeat === 'weekly') { d.setDate(d.getDate() + 7); }
  else if (repeat === 'monthly') {
    const day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  } else return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ticking a repeating reminder moves it to its next date instead of finishing it; unticking restores a finished one
export function toggle(list, id, now = Date.now()) {
  return list.map(r => {
    if (r.id !== id) return r;
    if (r.done) return { ...r, done: false, doneAt: undefined };
    if (r.repeat && r.due) return { ...r, due: nextDue(r.due, r.repeat), lastDone: now };
    return { ...r, done: true, doneAt: now };
  });
}

// days from `today` (an ISO date) to the due date: negative = overdue; null = no date
export function daysUntil(r, today) {
  return r.due ? Math.round((parse(r.due) - parse(today)) / DAY) : null;
}

export function dueLabel(r, today) {
  const n = daysUntil(r, today);
  if (n === null) return 'Whenever';
  if (n < 0) return n === -1 ? 'Due yesterday' : `${-n} days overdue`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  if (n < 7) return `Due in ${n} days`;
  return `Due ${parse(r.due).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}

// 'overdue' | 'soon' (within 3 days) | 'later' | 'open' (no date)
export function urgency(r, today) {
  const n = daysUntil(r, today);
  return n === null ? 'open' : n < 0 ? 'overdue' : n <= 3 ? 'soon' : 'later';
}

// open ones first, most urgent first; undated last, in the order they were added; finished ones after, newest first
export function sorted(list, today) {
  const open = list.filter(r => !r.done).map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const x = daysUntil(a.r, today), y = daysUntil(b.r, today);
      if (x === null && y === null) return a.i - b.i;
      if (x === null) return 1;
      if (y === null) return -1;
      return x - y || a.i - b.i;
    }).map(o => o.r);
  const done = list.filter(r => r.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  return [...open, ...done];
}

// how many need attention: overdue or due within `days`
export const dueSoon = (list, today, days = 7) => list.filter(r => !r.done && r.due && daysUntil(r, today) <= days).length;
