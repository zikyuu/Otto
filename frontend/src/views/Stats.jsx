import { useEffect, useState } from 'react';
import Banner from '../components/Banner.jsx';
import Mascot from '../components/Mascot.jsx';
import StatCard from '../components/StatCard.jsx';
import WeekNodes from '../components/WeekNodes.jsx';
import { getWeekly, narrateWeekly, ackDrift, getSummaries, getPatterns } from '../api.js';
import { IconSparkle, IconArrow } from './calendar/Icons.jsx';
import { fmtDur } from './calendar/calendarUtils.js';

const STATUS_TEXT = { ahead: 'Ahead', 'on track': 'On track', 'a bit behind': 'Slightly behind', behind: 'Behind', 'no data yet': 'No data yet' };
const SAYS = {
  focus_span_min: d => `${d.label}: ${d.from} → ${d.to} minutes`,
  planning_bias: d => `${d.label}: ${Math.round(d.from * 100)}% → ${Math.round(d.to * 100)}%`,
  completion_rate: d => `${d.label}: ${Math.round(d.from * 100)}% → ${Math.round(d.to * 100)}%`,
  peak_window: d => `${d.label}: ${d.from[0]}:00 → ${d.to[0]}:00`,
};
const driftLine = d => (SAYS[d.key] ? SAYS[d.key](d) : `${d.label}: ${d.from} → ${d.to}`);
const CAT = { deep_work: 'Deep work', admin: 'Admin', creative: 'Creative', physical: 'Physical', social: 'Social' };

const CONF = {
  high: ['Confident', 'rgba(126,145,89,.22)', '#4E5E2E'],
  medium: ['Early read', '#F3E6C8', '#8A6A2F'],
  low: ['Still learning', 'rgba(32,40,8,.07)', 'var(--ink-3)'],
};

function Pill({ c }) {
  const [t, bg, ink] = CONF[c] || CONF.low;
  return <span className="pill-tag" style={{ fontSize: 10, textTransform: 'none', letterSpacing: 0, background: bg, color: ink, whiteSpace: 'nowrap' }}>{t}</span>;
}

// rows and columns: what, what Otto sees, how sure it is. Open a row for the full sentence. Anything Otto cannot read yet stays tucked away.
function PatternRow({ x }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: '1px solid var(--line-soft)' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1.4fr) auto 14px', alignItems: 'center', gap: 10, width: '100%', padding: '9px 0', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit', fontFamily: 'inherit' }}>
        <span className="display" style={{ fontSize: 13.5, fontWeight: 500 }}>{x.label}</span>
        <span style={{ fontSize: 12.5, color: x.state === 'found' ? 'var(--ink)' : 'var(--ink-3)' }}>{x.short}</span>
        <Pill c={x.confidence} />
        <span style={{ color: 'var(--ink-4)', fontSize: 10, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s var(--ease)' }}>▾</span>
      </button>
      {open && (
        <p style={{ margin: '0 0 10px', fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)', animation: 'fadeIn .15s var(--ease)' }}>
          {x.text}{x.confidence !== 'low' && x.evidence ? <span style={{ color: 'var(--ink-3)' }}> From {x.evidence} data points.</span> : null}
        </p>
      )}
    </div>
  );
}

function PatternTable({ patterns }) {
  const [more, setMore] = useState(false);
  const sure = patterns.filter(x => x.confidence !== 'low'), learning = patterns.filter(x => x.confidence === 'low');
  return (
    <div>
      {sure.length === 0 && <p style={{ margin: '4px 0 8px', fontSize: 13, color: 'var(--ink-3)' }}>Nothing to read yet. Finish a few blocks and tap how you feel, and patterns start to show.</p>}
      {sure.map(x => <PatternRow key={x.key} x={x} />)}
      {learning.length > 0 && (
        <div style={{ borderTop: '1px solid var(--line-soft)' }}>
          <button onClick={() => setMore(m => !m)} aria-expanded={more} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 0', background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-3)', fontFamily: 'inherit', fontSize: 12.5 }}>
            <span style={{ flex: 1, textAlign: 'left' }}>{learning.length} still learning</span>
            <span style={{ fontSize: 10, transform: more ? 'rotate(180deg)' : 'none', transition: 'transform .2s var(--ease)' }}>▾</span>
          </button>
          {more && learning.map(x => <PatternRow key={x.key} x={x} />)}
        </div>
      )}
    </div>
  );
}

