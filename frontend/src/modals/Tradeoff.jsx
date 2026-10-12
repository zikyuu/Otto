import { Overlay } from './Feasibility.jsx';

export default function Tradeoff({ pick, onPick, onClose }) {
  const msg = pick === 'onsite'
    ? "Locked on the onsite. I'll trim the applications to quick one-click applies."
    : "Locked on the applications. I'll compress onsite prep into one focused drill.";

  return (
    <Overlay>
      <div className="bezel bezel--float" style={{ width:'min(580px,94%)', animation:'sheetUp .7s var(--ease) both' }}><div className="core" style={{ padding:'30px 32px' }}>
        <div style={{ fontWeight:600, fontSize:25, color:'#26281F', lineHeight:1.15, letterSpacing:'-.035em' }}>
          You can't fully do both this week.
        </div>
        <div style={{ fontSize:15, color:'#7F7E69', marginTop:7 }}>
          Pick the one that matters more — I'll gently downscope the other so nothing is lost.
        </div>

        <div style={{ display:'flex', gap:14, marginTop:22, flexWrap:'wrap' }}>
          <OptionCard
            label="THURSDAY"
            title="Prep for the onsite"
            sub="An interview you already have."
            chosen={pick === 'onsite'}
            onPick={() => onPick('onsite')}
          />
          <OptionCard
            label="CLOSES FRIDAY"
            title="Apply to 3 roles"
            sub="Windows won't reopen."
            chosen={pick === 'apply'}
            onPick={() => onPick('apply')}
            labelColor="#B98532"
          />
        </div>

        {pick && (
          <div style={{ marginTop:16, background:'#E0EBD3', borderRadius:14, padding:'13px 15px', fontSize:14, color:'#3F6B49', fontWeight:700 }}>
            {msg}
          </div>
        )}

        <div style={{ textAlign:'center', marginTop:20 }}>
          <button className="btn btn--primary" onClick={onClose} style={{ height: 40, padding: '0 22px' }}>Done</button>
        </div>
      </div></div>
    </Overlay>
  );
}

function OptionCard({ label, title, sub, chosen, onPick, labelColor = '#4C7656' }) {
  return (
    <button onClick={onPick} aria-pressed={chosen} style={{
      flex:'1', minWidth:200, cursor:'pointer', borderRadius:22, padding:20, textAlign:'left', border:0, color:'inherit',
      background: chosen ? '#E4ECD6' : 'var(--surface-2)',
      boxShadow: `0 0 0 ${chosen ? 2 : 1}px ${chosen ? '#4C7656' : '#E3DBC2'}`,
      transition: 'box-shadow .5s var(--ease), background .5s var(--ease), transform .5s var(--ease)', transform: chosen ? 'translateY(-2px)' : 'none',
    }}>
      <div style={{ fontWeight:800, fontSize:11, letterSpacing:'.5px', color:labelColor }}>{label}</div>
      <div style={{ fontWeight:600, fontSize:18, letterSpacing:'-.02em', color:'#26281F', margin:'6px 0 4px' }}>{title}</div>
      <div style={{ fontSize:13, color:'#7F7E69' }}>{sub}</div>
      {chosen && <div style={{ marginTop:12, fontWeight:600, fontSize:13, color:'#3F6B49' }}>Chosen</div>}
    </button>
  );
}
