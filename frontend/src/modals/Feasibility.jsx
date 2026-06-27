export default function Feasibility({ onChoose, onClose }) {
  return (
    <Overlay>
      <div style={{ width:'min(460px,90%)', background:'#fff', borderRadius:26, padding:30, boxShadow:'0 40px 80px -30px rgba(74,54,38,.6)', animation:'sheetUp .4s ease' }}>
        <img src="/mascots/wise.png" alt="wise otter" style={{ width:104, height:'auto', margin:'-6px auto 0', display:'block', filter:'drop-shadow(0 8px 12px rgba(110,84,54,.2))' }} />
        <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:25, color:'#4A3526', margin:'16px 0 8px', lineHeight:1.15 }}>
          This week is overcommitted at your current pace.
        </div>
        <div style={{ fontSize:15, color:'#8C7A64', lineHeight:1.55 }}>
          You've planned ~26 focused hours; your honest recent pace is ~17. That's okay — let's protect what matters before anything slips.
        </div>
        <div style={{ display:'flex', gap:11, marginTop:22 }}>
          <div onClick={onChoose} style={{ flex:1, textAlign:'center', cursor:'pointer', background:'linear-gradient(135deg,#C0894F,#A8703E)', color:'#fff', fontFamily:"'Quicksand'", fontWeight:700, fontSize:15, padding:14, borderRadius:15 }}>
            Help me choose
          </div>
          <div onClick={onClose} style={{ cursor:'pointer', textAlign:'center', color:'#8C7A64', fontFamily:"'Quicksand'", fontWeight:700, fontSize:15, padding:'14px 20px', borderRadius:15, border:'1.5px solid #E9DECC' }}>
            Not now
          </div>
        </div>
      </div>
    </Overlay>
  );
}

export function Overlay({ children }) {
  return (
    <div style={{ position:'absolute', inset:0, zIndex:50, background:'rgba(74,54,38,.4)', backdropFilter:'blur(3px)', display:'flex', alignItems:'center', justifyContent:'center', padding:30, animation:'fadeIn .25s ease' }}>
      {children}
    </div>
  );
}
