import { useRef, useState } from 'react';
import { PX_PER_MIN, DAY_START, DAY_END, snapMin } from './calendarUtils.js';

function hasFixedConflict(events, excludeId, day, startMin, duration) {
  return events.some(e =>
    e.id !== excludeId && e.day === day && e.fixed &&
    startMin < e.startMin + e.durationMin &&
    startMin + duration > e.startMin
  );
}

// Shared drag/resize hook used by WeekView.
// Handles: event drag, event top/bottom resize, draft block top/bottom resize,
// and draft block body shift (move up/down in same column).
export function useDragResize({
  gridRef, scrollRef, weekDayNums,
  eventsRef, setEvents,
  draftBlock, setDraftBlock,
  newTaskDraft, setNewTaskDraft,
  setUndoStack, callScheduler,
}) {
  const dragRef   = useRef(null);
  const resizeRef = useRef(null);
  const posRef    = useRef(null);
  const rafIdRef  = useRef(null);

  const [dragPos,        setDragPos]        = useState(null);
  const [resizingTopId,  setResizingTopId]  = useState(null);
  const [isDraftMoving,  setIsDraftMoving]  = useState(false);

  // ── Event chip drag ────────────────────────────────────────────────────────
  function startDrag(e, ev) {
    if (ev.fixed) return;
    e.preventDefault();
    if (!gridRef.current) return;
    gridRef.current.setPointerCapture(e.pointerId);
    const rect        = gridRef.current.getBoundingClientRect();
    const scrollTop   = scrollRef.current?.scrollTop || 0;
    const grabOffsetY = (e.clientY - rect.top + scrollTop) - (ev.startMin - DAY_START) * PX_PER_MIN;
    dragRef.current = {
      id: ev.id, grabOffsetY, duration: ev.durationMin,
      origDay: ev.day, origStart: ev.startMin,
      origClientY: e.clientY, origClientX: e.clientX,
    };
    posRef.current = { day: ev.day, startMin: ev.startMin };
    setDragPos({ day: ev.day, startMin: ev.startMin });
  }

  // ── Event chip resize (top = move start, bottom = move end) ───────────────
  function startResize(e, ev, edge) {
    e.preventDefault();
    gridRef.current?.setPointerCapture(e.pointerId);
    resizeRef.current = {
      kind: 'event', type: edge,
      id: ev.id,
      fixedStart: ev.startMin,
      fixedEnd:   ev.startMin + ev.durationMin,
    };
    if (edge === 'top') setResizingTopId(ev.id);
  }

  // ── Draft block top/bottom resize ─────────────────────────────────────────
  function startDraftResize(e, edge) {
    e.preventDefault();
    e.stopPropagation();
    gridRef.current?.setPointerCapture(e.pointerId);
    resizeRef.current = {
      kind: 'draft', type: edge,
      fixedStart: draftBlock.startMin,
      fixedEnd:   draftBlock.startMin + newTaskDraft.duration_planned,
    };
  }

  // ── Draft block body shift (drag whole block up/down) ─────────────────────
  function startDraftMove(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!gridRef.current) return;
    gridRef.current.setPointerCapture(e.pointerId);
    const rect      = gridRef.current.getBoundingClientRect();
    const scrollTop = scrollRef.current?.scrollTop || 0;
    const grabOffsetY = (e.clientY - rect.top + scrollTop) - (draftBlock.startMin - DAY_START) * PX_PER_MIN;
    resizeRef.current = {
      kind: 'draftMove',
      grabOffsetY,
      duration: newTaskDraft.duration_planned,
    };
    setIsDraftMoving(true);
  }

  // ── Pointer move ──────────────────────────────────────────────────────────
  function handlePointerMove(e) {
    if (!dragRef.current && !resizeRef.current) return;
    if (!gridRef.current) return;
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      if (!gridRef.current) return;
      const rect      = gridRef.current.getBoundingClientRect();
      const scrollTop = scrollRef.current?.scrollTop || 0;

      if (dragRef.current) {
        const dr     = dragRef.current;
        const colW   = rect.width / 7;
        const colIdx = Math.max(0, Math.min(6, Math.floor((e.clientX - rect.left) / colW)));
        const day    = weekDayNums[colIdx];
        const relY   = e.clientY - rect.top + scrollTop - dr.grabOffsetY;
        const clamped = Math.max(DAY_START, Math.min(DAY_END - dr.duration, snapMin(DAY_START + relY / PX_PER_MIN)));
        const blocked = hasFixedConflict(eventsRef.current, dr.id, day, clamped, dr.duration);
        const prev    = posRef.current;
        if (!prev || prev.day !== day || prev.startMin !== clamped || prev.blocked !== blocked) {
          posRef.current = { day, startMin: clamped, blocked };
          setDragPos({ day, startMin: clamped, blocked });
        }
        return;
      }

      if (resizeRef.current) {
        const rz       = resizeRef.current;
        const relY     = e.clientY - rect.top + scrollTop;
        const mouseMin = snapMin(DAY_START + relY / PX_PER_MIN);

        if (rz.kind === 'draftMove') {
          const colW   = rect.width / 7;
          const colIdx = Math.max(0, Math.min(6, Math.floor((e.clientX - rect.left) / colW)));
          const day    = weekDayNums[colIdx];
          const newStart = Math.max(DAY_START, Math.min(DAY_END - rz.duration,
            snapMin(DAY_START + (relY - rz.grabOffsetY) / PX_PER_MIN)));
          setDraftBlock(d => ({ ...d, day, startMin: newStart }));

        } else if (rz.kind === 'draft') {
          if (rz.type === 'top') {
            const newStart = Math.max(DAY_START, Math.min(rz.fixedEnd - 15, mouseMin));
            setDraftBlock(d => ({ ...d, startMin: newStart }));
            setNewTaskDraft(d => ({ ...d, duration_planned: rz.fixedEnd - newStart }));
          } else {
            const newEnd = Math.max(rz.fixedStart + 15, Math.min(DAY_END, mouseMin));
            setNewTaskDraft(d => ({ ...d, duration_planned: newEnd - rz.fixedStart }));
          }

        } else { // kind === 'event'
          let newStart, newDuration;
          if (rz.type === 'top') {
            newStart    = Math.max(DAY_START, Math.min(rz.fixedEnd - 15, mouseMin));
            newDuration = rz.fixedEnd - newStart;
          } else {
            const newEnd = Math.max(rz.fixedStart + 15, Math.min(DAY_END, mouseMin));
            newStart     = rz.fixedStart;
            newDuration  = newEnd - rz.fixedStart;
          }
          setEvents(prev => prev.map(x =>
            x.id === rz.id ? { ...x, startMin: newStart, durationMin: newDuration } : x
          ));
        }
      }
    });
  }

  // ── Pointer up ────────────────────────────────────────────────────────────
  function handlePointerUp(e) {
    cancelAnimationFrame(rafIdRef.current);
    setResizingTopId(null);
    setIsDraftMoving(false);
    const dr  = dragRef.current;
    const pos = posRef.current;
    if (dr && pos) {
      if (pos.blocked) {
        dragRef.current = null; posRef.current = null; setDragPos(null);
        resizeRef.current = null;
        return;
      }
      const movedY   = Math.abs(e.clientY - dr.origClientY);
      const movedX   = Math.abs(e.clientX - dr.origClientX);
      const realDrag = movedY > 8 || movedX > 8;
      if (realDrag && (pos.day !== dr.origDay || pos.startMin !== dr.origStart)) {
        const snapshot = [...eventsRef.current];
        setUndoStack(prev => [...prev.slice(-4), { events: snapshot, dragId: dr.id }]);
        const postDrag = eventsRef.current.map(x =>
          x.id === dr.id ? { ...x, day: pos.day, startMin: pos.startMin } : x
        );
        callScheduler(postDrag, dr.id, snapshot);
      }
    }
    dragRef.current = null; posRef.current = null; setDragPos(null);
    resizeRef.current = null;
  }

  function handlePointerCancel() {
    cancelAnimationFrame(rafIdRef.current);
    dragRef.current = null; resizeRef.current = null; posRef.current = null;
    setDragPos(null); setResizingTopId(null); setIsDraftMoving(false);
  }

  return {
    dragRef, dragPos, resizingTopId, isDraftMoving,
    startDrag, startResize, startDraftResize, startDraftMove,
    handlePointerMove, handlePointerUp, handlePointerCancel,
  };
}
