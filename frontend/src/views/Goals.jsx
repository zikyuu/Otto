import { GOALS } from '../data/fixtures.js';

function tagStyle(tag) {
  return tag === 'life'
    ? { background:'#E2F2EA', color:'#4FA77D' }
    : { background:'#F2E6D4', color:'#A8703E' };
}

export function GoalsList({ checks, onToggleSub, onOpenGoal }) {
  return (
    <div style={{ padding:'32px 44px 40px', animation:'fadeIn .45s ease' }}>
      <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:30, color:'#4A3526' }}>Your goals</div>
      <div style={{ fontSize:14, color:'#8C7A64', marginTop:3 }}>Long-term goals grow as a bar. Tap one to see the small steps.</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(330px,1fr))', gap:16, marginTop:22 }}>
        {GOALS.map(g => (
          <div key={g.id} onClick={() => onOpenGoal(g.id)} style={{
            cursor:'pointer', background:'#fff', border:'1px solid #ECE3D4',
            borderRadius:22, padding:22, boxShadow:'0 12px 30px -24px rgba(74,54,38,.5)',
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
              <span style={{ fontWeight:800, fontSize:10, letterSpacing:'.5px', padding:'4px 9px', borderRadius:7, ...tagStyle(g.tag) }}>
                {g.cat}
              </span>
              <span style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:20, color:g.accent }}>{g.label}</span>
            </div>
            <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:19, color:'#4A3526', margin:'13px 0 14px', lineHeight:1.15 }}>{g.title}</div>
            <div style={{ height:10, borderRadius:7, background:'#F1E8D7', overflow:'hidden' }}>
              <div style={{ width:`${g.pct}%`, height:'100%', background:g.accent, borderRadius:7 }} />
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:11 }}>
              <span style={{ fontSize:12.5, color:'#AD9B84' }}>{g.subnote}</span>
              <span style={{ fontSize:13, fontWeight:700, color:'#A8703E' }}>Open →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GoalDetail({ goalId, checks, onToggleSub, onClose }) {
  const g = GOALS.find(x => x.id === goalId) || GOALS[0];
  return (
    <div style={{ padding:'28px 44px 40px', animation:'fadeIn .4s ease' }}>
      <div onClick={onClose} style={{ cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7, fontWeight:700, fontSize:14, color:'#8C7A64', marginBottom:18 }}>
        ← All goals
      </div>
      <span style={{ fontWeight:800, fontSize:11, letterSpacing:'.5px', padding:'4px 10px', borderRadius:7, ...tagStyle(g.tag) }}>
        {g.cat}
      </span>
      <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:32, color:'#4A3526', margin:'11px 0 16px', lineHeight:1.08 }}>{g.title}</div>

      {/* Progress */}
      <div style={{ background:'#fff', border:'1px solid #ECE3D4', borderRadius:20, padding:'20px 22px', boxShadow:'0 12px 30px -24px rgba(74,54,38,.5)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <span style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:15, color:'#4A3526' }}>Progress</span>
          <span style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:18, color:g.accent }}>{g.label}</span>
        </div>
        <div style={{ height:12, borderRadius:8, background:'#F1E8D7', overflow:'hidden' }}>
          <div style={{ width:`${g.pct}%`, height:'100%', background:g.accent, borderRadius:8 }} />
        </div>
      </div>

      {/* Direction check */}
      <div style={{ marginTop:16, background:'#FBEFD9', border:'1px solid #F3DCB0', borderRadius:20, padding:'18px 20px' }}>
        <div style={{ display:'flex', gap:13 }}>
          <div style={{ width:34,height:34,borderRadius:'50%',background:'#F6E1B8',color:'#D8923A',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,flex:'0 0 auto' }}>↗</div>
          <div>
            <div style={{ fontWeight:800, fontSize:11, letterSpacing:'1px', color:'#D8923A' }}>DIRECTION CHECK</div>
            <div style={{ fontSize:15, color:'#7A5A22', lineHeight:1.5, marginTop:4 }}>
              {g.direction}{' '}
              <span style={{ color:'#D8923A', fontWeight:800, textDecoration:'underline', cursor:'pointer' }}>see evidence</span>
            </div>
          </div>
        </div>
      </div>

      {/* Steps + Evidence */}
      <div style={{ display:'grid', gridTemplateColumns:'1.3fr 1fr', gap:16, marginTop:16, alignItems:'start' }}>
        <div style={{ background:'#fff', border:'1px solid #ECE3D4', borderRadius:20, padding:'20px 22px' }}>
          <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:16, color:'#4A3526', marginBottom:14 }}>The small steps</div>
          <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
            {g.subs.map((sub, i) => {
              const key = `${g.id}_${i}`;
              const ck = checks[key];
              return (
                <div key={key} onClick={() => onToggleSub(key)} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
                  {ck
                    ? <div style={{ width:23,height:23,borderRadius:7,background:'#6BBF95',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,flex:'0 0 auto' }}>✓</div>
                    : <div style={{ width:23,height:23,borderRadius:7,border:'2px solid #D9CAB2',flex:'0 0 auto' }} />
                  }
                  <span style={{ fontSize:15, fontWeight:600, color: ck?'#B6A48C':'#4A3526', textDecoration: ck?'line-through':'none' }}>{sub.t}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background:'#F5EEE1', border:'1px solid #E9DCC8', borderRadius:20, padding:'20px 22px' }}>
          <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:15, color:'#4A3526' }}>What this goal really needs</div>
          <div style={{ fontWeight:700, fontSize:11, color:'#AD9B84', marginTop:3 }}>{g.date} · from live web</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:13 }}>
            {g.sources.map((src, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:9, background:'#fff', borderRadius:11, padding:'10px 12px', cursor:'pointer' }}>
                <div style={{ width:8,height:8,borderRadius:'50%',background:'#A8703E',flex:'0 0 auto' }} />
                <span style={{ fontSize:13, fontWeight:600, color:'#8A5A2E', flex:1 }}>{src.name}</span>
                <span style={{ color:'#B6A48C', fontSize:12 }}>↗</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
