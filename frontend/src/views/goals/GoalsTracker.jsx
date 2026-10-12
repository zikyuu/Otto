import { useEffect, useMemo, useState } from 'react';
import GoalRow, { TONES } from './GoalRow.jsx';
import WizardOtter from './WizardOtter.jsx';
import Banner from '../../components/Banner.jsx';
import { statusOf, summarize, reviewPayload, addDays, daysBetween, progressPct } from './goalMath.js';
import { demoGoals, todayIso } from '../../data/goalsData.js';
import { IconPlus, IconWand } from '../calendar/Icons.jsx';

const GOALS_KEY = 'otto.goals.v1', WIZARD_KEY = 'otto.wizard.v1';
const WEEK_MS = 7 * 86400000;
// what the advice was written about: if any of this changes, the advice is out of date
const sigOf = g => `${Math.round(progressPct(g))}|${g.target}|${g.milestones.length}|${(g.detours || []).length}`;

const load = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
const save = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private window: the page still works */ } };

const VERDICT = {
  'on-track':   { label: 'On track', tone: 'good' },
  'at-risk':    { label: 'At risk', tone: 'warn' },
  'infeasible': { label: 'Not all reachable', tone: 'bad' },
};
const ago = at => {
  const d = Math.floor((Date.now() - at) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

function Wizard({ review, loading, error, onAsk }) {
  const v = review?.result && VERDICT[review.result.feasibility];
  const recent = review && Date.now() - review.at < WEEK_MS;
  return (
    <Banner art="banner-goals" minHeight={150} style={{ '--i': 1 }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <WizardOtter size={128} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <span className="pill-tag">The wizard</span>
            {v && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: TONES[v.tone].bg, color: TONES[v.tone].fg }}>{v.label}</span>}
            {review && <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>consulted {ago(review.at)}</span>}
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--ink-2)', maxWidth: 600 }}>
            {error ? <span role="alert" style={{ color: TONES.bad.fg }}>{error}</span>
              : review?.result?.summary ? review.result.summary
              : 'The numbers below are plain arithmetic on your own plan. Ask me once in a while whether the path itself still makes sense, and whether each goal can still reach its date.'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
            <button className="btn btn--primary" onClick={onAsk} disabled={loading} style={{ height: 38, padding: '0 8px 0 20px' }}>
              {loading ? 'Consulting' : review ? 'Consult again' : 'Consult the wizard'}
              <span className="btn__icon" style={{ marginRight: 0, width: 26, height: 26 }}>
                {loading ? <span aria-hidden style={{ display: 'inline-flex', gap: 2 }}>{[0, 1, 2].map(i => <i key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: 'currentColor', animation: `dotHop 1.1s var(--ease) ${i * 140}ms infinite` }} />)}</span> : <IconWand size={13} />}
              </span>
            </button>
            {recent && !loading && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Once a week is plenty; the arithmetic updates live as you tick things off.</span>}
          </div>
        </div>
      </div>
    </Banner>
  );
}

