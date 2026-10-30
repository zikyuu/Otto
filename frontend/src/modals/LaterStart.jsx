import Mascot from '../components/Mascot.jsx';
import { Overlay } from './Feasibility.jsx';
import { IconArrow } from '../views/calendar/Icons.jsx';
import { fmtTime } from '../views/calendar/calendarUtils.js';

// Three late starts in a week: the planned start is probably wrong, so offer the start the user really keeps.
//   ask { suggested_start_min, current_start_min, late_starts_this_week }    onMove()  onKeep()  onLater()
export default function LaterStart({ ask, busy, onMove, onKeep, onLater }) {
  return (
    <Overlay>
      <div className="bezel bezel--float" style={{ width: 'min(480px,94%)', animation: 'sheetUp .7s var(--ease) both' }}>
        <div className="core" style={{ padding: '26px 30px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Mascot art="otter-sleeping" size={76} zoom={2.5} float />
            <div>
              <p className="pill-tag" style={{ margin: 0 }}>{ask.late_starts_this_week} late starts this week</p>
              <h2 style={{ margin: '8px 0 0', fontSize: 21, fontWeight: 600, letterSpacing: '-.03em', lineHeight: 1.2 }}>Start the day at {fmtTime(ask.suggested_start_min)} instead?</h2>
            </div>
          </div>
          <p style={{ margin: '14px 0 0', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
            Your day is planned to start at {fmtTime(ask.current_start_min)}, but you have been getting going around {fmtTime(ask.suggested_start_min)}. Planning from the time you really start means fewer mornings that begin behind.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" disabled={busy} onClick={onMove} style={{ height: 44, padding: '0 8px 0 22px', fontSize: 14 }}>
              Move it to {fmtTime(ask.suggested_start_min)}<span className="btn__icon" style={{ width: 28, height: 28, marginRight: 0 }}><IconArrow size={14} /></span>
            </button>
            <button className="btn" onClick={onKeep} style={{ height: 44 }}>Keep {fmtTime(ask.current_start_min)}</button>
            <button className="btn btn--ghost" onClick={onLater} style={{ height: 44 }}>Not now</button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
