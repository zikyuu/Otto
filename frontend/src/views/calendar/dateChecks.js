// Validation for the popup's Deadline / Best-done-by dates. Pure, ISO "YYYY-MM-DD" strings
// (these compare correctly as plain strings).

const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const real = s => FULL_DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00`));

// A date is only sensible if it's today or later AND not before the day the event itself sits on —
// a deadline can't land before the work it's a deadline for.
export function checkDates({ deadline, bestDoneBy, eventIso, todayIso }) {
  const floor  = eventIso > todayIso ? eventIso : todayIso;
  const errors = {};

  const check = (value, label) => {
    if (!value) return null;
    if (!real(value)) return 'Enter a full date';
    if (value < todayIso) return 'That date has already passed';
    if (value < floor)    return `${label} is before this event (${eventIso})`;
    return null;
  };

  const d = check(deadline, 'Deadline');
  const b = check(bestDoneBy, 'Best-done-by');
  if (d) errors.deadline = d;
  if (b) errors.bestDoneBy = b;
  if (!d && !b && deadline && bestDoneBy && bestDoneBy > deadline) {
    errors.bestDoneBy = 'Best done by should be on or before the deadline';
  }
  return errors;
}