function NewGoal({ today, onAdd }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(''), [target, setTarget] = useState(addDays(today, 60)), [hpw, setHpw] = useState('4');
  const bad = !title.trim() || !target || !(Number(hpw) > 0) || daysBetween(today, target) <= 0;
  if (!open) return <button className="btn" onClick={() => setOpen(true)} style={{ alignSelf: 'flex-start' }}><IconPlus size={13} />New goal</button>;
  const field = { height: 32, padding: '0 12px', borderRadius: 999, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 13, outline: 'none', color: 'var(--ink)' };
  return (
    <form onSubmit={e => { e.preventDefault(); if (!bad) { onAdd({ title: title.trim(), target, hours_per_week: Number(hpw) }); setTitle(''); setOpen(false); } }}
      style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: 14, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="What do you want to achieve?" aria-label="Goal" style={{ ...field, flex: '1 1 240px' }} />
      <label style={{ fontSize: 12, color: 'var(--ink-3)', display: 'flex', gap: 6, alignItems: 'center' }}>by <input type="date" value={target} min={addDays(today, 1)} onChange={e => setTarget(e.target.value)} style={field} /></label>
      <label style={{ fontSize: 12, color: 'var(--ink-3)', display: 'flex', gap: 6, alignItems: 'center' }}><input type="number" min="0.5" step="0.5" value={hpw} onChange={e => setHpw(e.target.value)} style={{ ...field, width: 64 }} />hours a week</label>
      <button className="btn btn--primary" type="submit" disabled={bad}>Create</button>
      <button className="btn btn--ghost" type="button" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}

export default function GoalsTracker() {
  const today = useMemo(todayIso, []);
  const [goals, setGoals] = useState(() => load(GOALS_KEY, null) || demoGoals(today));
  const [review, setReview] = useState(() => load(WIZARD_KEY, null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // open the goal that needs attention most
  const [openId, setOpenId] = useState(() => {
    const rank = { impossible: 0, at_risk: 1, behind: 2, on_track: 3, ahead: 4, done: 5 };
    const gs = load(GOALS_KEY, null) || demoGoals(today);
    return [...gs].sort((a, b) => rank[statusOf(a, today)] - rank[statusOf(b, today)])[0]?.id ?? null;
  });

  useEffect(() => save(GOALS_KEY, goals), [goals]);
  useEffect(() => { if (review) save(WIZARD_KEY, review); }, [review]);

  const counts = summarize(goals, today);
  const update = g => setGoals(gs => gs.map(x => (x.id === g.id ? g : x)));
  const adviceFor = id => {
    const a = review?.result?.goals?.find(x => x.id === id);
    const g = goals.find(x => x.id === id);
    return a && g ? { ...a, stale: review.sigs?.[id] !== sigOf(g) } : undefined;
  };

  async function consult() {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/ai/review-goals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ today, goals: goals.map(g => reviewPayload(g, today)) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(res.status === 503 ? "The wizard is asleep: the server has no OpenAI key set."
          : typeof err.detail === 'string' ? err.detail
          : res.status >= 500 ? "Otto's server isn't reachable. Is the backend running on port 8000?" : `HTTP ${res.status}`);
      }
      setReview({ at: Date.now(), result: await res.json(), sigs: Object.fromEntries(goals.map(g => [g.id, sigOf(g)])) });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  function addGoal({ title, target, hours_per_week }) {
    const id = 'g' + Date.now();
    setGoals(gs => [...gs, { id, title, cat: 'Personal', start: today, target, hours_per_week, milestones: [], detours: [] }]);
    setOpenId(id);
  }

  return (
    <div style={{ padding: '14px 28px 48px 14px', maxWidth: 1180, margin: '0 auto' }}>
      <header className="rise" style={{ '--i': 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', margin: '18px 4px 22px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, letterSpacing: '-.03em' }}>Goals</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--ink-3)' }}>Milestones, where you should be by now, and what is in the way.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} aria-label="Summary">
          {[['good', 'on track'], ['warn', 'need attention'], ['bad', 'out of reach']].map(([tone, label]) => (
            <span key={tone} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: counts[tone] ? TONES[tone].bg : 'var(--surface-2)', color: counts[tone] ? TONES[tone].fg : 'var(--ink-4)', fontSize: 12.5, fontWeight: 500 }}>
              <span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{counts[tone]}</span>{label}
            </span>
          ))}
        </div>
      </header>

      <Wizard review={review} loading={loading} error={error} onAsk={consult} />

      <ul style={{ margin: '22px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {goals.map((g, i) => (
          <GoalRow key={g.id} index={i} goal={g} today={today} open={openId === g.id} advice={adviceFor(g.id)}
            onToggle={() => setOpenId(id => (id === g.id ? null : g.id))} onChange={update}
            onApplyDate={date => update({ ...g, target: date })} />
        ))}
      </ul>
      {goals.length === 0 && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>No goals yet. Add one to start tracking it.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 16 }}><NewGoal today={today} onAdd={addGoal} /></div>
    </div>
  );
}
