import { BAR_DATA } from '../data/fixtures.js';

export default function Stats() {
  return (
    <div style={{ padding:'32px 44px 40px', animation:'fadeIn .45s ease' }}>
      <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:30, color:'#4A3526' }}>Your week</div>
      <div style={{ fontSize:14, color:'#8C7A64', marginTop:3 }}>Measured by showing up — not by being perfect.</div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginTop:22 }}>
        <StatCard>
          <Kicker>MOMENTUM STREAK</Kicker>
          <BigNum>12 <span style={{ fontSize:15, color:'#6BBF95' }}>days</span></BigNum>
          <Sub>You showed up 12 days running 🦦</Sub>
        </StatCard>
        <div style={{ background:'#E2F2EA', border:'1px solid #C9E6D5', borderRadius:20, padding:20 }}>
          <Kicker color="#4FA77D">VS YOUR PLAN</Kicker>
          <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:30, color:'#4A3526', marginTop:6 }}>Slightly ahead</div>
          <Sub color="#5C7A6A">+8% on coding · a touch behind on fitness</Sub>
        </div>
        <StatCard>
          <Kicker>FOCUS HOURS</Kicker>
          <BigNum>17<span style={{ fontSize:15, color:'#8C7A64' }}>h</span></BigNum>
          <Sub>across 6 of 7 days</Sub>
        </StatCard>
      </div>

      {/* Bar chart */}
      <div style={{ background:'#fff', border:'1px solid #ECE3D4', borderRadius:22, padding:24, marginTop:16, boxShadow:'0 12px 30px -26px rgba(74,54,38,.5)' }}>
        <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:18, color:'#4A3526' }}>How locked-in you were · last 7 days</div>
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:14, height:170, marginTop:22 }}>
          {BAR_DATA.map(({ d, h, today }) => (
            <div key={d+h} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:9, height:'100%', justifyContent:'flex-end' }}>
              <div style={{ width:'100%', maxWidth:42, height:h, borderRadius:'11px 11px 6px 6px', background: today?'#A8703E':'#DCC8A8' }} />
              <span style={{ fontWeight:700, fontSize:12, color: today?'#A8703E':'#AD9B84' }}>{d}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recap */}
      <div style={{ position:'relative', background:'linear-gradient(135deg,#F5EEE1,#FBF1EC)', border:'1px solid #EADFCC', borderRadius:22, padding:'22px 24px', marginTop:16, overflow:'hidden' }}>
        <img src="/mascots/eating.png" alt="happy otter" style={{ position:'absolute', right:14, bottom:-10, width:118, height:'auto', opacity:.96, filter:'drop-shadow(0 8px 12px rgba(110,84,54,.18))' }} />
        <div style={{ fontWeight:800, fontSize:11, letterSpacing:'1px', color:'#A8703E' }}>REALISTIC RECAP</div>
        <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:20, color:'#4A3526', margin:'7px 0 6px' }}>A genuinely good week.</div>
        <div style={{ position:'relative', fontSize:15, color:'#8C7A64', lineHeight:1.55, maxWidth:'74%' }}>
          Given a full work schedule, you shipped 2 RAG milestones and kept a 12-day streak. Fitness slipped a little — and that's fine, it's protected for next week. No catching-up debt. Just forward.
        </div>
      </div>
    </div>
  );
}

function StatCard({ children }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #ECE3D4', borderRadius:20, padding:20, boxShadow:'0 12px 30px -26px rgba(74,54,38,.5)' }}>
      {children}
    </div>
  );
}

function Kicker({ children, color = '#AD9B84' }) {
  return <div style={{ fontWeight:800, fontSize:11, letterSpacing:'1px', color }}>{children}</div>;
}

function BigNum({ children }) {
  return <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:38, color:'#4A3526', marginTop:6 }}>{children}</div>;
}

function Sub({ children, color = '#8C7A64' }) {
  return <div style={{ fontSize:12.5, color, marginTop:3 }}>{children}</div>;
}
