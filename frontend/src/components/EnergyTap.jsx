import { useEffect, useRef, useState } from 'react';
import { sendEnergy } from '../api.js';
import { dayNum } from '../views/calendar/calendarUtils.js';
import { ENERGY_LEVELS, minutesSinceMeeting, minutesSinceHard } from '../views/calendar/energyUtils.js';
import { IconPlus, IconCheck } from '../views/calendar/Icons.jsx';

// The optional "how is your energy?" tap. Never prompts: it only appears when the user opens it.
// A tap just after a meeting teaches Otto how much recovery time meetings cost this person.
//   events   calendar events, to find a meeting that just ended        style   positioning from the parent
export default function EnergyTap({ events = [], style, compact = false, placement = 'above' }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState('idle');             // idle | sending | thanks | failed
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  async function tap(level) {
    const now = new Date();
    setState('sending');
    try {
      const nm = now.getHours() * 60 + now.getMinutes();
      await sendEnergy(level, minutesSinceMeeting(events, dayNum(now), nm), minutesSinceHard(events, dayNum(now), nm));
      setState('thanks');
      setTimeout(() => { setOpen(false); setState('idle'); }, 1100);
    } catch { setState('failed'); }
  }

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <button className={compact ? 'btn btn--icon' : 'btn'} onClick={() => { setOpen(o => !o); setState('idle'); }} aria-expanded={open} aria-label="Log your energy" title="How is your energy right now?">
        <IconPlus size={13} />{!compact && 'Energy'}
      </button>
      {open && (
        <div role="menu" aria-label="Energy level" className="bezel" style={{ position: 'absolute', right: 0, ...(placement === 'below' ? { top: 'calc(100% + 8px)', transformOrigin: 'top right' } : { bottom: 'calc(100% + 10px)', transformOrigin: 'bottom right' }), zIndex: 60, width: 190, animation: 'popIn .35s var(--spring) both' }}>
          <div className="core" style={{ padding: 8 }}>
            <p className="label-caps" style={{ margin: '4px 8px 6px' }}>Right now</p>
            {state === 'thanks' ? (
              <p style={{ margin: '8px', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-ink)' }}><IconCheck size={13} />Noted. Thank you.</p>
            ) : ENERGY_LEVELS.map(l => (
              <button key={l.level} role="menuitem" disabled={state === 'sending'} onClick={() => tap(l.level)} style={{
                display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '8px 10px', border: 0, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, color: 'inherit', background: 'transparent', textAlign: 'left',
              }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ display: 'inline-flex', gap: 2 }}>{[1, 2, 3, 4, 5].map(n => <i key={n} style={{ width: 5, height: 12, borderRadius: 2, background: n <= l.level ? 'var(--accent)' : 'var(--line)' }} />)}</span>{l.label}
              </button>
            ))}
            {state === 'failed' && <p role="alert" style={{ margin: '4px 8px', fontSize: 12, color: '#A5543F' }}>Could not save that. Is the backend running?</p>}
          </div>
        </div>
      )}
    </div>
  );
}
