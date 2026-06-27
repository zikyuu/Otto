import { useState } from 'react';
import { GOALS } from '../data/fixtures.js';

const PERSONAL_GOALS = GOALS.filter(g => g.tag === 'life');

function mapApiGoal(apiGoal, tasks) {
  const goalTasks = (tasks ?? []).filter(t => t.goal_id === apiGoal.id);
  const done = goalTasks.filter(t => t.status === 'done' || t.checked).length;
  const pct = goalTasks.length ? Math.round((done / goalTasks.length) * 100) : 0;
  return {
    id: apiGoal.id,
    title: apiGoal.title,
    cat: 'JOB TARGET',
    tag: 'skill',
    pct,
    label: `${pct}%`,
    accent: '#A8703E',
    subnote: `${done} of ${goalTasks.length} tasks done`,
    direction: `Focus on: ${(apiGoal.required_skills ?? []).slice(0, 3).join(', ')}.`,
    date: `Built ${new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    sources: (apiGoal.required_skills ?? []).map(s => ({ name: s })),
    subs: goalTasks.map(t => ({
      id: t.id,
      t: t.title?.replace(/^Build skill:\s*/i, '') ?? t.t,
      done: t.status === 'done' || t.checked,
    })),
  };
}

function tagStyle(tag) {
  return tag === 'life'
    ? { background: '#E2F2EA', color: '#4FA77D' }
    : { background: '#F2E6D4', color: '#A8703E' };
}

export function GoalsList({ checks, onToggleSub, onOpenGoal, apiGoals = [], apiTasks = [], onAddGoal, onDeleteGoal }) {
  const [adding, setAdding] = useState(false);
  const [newJd, setNewJd] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const mappedApiGoals = apiGoals.map(g => mapApiGoal(g, apiTasks));
  const goals = mappedApiGoals.length ? [...mappedApiGoals, ...PERSONAL_GOALS] : GOALS;
  const isReal = mappedApiGoals.length > 0;

  async function handleAdd() {
    if (!newJd.trim() || addLoading) return;
    setAddLoading(true);
    try {
      await onAddGoal(newJd.trim());
      setNewJd('');
      setAdding(false);
    } catch {}
    finally { setAddLoading(false); }
  }

  async function handleDelete(e, goalId) {
    e.stopPropagation();
    if (deletingId) return;
    setDeletingId(goalId);
    try { await onDeleteGoal(goalId); }
    catch {}
    finally { setDeletingId(null); }
  }

  return (
    <div style={{ padding: '32px 44px 40px', animation: 'fadeIn .45s ease' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 30, color: '#4A3526' }}>Your goals</div>
          <div style={{ fontSize: 14, color: '#8C7A64', marginTop: 3 }}>Long-term goals grow as a bar. Tap one to see the small steps.</div>
        </div>
        {isReal && !adding && (
          <div onClick={() => setAdding(true)} style={{
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
            background: 'linear-gradient(135deg,#C0894F,#A8703E)', color: '#fff',
            fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 14,
            padding: '10px 18px', borderRadius: 13,
            boxShadow: '0 8px 16px -8px rgba(150,108,64,.6)',
          }}>
            + Add job target
          </div>
        )}
      </div>

      {/* Add job target form */}
      {adding && (
        <div style={{
          marginTop: 22, background: '#fff', border: '1.5px solid #A8703E',
          borderRadius: 22, padding: 22, boxShadow: '0 12px 30px -24px rgba(74,54,38,.5)',
        }}>
          <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 16, color: '#4A3526', marginBottom: 12 }}>
            Paste the job description
          </div>
          <textarea
            rows={5} value={newJd} onChange={e => setNewJd(e.target.value)}
            placeholder="Paste the full job description here…"
            style={{
              width: '100%', boxSizing: 'border-box', border: '1.5px solid #ECE3D4',
              borderRadius: 12, padding: '12px 14px', fontSize: 13, lineHeight: 1.6,
              resize: 'vertical', fontFamily: 'inherit', color: '#4A3526', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = '#A8703E'}
            onBlur={e => e.target.style.borderColor = '#ECE3D4'}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button onClick={handleAdd} disabled={newJd.trim().length < 20 || addLoading} style={{
              flex: 1, padding: '11px 18px', borderRadius: 12, border: 'none',
              cursor: newJd.trim().length < 20 || addLoading ? 'not-allowed' : 'pointer',
              background: newJd.trim().length < 20 || addLoading ? '#E9DCC8' : 'linear-gradient(135deg,#C0894F,#A8703E)',
              color: newJd.trim().length < 20 || addLoading ? '#B6A48C' : '#fff',
              fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 14,
            }}>
              {addLoading ? 'Building…' : 'Add target →'}
            </button>
            <button onClick={() => { setAdding(false); setNewJd(''); }} style={{
              padding: '11px 18px', borderRadius: 12, border: '1.5px solid #E9DCC8',
              background: 'transparent', color: '#8C7A64',
              fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 16, marginTop: 22 }}>
        {goals.map(g => (
          <div key={g.id} onClick={() => onOpenGoal(g.id)} style={{
            cursor: 'pointer', background: '#fff', border: '1px solid #ECE3D4',
            borderRadius: 22, padding: 22, boxShadow: '0 12px 30px -24px rgba(74,54,38,.5)',
            position: 'relative',
          }}>
            {/* Delete button — only on real job targets */}
            {g.tag === 'skill' && isReal && onDeleteGoal && (
              <div
                onClick={e => handleDelete(e, g.id)}
                style={{
                  position: 'absolute', top: 14, right: 14,
                  width: 26, height: 26, borderRadius: '50%',
                  background: deletingId === g.id ? '#E9DCC8' : '#F5EEE1',
                  color: '#B6A48C', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  transition: 'background .15s',
                }}
              >
                {deletingId === g.id ? '…' : '×'}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingRight: g.tag === 'skill' && isReal ? 32 : 0 }}>
              <span style={{ fontWeight: 800, fontSize: 10, letterSpacing: '.5px', padding: '4px 9px', borderRadius: 7, ...tagStyle(g.tag) }}>
                {g.cat}
              </span>
              <span style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 20, color: g.accent }}>{g.label}</span>
            </div>
            <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 19, color: '#4A3526', margin: '13px 0 14px', lineHeight: 1.15 }}>{g.title}</div>
            <div style={{ height: 10, borderRadius: 7, background: '#F1E8D7', overflow: 'hidden' }}>
              <div style={{ width: `${g.pct}%`, height: '100%', background: g.accent, borderRadius: 7 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 11 }}>
              <span style={{ fontSize: 12.5, color: '#AD9B84' }}>{g.subnote}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#A8703E' }}>Open →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GoalDetail({ goalId, checks, onToggleSub, onClose, apiGoals = [], apiTasks = [] }) {
  const mappedApiGoals = apiGoals.map(g => mapApiGoal(g, apiTasks));
  const allGoals = mappedApiGoals.length ? [...mappedApiGoals, ...PERSONAL_GOALS] : GOALS;
  const g = allGoals.find(x => x.id === goalId) || allGoals[0];

  return (
    <div style={{ padding: '28px 44px 40px', animation: 'fadeIn .4s ease' }}>
      <div onClick={onClose} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 700, fontSize: 14, color: '#8C7A64', marginBottom: 18 }}>
        ← All goals
      </div>
      <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: '.5px', padding: '4px 10px', borderRadius: 7, ...tagStyle(g.tag) }}>
        {g.cat}
      </span>
      <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 32, color: '#4A3526', margin: '11px 0 16px', lineHeight: 1.08 }}>{g.title}</div>

      <div style={{ background: '#fff', border: '1px solid #ECE3D4', borderRadius: 20, padding: '20px 22px', boxShadow: '0 12px 30px -24px rgba(74,54,38,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 15, color: '#4A3526' }}>Progress</span>
          <span style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 18, color: g.accent }}>{g.label}</span>
        </div>
        <div style={{ height: 12, borderRadius: 8, background: '#F1E8D7', overflow: 'hidden' }}>
          <div style={{ width: `${g.pct}%`, height: '100%', background: g.accent, borderRadius: 8 }} />
        </div>
      </div>

      <div style={{ marginTop: 16, background: '#FBEFD9', border: '1px solid #F3DCB0', borderRadius: 20, padding: '18px 20px' }}>
        <div style={{ display: 'flex', gap: 13 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#F6E1B8', color: '#D8923A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flex: '0 0 auto' }}>↗</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: '1px', color: '#D8923A' }}>DIRECTION CHECK</div>
            <div style={{ fontSize: 15, color: '#7A5A22', lineHeight: 1.5, marginTop: 4 }}>
              {g.direction}{' '}
              <span style={{ color: '#D8923A', fontWeight: 800, textDecoration: 'underline', cursor: 'pointer' }}>see evidence</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, marginTop: 16, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #ECE3D4', borderRadius: 20, padding: '20px 22px' }}>
          <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 16, color: '#4A3526', marginBottom: 14 }}>The small steps</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {g.subs.map((sub, i) => {
              const key = sub.id ?? `${g.id}_${i}`;
              const ck = checks[key];
              return (
                <div key={key} onClick={() => onToggleSub(key)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                  {ck
                    ? <div style={{ width: 23, height: 23, borderRadius: 7, background: '#6BBF95', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flex: '0 0 auto' }}>✓</div>
                    : <div style={{ width: 23, height: 23, borderRadius: 7, border: '2px solid #D9CAB2', flex: '0 0 auto' }} />
                  }
                  <span style={{ fontSize: 15, fontWeight: 600, color: ck ? '#B6A48C' : '#4A3526', textDecoration: ck ? 'line-through' : 'none' }}>{sub.t}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: '#F5EEE1', border: '1px solid #E9DCC8', borderRadius: 20, padding: '20px 22px' }}>
          <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 15, color: '#4A3526' }}>What this goal really needs</div>
          <div style={{ fontWeight: 700, fontSize: 11, color: '#AD9B84', marginTop: 3 }}>{g.date} · from live web</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 13 }}>
            {g.sources.map((src, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', borderRadius: 11, padding: '10px 12px', cursor: 'pointer' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#A8703E', flex: '0 0 auto' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#8A5A2E', flex: 1 }}>{src.name}</span>
                <span style={{ color: '#B6A48C', fontSize: 12 }}>↗</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
