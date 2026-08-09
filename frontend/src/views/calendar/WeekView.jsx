import { useState, useEffect, useRef } from 'react';
import { CATEGORY_COLORS, DEFAULT_CAT_COLOR } from '../../data/fixtures.js';
import {
  PX_PER_MIN, DAY_START, DAY_END, GRID_H, HOURS, DOW_NAMES,
  fmtTime, snapMin, getWeekDates,
} from './calendarUtils.js';
import { useDragResize } from './useDragResize.js';
import EventCreation from './EventCreation.jsx';
import DeleteButton from '../../components/DeleteButton.jsx';

function cat(ev) { return CATEGORY_COLORS[ev.category] || DEFAULT_CAT_COLOR; }


// ── DraftGhost ────────────────────────────────────────────────────────────────
function DraftGhost({ draftBlock, newTaskDraft, onCancel, startDraftResize, startDraftMove }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onPointerDown={e => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        top: (draftBlock.startMin - DAY_START) * PX_PER_MIN,
        left: 3, right: 3,
        height: newTaskDraft.duration_planned * PX_PER_MIN - 3,
        background: '#F2E6D4', border: '2px dashed #A8703E',
        borderRadius: 8, overflow: 'visible', zIndex: 10,
        display: 'flex', alignItems: 'flex-start',
        padding: '4px 7px',
      }}
    >
      <DeleteButton visible={hovered} onDelete={onCancel} />

      {/* top resize handle */}
      <div onPointerDown={e => startDraftResize(e, 'top')}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, cursor: 'ns-resize', zIndex: 2 }} />

      {/* body — drag to shift the whole block */}
      <div
        onPointerDown={e => startDraftMove(e)}
        style={{
          position: 'absolute', top: 8, left: 0, right: 0, bottom: 8,
          cursor: 'grab', display: 'flex', alignItems: 'center',
          paddingLeft: 7, overflow: 'hidden',
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: '#A8703E', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>
          {newTaskDraft.title || 'New task…'}
        </span>
      </div>

      {/* bottom resize handle */}
      <div onPointerDown={e => startDraftResize(e, 'bottom')}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, cursor: 'ns-resize', zIndex: 2 }} />
    </div>
  );
}


