import { Overlay } from './Feasibility.jsx';

export default function Tradeoff({ pick, onPick, onClose, tradeoff }) {
  const options = tradeoff?.options ?? [];
  const chosen = options.find(o => o.goal_id === pick);

  return (
    <Overlay>
      <div style={{ width:'min(560px,94%)', background:'#fff', borderRadius:26, padding:30, boxShadow:'0 40px 80px -30px rgba(74,54,38,.6)', animation:'sheetUp .4s ease' }}>
        <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:25, color:'#4A3526', lineHeight:1.15 }}>
          You can't fully do both this week.
        </div>
        <div style={{ fontSize:15, color:'#8C7A64', marginTop:7 }}>
          Pick the one that matters more — I'll gently downscope the other so nothing is lost.
        </div>

        <div style={{ display:'flex', gap:14, marginTop:22, flexWrap:'wrap' }}>
          {options.map((opt, i) => (
            <OptionCard
              key={opt.goal_id}
              label={i === 0 ? 'HIGHEST PRIORITY' : 'ALSO NEEDED'}
              labelColor={i === 0 ? '#A8703E' : '#D8923A'}
              title={opt.label}
              sub={`~${Math.round(opt.minutes / 60)}h of work remaining`}
              chosen={pick === opt.goal_id}
              onPick={() => onPick(opt.goal_id)}
            />
          ))}
        </div>

        {pick && (
          <div style={{ marginTop:16, background:'#E2F2EA', borderRadius:14, padding:'13px 15px', fontSize:14, color:'#4FA77D', fontWeight:700 }}>
            Locking in: {chosen?.label}. The rest gets compressed — nothing is dropped.
          </div>
        )}

        <div style={{ textAlign:'center', marginTop:18 }}>
          <span onClick={onClose} style={{ cursor:'pointer', color:'#8C7A64', fontFamily:"'Quicksand'", fontWeight:700, fontSize:14 }}>Done</span>
        </div>
      </div>
    </Overlay>
  );
}

function OptionCard({ label, title, sub, chosen, onPick, labelColor = '#A8703E' }) {
  return (
    <div onClick={onPick} style={{
      flex:'1', minWidth:200, cursor:'pointer', borderRadius:18, padding:18,
      background: chosen ? '#F5EEE1' : '#FBF8F4',
      border: `2px solid ${chosen ? '#A8703E' : '#ECE3D4'}`,
    }}>
      <div style={{ fontWeight:800, fontSize:11, letterSpacing:'.5px', color:labelColor }}>{label}</div>
      <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:18, color:'#4A3526', margin:'6px 0 4px' }}>{title}</div>
      <div style={{ fontSize:13, color:'#8C7A64' }}>{sub}</div>
      {chosen && <div style={{ marginTop:11, fontWeight:800, fontSize:13, color:'#4FA77D' }}>✓ Chosen</div>}
    </div>
  );
}
