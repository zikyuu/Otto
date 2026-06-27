import panickedImg from '../assets/mascots/panicked.png';

export default function Recovery({ onExit }) {
  return (
    <div style={{ animation: 'fadeIn .45s ease' }}>
      <div style={{
        background: 'linear-gradient(150deg,#F3EBDC,#FBF1EC)',
        padding: '38px 44px 30px',
        display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap',
      }}>
        <img
          src={panickedImg} alt="panicked otter"
          style={{ width:138, height:'auto', flex:'0 0 auto', animation:'floatM 4s ease-in-out infinite', filter:'drop-shadow(0 10px 14px rgba(110,84,54,.22))' }}
        />
        <div style={{ minWidth: 280, flex: 1 }}>
          <div style={{ fontWeight:800, fontSize:12, letterSpacing:'1.5px', color:'#D8923A', textTransform:'uppercase' }}>
            A gentle reset
          </div>
          <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:30, color:'#4A3526', lineHeight:1.08, margin:'7px 0 8px' }}>
            Rough week — that's completely normal.
          </div>
          <div style={{ fontSize:16, color:'#8C7A64', lineHeight:1.5 }}>
            Nothing is "overdue." Let's find the best path from where you are right now. Here's what I'd do next.
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 44px 40px' }}>
        {/* Start here card */}
        <div style={{
          background: '#fff', borderRadius: 22, padding: '22px 24px',
          boxShadow: '0 18px 40px -24px rgba(150,108,64,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 18, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 240 }}>
            <div style={{ fontWeight:800, fontSize:12, letterSpacing:'1.5px', color:'#A8703E' }}>START HERE — JUST THIS</div>
            <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:23, color:'#4A3526', margin:'7px 0 4px' }}>
              Add embeddings + vector search
            </div>
            <div style={{ color:'#8C7A64', fontWeight:600, fontSize:14 }}>One clean win · 45 min · moves your top goal</div>
          </div>
          <div style={{
            background: 'linear-gradient(135deg,#C0894F,#A8703E)', color:'#fff',
            fontFamily:"'Quicksand'", fontWeight:700, fontSize:15,
            padding:'14px 24px', borderRadius:15, cursor:'pointer', whiteSpace:'nowrap',
          }}>Start</div>
        </div>

        {/* Downscope card */}
        <div style={{
          marginTop: 16,
          background: '#E2F2EA', border: '1px solid #C9E6D5', borderRadius: 20, padding: '20px 22px',
        }}>
          <div style={{ fontWeight:800, fontSize:12, letterSpacing:'1px', color:'#4FA77D' }}>SHRINK IT, DON'T SKIP IT</div>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:10, flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:220 }}>
              <div style={{ fontSize:14, color:'#5C7A6A' }}>
                <span style={{ textDecoration:'line-through', opacity:.7 }}>Full 1-hr LeetCode set</span>
              </div>
              <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:20, color:'#4A3526', marginTop:3 }}>
                → Just 2 problems · 15 min
              </div>
            </div>
            <div style={{
              background:'#fff', color:'#4FA77D', fontFamily:"'Quicksand'", fontWeight:700, fontSize:14,
              padding:'12px 20px', borderRadius:13, border:'1.5px solid #BFE3CF', cursor:'pointer',
            }}>Swap it in</div>
          </div>
        </div>

        <div style={{ textAlign:'center', marginTop:24 }}>
          <span onClick={onExit} style={{ cursor:'pointer', fontWeight:700, fontSize:14, color:'#8C7A64', borderBottom:'2px solid #E1D5C0', paddingBottom:2 }}>
            I'm okay now — back to my plan
          </span>
        </div>
      </div>
    </div>
  );
}
