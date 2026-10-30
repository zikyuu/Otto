import Mascot from '../components/Mascot.jsx';
import { Overlay } from './Feasibility.jsx';

// Otto will not decide this itself: something you marked low importance has a hard deadline it cannot meet, and the only room
// is time taken by something you marked important. One question per clash; the answer is kept.
//   decisions [{ low:{id,title,deadline_iso,importance}, high:{id,title,importance}, question }]    onAnswer(decision, 'low' | 'high')    onClose()
export default function ImportanceConflict({ decisions, onAnswer, onClose }) {
  const d = decisions[0];
  if (!d) return null;
  return (
    <Overlay>
      <div className="bezel bezel--float" style={{ width: 'min(520px,94%)', animation: 'sheetUp .7s var(--ease) both' }}>
        <div className="core" style={{ padding: '26px 30px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Mascot art="otter-panicked" size={76} zoom={2.5} float />
            <div>
              <p className="pill-tag" style={{ margin: 0 }}>Your call{decisions.length > 1 ? ` · ${decisions.length} to decide` : ''}</p>
              <h2 style={{ margin: '8px 0 0', fontSize: 21, fontWeight: 600, letterSpacing: '-.03em', lineHeight: 1.2 }}>Two things cannot both fit</h2>
            </div>
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{d.question}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
            <button className="btn btn--primary" onClick={() => onAnswer(d, 'low')} style={{ height: 'auto', padding: '10px 18px', justifyContent: 'flex-start', textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <span>{d.low.title} matters more</span>
              <span style={{ fontSize: 12, opacity: .8, fontWeight: 400 }}>It moves up to important, ahead of “{d.high.title}”.</span>
            </button>
            <button className="btn" onClick={() => onAnswer(d, 'high')} style={{ height: 'auto', padding: '10px 18px', justifyContent: 'flex-start', textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <span>{d.high.title} matters more</span>
              <span style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 400 }}>“{d.low.title}” may miss its deadline. Otto will not ask again about it.</span>
            </button>
            <button className="btn btn--ghost" onClick={onClose}>Decide later</button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
