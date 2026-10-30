import { useState } from 'react';
import ProgressChart, { shortDate } from './ProgressChart.jsx';
import { describeChange, overhaulSummary, splitByScale } from './goalChanges.js';
import {
  progressPct, expectedPct, statusOf, STATUS, sortedMilestones, cumulativePct, milestoneFraction, daysLeft, remainingHours,
  insights, toggleMilestone, toggleSubtask, addMilestone, removeMilestone, addSubtask, logDetour, daysBetween,
} from './goalMath.js';
import { IconCheck, IconCaret, IconPlus, IconTrash, IconBranch, IconStop, IconTurn, IconArrow } from '../calendar/Icons.jsx';

export const TONES = {
  good: { fg: '#4E5C36', bg: '#E4EAD3', bar: '#4E5C36' },
  warn: { fg: '#8A6A2F', bg: '#F3E6C8', bar: '#8A6A2F' },
  bad:  { fg: '#A5543F', bg: '#F3DDD2', bar: '#A5543F' },
};
const DETOUR = { sidetrack: { Icon: IconBranch, label: 'Sidetrack' }, roadblock: { Icon: IconStop, label: 'Roadblock' }, pivot: { Icon: IconTurn, label: 'Pivot' } };
const uid = () => Math.random().toString(36).slice(2, 9);
const fmtH = h => `${Math.round(h * 10) / 10}h`;

function Check({ on, onClick, label, size = 20 }) {
  return (
    <button role="checkbox" aria-checked={on} aria-label={label} onClick={onClick} style={{
      width: size, height: size, borderRadius: 7, flexShrink: 0, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `1.5px solid ${on ? 'var(--accent)' : 'var(--ink-4)'}`, background: on ? 'var(--accent)' : 'transparent', color: '#fff',
    }}>{on && <IconCheck size={size - 8} />}</button>
  );
}

export function StatusBadge({ status }) {
  const s = STATUS[status], t = TONES[s.tone];
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: t.bg, color: t.fg, whiteSpace: 'nowrap' }}>{s.label}</span>;
}