function Panel({ title, i = 4, tone, right, children, style }) {
  return (
    <section className="bezel rise" style={{ '--i': i, ...style }}>
      <div className="core" style={{ background: tone }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px 6px' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>{right}
        </header>
        <div style={{ padding: '6px 22px 20px' }}>{children}</div>
      </div>
    </section>
  );
}

function Bar({ label, value, max, sub, color = 'var(--dingley)' }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, marginBottom: 4 }}>
        <span className="display" style={{ fontWeight: 500 }}>{label}</span><span className="mono" style={{ color: 'var(--ink-3)' }}>{sub}</span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: 'rgba(106,120,77,.14)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, max ? (value / max) * 100 : 0)}%`, borderRadius: 999, background: color, transition: 'width .8s var(--ease)' }} />
      </div>
    </div>
  );
}

// refreshKey changes when the weekly chat pinned something, so the numbers are re-read
export default function Stats({ onOpenChat, refreshKey = 0 }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [recap, setRecap] = useState(null);
  const [busy, setBusy] = useState(false);
  const [past, setPast] = useState([]);
  const [patterns, setPatterns] = useState([]);
  useEffect(() => { getPatterns().then(r => setPatterns(r.patterns || [])).catch(() => {}); }, [refreshKey]);
  useEffect(() => { getSummaries().then(r => setPast(r.summaries || [])).catch(() => {}); }, [refreshKey]);

  useEffect(() => {
    let live = true;
    setError('');
    getWeekly().then(d => { if (live) { setData(d); setRecap(d.recap); } }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [refreshKey]);

  async function rewrite() {
    setBusy(true);
    try { setRecap(await narrateWeekly()); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function dismissDrift() {
    await ackDrift().catch(() => {});
    setData(d => ({ ...d, drift: { ...d.drift, due: false } }));
  }

  const m = data?.metrics;
  const max = Math.max(60, ...(m?.per_day || []).map(d => d.minutes));
  const catMax = Math.max(60, ...(m?.by_category || []).flatMap(c => [c.planned_min, c.actual_min]));
  const nodes = (m?.per_day || []).map(d => ({ label: d.label === 'T' ? 'T' : d.label, state: d.today ? 'today' : d.minutes > 0 ? 'done' : 'todo', sub: d.minutes ? fmtDur(d.minutes) : null }));

  return (
    <div style={{ padding: '14px 28px 48px 14px', maxWidth: 1180, margin: '0 auto' }}>
      <Banner art="banner-stats" minHeight={130}>
        <p className="pill-tag" style={{ margin: 0 }}>Last 7 days</p>
        <h1 style={{ margin: '12px 0 0', fontSize: 36, lineHeight: 1.05 }}>Your week</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14.5, color: 'var(--ink-2)' }}>Measured by showing up, not by being perfect.</p>
      </Banner>

      {error && (
        <section className="bezel rise" style={{ '--i': 1, marginTop: 16 }} role="alert">
          <div className="core" style={{ padding: '18px 24px', background: '#F3DDD2', display: 'flex', gap: 16, alignItems: 'center' }}>
            <Mascot art="otter-sad" size={64} zoom={2.5} />
            <div>
              <h2 style={{ margin: 0, fontSize: 18, color: '#8C4A33' }}>Otto cannot read your week yet</h2>
              <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#8C4A33', lineHeight: 1.5 }}>
                {error === 'Not Found' || /HTTP 404/.test(error)
                  ? 'The server that answered is out of date or is a different app. Stop it and start Otto\'s backend again: cd backend && .venv/bin/uvicorn app.main:app --port 8000.'
                  : error}
              </p>
            </div>
          </div>
        </section>
      )}

      {data?.drift?.due && (
        <section className="bezel rise" style={{ '--i': 1, marginTop: 16 }}>
          <div className="core" style={{ padding: '18px 24px', background: '#F3E6C8', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <h2 style={{ margin: 0, fontSize: 17, color: '#7A5A1E' }}>Something shifted</h2>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>{data.drift.drifts.map(d => <li key={d.key}>{driftLine(d)}</li>)}</ul>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--ink-3)' }}>Did something change? Telling me beats me guessing.</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary" onClick={() => onOpenChat?.('Some of the numbers I track moved this week. Did something change in how you work?')}>Talk it through<span className="btn__icon" style={{ width: 24, height: 24, marginRight: 0 }}><IconArrow size={12} /></span></button>
              <button className="btn btn--ghost" onClick={dismissDrift}>It is fine</button>
            </div>
          </div>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 14, marginTop: 16 }}>
        <StatCard i={1} value={m ? m.streak_days : '·'} unit={m?.streak_days === 1 ? 'day' : 'days'} label="Momentum streak" tone="green" />
        <StatCard i={2} value={m ? Math.round(m.focus_hours * 10) / 10 : '·'} unit="h" label="Focus hours" hint={m ? `Across ${m.days_active} of 7 days` : ''} />
        <StatCard i={3} value={m?.versus_plan != null ? Math.round(m.versus_plan * 100) : '·'} unit="%" label="Versus your plan" hint={m ? STATUS_TEXT[m.status] : ''} />
        <StatCard i={4} value={m ? m.late_starts : '·'} label="Late starts" tone={m?.late_starts >= 2 ? 'copper' : 'plain'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(280px,1fr)', gap: 16, marginTop: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Panel title="How locked-in you were" i={5}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, height: 190, marginTop: 10 }}>
              {!m && <p style={{ margin: 'auto', color: 'var(--ink-3)', fontSize: 14 }}>{error ? '' : 'Reading your week…'}</p>}
              {(m?.per_day || []).map(({ label, minutes, today }, i) => (
                <div key={i} title={fmtDur(minutes)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                  <div style={{ width: '100%', maxWidth: 46, height: Math.max(6, (minutes / max) * 150), borderRadius: 14, transformOrigin: 'bottom', animation: `barGrow 1s var(--spring) ${300 + i * 90}ms both`,
                    background: today ? 'linear-gradient(180deg,#D69B82,#C4866D)' : 'linear-gradient(180deg,#8A9868,#6A784D)', boxShadow: today ? '0 12px 16px -12px rgba(165,84,63,.7)' : 'none' }} />
                  <span className="display" style={{ fontSize: 13, color: today ? '#8C4A33' : 'var(--ink-3)' }}>{label}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Where the time went" i={6}>
            {(!m || m.by_category.length === 0) && <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-3)' }}>Reflect on a session or two and the split by kind of work shows up here.</p>}
            {(m?.by_category || []).map(c => (
              <Bar key={c.category} label={CAT[c.category] || c.category} value={c.actual_min} max={catMax} sub={`${fmtDur(c.actual_min)} of ${fmtDur(c.planned_min)} planned`}
                color={c.actual_min < c.planned_min * 0.9 ? 'var(--copper)' : 'var(--dingley)'} />
            ))}
            {m?.off_track_total_min > 0 && <p style={{ margin: '14px 0 0', fontSize: 13, color: 'var(--ink-3)' }}>{m.off_track_total_min} minutes went off track: {Object.entries(m.off_track_min).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(', ')}.</p>}
          </Panel>
          <Panel title="How you work" i={8} right={<span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{patterns.filter(x => x.confidence !== 'low').length} of {patterns.length} read</span>}>
            <PatternTable patterns={patterns} />
          </Panel>
          <Panel title="Past check-ins" i={9}>
            {past.length === 0
              ? <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>Nothing yet. After a weekly check-in or a goal review, a short note of what you decided shows up here. The conversations themselves are not kept.</p>
              : past.slice(0, 8).map(e => (
                <div key={e.at + e.text} style={{ padding: '8px 0', borderTop: '1px solid var(--line-soft)', fontSize: 13.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--ink-3)', fontSize: 12 }}>
                    <span>{e.kind === 'goal_review' ? 'Goal review' : 'Weekly check-in'}</span>
                    <span className="mono">{new Date(e.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                  </div>
                  <div style={{ marginTop: 2, lineHeight: 1.45 }}>{e.text}</div>
                </div>
              ))}
          </Panel>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Panel title="Your days" i={5}>{m ? <WeekNodes days={nodes} /> : <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 14 }}>…</p>}</Panel>

          <div className="sticky rise" style={{ '--i': 6, transform: 'rotate(.8deg)', padding: '16px 18px 18px' }}>
            <p className="label-caps" style={{ margin: 0, color: '#7A5A1E' }}>A realistic recap</p>
            <h2 style={{ margin: '8px 0 6px', fontSize: 20, color: '#5C4A12' }}>{recap?.headline || (error ? 'Nothing to say yet.' : 'Reading your week…')}</h2>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>{recap?.body}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn" onClick={rewrite} disabled={busy || !m?.sessions} title="Rewrites this recap in Otto's voice using the AI language model. The numbers stay exactly the same. Without an AI key it just shows the plain recap again."><IconSparkle size={13} />{busy ? 'Writing…' : 'Say it like Otto'}</button>
              <button className="btn btn--primary" onClick={() => onOpenChat?.()} style={{ padding: '0 8px 0 18px' }}>Check in<span className="btn__icon" style={{ width: 24, height: 24, marginRight: 0 }}><IconArrow size={12} /></span></button>
            </div>
          </div>

          {m && (
            <Panel title="What Otto learned" i={7}>
              {[['Best focus hours', `${m.learned.peak_window[0]}:00 to ${m.learned.peak_window[1]}:00`], ['You are a', `${m.learned.chronotype} person`], ['Focus span', `${m.learned.focus_span_min} min`], ['Plans about', `${Math.round(m.learned.planning_bias * 100)}% of free time`]].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--line-soft)', fontSize: 13.5 }}>
                  <span style={{ color: 'var(--ink-3)' }}>{k}</span><span className="display" style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
              <Mascot art="otter-celebrating" size={96} zoom={2.5} float style={{ margin: '10px auto 0', display: 'block' }} />
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}
