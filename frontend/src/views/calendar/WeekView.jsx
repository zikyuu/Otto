import { useState, useEffect, useRef } from 'react';
import { CATEGORY_COLORS, DEFAULT_CAT_COLOR } from '../../data/fixtures.js';
import {
  PX_PER_MIN, DAY_START, DAY_END, GRID_H, SNAP, HOURS, DOW_NAMES,
  fmtTime, snapMin, getWeekDates, weekRangeLabel,
} from './calendarUtils.js';

function cat(ev) { return CATEGORY_COLORS[ev.category] || DEFAULT_CAT_COLOR; }

function hasFixedConflict(events, excludeId, day, startMin, duration) {
  return events.some(e =>
    e.id !== excludeId &&
    e.day === day &&
    e.fixed &&
    startMin < e.startMin + e.durationMin &&
    startMin + duration > e.startMin
  );
}

// Client-side fallback scheduler — used when AI reschedule API is unavailable.
function firstFitSlot(occupied, preferredStart, duration) {
  const occ = [...occupied].sort((a, b) => a.s - b.s);
  let cur = Math.max(DAY_START, preferredStart), changed = true;
  while (changed) {
    changed = false;
    for (const { s, e } of occ) {
      if (cur < e && cur + duration > s) { cur = e; changed = true; break; }
    }
  }
  if (cur + duration <= DAY_END) return cur;
  cur = DAY_START; changed = true;
  while (changed) {
    changed = false;
    for (const { s, e } of occ) {
      if (cur < e && cur + duration > s) { cur = e; changed = true; break; }
    }
  }
  return cur + duration <= DAY_END ? cur : null;
}

function rescheduleLocal(events, pinnedIds, weekDayNums) {
  const pinned = events.filter(e => pinnedIds.includes(e.id) || e.fixed);
  const free   = events.filter(e => !pinnedIds.includes(e.id) && !e.fixed)
                        .sort((a, b) => a.startMin - b.startMin);
  const occ = {};
  weekDayNums.forEach(d => { occ[d] = []; });
  pinned.forEach(e => { if (occ[e.day] !== undefined) occ[e.day].push({ s: e.startMin, e: e.startMin + e.durationMin }); });
  const result = [...pinned];
  for (const ev of free) {
    const tryDays = [ev.day, ...weekDayNums.filter(d => d !== ev.day)];
    let placed = false;
    for (const day of tryDays) {
      const slot = firstFitSlot(occ[day] || [], ev.startMin, ev.durationMin);
      if (slot !== null) {
        occ[day].push({ s: slot, e: slot + ev.durationMin });
        result.push({ ...ev, day, startMin: slot });
        placed = true;
        break;
      }
    }
    if (!placed) result.push(ev);
  }
  return result;
}

function deriveEffortTier(m) {
  if (m < 30)  return 'low';
  if (m < 90)  return 'med';
  if (m < 180) return 'high';
  return 'deep';
}

const labelStyle = {
  fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 12,
  color: '#8C7A64', letterSpacing: '0.8px', textTransform: 'uppercase',
  marginBottom: 6, display: 'block',
};
const inputStyle = {
  width: '100%', padding: '10px 12px', marginBottom: 18,
  borderRadius: 10, border: '1.5px solid #E9DECC',
  background: '#fff', fontSize: 14, color: '#4A3526',
  fontFamily: "'Quicksand'", fontWeight: 500,
  outline: 'none', boxSizing: 'border-box',
};

