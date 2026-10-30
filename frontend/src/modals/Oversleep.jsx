import { useRef, useState } from 'react';
import Mascot from '../components/Mascot.jsx';
import { Overlay } from './Feasibility.jsx';
import { IconArrow, IconClock } from '../views/calendar/Icons.jsx';
import { fmtDur, fmtTime } from '../views/calendar/calendarUtils.js';

// Late start: open the app 2h+ after the first planned event. Three ways out, none of them a scolding.
//   1. Reschedule from now (recommended): what is left, ranked, and each task gets its own answer: today, tomorrow, the grinder or dropped.
//   2. Keep the original plan: what already passed shows as a ghost.
//   3. Write off today: fixed events stay, flexible work is parked; optionally hold the best for tomorrow morning.
//
//   info   { late_by_min, triage: { ranked, line, capacity_min } }
//   onApply(mode, { keepIds, choices, protectTomorrow })    onClose()

const MODES = [
  ['reschedule', 'Reschedule from now', 'Fit what matters into the rest of today.', true],
  ['keep', 'Keep the original plan', 'Nothing moves. What already passed shows as a ghost.', false],
  ['write_off', 'Write off today', 'Fixed events stay. The rest is parked, no catching up.', false],
];

const CHOICES = [['today', 'Today'], ['tomorrow', 'Tomorrow'], ['grinder', 'Meatball Grinder'], ['drop', 'Drop']];

// how much each one matters to you, as set on the Priorities page: red = important, yellow = good to accomplish, green = whatever
const WEIGHT = {
  important: { bar: '#C4866D', tint: 'rgba(196,134,109,.13)', label: 'Important' },
  good: { bar: '#D9A441', tint: 'rgba(217,164,65,.14)', label: 'Good to accomplish' },
  whatever: { bar: '#7E9159', tint: 'rgba(126,145,89,.13)', label: 'Whatever' },
};

// every task gets its own answer: still today (re-placed from now), first thing tomorrow, parked in the Meatball Grinder, or dropped
function Triage({ ranked, choices, setChoice, capacity }) {
  const used = ranked.filter(r => choices[r.id] === 'today').reduce((s, r) => s + r.minutes, 0);
  const over = used > capacity;
  const anyWeight = ranked.some(r => WEIGHT[r.importance_cat]);
  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
        Ranked by what is at stake. Pick what happens to each one. Otto suggests the top of the list stays today, which is{' '}
        <strong style={{ color: over ? '#A5543F' : 'var(--ink)', fontWeight: 600 }}>{fmtDur(used)}</strong> of the about {fmtDur(capacity)} you can honestly take on.
      </p>
      {anyWeight && (
        <p style={{ margin: '0 0 10px', display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--ink-3)' }}>
          {Object.values(WEIGHT).map(w => <span key={w.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: w.bar }} />{w.label}</span>)}
        </p>
      )}
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ranked.map((r, i) => {
          const c = choices[r.id], w = WEIGHT[r.importance_cat];
          const passed = r.missed;                                   // its time has gone: shown as history, not as something to rush
          return (
            <li key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px 9px 12px', borderRadius: 10, flexWrap: 'wrap', position: 'relative', overflow: 'hidden',
              background: passed ? 'rgba(32,40,8,.05)' : w ? w.tint : c === 'today' ? 'var(--surface)' : 'transparent',
              boxShadow: `inset 0 0 0 1px ${c === 'today' && !passed ? 'var(--line)' : 'transparent'}`,
              opacity: c === 'drop' ? .55 : 1, filter: passed ? 'grayscale(1)' : 'none', transition: 'all .5s var(--ease)',
            }}>
              {w && <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: passed ? '#B8B4A6' : w.bar }} />}
              <span className="mono" style={{ width: 18, fontSize: 11.5, color: 'var(--ink-3)' }}>{i + 1}</span>
              <span style={{ flex: '1 1 140px', minWidth: 0, fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: c === 'drop' ? 'line-through' : 'none', color: passed ? 'var(--ink-3)' : 'inherit' }}
                title={w ? `${r.title} · ${w.label}` : r.title}>{r.title}</span>
              {r.non_negotiable && <span className="pill-tag" style={{ fontSize: 10 }}>must</span>}
              {passed && <span style={{ fontSize: 11, color: 'var(--ink-3)' }} title={`Was planned for ${fmtTime(r.was_start)}`}>already passed</span>}
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{fmtDur(r.minutes)}</span>
              <div role="group" aria-label={`What happens to ${r.title}`} className="seg" style={{ padding: 2 }}>
                {CHOICES.map(([v, text]) => <button key={v} aria-pressed={c === v} onClick={() => setChoice(r.id, v)} style={{ height: 24, padding: '0 10px', fontSize: 11.5 }}>{text}</button>)}
              </div>
            </li>
          );
        })}
      </ol>
      {ranked.length === 0 && <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>Nothing flexible is left today.</p>}
    </div>
  );
}

