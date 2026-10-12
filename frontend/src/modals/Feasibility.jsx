import Mascot from '../components/Mascot.jsx';
import { IconArrow } from '../views/calendar/Icons.jsx';

export default function Feasibility({ onChoose, onClose }) {
  return (
    <Overlay>
      <div className="bezel bezel--float" style={{ width: 'min(480px,92%)', animation: 'sheetUp .7s var(--ease) both' }}>
        <div className="core" style={{ padding: '30px 32px 28px' }}>
          <Mascot art="otter-thinking" size={150} zoom={2.5} float style={{ margin: '-8px auto 0' }} />
          <h2 style={{ margin: '4px 0 10px', fontSize: 25, fontWeight: 600, letterSpacing: '-.035em', lineHeight: 1.15 }}>This week is overcommitted at your current pace.</h2>
          <p style={{ margin: 0, fontSize: 14.5, color: 'var(--ink-3)', lineHeight: 1.6 }}>
            You have planned about 26 focused hours; your honest recent pace is about 17. That is okay. Let us protect what matters before anything slips.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button className="btn btn--primary" onClick={onChoose} style={{ height: 44, padding: '0 8px 0 22px', fontSize: 14 }}>Help me choose<span className="btn__icon" style={{ width: 28, height: 28, marginRight: 0 }}><IconArrow size={14} /></span></button>
            <button className="btn btn--ghost" onClick={onClose} style={{ height: 44 }}>Not now</button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

export function Overlay({ children }) {
  return (
    <div style={{ position:'absolute', inset:0, zIndex:50, background:'rgba(46,58,38,.38)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:30, animation:'fadeIn .25s var(--ease)' }}>
      {children}
    </div>
  );
}
