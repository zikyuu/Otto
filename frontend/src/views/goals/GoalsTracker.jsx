import StatCard from '../../components/StatCard.jsx';
import { useEffect, useMemo, useState } from 'react';
import GoalRow, { TONES } from './GoalRow.jsx';
import WizardOtter from './WizardOtter.jsx';
import Banner from '../../components/Banner.jsx';
import { statusOf, summarize, reviewPayload, addDays, daysBetween, progressPct } from './goalMath.js';
import { applyChanges, goalFromProposal, describeChange } from './goalChanges.js';
import { addSummary } from '../../api.js';
import { demoGoals, demoReview, todayIso } from '../../data/goalsData.js';
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

function Wizard({ review, loading, error, onAsk, onSample }) {
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
            {review?.result?.sample && <span className="pill-tag" style={{ background: '#F3E6C8', color: '#8A6A2F' }}>Sample, made-up advice</span>}
            {review && !review.result?.sample && <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>consulted {ago(review.at)}</span>}
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
            <button className="btn btn--ghost" onClick={onSample} disabled={loading} title="Fills the page with a made-up review so you can try the proposed changes without asking the AI">See a sample review</button>
            {recent && !loading && !review?.result?.sample && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Once a week is plenty; the arithmetic updates live as you tick things off.</span>}
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
  const field = { height: 32, padding: '0 12px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 13, outline: 'none', color: 'var(--ink)' };
  return (
    <form onSubmit={e => { e.preventDefault(); if (!bad) { onAdd({ title: title.trim(), target, hours_per_week: Number(hpw) }); setTitle(''); setOpen(false); } }}
      style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: 14, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--line)' }}>
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

  // Only ever called from a button. `before` is kept so the last change can be taken back.
  const [undo, setUndo] = useState(null);
  const [dismissed, setDismissed] = useState(() => new Set());
  function applyToGoal(goalId, changes) {
    const g = goals.find(x => x.id === goalId);
    if (!g) return;
    setUndo({ before: g, label: changes.length === 1 ? 'Change applied.' : `${changes.length} changes applied.` });
    addSummary('goal_review', `“${g.title}”: ${changes.map(c => describeChange(g, c)).join(' ')}`.slice(0, 400), changes.map(c => ({ label: describeChange(g, c) })));      // what was decided, not the conversation
    update(applyChanges(g, changes, today));
  }
  function undoLast() { update(undo.before); setUndo(null); }
  function addProposed(p) {
    const g = goalFromProposal(p, today);
    setGoals(gs => [...gs, g]);
    addSummary('goal_review', `Added a new goal: “${g.title}”.`, [{ label: 'New goal', value: g.title }]);
    setDismissed(d => new Set(d).add(p.id));
    setOpenId(g.id);
  }

  // a made-up review in the real shape, to try the screens without an AI call (the goals are not touched)
  function loadSample() {
    setError(''); setDismissed(new Set());
    setReview({ at: Date.now(), result: demoReview(goals, today), sigs: Object.fromEntries(goals.map(g => [g.id, sigOf(g)])) });
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
          <h1 style={{ margin: 0, fontSize: 34 }}>Goals</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--ink-3)' }}>Milestones, where you should be by now, and what is in the way.</p>
        </div>
            </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14, marginBottom: 16 }} aria-label="Summary">
        <StatCard i={1} value={counts.good} label="On track" tone="green" />
        <StatCard i={2} value={counts.warn} label="Need attention" />
        <StatCard i={3} value={counts.bad} label="Out of reach" tone={counts.bad ? 'copper' : 'plain'} />
        <StatCard i={4} value={goals.length} label="Goals" />
      </div>

      <Wizard review={review} loading={loading} error={error} onAsk={consult} onSample={loadSample} />

      {undo && (
        <div role="status" className="rise" style={{ margin: '14px 0 0', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 14, background: '#E4EAD3', color: '#4E5C36', fontSize: 13.5 }}>
          <span style={{ flex: 1 }}>{undo.label} Finished work was kept.</span>
          <button className="btn" onClick={undoLast}>Undo</button>
          <button className="btn btn--ghost" onClick={() => setUndo(null)}>Keep it</button>
        </div>
      )}

      {(review?.result?.new_goals || []).filter(p => !dismissed.has(p.id)).map(p => (
        <section key={p.id} className="bezel rise" style={{ marginTop: 14 }} aria-label="A goal the wizard suggests">
          <div className="core" style={{ padding: '16px 20px', background: '#F9EDE4' }}>
            <p className="label-caps" style={{ margin: 0, color: '#8C4A33' }}>The wizard suggests a new goal</p>
            <h2 style={{ margin: '6px 0 4px', fontSize: 19 }}>{p.title}</h2>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{p.why} By {p.target}, about {p.hours_per_week}h a week.</p>
            {p.milestones.length > 0 && <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 12.5, color: 'var(--ink-2)' }}>{p.milestones.map((m, i) => <li key={i}>{m.title} ({m.effort_h}h, due {m.due})</li>)}</ul>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn--primary" onClick={() => addProposed(p)}>Add it to my goals</button>
              <button className="btn btn--ghost" onClick={() => setDismissed(d => new Set(d).add(p.id))}>Not now</button>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--ink-3)' }}>Only added if you press the button.</p>
          </div>
        </section>
      ))}

      <ul style={{ margin: '22px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {goals.map((g, i) => (
          <GoalRow key={g.id} index={i} goal={g} today={today} open={openId === g.id} advice={adviceFor(g.id)}
            onToggle={() => setOpenId(id => (id === g.id ? null : g.id))} onChange={update}
            onApplyDate={date => { update({ ...g, target: date }); addSummary('goal_review', `“${g.title}”: target date moved from ${g.target} to ${date}.`, [{ label: 'Move the target date', value: date }]); }} onApplyChanges={ch => applyToGoal(g.id, ch)} />
        ))}
      </ul>
      {goals.length === 0 && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>No goals yet. Add one to start tracking it.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 16 }}><NewGoal today={today} onAdd={addGoal} /></div>
    </div>
  );
}