function Bar({ pct, expected, tone }) {
  return (
    <div style={{ position: 'relative', height: 8, borderRadius: 999, background: 'var(--surface-2)' }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${Math.min(pct, 100)}%`, borderRadius: 999, background: TONES[tone].bar, transition: 'width .4s var(--ease)' }} />
      <div title={`Plan expects ${Math.round(expected)}% by today`} style={{ position: 'absolute', left: `${Math.min(expected, 100)}%`, top: -4, bottom: -4, width: 2, background: 'var(--ink)', borderRadius: 2, opacity: .7 }} />
    </div>
  );
}

function Milestone({ goal, m, today, onChange }) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState('');
  const frac = milestoneFraction(m), cum = cumulativePct(goal, m.id);
  const overdue = !m.done && daysBetween(m.due, today) > 0;
  const hasSubs = m.subtasks?.length > 0;
  return (
    <div style={{ borderRadius: 12, background: m.done ? 'transparent' : 'var(--surface)', border: `1px solid ${m.done ? 'transparent' : 'var(--line-soft)'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px 10px 12px' }}>
        <Check on={m.done} label={`Mark "${m.title}" ${m.done ? 'not done' : 'done'}`} onClick={() => onChange(toggleMilestone(goal, m.id, today))} />
        <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
          <span style={{ fontSize: 13.5, fontWeight: 500, textDecoration: m.done ? 'line-through' : 'none', color: m.done ? 'var(--ink-3)' : 'var(--ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</span>
          {hasSubs && !m.done && <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{m.subtasks.filter(s => s.done).length}/{m.subtasks.length}</span>}
          <IconCaret size={13} style={{ color: 'var(--ink-4)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s var(--ease)', flexShrink: 0 }} />
        </button>
        <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', width: 34, textAlign: 'right', whiteSpace: 'nowrap' }}>{m.logged_h > 0 && !m.done ? <span title={`${fmtH(m.logged_h)} logged from the calendar`}>{fmtH(m.logged_h)}/</span> : null}{fmtH(m.effort_h)}</span>
        <span className="mono" title="Where the whole goal stands once this is done" style={{ fontSize: 11, color: m.done ? 'var(--accent)' : 'var(--ink-2)', background: 'var(--surface-2)', borderRadius: 999, padding: '2px 8px', width: 56, textAlign: 'center' }}>{Math.round(cum)}%</span>
        <span className="mono" style={{ fontSize: 11, width: 52, textAlign: 'right', color: overdue ? TONES.bad.fg : 'var(--ink-3)', fontWeight: overdue ? 600 : 400 }}>{shortDate(m.due)}</span>
      </div>
      {!m.done && frac > 0 && (
        <div style={{ margin: '-4px 12px 10px 44px', height: 3, borderRadius: 3, background: 'var(--surface-2)' }}>
          <div style={{ width: `${frac * 100}%`, height: '100%', borderRadius: 3, background: 'var(--accent)' }} />
        </div>
      )}
      {open && (
        <div style={{ padding: '0 12px 12px 44px', animation: 'fadeIn .15s var(--ease)' }}>
          {m.logged_h > 0 && <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--ink-3)' }}>{fmtH(m.logged_h)} of {fmtH(m.effort_h)} done in calendar sessions you tied to this step.</p>}
          {(m.subtasks || []).map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
              <Check size={16} on={s.done} label={`Mark "${s.t}" ${s.done ? 'not done' : 'done'}`} onClick={() => onChange(toggleSubtask(goal, m.id, s.id, today))} />
              <span style={{ fontSize: 12.5, color: s.done ? 'var(--ink-3)' : 'var(--ink-2)', textDecoration: s.done ? 'line-through' : 'none' }}>{s.t}</span>
            </div>
          ))}
          <form onSubmit={e => { e.preventDefault(); if (sub.trim()) { onChange(addSubtask(goal, m.id, sub.trim(), uid())); setSub(''); } }} style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input value={sub} onChange={e => setSub(e.target.value)} placeholder="Add a step" aria-label={`Add a step to ${m.title}`} style={inputStyle} />
            <button className="btn" type="submit" disabled={!sub.trim()}>Add</button>
            <button type="button" className="btn btn--ghost btn--icon" aria-label={`Delete milestone ${m.title}`} title="Delete milestone" onClick={() => onChange(removeMilestone(goal, m.id))}><IconTrash size={14} /></button>
          </form>
        </div>
      )}
    </div>
  );
}

const inputStyle = { flex: 1, minWidth: 0, height: 30, padding: '0 12px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 12.5, color: 'var(--ink)', outline: 'none' };

function AddMilestone({ goal, today, onChange }) {
  const [t, setT] = useState(''), [h, setH] = useState('2'), [due, setDue] = useState(goal.target);
  const bad = !t.trim() || !(Number(h) > 0) || !due;
  return (
    <form onSubmit={e => { e.preventDefault(); if (!bad) { onChange(addMilestone(goal, { title: t.trim(), effort_h: h, due }, uid())); setT(''); } }}
      style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10, padding: '0 4px' }}>
      <input value={t} onChange={e => setT(e.target.value)} placeholder="New milestone" aria-label="New milestone" style={{ ...inputStyle, flex: '1 1 160px' }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-3)' }}>
        <input type="number" min="0.25" step="0.25" value={h} onChange={e => setH(e.target.value)} aria-label="Effort in hours" style={{ ...inputStyle, flex: 'none', width: 62 }} />h
      </label>
      <input type="date" value={due} min={today} onChange={e => setDue(e.target.value)} aria-label="Due date" style={{ ...inputStyle, flex: 'none', width: 140 }} />
      <button className="btn btn--primary" type="submit" disabled={bad}><IconPlus size={13} />Add</button>
    </form>
  );
}

function Detours({ goal, today, onChange }) {
  const [type, setType] = useState('sidetrack'), [text, setText] = useState('');
  return (
    <div>
      {(goal.detours || []).length === 0 && <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--ink-3)' }}>Nothing logged. Note it when something knocks you off course. You do not need to count the days: Otto sees the delay in your progress.</p>}
      {(goal.detours || []).map((d, i) => {
        const { Icon, label } = DETOUR[d.type] || DETOUR.sidetrack;
        return (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <span style={{ color: d.type === 'roadblock' ? TONES.bad.fg : TONES.warn.fg, marginTop: 1 }}><Icon size={15} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>{d.text}</div>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 2 }}>{label} · {shortDate(d.date)}</div>
            </div>
          </div>
        );
      })}
      <form onSubmit={e => { e.preventDefault(); if (text.trim()) { onChange(logDetour(goal, { type, text: text.trim(), date: today })); setText(''); } }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <select value={type} onChange={e => setType(e.target.value)} aria-label="Kind of detour" style={{ ...inputStyle, flex: 'none', width: 108 }}>
          <option value="sidetrack">Sidetrack</option><option value="roadblock">Roadblock</option><option value="pivot">Pivot</option>
        </select>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="What happened" aria-label="What happened" style={{ ...inputStyle, flex: '1 1 140px' }} />
        <button className="btn" type="submit" disabled={!text.trim()}>Log</button>
      </form>
    </div>
  );
}

const sectionTitle = { fontSize: 11, fontWeight: 600, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--ink-3)', margin: '0 0 10px' };

