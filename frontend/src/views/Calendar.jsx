// ─── TODO (backend dev) ─────────────────────────────────────────────────────
// /api/ai/reschedule already wired in backend/app/main.py.
// Calendar.day uses June dates (22-28); backend Block.day is 0-indexed → offset +22.
// ────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from 'react';
import { BUSY_DAYS, CATEGORY_COLORS, DEFAULT_CAT_COLOR } from '../data/fixtures.js';

const PX_PER_MIN = 1.4;
const DAY_START  = 8  * 60;
const DAY_END    = 23 * 60;
const GRID_H     = (DAY_END - DAY_START) * PX_PER_MIN;
const SNAP       = 15;
const HOURS      = Array.from({ length: 15 }, (_, i) => i + 8);
const WEEK_DAYS  = [22, 23, 24, 25, 26, 27, 28];
const WEEK2_DAYS = [29, 30, 31, 32, 33, 34, 35]; // 29-30 = Jun, 31-35 = Jul 1-5
const DAY_LABELS = { 22:'Mon', 23:'Tue', 24:'Wed', 25:'Thu', 26:'Fri', 27:'Sat', 28:'Sun' };
const DOW_NAMES  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const SEG        = ['month', '2w', '1w'];
const SEG_LABELS = { month: 'Month', '2w': '2 weeks', '1w': '1 week' };
const API        = '/api/ai/reschedule';

function cat(ev) { return CATEGORY_COLORS[ev.category] || DEFAULT_CAT_COLOR; }

// Returns true if [startMin, startMin+duration) overlaps any fixed event on `day`
// (excluding the event being dragged itself)
function hasFixedConflict(events, excludeId, day, startMin, duration) {
  return events.some(e =>
    e.id !== excludeId &&
    e.day === day &&
    e.fixed &&
    startMin < e.startMin + e.durationMin &&
    startMin + duration > e.startMin
  );
}

// ── client-side greedy fallback ───────────────────────────────────────────────
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

