// The importance cards. Work is sorted into three cards (important / good to accomplish / whatever) and, inside a card, into
// tiers: tier 1 matters most, and work that shares a tier has no order between it. The sorting is stored on the calendar events
// themselves (importance_cat, importance_tier), which is what the scheduler reads. A repeating event is one card for the whole
// series, a task cut into sessions is one card for all its sessions.

export const CATS = [
  { key: 'important', label: 'Important', hint: 'What has to go well.' },
  { key: 'good', label: 'Good to accomplish', hint: 'Worth doing, not urgent in itself.' },
  { key: 'whatever', label: 'Whatever', hint: 'Fine if it slips.' },
];

// One card per piece of work, however many times it shows up: a repeating event, a task cut into sessions, or two events
// with the same name are all one card, so a thing you do three times a week is ranked once, not three times.
const SESSION = /\s*\(\d+\/\d+\)$/;
export const baseTitle = e => String(e.base_title || e.title || '').replace(SESSION, '').trim();
export const groupKey = e => `t:${baseTitle(e).toLowerCase()}`;
const isOpen = e => !e.fixed && !e.done && !e.reflection?.choice;

// the cards to show: open work from today on, one per task or series
export function items(events, today) {
  const map = new Map();
  for (const e of events) {
    if (!isOpen(e) || e.day < today) continue;
    const k = groupKey(e);
    const g = map.get(k) || { key: k, title: baseTitle(e), ids: [], minutes: 0, first: e.day, deadline: null, repeats: false, count: 0, cat: null, tier: null, category: e.category };
    g.ids.push(e.id);
    g.count = g.ids.length;
    if (e.series_id) g.repeats = true;
    g.minutes += e.durationMin;
    g.first = Math.min(g.first, e.day);
    if (e.deadline_iso && (!g.deadline || e.deadline_iso < g.deadline)) g.deadline = e.deadline_iso.slice(0, 10);
    if (e.importance_cat) { g.cat = e.importance_cat; g.tier = e.importance_tier || 1; }
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => a.first - b.first || a.title.localeCompare(b.title));
}

// { important: [[item, item], [item]], good: [...], whatever: [...] }: tiers in order, each a list; plus the unsorted ones
export function board(list) {
  const out = { important: [], good: [], whatever: [], unsorted: [] };
  for (const cat of ['important', 'good', 'whatever']) {
    const mine = list.filter(i => i.cat === cat);
    const tiers = [...new Set(mine.map(i => i.tier))].sort((a, b) => a - b);
    out[cat] = tiers.map(t => mine.filter(i => i.tier === t));
  }
  out.unsorted = list.filter(i => !i.cat);
  return out;
}

// tiers inside each card are renumbered 1..n with no gaps, so "tier 2" always means the second rung
export function normalize(events) {
  const byCat = { important: new Set(), good: new Set(), whatever: new Set() };
  for (const e of events) if (byCat[e.importance_cat]) byCat[e.importance_cat].add(e.importance_tier || 1);
  const rank = {};
  for (const [c, s] of Object.entries(byCat)) rank[c] = new Map([...s].sort((a, b) => a - b).map((t, i) => [t, i + 1]));
  return events.map(e => (byCat[e.importance_cat] && rank[e.importance_cat].get(e.importance_tier || 1) !== e.importance_tier ? { ...e, importance_tier: rank[e.importance_cat].get(e.importance_tier || 1) } : e));
}

// put a card in a place. tier: a number (join that tier), 'new' (a new lowest tier), 'top' (a new top tier), 'before:N' (a new tier
// between the tier above tier N and tier N)
export function place(events, key, cat, tier = 'new') {
  let t;
  if (cat == null) return events.map(e => (groupKey(e) === key ? strip(e) : e));
  const inCat = events.filter(e => e.importance_cat === cat && groupKey(e) !== key);
  const top = inCat.reduce((m, e) => Math.max(m, e.importance_tier || 1), 0);
  if (tier === 'new') t = top + 1;
  else if (tier === 'top') t = 0.5;
  else if (typeof tier === 'string' && tier.startsWith('before:')) t = Number(tier.slice(7)) - 0.5;
  else t = tier;
  return normalize(events.map(e => (groupKey(e) === key ? { ...e, importance_cat: cat, importance_tier: t } : e)));
}

function strip(e) { const { importance_cat, importance_tier, ...rest } = e; return rest; }

// the question of which of two things gives way, answered by the user
export function resolve(events, decision, winner) {
  const { low, high } = decision;
  if (winner === 'low') {
    const hi = events.find(e => e.id === high.id);
    const tier = hi?.importance_tier || 1;
    return events.map(e => {
      if (e.id === low.id) return { ...e, importance_cat: 'important', importance_tier: Math.max(1, tier - 1) || 1, yielded: undefined };
      if (e.id === high.id) return { ...e, importance_tier: tier + (tier === 1 ? 1 : 0) };
      return e;
    });
  }
  return events.map(e => (e.id === low.id ? { ...e, yielded: true } : e));       // the important thing stays; this one is let go, and not asked about again
}

// keep every repeating event's template in step with how its occurrences are sorted
export function syncTemplates(seriesList, events) {
  let changed = false;
  const out = seriesList.map(s => {
    const e = events.find(x => x.series_id === s.id);
    const cat = e?.importance_cat ?? null, tier = e?.importance_tier ?? null;
    if ((s.template.importance_cat ?? null) === cat && (s.template.importance_tier ?? null) === tier) return s;
    changed = true;
    const t = { ...s.template };
    if (cat == null) { delete t.importance_cat; delete t.importance_tier; } else { t.importance_cat = cat; t.importance_tier = tier; }
    return { ...s, template: t };
  });
  return changed ? out : seriesList;
}

// a new event with the same name as work you have already sorted starts out sorted the same way
export function inherit(events, ev) {
  if (ev.importance_cat) return ev;
  const k = groupKey(ev);
  const like = events.find(e => e.id !== ev.id && e.importance_cat && groupKey(e) === k);
  return like ? { ...ev, importance_cat: like.importance_cat, importance_tier: like.importance_tier } : ev;
}