// ── EventChip ─────────────────────────────────────────────────────────────────
function EventChip({ ev, draggingThis, isConflict, onPointerDown }) {
  const c = cat(ev);
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        top:    (ev.startMin - DAY_START) * PX_PER_MIN,
        left: 3, right: 3,
        height: Math.max(ev.durationMin * PX_PER_MIN - 3, 18),
        background:  isConflict ? '#FFF0EE' : c.bg,
        borderLeft: `3px solid ${isConflict ? '#D44848' : c.accent}`,
        borderRadius: 8, padding: '3px 6px',
        cursor:    ev.fixed ? 'default' : draggingThis ? 'grabbing' : 'grab',
        userSelect: 'none',
        zIndex:    draggingThis ? 1 : 3,
        opacity:   draggingThis ? 0.15 : 1,
        transition: draggingThis
          ? 'opacity .1s ease'
          : 'top .38s cubic-bezier(0.34,1.2,0.64,1), opacity .15s ease, background .3s ease',
        boxShadow: isConflict
          ? `0 0 0 1.5px ${c.accent}55`
          : draggingThis ? 'none'
          : `0 2px 8px -5px ${c.accent}66`,
        animation:  isConflict ? 'shakeWobble 0.7s ease both' : 'none',
        overflow:   'hidden',
        display:    'flex', flexDirection: 'column', justifyContent: 'flex-start',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}>
        <div style={{
          fontSize: 10, fontWeight: 800,
          color: isConflict ? '#9E2020' : c.text,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
          lineHeight: 1.2,
        }}>
          {ev.title}
        </div>
        {ev.fixed && <span style={{ fontSize: 9, flexShrink: 0, opacity: .55, lineHeight: 1 }}>🔒</span>}
      </div>
      {ev.durationMin >= 25 && (
        <div style={{ fontSize: 9, color: isConflict ? '#9E2020' : c.text, opacity: .65, marginTop: 2, lineHeight: 1 }}>
          {fmtTime(ev.startMin)}–{fmtTime(ev.startMin + ev.durationMin)}
        </div>
      )}
    </div>
  );
}

