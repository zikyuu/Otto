import eatingImg from '../assets/mascots/eating.png';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function Stats({ tasks = [], checks = {}, blocks = [], feasible, goalTitle }) {
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => checks[t.id]).length;
  const doneHours = (tasks
    .filter(t => checks[t.id])
    .reduce((sum, t) => sum + (t.full_minutes ?? 0), 0) / 60).toFixed(1);
  const pct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Bar chart: scheduled minutes per day from blocks
  const minsPerDay = Array(7).fill(0);
  blocks.forEach(b => { minsPerDay[b.day] += (b.end_min - b.start_min); });
  const maxMins = Math.max(...minsPerDay, 1);
  const todayIdx = (new Date().getDay() + 6) % 7; // JS Sun=0 → Mon=0
  const barData = DAY_LABELS.map((d, i) => ({
    d,
    h: Math.round((minsPerDay[i] / maxMins) * 130),
    today: i === todayIdx,
    label: minsPerDay[i] ? `${(minsPerDay[i] / 60).toFixed(1)}h` : '',
  }));

  const statusLabel = feasible === false ? 'Week is tight' : 'On track';
  const statusSub = `${doneTasks} done · ${doneHours}h logged`;
  const recapHead = doneTasks === 0
    ? 'Ready to start.'
    : pct >= 70 ? 'A genuinely good week.'
    : pct >= 30 ? 'Making real progress.'
    : 'The week is still young.';
  const recapBody = totalTasks
    ? `${doneTasks} of ${totalTasks} tasks done${goalTitle ? ` toward "${goalTitle}"` : ''}, logging ${doneHours}h so far. ${feasible === false ? "The week is full — protect what matters most." : "You're on pace. Keep the rhythm."}`
    : 'Complete your onboarding to see real stats here.';

  return (
    <div style={{ padding:'32px 44px 40px', animation:'fadeIn .45s ease' }}>
      <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:30, color:'#4A3526' }}>Your week</div>
      <div style={{ fontSize:14, color:'#8C7A64', marginTop:3 }}>Measured by showing up — not by being perfect.</div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginTop:22 }}>
        <StatCard>
          <Kicker>TASKS DONE</Kicker>
          <BigNum>{doneTasks} <span style={{ fontSize:15, color:'#6BBF95' }}>/ {totalTasks}</span></BigNum>
          <Sub>{pct}% of your plan complete</Sub>
        </StatCard>
        <div style={{ background:'#E2F2EA', border:'1px solid #C9E6D5', borderRadius:20, padding:20 }}>
          <Kicker color="#4FA77D">VS YOUR PLAN</Kicker>
          <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:30, color:'#4A3526', marginTop:6 }}>{statusLabel}</div>
          <Sub color="#5C7A6A">{statusSub}</Sub>
        </div>
        <StatCard>
          <Kicker>FOCUS HOURS</Kicker>
          <BigNum>{doneHours}<span style={{ fontSize:15, color:'#8C7A64' }}>h</span></BigNum>
          <Sub>across tasks completed</Sub>
        </StatCard>
      </div>

      {/* Bar chart */}
      <div style={{ background:'#fff', border:'1px solid #ECE3D4', borderRadius:22, padding:24, marginTop:16, boxShadow:'0 12px 30px -26px rgba(74,54,38,.5)' }}>
        <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:18, color:'#4A3526' }}>Planned hours · this week</div>
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:14, height:170, marginTop:22 }}>
          {barData.map(({ d, h, today, label }, i) => (
            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:9, height:'100%', justifyContent:'flex-end' }}>
              {label && <span style={{ fontSize:10, fontWeight:700, color: today?'#A8703E':'#AD9B84' }}>{label}</span>}
              <div style={{ width:'100%', maxWidth:42, height: h || 4, borderRadius:'11px 11px 6px 6px', background: today?'#A8703E': h > 0 ?'#DCC8A8':'#F1E8D7' }} />
              <span style={{ fontWeight:700, fontSize:12, color: today?'#A8703E':'#AD9B84' }}>{d}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recap */}
      <div style={{ position:'relative', background:'linear-gradient(135deg,#F5EEE1,#FBF1EC)', border:'1px solid #EADFCC', borderRadius:22, padding:'22px 24px', marginTop:16, overflow:'hidden' }}>
        <img src={eatingImg} alt="happy otter" style={{ position:'absolute', right:14, bottom:-10, width:118, height:'auto', opacity:.96, filter:'drop-shadow(0 8px 12px rgba(110,84,54,.18))' }} />
        <div style={{ fontWeight:800, fontSize:11, letterSpacing:'1px', color:'#A8703E' }}>REALISTIC RECAP</div>
        <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:20, color:'#4A3526', margin:'7px 0 6px' }}>{recapHead}</div>
        <div style={{ position:'relative', fontSize:15, color:'#8C7A64', lineHeight:1.55, maxWidth:'74%' }}>
          {recapBody}
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
