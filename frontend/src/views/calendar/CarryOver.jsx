import { IconCheck, IconArrow, IconClose } from './Icons.jsx';
import { fmtDur } from './calendarUtils.js';
import { summary, carryMinutes } from './checklist.js';

// "2 items unfinished, add to a new slot?" One block at a time, once. Choosing records the answer on the block
// (`carry_over`), so it is never asked again.
export default function CarryOver({ ev, onChoose }) {
  return (
    <div role="group" aria-label="Unfinished checklist" className="bezel" style={{ marginBottom: 12 }}>
      <div className="core" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', flexWrap: 'wrap', background: '#F3E6C8' }}>
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: '#F3E6C8', color: '#8A6A2F', display: 'grid', placeItems: 'center', flexShrink: 0 }}><IconCheck size={14} /></span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink)' }}><strong style={{ fontWeight: 600 }}>{summary(ev)}</strong> on “{ev.title}”. Add them to a new slot?</p>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>About {fmtDur(carryMinutes(ev))} this week, or leave them in the Meatball Grinder.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--primary" style={{ padding: '0 8px 0 16px' }} onClick={() => onChoose('fit')}>New slot<span className="btn__icon" style={{ width: 22, height: 22, marginRight: 0 }}><IconArrow size={11} /></span></button>
          <button className="btn" onClick={() => onChoose('park')}>Meatball Grinder</button>
          <button className="btn btn--ghost btn--icon" aria-label="Leave them" onClick={() => onChoose('dismiss')}><IconClose size={12} /></button>
        </div>
      </div>
    </div>
  );
}
