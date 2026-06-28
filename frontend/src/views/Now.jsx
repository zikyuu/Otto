import { useState } from 'react';
import eatingImg from '../assets/mascots/eating.png';

const QUOTES = [
  "Slow is smooth, smooth is fast.",
  "One thing at a time.",
  "Progress beats perfection.",
  "Small steps, real momentum.",
];

const TYPE_ICON = { leetcode: '🔗', video: '🎥', article: '📄', other: '🔗' };

export default function Now({ tasks, onToggle, onFellBehind, onOpenFeasibility, userName, feasible, role }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long' }) +
    ' · ' + now.toLocaleDateString('en-US', { day: 'numeric', month: 'long' });
  const quote = QUOTES[now.getDay() % QUOTES.length];
  const bestMove = tasks.find(t => t.star && !t.checked) || tasks.find(t => !t.checked);
  const statusText = feasible === false
    ? "This week is tight — let's protect what matters."
    : "You're on track this week";
  const statusColor = feasible === false ? '#D8923A' : '#4FA77D';
  const statusBg = feasible === false ? '#FBEFD9' : '#E2F2EA';
  const dotColor = feasible === false ? '#ECA94E' : '#6BBF95';

  const [expanded, setExpanded] = useState(new Set());
  const [resources, setResources] = useState({});
  const [loadingRes, setLoadingRes] = useState(new Set());

  async function fetchResources(taskKey, skill) {
    if (!skill) {
      setResources(prev => ({ ...prev, [taskKey]: [] }));
      return;
    }
    const cacheKey = `resources:${skill}:${role}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setResources(prev => ({ ...prev, [taskKey]: JSON.parse(cached) }));
      return;
    }
    setLoadingRes(prev => { const s = new Set(prev); s.add(taskKey); return s; });
    try {
      const resp = await fetch(`/api/resources?skill=${encodeURIComponent(skill)}&role=${encodeURIComponent(role || '')}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      localStorage.setItem(cacheKey, JSON.stringify(data));
      setResources(prev => ({ ...prev, [taskKey]: data }));
    } catch (err) {
      console.error('fetchResources failed:', err);
      setResources(prev => ({ ...prev, [taskKey]: null }));
    } finally {
      setLoadingRes(prev => { const s = new Set(prev); s.delete(taskKey); return s; });
    }
  }

  function toggleExpand(taskKey, skill) {
    const isOpen = expanded.has(taskKey);
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(taskKey)) s.delete(taskKey);
      else s.add(taskKey);
      return s;
    });
    if (!isOpen && resources[taskKey] === undefined && !loadingRes.has(taskKey)) {
      fetchResources(taskKey, skill);
    }
  }

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
              {dateStr}
            </div>
            <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 42, color: '#4A3526', lineHeight: 1.02, marginTop: 4 }}>
              Hello, {userName}
            </div>
            <div style={{ fontStyle: 'italic', fontWeight: 600, fontSize: 18, color: '#8C7A64', marginTop: 6 }}>
              "{quote}"
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 9, marginTop: 16,
              background: statusBg, borderRadius: 999, padding: '8px 15px',
            }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, animation: 'pulseDot 2.2s infinite' }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: statusColor }}>{statusText}</span>
            </div>
          </div>
          <img
            src={eatingImg} alt="happy otter eating meatballs"
            style={{ width: 270, height: 'auto', flex: '0 0 auto', animation: 'floatM 5.5s ease-in-out infinite', filter: 'drop-shadow(0 12px 16px rgba(110,84,54,.22))' }}
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
              {bestMove ? bestMove.t : '—'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {bestMove?.meta && (
                <span style={{ background: '#F2E6D4', color: '#A8703E', fontWeight: 700, fontSize: 12, padding: '5px 11px', borderRadius: 999 }}>
                  {bestMove.meta.split('·')[1]?.trim() ?? bestMove.meta}
                </span>
              )}
              {bestMove && <span style={{ color: '#8C7A64', fontWeight: 600, fontSize: 14 }}>· {bestMove?.meta?.split('·')[0]?.trim()}</span>}
            </div>
          </div>
          <div style={{
            background: 'linear-gradient(135deg,#C0894F,#A8703E)', color: '#fff',
            fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 16,
            padding: '15px 26px', borderRadius: 16,
            boxShadow: '0 12px 22px -10px rgba(150,108,64,.7)',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            Start · {bestMove?.meta?.split('·')[0]?.trim() ?? '—'}
          </div>
        </div>
      </div>

      {/* Today list */}
      <div style={{ padding: '26px 44px 40px' }}>
        {/* Capacity banner — only when plan is infeasible */}
        {feasible === false && (
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
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 22, color: '#4A3526' }}>Today, in order</div>
          <div onClick={onFellBehind} style={{
            cursor: 'pointer', fontWeight: 700, fontSize: 13, color: '#8C7A64',
            border: '1.5px solid #E1D5C0', borderRadius: 999, padding: '8px 15px',
          }}>I fell behind →</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tasks.map((t) => {
            const skill = t.skill ?? t.meta?.split('·')[1]?.trim() ?? '';
            const isExpanded = expanded.has(t.k);
            const isLoading = loadingRes.has(t.k);
            const taskResources = resources[t.k] ?? [];
            return (
              <div key={t.k} style={{
                background: '#fff', border: '1px solid #ECE3D4', borderRadius: 16,
                boxShadow: '0 6px 16px -14px rgba(74,54,38,.5)', overflow: 'hidden',
              }}>
                {/* Toggle row */}
                <div onClick={() => onToggle(t.k)} style={{
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 17px',
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
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleExpand(t.k, skill); }}
                    style={{
                      background: 'none', border: '1px solid #E1D5C0', borderRadius: 999,
                      padding: '4px 10px', fontSize: 11, fontWeight: 700, color: '#8C7A64',
                      cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >
                    {isExpanded ? 'resources ▲' : 'resources ▼'}
                  </button>
                </div>
                {/* Resource expand panel */}
                {isExpanded && (
                  <div style={{ padding: '0 17px 14px', borderTop: '1px solid #F0E8DC' }}>
                    {isLoading && (
                      <div style={{ fontSize: 12, color: '#AD9B84', paddingTop: 10 }}>Finding resources…</div>
                    )}
                    {!isLoading && taskResources.length === 0 && (
                      <div style={{ fontSize: 12, color: '#AD9B84', paddingTop: 10 }}>No resources found.</div>
                    )}
                    {!isLoading && taskResources.length > 0 && (
                      <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {taskResources.map((r) => (
                          <a
                            key={r.url}
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              fontSize: 12.5, color: '#5A7D6F', textDecoration: 'none',
                              fontWeight: 600,
                            }}
                          >
                            <span>{TYPE_ICON[r.type] ?? '🔗'}</span>
                            <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>{r.title}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
