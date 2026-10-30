import Mascot from '../components/Mascot.jsx';
import { IconArrow } from '../views/calendar/Icons.jsx';

const hours = m => `${Math.round((m / 60) * 10) / 10}`.replace(/\.0$/, '');

// check: what the engine measured (planned work at your learned pace vs the free time you can honestly plan into)
export default function Feasibility({ check, onChoose, onClose }) {
  return (
    <Overlay>
      <div className="bezel bezel--float" style={{ width: 'min(480px,92%)', animation: 'sheetUp .7s var(--ease) both' }}>
        <div className="core" style={{ padding: '30px 32px 28px' }}>
          <Mascot art="otter-thinking" size={150} zoom={2.5} float style={{ margin: '-8px auto 0' }} />
          <h2 style={{ margin: '4px 0 10px', fontSize: 25, fontWeight: 600, letterSpacing: '-.035em', lineHeight: 1.15 }}>This week is overcommitted at your current pace.</h2>
          <p style={{ margin: 0, fontSize: 14.5, color: 'var(--ink-3)', lineHeight: 1.6 }}>
            {check
              ? <>At your own pace the work still ahead needs about {hours(check.need_min)} focused hours, and about {hours(check.capacity_min)} are honestly there. That is okay. Let us protect what matters before anything slips.</>
              : 'Let us protect what matters before anything slips.'}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button className="btn btn--primary" onClick={onChoose} disabled={!check?.trade} style={{ height: 44, padding: '0 8px 0 22px', fontSize: 14 }}>Help me choose<span className="btn__icon" style={{ width: 28, height: 28, marginRight: 0 }}><IconArrow size={14} /></span></button>
            <button className="btn btn--ghost" onClick={onClose} style={{ height: 44 }}>Not now</button>
          </div>
          {check && !check.trade && <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--ink-3)' }}>There is no single clash to choose between: trim anything in the week view.</p>}
        </div>
      </div>
    </Overlay>
  );
}

export function Overlay({ children }) {
  return (
    <div className="overlay" style={{ position:'absolute', inset:0, zIndex:50, background:'rgba(32,40,8,.38)', backdropFilter:'blur(6px)', display:'flex', alignItems:'center', justifyContent:'center', padding:30, animation:'fadeIn .25s var(--ease)' }}>
      {children}
    </div>
  );
}
