// Quick capture: one line of free text becomes either a dated/undated reminder or a Meatball Grinder item, by plain rules.
//   "pay rent friday"            -> reminder due the coming Friday
//   "call the dentist next week" -> reminder due in 7 days
//   "read the RAG paper 45 min"  -> Meatball Grinder, 45 minutes (work to schedule later, no deadline)
//   "buy a gift"                 -> reminder, no date
// Nothing is guessed beyond that; anything unclear stays an undated reminder.

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (today, n) => { const d = new Date(`${today}T00:00:00`); d.setDate(d.getDate() + n); return d; };

// -> { due: 'YYYY-MM-DD' | null, rest: the text with the date phrase removed }
export function parseDue(text, today) {
  const s = ` ${text} `;
  const lead = '(?:\\s(?:by|on|before|due|until|for))?';
  const tries = [
    [/\s(?:on\s+|due\s+)?(\d{4}-\d{2}-\d{2})\b/i, m => m[1]],
    [new RegExp(`${lead}\\s(tomorrow)\\b`, 'i'), () => iso(at(today, 1))],
    [new RegExp(`${lead}\\s(today|tonight)\\b`, 'i'), () => today],
    [new RegExp(`${lead}\\s(?:in\\s+)?(\\d{1,2})\\s+(day|days|week|weeks)\\b`, 'i'), m => iso(at(today, parseInt(m[1], 10) * (/week/i.test(m[2]) ? 7 : 1)))],
    [new RegExp(`${lead}\\s(next\\s+week)\\b`, 'i'), () => iso(at(today, 7))],
    [new RegExp(`${lead}\\s(?:next\\s+|this\\s+|coming\\s+)?(${DAYS.join('|')})\\b`, 'i'), m => {
      const want = DAYS.indexOf(m[1].toLowerCase()), have = at(today, 0).getDay();
      return iso(at(today, ((want - have + 7) % 7) || 7));
    }],
    [new RegExp(`${lead}\\s(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join('|')})[a-z]*\\b`, 'i'), m => fromDM(parseInt(m[1], 10), m[2], today)],
    [new RegExp(`${lead}\\s(${MONTHS.join('|')})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), m => fromDM(parseInt(m[2], 10), m[1], today)],
  ];
  for (const [re, fn] of tries) {
    const m = s.match(re);
    if (m) return { due: fn(m), rest: (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim() };
  }
  return { due: null, rest: text.trim() };
}

function fromDM(day, mon, today) {
  const month = MONTHS.indexOf(mon.slice(0, 3).toLowerCase());
  const t = new Date(`${today}T00:00:00`);
  let d = new Date(t.getFullYear(), month, day);
  // a date that passed a few weeks ago is overdue ('pay rent due 30 sep' on 13 Oct); an older one means next year
  if (t - d > 60 * 86400000) d = new Date(t.getFullYear() + 1, month, day);
  return iso(d);
}

export function parseMinutes(text) {
  const h = text.match(/(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\b/i), m = text.match(/(\d+)\s*m(?:in(?:ute)?s?)?\b/i);
  const total = (h ? parseFloat(h[1]) * 60 : 0) + (m ? parseInt(m[1], 10) : 0);
  return total > 0 ? Math.round(total) : null;
}

const tidy = s => {
  const t = s.replace(/^(?:please\s+)?(?:remind me (?:to\s+)?|don'?t forget (?:to\s+)?|todo:?\s*)/i, '').replace(/[.,;]+$/, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
};

// -> { text, due, repeat, minutes } or null for an empty line.
// Every capture becomes a checklist item. A length ("45 min") is kept as a hint; a repeat ("every month") needs a date.
export function fileCapture(raw, today) {
  let line = String(raw || '').trim().slice(0, 160);
  if (!line) return null;
  let repeat = null;
  const rep = line.match(/\s*\b(every\s+month|monthly|every\s+week|weekly)\b\s*/i);
  if (rep) { repeat = /month/i.test(rep[1]) ? 'monthly' : 'weekly'; line = (line.slice(0, rep.index) + ' ' + line.slice(rep.index + rep[0].length)).replace(/\s+/g, ' ').trim(); }
  const { due, rest } = parseDue(line, today);
  const minutes = parseMinutes(rest);
  const stripped = minutes ? rest.replace(/\b\d+(?:\.\d+)?\s*(?:h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?)\b(?:\s*\d+\s*m(?:in)?\b)?/gi, ' ').replace(/\s+/g, ' ') : rest;
  const text = tidy(stripped) || tidy(rest);
  return text ? { text, due, repeat: due ? repeat : null, minutes } : null;
}