export default function Oversleep({ info, busy, error, onApply, onClose }) {
  const ranked = info.triage?.ranked || [];
  const [mode, setMode] = useState('reschedule');
  const line = info.triage?.line ?? ranked.length;
  const [choices, setChoices] = useState(() => Object.fromEntries(ranked.map((r, i) => [r.id, i < line ? 'today' : 'grinder'])));
  const [protect, setProtect] = useState(false);
  const hours = Math.floor(info.late_by_min / 60), mins = info.late_by_min % 60;

  return (
    <Overlay>
      <div className="bezel bezel--float" style={{ width: 'min(560px,94%)', maxHeight: '92%', display: 'flex', animation: 'sheetUp .7s var(--ease) both' }}>
        <div className="core" style={{ padding: '26px 30px 24px', overflowY: 'auto', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Mascot art="otter-sleeping" size={84} zoom={2.5} float />
            <div>
              <p className="pill-tag" style={{ margin: 0 }}>Late start</p>
              <h2 style={{ margin: '8px 0 0', fontSize: 23, fontWeight: 600, letterSpacing: '-.03em', lineHeight: 1.15 }}>You are starting {hours ? `${hours}h ` : ''}{mins ? `${mins}m ` : ''}after plan.</h2>
              <p style={{ margin: '5px 0 0', fontSize: 13.5, color: 'var(--ink-3)' }}>It happens. Pick how you want to carry on.</p>
            </div>
          </div>

          <div role="radiogroup" aria-label="How to carry on" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
            {MODES.map(([key, title, sub, rec]) => (
              <button key={key} role="radio" aria-checked={mode === key} onClick={() => setMode(key)} style={{
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', border: 0, color: 'inherit', fontFamily: 'inherit',
                padding: '13px 16px', borderRadius: 12, background: mode === key ? '#E4EAD3' : 'var(--surface-2)',
                boxShadow: `inset 0 0 0 ${mode === key ? 2 : 1}px ${mode === key ? 'var(--accent)' : 'var(--line)'}`, transition: 'all .5s var(--ease)',
              }}>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, letterSpacing: '-.015em' }}>{title}{rec && <span className="pill-tag" style={{ marginLeft: 8, fontSize: 10 }}>recommended</span>}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</span>
                </span>
              </button>
            ))}
          </div>

          {mode === 'reschedule' && <div style={{ marginTop: 16 }}><Triage ranked={ranked} choices={choices} setChoice={(id, v) => setChoices(c => ({ ...c, [id]: v }))} capacity={info.triage?.capacity_min ?? 0} /></div>}
          {mode === 'write_off' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, fontSize: 13.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={protect} onChange={e => setProtect(e.target.checked)} />
              Protect tomorrow morning for the most important of it
            </label>
          )}
          {mode === 'keep' && <p style={{ margin: '14px 2px 0', fontSize: 13, color: 'var(--ink-3)' }}><IconClock size={12} /> {ranked.filter(r => r.missed).length} block(s) already passed and will show as ghosts.</p>}

          {error && <p role="alert" style={{ margin: '14px 0 0', fontSize: 13, color: '#A5543F' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button className="btn btn--primary" disabled={busy} style={{ height: 44, padding: '0 8px 0 22px', fontSize: 14 }}
              onClick={() => onApply(mode, { keepIds: mode === 'reschedule' ? ranked.filter(r => choices[r.id] === 'today').map(r => r.id) : null, choices: mode === 'reschedule' ? choices : null, protectTomorrow: protect })}>
              {busy ? 'Working on it…' : mode === 'reschedule' ? 'Re-plan my day' : mode === 'keep' ? 'Keep it as is' : 'Write off today'}
              <span className="btn__icon" style={{ width: 28, height: 28, marginRight: 0 }}><IconArrow size={14} /></span>
            </button>
            <button className="btn btn--ghost" onClick={onClose} style={{ height: 44 }}>Not now</button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
