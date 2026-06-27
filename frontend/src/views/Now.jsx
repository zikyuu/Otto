export default function Now({ tasks, onToggle, onFellBehind, onOpenFeasibility }) {
  return (
    <div style={{ animation: 'fadeIn .45s ease' }}>
      {/* Hero */}
      <div style={{
        position: 'relative',
        background: 'linear-gradient(150deg,#F3EBDC 0%,#F5EEE1 45%,#FBEFEA 100%)',
        padding: '38px 44px 34px', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', right: -40, top: -40,
          width: 230, height: 230, borderRadius: '50%',
          background: 'rgba(255,255,255,.35)',
        }} />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 24, flexWrap: 'wrap', position: 'relative',
        }}>
          <div style={{ minWidth: 300 }}>
            <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '1.5px', color: '#AD9B84', textTransform: 'uppercase' }}>
              Saturday · 27 June
            </div>
            <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 42, color: '#4A3526', lineHeight: 1.02, marginTop: 4 }}>
              Hello, Yuki
            </div>
            <div style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 18, color: '#8C7A64', marginTop: 6 }}>
              "Slow is smooth, smooth is fast."
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 9, marginTop: 16,
              background: '#E2F2EA', borderRadius: 999, padding: '8px 15px',
            }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6BBF95', animation: 'pulseDot 2.2s infinite' }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: '#4FA77D' }}>You're slightly ahead this week</span>
            </div>
          </div>
          <img
            src="/mascots/eating.png" alt="happy otter eating meatballs"
            style={{ width: 190, height: 'auto', flex: '0 0 auto', animation: 'floatM 5.5s ease-in-out infinite', filter: 'drop-shadow(0 12px 16px rgba(110,84,54,.22))' }}
          />
        </div>

        {/* One best move */}
        <div style={{
          position: 'relative', marginTop: 26,
          background: '#fff', borderRadius: 24, padding: '24px 26px',
          boxShadow: '0 20px 44px -24px rgba(150,108,64,.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 20, flexWrap: 'wrap',
        }}>
          <div style={{ minWidth: 260 }}>
            <div style={{ fontWeight: 800, fontSize: 12, letterSpacing: '1.5px', color: '#A8703E', textTransform: 'uppercase' }}>
              ✦ Your one best move right now
            </div>
            <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 26, color: '#4A3526', margin: '8px 0 7px', lineHeight: 1.1 }}>
              Add embeddings + vector search (pgvector)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ background: '#F2E6D4', color: '#A8703E', fontWeight: 700, fontSize: 12, padding: '5px 11px', borderRadius: 999 }}>
                Ship a production RAG app
              </span>
              <span style={{ color: '#8C7A64', fontWeight: 600, fontSize: 14 }}>· 45 min</span>
            </div>
          </div>
          <div style={{
            background: 'linear-gradient(135deg,#C0894F,#A8703E)', color: '#fff',
            fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 16,
            padding: '15px 26px', borderRadius: 16,
            boxShadow: '0 12px 22px -10px rgba(150,108,64,.7)',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            Start · 45 min
          </div>
        </div>
      </div>

      {/* Today list */}
      <div style={{ padding: '26px 44px 40px' }}>
        {/* Capacity banner */}
        <div onClick={onOpenFeasibility} style={{
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 13,
          background: '#FBEFD9', border: '1px solid #F3DCB0', borderRadius: 16,
          padding: '13px 17px', marginBottom: 24,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', background: '#F6E1B8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#D8923A', fontSize: 16, flex: '0 0 auto',
          }}>◔</div>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 800, color: '#9A6B1E', fontSize: 14 }}>This week is a little full at your pace.</span>
            {' '}<span style={{ color: '#B08440', fontSize: 13 }}>Tap to see what to protect.</span>
          </div>
          <span style={{ color: '#D8923A', fontWeight: 800 }}>→</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 22, color: '#4A3526' }}>Today, in order</div>
          <div onClick={onFellBehind} style={{
            cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#8C7A64',
            border: '1.5px solid #E1D5C0', borderRadius: 999, padding: '8px 15px',
          }}>I fell behind →</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tasks.map((t) => (
            <div key={t.k} onClick={() => onToggle(t.k)} style={{
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
              background: '#fff', border: '1px solid #ECE3D4', borderRadius: 16,
              padding: '14px 17px', boxShadow: '0 6px 16px -14px rgba(74,54,38,.5)',
            }}>
              {t.checked
                ? <div style={{ width:24,height:24,borderRadius:8,background:'#6BBF95',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flex:'0 0 auto' }}>✓</div>
                : <div style={{ width:24,height:24,borderRadius:8,border:'2px solid #D9CAB2',flex:'0 0 auto' }} />
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily:"'Quicksand'", fontWeight:600, fontSize:16, color: t.checked ? '#B6A48C' : '#4A3526', textDecoration: t.checked ? 'line-through' : 'none' }}>{t.t}</div>
                <div style={{ fontSize:12.5, color:'#AD9B84', marginTop:1 }}>{t.meta}</div>
              </div>
              {t.star && !t.checked && <span style={{ color:'#A8703E', fontSize:14, fontWeight:800 }}>★ now</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