// advice: the wizard's last word on this goal (or undefined)
export default function GoalRow({ goal, today, open, onToggle, onChange, advice, onApplyDate, onApplyChanges, index = 0 }) {
  const status = statusOf(goal, today), tone = STATUS[status].tone, t = TONES[tone];
  const pct = progressPct(goal), exp = expectedPct(goal, today);
  const left = daysLeft(goal, today);
  const next = sortedMilestones(goal).find(m => !m.done);
  const lines = insights(goal, today);

  return (
    <li className={`bezel rise ${open ? 'bezel--float' : ''}`} style={{ listStyle: 'none', '--i': index + 3 }}><div className="core">
      <button onClick={onToggle} aria-expanded={open} style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(180px,1fr) auto', alignItems: 'center', gap: 22, padding: '22px 26px', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className="label-caps" style={{ fontSize: 10 }}>{goal.cat}</span>
            <StatusBadge status={status} />
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.015em', lineHeight: 1.25 }}>{goal.title}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {next ? <>Next: <span style={{ color: 'var(--ink-2)' }}>{next.title}</span></> : 'Every milestone is done'}
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
            <span className="mono" style={{ fontSize: 22, fontWeight: 600, color: t.fg, letterSpacing: '-.02em' }}>{Math.round(pct)}%</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>plan {Math.round(exp)}%</span>
          </div>
          <Bar pct={pct} expected={exp} tone={tone} />
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8 }}>
            {left >= 0 ? `${left} days to ${shortDate(goal.target)}` : `${-left} days past ${shortDate(goal.target)}`} · {fmtH(remainingHours(goal))} left
          </div>
        </div>
        <IconCaret size={18} style={{ color: 'var(--ink-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s var(--ease)' }} />
      </button>

      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(300px,1fr)', gap: 0, borderTop: '1px solid var(--line-soft)', animation: 'fadeIn .2s var(--ease)' }}>
          <section style={{ padding: '18px 22px 22px' }} aria-label="Milestones">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h3 style={sectionTitle}>Milestones</h3>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>effort · goal at · due</span>
            </div>
            <div role="list" style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sortedMilestones(goal).map((m, i, all) => {
                const showToday = (i === 0 || daysBetween(all[i - 1].due, today) >= 0) && daysBetween(m.due, today) < 0;
                return (
                  <div key={m.id} role="listitem">
                    {showToday && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 10px' }} aria-label={`Today. The plan expects ${Math.round(exp)} percent`}>
                        <span style={{ flex: 1, borderTop: '1.5px dashed var(--accent)', opacity: .5 }} />
                        <span className="mono" style={{ fontSize: 10.5, color: 'var(--accent-ink)' }}>today · plan expects {Math.round(exp)}%</span>
                        <span style={{ flex: 1, borderTop: '1.5px dashed var(--accent)', opacity: .5 }} />
                      </div>
                    )}
                    <Milestone goal={goal} m={m} today={today} onChange={onChange} />
                  </div>
                );
              })}
            </div>
            <AddMilestone goal={goal} today={today} onChange={onChange} />
          </section>

          <aside style={{ padding: '18px 22px 22px', borderLeft: '1px solid var(--line-soft)', background: 'rgba(240,234,214,.35)', display: 'flex', flexDirection: 'column', gap: 22 }}>
            <section aria-label="Plan against reality">
              <h3 style={sectionTitle}>Plan against reality</h3>
              <ProgressChart goal={goal} today={today} />
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink-3)', marginTop: 6 }}>
                <span><i style={{ display: 'inline-block', width: 14, borderTop: '2px dashed var(--ink-3)', verticalAlign: 'middle', marginRight: 5 }} />plan</span>
                <span><i style={{ display: 'inline-block', width: 14, borderTop: `2.4px solid ${t.bar}`, verticalAlign: 'middle', marginRight: 5 }} />actual</span>
              </div>
              <ul style={{ margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {lines.map((l, i) => (
                  <li key={i} style={{ listStyle: 'none', display: 'flex', gap: 9, fontSize: 12.5, lineHeight: 1.45, color: 'var(--ink-2)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: TONES[l.tone].bar, marginTop: 6, flexShrink: 0 }} />{l.text}
                  </li>
                ))}
              </ul>
            </section>

            {advice && (
              <section aria-label="The wizard's advice" style={{ background: 'var(--surface)', border: `1px solid ${advice.verdict === 'impossible' ? '#E8C0B2' : 'var(--line)'}`, borderRadius: 12, padding: '14px 16px' }}>
                <h3 style={{ ...sectionTitle, marginBottom: 6 }}>The wizard says</h3>
                {advice.stale && <p style={{ margin: '0 0 8px', fontSize: 11.5, color: TONES.warn.fg, background: TONES.warn.bg, borderRadius: 8, padding: '5px 9px' }}>Written before your latest changes. Consult again to refresh it.</p>}
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, lineHeight: 1.45, color: advice.verdict === 'impossible' ? TONES.bad.fg : 'var(--ink)' }}>{advice.headline}</p>
                {advice.advice?.length > 0 && <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{advice.advice.map((a, i) => <li key={i}>{a}</li>)}</ul>}
                {advice.reroute?.length > 0 && !(advice.changes?.length > 0 && !advice.stale) && (
                  <div style={{ marginTop: 10 }}>
                    <div className="label-caps" style={{ marginBottom: 6 }}>Reroute</div>
                    {advice.reroute.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, lineHeight: 1.45, padding: '4px 0' }}>
                        <IconArrow size={13} style={{ color: 'var(--accent)', marginTop: 3 }} />
                        <span><strong style={{ fontWeight: 600 }}>{r.change}</strong>{r.why ? <span style={{ color: 'var(--ink-3)' }}> · {r.why}</span> : null}</span>
                      </div>
                    ))}
                  </div>
                )}
                {advice.changes?.length > 0 && !advice.stale && <ProposedChanges goal={goal} changes={advice.changes} onApply={onApplyChanges} />}
                {advice.unapplied?.length > 0 && !advice.stale && (
                  <div style={{ marginTop: 10 }}>
                    <div className="label-caps" style={{ marginBottom: 4 }}>Also mentioned</div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>{advice.unapplied.map((u, i) => <li key={i}>{u}</li>)}</ul>
                    <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--ink-3)' }}>Otto cannot apply these for you. Do them by hand if you agree.</p>
                  </div>
                )}
                {!advice.changes?.length && advice.suggested_target_date && advice.suggested_target_date !== goal.target && !advice.stale && (
                  <button className="btn btn--primary" style={{ marginTop: 10 }} onClick={() => onApplyDate(advice.suggested_target_date)}>Move target to {shortDate(advice.suggested_target_date)}</button>
                )}
              </section>
            )}

            <section aria-label="Detours">
              <h3 style={sectionTitle}>Detours and roadblocks</h3>
              <Detours goal={goal} today={today} onChange={onChange} />
            </section>
          </aside>
        </div>
      )}
    </div></li>
  );
}


