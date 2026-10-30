import { useEffect, useMemo, useState } from 'react';
import Banner from '../components/Banner.jsx';
import Mascot from '../components/Mascot.jsx';
import { Overlay } from '../modals/Feasibility.jsx';
import { overwhelmTriage, overwhelmPlan } from '../api.js';
import { defaultKeep, sections, minutesOf, dueText } from '../home/overwhelm.js';
import { fmtDur } from './calendar/calendarUtils.js';
import { IconFlag, IconArrow } from './calendar/Icons.jsx';

// "I'm overwhelmed". Today's work, ranked by what you said matters; the hours you can give; then the plan is shown on the calendar,
// next to your current one and a rest-the-day version, so you can see what each choice does before you pick.
//   events, weekDays, nowMin     the calendar          onPlan(plan, { restFirst, args })    onClose()
const HOUR_CHOICES = [1, 2, 3, 4, 6];

function Row({ t, on, onToggle }) {
  const due = dueText(t);
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', background: on ? 'var(--surface)' : 'transparent', boxShadow: `inset 0 0 0 1px ${on ? 'var(--line)' : 'transparent'}`, opacity: on ? 1 : .6, transition: 'all .4s var(--ease)' }}>
      <input type="checkbox" checked={on} onChange={onToggle} aria-label={`Still do ${t.title} today`} style={{ width: 17, height: 17, accentColor: 'var(--accent)' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
          {t.must && <span className="pill-tag" style={{ fontSize: 10 }}>must-do</span>}
          {t.importance && <span className="pill-tag" style={{ fontSize: 10, textTransform: 'none', letterSpacing: 0, background: 'rgba(106,120,77,.14)', color: 'var(--accent-ink)' }}>{t.importance}</span>}
          {due && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: t.hard ? '#A5543F' : '#8A6A2F' }}><IconFlag size={11} />{due}{t.hard ? ', hard' : ''}</span>}
        </span>
      </span>
      <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtDur(t.minutes)}</span>
    </label>
  );
}

