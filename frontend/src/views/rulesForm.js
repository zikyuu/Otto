// The rules screen: turn what was typed into the value the server expects, and read stored values back into form fields.

export const hm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = s => { const [h, m] = String(s).split(':').map(Number); return Number.isNaN(h) ? null : h * 60 + (m || 0); };

// fields: { a, b, text, num, choice, bool, past }  ->  value, or { error }
export function valueFor(rule, f) {
  switch (rule.kind) {
    case 'hours': {
      const a = Number(f.a), b = Number(f.b);
      if (!Number.isFinite(a) || !Number.isFinite(b) || f.a === '' || f.b === '') return { error: 'Give a start and an end hour.' };
      if (b <= a) return { error: 'The end hour has to be after the start.' };
      return [a, b];
    }
    case 'clock': {
      const m = toMin(f.text);
      if (m == null) return { error: 'Pick a time.' };
      return rule.key === 'day_end_min' && f.past ? m + 24 * 60 : m;
    }
    case 'minutes': {
      const n = Number(f.num);
      if (f.num === '' || !Number.isFinite(n)) return { error: 'Give a number of minutes.' };
      return Math.round(n);
    }
    case 'percent': {
      const n = Number(f.num);
      if (f.num === '' || !Number.isFinite(n)) return { error: 'Give a percentage.' };
      return Math.round(n) / 100;
    }
    case 'choice': return f.choice || rule.choices[0][0];
    case 'bool': return !!f.bool;
    default: return { error: 'Unknown rule.' };
  }
}

export const isError = v => v && typeof v === 'object' && !Array.isArray(v) && 'error' in v;

export const emptyFields = rule => ({ a: '9', b: '12', text: rule.key === 'day_end_min' ? '23:00' : '08:00', num: rule.kind === 'percent' ? '70' : '45', choice: rule.choices?.[0]?.[0] || '', bool: true, past: false });

// the form fields for a setting, filled from its current value
export function fieldsFor(m) {
  const f = emptyFields(m);
  const v = m.value;
  if (m.kind === 'hours' && Array.isArray(v)) return { ...f, a: String(v[0]), b: String(v[1]) };
  if (m.kind === 'clock') return { ...f, text: hm(v), past: v >= 24 * 60 };
  if (m.kind === 'minutes') return { ...f, num: String(v) };
  if (m.kind === 'percent') return { ...f, num: String(Math.round(v * 100)) };
  if (m.kind === 'choice') return { ...f, choice: v };
  if (m.kind === 'bool') return { ...f, bool: !!v };
  return f;
}