// ── WeekView ──────────────────────────────────────────────────────────────────
export default function WeekView({ weekOffset, sel, setSel, events, setEvents }) {
  const gridRef   = useRef(null);
  const scrollRef = useRef(null);
  const dragRef   = useRef(null);
  const posRef    = useRef(null);
  const eventsRef = useRef(events);
  useEffect(() => { eventsRef.current = events; }, [events]);

  const [dragPos,   setDragPos]   = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote,    setAiNote]    = useState('');
  const [conflicts, setConflicts] = useState(new Set());
  const [undoStack, setUndoStack] = useState([]);

  const [draftBlock,    setDraftBlock]    = useState(null);
  const [newTaskDraft,  setNewTaskDraft]  = useState({
    title: '', duration_planned: 60, category: 'deep_work', effort_tier: 'med',
    deadline_iso: '', non_negotiable: false,
  });

  // Derive real dates for this week
  const weekDates   = getWeekDates(weekOffset);
  const weekDayNums = weekDates.map(d => d.getDate());
  // Map dayNum → day-of-week label
  const dayLabel    = Object.fromEntries(weekDates.map((d, i) => [d.getDate(), DOW_NAMES[i]]));
  // Today's date number for highlight
  const todayNum    = new Date().getDate();

  function cancelDraft() {
    setDraftBlock(null);
    setNewTaskDraft({ title: '', duration_planned: 60, category: 'deep_work', effort_tier: 'med', deadline_iso: '', non_negotiable: false });
  }

  function commitDraft() {
    if (!draftBlock || !newTaskDraft.title.trim()) return;
    setEvents(prev => [...prev, {
      id:          'task_' + Date.now(),
      title:       newTaskDraft.title.trim(),
      day:         draftBlock.day,
      startMin:    draftBlock.startMin,
      durationMin: newTaskDraft.duration_planned,
      category:    newTaskDraft.category,
      fixed:       false,
    }]);
    cancelDraft();
  }

  useEffect(() => {
    if (conflicts.size === 0) return;
    const t = setTimeout(() => setConflicts(new Set()), 1400);
    return () => clearTimeout(t);
  }, [conflicts]);

  async function callAiReschedule(postDragEvents, pinnedId) {
    setAiLoading(true); setAiNote('');
    try {
      const res = await fetch('/api/ai/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: postDragEvents, pinned_ids: [pinnedId] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.events || data.events.length !== postDragEvents.length)
        throw new Error(`AI returned ${data.events?.length ?? 0} events, expected ${postDragEvents.length}`);
      setEvents(data.events);
      setConflicts(new Set(data.conflicts || []));
      setAiNote('✦ ' + (data.explanation || 'Schedule optimised by AI.'));
    } catch (err) {
      console.warn('[AI reschedule] failed, using local fallback:', err.message);
      setEvents(rescheduleLocal(postDragEvents, [pinnedId], weekDayNums));
      setAiNote('⚠ AI unavailable — used basic conflict resolution. (' + err.message + ')');
    } finally {
      setAiLoading(false);
    }
  }

  useEffect(() => {
    let rafId;
    function onMove(e) {
      if (!dragRef.current || !gridRef.current) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const dr  = dragRef.current;
        if (!dr) return;
        const rect      = gridRef.current.getBoundingClientRect();
        const scrollTop = scrollRef.current?.scrollTop || 0;
        const colW      = rect.width / 7;
        const colIdx    = Math.max(0, Math.min(6, Math.floor((e.clientX - rect.left) / colW)));
        const day       = weekDayNums[colIdx];
        const relY      = e.clientY - rect.top + scrollTop - dr.grabOffsetY;
        const clamped   = Math.max(DAY_START, Math.min(DAY_END - dr.duration, snapMin(DAY_START + relY / PX_PER_MIN)));
        const blocked   = hasFixedConflict(eventsRef.current, dr.id, day, clamped, dr.duration);
        const prev      = posRef.current;
        if (!prev || prev.day !== day || prev.startMin !== clamped || prev.blocked !== blocked) {
          posRef.current = { day, startMin: clamped, blocked };
          setDragPos({ day, startMin: clamped, blocked });
        }
      });
    }
    function onUp() {
      cancelAnimationFrame(rafId);
      const dr  = dragRef.current;
      const pos = posRef.current;
      if (dr && pos) {
        if (pos.blocked) {
          dragRef.current = null; posRef.current = null; setDragPos(null);
          return;
        }
        if (pos.day !== dr.origDay || pos.startMin !== dr.origStart) {
          setUndoStack(prev => [...prev.slice(-4), { events: [...eventsRef.current], dragId: dr.id }]);
          const postDrag = eventsRef.current.map(x =>
            x.id === dr.id ? { ...x, day: pos.day, startMin: pos.startMin } : x
          );
          callAiReschedule(postDrag, dr.id);
        }
      }
      dragRef.current = null; posRef.current = null; setDragPos(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
    };
  }, [weekDayNums.join(',')]); // re-bind when week changes

  function startDrag(e, ev) {
    if (ev.fixed) return;
    e.preventDefault();
    if (!gridRef.current) return;
    const rect        = gridRef.current.getBoundingClientRect();
    const scrollTop   = scrollRef.current?.scrollTop || 0;
    const grabOffsetY = (e.clientY - rect.top + scrollTop) - (ev.startMin - DAY_START) * PX_PER_MIN;
    dragRef.current   = { id: ev.id, grabOffsetY, duration: ev.durationMin, origDay: ev.day, origStart: ev.startMin };
    posRef.current    = { day: ev.day, startMin: ev.startMin };
    setDragPos({ day: ev.day, startMin: ev.startMin });
  }

  function handleUndo() {
    if (undoStack.length === 0) return;
    const top = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setEvents(top.events);
    setAiNote('');
    if (top.dragId) setConflicts(new Set([top.dragId]));
  }

  const byDay = {};
  weekDayNums.forEach(d => { byDay[d] = []; });
  events.forEach(ev => { if (byDay[ev.day] !== undefined) byDay[ev.day].push(ev); });

  const activeCats = [...new Set(events.map(e => e.category))];

  return (
    <>
      {/* AI note banner */}
      {aiNote && !aiLoading && (
        <div style={{
          background: aiNote.startsWith('⚠') ? '#FBEFD9' : '#F5EEE1',
          border: `1px solid ${aiNote.startsWith('⚠') ? '#F3DCB0' : '#ECE3D4'}`,
          borderRadius: 14, padding: '10px 16px', marginBottom: 14,
          fontSize: 12, color: aiNote.startsWith('⚠') ? '#9A6B1E' : '#8A5A2E',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{aiNote}</span>
          <span onClick={() => setAiNote('')} style={{ cursor: 'pointer', color: '#AD9B84', fontSize: 14, marginLeft: 12 }}>×</span>
        </div>
      )}

      {/* Undo + AI spinner row */}
      {(undoStack.length > 0 || aiLoading) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {undoStack.length > 0 && !aiLoading && (
            <button onClick={handleUndo} style={{
              padding: '8px 16px', borderRadius: 999, border: '1.5px solid #ECE3D4',
              background: '#fff', color: '#8A5A2E', fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 13,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 8px -4px rgba(74,54,38,.2)',
            }}>↩ Undo</button>
          )}
          {aiLoading && (
            <span style={{ fontSize: 12, color: '#AD9B84', fontStyle: 'italic', animation: 'ringPulse 1.1s ease infinite' }}>
              AI rescheduling…
            </span>
          )}
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #ECE3D4', borderRadius: 22, overflow: 'hidden', boxShadow: '0 12px 30px -22px rgba(74,54,38,.5)' }}>

        {/* Category legend */}
        <div style={{ display: 'flex', gap: 10, padding: '10px 16px 8px', borderBottom: '1px solid #F0E8DC', flexWrap: 'wrap', alignItems: 'center' }}>
          {activeCats.map(c => {
            const s = CATEGORY_COLORS[c] || DEFAULT_CAT_COLOR;
            return (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: s.bg, border: `1.5px solid ${s.accent}`, display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#8C7A64' }}>{s.label}</span>
              </div>
            );
          })}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 13 }}>🔒</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#8C7A64' }}>= locked</span>
          </div>
        </div>

        {/* Day header row */}
        <div style={{ display: 'flex', borderBottom: '1px solid #ECE3D4' }}>
          <div style={{ width: 48, flexShrink: 0 }} />
          {weekDates.map(date => {
            const num = date.getDate();
            const isToday = num === todayNum && weekOffset === 0;
            return (
              <div key={num} onClick={() => setSel(num)} style={{
                flex: 1, textAlign: 'center', padding: '10px 4px 8px', cursor: 'pointer',
                borderLeft: '1px solid #ECE3D4',
                background: isToday ? '#F5EEE1' : 'transparent',
              }}>
                <div style={{ fontWeight: 700, fontSize: 10, color: '#B6A48C', letterSpacing: '1px' }}>{dayLabel[num].toUpperCase()}</div>
                <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 18, color: num === sel ? '#A8703E' : '#4A3526', marginTop: 2 }}>{num}</div>
              </div>
            );
          })}
        </div>

        {/* Scrollable time body */}
        <div ref={scrollRef} style={{ overflowY: 'auto', height: 500 }}>
          <div style={{ display: 'flex' }}>
            {/* Hour gutter */}
            <div style={{ width: 48, flexShrink: 0, position: 'relative', height: GRID_H }}>
              {HOURS.map(h => (
                <div key={h} style={{ position: 'absolute', top: (h * 60 - DAY_START) * PX_PER_MIN - 7, right: 8, fontSize: 10, fontWeight: 700, color: '#C4B49C' }}>{h}:00</div>
              ))}
            </div>

            {/* Grid */}
            <div ref={gridRef} style={{ flex: 1, position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', height: GRID_H }}>
              {HOURS.map(h => (
                <div key={h} style={{ position: 'absolute', top: (h * 60 - DAY_START) * PX_PER_MIN, left: 0, right: 0, height: 1, background: '#ECE3D4', zIndex: 0 }} />
              ))}
              {HOURS.flatMap(h => [15, 30, 45].map(m => (
                <div key={`${h}${m}`} style={{ position: 'absolute', top: ((h * 60 + m) - DAY_START) * PX_PER_MIN, left: 0, right: 0, height: 1, background: '#F3EDE2', zIndex: 0 }} />
              )))}

              {weekDayNums.map(day => {
                const isToday = day === todayNum && weekOffset === 0;
                return (
                  <div key={day} onClick={e => {
                    if (dragRef.current) return;
                    const rect      = gridRef.current.getBoundingClientRect();
                    const scrollTop = scrollRef.current?.scrollTop || 0;
                    const relY      = e.clientY - rect.top + scrollTop;
                    const clickedMin = snapMin(DAY_START + relY / PX_PER_MIN);
                    setDraftBlock({ day, startMin: Math.min(clickedMin, DAY_END - 60) });
                  }} style={{
                    height: GRID_H, borderLeft: '1px solid #ECE3D4', position: 'relative',
                    background: dragPos?.day === day ? 'rgba(168,112,62,.04)' : isToday ? 'rgba(245,238,225,.35)' : 'transparent',
                    transition: 'background .15s ease',
                    cursor: 'crosshair',
                  }}>
                    {dragPos?.day === day && (
                      <div style={{
                        position: 'absolute',
                        top: (dragPos.startMin - DAY_START) * PX_PER_MIN,
                        left: 2, right: 2, height: 2, borderRadius: 2, zIndex: 5,
                        background: dragPos.blocked ? '#D44848' : '#A8703E',
                        opacity: dragPos.blocked ? .7 : .4,
                      }} />
                    )}
                    {byDay[day].map(ev => (
                      <EventChip
                        key={ev.id}
                        ev={ev}
                        draggingThis={dragRef.current?.id === ev.id}
                        isConflict={conflicts.has(ev.id)}
                        onPointerDown={e => { e.stopPropagation(); startDrag(e, ev); }}
                      />
                    ))}
                    {draftBlock?.day === day && (
                      <div style={{
                        position: 'absolute',
                        top: (draftBlock.startMin - DAY_START) * PX_PER_MIN,
                        left: 3, right: 3,
                        height: newTaskDraft.duration_planned * PX_PER_MIN - 3,
                        background: '#F2E6D4', border: '2px dashed #A8703E',
                        borderRadius: 8, pointerEvents: 'none',
                        display: 'flex', alignItems: 'flex-start',
                        padding: '4px 7px', overflow: 'hidden',
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#A8703E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {newTaskDraft.title || 'New task…'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Drag ghost */}
              {dragPos && dragRef.current && (() => {
                const dr = dragRef.current;
                const ev = events.find(x => x.id === dr.id);
                if (!ev) return null;
                const c       = cat(ev);
                const ci      = weekDayNums.indexOf(dragPos.day);
                const pct     = 100 / 7;
                const blocked = dragPos.blocked;
                return (
                  <div style={{
                    position: 'absolute',
                    top:    (dragPos.startMin - DAY_START) * PX_PER_MIN,
                    left:   `calc(${ci * pct}% + 3px)`,
                    width:  `calc(${pct}% - 6px)`,
                    height: dr.duration * PX_PER_MIN - 3,
                    background: blocked ? '#D44848' : c.accent,
                    borderRadius: 8, opacity: blocked ? .75 : .9,
                    pointerEvents: 'none', zIndex: 20,
                    padding: '5px 8px',
                    boxShadow: blocked
                      ? '0 0 0 2px #D4484888, 0 8px 20px -8px #D4484866'
                      : `0 10px 24px -8px ${c.accent}88`,
                    color: '#fff', overflow: 'hidden',
                    transition: 'background .12s ease, box-shadow .12s ease',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {blocked && <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>✕</span>}
                      <div style={{ fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
                    </div>
                    <div style={{ fontSize: 10, marginTop: 2, opacity: .85 }}>
                      {blocked ? 'Blocked — fixed event here' : `${fmtTime(dragPos.startMin)} · ${dr.duration}m`}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#AD9B84', fontStyle: 'italic', padding: '7px 0 9px', borderTop: '1px solid #F0E8DC' }}>
          drag flexible events · AI rearranges the rest · 🔒 locked events stay fixed
        </div>
      </div>

      {/* Slide-in task creation panel */}
      {draftBlock && (
        <>
          <div onClick={cancelDraft} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(74,53,38,.18)' }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0,
            width: 360, zIndex: 50,
            background: '#FBF8F4', borderLeft: '1px solid #E9DECC',
            boxShadow: '-20px 0 60px -20px rgba(74,53,38,.25)',
            display: 'flex', flexDirection: 'column',
            animation: 'slideInRight .22s ease',
            padding: '32px 28px', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
              <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 20, color: '#4A3526' }}>New Task</div>
              <div onClick={cancelDraft} style={{ cursor: 'pointer', fontSize: 20, color: '#AD9B84', lineHeight: 1 }}>×</div>
            </div>

            <label style={labelStyle}>Task name</label>
            <input autoFocus type="text" value={newTaskDraft.title}
              onChange={e => setNewTaskDraft(d => ({ ...d, title: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') commitDraft(); if (e.key === 'Escape') cancelDraft(); }}
              placeholder="What do you need to do?" style={inputStyle}
            />

            <label style={labelStyle}>Duration (minutes)</label>
            <input type="number" min={5} max={480} value={newTaskDraft.duration_planned}
              onChange={e => {
                const m = Number(e.target.value);
                setNewTaskDraft(d => ({ ...d, duration_planned: m, effort_tier: deriveEffortTier(m) }));
              }} style={inputStyle}
            />
            <div style={{ fontSize: 11, color: '#AD9B84', marginTop: -10, marginBottom: 18 }}>
              Effort: <strong style={{ color: '#8C7A64' }}>{newTaskDraft.effort_tier}</strong>
            </div>

            <label style={labelStyle}>Category</label>
            <select value={newTaskDraft.category}
              onChange={e => setNewTaskDraft(d => ({ ...d, category: e.target.value }))}
              style={inputStyle}
            >
              <option value="deep_work">Deep Work</option>
              <option value="admin">Admin</option>
              <option value="creative">Creative</option>
              <option value="physical">Physical</option>
              <option value="social">Social</option>
            </select>

            <label style={labelStyle}>Deadline (optional)</label>
            <input type="date" value={newTaskDraft.deadline_iso}
              onChange={e => setNewTaskDraft(d => ({ ...d, deadline_iso: e.target.value }))}
              style={inputStyle}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
              <input type="checkbox" id="nn" checked={newTaskDraft.non_negotiable}
                onChange={e => setNewTaskDraft(d => ({ ...d, non_negotiable: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#A8703E' }}
              />
              <label htmlFor="nn" style={{ fontFamily: "'Quicksand'", fontWeight: 600, fontSize: 14, color: '#4A3526', cursor: 'pointer' }}>
                Non-negotiable
              </label>
            </div>

            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 12, color: '#AD9B84', marginBottom: 14, textAlign: 'center' }}>
              {dayLabel[draftBlock.day]}, {fmtTime(draftBlock.startMin)} — {fmtTime(draftBlock.startMin + newTaskDraft.duration_planned)}
            </div>

            <button onClick={commitDraft} disabled={!newTaskDraft.title.trim()} style={{
              width: '100%', padding: '14px', borderRadius: 14, marginBottom: 10,
              background: newTaskDraft.title.trim() ? 'linear-gradient(135deg,#C0894F,#A8703E)' : '#E9DECC',
              color: newTaskDraft.title.trim() ? '#fff' : '#AD9B84',
              fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 15,
              border: 'none', cursor: newTaskDraft.title.trim() ? 'pointer' : 'default',
              boxShadow: newTaskDraft.title.trim() ? '0 8px 20px -8px rgba(150,108,64,.5)' : 'none',
              transition: 'all .2s ease',
            }}>Add to Calendar</button>
            <button onClick={cancelDraft} style={{
              width: '100%', padding: '11px', borderRadius: 14,
              background: 'transparent', color: '#AD9B84',
              fontFamily: "'Quicksand'", fontWeight: 600, fontSize: 14,
              border: '1.5px solid #E9DECC', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </>
      )}
    </>
  );
}