export default function Overwhelmed({ events, weekDays, nowMin, onPlan, onClose }) {
  const [tri, setTri] = useState(null);
  const [error, setError] = useState('');
  const [hours, setHours] = useState(null);
  const [keep, setKeep] = useState([]);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState(null);          // the rest-day plan that cannot be done without a cost: asks before showing it

  useEffect(() => {
    overwhelmTriage(events, weekDays, nowMin).then(t => {
      setTri(t);
      const h = Math.max(1, Math.round((t.capacity_min / 60) * 2) / 2);
      setHours(h);
      setKeep(defaultKeep(t.tasks, h * 60));
    }).catch(e => setError(e.message));
  }, []);

  const sec = useMemo(() => (tri ? sections(tri.tasks) : null), [tri]);
  const chosenMin = tri ? minutesOf(tri.tasks, keep) : 0;
  const over = hours != null && chosenMin > hours * 60;

  function setHoursAndKeep(h) { setHours(h); if (tri) setKeep(defaultKeep(tri.tasks, h * 60)); }
  const toggle = id => setKeep(k => (k.includes(id) ? k.filter(x => x !== id) : [...k, id]));

  async function show(rest) {
    setBusy(true); setError('');
    try {
      const args = { events, weekDays, nowMin, hours: rest ? 0 : hours, keepIds: rest ? [] : keep };
      const plan = await overwhelmPlan(args);
      if (rest && !plan.rest_ok) { setWarn({ plan, args }); return; }
      onPlan(plan, { restFirst: rest, args });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div style={{ padding: '14px 28px 48px 14px', maxWidth: 940, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Banner art="banner-now" minHeight={150}>
        <p className="pill-tag" style={{ margin: 0, background: '#F3E6C8', color: '#8A6A2F' }}>Let us make today doable</p>
        <h1 style={{ margin: '12px 0 0', fontSize: 30, lineHeight: 1.08, maxWidth: 440 }}>Too much? Pick what still happens.</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-2)', maxWidth: 420, lineHeight: 1.5 }}>Nothing moves until you have seen the new plan on your calendar.</p>
        <Mascot art="otter-panicked" size={130} zoom={2.5} float style={{ position: 'absolute', right: 40, bottom: 0 }} />
      </Banner>

      {!tri && !error && <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>Reading your day…</p>}
      {tri && tri.tasks.length === 0 && (
        <section className="bezel rise"><div className="core" style={{ padding: '24px 28px' }}><p style={{ margin: 0, fontSize: 15 }}>There is nothing left to do today. That is a good place to be.</p></div></section>
      )}

      {tri && tri.tasks.length > 0 && (
        <>
          <section className="bezel rise" style={{ '--i': 1 }}>
            <div className="core" style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>I only want to work</span>
              <input type="number" min={0} max={16} step={0.5} value={hours ?? ''} aria-label="Hours to work today" onChange={e => setHoursAndKeep(Math.max(0, Math.min(16, Number(e.target.value) || 0)))}
                style={{ width: 74, height: 40, borderRadius: 12, border: 0, textAlign: 'center', fontSize: 17, fontWeight: 600, fontFamily: 'inherit', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)', outline: 'none' }} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>hours today</span>
              <span className="seg" role="group" aria-label="Quick hours" style={{ padding: 2 }}>
                {HOUR_CHOICES.map(h => <button key={h} aria-pressed={hours === h} onClick={() => setHoursAndKeep(h)} style={{ height: 26, padding: '0 10px', fontSize: 12 }}>{h}h</button>)}
              </span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12.5, color: over ? '#A5543F' : 'var(--ink-3)' }}>
                {fmtDur(chosenMin)} ticked of {fmtDur(tri.total_min)}{over ? ', more than the hours you gave' : ''}
              </span>
            </div>
          </section>

          {[['Due soon', sec.soon, 'These have a deadline coming. Moving them costs you something.'], ['Has to happen eventually', sec.eventually, 'No deadline pressing. These can move without anything breaking.']].map(([title, list, sub], i) => list.length > 0 && (
            <section key={title} className="bezel rise" style={{ '--i': 2 + i }}>
              <div className="core" style={{ padding: '16px 14px 12px' }}>
                <header style={{ padding: '0 10px 8px' }}>
                  <h2 style={{ margin: 0, fontSize: 17 }}>{title}</h2>
                  <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--ink-3)' }}>{sub} Ranked by what you said matters, then by deadline. Tick what you still want to do today.</p>
                </header>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{list.map(t => <Row key={t.id} t={t} on={keep.includes(t.id)} onToggle={() => toggle(t.id)} />)}</div>
              </div>
            </section>
          ))}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn--primary" disabled={busy} onClick={() => show(false)} style={{ height: 46, padding: '0 10px 0 22px', fontSize: 14.5 }}>
              {busy ? 'Planning…' : 'Show me the plan'}<span className="btn__icon" style={{ width: 30, height: 30, marginRight: 0 }}><IconArrow size={14} /></span>
            </button>
            <button className="btn" disabled={busy} onClick={() => show(true)} style={{ height: 46 }} title="Clear the rest of today and see what that does to the week">I need a rest day</button>
            <button className="btn btn--ghost" onClick={onClose} style={{ height: 46 }}>I am okay, back to my plan</button>
          </div>
        </>
      )}
      {error && <p role="alert" style={{ color: '#A5543F', fontSize: 13.5 }}>{error}</p>}

      {warn && (
        <Overlay>
          <div className="bezel bezel--float" style={{ width: 'min(540px,94%)', animation: 'sheetUp .7s var(--ease) both' }}>
            <div className="core" style={{ padding: '26px 30px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Mascot art="otter-panicked" size={76} zoom={2.5} float />
                <div>
                  <p className="pill-tag" style={{ margin: 0, background: '#F2D9CF', color: '#A5543F' }}>Otto is worried</p>
                  <h2 style={{ margin: '8px 0 0', fontSize: 21, fontWeight: 600, letterSpacing: '-.03em', lineHeight: 1.2 }}>Otto suggests you pull through today.</h2>
                </div>
              </div>
              <p style={{ margin: '14px 0 0', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
                {fmtDur(warn.plan.shortfall_min)} of work with a hard deadline has nowhere to go if you rest. Resting means it lands in your sleep hours, or misses its deadline. Otto has seen your focus fall away late at night, so it would not be good work either.
              </p>
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                {warn.plan.rest.warnings.slice(0, 3).map((w, i) => <li key={i}>{w.text}</li>)}
              </ul>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
                <button className="btn btn--primary" onClick={() => { const w = warn; setWarn(null); onPlan(w.plan, { restFirst: false, args: w.args }); }}>Pull through: show Otto&rsquo;s plan</button>
                <button className="btn" onClick={() => { const w = warn; setWarn(null); onPlan(w.plan, { restFirst: true, args: w.args }); }}>Rest anyway: show me what it costs</button>
                <button className="btn btn--ghost" onClick={() => setWarn(null)}>Go back</button>
              </div>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