function rescheduleLocal(events, pinnedIds) {
  const pinned = events.filter(e => pinnedIds.includes(e.id) || e.fixed);
  const free   = events.filter(e => !pinnedIds.includes(e.id) && !e.fixed)
                        .sort((a, b) => a.startMin - b.startMin);
  const occ = {};
  WEEK_DAYS.forEach(d => { occ[d] = []; });
  pinned.forEach(e => { if (occ[e.day]) occ[e.day].push({ s: e.startMin, e: e.startMin + e.durationMin }); });
  const result = [...pinned];
  for (const ev of free) {
    const tryDays = [ev.day, ...WEEK_DAYS.filter(d => d !== ev.day)];
    let placed = false;
    for (const day of tryDays) {
      const slot = firstFitSlot(occ[day], ev.startMin, ev.durationMin);
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

function fmtTime(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}
function snapMin(min) { return Math.round(min / SNAP) * SNAP; }

function cellStyleFn(n, sel) {
  if (n === sel) return { background: '#A8703E', color: '#fff' };
  if ([23,24,25,26,28].includes(n)) return { background: '#F5EEE1', color: '#4A3526' };
  return { background: 'transparent', color: '#4A3526' };
}

// ── Calendar ─────────────────────────────────────────────────────────────────
export default function Calendar({ calView, setCalView, sel, setSel, events, setEvents, userId, onWallsUpdate }) {
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

  // ── Google Calendar ─────────────────────────────────────────────────────────
  const [gcConnected, setGcConnected] = useState(null); // null=checking, true, false
  const [gcBusy, setGcBusy] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/google/status?user_id=${userId}`)
      .then(r => r.json())
      .then(d => setGcConnected(d.connected))
      .catch(() => setGcConnected(false));
  }, [userId]);

  async function gcConnect() {
    try {
      const r = await fetch(`/api/google/auth-url?user_id=${userId}`);
      const { url } = await r.json();
      window.location.href = url;
    } catch { setGcConnected(false); }
  }

  async function gcRefresh() {
    setGcBusy(true);
    try {
      const { walls } = await fetch(`/api/google/walls?user_id=${userId}`).then(r => r.json());
      onWallsUpdate?.(walls ?? []);
    } catch {} finally { setGcBusy(false); }
  }

  async function gcDisconnect() {
    setGcBusy(true);
    try {
      await fetch(`/api/google/disconnect?user_id=${userId}`, { method: 'DELETE' });
      setGcConnected(false);
      onWallsUpdate?.([]);
    } catch {} finally { setGcBusy(false); }
  }

  useEffect(() => {
    if (conflicts.size === 0) return;
    const t = setTimeout(() => setConflicts(new Set()), 1400);
    return () => clearTimeout(t);
  }, [conflicts]);

  async function callAiReschedule(postDragEvents, pinnedId) {
    setAiLoading(true);
    setAiNote('');
    try {
      const payload = { events: postDragEvents, pinned_ids: [pinnedId] };
      console.log('[AI reschedule] →', payload);

      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      console.log('[AI reschedule] ←', data);

      // Validate: AI must return same number of events
      if (!data.events || data.events.length !== postDragEvents.length) {
        throw new Error(`AI returned ${data.events?.length ?? 0} events, expected ${postDragEvents.length}`);
      }

      // Validate: no day should have more than 6 events (sanity cap)
      const dayCounts = {};
      data.events.forEach(e => { dayCounts[e.day] = (dayCounts[e.day] || 0) + 1; });
      const maxDay = Math.max(...Object.values(dayCounts));
      if (maxDay > 6) {
        throw new Error(`AI stacked ${maxDay} events on one day — rejecting`);
      }

      setEvents(data.events);
      setConflicts(new Set(data.conflicts || []));
      setAiNote('✦ ' + (data.explanation || 'Schedule optimised by AI.'));
    } catch (err) {
      console.warn('[AI reschedule] failed, using local fallback:', err.message);
      setEvents(rescheduleLocal(postDragEvents, [pinnedId]));
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
        const day       = WEEK_DAYS[colIdx];
        const relY      = e.clientY - rect.top + scrollTop - dr.grabOffsetY;
        const clamped   = Math.max(DAY_START, Math.min(DAY_END - dr.duration, snapMin(DAY_START + relY / PX_PER_MIN)));
        // Check if this position overlaps a fixed event on the target day
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
          // Drop on a fixed event — snap back to original position, no reschedule
          dragRef.current = null;
          posRef.current  = null;
          setDragPos(null);
          return;
        }
        if (pos.day !== dr.origDay || pos.startMin !== dr.origStart) {
          const snap = [...eventsRef.current];
          setUndoStack(prev => [...prev.slice(-4), { events: snap, dragId: dr.id }]);
          const postDrag = eventsRef.current.map(x =>
            x.id === dr.id ? { ...x, day: pos.day, startMin: pos.startMin } : x
          );
          callAiReschedule(postDrag, dr.id);
        }
      }
      dragRef.current = null;
      posRef.current  = null;
      setDragPos(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
    };
  }, []);

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
  WEEK_DAYS.forEach(d => { byDay[d] = []; });
  events.forEach(ev => { if (byDay[ev.day]) byDay[ev.day].push(ev); });

  // Unique categories present this week — for legend
  const activeCats = [...new Set(events.map(e => e.category))];

  return (
    <div style={{ padding: '28px 36px 40px', animation: 'fadeIn .45s ease' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap', marginBottom:18 }}>
        <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:28, color:'#4A3526' }}>June 2026</div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {undoStack.length > 0 && !aiLoading && (
            <button onClick={handleUndo} style={{
              padding:'8px 16px', borderRadius:999, border:'1.5px solid #ECE3D4',
              background:'#fff', color:'#8A5A2E', fontFamily:"'Quicksand'", fontWeight:700, fontSize:13,
              cursor:'pointer', display:'flex', alignItems:'center', gap:6,
              boxShadow:'0 2px 8px -4px rgba(74,54,38,.2)',
            }}>↩ Undo</button>
          )}
          {aiLoading && (
            <span style={{ fontSize:12, color:'#AD9B84', fontStyle:'italic', animation:'ringPulse 1.1s ease infinite' }}>
              AI rescheduling…
            </span>
          )}
          <div style={{ display:'flex', background:'#F1E8D7', borderRadius:999, padding:4, fontFamily:"'Quicksand'", fontWeight:700, fontSize:13 }}>
            {SEG.map(v => (
              <span key={v} onClick={() => setCalView(v)} style={{
                cursor:'pointer', padding:'7px 14px', borderRadius:999, transition:'all .2s ease',
                ...(calView === v
                  ? { background:'#fff', color:'#A8703E', boxShadow:'0 4px 10px -6px rgba(150,108,64,.5)' }
                  : { color:'#AD9B84' }),
              }}>{SEG_LABELS[v]}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Google Calendar banner */}
      {gcConnected === false && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#F5EEE1', border: '1px solid #E9DCC8',
          borderRadius: 14, padding: '10px 16px', marginBottom: 14,
        }}>
          <span style={{ fontSize: 16 }}>📅</span>
          <span style={{ fontSize: 13, color: '#8C7A64', flex: 1 }}>
            Connect Google Calendar to automatically block out your busy times.
          </span>
          <button onClick={gcConnect} style={{
            padding: '7px 16px', borderRadius: 999, border: 'none',
            background: '#A8703E', color: '#fff',
            fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 13, cursor: 'pointer',
            boxShadow: '0 4px 10px -6px rgba(168,112,62,.7)',
          }}>Connect</button>
        </div>
      )}
      {gcConnected === true && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#E2F2EA', border: '1px solid #C9E6D5',
          borderRadius: 14, padding: '10px 16px', marginBottom: 14,
        }}>
          <span style={{ fontSize: 16 }}>📅</span>
          <span style={{ fontSize: 13, color: '#3D8A62', flex: 1, fontWeight: 600 }}>
            Google Calendar connected — busy times are blocked out.
          </span>
          <button onClick={gcRefresh} disabled={gcBusy} style={{
            padding: '7px 14px', borderRadius: 999, border: '1.5px solid #C9E6D5',
            background: '#fff', color: '#3D8A62',
            fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 12,
            cursor: gcBusy ? 'default' : 'pointer', opacity: gcBusy ? 0.6 : 1,
          }}>{gcBusy ? '…' : 'Refresh'}</button>
          <button onClick={gcDisconnect} disabled={gcBusy} style={{
            padding: '7px 14px', borderRadius: 999, border: 'none',
            background: 'transparent', color: '#AD9B84',
            fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 12, cursor: 'pointer',
          }}>Disconnect</button>
        </div>
      )}

      {/* AI explanation banner */}
      {aiNote && !aiLoading && (
        <div style={{
          background: aiNote.startsWith('⚠') ? '#FBEFD9' : '#F5EEE1',
          border: `1px solid ${aiNote.startsWith('⚠') ? '#F3DCB0' : '#ECE3D4'}`,
          borderRadius:14, padding:'10px 16px', marginBottom:14,
          fontSize:12, color: aiNote.startsWith('⚠') ? '#9A6B1E' : '#8A5A2E',
          display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <span>{aiNote}</span>
          <span onClick={() => setAiNote('')} style={{ cursor:'pointer', color:'#AD9B84', fontSize:14, marginLeft:12 }}>×</span>
        </div>
      )}

      {/* ── 1-WEEK TIME GRID ── */}
      {calView === '1w' && (
        <div style={{ background:'#fff', border:'1px solid #ECE3D4', borderRadius:22, overflow:'hidden', boxShadow:'0 12px 30px -22px rgba(74,54,38,.5)' }}>

          {/* Category legend */}
          <div style={{ display:'flex', gap:10, padding:'10px 16px 8px', borderBottom:'1px solid #F0E8DC', flexWrap:'wrap', alignItems:'center' }}>
            {activeCats.map(c => {
              const s = CATEGORY_COLORS[c] || DEFAULT_CAT_COLOR;
              return (
                <div key={c} style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:10, height:10, borderRadius:3, background:s.bg, border:`1.5px solid ${s.accent}`, display:'inline-block', flexShrink:0 }} />
                  <span style={{ fontSize:10, fontWeight:700, color:'#8C7A64' }}>{s.label}</span>
                </div>
              );
            })}
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:13 }}>🔒</span>
              <span style={{ fontSize:10, fontWeight:700, color:'#8C7A64' }}>= locked (can't drag)</span>
            </div>
          </div>

          {/* Day header row */}
          <div style={{ display:'flex', borderBottom:'1px solid #ECE3D4' }}>
            <div style={{ width:48, flexShrink:0 }} />
            {WEEK_DAYS.map(day => (
              <div key={day} onClick={() => setSel(day)} style={{
                flex:1, textAlign:'center', padding:'10px 4px 8px', cursor:'pointer',
                borderLeft:'1px solid #ECE3D4',
                background: day === 27 ? '#F5EEE1' : 'transparent',
              }}>
                <div style={{ fontWeight:700, fontSize:10, color:'#B6A48C', letterSpacing:'1px' }}>{DAY_LABELS[day].toUpperCase()}</div>
                <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:18, color: day === sel ? '#A8703E' : '#4A3526', marginTop:2 }}>{day}</div>
              </div>
            ))}
          </div>

          {/* Scrollable time body */}
          <div ref={scrollRef} style={{ overflowY:'auto', height:500, cursor: dragRef.current ? 'grabbing' : 'default' }}>
            <div style={{ display:'flex' }}>
              {/* Time gutter */}
              <div style={{ width:48, flexShrink:0, position:'relative', height:GRID_H }}>
                {HOURS.map(h => (
                  <div key={h} style={{ position:'absolute', top:(h*60-DAY_START)*PX_PER_MIN - 7, right:8, fontSize:10, fontWeight:700, color:'#C4B49C' }}>{h}:00</div>
                ))}
              </div>

              {/* Grid */}
              <div ref={gridRef} style={{ flex:1, position:'relative', display:'grid', gridTemplateColumns:'repeat(7,1fr)', height:GRID_H }}>
                {/* Hour lines */}
                {HOURS.map(h => (
                  <div key={h} style={{ position:'absolute', top:(h*60-DAY_START)*PX_PER_MIN, left:0, right:0, height:1, background:'#ECE3D4', zIndex:0 }} />
                ))}
                {/* 15-min tick lines */}
                {HOURS.flatMap(h => [15,30,45].map(m => (
                  <div key={`${h}${m}`} style={{ position:'absolute', top:((h*60+m)-DAY_START)*PX_PER_MIN, left:0, right:0, height:1, background:'#F3EDE2', zIndex:0 }} />
                )))}

                {/* Day columns */}
                {WEEK_DAYS.map(day => (
                  <div key={day} style={{
                    height: GRID_H, borderLeft:'1px solid #ECE3D4', position:'relative',
                    background: dragPos?.day === day ? 'rgba(168,112,62,.04)' : day === 27 ? 'rgba(245,238,225,.35)' : 'transparent',
                    transition:'background .15s ease',
                  }}>
                    {/* Drop guide — red when blocked by a fixed event */}
                    {dragPos?.day === day && (
                      <div style={{
                        position:'absolute',
                        top:(dragPos.startMin-DAY_START)*PX_PER_MIN,
                        left:2, right:2, height:2, borderRadius:2, zIndex:5,
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
                        onPointerDown={e => startDrag(e, ev)}
                      />
                    ))}
                  </div>
                ))}

                {/* Drag ghost — turns red with × when hovering over a fixed event's slot */}
                {dragPos && dragRef.current && (() => {
                  const dr      = dragRef.current;
                  const ev      = events.find(x => x.id === dr.id);
                  if (!ev) return null;
                  const c       = cat(ev);
                  const ci      = WEEK_DAYS.indexOf(dragPos.day);
                  const pct     = 100 / 7;
                  const blocked = dragPos.blocked;
                  return (
                    <div style={{
                      position:'absolute',
                      top: (dragPos.startMin - DAY_START) * PX_PER_MIN,
                      left: `calc(${ci * pct}% + 3px)`,
                      width: `calc(${pct}% - 6px)`,
                      height: dr.duration * PX_PER_MIN - 3,
                      background: blocked ? '#D44848' : c.accent,
                      borderRadius:8,
                      opacity: blocked ? .75 : .9,
                      pointerEvents:'none',
                      zIndex:20,
                      padding:'5px 8px',
                      boxShadow: blocked
                        ? '0 0 0 2px #D4484888, 0 8px 20px -8px #D4484866'
                        : `0 10px 24px -8px ${c.accent}88`,
                      color:'#fff', overflow:'hidden',
                      transition:'background .12s ease, box-shadow .12s ease',
                    }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        {blocked && <span style={{ fontSize:13, lineHeight:1, flexShrink:0 }}>✕</span>}
                        <div style={{ fontSize:11, fontWeight:800, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{ev.title}</div>
                      </div>
                      <div style={{ fontSize:10, marginTop:2, opacity:.85 }}>
                        {blocked ? 'Blocked — fixed event here' : `${fmtTime(dragPos.startMin)} · ${dr.duration}m`}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
          <div style={{ textAlign:'center', fontSize:11, color:'#AD9B84', fontStyle:'italic', padding:'7px 0 9px', borderTop:'1px solid #F0E8DC' }}>
            drag flexible events · AI rearranges the rest · 🔒 locked events stay fixed
          </div>
        </div>
      )}

      {/* ── MONTH ── */}
      {calView === 'month' && (
        <div style={{ display:'flex', gap:22, flexWrap:'wrap' }}>
          <div style={{ flex:'1 1 380px', minWidth:320, background:'#fff', border:'1px solid #ECE3D4', borderRadius:22, padding:20, boxShadow:'0 12px 30px -22px rgba(74,54,38,.5)' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6, fontWeight:700, fontSize:11, color:'#B6A48C', textAlign:'center', marginBottom:8 }}>
              {['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d => <span key={d}>{d}</span>)}
            </div>
            <MonthGrid sel={sel} setSel={setSel} events={events} />
          </div>
          <div style={{ flex:'1 1 220px', minWidth:200 }}>
            <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:18, color:'#4A3526', marginBottom:12 }}>
              {DAY_LABELS[sel]}, {sel} June
            </div>
            {(byDay[sel] || []).length === 0
              ? <div style={{ fontSize:13, color:'#AD9B84', fontStyle:'italic' }}>Nothing scheduled.</div>
              : <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {[...(byDay[sel] || [])].sort((a,b) => a.startMin - b.startMin).map(ev => {
                    const c = cat(ev);
                    return (
                      <div key={ev.id} style={{
                        background:'#fff', border:`1px solid ${c.accent}44`,
                        borderLeft:`5px solid ${c.accent}`, borderRadius:14, padding:'12px 14px',
                      }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:14, color:'#4A3526', flex:1 }}>{ev.title}</span>
                          {ev.fixed && <span style={{ fontSize:14 }}>🔒</span>}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:3 }}>
                          <span style={{ fontSize:10, fontWeight:700, color:c.text, background:c.bg, borderRadius:5, padding:'2px 6px' }}>{c.label}</span>
                          <span style={{ fontSize:12, color:'#AD9B84' }}>{fmtTime(ev.startMin)} – {fmtTime(ev.startMin + ev.durationMin)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
            <div style={{ fontStyle:'italic', fontSize:11, color:'#AD9B84', marginTop:14, textAlign:'center' }}>
              Switch to <span onClick={() => setCalView('1w')} style={{ cursor:'pointer', color:'#A8703E', fontWeight:700, fontStyle:'normal' }}>1-week view</span> to drag events.
            </div>
          </div>
        </div>
      )}

      {/* ── 2-WEEK: two stacked full time grids ── */}
      {calView === '2w' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <WeekBlock weekDays={WEEK_DAYS}  label="Jun 22–28" events={events} sel={sel} setSel={setSel} />
          <WeekBlock weekDays={WEEK2_DAYS} label="Jun 29–Jul 5" events={events} sel={sel} setSel={setSel} />
          <div style={{ textAlign:'center', fontSize:11, color:'#AD9B84', fontStyle:'italic' }}>
            Switch to <span onClick={() => setCalView('1w')} style={{ cursor:'pointer', color:'#A8703E', fontWeight:700, fontStyle:'normal' }}>1-week view</span> to drag events.
          </div>
        </div>
      )}
    </div>
  );
}

// ── EventChip ────────────────────────────────────────────────────────────────
function EventChip({ ev, draggingThis, isConflict, onPointerDown }) {
  const c = cat(ev);
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position:'absolute',
        top: (ev.startMin - DAY_START) * PX_PER_MIN,
        left:3, right:3,
        height: Math.max(ev.durationMin * PX_PER_MIN - 3, 18),
        background: isConflict ? '#FFF0EE' : c.bg,
        borderLeft: `3px solid ${isConflict ? '#D44848' : c.accent}`,
        borderRadius:8, padding:'3px 6px',
        cursor: ev.fixed ? 'default' : draggingThis ? 'grabbing' : 'grab',
        userSelect:'none',
        zIndex: draggingThis ? 1 : 3,
        opacity: draggingThis ? 0.15 : 1,
        transition: draggingThis
          ? 'opacity .1s ease'
          : 'top .38s cubic-bezier(0.34,1.2,0.64,1), opacity .15s ease, background .3s ease',
        boxShadow: isConflict
          ? `0 0 0 1.5px ${c.accent}55`
          : draggingThis ? 'none'
          : `0 2px 8px -5px ${c.accent}66`,
        animation: isConflict ? 'shakeWobble 0.7s ease both' : 'none',
        overflow:'hidden',
        display:'flex', flexDirection:'column', justifyContent:'flex-start',
      }}
    >
      {/* Title row + lock icon */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:3 }}>
        <div style={{
          fontSize:10, fontWeight:800,
          color: isConflict ? '#9E2020' : c.text,
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', flex:1,
          lineHeight:1.2,
        }}>
          {ev.title}
        </div>
        {ev.fixed && (
          <span style={{ fontSize:9, flexShrink:0, opacity:.55, lineHeight:1 }}>🔒</span>
        )}
      </div>
      {/* Time label — only if tall enough */}
      {ev.durationMin >= 25 && (
        <div style={{ fontSize:9, color: isConflict ? '#9E2020' : c.text, opacity:.65, marginTop:2, lineHeight:1 }}>
          {fmtTime(ev.startMin)}–{fmtTime(ev.startMin + ev.durationMin)}
        </div>
      )}
    </div>
  );
}

// ── WeekBlock ────────────────────────────────────────────────────────────────
// Display-only time grid for one week. Used by the 2-week view (no drag).
// weekDays: array of 7 day-numbers. Days ≤ 30 = June; days > 30 = July (n-30).
function WeekBlock({ weekDays, label, events, sel, setSel }) {
  const byDay = {};
  weekDays.forEach(d => { byDay[d] = []; });
  events.forEach(ev => { if (byDay[ev.day] !== undefined) byDay[ev.day].push(ev); });

  function dayInfo(n, idx) {
    const isJuly = n > 30;
    return {
      dow:    DOW_NAMES[idx],
      date:   isJuly ? n - 30 : n,
      isJuly,
    };
  }

  return (
    <div style={{ background:'#fff', border:'1px solid #ECE3D4', borderRadius:22, overflow:'hidden', boxShadow:'0 12px 30px -22px rgba(74,54,38,.5)' }}>
      {/* Week label bar */}
      <div style={{ padding:'6px 16px', background:'#FAF5ED', borderBottom:'1px solid #F0E8DC', fontSize:11, fontWeight:800, color:'#B6A48C', letterSpacing:'.6px' }}>
        {label.toUpperCase()}
      </div>

      {/* Day header row */}
      <div style={{ display:'flex', borderBottom:'1px solid #ECE3D4' }}>
        <div style={{ width:48, flexShrink:0 }} />
        {weekDays.map((day, idx) => {
          const { dow, date, isJuly } = dayInfo(day, idx);
          const isSel = day === sel;
          return (
            <div
              key={day}
              onClick={() => !isJuly && setSel(day)}
              style={{
                flex:1, textAlign:'center', padding:'9px 4px 7px',
                cursor: isJuly ? 'default' : 'pointer',
                borderLeft:'1px solid #ECE3D4',
                opacity: isJuly ? 0.4 : 1,
              }}
            >
              <div style={{ fontWeight:700, fontSize:10, color:'#B6A48C', letterSpacing:'1px' }}>{dow.toUpperCase()}</div>
              <div style={{ fontFamily:"'Quicksand'", fontWeight:700, fontSize:17, color: isSel ? '#A8703E' : '#4A3526', marginTop:1 }}>
                {date}
                {isJuly && <span style={{ fontSize:8, color:'#C4B49C', marginLeft:2 }}>JUL</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable time body */}
      <div style={{ overflowY:'auto', height:390 }}>
        <div style={{ display:'flex' }}>
          {/* Hour gutter */}
          <div style={{ width:48, flexShrink:0, position:'relative', height:GRID_H }}>
            {HOURS.map(h => (
              <div key={h} style={{ position:'absolute', top:(h*60-DAY_START)*PX_PER_MIN - 7, right:8, fontSize:10, fontWeight:700, color:'#C4B49C' }}>{h}:00</div>
            ))}
          </div>

          {/* Grid columns */}
          <div style={{ flex:1, position:'relative', display:'grid', gridTemplateColumns:'repeat(7,1fr)', height:GRID_H }}>
            {/* Hour lines */}
            {HOURS.map(h => (
              <div key={h} style={{ position:'absolute', top:(h*60-DAY_START)*PX_PER_MIN, left:0, right:0, height:1, background:'#ECE3D4', zIndex:0 }} />
            ))}
            {/* 15-min ticks */}
            {HOURS.flatMap(h => [15,30,45].map(m => (
              <div key={`${h}${m}`} style={{ position:'absolute', top:((h*60+m)-DAY_START)*PX_PER_MIN, left:0, right:0, height:1, background:'#F3EDE2', zIndex:0 }} />
            )))}

            {weekDays.map((day, idx) => {
              const { isJuly } = dayInfo(day, idx);
              return (
                <div key={day} style={{ height:GRID_H, borderLeft:'1px solid #ECE3D4', position:'relative', opacity: isJuly ? 0.35 : 1 }}>
                  {(byDay[day] || []).map(ev => (
                    <EventChip key={ev.id} ev={ev} draggingThis={false} isConflict={false} onPointerDown={() => {}} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MonthGrid ────────────────────────────────────────────────────────────────
function MonthGrid({ sel, setSel, events }) {
  const busy = {};
  events.forEach(ev => { busy[ev.day] = (busy[ev.day] || 0) + 1; });
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6 }}>
      {Array.from({ length:30 }, (_,i) => i+1).map(n => {
        const count = busy[n] || BUSY_DAYS[n] || 0;
        return (
          <div key={n} onClick={() => setSel(n)} style={{
            cursor:'pointer', aspectRatio:'1', borderRadius:12,
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            fontFamily:"'Quicksand'", fontWeight:600, fontSize:15, transition:'background .15s ease',
            ...cellStyleFn(n, sel),
          }}>
            <span>{n}</span>
            {count > 0 && (
              <div style={{ display:'flex', gap:3, marginTop:3 }}>
                {Array.from({ length: Math.min(count, 3) }).map((_,i) => (
                  <span key={i} style={{ width:5, height:5, borderRadius:'50%', display:'inline-block', background: n===sel?'rgba(255,255,255,.7)':'#A8703E' }} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── TwoWeekGrid ──────────────────────────────────────────────────────────────
// Two rows of 7 days each. Week 1 = Jun 22-28, Week 2 = Jun 29-30 + Jul 1-5.
// n ≤ 30  → June date (may have events)
// n > 30  → maps to July: display as n-30, muted, no events
function TwoWeekGrid({ sel, setSel, events }) {
  // Build map: juneDay → [category colors of events that day]
  const dotsByDay = {};
  events.forEach(ev => {
    if (!dotsByDay[ev.day]) dotsByDay[ev.day] = [];
    const c = CATEGORY_COLORS[ev.category] || DEFAULT_CAT_COLOR;
    dotsByDay[ev.day].push(c.accent);
  });

  const WEEKS = [
    [22, 23, 24, 25, 26, 27, 28],   // week 1: Jun 22-28
    [29, 30, 31, 32, 33, 34, 35],   // week 2: Jun 29-30, Jul 1-5 (n>30 = July)
  ];

  function displayNum(n) { return n <= 30 ? n : n - 30; }
  function isJuly(n)     { return n > 30; }
  function isSelectable(n) { return !isJuly(n); }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
      {WEEKS.map((week, wi) => (
        <div key={wi}>
          {/* Week separator */}
          {wi > 0 && (
            <div style={{ height:1, background:'#ECE3D4', margin:'8px 0' }} />
          )}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:5 }}>
            {week.map(n => {
              const dots      = dotsByDay[n] || [];
              const isSel     = n === sel;
              const july      = isJuly(n);
              const clickable = isSelectable(n);
              return (
                <div
                  key={n}
                  onClick={() => clickable && setSel(n)}
                  style={{
                    cursor: clickable ? 'pointer' : 'default',
                    minHeight: 72,
                    borderRadius: 14,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'flex-start',
                    paddingTop: 9,
                    fontFamily: "'Quicksand'",
                    fontWeight: 700,
                    fontSize: 16,
                    transition: 'background .15s ease',
                    background: isSel ? '#A8703E' : july ? 'transparent' : [23,24,25,26,28,29,30].includes(n) ? '#F5EEE1' : 'transparent',
                    color:      isSel ? '#fff'    : july ? '#D0C4B4'     : '#4A3526',
                    opacity:    july ? 0.55 : 1,
                  }}
                >
                  <span>{displayNum(n)}</span>
                  {/* Per-category coloured dots */}
                  {dots.length > 0 && (
                    <div style={{ display:'flex', gap:3, marginTop:5, flexWrap:'wrap', justifyContent:'center', maxWidth:40 }}>
                      {dots.slice(0, 4).map((accent, i) => (
                        <span key={i} style={{
                          width: 6, height: 6, borderRadius: '50%', display: 'inline-block',
                          background: isSel ? 'rgba(255,255,255,.75)' : accent,
                          flexShrink: 0,
                        }} />
                      ))}
                    </div>
                  )}
                  {/* July label on first cell of second row */}
                  {july && n === 31 && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#C4B49C', marginTop: 4, letterSpacing: '.5px' }}>JUL</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
