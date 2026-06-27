import { useState } from 'react';
import { GOALS } from '../data/fixtures.js';

const FEASIBILITY_STYLE = {
  'on-track':  { bg:'#E2F2EA', border:'#C9E6D5', dot:'#6BBF95', text:'#3D8A62', label:'On track' },
  'at-risk':   { bg:'#FBEFD9', border:'#F3DCB0', dot:'#ECA94E', text:'#9A6B1E', label:'At risk'  },
  'infeasible':{ bg:'#FBEFD9', border:'#F3DCB0', dot:'#D8923A', text:'#8A4A12', label:'Needs major change' },
};

function tagStyle(tag) {
  return tag === 'life'
    ? { background:'#E2F2EA', color:'#4FA77D' }
    : { background:'#F2E6D4', color:'#A8703E' };
}

function AiReviewPanel({ review, onClose }) {
  const s = FEASIBILITY_STYLE[review.feasibility] || FEASIBILITY_STYLE['at-risk'];
  return (
    <div style={{ background:s.bg, border:`1px solid ${s.border}`, borderRadius:22, padding:'22px 26px', marginBottom:22, position:'relative', animation:'sheetUp .4s ease' }}>
      <button onClick={onClose} style={{ position:'absolute', top:14, right:16, background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#AD9B84', lineHeight:1 }}>×</button>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <span style={{ width:10, height:10, borderRadius:'50%', background:s.dot, display:'inline-block', flexShrink:0 }} />
        <span style={{ fontFamily:"'Quicksand'", fontWeight:800, fontSize:17, color:s.text }}>{s.label}</span>
        {review.exa_grounded && (
          <span style={{ fontSize:10, fontWeight:700, color:'#AD9B84', background:'#fff', borderRadius:999, padding:'2px 8px', marginLeft:4 }}>Exa-grounded</span>
        )}
      </div>
      <p style={{ fontSize:14, color:'#4A3526', lineHeight:1.55, margin:'0 0 14px' }}>{review.summary}</p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div style={{ background:'#fff', borderRadius:16, padding:'14px 16px' }}>
          <div style={{ fontWeight:800, fontSize:11, letterSpacing:'.5px', color:s.text, marginBottom:8 }}>TIMELINE ANALYSIS</div>
          <p style={{ fontSize:13, color:'#6A5040', lineHeight:1.5, margin:0 }}>{review.timeline_analysis}</p>
        </div>
        <div style={{ background:'#fff', borderRadius:16, padding:'14px 16px' }}>
          <div style={{ fontWeight:800, fontSize:11, letterSpacing:'.5px', color:s.text, marginBottom:8 }}>FOCUS NOW</div>
          <p style={{ fontSize:13, color:'#6A5040', lineHeight:1.5, margin:0 }}>{review.focus_recommendation}</p>
        </div>
      </div>
      {review.suggested_adjustments?.length > 0 && (
        <div style={{ marginTop:14 }}>
          <div style={{ fontWeight:800, fontSize:11, letterSpacing:'.5px', color:s.text, marginBottom:8 }}>SUGGESTED ADJUSTMENTS</div>
          <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
            {review.suggested_adjustments.map((adj, i) => (
              <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                <span style={{ width:20, height:20, borderRadius:6, background:s.dot, color:'#fff', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>{i+1}</span>
                <span style={{ fontSize:13, color:'#5A4030', lineHeight:1.45 }}>{adj}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function GoalsList({ checks, onToggleSub, onOpenGoal }) {
  const [aiReview,  setAiReview]  = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState('');

  async function handleReview() {
    setAiLoading(true);
    setAiError('');
    setAiReview(null);
    try {
      const res = await fetch('/api/ai/review-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goals: GOALS, timeline_weeks: 8 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      setAiReview(await res.json());
    } catch (err) {
      setAiError(err.message.includes('503') || err.message.includes('OPENAI')
        ? 'Add OPENAI_API_KEY to backend/.env to enable AI review.'
        : 'Review failed — is the backend running?');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div style={{ padding:'32px 44px 40px', animation:'fadeIn .45s ease' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap', marginBottom:4 }}>
        <div>
          <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:30, color:'#4A3526' }}>Your goals</div>
          <div style={{ fontSize:14, color:'#8C7A64', marginTop:3 }}>Long-term goals grow as a bar. Tap one to see the small steps.</div>
        </div>
        <button
          onClick={handleReview}
          disabled={aiLoading}
          style={{
            padding:'10px 20px', borderRadius:999, border:'none',
            background: aiLoading ? '#F1E8D7' : '#A8703E',
            color: aiLoading ? '#AD9B84' : '#fff',
            fontFamily:"'Quicksand'", fontWeight:700, fontSize:14,
            cursor: aiLoading ? 'default' : 'pointer',
            display:'flex', alignItems:'center', gap:8,
            boxShadow: aiLoading ? 'none' : '0 6px 16px -8px rgba(168,112,62,.7)',
            transition:'all .2s ease',
          }}
        >
          {aiLoading
            ? <><span style={{ animation:'ringPulse 1.1s ease infinite' }}>✦</span> Reviewing…</>
            : <>✦ Review with AI</>
          }
        </button>
      </div>

      {aiError && (
        <div style={{ background:'#FBEFD9', border:'1px solid #F3DCB0', borderRadius:14, padding:'10px 16px', marginBottom:16, fontSize:13, color:'#9A6B1E', display:'flex', gap:8 }}>
          <span>⚠</span><span>{aiError}</span>
          <span onClick={() => setAiError('')} style={{ marginLeft:'auto', cursor:'pointer', color:'#B6A48C' }}>×</span>
        </div>
      )}

      {aiReview && <AiReviewPanel review={aiReview} onClose={() => setAiReview(null)} />}

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
