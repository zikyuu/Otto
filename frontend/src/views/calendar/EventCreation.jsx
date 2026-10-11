import { useState, useRef, useEffect } from 'react';
import wiseOtter from '../../assets/mascots/wise.png';
import { fmtTime, DAY_START, PX_PER_MIN } from './calendarUtils.js';
import PieChart, { SLICE_COLORS } from '../../components/PieChart.jsx';

const EVENT_COLORS = [
  { accent: '#4373D6', bg: '#DDEAFF', category: 'llm'      },
  { accent: '#32A85C', bg: '#D8F5E4', category: 'leetcode'  },
  { accent: '#D44848', bg: '#FFE2E2', category: 'interview' },
  { accent: '#E07030', bg: '#FFE6D0', category: 'gym'       },
  { accent: '#8450D6', bg: '#EDE0FF', category: 'leisure'   },
  { accent: '#8C7E6A', bg: '#EEEBE6', category: 'admin'     },
];

const POPUP_W     = 292;
const POPUP_W_ADV = 390;

function fmtMins(m) {
  const h = Math.floor(m / 60), min = m % 60;
  if (h === 0) return `${min}m`;
  if (min === 0) return `${h}h`;
  return `${h}h ${min}m`;
}

function parseMins(str) {
  const s = str.trim();
  const hm = s.match(/(\d+)\s*h(?:\s*(\d+)\s*m?)?/);
  if (hm) return parseInt(hm[1]) * 60 + (hm[2] ? parseInt(hm[2]) : 0);
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

function adjustPercents(prev, changedIdx, rawPct) {
  const clamped = Math.max(2, Math.min(96, rawPct));
  const delta   = clamped - prev[changedIdx].percent;
  const others  = prev.filter((s, i) => i !== changedIdx && !s.locked);
  if (others.length === 0) return prev;
  const total   = others.reduce((sum, s) => sum + s.percent, 0);
  return prev.map((s, i) => {
    if (i === changedIdx) return { ...s, percent: clamped };
    if (s.locked) return s;
    const share = total > 0 ? s.percent / total : 1 / others.length;
    return { ...s, percent: Math.max(2, s.percent - delta * share) };
  });
}

// Compute order numbers for order-specific mode: grouped items share the same number
function computeOrderNums(subtasks) {
  const groupSeen = new Map();
  let nextNum = 1;
  return subtasks.map(s => {
    if (s.orderGroup != null) {
      if (!groupSeen.has(s.orderGroup)) groupSeen.set(s.orderGroup, nextNum++);
      return groupSeen.get(s.orderGroup);
    }
    return nextNum++;
  });
}

export default function EventCreation({
  draftBlock, newTaskDraft, setNewTaskDraft,
  gridRef, scrollRef, weekDayNums,
  onCommit, onCancel, onRequestCancel,
  confirmingCancel, onConfirmCancel, onDismissConfirm,
}) {
  const [isAdvanced,    setIsAdvanced]    = useState(false);
  const [orderSpecific, setOrderSpecific] = useState(false);
  const [description,   setDescription]  = useState('');

  // Deadline fields
  const [deadline,       setDeadline]       = useState('');
  const [isHardDeadline, setIsHardDeadline] = useState(true);
  const [bestDoneBy,     setBestDoneBy]     = useState('');

  const [subtasks, setSubtasks] = useState([
    { id: 1, name: '', percent: 50, locked: false, orderGroup: null },
    { id: 2, name: '', percent: 50, locked: false, orderGroup: null },
  ]);

  // Drag-to-reorder (left-click drag on ≡ handle)
  const [draggingIdx,  setDraggingIdx]  = useState(null);
  const [overIdx,      setOverIdx]      = useState(null);
  const listRef    = useRef(null);
  const dragState  = useRef(null);

  // Lasso-select for grouping (right-click drag)
  const [selRect,    setSelRect]    = useState(null); // {top, height} relative to list
  const [selectedIds, setSelectedIds] = useState(new Set());
  const selStartY  = useRef(null);
  const isRightDrag = useRef(false);

  const popW = isAdvanced ? POPUP_W_ADV : POPUP_W;

  // ── Popup position ──────────────────────────────────────────────────────────
  let top = 120, left = 200;
  if (gridRef.current) {
    const rect      = gridRef.current.getBoundingClientRect();
    const scrollTop = scrollRef.current?.scrollTop || 0;
    const colW      = rect.width / 7;
    const colIdx    = weekDayNums.indexOf(draftBlock.day);
    const blockTop  = rect.top + (draftBlock.startMin - DAY_START) * PX_PER_MIN - scrollTop;
    const colLeft   = rect.left + colIdx * colW;
    left = colIdx <= 3 ? colLeft + colW + 10 : colLeft - popW - 10;
    top  = Math.max(8, Math.min(window.innerHeight - (isAdvanced ? 580 : 360), blockTop));
  }

  const sel    = EVENT_COLORS.find(c => c.category === newTaskDraft.category) || EVENT_COLORS[0];
  const endMin = draftBlock.startMin + newTaskDraft.duration_planned;
  const total  = newTaskDraft.duration_planned;
  const orderNums = computeOrderNums(subtasks);

  // ── Subtask helpers ─────────────────────────────────────────────────────────
  function addSubtask() {
    const lockedTotal = subtasks.filter(s => s.locked).reduce((a, s) => a + s.percent, 0);
    const unlockCount = subtasks.filter(s => !s.locked).length + 1;
    const share       = Math.max(2, (100 - lockedTotal) / unlockCount);
    setSubtasks(prev => [
      ...prev.map(s => s.locked ? s : { ...s, percent: share }),
      { id: Date.now(), name: '', percent: share, locked: false, orderGroup: null },
    ]);
  }

  function removeSubtask(id) {
    setSubtasks(prev => {
      const next     = prev.filter(s => s.id !== id);
      if (next.length === 0) return next;
      const removed  = prev.find(s => s.id === id);
      const unlocked = next.filter(s => !s.locked);
      if (unlocked.length === 0) return next;
      const perItem  = removed.percent / unlocked.length;
      return next.map(s => s.locked ? s : { ...s, percent: s.percent + perItem });
    });
    setSelectedIds(prev => { const n = new Set(prev); n.delete(String(id)); return n; });
  }

  function handleTimeInput(id, inputStr) {
    const mins = parseMins(inputStr);
    if (mins <= 0 || total <= 0) return;
    const newPct = Math.min(96, (mins / total) * 100);
    setSubtasks(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx === -1) return prev;
      return adjustPercents(prev.map((s, i) => i === idx ? { ...s, locked: true } : s), idx, newPct);
    });
  }

  function handlePieDrag(idx, newPct) {
    setSubtasks(prev => adjustPercents(prev, idx, newPct));
  }

  // ── Drag-to-reorder ─────────────────────────────────────────────────────────
  function onDragHandleDown(e, idx) {
    e.preventDefault();
    e.stopPropagation();
    listRef.current?.setPointerCapture(e.pointerId);
    dragState.current = { idx };
    setDraggingIdx(idx);
    setOverIdx(idx);
  }

  function onListPointerMove(e) {
    // Reorder drag (left button held via dragState)
    if (dragState.current !== null) {
      const rows = [...(listRef.current?.querySelectorAll('[data-subtask-row]') ?? [])];
      let target = draggingIdx;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { target = i; break; }
        target = i;
      }
      setOverIdx(target);
      return;
    }

    // Lasso select (right button held)
    if (!isRightDrag.current || selStartY.current === null) return;
    const listRect = listRef.current.getBoundingClientRect();
    const y = e.clientY - listRect.top;
    const top2 = Math.min(selStartY.current, y);
    const btm  = Math.max(selStartY.current, y);
    setSelRect({ top: top2, height: btm - top2 });

    const rows = listRef.current.querySelectorAll('[data-subtask-row]');
    const newSel = new Set();
    rows.forEach(row => {
      const r = row.getBoundingClientRect();
      const rowTop = r.top - listRect.top;
      if (r.bottom - listRect.top > top2 && rowTop < btm) {
        newSel.add(row.dataset.subtaskId);
      }
    });
    setSelectedIds(newSel);
  }

  function onListPointerDown(e) {
    if (e.button !== 2) return;
    e.preventDefault();
    isRightDrag.current = true;
    listRef.current?.setPointerCapture(e.pointerId);
    const listRect = listRef.current.getBoundingClientRect();
    selStartY.current = e.clientY - listRect.top;
    setSelRect({ top: selStartY.current, height: 0 });
    setSelectedIds(new Set());
  }

  function onListPointerUp(e) {
    // Reorder drop
    if (dragState.current !== null && overIdx !== null && overIdx !== draggingIdx) {
      setSubtasks(prev => {
        const next = [...prev];
        const [moved] = next.splice(draggingIdx, 1);
        next.splice(overIdx, 0, moved);
        return next;
      });
    }
    dragState.current = null;
    setDraggingIdx(null);
    setOverIdx(null);

    // Lasso select end
    if (isRightDrag.current) {
      isRightDrag.current = false;
      selStartY.current = null;
      setSelRect(null);
      // Keep selectedIds if ≥ 2 selected so user can group; clear otherwise
      setSelectedIds(prev => prev.size >= 2 ? prev : new Set());
    }
  }

  function groupSelected() {
    const existingGroups = subtasks.map(s => s.orderGroup).filter(Boolean);
    const nextGroup = existingGroups.length > 0 ? Math.max(...existingGroups) + 1 : 1;
    setSubtasks(prev => prev.map(s =>
      selectedIds.has(String(s.id)) ? { ...s, orderGroup: nextGroup } : s
    ));
    setSelectedIds(new Set());
  }

  function ungroupItem(id) {
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, orderGroup: null } : s));
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed', zIndex: 100,
        top, left, width: popW,
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #ECE3D4',
        boxShadow: '0 16px 48px -12px rgba(74,54,38,.28), 0 2px 8px -4px rgba(74,54,38,.12)',
        fontFamily: "'Quicksand', system-ui, sans-serif",
        overflow: 'hidden',
        animation: 'fadeIn .15s ease',
        transition: 'width .2s ease',
        maxHeight: 'calc(100vh - 24px)',
        overflowY: 'auto',
      }}
      onPointerDown={e => e.stopPropagation()}
      onContextMenu={e => e.stopPropagation()}
    >
      {/* Category stripe */}
      <div style={{ height: 4, background: sel.accent }} />

      {/* Confirmation overlay */}
      {confirmingCancel && (
        <div
          onPointerDown={e => e.stopPropagation()}
          style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'rgba(255,255,255,.92)',
            backdropFilter: 'blur(2px)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
            borderRadius: 16,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: '#4A3526', textAlign: 'center', padding: '0 16px' }}>
            Discard this event?
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onPointerDown={e => { e.stopPropagation(); onConfirmCancel(); }}
              style={{
                padding: '7px 18px', borderRadius: 999, border: 'none',
                background: '#D44848', color: '#fff',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Discard</button>
            <button
              onPointerDown={e => { e.stopPropagation(); onDismissConfirm(); }}
              style={{
                padding: '7px 18px', borderRadius: 999,
                border: '1.5px solid #ECE3D4', background: '#fff',
                color: '#8C7A64', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Keep editing</button>
          </div>
        </div>
      )}

      <div style={{ padding: '14px 16px 16px' }}>

        {/* Header row: title + close button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <input
          autoFocus type="text" placeholder="New event"
          value={newTaskDraft.title}
          onChange={e => setNewTaskDraft(d => ({ ...d, title: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') onCommit(); if (e.key === 'Escape') onRequestCancel(); }}
          style={{
            flex: 1, border: 'none', outline: 'none',
            fontSize: 16, fontWeight: 700, color: '#4A3526',
            fontFamily: 'inherit', background: 'transparent',
            boxSizing: 'border-box',
          }}
        />
        <button
          onPointerDown={e => { e.stopPropagation(); onRequestCancel(); }}
          style={{
            flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
            border: '1.5px solid #D0C4B0', background: '#fff',
            color: '#8C7A64', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1, padding: 0, fontFamily: 'inherit',
            transition: 'border-color .12s, color .12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#D44848'; e.currentTarget.style.color = '#D44848'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#D0C4B0'; e.currentTarget.style.color = '#8C7A64'; }}
        >×</button>
        </div>

        {/* Description */}
        <input
          type="text" placeholder="Add description…"
          value={description}
          onChange={e => setDescription(e.target.value)}
          style={{
            width: '100%', border: 'none', outline: 'none',
            fontSize: 12, color: '#8C7A64',
            fontFamily: 'inherit', background: 'transparent',
            marginBottom: 10, boxSizing: 'border-box',
          }}
        />

        {/* Time range */}
        <div style={{ fontSize: 12, color: '#8C7A64', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ opacity: .6 }}>🕐</span>
          {fmtTime(draftBlock.startMin)} – {fmtTime(endMin)}
        </div>

        {/* Color dots + lock */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
          {EVENT_COLORS.map(c => (
            <button key={c.category}
              onClick={() => setNewTaskDraft(d => ({ ...d, category: c.category }))}
              style={{
                width: 18, height: 18, borderRadius: '50%', background: c.accent,
                border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
                outline: c.category === newTaskDraft.category ? `2.5px solid ${c.accent}` : 'none',
                outlineOffset: 2,
                transform: c.category === newTaskDraft.category ? 'scale(1.25)' : 'scale(1)',
                transition: 'transform .12s ease',
              }}
            />
          ))}
          <button
            onClick={() => setNewTaskDraft(d => ({ ...d, non_negotiable: !d.non_negotiable }))}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0,
              opacity: newTaskDraft.non_negotiable ? 1 : .35, transition: 'opacity .15s ease',
            }}
          >🔒</button>
        </div>

        <div style={{ height: 1, background: '#F0E8DC', marginBottom: 8 }} />

        {/* Otto toggle — compact when open, large when closed */}
        {isAdvanced ? (
          <button onClick={() => setIsAdvanced(false)} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '2px 0', marginBottom: 8, width: '100%',
          }}>
            <img src={wiseOtter} style={{ width: 26, height: 26, objectFit: 'contain' }} alt="" />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#A8703E' }}>Advanced planning ▲</span>
          </button>
        ) : (
          <button onClick={() => setIsAdvanced(true)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '0', marginBottom: 8, width: '100%',
          }}>
            <img src={wiseOtter} style={{ width: 120, height: 120, objectFit: 'contain', flexShrink: 0 }} alt="" />
            <span style={{
              fontSize: 13, fontWeight: 600, color: '#A8703E',
              borderBottom: '1px dashed #C9935A', lineHeight: 1.2, textAlign: 'left', paddingBottom: 1,
            }}>
              Advanced<br />planning ▼
            </span>
          </button>
        )}

        {/* ── Advanced planning panel ───────────────────────────────────────── */}
        {isAdvanced && (
          <div style={{ animation: 'fadeIn .18s ease' }}>
            <div style={{ height: 1, background: '#F0E8DC', marginBottom: 10 }} />

            {/* ── Deadline fields ──────────────────────────────────────────── */}
            <div style={{ marginBottom: 10 }}>
              {/* Hard deadline row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: '#8C7A64',
                  width: 76, flexShrink: 0,
                }}>Deadline</span>
                <input
                  type="date"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  style={{
                    flex: 1, border: '1px solid #ECE3D4', borderRadius: 6,
                    padding: '3px 6px', fontSize: 11, color: '#4A3526',
                    fontFamily: 'inherit', background: '#FDFAF7', outline: 'none',
                  }}
                />
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  fontSize: 11, color: isHardDeadline ? '#D44848' : '#8C7A64',
                  cursor: 'pointer', userSelect: 'none', fontWeight: 600,
                }}>
                  <input
                    type="checkbox" checked={isHardDeadline}
                    onChange={e => setIsHardDeadline(e.target.checked)}
                    style={{ accentColor: '#D44848', width: 12, height: 12, cursor: 'pointer' }}
                  />
                  Hard
                </label>
              </div>

              {/* Best done by row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: '#8C7A64',
                  width: 76, flexShrink: 0,
                }}>Best done by</span>
                <input
                  type="date"
                  value={bestDoneBy}
                  onChange={e => setBestDoneBy(e.target.value)}
                  style={{
                    flex: 1, border: '1px solid #ECE3D4', borderRadius: 6,
                    padding: '3px 6px', fontSize: 11, color: '#4A3526',
                    fontFamily: 'inherit', background: '#FDFAF7', outline: 'none',
                  }}
                />
                <span style={{ fontSize: 10, color: '#AD9B84', flexShrink: 0, width: 34 }}>soft</span>
              </div>
            </div>

            <div style={{ height: 1, background: '#F0E8DC', marginBottom: 10 }} />

            {/* Order specific checkbox */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 12, fontWeight: 600, color: '#8C7A64',
              cursor: 'pointer', marginBottom: 10, userSelect: 'none',
            }}>
              <input
                type="checkbox" checked={orderSpecific}
                onChange={e => { setOrderSpecific(e.target.checked); setSelectedIds(new Set()); }}
                style={{ accentColor: sel.accent, width: 14, height: 14, cursor: 'pointer' }}
              />
              Order specific
              {orderSpecific && (
                <span style={{ fontSize: 10, color: '#AD9B84', fontWeight: 400, marginLeft: 4 }}>
                  right-click drag to group
                </span>
              )}
            </label>

            {/* Group action banner */}
            {orderSpecific && selectedIds.size >= 2 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: `${sel.accent}18`, border: `1px solid ${sel.accent}44`,
                borderRadius: 8, padding: '5px 10px', marginBottom: 8, animation: 'fadeIn .15s ease',
              }}>
                <span style={{ fontSize: 11, color: sel.accent, fontWeight: 600 }}>
                  {selectedIds.size} selected
                </span>
                <button onClick={groupSelected} style={{
                  background: sel.accent, color: '#fff', border: 'none',
                  borderRadius: 6, padding: '3px 10px', fontSize: 11,
                  fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                }}>
                  Group together
                </button>
                <button onClick={() => setSelectedIds(new Set())} style={{
                  background: 'none', border: 'none', color: '#AD9B84',
                  fontSize: 13, cursor: 'pointer', padding: '0 2px',
                }}>×</button>
              </div>
            )}

            {/* Pie chart + subtask list */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ flexShrink: 0 }}>
                <PieChart
                  slices={subtasks.map((s, i) => ({ percent: s.percent, color: SLICE_COLORS[i % SLICE_COLORS.length] }))}
                  onDrag={handlePieDrag}
                  size={100}
                />
              </div>

              {/* Subtask list with lasso + reorder */}
              <div
                ref={listRef}
                style={{ flex: 1, minWidth: 0, position: 'relative', userSelect: 'none' }}
                onPointerMove={onListPointerMove}
                onPointerUp={onListPointerUp}
                onPointerCancel={onListPointerUp}
                onPointerDown={onListPointerDown}
                onContextMenu={e => e.preventDefault()}
              >
                {/* Lasso selection rect */}
                {selRect && selRect.height > 4 && (
                  <div style={{
                    position: 'absolute', left: 0, right: 0,
                    top: selRect.top, height: selRect.height,
                    background: `${sel.accent}18`,
                    border: `1.5px solid ${sel.accent}88`,
                    borderRadius: 4, pointerEvents: 'none', zIndex: 10,
                  }} />
                )}

                {subtasks.map((s, i) => {
                  const timeMin    = Math.max(1, Math.round(s.percent / 100 * total));
                  const isDragging = i === draggingIdx;
                  const isDropOver = orderSpecific && i === overIdx && draggingIdx !== null && i !== draggingIdx;
                  const isSelected = selectedIds.has(String(s.id));
                  const orderNum   = orderSpecific ? orderNums[i] : null;
                  const color      = SLICE_COLORS[i % SLICE_COLORS.length];
                  const isGrouped  = s.orderGroup != null;

                  return (
                    <div
                      key={s.id}
                      data-subtask-row="1"
                      data-subtask-id={String(s.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        marginBottom: 5, borderRadius: 5, padding: '1px 2px',
                        opacity: isDragging ? 0.35 : 1,
                        background: isSelected ? `${sel.accent}14` : 'transparent',
                        borderTop: isDropOver ? `2px solid ${sel.accent}` : '2px solid transparent',
                        outline: isSelected ? `1.5px solid ${sel.accent}55` : 'none',
                        transition: 'opacity .1s, background .1s',
                      }}
                    >
                      {/* Drag handle — only when order specific */}
                      {orderSpecific && (
                        <span
                          onPointerDown={e => onDragHandleDown(e, i)}
                          style={{
                            fontSize: 13, color: '#C0A882', cursor: 'grab',
                            flexShrink: 0, lineHeight: 1, touchAction: 'none',
                          }}
                        >≡</span>
                      )}

                      {/* Order number / bullet */}
                      <span style={{
                        fontSize: 11, fontWeight: 700, color,
                        width: orderSpecific ? 18 : 14,
                        textAlign: 'center', flexShrink: 0,
                      }}>
                        {orderSpecific
                          ? (isGrouped
                              ? <span title="Click to ungroup" onClick={() => ungroupItem(s.id)}
                                  style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}>
                                  {orderNum}.
                                </span>
                              : `${orderNum}.`)
                          : '●'}
                      </span>

                      {/* Name input */}
                      <input
                        type="text"
                        placeholder={`Subtask ${i + 1}`}
                        value={s.name}
                        onChange={e => setSubtasks(prev => prev.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))}
                        onPointerDown={e => e.stopPropagation()}
                        style={{
                          flex: 1, border: 'none', outline: 'none', fontSize: 12,
                          fontFamily: 'inherit', color: '#4A3526', background: 'transparent',
                          minWidth: 0,
                        }}
                      />

                      {/* Editable time */}
                      <input
                        type="text"
                        defaultValue={fmtMins(timeMin)}
                        key={`${s.id}-${s.locked ? 'L' : timeMin}`}
                        onBlur={e => handleTimeInput(s.id, e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                        onPointerDown={e => e.stopPropagation()}
                        style={{
                          width: 36, border: '1px solid transparent', borderRadius: 4,
                          outline: 'none', fontSize: 11, color: '#8C7A64',
                          fontFamily: 'inherit', background: 'transparent',
                          textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                          padding: '1px 2px', flexShrink: 0,
                        }}
                        onMouseEnter={e => e.target.style.borderColor = '#ECE3D4'}
                        onMouseLeave={e => { if (document.activeElement !== e.target) e.target.style.borderColor = 'transparent'; }}
                        onFocus={e => { e.target.select(); e.target.style.borderColor = sel.accent; }}
                        onBlurCapture={e => e.target.style.borderColor = 'transparent'}
                      />

                      {/* Remove */}
                      {subtasks.length > 1 && (
                        <button
                          onClick={() => removeSubtask(s.id)}
                          onPointerDown={e => e.stopPropagation()}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 13, color: '#C0A882', padding: 0, lineHeight: 1, flexShrink: 0,
                          }}
                        >×</button>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={addSubtask}
                  onPointerDown={e => e.stopPropagation()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, color: '#A8703E', fontFamily: 'inherit',
                    fontWeight: 600, padding: '2px 0', marginTop: 2,
                  }}
                >
                  <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add subtask
                </button>
              </div>
            </div>

            {/* Total */}
            <div style={{ fontSize: 11, color: '#8C7A64', textAlign: 'right', marginBottom: 10 }}>
              Total: <strong style={{ color: '#4A3526' }}>{fmtMins(total)}</strong>
            </div>

            <div style={{ height: 1, background: '#F0E8DC', marginBottom: 10 }} />
          </div>
        )}

        {/* Add to Calendar */}
        <button
          onClick={onCommit}
          disabled={!newTaskDraft.title.trim()}
          style={{
            width: '100%', padding: '10px',
            borderRadius: 10, border: 'none',
            background: newTaskDraft.title.trim()
              ? `linear-gradient(135deg, ${sel.accent}DD, ${sel.accent})`
              : '#E9DECC',
            color: newTaskDraft.title.trim() ? '#fff' : '#AD9B84',
            fontFamily: 'inherit', fontWeight: 700, fontSize: 14,
            cursor: newTaskDraft.title.trim() ? 'pointer' : 'default',
            transition: 'all .15s ease',
            boxShadow: newTaskDraft.title.trim() ? `0 6px 16px -6px ${sel.accent}88` : 'none',
          }}
        >
          Add to Calendar
        </button>
      </div>
    </div>
  );
}
