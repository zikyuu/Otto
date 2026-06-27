import { BUSY_DAYS, WEEK_CHIPS } from '../data/fixtures.js';

const SEG = ['month', '2w', '1w'];
const SEG_LABELS = { month: 'Month', '2w': '2 weeks', '1w': '1 week' };

export default function Calendar({ calView, setCalView, sel, setSel }) {
  return (
    <div style={{ padding: '32px 44px 40px', animation: 'fadeIn .45s ease' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap', marginBottom:20 }}>
        <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:30, color:'#4A3526' }}>June 2026</div>
        <div style={{ display:'flex', background:'#F1E8D7', borderRadius:999, padding:4, fontFamily:"'Quicksand'", fontWeight:700, fontSize:13 }}>
          {SEG.map(v => (
            <span key={v} onClick={() => setCalView(v)} style={{
              cursor:'pointer', padding:'8px 16px', borderRadius:999,
              ...(calView === v
                ? { background:'#fff', color:'#A8703E', boxShadow:'0 4px 10px -6px rgba(150,108,64,.5)' }
                : { color:'#AD9B84' }),
            }}>{SEG_LABELS[v]}</span>
          ))}
        </div>
      </div>

      <div style={{ display:'flex', gap:22, flexWrap:'wrap' }}>
        {/* Calendar grid */}
        <div style={{
          flex:'1 1 440px', minWidth:340,
          background:'#fff', border:'1px solid #ECE3D4', borderRadius:22, padding:20,
          boxShadow:'0 12px 30px -22px rgba(74,54,38,.5)',
        }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6, fontWeight:700, fontSize:11, color:'#B6A48C', textAlign:'center', marginBottom:8 }}>
            {['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d => <span key={d}>{d}</span>)}
          </div>

          {calView === 'month' && <MonthGrid sel={sel} setSel={setSel} />}
          {calView === '2w' && <TwoWeekGrid sel={sel} setSel={setSel} />}
          {calView === '1w' && <OneWeekGrid />}
        </div>

        {/* Day detail */}
        <div style={{ flex:'1 1 280px', minWidth:260 }}>
          <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:18, color:'#4A3526', marginBottom:12 }}>
            Saturday, 27 June
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
            <EventCard color="#A8703E" title="Add embeddings + pgvector" sub="10:00 – 10:45 · Ship a RAG app" />
            <EventCard color="#6BBF95" title="Evening walk · 8k steps" sub="18:30 · Lose 5kg" />
            <div style={{ background:'#FBEFD9', border:'1px solid #F3DCB0', borderRadius:16, padding:'14px 16px', borderLeft:'5px solid #ECA94E' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
                <div>
                  <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:15, color:'#9A6B1E' }}>Full LeetCode set</div>
                  <div style={{ fontSize:12.5, color:'#B08440', marginTop:2 }}>moved from Thursday · let's find a new slot</div>
                </div>
                <div style={{ background:'#fff', color:'#D8923A', fontFamily:"'Quicksand'", fontWeight:700, fontSize:12, padding:'8px 12px', borderRadius:11, border:'1.5px solid #F0D4A0', cursor:'grab', whiteSpace:'nowrap' }}>
                  ⤳ reschedule
                </div>
              </div>
            </div>
            <div style={{ fontStyle:'italic', fontSize:13, color:'#AD9B84', marginTop:4, textAlign:'center' }}>
              drag amber items to any open day — no pressure.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function cellStyle(n, sel) {
  if (n === sel) return { background:'#A8703E', color:'#fff' };
  if ([23,24,25,26,28].includes(n)) return { background:'#F5EEE1', color:'#4A3526' };
  return { background:'transparent', color:'#4A3526' };
}

function DayDots({ n }) {
  const count = BUSY_DAYS[n] || 0;
  if (!count) return null;
  return (
    <div style={{ display:'flex', gap:3, marginTop:3 }}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} style={{ width:5, height:5, borderRadius:'50%', display:'inline-block', background: (n===25&&i===0)?'#ECA94E':'#A8703E' }} />
      ))}
    </div>
  );
}

function MonthGrid({ sel, setSel }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6 }}>
      {Array.from({ length:30 }, (_,i) => i+1).map(n => (
        <div key={n} onClick={() => setSel(n)} style={{
          cursor:'pointer', aspectRatio:'1', borderRadius:12,
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          fontFamily:"'Quicksand'", fontWeight:600, fontSize:15,
          ...cellStyle(n, sel),
        }}>
          <span>{n}</span>
          <DayDots n={n} />
        </div>
      ))}
    </div>
  );
}

function TwoWeekGrid({ sel, setSel }) {
  const days = Array.from({ length:14 }, (_,i) => i+22).filter(n => n<=30);
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6 }}>
      {days.map(n => (
        <div key={n} onClick={() => setSel(n)} style={{
          cursor:'pointer', minHeight:74, borderRadius:12,
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start',
          paddingTop:8, fontFamily:"'Quicksand'", fontWeight:600, fontSize:15,
          ...cellStyle(n, sel),
        }}>
          <span>{n}</span>
          <DayDots n={n} />
        </div>
      ))}
    </div>
  );
}

function OneWeekGrid() {
  const days = [22,23,24,25,26,27,28];
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6 }}>
      {days.map(n => (
        <div key={n} style={{ minHeight:150, borderRadius:12, padding:'8px 6px', background: n===27?'#F5EEE1':'#FBF8F4' }}>
          <div style={{ textAlign:'center', fontFamily:"'Quicksand'", fontWeight:700, fontSize:15, color:'#4A3526', marginBottom:7 }}>{n}</div>
          {(WEEK_CHIPS[n]||[]).map(([c,t],i) => (
            <div key={i} style={{ background:c, color:'#fff', fontSize:10, fontWeight:700, borderRadius:7, padding:'4px 6px', marginBottom:4, lineHeight:1.1 }}>{t}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function EventCard({ color, title, sub }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #ECE3D4', borderRadius:16, padding:'14px 16px', borderLeft:`5px solid ${color}` }}>
      <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:15, color:'#4A3526' }}>{title}</div>
      <div style={{ fontSize:12.5, color:'#AD9B84', marginTop:2 }}>{sub}</div>
    </div>
  );
}
