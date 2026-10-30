import { Overlay } from './Feasibility.jsx';
import { fmtDur } from '../views/calendar/calendarUtils.js';

// "You can't fully do both." The two competing pieces of work come from the engine (week-check); the one not
// picked is shrunk to a lite version, never dropped.
//   trade   { a, b }: { ids, title, minutes, label }
//   pick    'a' | 'b' | null        onPick(side)        onConfirm()        onClose()
export default function Tradeoff({ trade, pick, onPick, onConfirm, onClose, busy }) {
  if (!trade) return null;
  const chosen = pick && trade[pick];
  const other = pick && trade[pick === 'a' ? 'b' : 'a'];
  const msg = chosen && `Locked on ${chosen.title}. I will shrink ${other.title} to about half (${fmtDur(Math.round(other.minutes / 2))}) so nothing is lost.`;

  return (
    <Overlay>
      <div className="bezel bezel--float" style={{ width: 'min(580px,94%)', animation: 'sheetUp .7s var(--ease) both' }}><div className="core" style={{ padding: '30px 32px' }}>
        <div style={{ fontWeight: 600, fontSize: 25, color: '#232B14', lineHeight: 1.15, letterSpacing: '-.035em' }}>You can't fully do both this week.</div>
        <div style={{ fontSize: 15, color: '#7C8068', marginTop: 7 }}>Pick the one that matters more. I will gently downscope the other so nothing is lost.</div>

        <div style={{ display: 'flex', gap: 14, marginTop: 22, flexWrap: 'wrap' }}>
          {['a', 'b'].map(side => (
            <OptionCard key={side} label={trade[side].label} title={trade[side].title} sub={fmtDur(trade[side].minutes) + ' planned'}
              chosen={pick === side} onPick={() => onPick(side)} labelColor={side === 'b' ? '#8A6A2F' : '#4E5C36'} />
          ))}
        </div>

        {pick && <div style={{ marginTop: 16, background: '#E4EAD3', borderRadius: 10, padding: '13px 15px', fontSize: 14, color: '#4E5C36', fontWeight: 700 }}>{msg}</div>}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
          <button className="btn btn--primary" disabled={!pick || busy} onClick={onConfirm} style={{ height: 40, padding: '0 22px' }}>{busy ? 'Working…' : 'Done'}</button>
          <button className="btn btn--ghost" onClick={onClose} style={{ height: 40 }}>Cancel</button>
        </div>
      </div></div>
    </Overlay>
  );
}

function OptionCard({ label, title, sub, chosen, onPick, labelColor = '#4E5C36' }) {
  return (
    <button onClick={onPick} aria-pressed={chosen} style={{
      flex: '1', minWidth: 200, cursor: 'pointer', borderRadius: 12, padding: 20, textAlign: 'left', border: 0, color: 'inherit',
      background: chosen ? '#E4EAD3' : 'var(--surface-2)', boxShadow: `0 0 0 ${chosen ? 2 : 1}px ${chosen ? '#4E5C36' : '#E2D5B8'}`,
      transition: 'box-shadow .5s var(--ease), background .5s var(--ease), transform .5s var(--ease)', transform: chosen ? 'translateY(-2px)' : 'none',
    }}>
      <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '.5px', color: labelColor }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 18, letterSpacing: '-.02em', color: '#232B14', margin: '6px 0 4px' }}>{title}</div>
      <div style={{ fontSize: 13, color: '#7C8068' }}>{sub}</div>
      {chosen && <div style={{ marginTop: 12, fontWeight: 600, fontSize: 13, color: '#4E5C36' }}>Chosen</div>}
    </button>
  );
}