// ── EventChip ─────────────────────────────────────────────────────────────────
// noTopTransition: true while the top handle is being dragged, so the CSS
// spring doesn't chase every pointermove frame and cause flicker.
function EventChip({ ev, draggingThis, noTopTransition, isConflict, onPointerDown, onResizeStart, onDelete, onToggleLock }) {
  const [hovered, setHovered]       = useState(false);
  const [confirming, setConfirming] = useState(false);
  const c        = cat(ev);
  const settling = !draggingThis && !noTopTransition;
  return (
    <div
      onPointerDown={e => { e.stopPropagation(); if (!ev.fixed && !confirming) onPointerDown(e); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
      style={{
        position: 'absolute',
        top:    (ev.startMin - DAY_START) * PX_PER_MIN,
        left: 3, right: 3,
        height: Math.max(ev.durationMin * PX_PER_MIN - 3, 18),
        background:  isConflict ? '#FFF0EE' : c.bg,
        borderLeft: `3px solid ${isConflict ? '#D44848' : c.accent}`,
        borderRadius: 8, padding: '3px 6px',
        cursor: ev.fixed ? 'default' : draggingThis ? 'grabbing' : 'grab',
        userSelect: 'none',
        zIndex:   draggingThis ? 1 : (hovered || confirming) ? 4 : 3,
        opacity:  draggingThis ? 0.15 : 1,
        transition: draggingThis
          ? 'opacity .1s ease'
          : settling
            ? 'top .38s cubic-bezier(0.34,1.2,0.64,1), opacity .15s ease, background .3s ease'
            : 'opacity .15s ease, background .3s ease',
        boxShadow: isConflict
          ? `0 0 0 1.5px ${c.accent}55`
          : draggingThis ? 'none'
          : `0 2px 8px -5px ${c.accent}66`,
        animation: isConflict ? 'shakeWobble 0.7s ease both' : 'none',
        overflow: 'visible',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-start',
      }}
    >
      {/* Confirmation popup */}
      {confirming && (
        <div
          onPointerDown={e => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
            transform: 'translateX(-50%)',
            background: '#fff', border: '1.5px solid #ECE3D4',
            borderRadius: 12, padding: '10px 14px',
            boxShadow: '0 8px 24px -8px rgba(74,54,38,.3)',
            zIndex: 50, whiteSpace: 'nowrap',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: '#4A3526' }}>Remove "{ev.title}"?</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onPointerDown={e => { e.stopPropagation(); onDelete(); }}
              style={{
                padding: '5px 12px', borderRadius: 999, border: 'none',
                background: '#D44848', color: '#fff',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >Remove</button>
            <button
              onPointerDown={e => { e.stopPropagation(); setConfirming(false); setHovered(false); }}
              style={{
                padding: '5px 12px', borderRadius: 999,
                border: '1.5px solid #ECE3D4', background: '#fff',
                color: '#8C7A64', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* Hover delete button — middle-left (only for unlocked events) */}
      {!ev.fixed && (
        <DeleteButton visible={hovered && !draggingThis && !confirming} onDelete={() => setConfirming(true)} />
      )}

      {/* top resize handle (disabled for locked events) */}
      <div onPointerDown={e => { e.stopPropagation(); if (!ev.fixed) onResizeStart(e, 'top'); }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, cursor: ev.fixed ? 'default' : 'ns-resize', zIndex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3, overflow: 'hidden' }}>
        <div style={{
          fontSize: 10, fontWeight: 800,
          color: isConflict ? '#9E2020' : c.text,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, lineHeight: 1.2,
        }}>
          {ev.title}
        </div>
        {/* Lock / unlock button — always visible on locked events, visible on hover for unlocked */}
        {(ev.fixed || hovered) && (
          <button
            onPointerDown={e => { e.stopPropagation(); onToggleLock(); }}
            title={ev.fixed ? 'Unlock event' : 'Lock event'}
            style={{
              flexShrink: 0, background: 'none', border: 'none', padding: 0,
              cursor: 'pointer', lineHeight: 1, fontSize: 9,
              opacity: ev.fixed ? 0.7 : 0.4,
              transition: 'opacity .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = ev.fixed ? '0.7' : '0.4'; }}
          >
            {ev.fixed ? '🔒' : '🔓'}
          </button>
        )}
      </div>

      {ev.durationMin >= 25 && (
        <div style={{ fontSize: 9, color: isConflict ? '#9E2020' : c.text, opacity: .65, marginTop: 2, lineHeight: 1 }}>
          {fmtTime(ev.startMin)}–{fmtTime(ev.startMin + ev.durationMin)}
        </div>
      )}

      {/* bottom resize handle */}
      <div onPointerDown={e => { e.stopPropagation(); onResizeStart(e, 'bottom'); }}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, cursor: 'ns-resize', zIndex: 1 }} />
    </div>
  );
}

// ── WeekView ──────────────────────────────────────────────────────────────────
export default function WeekView({ weekOffset, sel, setSel, events, setEvents }) {
  const gridRef   = useRef(null);
  const scrollRef = useRef(null);
  const eventsRef = useRef(events);
  useEffect(() => { eventsRef.current = events; }, [events]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote,    setAiNote]    = useState('');
  const [conflicts, setConflicts] = useState(new Set());
  const [undoStack, setUndoStack] = useState([]);

  const [draftBlock,   setDraftBlock]   = useState(null);
  const [newTaskDraft, setNewTaskDraft] = useState({
    title: '', duration_planned: 60, category: 'deep_work', effort_tier: 'med',
    deadline_iso: '', non_negotiable: false,
  });

  const weekDates   = getWeekDates(weekOffset);
  const weekDayNums = weekDates.map(d => d.getDate());
  const dayLabel    = Object.fromEntries(weekDates.map((d, i) => [d.getDate(), DOW_NAMES[i]]));
  const todayNum    = new Date().getDate();

  async function callScheduler(postDragEvents, pinnedId, snapshotBeforeDrag) {
    setAiLoading(true); setAiNote('');
    try {
      const res = await fetch('/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: postDragEvents, pinned_ids: [pinnedId] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setEvents(data.events);
      setConflicts(new Set(data.conflicts || []));
    } catch (err) {
      console.warn('[scheduler] failed, reverting drag:', err.message);
      setEvents(snapshotBeforeDrag);
      setAiNote('⚠ Scheduler unavailable — drag reverted. (' + err.message + ')');
    } finally {
      setAiLoading(false);
    }
  }

  const {
    dragRef, dragPos, resizingTopId, isDraftMoving,
    startDrag, startResize, startDraftResize, startDraftMove,
    handlePointerMove, handlePointerUp, handlePointerCancel,
  } = useDragResize({
    gridRef, scrollRef, weekDayNums,
    eventsRef, setEvents,
    draftBlock, setDraftBlock,
    newTaskDraft, setNewTaskDraft,
    setUndoStack, callScheduler,
  });

  const [confirmingCancel, setConfirmingCancel] = useState(false);

  function cancelDraft() {
    setConfirmingCancel(false);
    setDraftBlock(null);
    setNewTaskDraft({ title: '', duration_planned: 60, category: 'deep_work', effort_tier: 'med', deadline_iso: '', non_negotiable: false });
  }

  function requestCancel() {
    if (newTaskDraft.title.trim()) {
      setConfirmingCancel(true);
    } else {
      cancelDraft();
    }
  }

  // Click-outside: anything that bubbles past EventCreation's stopPropagation → requestCancel
  useEffect(() => {
    if (!draftBlock || isDraftMoving) return;
    document.addEventListener('pointerdown', requestCancel);
    return () => document.removeEventListener('pointerdown', requestCancel);
  }, [draftBlock, isDraftMoving, newTaskDraft.title]);

  function deleteEvent(id) {
    setEvents(prev => prev.filter(e => e.id !== id));
    setConflicts(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  function toggleLock(id) {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, fixed: !e.fixed } : e));
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

  function handleUndo() {
    if (undoStack.length === 0) return;
    const top = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setEvents(top.events);
    setAiNote('');
    if (top.dragId) setConflicts(new Set([top.dragId]));
  }

  useEffect(() => {
    if (conflicts.size === 0) return;
    const t = setTimeout(() => setConflicts(new Set()), 1400);
    return () => clearTimeout(t);
  }, [conflicts]);

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

      {/* Undo + AI spinner */}
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
            <div
              ref={gridRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              style={{ flex: 1, position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', height: GRID_H, touchAction: 'none' }}
            >
              {/* Hour lines */}
              {HOURS.map(h => (
                <div key={h} style={{ position: 'absolute', top: (h * 60 - DAY_START) * PX_PER_MIN, left: 0, right: 0, height: 1, background: '#ECE3D4', zIndex: 0 }} />
              ))}
              {HOURS.flatMap(h => [15, 30, 45].map(m => (
                <div key={`${h}${m}`} style={{ position: 'absolute', top: ((h * 60 + m) - DAY_START) * PX_PER_MIN, left: 0, right: 0, height: 1, background: '#F3EDE2', zIndex: 0 }} />
              )))}

              {weekDayNums.map(day => {
                const isToday = day === todayNum && weekOffset === 0;
                return (
                  <div key={day} onPointerDown={e => {
                    if (dragRef.current || draftBlock) return;
                    e.stopPropagation(); // prevent document listener from cancelling the new draft
                    const rect      = gridRef.current.getBoundingClientRect();
                    const scrollTop = scrollRef.current?.scrollTop || 0;
                    const relY      = e.clientY - rect.top + scrollTop;
                    const clickedMin = snapMin(DAY_START + relY / PX_PER_MIN);
                    setDraftBlock({ day, startMin: Math.min(clickedMin, DAY_END - 60) });
                  }} style={{
                    height: GRID_H, borderLeft: '1px solid #ECE3D4', position: 'relative',
                    background: dragPos?.day === day ? 'rgba(168,112,62,.04)' : isToday ? 'rgba(245,238,225,.35)' : 'transparent',
                    transition: 'background .15s ease', cursor: 'crosshair',
                  }}>
                    {/* Drop-position indicator line */}
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
                        noTopTransition={resizingTopId === ev.id}
                        isConflict={conflicts.has(ev.id)}
                        onPointerDown={e => { e.stopPropagation(); startDrag(e, ev); }}
                        onResizeStart={(e, edge) => startResize(e, ev, edge)}
                        onDelete={() => deleteEvent(ev.id)}
                        onToggleLock={() => toggleLock(ev.id)}
                      />
                    ))}

                    {/* Draft ghost block */}
                    {draftBlock?.day === day && (
                      <DraftGhost
                        draftBlock={draftBlock}
                        newTaskDraft={newTaskDraft}
                        onCancel={cancelDraft}
                        startDraftResize={startDraftResize}
                        startDraftMove={startDraftMove}
                      />
                    )}
                  </div>
                );
              })}

              {/* Drag ghost — follows cursor during event drag */}
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

      {draftBlock && !isDraftMoving && (
        <EventCreation
          draftBlock={draftBlock}
          newTaskDraft={newTaskDraft}
          setNewTaskDraft={setNewTaskDraft}
          gridRef={gridRef}
          scrollRef={scrollRef}
          weekDayNums={weekDayNums}
          onCommit={commitDraft}
          onCancel={cancelDraft}
          onRequestCancel={requestCancel}
          confirmingCancel={confirmingCancel}
          onConfirmCancel={cancelDraft}
          onDismissConfirm={() => setConfirmingCancel(false)}
        />
      )}
    </>
  );
}
