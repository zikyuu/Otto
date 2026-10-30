import { useEffect, useRef, useState } from 'react';
import { PX_PER_MIN, DAY_START, DAY_END, GRID_H, fmtTime } from './calendarUtils.js';
import { IconClose } from './Icons.jsx';

// The edges of the day. The shaded bands are sleep: before you wake and after you go to bed. Drag a band's handle to
// change the hours Otto may schedule in. Beyond what the grid shows (earlier than 08:00, later than 23:00) use the
// Sleep button, which takes any time.
//   wake, sleep   minutes from midnight (sleep may pass midnight: 1500 = 01:00)
//   onGrab(edge, e)   the handle was pressed; the grid does the dragging
export function SleepBands({ wake, sleep, onGrab, active }) {
  const topH = Math.max(0, Math.min(wake, DAY_END) - DAY_START) * PX_PER_MIN;
  const botTop = Math.max(0, Math.min(sleep, DAY_END + 1) - DAY_START) * PX_PER_MIN;
  const band = { position: 'absolute', left: 0, right: 0, pointerEvents: 'none', zIndex: 2, background: 'repeating-linear-gradient(135deg, rgba(32,40,8,.07) 0 6px, rgba(32,40,8,.035) 6px 12px)' };
  const handle = (edge, y, text) => (
    <div role="slider" tabIndex={0} aria-label={edge === 'wake' ? 'Wake time' : 'Bedtime'} aria-valuetext={text}
      onPointerDown={e => onGrab(edge, e)}
      onKeyDown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onGrab(edge, null, e.key === 'ArrowDown' ? 30 : -30); } }}
      style={{ position: 'absolute', left: 0, right: 0, top: y - 7, height: 14, zIndex: 12, cursor: 'ns-resize', touchAction: 'none', display: 'flex', alignItems: 'center' }}>
      <span style={{ flex: 1, borderTop: `2px ${active === edge ? 'solid' : 'dashed'} rgba(106,120,77,.${active === edge ? 9 : 5})` }} />
      <span className="mono" style={{ position: 'absolute', right: 6, top: edge === 'wake' ? 12 : -14, fontSize: 10, fontWeight: 600, padding: '1px 8px', borderRadius: 999, background: 'var(--forest)', color: 'var(--forest-ink)', opacity: active === edge ? 1 : .0, transition: 'opacity .3s var(--ease)' }}>{edge === 'wake' ? 'wake ' : 'sleep '}{text}</span>
    </div>
  );
  return (
    <>
      {topH > 0 && <div aria-hidden style={{ ...band, top: 0, height: topH }}><span className="label-caps" style={{ position: 'absolute', left: 8, top: 8, fontSize: 10, color: 'var(--ink-3)' }}>Sleep, protected</span></div>}
      {botTop < GRID_H && <div aria-hidden style={{ ...band, top: botTop, height: GRID_H - botTop }}><span className="label-caps" style={{ position: 'absolute', left: 8, top: 8, fontSize: 10, color: 'var(--ink-3)' }}>Sleep, protected</span></div>}
      {handle('wake', topH, fmtTime(wake))}
      {handle('sleep', Math.min(botTop, GRID_H), fmtTime(sleep % 1440))}
    </>
  );
}

// "Sleep" button: any wake and bedtime, including the ones the grid cannot show.
const times = (from, to) => Array.from({ length: (to - from) / 30 + 1 }, (_, i) => from + i * 30);
const label = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}${m >= 1440 ? ' (next day)' : ''}`;

export function SleepSettings({ wake, sleep, onSave, error }) {
  const [open, setOpen] = useState(false);
  const [w, setW] = useState(wake);
  const [s, setS] = useState(sleep);
  const ref = useRef(null);
  useEffect(() => { setW(wake); setS(sleep); }, [wake, sleep]);
  useEffect(() => {
    if (!open) return undefined;
    const away = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const hours = (s - w) / 60;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn" onClick={() => setOpen(o => !o)} aria-expanded={open} title="When you wake and when you go to bed">Sleep</button>
      {open && (
        <div role="dialog" aria-label="Sleep window" className="bezel" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 45, width: 250, animation: 'popIn .35s var(--spring) both', transformOrigin: 'top right' }}>
          <div className="core" style={{ padding: 14 }}>
            <p className="label-caps" style={{ margin: '0 0 10px' }}>Your day</p>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)' }}>I wake at
              <select value={w} onChange={e => setW(Number(e.target.value))} style={sel}>{times(0, 12 * 60).map(m => <option key={m} value={m}>{label(m)}</option>)}</select>
            </label>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', marginTop: 10 }}>I go to bed at
              <select value={s} onChange={e => setS(Number(e.target.value))} style={sel}>{times(6 * 60, 28 * 60).map(m => <option key={m} value={m}>{label(m)}</option>)}</select>
            </label>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: s - w < 360 ? '#A5543F' : 'var(--ink-3)', lineHeight: 1.45 }}>
              {s - w < 360 ? 'A waking day needs at least 6 hours.' : `${Math.round(hours * 10) / 10} waking hours. Sleep hours are shaded and protected; you can still drag work into them.`}
            </p>
            {error && <p role="alert" style={{ margin: '6px 0 0', fontSize: 12, color: '#A5543F' }}>{error}</p>}
            <button className="btn btn--primary" disabled={s - w < 360} style={{ marginTop: 10, width: '100%' }} onClick={() => { onSave(w, s); setOpen(false); }}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
const sel = { display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 10, border: 0, fontFamily: 'inherit', fontSize: 13, background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)', color: 'var(--ink)' };

// The fold at the edge of the waking day: a quiet bar with an arrow. Closed, the sleep hours stay out of sight; open, they
// are part of the grid (so work can be dragged into them) and the arrow turns around.
export function SleepFold({ side, open, onToggle, label, count, hidden }) {
  if (hidden) return null;
  const up = side === 'top';
  return (
    <button onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} sleep hours, ${label}`} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', height: 26, border: 0, cursor: 'pointer', fontFamily: 'var(--display)',
      fontSize: 12, color: 'var(--ink-3)', background: 'rgba(106,120,77,.07)', borderBottom: up ? '1px solid var(--line-soft)' : 0, borderTop: up ? 0 : '1px solid var(--line-soft)',
    }}>
      <span style={{ display: 'inline-block', transform: `rotate(${(up ? !open : open) ? 180 : 0}deg)`, transition: 'transform .3s var(--ease)' }}>▾</span>
      {open ? 'Hide' : 'Show'} sleep hours ({label}){!open && count > 0 && <span style={{ color: '#8C4A33' }}>{count} block{count === 1 ? '' : 's'} there</span>}
    </button>
  );
}
