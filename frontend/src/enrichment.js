import { enrichTasks } from './api.js';

const WORDS = 15;
export const wordCount = text => (String(text || '').match(/\S+/g) || []).length;
export const worthEnriching = ev => wordCount([ev.title, ev.description].filter(Boolean).join(' ')) > WORDS;

// Apply what the model suggested, never over something the user typed: the title is replaced only because it was
// the long sentence being tidied (the original is kept in `enriched.from`); duration and subtasks are only filled in
// when the user left them alone.
export function applyEnrichment(ev, tidy) {
  const untouchedLength = !ev.duration_set;
  return {
    ...ev,
    title: tidy.title,
    category: ev.category_set ? ev.category : (ev.category || tidy.category),
    durationMin: untouchedLength && ev.durationMin === 60 ? tidy.minutes : ev.durationMin,
    subtasks: ev.subtasks?.length ? ev.subtasks : tidy.subtasks.map((s, i) => ({ id: `${ev.id}_s${i}`, name: s.name, minutes: s.minutes })),
    enriched: { from: ev.title, importance: tidy.importance },
  };
}

// One call for one new event; quietly nothing if it is short, over quota, or there is no key.
// Resolves the tidied title or null.
export async function enrichNew(ev, setEvents) {
  if (!worthEnriching(ev)) return null;
  try {
    const r = await enrichTasks([{ id: ev.id, text: [ev.title, ev.description].filter(Boolean).join('. ') }]);
    const tidy = r.enriched?.[0];
    if (!tidy) return null;
    setEvents(prev => prev.map(e => (e.id === ev.id ? applyEnrichment(e, tidy) : e)));
    return tidy.title;
  } catch { return null; }
}
