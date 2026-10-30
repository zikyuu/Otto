import { useState } from 'react';
import { items as checkItems, doneCount } from './checklist.js';
import { isStale, ageLabel } from './grinderAge.js';
import { catOf } from './EventChip.jsx';
import { fmtTime, fmtDur } from './calendarUtils.js';
import { orderedChain, getLinks, ORDERED, GROUPED } from './linkUtils.js';
import { IconClose, IconGrip, IconArrow, IconCheck, IconClock, IconTarget, IconStop, IconLeaf } from './Icons.jsx';
import { SLICE_COLORS } from '../../components/PieChart.jsx';
import Gauge from '../../components/Gauge.jsx';
import { art } from '../../assets/otto/index.js';
import { sizeReason, whySession } from '../../home/planWhy.js';
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

const ART_ICON = { check: IconCheck, clock: IconClock, target: IconTarget, stop: IconStop, leaf: IconLeaf };
// the otter drawing for a reflection when it exists, otherwise a plain line icon
function Art({ name, icon, size = 30 }) {
  const a = art(name);
  if (a && !a.placeholder) return <img src={a.src} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />;
  const I = ART_ICON[icon] || IconCheck;
  return <span aria-hidden style={{ display: 'grid', placeItems: 'center', width: size, height: size, color: 'var(--ink-2)' }}><I size={Math.round(size * 0.62)} /></span>;
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
const TONES_WARN = '#8A6A2F';

function RestPrompt({ rest, onChoose }) {
  return (
    <div role="group" aria-label="Schedule the rest?" style={{ padding: 14, borderRadius: 12, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)', animation: 'popIn .5s var(--spring) both' }}>
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
              background: e.id === current ? 'var(--forest)' : e.reflection ? '#E4EAD3' : 'var(--surface-2)', color: e.id === current ? 'var(--forest-ink)' : 'var(--ink-3)',
              boxShadow: e.id === current ? 'none' : 'inset 0 0 0 1px var(--line)', transition: 'all .4s var(--ease)' }}>{i + 1}</button>
        ))}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.45 }}>Any order works. Each session keeps its own goal, so moving one earlier moves its goal with it.</p>
    </section>
  );
}

// ── checklist: a plain tick-list on the block; what is left open when it ends is offered a new slot ──────────
function Checklist({ ev, onAdd, onToggle, onRemove }) {
  const [text, setText] = useState('');
  const list = checkItems(ev);
  return (
    <section aria-label="Checklist">
      <SectionTitle right={list.length > 0 && <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{doneCount(ev)}/{list.length}</span>}>Checklist</SectionTitle>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {list.map(i => (
          <li key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button role="checkbox" aria-checked={i.done} aria-label={i.text} onClick={() => onToggle(i.id)} style={{
              width: 18, height: 18, borderRadius: 6, border: 0, cursor: 'pointer', flexShrink: 0, display: 'grid', placeItems: 'center', color: '#fff',
              background: i.done ? 'var(--accent)' : 'transparent', boxShadow: `inset 0 0 0 1.5px ${i.done ? 'var(--accent)' : 'var(--ink-4)'}`, transition: 'all .4s var(--ease)',
            }}>{i.done && <IconCheck size={11} />}</button>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: i.done ? 'var(--ink-4)' : 'var(--ink)', textDecoration: i.done ? 'line-through' : 'none' }}>{i.text}</span>
            <button className="btn btn--ghost btn--icon" aria-label={`Remove ${i.text}`} style={{ width: 22, height: 22 }} onClick={() => onRemove(i.id)}><IconClose size={10} /></button>
          </li>
        ))}
      </ul>
      <input value={text} onChange={e => setText(e.target.value)} placeholder="Add an item" aria-label="Add a checklist item"
        onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { onAdd(text); setText(''); } }}
        style={{ width: '100%', marginTop: list.length ? 8 : 0, padding: '8px 12px', borderRadius: 12, border: 0, fontFamily: 'inherit', fontSize: 12.5, color: 'var(--ink)', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)', outline: 'none' }} />
    </section>
  );
}

