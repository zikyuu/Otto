import { useState } from 'react';
import { catOf } from './EventChip.jsx';
import { fmtTime, fmtDur } from './calendarUtils.js';
import { orderedChain, getLinks, ORDERED, GROUPED } from './linkUtils.js';
import { IconClose, IconGrip, IconArrow, IconCheck } from './Icons.jsx';
import { SLICE_COLORS } from '../../components/PieChart.jsx';
import Gauge from '../../components/Gauge.jsx';
import { art } from '../../assets/otto/index.js';
import { siblingsOf, displayTitle, planRows, coverage, hasCustomGoals, REFLECTIONS, remainder, reflectionRows, uncovered, restSignature, WHOLE } from './sessionGoals.js';

// every panel is a bezel: a tray (outer) holding a plate (the Panel body)
const panelShell = { width: 304, flexShrink: 0, animation: 'panelIn .7s var(--ease) both' };
const panel = { display: 'flex', flexDirection: 'column', maxHeight: 640 };
function Shell({ label, children, width }) {
  return <aside className="bezel bezel--float" style={{ ...panelShell, ...(width ? { width } : {}) }} aria-label={label}><div className="core" style={panel}>{children}</div></aside>;
}

function Head({ title, sub, onClose }) {
  return (
    <div style={{ padding: '16px 16px 12px', display: 'flex', gap: 10, alignItems: 'flex-start', borderBottom: '1px solid var(--line-soft)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.01em', lineHeight: 1.3 }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.4 }}>{sub}</div>}
      </div>
      {onClose && <button className="btn btn--ghost btn--icon" style={{ width: 26, height: 26 }} onClick={onClose} aria-label="Close"><IconClose size={12} /></button>}
    </div>
  );
}

