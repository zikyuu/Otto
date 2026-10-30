import { useState } from 'react';
import { radarTone } from '../home/radar.js';
import { QUICK, quickReflection } from '../home/wrapUp.js';
import { planItems, isDone, isMissed } from '../home/today.js';
import { sendReflection } from '../api.js';
import { fmtDur, fmtTime } from '../views/calendar/calendarUtils.js';
import { IconWarn, IconArrow, IconSparkle, IconFlag, IconSteps, IconTarget, IconCheck, IconPlus, IconClose, IconClock } from '../views/calendar/Icons.jsx';

function Card({ title, icon, right, tone, i = 4, children, label }) {
  return (
    <section className="bezel rise" style={{ '--i': i }} aria-label={label || title}>
      <div className="core" style={{ background: tone }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px 4px' }}>
          {icon}<h2 style={{ margin: 0, fontSize: 17, flex: 1 }}>{title}</h2>{right}
        </header>
        <div style={{ padding: '4px 20px 16px' }}>{children}</div>
      </div>
    </section>
  );
}

const TONE = { overdue: ['#F3DDD2', '#8C4A33'], soon: ['#F3E6C8', '#8A6A2F'], later: ['#E4EAD3', '#4E5C36'] };
const when = d => (d < 0 ? (d === -1 ? 'yesterday' : `${-d}d overdue`) : d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d}d`);
const KIND = { event: 'Event', milestone: 'Goal', reminder: 'Reminder' };

// ── today's schedule, as a line inside the welcome banner ───────────────────────────────────────────
export function TodayLine({ s, freeMin }) {
  const n = (v, one, many) => `${v} ${v === 1 ? one : many}`;
  return (
    <div aria-label="Today's schedule" style={{ marginTop: 16, maxWidth: 'min(640px, 62%)' }}>
      <p className="label-caps" style={{ margin: 0 }}>Today's schedule</p>
      <p className="display" style={{ margin: '3px 0 0', fontSize: 21, lineHeight: 1.25 }}>
        {n(s.events, 'event', 'events')}<span style={{ color: 'var(--ink-4)' }}> · </span>{n(s.tasks, 'task', 'tasks')}<span style={{ color: 'var(--ink-4)' }}> · </span>
        <span style={{ color: s.hard ? '#8C4A33' : undefined }}>{n(s.hard, 'hard deadline', 'hard deadlines')}</span>
        {s.overdue > 0 && <span className="pill-tag" style={{ marginLeft: 10, verticalAlign: 'middle', background: '#F3DDD2', color: '#8C4A33', textTransform: 'none', letterSpacing: 0 }}>{s.overdue} overdue</span>}
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        {s.upcoming.length === 0 && <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>Nothing else on the calendar today.</span>}
        {s.upcoming.map(e => (
          <span key={e.id} className="pill-tag" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12, padding: '3px 10px', background: 'rgba(251,247,236,.85)' }}>
            <span className="mono" style={{ marginRight: 6, color: 'var(--ink-3)' }}>{fmtTime(e.startMin)}</span>{e.title.replace(/ \(\d+\/\d+\)$/, '')}
          </span>
        ))}
        <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{Math.round((freeMin / 60) * 10) / 10}h free</span>
      </div>
    </div>
  );
}

// ── today: one list. The current block is highlighted with its plan; the rest show a name until clicked ───────
//   items   today's blocks in time order    cur   the current block's id (or null)
//   Missed (time passed, not ticked) is struck through in red; ticked is struck through in grey.
export function DayList({ items, curId, curState, nowMin, onToggleDone, onTickItem, actions }) {
  const [open, setOpen] = useState(() => new Set());
  const flip = id => setOpen(o => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <section className="bezel rise" style={{ '--i': 2 }} aria-label="Today">
      <div className="core">
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '16px 20px 8px', flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Today, in order</h2>{actions}
        </header>
        <div style={{ padding: '2px 12px 14px' }}>
          {items.length === 0 && <p style={{ margin: '8px 8px 4px', fontSize: 14, color: 'var(--ink-3)' }}>Nothing on the calendar today. Rest counts.</p>}
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {items.map(e => {
              const done = isDone(e), missed = isMissed(e, nowMin), current = e.id === curId, expanded = current || open.has(e.id);
              const plan = planItems(e);
              const hasDetail = plan.length > 0 || e.description;
              return (
                <li key={e.id} style={{ borderTop: '1px solid var(--line-soft)', margin: current ? '6px 0' : 0, borderRadius: current ? 14 : 0, border: current ? 0 : undefined, background: current ? '#F3E6A8' : 'transparent', boxShadow: current ? '0 1px 2px rgba(32,40,8,.1), 0 12px 20px -14px rgba(32,40,8,.45)' : 'none', transition: 'background .3s var(--ease)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: current ? '12px 12px' : '11px 8px' }}>
                    <button role="checkbox" aria-checked={done} aria-label={`Mark ${e.title} done`} onClick={() => onToggleDone(e.id, e)} style={{
                      width: 24, height: 24, borderRadius: 8, border: 0, cursor: 'pointer', flex: '0 0 auto', display: 'grid', placeItems: 'center', color: '#fff',
                      background: done ? 'var(--dingley)' : 'transparent', boxShadow: `inset 0 0 0 2px ${done ? 'var(--dingley)' : missed ? '#C4866D' : current ? '#7A5A1E' : 'var(--ink-4)'}`,
                    }}>{done && <IconCheck size={14} />}</button>
                    <button onClick={() => !current && hasDetail && flip(e.id)} aria-expanded={expanded} style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', padding: 0, textAlign: 'left', color: 'inherit', cursor: !current && hasDetail ? 'pointer' : 'default' }}>
                      <span className="display" style={{
                        display: 'block', fontSize: current ? 19 : 16, fontWeight: current ? 600 : 500,
                        color: missed ? '#A5543F' : done ? 'var(--ink-4)' : current ? '#4A3A0C' : 'var(--ink)',
                        textDecoration: missed || done ? 'line-through' : 'none', textDecorationColor: missed ? '#C4866D' : undefined, textDecorationThickness: missed ? 2 : undefined,
                      }}>{e.title.replace(/ \(\d+\/\d+\)$/, '')}</span>
                      <span style={{ display: 'block', fontSize: 12.5, color: current ? '#7A5A1E' : 'var(--ink-3)', marginTop: 1 }}>
                        {fmtTime(e.startMin)} to {fmtTime(e.startMin + e.durationMin)} · {fmtDur(e.durationMin)}{e.fixed ? ' · locked' : ''}{missed ? ' · missed' : ''}
                      </span>
                    </button>
                    {current && <span className="pill-tag" style={{ background: 'rgba(122,90,30,.16)', color: '#7A5A1E' }}>{curState === 'now' ? 'now' : 'up next'}</span>}
                    {!current && hasDetail && <span aria-hidden style={{ color: 'var(--ink-4)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .3s var(--ease)' }}><IconArrow size={13} /></span>}
                  </div>
                  {expanded && (hasDetail || current) && (
                    <div style={{ padding: current ? '0 14px 14px 48px' : '0 12px 12px 44px' }}>
                      {e.description && <p style={{ margin: '0 0 8px', fontSize: 13.5, color: current ? '#5C4A12' : 'var(--ink-2)', lineHeight: 1.5 }}>{e.description}</p>}
                      {plan.length > 0 ? (
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {plan.map(i => (
                            <li key={i.id}>
                              <button role="checkbox" aria-checked={i.done} onClick={() => onTickItem(e.id, i)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', border: 0, background: 'transparent', cursor: 'pointer', padding: 0, textAlign: 'left', color: 'inherit', fontSize: 14, opacity: i.done ? .6 : 1 }}>
                                <span style={{ width: 17, height: 17, borderRadius: 6, display: 'grid', placeItems: 'center', boxShadow: `inset 0 0 0 1.5px ${current ? '#7A5A1E' : 'var(--ink-4)'}`, background: i.done ? (current ? '#7A5A1E' : 'var(--dingley)') : 'transparent', color: '#fff', flexShrink: 0 }}>{i.done && <IconCheck size={11} />}</span>
                                <span style={{ flex: 1, textDecoration: i.done ? 'line-through' : 'none' }}>{i.text}</span>
                                {i.minutes != null && <span className="mono" style={{ fontSize: 12, color: current ? '#7A5A1E' : 'var(--ink-3)' }}>{fmtDur(i.minutes)}</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (!e.description && <p style={{ margin: 0, fontSize: 13, color: current ? '#7A5A1E' : 'var(--ink-3)' }}>No steps planned. One block, one job.</p>)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ── deadline radar ──────────────────────────────────────────────────────────────────────────────────
export function RadarCard({ rows }) {
  return (
    <Card title="Deadline radar" icon={<IconFlag size={15} style={{ color: 'var(--ink-3)' }} />} i={6}>
      {rows.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-3)' }}>Nothing has a date on it. Calm.</p>}
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {rows.map(r => {
          const [bg, fg] = TONE[radarTone(r.days)];
          return (
            <li key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line-soft)' }}>
              <span className="pill-tag" style={{ background: bg, color: fg, textTransform: 'none', letterSpacing: 0, fontSize: 12, minWidth: 74, justifyContent: 'center' }}>{when(r.days)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)' }}>{KIND[r.kind]} · {r.sub}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ── end of day ──────────────────────────────────────────────────────────────────────────────────────
export function WrapUpCard({ w, setEvents }) {
  function answer(ev, choice) {
    const { reflection, actualMin } = quickReflection(ev, choice);
    setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, planned_min: e.planned_min ?? e.durationMin, actual_min: actualMin, reflection } : e)));
    sendReflection({ taskId: ev.id, choice, plannedMinutes: ev.durationMin, actualMinutes: actualMin, category: ev.category }).catch(() => {});
  }
  return (
    <Card title="Wrap up the day" icon={<IconClock size={15} style={{ color: 'var(--dingley)' }} />} tone="#F6EFE0" i={4}>
      <p style={{ margin: '0 0 8px', fontSize: 13.5, color: 'var(--ink-2)' }}>
        {w.doneTasks} task{w.doneTasks === 1 ? '' : 's'} ticked off{w.openTasks.length ? `, ${w.openTasks.length} still open` : ''}.
        {w.tomorrowFirst ? ` Tomorrow starts with ${w.tomorrowFirst.title} at ${fmtTime(w.tomorrowFirst.startMin)}.` : ''}
      </p>
      {w.unreflected.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--accent-ink)' }}>Every block today has been told how it went. Done for the day.</p>}
      {w.unreflected.map(ev => (
        <div key={ev.id} style={{ padding: '8px 0', borderTop: '1px solid var(--line-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span>{ev.title}</span><span className="mono" style={{ color: 'var(--ink-3)', fontSize: 12 }}>{fmtDur(ev.durationMin)}</span></div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {QUICK.map(q => <button key={q.choice} className="btn" style={{ height: 28, fontSize: 12.5, padding: '0 12px' }} onClick={() => answer(ev, q.choice)}>{q.label}</button>)}
          </div>
        </div>
      ))}
    </Card>
  );
}

// ── goals: the ones that need a look, or a calm "all on track" ───────────────────────────────────────
// how urgent: one warning sign (yellow) is slightly behind, three (red) is severely behind or out of reach
const SEVERITY = {
  1: { c: '#B98C1D', bg: '#F6EBC2', fg: '#7A5A1E', word: 'Slightly behind' },
  2: { c: '#C4803A', bg: '#F4D9B8', fg: '#8A4B16', word: 'Clearly behind' },
  3: { c: '#B4463A', bg: '#B4463A', fg: '#FFFFFF', word: 'Severely behind' },
};
const TONE_BG = { bad: ['#F3DDD2', '#8C4A33'], warn: ['#F3E6C8', '#8A6A2F'], good: ['#E4EAD3', '#4E5C36'] };
export function GoalsAttentionCard({ items, goalCount, onPlan, onOpenGoals }) {
  const ok = items.length === 0;
  return (
    <Card title={ok ? 'All goals on track' : 'These goals need attention'} icon={ok ? <IconCheck size={15} style={{ color: 'var(--dingley)' }} /> : <IconTarget size={15} style={{ color: '#8C4A33' }} />}
      tone={ok ? '#EEF1E0' : '#F9EDE4'} i={7}
      right={<button className="btn btn--ghost" style={{ height: 26, fontSize: 12.5 }} onClick={onOpenGoals}>Goals<IconArrow size={11} /></button>}>
      {ok && <p style={{ margin: '2px 0 0', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{goalCount ? `${goalCount} goal${goalCount === 1 ? ' is' : 's are'} where the plan said they would be, and the next milestones have time booked. Nothing to do here.` : 'No goals yet. Add one in Goals and Otto will keep an eye on it.'}</p>}
      {items.map(g => {
        const [bg, fg] = TONE_BG[g.tone] || TONE_BG.warn;
        return (
          <div key={g.goalId} style={{ padding: '9px 0', borderTop: '1px solid var(--line-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong className="display" style={{ fontWeight: 600, fontSize: 14.5, flex: 1, minWidth: 0 }}>{g.title}</strong>
              {g.severity > 0 && (
                <span title={SEVERITY[g.severity].word} aria-label={`${SEVERITY[g.severity].word}: ${g.severity} of 3`} style={{ display: 'inline-flex', gap: 1, color: SEVERITY[g.severity].c }}>
                  {Array.from({ length: g.severity }, (_, i) => <IconWarn key={i} size={14} />)}
                </span>
              )}
              {g.status !== 'on_track' && g.status !== 'ahead' && <span className="pill-tag" style={{ background: bg, color: fg, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>{g.label}</span>}
            </div>
            {g.reason && <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>{g.reason}</p>}
            {!g.nudge && (
              <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>
                Enough time is already booked for the next step, so more calendar time will not fix this one. <button className="btn btn--ghost" style={{ height: 'auto', padding: 0, textDecoration: 'underline', color: 'var(--accent-ink)' }} onClick={onOpenGoals}>Ask the wizard in Goals</button>
              </p>
            )}
            {g.nudge && (
              <>
                <p style={{ margin: '3px 0 7px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>
                  {g.nudge.catchUp
                    ? <>To get back on plan you need about {fmtDur(g.nudge.needMin)} on <strong style={{ fontWeight: 600 }}>{g.nudge.milestone}</strong>; {g.nudge.bookedMin ? `${fmtDur(g.nudge.bookedMin)} is booked` : 'nothing is booked'}.</>
                    : <><strong style={{ fontWeight: 600 }}>{g.nudge.milestone}</strong> is due {g.nudge.days < 0 ? `${-g.nudge.days} days ago` : g.nudge.days === 0 ? 'today' : `in ${g.nudge.days} days`}: it needs about {fmtDur(g.nudge.needMin)} and {g.nudge.bookedMin ? `${fmtDur(g.nudge.bookedMin)} is booked` : 'nothing is booked'}.</>}
                </p>
                <button className="btn" onClick={() => onPlan(g.nudge)}
                  style={{ height: 28, fontSize: 12.5, padding: '0 8px 0 14px', border: 0, background: SEVERITY[g.severity]?.bg ?? 'var(--forest)', color: SEVERITY[g.severity]?.fg ?? '#fff', boxShadow: g.severity === 3 ? '0 2px 0 #8C2F26' : 'none' }}>
                  Find {fmtDur(g.nudge.shortMin)} in the calendar<span className="btn__icon" style={{ width: 18, height: 18, marginRight: 0 }}><IconArrow size={10} /></span>
                </button>
              </>
            )}
          </div>
        );
      })}
    </Card>
  );
}