// ── off track: what pulled you away, and when. Feeds how long you can really focus ────────────────────────────
const REASONS = [
  ['doomscrolled', 'Doomscrolled'], ['messages', 'Messages'], ['couldnt_focus', 'Could not focus'], ['break', 'Took a break'],
  ['medical', 'Medical'], ['family', 'Family'], ['work_crisis', 'Work crisis'],
];
function OffTrack({ ev, onLog }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(null);
  const [mins, setMins] = useState(15);
  const [into, setInto] = useState('');
  const [busy, setBusy] = useState(false);
  const logged = Array.isArray(ev.off_track) ? ev.off_track : [];
  const max = ev.durationMin;
  async function save() {
    setBusy(true);
    const ok = await onLog({ reason, durationMin: mins, intoTaskMin: into === '' ? null : Math.min(Number(into), max) });
    setBusy(false);
    if (ok) { setOpen(false); setReason(null); setInto(''); setMins(15); }
  }
  return (
    <section aria-label="Went off track">
      <SectionTitle right={!open && <button className="btn btn--ghost" style={{ height: 24, padding: '0 8px', fontSize: 11.5 }} onClick={() => setOpen(true)}>Label a stretch</button>}>Off track</SectionTitle>
      {logged.length === 0 && !open && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>Lost the thread for a while? Say why. It is never held against you; it only helps Otto plan realistic stretches.</p>}
      {logged.map((l, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '2px 0' }}><span>{REASONS.find(r => r[0] === l.reason)?.[1] ?? l.reason}</span><span className="mono" style={{ color: 'var(--ink-3)' }}>{l.durationMin} min{l.intoTaskMin != null ? `, ${l.intoTaskMin} min in` : ''}</span></div>)}
      {open && (
        <div style={{ marginTop: 8 }}>
          <div role="radiogroup" aria-label="What happened" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {REASONS.map(([k, label]) => (
              <button key={k} role="radio" aria-checked={reason === k} onClick={() => setReason(k)} style={{
                border: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: '6px 11px', borderRadius: 999, color: 'var(--ink-2)',
                background: reason === k ? '#E4EAD3' : 'var(--surface-2)', boxShadow: `inset 0 0 0 ${reason === k ? 2 : 1}px ${reason === k ? 'var(--accent)' : 'var(--line)'}`, transition: 'all .4s var(--ease)',
              }}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <label style={{ flex: 1, fontSize: 11.5, color: 'var(--ink-3)' }}>For how long (min)
              <input type="number" min={5} max={600} step={5} value={mins} onChange={e => setMins(Math.max(5, Math.min(600, Number(e.target.value) || 5)))} style={fieldStyle} />
            </label>
            <label style={{ flex: 1, fontSize: 11.5, color: 'var(--ink-3)' }}>Minutes into the block
              <input type="number" min={0} max={max} step={5} value={into} placeholder="optional" onChange={e => setInto(e.target.value)} style={fieldStyle} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn--primary" disabled={!reason || busy} style={{ height: 34, padding: '0 8px 0 16px' }} onClick={save}>Log it<span className="btn__icon" style={{ width: 22, height: 22, marginRight: 0 }}><IconCheck size={11} /></span></button>
            <button className="btn btn--ghost" style={{ height: 34 }} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
const fieldStyle = { display: 'block', width: '100%', marginTop: 4, padding: '7px 10px', borderRadius: 10, border: 0, fontFamily: 'inherit', fontSize: 13, color: 'var(--ink)', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)', outline: 'none' };

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#E4EAD3' }}>
          <Art name={`reflect-${r.key}`} icon={r.icon} size={28} />
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
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 2px 6px', borderRadius: 10, border: 0, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
            background: choice === r.key ? '#E4EAD3' : 'var(--surface-2)', boxShadow: `inset 0 0 0 ${choice === r.key ? 2 : 1}px ${choice === r.key ? 'var(--accent)' : 'var(--line)'}`,
            transform: choice === r.key ? 'translateY(-2px)' : 'none', transition: 'all .5s var(--ease)',
          }}>
            <Art name={`reflect-${r.key}`} icon={r.icon} size={28} />
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
        style={{ width: '100%', marginTop: 14, padding: '10px 12px', borderRadius: 10, border: 0, resize: 'vertical', fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink)', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)', outline: 'none' }} />

      {!ask ? (
        <button className="btn btn--primary" style={{ marginTop: 12, height: 38, padding: '0 8px 0 18px' }} disabled={!choice}
          onClick={() => (rem.minutes > 0 ? setAsk(true) : (onReflect(payload(), null), setEditing(false)))}>
          Save how it went<span className="btn__icon" style={{ width: 24, height: 24, marginRight: 0 }}><IconCheck size={12} /></span>
        </button>
      ) : (
        <div role="group" aria-label="Reschedule remainder?" style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)', animation: 'popIn .5s var(--spring) both' }}>
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
  return past || checkItems(ev).length > 0 || (ev.subtasks?.length > 0) || chain.length > 1 || getLinks(events).some(l => l.type === GROUPED && (l.from === ev.id || l.to === ev.id));
}

export function EventPanel({ events, selectedId, dayLabel, dayIdx, past, started = past, onClose, onSelect, onReorder, onUnlink, onSetGoal, onResetGoals, onReflect, onRest, onChecklist, onOffTrack }) {
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
        {checkItems(ev).length > 0 && <Checklist ev={ev} onAdd={t => onChecklist('add', t)} onToggle={id => onChecklist('toggle', id)} onRemove={id => onChecklist('remove', id)} />}
        {started && !ev.fixed && <OffTrack ev={ev} onLog={onOffTrack} />}
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
export function GrinderPanel({ items, onPlace, onRemove, onClose, onKeep, onSomeday, onReopen }) {
  const open = items.filter(i => !i.someday), parked = items.filter(i => i.someday);
  const row = it => {
    const stale = isStale(it);
    return (
      <div key={it.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line-soft)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{it.title}</span>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{fmtDur(it.minutes)}</span>
        </div>
        {it.note && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.4 }}>{it.note}</p>}
        {stale && (
          <div role="group" aria-label={`Still want ${it.title}?`} style={{ margin: '8px 0 0', padding: '10px 12px', borderRadius: 10, background: '#F3E6C8', boxShadow: 'inset 0 0 0 1px #E6D3A6', animation: 'popIn .45s var(--spring) both' }}>
            <p style={{ margin: 0, fontSize: 12.5, color: '#8A6A2F', lineHeight: 1.45 }}>Parked {ageLabel(it)} ago. Still want it?</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn" style={{ height: 26, fontSize: 12 }} onClick={() => onKeep(it)}>Keep</button>
              <button className="btn" style={{ height: 26, fontSize: 12 }} onClick={() => onRemove(it)}>Delete</button>
              <button className="btn" style={{ height: 26, fontSize: 12 }} onClick={() => onSomeday(it)} title="No scheduling pressure, no more reminders">Someday</button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {it.someday
            ? <button className="btn" style={{ height: 28 }} onClick={() => onReopen(it)}>Bring it back</button>
            : <button className="btn" style={{ height: 28 }} onClick={() => onPlace(it)}>Find a slot this week</button>}
          {!stale && <button className="btn btn--ghost" style={{ height: 28 }} onClick={() => onRemove(it)}>Drop it</button>}
          {!it.someday && !stale && <span className="mono" style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 11, color: 'var(--ink-4)' }}>{ageLabel(it)}</span>}
        </div>
      </div>
    );
  };
  return (
    <Shell label="Meatball Grinder" width={344}>
      <Head title="Meatball Grinder" sub="Parked on purpose. Otto never schedules these on its own." onClose={onClose} />
      <div style={body}>
        {items.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.55 }}>Nothing parked. When a session falls short you can leave the remainder here instead of cramming it into the week.</p>}
        {open.map(row)}
        {parked.length > 0 && (
          <>
            <div className="label-caps" style={{ margin: '18px 0 2px' }}>Someday</div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--ink-3)' }}>No pressure. These stay here until you want them.</p>
            {parked.map(row)}
          </>
        )}
      </div>
    </Shell>
  );
}

