// Why these sessions, in plain words, from the same learned numbers the scheduler used. This is what makes the suggestion
// checkable: you can see the focus span, the pace and the window behind every size and time.

const hh = h => `${String(h).padStart(2, '0')}:00`;
const MIN_EVIDENCE = 3;

// one sentence on the sizing: how many sittings, how long, and which learned numbers set that
export function sizeReason({ sessions, learned, category = 'deep_work' }) {
  if (!sessions.length || !learned) return '';
  const total = sessions.reduce((t, x) => t + x.durationMin, 0);
  const len = Math.round(total / sessions.length / 5) * 5;
  const pace = learned.avg_velocity?.[category] ?? learned.avg_velocity?.deep_work ?? 1;
  const span = learned.focus_span_min;
  const known = (learned.focus_evidence ?? 0) >= MIN_EVIDENCE;
  const paceText = pace > 1.05 ? `this kind of work runs ${Math.round((pace - 1) * 100)}% over your estimates` : pace < 0.95 ? 'you usually finish this kind of work early' : 'you usually hit your estimates';
  return `${sessions.length} sitting${sessions.length === 1 ? '' : 's'} of about ${len} min: ${paceText}, and you stay focused about ${span} min at a time` +
    (known ? ` (learned from ${learned.focus_evidence} sessions).` : ' (a starting default: Otto has not seen enough long sessions yet).');
}

// a short reason for one session's time
export function whySession(s, { learned, events = [], deadline }) {
  const [ps, pe] = learned?.peak_window || [9, 12];
  const inPeak = s.startMin >= ps * 60 && s.startMin < pe * 60;
  const blocker = events.find(e => e.fixed && e.day === s.day && e.startMin < pe * 60 && e.startMin + e.durationMin > ps * 60);
  const parts = [];
  if (inPeak) parts.push(`in your focus window (${hh(ps)} to ${hh(pe)})`);
  else if (blocker) parts.push(`${blocker.title} takes your focus window that day`);
  else parts.push(`your focus window was not free here`);
  if (deadline) {
    const left = Math.round((new Date(`${deadline}T00:00:00`) - new Date(new Date().getFullYear(), new Date().getMonth(), s.day)) / 86400000);
    if (Number.isFinite(left) && left >= 0 && left < 60) parts.push(left === 0 ? 'on the due date' : `${left} day${left === 1 ? '' : 's'} before it is due`);
  }
  return parts.join(', ');
}