// What the wizard proposes to change. Otto never applies any of it by itself: a small change is one press on "Apply"; a big one
// (a pivot, dropped work, a much later date) is shown in full with what would be replaced, and needs a deliberate approval.
function ProposedChanges({ goal, changes, onApply }) {
  const { minor, major } = splitByScale(changes);
  const [review, setReview] = useState(false);
  const [sure, setSure] = useState(false);
  const sum = overhaulSummary(goal, major);
  return (
    <div style={{ marginTop: 12 }}>
      <div className="label-caps" style={{ marginBottom: 6 }}>Proposed changes</div>
      <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--ink-3)' }}>These are suggestions. Nothing changes until you press a button.</p>
      {minor.map(c => (
        <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 0', borderTop: '1px solid var(--line-soft)' }}>
          <span style={{ flex: 1, fontSize: 12.5, lineHeight: 1.45 }}>{describeChange(goal, c)}{c.why && <span style={{ color: 'var(--ink-3)' }}> {c.why}</span>}</span>
          <button className="btn" style={{ height: 28, flexShrink: 0 }} onClick={() => onApply([c])}>Apply</button>
        </div>
      ))}
      {major.length > 0 && (
        <div role="group" aria-label="A big change" style={{ marginTop: 8, padding: '12px 14px', borderRadius: 12, background: '#F9EDE4', boxShadow: 'inset 0 0 0 1px #E8C0B2' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#8C4A33' }}>This changes the direction of the plan</p>
          <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>
            {major.map(c => <li key={c.id}>{describeChange(goal, c)}{c.why && <span style={{ color: 'var(--ink-3)' }}> {c.why}</span>}</li>)}
          </ul>
          {!review ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn" onClick={() => setReview(true)}>Review what would change</button>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              {sum.retitle && <p style={{ margin: '0 0 4px', fontSize: 12.5 }}><strong>New title:</strong> {sum.retitle}</p>}
              {(sum.replaced.length > 0 || sum.dropped.length > 0) && (
                <p style={{ margin: '0 0 4px', fontSize: 12.5 }}><strong>Would be removed:</strong> {[...sum.replaced, ...sum.dropped].map(m => m.title).join(', ')}</p>
              )}
              {sum.added.length > 0 && <p style={{ margin: '0 0 6px', fontSize: 12.5 }}><strong>Would be added:</strong> {sum.added.map(m => `${m.title} (${m.effort_h}h, ${m.due})`).join(', ')}</p>}
              <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--ink-3)' }}>Finished work stays. You can undo this right after.</p>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} /> I understand this changes my plan
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn--primary" disabled={!sure} onClick={() => { onApply(major); setReview(false); setSure(false); }}>Approve and apply</button>
                <button className="btn btn--ghost" onClick={() => { setReview(false); setSure(false); }}>Keep my plan</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