// ── planning time for a goal: suggested slots, adjustable before they are committed ───────────────────
export function PlanPanel({ plan, events = [], dayLabel, clashOf, onRemove, onConfirm, onCancel, onRetry }) {
  const total = (plan.sessions || []).reduce((t, x) => t + x.durationMin, 0);
  return (
    <Shell label="Plan time" width={344}>
      <Head title={`Time for ${plan.nudge.milestone}`} sub={`${plan.nudge.goal}${plan.nudge.due ? ` · due ${new Date(plan.nudge.due + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}`} onClose={onCancel} />
      <div style={body}>
        {plan.loading && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', animation: 'ringPulse 1.1s var(--ease) infinite' }}>Looking for free time…</p>}
        {plan.error && (
          <>
            <p role="alert" style={{ margin: 0, fontSize: 13, color: '#8C4A33', lineHeight: 1.5 }}>{plan.error}</p>
            <button className="btn" style={{ marginTop: 10 }} onClick={onRetry}>Try again</button>
          </>
        )}
        {plan.sessions && (
          <>
            {plan.sessions.length > 0 && <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, padding: '8px 10px', borderRadius: 10, background: 'rgba(106,120,77,.1)' }}>{sizeReason({ sessions: plan.sessions, learned: plan.learned, category: plan.category })}</p>}
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>
              Everything else is dimmed. These are suggestions: <strong style={{ fontWeight: 600, color: 'var(--ink-2)' }}>drag a dashed block</strong> to where it suits you, then confirm.
            </p>
            {plan.sessions.length === 0 && <p style={{ margin: 0, fontSize: 13, color: '#8C4A33' }}>There is no free time before then. Cancel, clear something, and try again.</p>}
            {[...plan.sessions].sort((a, b) => a.day - b.day || a.startMin - b.startMin).map(x => {
              const clash = clashOf(x);
              return (
                <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderTop: '1px solid var(--line-soft)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{dayLabel(x.day)}</span>
                    <span className="mono" style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)' }}>{fmtTime(x.startMin)} to {fmtTime(x.startMin + x.durationMin)} · {fmtDur(x.durationMin)}</span>
                    {clash.length > 0 && <span style={{ display: 'block', fontSize: 11.5, color: '#8C4A33' }}>Overlaps {clash[0].title}</span>}
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>{whySession(x, { learned: plan.learned, events, deadline: plan.nudge.due })}</span>
                  </span>
                  <button className="btn btn--ghost btn--icon" aria-label="Remove this session" style={{ width: 26, height: 26 }} onClick={() => onRemove(x.id)}><IconClose size={11} /></button>
                </div>
              );
            })}
            <p className="mono" style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>{fmtDur(total)} of {fmtDur(plan.nudge.shortMin)} needed</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn btn--primary" disabled={plan.sessions.length === 0} style={{ padding: '0 8px 0 18px' }} onClick={onConfirm}>Book {plan.sessions.length} session{plan.sessions.length === 1 ? '' : 's'}<span className="btn__icon" style={{ width: 22, height: 22, marginRight: 0 }}><IconCheck size={12} /></span></button>
              <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>
            </div>
          </>
        )}
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

export function DiffPanel({ changes, conflicts, titles, explanation, view, setView, dayLabel, problems = [], edited = new Set(), onResetOne, onResetAll, onApply, onBack, onCancel,
  title = 'Proposed changes', variants = null, variant = null, onVariant = null, notes = null, applyLabel = 'Apply', backLabel = 'Back' }) {
  return (
    <Shell label="Proposed schedule">
      <Head title={title} sub={changes.length ? `${changes.length} event${changes.length === 1 ? '' : 's'} change` : 'Nothing needs to change'} onClose={onCancel} />
      <div style={{ padding: '12px 16px 0' }}>
        {variants ? (
          <div className="seg" role="group" aria-label="Compare plans" style={{ flexWrap: 'wrap' }}>
            <button aria-pressed={view === 'before'} onClick={() => setView('before')}>Current plan</button>
            {variants.map(v => <button key={v.key} aria-pressed={view === 'after' && variant === v.key} onClick={() => onVariant(v.key)}>{v.label}</button>)}
          </div>
        ) : (
          <div className="seg" role="group" aria-label="Compare">
            <button aria-pressed={view === 'before'} onClick={() => setView('before')}>Current</button>
            <button aria-pressed={view === 'after'} onClick={() => setView('after')}>New</button>
          </div>
        )}
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>
          {view === 'after' ? <><strong style={{ fontWeight: 600, color: 'var(--ink-2)' }}>This is a suggestion, not a verdict.</strong> Drag any block in the calendar to where you want it. Locked blocks stay put.</> : 'This is how the week looks now. Switch to the new plan to see and adjust it.'}
        </p>
        {edited.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <span style={{ flex: 1, fontSize: 12, color: 'var(--accent-ink)' }}>You moved {edited.size} block{edited.size === 1 ? '' : 's'}.</span>
            <button className="btn btn--ghost" style={{ height: 26, fontSize: 12 }} onClick={onResetAll}>Back to Otto&rsquo;s suggestion</button>
          </div>
        )}
      </div>
      <div style={body}>
        {changes.map(c => (
          <div key={c.id + c.kind} style={{ padding: '9px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>{c.title}</span>
              {edited.has(c.id) && <button className="btn btn--ghost" style={{ height: 22, fontSize: 11, padding: '0 6px' }} onClick={() => onResetOne(c.id)} title="Put it back where Otto suggested">Reset</button>}
              <span className="label-caps" style={{ fontSize: 9.5 }}>{edited.has(c.id) ? 'you placed it' : KIND_LABEL[c.kind]}</span>
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
            Couldn&rsquo;t fit cleanly: {conflicts.map(id => titles[id] || id).join(', ')}. Try dragging {conflicts.length === 1 ? 'it' : 'them'} to a free spot.
          </p>
        )}
        {problems.length > 0 && (
          <div role="alert" style={{ margin: '14px 0 0', padding: '10px 12px', borderRadius: 12, background: '#F3E6C8', color: '#8A6A2F', fontSize: 12.5, lineHeight: 1.5 }}>
            <strong style={{ fontWeight: 600 }}>Worth a look</strong>
            <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>{problems.slice(0, 5).map((p, i) => <li key={i}>{p.text}</li>)}</ul>
            <span style={{ display: 'block', marginTop: 4, fontSize: 11.5 }}>You can still apply it; this is only a heads-up.</span>
          </div>
        )}
        {view === 'after' && notes}
        {explanation && edited.size === 0 && <p style={{ margin: '14px 0 0', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>{explanation}</p>}
      </div>
      <div style={foot}>
        <button className="btn" onClick={onBack}>{backLabel}</button>
        <button className="btn btn--primary" onClick={onApply}>{edited.size > 0 ? 'Apply my version' : applyLabel}</button>
      </div>
    </Shell>
  );
}



// what a plan made elsewhere says besides the moved blocks: what it costs, what went to the Meatball Grinder, what was dropped
export function HandoffNotes({ variant, titles = {} }) {
  if (!variant) return null;
  const tone = { good: ['#E4EAD3', 'var(--accent-ink)'], warn: ['#F3E6C8', '#8A6A2F'], bad: ['#F2D9CF', '#A5543F'] };
  const dropped = (variant.dropped || []).map(id => titles[id] || id);
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(variant.warnings || []).map((w, i) => (
        <div key={i} role={w.level === 'bad' ? 'alert' : 'note'} style={{ padding: '9px 12px', borderRadius: 12, background: tone[w.level]?.[0] || tone.warn[0], color: tone[w.level]?.[1] || tone.warn[1], fontSize: 12.5, lineHeight: 1.5 }}>{w.text}</div>
      ))}
      {(variant.grinder || []).length > 0 && (
        <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          <span className="label-caps" style={{ fontSize: 9.5 }}>Goes to the Meatball Grinder</span>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>{variant.grinder.map(g => <li key={g.id}>{g.title} <span style={{ color: 'var(--ink-3)' }}>({fmtDur(g.minutes)})</span></li>)}</ul>
          <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: 'var(--ink-3)' }}>Parked on purpose; Otto never schedules these on its own.</span>
        </div>
      )}
      {dropped.length > 0 && (
        <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          <span className="label-caps" style={{ fontSize: 9.5 }}>Dropped</span>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>{dropped.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