const body = { padding: '14px 16px', overflowY: 'auto', flex: 1 };
const foot = { padding: '12px 16px', borderTop: '1px solid var(--line-soft)', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' };

function Dot({ ev }) { return <span style={{ width: 8, height: 8, borderRadius: 2, background: catOf(ev).accent, flexShrink: 0 }} />; }

// ── One panel for whatever the selected event needs ───────────────────────────────────────────
// Only the sections that apply are shown: a plain standalone event has nothing to say here, so it gets no panel at all.
//   goals       its subtasks, with a meter per subtask for how much to finish in this block
//   sessions    where this block sits among the other sessions of the same task
//   reflection  after the block has passed: how did it go, what was actually done
//   order/group links to other events

const sliceColor = i => SLICE_COLORS[i % SLICE_COLORS.length];

function Art({ name, emoji, size = 30 }) {
  const a = art(name);
  return a && !a.placeholder
    ? <img src={a.src} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />
    : <span aria-hidden style={{ fontSize: size * 0.8, lineHeight: 1 }}>{emoji}</span>;
}

function SectionTitle({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 10px' }}>
      <h3 className="label-caps" style={{ margin: 0 }}>{children}</h3>{right}
    </div>
  );
}

function GoalsSection({ ev, rows, cov, split, onSetGoal, onResetGoals }) {
  const custom = hasCustomGoals(ev);
  return (
    <section aria-label="Goal for this block">
      <SectionTitle right={custom && <button className="btn btn--ghost" style={{ height: 24, padding: '0 8px', fontSize: 11.5 }} onClick={onResetGoals}>Use Otto&rsquo;s suggestion</button>}>Goal for this block</SectionTitle>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
        {custom ? 'Your goal. Pull a meter to change how much of that subtask to finish here.'
          : 'No goal set, so the block is just time. Otto suggests this split; pull any meter, including the ones it left out, to set your own.'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {rows.map((r, i) => {
          const left = split ? 100 - (cov[r.key] ?? 0) : 0;
          return (
            <div key={r.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: sliceColor(i), flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: r.pct === 0 ? 'var(--ink-3)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{r.pct === 0 ? 'not in this block' : fmtDur(r.minutes)}</span>
                <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, width: 38, textAlign: 'right' }}>{r.pct}%</span>
              </div>
              <Gauge value={r.pct} onChange={v => onSetGoal(r.key, v)} color={sliceColor(i)} label={`Goal for ${r.name}`} />
              {split && left !== 0 && (
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: TONES_WARN, lineHeight: 1.4 }}>
                  {left > 0 ? `${left}% of this is not in any session yet.` : `Across all sessions this adds up to ${100 - left}%.`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
const TONES_WARN = '#8A5E16';

function RestPrompt({ rest, onChoose }) {
  return (
    <div role="group" aria-label="Schedule the rest?" style={{ padding: 14, borderRadius: 18, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line), 0 14px 24px -18px rgba(46,58,38,.5)', animation: 'popIn .5s var(--spring) both' }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, letterSpacing: '-.015em' }}>Schedule the rest?</p>
      <p style={{ margin: '4px 0 10px', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>
        This goal leaves about <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{fmtDur(rest.minutes)}</strong> in no block: {rest.parts.map(p => `${p.name} ${p.short}%`).join(', ')}.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button className="btn btn--primary" onClick={() => onChoose('fit')}>Yes, fit into this week</button>
        <button className="btn" onClick={() => onChoose('park')}>TBC, leave it in the Meatball Grinder</button>
      </div>
    </div>
  );
}

function SessionStrip({ sibs, current, rank, dayLabel, onSelect }) {
  return (
    <section aria-label="Sessions">
      <SectionTitle right={<span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{rank} of {sibs.length}</span>}>This task&rsquo;s sessions</SectionTitle>
      <div style={{ display: 'flex', gap: 5 }}>
        {sibs.map((e, i) => (
          <button key={e.id} onClick={() => onSelect(e.id)} aria-label={`Session ${i + 1}, ${dayLabel(e.day)} ${fmtTime(e.startMin)}`} aria-pressed={e.id === current}
            title={`${i + 1}: ${dayLabel(e.day)} ${fmtTime(e.startMin)}`}
            style={{ flex: 1, height: 26, borderRadius: 9, border: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
              background: e.id === current ? 'var(--forest)' : e.reflection ? '#DCE7CF' : 'var(--surface-2)', color: e.id === current ? 'var(--forest-ink)' : 'var(--ink-3)',
              boxShadow: e.id === current ? 'none' : 'inset 0 0 0 1px var(--line)', transition: 'all .4s var(--ease)' }}>{i + 1}</button>
        ))}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>Any order works. Each session keeps its own goal, so moving one earlier moves its goal with it.</p>
    </section>
  );
}

function Reflection({ ev, rows, onReflect }) {
  const done = ev.reflection;
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState(done?.choice ?? null);
  const [actual, setActual] = useState(() => done?.actual ?? Object.fromEntries(rows.map(r => [r.key, r.pct])));
  const [notes, setNotes] = useState(done?.notes ?? '');
  const [ask, setAsk] = useState(false);
  const rem = remainder(rows, actual);

  if (done && !editing) {
    const r = REFLECTIONS.find(x => x.key === done.choice);
    return (
      <section aria-label="How it went">
        <SectionTitle right={<button className="btn btn--ghost" style={{ height: 24, padding: '0 8px', fontSize: 11.5 }} onClick={() => setEditing(true)}>Edit</button>}>How it went</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, background: '#E4ECD6' }}>
          <Art name={`reflect-${r.key}`} emoji={r.emoji} size={28} />
          <div><div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.label}</div>
            {done.remainder && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>Remainder: {done.remainder === 'fit' ? 'fitted into this week' : 'left in the Meatball Grinder'}</div>}</div>
        </div>
        {rows.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {rows.map(x => <div key={x.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span style={{ color: 'var(--ink-2)' }}>{x.name}</span><span className="mono" style={{ color: (done.actual?.[x.key] ?? x.pct) < x.pct ? TONES_WARN : 'var(--ink-3)' }}>{done.actual?.[x.key] ?? x.pct}% of {x.pct}%</span></div>)}
          </div>
        )}
        {done.notes && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{done.notes}</p>}
      </section>
    );
  }

  const payload = () => ({ choice, actual, notes: notes.trim(), rows });
  return (
    <section aria-label="How did this session go?">
      <SectionTitle>How did this session go?</SectionTitle>
      <div role="radiogroup" aria-label="How it went" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {REFLECTIONS.map(r => (
          <button key={r.key} role="radio" aria-checked={choice === r.key} onClick={() => setChoice(r.key)} title={r.hint} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 2px 6px', borderRadius: 14, border: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
            background: choice === r.key ? '#E4ECD6' : 'var(--surface-2)', boxShadow: `inset 0 0 0 ${choice === r.key ? 2 : 1}px ${choice === r.key ? 'var(--accent)' : 'var(--line)'}`,
            transform: choice === r.key ? 'translateY(-2px)' : 'none', transition: 'all .5s var(--ease)',
          }}>
            <Art name={`reflect-${r.key}`} emoji={r.emoji} size={28} />
            <span style={{ fontSize: 9.5, fontWeight: 600, lineHeight: 1.15, textAlign: 'center', color: 'var(--ink-2)' }}>{r.label}</span>
          </button>
        ))}
      </div>

      {rows.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>{rows.length === 1 && rows[0].key === WHOLE ? 'How much of it did you get done? Pull the meter down to 0% if you did not get to it.' : 'The line is what the plan promised. Pull each meter to what you actually got done.'}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map((r, i) => (
              <div key={r.key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: sliceColor(i) }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{r.key === WHOLE ? 'planned all of it' : `planned ${r.pct}%`}</span>
                  <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, width: 38, textAlign: 'right', color: (actual[r.key] ?? r.pct) < r.pct ? TONES_WARN : 'var(--ink)' }}>{actual[r.key] ?? r.pct}%</span>
                </div>
                <Gauge value={actual[r.key] ?? r.pct} planned={r.pct} color={sliceColor(i)} label={`Achieved on ${r.name}`} onChange={v => { setActual(a => ({ ...a, [r.key]: v })); setAsk(false); }} />
              </div>
            ))}
          </div>
        </div>
      )}

      <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes" aria-label="Additional notes" rows={3}
        style={{ width: '100%', marginTop: 14, padding: '10px 12px', borderRadius: 14, border: 0, resize: 'vertical', fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink)', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)', outline: 'none' }} />

      {!ask ? (
        <button className="btn btn--primary" style={{ marginTop: 12, height: 38, padding: '0 8px 0 18px' }} disabled={!choice}
          onClick={() => (rem.minutes > 0 ? setAsk(true) : (onReflect(payload(), null), setEditing(false)))}>
          Save how it went<span className="btn__icon" style={{ width: 24, height: 24, marginRight: 0 }}><IconCheck size={12} /></span>
        </button>
      ) : (
        <div role="group" aria-label="Reschedule remainder?" style={{ marginTop: 14, padding: 14, borderRadius: 18, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line), 0 14px 24px -18px rgba(46,58,38,.5)', animation: 'popIn .5s var(--spring) both' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, letterSpacing: '-.015em' }}>Reschedule remainder?</p>
          <p style={{ margin: '4px 0 10px', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>
            About <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{fmtDur(rem.minutes)}</strong> is left: {rem.parts.map(p => `${p.name} ${p.short}%`).join(', ')}.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn btn--primary" onClick={() => { onReflect(payload(), 'fit'); setAsk(false); setEditing(false); }}>Yes, fit into this week</button>
            <button className="btn" onClick={() => { onReflect(payload(), 'park'); setAsk(false); setEditing(false); }}>TBC, leave it in the Meatball Grinder</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Links({ events, ev, chain, grouped, dayLabel, dragIdx, setDragIdx, overIdx, setOverIdx, onReorder, onUnlink }) {
  const byId = Object.fromEntries(events.map(e => [e.id, e]));
  const links = getLinks(events);
  const drop = to => {
    if (dragIdx == null || dragIdx === to) { setDragIdx(null); setOverIdx(null); return; }
    const next = [...chain]; const [m] = next.splice(dragIdx, 1); next.splice(to, 0, m);
    setDragIdx(null); setOverIdx(null); onReorder(next);
  };
  return (
    <>
      {chain.length > 1 && (
        <section aria-label="Order">
          <SectionTitle>Order</SectionTitle>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {chain.map((id, i) => {
              const e = byId[id];
              const prev = i > 0 ? links.find(l => l.type === ORDERED && l.from === chain[i - 1] && l.to === id) : null;
              return (
                <li key={id} draggable onDragStart={() => setDragIdx(i)} onDragOver={x => { x.preventDefault(); setOverIdx(i); }} onDrop={() => drop(i)} onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 8px 8px 6px', borderRadius: 10, background: id === ev.id ? 'var(--surface-2)' : 'transparent',
                    border: `1px solid ${overIdx === i && dragIdx != null ? 'var(--accent)' : id === ev.id ? 'var(--line)' : 'transparent'}`, opacity: dragIdx === i ? .4 : 1, cursor: 'grab' }}>
                  <span style={{ color: 'var(--ink-4)', display: 'flex' }} title="Drag to reorder"><IconGrip size={14} /></span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', width: 14 }}>{i + 1}</span>
                  <Dot ev={e} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{dayLabel(e.day)} {fmtTime(e.startMin)} · {fmtDur(e.durationMin)}</span>
                  </span>
                  {prev && <button className="btn btn--ghost btn--icon" style={{ width: 22, height: 22 }} aria-label="Remove order link to the step above" title="Unlink from the step above" onClick={() => onUnlink(prev)}><IconClose size={10} /></button>}
                </li>
              );
            })}
          </ol>
          <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>Steps run top to bottom. Reordering re-runs the scheduler.</p>
        </section>
      )}
      {grouped.length > 0 && (
        <section aria-label="Grouped with">
          <SectionTitle>Grouped with</SectionTitle>
          {grouped.map(({ link, ev: g }) => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' }}>
              <Dot ev={g} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{dayLabel(g.day)}</span>
              <button className="btn btn--ghost btn--icon" style={{ width: 22, height: 22 }} aria-label={`Ungroup ${g.title}`} onClick={() => onUnlink(link)}><IconClose size={10} /></button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

export function hasPanelContent(events, ev, past) {
  if (!ev) return false;
  const sibs = new Set(events.filter(e => e.split_of && e.split_of === ev.split_of).map(e => e.id));
  const chain = orderedChain(events, ev.id).filter(id => !sibs.has(id) || id === ev.id);
  return past || (ev.subtasks?.length > 0) || chain.length > 1 || getLinks(events).some(l => l.type === GROUPED && (l.from === ev.id || l.to === ev.id));
}

export function EventPanel({ events, selectedId, dayLabel, dayIdx, past, onClose, onSelect, onReorder, onUnlink, onSetGoal, onResetGoals, onReflect, onRest }) {
  const ev = events.find(e => e.id === selectedId);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  if (!ev) return null;

  const sibs = siblingsOf(events, ev, dayIdx);
  const split = sibs.length > 1;
  const rank = sibs.findIndex(e => e.id === ev.id) + 1;
  const rows = planRows(ev, events);
  const sibIds = new Set(sibs.map(e => e.id));
  const chain = orderedChain(events, ev.id).filter(id => !sibIds.has(id) || id === ev.id);
  const grouped = getLinks(events).filter(l => l.type === GROUPED && (l.from === ev.id || l.to === ev.id))
    .map(l => ({ link: l, ev: events.find(e => e.id === (l.from === ev.id ? l.to : l.from)) })).filter(x => x.ev);
  const cov = split ? coverage(events, ev, dayIdx) : {};
  const rest = !past && rows.length > 0 ? uncovered(events, ev, dayIdx) : { parts: [], minutes: 0 };
  const restOpen = rest.minutes > 0 && ev.rest?.sig !== restSignature(rest);
  const showLinks = chain.length > 1 || grouped.length > 0;

  return (
    <Shell label="Event details" width={344}>
      <Head title={displayTitle(events, ev, dayIdx)} sub={`${dayLabel(ev.day)} · ${fmtTime(ev.startMin)}-${fmtTime(ev.startMin + ev.durationMin)} · ${fmtDur(ev.durationMin)}`} onClose={onClose} />
      <div style={{ ...body, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {past && <Reflection key={`${ev.id}-${ev.reflection ? 'done' : 'open'}`} ev={ev} rows={reflectionRows(ev, events)} onReflect={onReflect} />}
        {split && <SessionStrip sibs={sibs} current={ev.id} rank={rank} dayLabel={dayLabel} onSelect={onSelect} />}
        {!past && rows.length > 0 && <GoalsSection ev={ev} rows={rows} cov={cov} split={split} onSetGoal={onSetGoal} onResetGoals={onResetGoals} />}
        {restOpen && <RestPrompt rest={rest} onChoose={a => onRest(a, rest)} />}
        {!restOpen && ev.rest?.action && rest.minutes > 0 && <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)' }}>The rest is {ev.rest.action === 'fit' ? 'scheduled in this week' : 'in the Meatball Grinder'}.</p>}
        {showLinks && <Links events={events} ev={ev} chain={chain} grouped={grouped} dayLabel={dayLabel} dragIdx={dragIdx} setDragIdx={setDragIdx} overIdx={overIdx} setOverIdx={setOverIdx} onReorder={onReorder} onUnlink={onUnlink} />}
      </div>
    </Shell>
  );
}

// ── The Meatball Grinder: what was parked on purpose, to find a slot for later ───────────────────
export function GrinderPanel({ items, onPlace, onRemove, onClose }) {
  return (
    <Shell label="Meatball Grinder" width={344}>
      <Head title="Meatball Grinder" sub="Parked on purpose. Otto never schedules these on its own." onClose={onClose} />
      <div style={body}>
        {items.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.55 }}>Nothing parked. When a session falls short you can leave the remainder here instead of cramming it into the week.</p>}
        {items.map(it => (
          <div key={it.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{it.title}</span>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{fmtDur(it.minutes)}</span>
            </div>
            {it.note && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.4 }}>{it.note}</p>}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="btn" style={{ height: 28 }} onClick={() => onPlace(it)}>Find a slot this week</button>
              <button className="btn btn--ghost" style={{ height: 28 }} onClick={() => onRemove(it)}>Drop it</button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

// ── Reschedule: events the selection only partly covers ───────────────────────────────────────
const CLIP_OPTIONS = [
  ['whole', 'Move the whole event'],
  ['cut',   'Keep the part outside, drop the rest'],
  ['split', 'Keep the part outside, move the rest'],
];

export function ClipPanel({ items, choices, setChoice, windowCount, dayLabel, busy, error, onBack, onContinue, onCancel }) {
  const clipped = items.filter(x => x.info.kind === 'clipped');
  const inside = items.filter(x => x.info.kind === 'inside');
  return (
    <Shell label="Reschedule selection">
      <Head title="Clear this time" sub={`${windowCount} window${windowCount === 1 ? '' : 's'} selected · ${items.length} event${items.length === 1 ? '' : 's'} affected`} onClose={onCancel} />
      <div style={body}>
        {items.length === 0 && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>Nothing flexible sits in that time. Locked events stay where they are.</p>}
        {inside.length > 0 && (
          <>
            <div className="label-caps" style={{ marginBottom: 6 }}>Will move</div>
            {inside.map(({ ev }) => (
              <div key={ev.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', fontSize: 12.5 }}>
                <Dot ev={ev} /><span style={{ flex: 1, fontWeight: 500 }}>{ev.title}</span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{dayLabel(ev.day)} {fmtTime(ev.startMin)}</span>
              </div>
            ))}
          </>
        )}
        {clipped.length > 0 && (
          <>
            <div className="label-caps" style={{ margin: inside.length ? '16px 0 6px' : '0 0 6px' }}>Partly covered</div>
            {clipped.map(({ ev, info }) => (
              <fieldset key={ev.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', margin: '0 0 8px' }}>
                <legend style={{ padding: '0 4px', fontSize: 12.5, fontWeight: 600 }}>{ev.title}</legend>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', margin: '-2px 0 6px' }}>
                  {fmtDur(info.lost)} of {fmtDur(ev.durationMin)} is covered
                </div>
                {CLIP_OPTIONS.map(([val, label]) => (
                  <label key={val} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '3px 0', cursor: 'pointer', color: 'var(--ink-2)' }}>
                    <input type="radio" name={`clip-${ev.id}`} checked={(choices[ev.id] || 'whole') === val}
                      onChange={() => setChoice(ev.id, val)} style={{ accentColor: 'var(--accent)' }} />
                    {label}
                  </label>
                ))}
              </fieldset>
            ))}
          </>
        )}
        {error && <p role="alert" style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--danger)', lineHeight: 1.45 }}>{error}</p>}
      </div>
      <div style={foot}>
        <button className="btn" onClick={onBack}>Edit selection</button>
        <button className="btn btn--primary" onClick={onContinue} disabled={busy}>{busy ? 'Working…' : 'Propose changes'}</button>
      </div>
    </Shell>
  );
}

// ── Reschedule: the proposed result, before applying it ───────────────────────────────────────
const KIND_LABEL = { moved: 'Moved', resized: 'Resized', added: 'New', removed: 'Removed' };

export function DiffPanel({ changes, conflicts, titles, explanation, view, setView, dayLabel, onApply, onBack, onCancel }) {
  return (
    <Shell label="Proposed schedule">
      <Head title="Proposed changes" sub={changes.length ? `${changes.length} event${changes.length === 1 ? '' : 's'} change` : 'Nothing needs to change'} onClose={onCancel} />
      <div style={{ padding: '12px 16px 0' }}>
        <div className="seg" role="group" aria-label="Compare">
          <button aria-pressed={view === 'before'} onClick={() => setView('before')}>Before</button>
          <button aria-pressed={view === 'after'} onClick={() => setView('after')}>After</button>
        </div>
      </div>
      <div style={body}>
        {changes.map(c => (
          <div key={c.id + c.kind} style={{ padding: '9px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>{c.title}</span>
              <span className="label-caps" style={{ fontSize: 9.5 }}>{KIND_LABEL[c.kind]}</span>
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {c.from && <span style={{ textDecoration: c.kind === 'removed' ? 'line-through' : 'none' }}>{dayLabel(c.from.day)} {fmtTime(c.from.startMin)}{c.kind === 'resized' ? ` · ${fmtDur(c.from.durationMin)}` : ''}</span>}
              {c.from && c.to && <IconArrow size={11} />}
              {c.to && <span style={{ color: 'var(--ink)' }}>{dayLabel(c.to.day)} {fmtTime(c.to.startMin)}{c.kind === 'resized' || c.kind === 'added' ? ` · ${fmtDur(c.to.durationMin)}` : ''}</span>}
            </div>
          </div>
        ))}
        {conflicts.length > 0 && (
          <p role="alert" style={{ margin: '14px 0 0', fontSize: 12.5, color: 'var(--danger)', lineHeight: 1.5 }}>
            Couldn&rsquo;t fit cleanly: {conflicts.map(id => titles[id] || id).join(', ')}.
          </p>
        )}
        {explanation && <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>{explanation}</p>}
      </div>
      <div style={foot}>
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn btn--primary" onClick={onApply}>Apply</button>
      </div>
    </Shell>
  );
}
