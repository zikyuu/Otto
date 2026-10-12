import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { CATEGORY_COLORS, DEFAULT_CAT_COLOR } from '../../data/fixtures.js';
import {
  PX_PER_MIN, DAY_START, DAY_END, GRID_H, HOURS, DOW_NAMES,
  fmtTime, snapMin, getDays, isoDate,
} from './calendarUtils.js';
import { useDragResize } from './useDragResize.js';
import EventCreation from './EventCreation.jsx';
import EventChip from './EventChip.jsx';
import LinkLayer from './LinkLayer.jsx';
import { EventPanel, GrinderPanel, ClipPanel, DiffPanel, hasPanelContent } from './SidePanels.jsx';
import { setGoal, resetGoals, displayTitle, planRows, workDone, reflectionMinutes, remainder, findFreeSlot, restSignature, WHOLE } from './sessionGoals.js';
import { sendReflection } from '../../api.js';
import DeleteButton from '../../components/DeleteButton.jsx';
import Mascot from '../../components/Mascot.jsx';
import { IconUndo, IconSelect, IconClose, IconLock, IconSteps } from './Icons.jsx';
import {
  ORDERED, GROUPED, addLink, removeLink, dropEvent, cluster, isLinked, reorderChain, linkProblem,
} from './linkUtils.js';
import { makeWindow, mergeWindows, affectedEvents, applyClipChoices, diffEvents } from './selectionMath.js';
import { suggestRoom } from './roomSuggest.js';

const FRESH_DRAFT = { title: '', duration_planned: 60, category: 'deep_work', effort_tier: 'med', deadline_iso: '', non_negotiable: false };
const LONG_PRESS_MS = 450;
const STAGGER_MS = 85;
const CEREMONY_MS = 650;   // an explicit reschedule always gets a visible "thinking" beat, even when the engine answers in 20 ms
const pause = ms => new Promise(r => setTimeout(r, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : ms));

// ── DraftGhost ────────────────────────────────────────────────────────────────
function DraftGhost({ draftBlock, newTaskDraft, onCancel, startDraftResize, startDraftMove }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onPointerDown={e => e.stopPropagation()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute', top: (draftBlock.startMin - DAY_START) * PX_PER_MIN, left: 3, right: 3,
        height: Math.min(newTaskDraft.duration_planned, DAY_END - draftBlock.startMin) * PX_PER_MIN - 2,   // a longer one is shown only as far as the day goes
        background: 'rgba(154,106,63,.08)', border: '1.5px dashed var(--accent)', borderRadius: 6,
        overflow: 'visible', zIndex: 10, display: 'flex', alignItems: 'flex-start', padding: '4px 7px',
      }}
    >
      <DeleteButton visible={hovered} onDelete={onCancel} label="Discard draft" />
      <div onPointerDown={e => startDraftResize(e, 'top')}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, cursor: 'ns-resize', zIndex: 2 }} />
      <div onPointerDown={e => startDraftMove(e)}
        style={{ position: 'absolute', top: 8, left: 0, right: 0, bottom: 8, cursor: 'grab', display: 'flex', alignItems: 'center', paddingLeft: 8, overflow: 'hidden' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>
          {newTaskDraft.title || 'New event'}
        </span>
      </div>
      <div onPointerDown={e => startDraftResize(e, 'bottom')}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, cursor: 'ns-resize', zIndex: 2 }} />
    </div>
  );
}

// ── WeekView ──────────────────────────────────────────────────────────────────
// numDays: 7 = one week, 14 = two. Everything below is written for N columns.
export default function WeekView({ weekOffset, numDays = 7, sel, setSel, events, setEvents, addTick = 0 }) {
  const gridRef   = useRef(null);
  const scrollRef = useRef(null);
  const eventsRef = useRef(events);
  useEffect(() => { eventsRef.current = events; }, [events]);

  const compact = numDays > 7;
  const weekDates   = useMemo(() => getDays(weekOffset, numDays), [weekOffset, numDays]);
  const weekDayNums = weekDates.map(d => d.getDate());
  const dayLabel    = num => { const i = weekDayNums.indexOf(num); return i < 0 ? `${num}` : `${DOW_NAMES[i % 7]} ${num}`; };
  const todayStr    = new Date().toDateString();
  const dayIdx      = d => weekDayNums.indexOf(d);
  // has this block already happened? (then it is time to ask how it went)
  const isPast = ev => {
    const i = dayIdx(ev.day);
    if (i < 0) return false;
    const d = new Date(weekDates[i]); d.setHours(0, 0, 0, 0);
    return d.getTime() + (ev.startMin + ev.durationMin) * 60000 <= Date.now();
  };

  // the Meatball Grinder: work parked on purpose, never scheduled until the user asks
  const GRINDER_KEY = 'otto.grinder.v1';
  const [grinder, setGrinder] = useState(() => { try { return JSON.parse(localStorage.getItem(GRINDER_KEY)) || []; } catch { return []; } });
  const [grinderOpen, setGrinderOpen] = useState(false);
  useEffect(() => { try { localStorage.setItem(GRINDER_KEY, JSON.stringify(grinder)); } catch { /* private window */ } }, [grinder]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote,    setAiNote]    = useState('');
  const [conflicts, setConflicts] = useState(new Set());
  const [undoStack, setUndoStack] = useState([]);
  const [flips,     setFlips]     = useState({});
  const [ceremony,  setCeremony]  = useState(false);   // the thinking beat is showing
  const [toast,     setToast]     = useState(null);    // summary after a reschedule
  const [orderIssues, setOrderIssues] = useState([]);   // [{id, prereq_ids}]: placed before something it must follow
  const [roomFor, setRoomFor]   = useState(null);     // {ids, enough}: the windows being edited are time to clear FOR these events
  const [moveFailed, setMoveFailed]   = useState(null);    // 'later' | 'earlier': that fix was tried and there was no room

  const [draftBlock,   setDraftBlock]   = useState(null);
  const [newTaskDraft, setNewTaskDraft] = useState(FRESH_DRAFT);
  const [pendingLink,  setPendingLink]  = useState(null);   // new event will follow this one

  const [mode, setMode]           = useState('normal');     // normal | select | clip | diff
  const [windows, setWindows]     = useState([]);
  const [selecting, setSelecting] = useState(null);         // {day, a, b} while dragging a window
  const [choices, setChoices]     = useState({});
  const [proposal, setProposal]   = useState(null);
  const [diffView, setDiffView]   = useState('after');
  const [panelError, setPanelError] = useState('');

  const [selectedId, setSelectedId] = useState(null);
  const [highlight,  setHighlight]  = useState(null);       // Set of ids (long-press cluster)
  const [linkDrag,   setLinkDrag]   = useState(null);       // {fromId, x, y}
  const [linkPick,   setLinkPick]   = useState(null);       // {fromId, toId, x, y}
  const linkRef = useRef(null);
  const selRef  = useRef(null);
  const pressRef = useRef(null);
  const winRef   = useRef(null);   // a selection window whose edge is being dragged

  // the clock, for the now-line (a minute is fine-grained enough)
  const [nowMin, setNowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); });
  useEffect(() => {
    const t = setInterval(() => { const d = new Date(); setNowMin(d.getHours() * 60 + d.getMinutes()); }, 30000);
    return () => clearInterval(t);
  }, []);
  const todayCol = weekDates.findIndex(d => d.toDateString() === new Date().toDateString());

  // "Add event" in the header: start a draft at the next free hour of today (or the first visible day)
  const lastTick = useRef(addTick);
  useEffect(() => {
    if (addTick === lastTick.current) return;
    lastTick.current = addTick;
    if (draftBlock) return;
    const col = Math.max(todayCol, 0);
    const start = todayCol >= 0 ? Math.min(Math.max(Math.ceil((nowMin + 15) / 60) * 60, DAY_START), DAY_END - 60) : 9 * 60;
    setDraftBlock({ day: weekDayNums[col], startMin: start });
  }, [addTick]);

  // grid width, for the link layer and the slide-in distances
  const [gridW, setGridW] = useState(0);
  useLayoutEffect(() => {
    if (!gridRef.current) return;
    const ro = new ResizeObserver(([entry]) => setGridW(entry.contentRect.width));
    ro.observe(gridRef.current);
    return () => ro.disconnect();
  }, []);

  const shown = mode === 'diff' && proposal && diffView === 'after' ? proposal.events : events;
  const changedIds = useMemo(
    () => (mode === 'diff' && proposal ? new Set(diffEvents(events, proposal.events).map(c => c.id)) : null),
    [mode, proposal, events]);

  // ── talking to the scheduler ────────────────────────────────────────────────
  async function requestSchedule(body) {
    const res = await fetch('/api/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_days: weekDayNums, week_start_iso: isoDate(weekDates[0]), ...body }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const unreachable = res.status >= 500 && typeof err.detail !== 'string';
      throw new Error(
        typeof err.detail === 'string' ? err.detail
        : unreachable ? "Otto's server isn't reachable. Is the backend running on port 8000?"
        : `HTTP ${res.status}`);
    }
    return res.json();
  }

  // Rescheduled events travel from where they were, one after another.
  function flipsFor(before, after, skip = []) {
    const colW = gridW / numDays;
    const out = {};
    diffEvents(before, after)
      .filter(c => c.kind === 'moved' && !skip.includes(c.id))
      .sort((a, b) => a.to.day - b.to.day || a.to.startMin - b.to.startMin)
      .forEach((c, i) => {
        const fi = weekDayNums.indexOf(c.from.day), ti = weekDayNums.indexOf(c.to.day);
        if (ti < 0) return;
        out[c.id] = {
          dx: fi < 0 ? 0 : (fi - ti) * colW, dy: (c.from.startMin - c.to.startMin) * PX_PER_MIN, delay: i * STAGGER_MS,
          fromCol: fi, fromStart: c.from.startMin, dur: c.from.durationMin, title: c.title,
        };
      });
    return out;
  }
  function playFlips(f) {
    const n = Object.keys(f).length;
    if (!n) return;
    setFlips(f);
    const names = Object.values(f).slice(0, 2).map(x => x.title);
    const id = Date.now();
    setToast({ id, text: n === 1 ? `Moved “${names[0]}”` : `Moved ${n} events`, sub: n > 1 ? names.join(', ') + (n > 2 ? ` and ${n - 2} more` : '') : '' });
    setTimeout(() => setFlips({}), 1700 + n * STAGGER_MS);
    setTimeout(() => setToast(t => (t && t.id === id ? null : t)), 3600);
  }

  // opts.planIds: just-created events the scheduler may decide to split (from the learned focus span)
  // opts.keepOnError: on failure keep the change instead of reverting it (used when creating)
  async function callScheduler(postDragEvents, pinnedId, snapshotBeforeDrag, opts = {}) {
    const { planIds = [], keepOnError = false, tried = null, fixOrder, ceremonial = false } = opts;
    const pins = [pinnedId].flat().filter(Boolean);
    setAiLoading(true); setAiNote(''); setMoveFailed(null); setCeremony(ceremonial);
    try {
      const [data] = await Promise.all([
        requestSchedule({ events: postDragEvents, pinned_ids: pins, plan_ids: planIds, ...(fixOrder ? { fix_order: fixOrder } : {}) }),
        ceremonial ? pause(CEREMONY_MS) : null,
      ]);
      playFlips(flipsFor(postDragEvents, data.events, pins));
      setEvents(data.events);
      setConflicts(new Set(data.conflicts || []));
      setAiNote(data.explanation || '');
      setOrderIssues(data.order_violations || []);
      setMoveFailed(tried && (data.order_violations || []).length > 0 ? tried : null);
      return data;
    } catch (err) {
      console.warn('[scheduler] failed:', err.message);
      if (keepOnError) setAiNote(`⚠ Added as-is: couldn't check it against your schedule. (${err.message})`);
      else { setEvents(snapshotBeforeDrag); setAiNote(`⚠ Scheduler unavailable, change reverted. (${err.message})`); }
    } finally {
      setAiLoading(false); setCeremony(false);
    }
  }

  const {
    cancelDrag, dragRef, dragPos, resizingTopId, isDraftMoving,
    startDrag, startResize, startDraftResize, startDraftMove,
    handlePointerMove, handlePointerUp, handlePointerCancel,
  } = useDragResize({
    gridRef, scrollRef, weekDayNums, eventsRef, setEvents,
    draftBlock, setDraftBlock, newTaskDraft, setNewTaskDraft, setUndoStack, callScheduler,
  });

  // ── new events ──────────────────────────────────────────────────────────────
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  function cancelDraft() {
    setConfirmingCancel(false); setDraftBlock(null); setPendingLink(null);
    setNewTaskDraft(FRESH_DRAFT);
  }
  function requestCancel() {
    if (newTaskDraft.title.trim()) setConfirmingCancel(true); else cancelDraft();
  }
  // Click-outside: anything that bubbles past EventCreation's stopPropagation → requestCancel
  useEffect(() => {
    if (!draftBlock || isDraftMoving) return;
    document.addEventListener('pointerdown', requestCancel);
    return () => document.removeEventListener('pointerdown', requestCancel);
  }, [draftBlock, isDraftMoving, newTaskDraft.title]);

  function deleteEvent(id) {
    setUndoStack(prev => [...prev.slice(-4), { events, dragId: null }]);
    setEvents(prev => dropEvent(prev, id));
    setConflicts(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (selectedId === id) setSelectedId(null);
  }
  function toggleLock(id) { setEvents(prev => prev.map(e => e.id === id ? { ...e, fixed: !e.fixed } : e)); }

  // The new event is added as the user drew it, then handed to the scheduler, which may re-place
  // events it displaces and, from the user's learned focus span, decide to split a long one.
  function commitDraft(details = {}) {
    if (!draftBlock || !newTaskDraft.title.trim()) return;
    const clean = obj => Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0) && v !== false));
    const id = 'task_' + Date.now();
    const created = {
      id, title: newTaskDraft.title.trim(), day: draftBlock.day, startMin: draftBlock.startMin,
      durationMin: newTaskDraft.duration_planned, category: newTaskDraft.category, fixed: false,
      ...(newTaskDraft.non_negotiable ? { non_negotiable: true } : {}),
      ...clean(details),
      ...(details.deadline_iso ? { hard_deadline: details.hard_deadline !== false } : {}),
    };
    let next = [...events, created];
    if (pendingLink) next = addLink(next, pendingLink.fromId, id, ORDERED);
    setEvents(next);
    cancelDraft();
    callScheduler(next, id, events, { planIds: [id], keepOnError: true, ceremonial: true });
  }

  function handleUndo() {
    if (undoStack.length === 0) return;
    const top = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setEvents(top.events);
    setAiNote(''); setOrderIssues([]);
    setConflicts(top.dragId ? new Set([top.dragId]) : new Set());
  }

  useEffect(() => {
    if (conflicts.size === 0) return;
    const t = setTimeout(() => setConflicts(new Set()), 1400);
    return () => clearTimeout(t);
  }, [conflicts]);

  // ── links ───────────────────────────────────────────────────────────────────
  const gridPoint = e => {
    const r = gridRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };    // the grid is as tall as its content, so no scroll offset
  };
  const eventAt = (x, y, exceptId) => {
    const col = Math.floor(x / (gridW / numDays));
    const min = DAY_START + y / PX_PER_MIN;
    return shown.find(e => e.id !== exceptId && e.day === weekDayNums[col] && min >= e.startMin && min < e.startMin + e.durationMin);
  };

  function startLink(e, ev) {
    gridRef.current.setPointerCapture(e.pointerId);
    linkRef.current = { fromId: ev.id };
    setLinkDrag({ fromId: ev.id, ...gridPoint(e) });
    setSelectedId(null);
  }
  function endLink(e) {
    const lk = linkRef.current;
    linkRef.current = null; setLinkDrag(null);
    if (!lk) return;
    const { x, y } = gridPoint(e);
    const target = eventAt(x, y, lk.fromId);
    if (target) { setLinkPick({ fromId: lk.fromId, toId: target.id, x, y }); return; }
    const col = Math.floor(x / (gridW / numDays));
    if (col >= 0 && col < numDays && y >= 0 && y <= GRID_H) {
      const start = Math.min(snapMin(DAY_START + y / PX_PER_MIN), DAY_END - 60);
      setPendingLink({ fromId: lk.fromId });
      setDraftBlock({ day: weekDayNums[col], startMin: start });
    }
  }
  function chooseLinkType(type) {
    const { fromId, toId } = linkPick;
    setLinkPick(null);
    const next = addLink(events, fromId, toId, type);
    if (next === events) return;
    setUndoStack(prev => [...prev.slice(-4), { events, dragId: null }]);
    setEvents(next);
    if (type === ORDERED) callScheduler(next, fromId, events, { ceremonial: true });
  }
  function unlink(l) {
    setUndoStack(prev => [...prev.slice(-4), { events, dragId: null }]);
    setEvents(removeLink(events, l.from, l.to, l.type));
  }
  // Something sits before an event it has to follow. Three ways out: move the dependent later (its prerequisites
  // stay put), pull the prerequisites earlier (the dependent stays put), or drop the link.
  function moveDependentLater() {
    const pins = [...new Set(orderIssues.flatMap(v => v.prereq_ids))];
    callScheduler(events, pins, events, { tried: 'later', ceremonial: true });
  }
  async function pullPrereqsEarlier() {
    const data = await callScheduler(events, orderIssues.map(v => v.id), events, { tried: 'earlier', fixOrder: 'move_prerequisites', ceremonial: true });
    // no room as things stand: instead of leaving the user stuck, propose a block of time to clear
    if (data?.order_violations?.length) startMakeRoom(data.order_violations, true);
  }

  // Select a block of time to clear so the prerequisites can finish before the event that waits for them.
  // Otto proposes the smallest block that holds them; the user drags its edges, or adds and removes windows.
  function startMakeRoom(issues, auto = false) {
    const evs = eventsRef.current;
    const found = issues.map(v => suggestRoom({ events: evs, dependentId: v.id, weekDayNums, earliestFree: day => firstFree(weekDayNums.indexOf(day)) }));
    setMode('select'); setChoices({}); setProposal(null); setPanelError(''); setSelectedId(null); setHighlight(null);
    setWindows(mergeWindows(found.flatMap(f => f.windows)));
    setRoomFor({ ids: issues.map(v => v.id), enough: found.every(f => f.enough), auto });
  }
  function dropOrderLinks() {
    let next = events;
    for (const v of orderIssues) for (const p of v.prereq_ids) next = removeLink(next, p, v.id, ORDERED);
    setUndoStack(prev => [...prev.slice(-4), { events, dragId: null }]);
    setEvents(next);
    setOrderIssues([]); setAiNote('');
  }

  function reorderSteps(order) {
    const next = reorderChain(events, order);
    setUndoStack(prev => [...prev.slice(-4), { events, dragId: null }]);
    setEvents(next);
    callScheduler(next, null, events, { ceremonial: true });
  }

  // long press on a linked event lights up its whole cluster instead of starting a drag
  function armLongPress(e, ev) {
    if (!isLinked(shown, ev.id)) return;
    const origin = { x: e.clientX, y: e.clientY };
    const stop = () => {
      clearTimeout(pressRef.current);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    const move = m => { if (Math.hypot(m.clientX - origin.x, m.clientY - origin.y) > 6) stop(); };
    pressRef.current = setTimeout(() => {
      cancelDrag();
      setHighlight(cluster(eventsRef.current, ev.id));
      stop();
    }, LONG_PRESS_MS);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }
  useEffect(() => {
    if (!highlight) return;
    const off = () => setHighlight(null);
    const key = e => { if (e.key === 'Escape') off(); };
    const t = setTimeout(() => document.addEventListener('pointerdown', off), 0);   // not the press that lit it
    document.addEventListener('keydown', key);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', key); };
  }, [highlight]);

  // ── goals, reflection, grinder ───────────────────────────────────────────────
  const nowSlot = () => {
    const n = new Date();
    return { idx: weekDates.findIndex(d => d.toDateString() === n.toDateString()), min: n.getHours() * 60 + n.getMinutes() };
  };
  function addRemainder(base, rem, category) {
    // first gap this week, from now on if today is visible, otherwise from the start of the view
    const { idx, min } = nowSlot();
    const slot = findFreeSlot(eventsRef.current, { dayNums: weekDayNums, minutes: rem.minutes, fromIdx: Math.max(idx, 0), fromMin: idx >= 0 ? min : 0, dayStart: DAY_START, dayEnd: DAY_END });
    if (!slot) return null;
    const id = 'rem_' + Date.now();
    const created = {
      id, title: `${base} (remainder)`, ...slot, durationMin: rem.minutes, category, fixed: false,
      subtasks: rem.parts.filter(p => p.key !== WHOLE).map((p, i) => ({ id: `${id}_${i}`, name: p.name, minutes: Math.max(p.minutes, 5) })),
    };
    setUndoStack(prev => [...prev.slice(-4), { events: eventsRef.current, dragId: null }]);
    setEvents(prev => [...prev, created]);
    playFlips({ [id]: { dx: 0, dy: -40, delay: 0, fromCol: -1, fromStart: slot.startMin, dur: rem.minutes, title: created.title } });
    return id;
  }
  function parkRemainder(base, rem, note) {
    const id = 'g_' + Date.now();
    setGrinder(g => [{ id, title: `${base} (remainder)`, minutes: rem.minutes, category: 'admin', note, parts: rem.parts, parked_iso: new Date().toISOString() }, ...g]);
    return id;
  }
  function handleReflection(ev, { choice, actual, notes, rows }, action) {
    const { planned, done } = workDone(rows, actual);
    const minutes = reflectionMinutes(ev.durationMin, planned, done);
    sendReflection({ taskId: ev.id, choice, plannedMinutes: ev.durationMin, actualMinutes: minutes, category: ev.category }).catch(() => {});   // the learning loop; a failure must not block the page
    const rem = remainder(rows, actual);
    const base = ev.base_title ?? ev.title.replace(/ \(\d+\/\d+\)$/, '');
    // saving again replaces what the first save created, so editing never leaves two copies of the remainder
    const old = ev.reflection?.remainder_ref;
    if (old?.kind === 'event') setEvents(prev => prev.filter(e => e.id !== old.id));
    if (old?.kind === 'grinder') setGrinder(g => g.filter(x => x.id !== old.id));
    let outcome = null, ref = null;
    if (rem.minutes > 0 && action === 'fit') {
      const id = addRemainder(base, rem, ev.category);
      if (id) { outcome = 'fit'; ref = { kind: 'event', id }; }
      else { outcome = 'park'; ref = { kind: 'grinder', id: parkRemainder(base, rem, 'There was no room left this week.') }; }
    } else if (rem.minutes > 0 && action === 'park') { outcome = 'park'; ref = { kind: 'grinder', id: parkRemainder(base, rem, `What was left after “${ev.title}”.`) }; }
    setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, reflection: { choice, actual, notes, remainder: outcome, remainder_ref: ref, at: Date.now() } } : e)));
    const id = Date.now();
    setToast({ id, text: outcome === 'park' ? 'Saved. The rest is in the Meatball Grinder.' : outcome === 'fit' ? 'Saved. The rest is back in your week.' : 'Saved. Otto will learn from this.', sub: '' });
    setTimeout(() => setToast(t => (t && t.id === id ? null : t)), 3200);
  }
  // goals that leave part of the work in no block: offer to schedule it, once per distinct shortfall
  function handleRest(ev, action, rest) {
    const base = ev.base_title ?? ev.title.replace(/ \(\d+\/\d+\)$/, '').replace(/ \(remainder\)$/, '');
    const old = ev.rest?.ref;
    if (old?.kind === 'event') setEvents(prev => prev.filter(e => e.id !== old.id));
    if (old?.kind === 'grinder') setGrinder(g => g.filter(x => x.id !== old.id));
    let outcome = action, ref;
    if (action === 'fit') {
      const id = addRemainder(base, rest, ev.category);
      if (id) ref = { kind: 'event', id };
      else { outcome = 'park'; ref = { kind: 'grinder', id: parkRemainder(base, rest, 'There was no room left this week.') }; }
    } else ref = { kind: 'grinder', id: parkRemainder(base, rest, `Left out of “${ev.title}” by its goal.`) };
    setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, rest: { sig: restSignature(rest), action: outcome, ref } } : e)));
    const id = Date.now();
    setToast({ id, text: outcome === 'park' ? 'The rest is in the Meatball Grinder.' : 'The rest is back in your week.', sub: '' });
    setTimeout(() => setToast(t => (t && t.id === id ? null : t)), 3200);
  }
  function placeFromGrinder(item) {
    if (addRemainder(item.title.replace(/ \(remainder\)$/, ''), { minutes: item.minutes, parts: item.parts || [] }, item.category || 'admin')) setGrinder(g => g.filter(x => x.id !== item.id));
    else setAiNote('⚠ There is no free gap that long this week. It stays in the Meatball Grinder.');
  }

  // ── reschedule selection mode ───────────────────────────────────────────────
  function enterSelect() { setMode('select'); setRoomFor(null); setWindows([]); setChoices({}); setProposal(null); setPanelError(''); setSelectedId(null); setHighlight(null); }
  function leaveSelect() { setMode('normal'); setRoomFor(null); setWindows([]); setSelecting(null); setChoices({}); setProposal(null); setPanelError(''); }
  useEffect(() => {
    if (mode === 'normal') return;
    const key = e => { if (e.key === 'Escape') leaveSelect(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [mode]);

  const affected = useMemo(() => (mode === 'clip' ? affectedEvents(events, windows) : []), [mode, events, windows]);

  async function proposeArrangement() {
    setAiLoading(true); setPanelError(''); setCeremony(true);
    try {
      const prepared = applyClipChoices(events, windows, choices);
      const [data] = await Promise.all([requestSchedule({
        events: prepared, pinned_ids: roomFor ? roomFor.ids : [],
        blocked_windows: windows.map(w => ({ day: w.day, start_min: w.start, end_min: w.end, ...(roomFor ? { for_ids: roomFor.ids } : {}) })),
        ...(roomFor ? { fix_order: 'move_prerequisites' } : {}),
      }), pause(CEREMONY_MS)]);
      setProposal({ ...data, base: prepared });
      setDiffView('after');
      setMode('diff');
    } catch (err) { setPanelError(err.message); }
    finally { setAiLoading(false); setCeremony(false); }
  }
  function applyProposal() {
    setUndoStack(prev => [...prev.slice(-4), { events, dragId: null }]);
    playFlips(flipsFor(events, proposal.events));
    setEvents(proposal.events);
    setConflicts(new Set(proposal.conflicts || []));
    setAiNote(proposal.explanation || '');
    setOrderIssues(proposal.order_violations || []);   // the warning clears itself if the new arrangement fixed the order
    setMoveFailed(null);
    leaveSelect();
  }

  // pointer handling on the grid (shared by dragging, linking and window selection)
  function onGridMove(e) {
    if (winRef.current) {
      const wr = winRef.current;
      const m = snapMin(DAY_START + (e.clientY - gridRef.current.getBoundingClientRect().top) / PX_PER_MIN);
      const lo = Math.max(DAY_START, firstFree(weekDayNums.indexOf(wr.day)));
      const start = wr.edge === 'top' ? Math.min(Math.max(m, lo), wr.end - 15) : wr.start;
      const end = wr.edge === 'bottom' ? Math.max(Math.min(m, DAY_END), wr.start + 15) : wr.end;
      setWindows(ws => ws.map(x => (x.day === wr.day && x.start === wr.start && x.end === wr.end ? { ...x, start, end } : x)));
      wr.start = start; wr.end = end;
      return;
    }
    if (linkRef.current) { setLinkDrag(d => d && { ...d, ...gridPoint(e) }); return; }
    if (selRef.current) {
      const rel = e.clientY - gridRef.current.getBoundingClientRect().top;
      setSelecting(s => s && { ...s, b: DAY_START + rel / PX_PER_MIN });
      return;
    }
    handlePointerMove(e);
  }
  function onGridUp(e) {
    if (winRef.current) { winRef.current = null; setWindows(ws => mergeWindows(ws)); return; }
    if (linkRef.current) { endLink(e); return; }
    if (selRef.current) {
      const s = selRef.current; selRef.current = null;
      const rel = e.clientY - gridRef.current.getBoundingClientRect().top;
      const w = makeWindow(s.day, s.a, DAY_START + rel / PX_PER_MIN, 15, 15, firstFree(weekDayNums.indexOf(s.day)), DAY_END);
      setSelecting(null);
      if (w) setWindows(ws => mergeWindows([...ws, w]));
      return;
    }
    // a press that didn't move is a click: select the event
    const dr = dragRef.current;
    if (dr && Math.abs(e.clientX - dr.origClientX) <= 8 && Math.abs(e.clientY - dr.origClientY) <= 8) {
      setSelectedId(id => (id === dr.id ? null : dr.id));
    }
    handlePointerUp(e);
  }
  function onGridCancel() { winRef.current = null; linkRef.current = null; selRef.current = null; setLinkDrag(null); setSelecting(null); handlePointerCancel(); }

  function startWinResize(e, w, edge) {
    e.preventDefault(); e.stopPropagation();
    gridRef.current.setPointerCapture(e.pointerId);
    winRef.current = { day: w.day, edge, start: w.start, end: w.end };
  }

  function onColumnDown(e, day) {
    if (mode === 'select') {
      e.preventDefault();
      if (firstFree(weekDayNums.indexOf(day)) >= DAY_END) return;
      gridRef.current.setPointerCapture(e.pointerId);
      const a = DAY_START + (e.clientY - gridRef.current.getBoundingClientRect().top) / PX_PER_MIN;
      selRef.current = { day, a };
      setSelecting({ day, a, b: a });
      return;
    }
    if (mode !== 'normal' || dragRef.current || draftBlock) return;
    e.stopPropagation();   // prevent the document listener from cancelling the new draft
    setSelectedId(null);
    const relY = e.clientY - gridRef.current.getBoundingClientRect().top;
    setDraftBlock({ day, startMin: Math.min(snapMin(DAY_START + relY / PX_PER_MIN), DAY_END - 60) });
  }

  // Time that has already gone can't be rescheduled, so a window can't be drawn over it.
  const firstFree = ci => {
    const d = new Date(weekDates[ci]); d.setHours(0, 0, 0, 0);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return d < t ? DAY_END : d.getTime() === t.getTime() ? Math.min(Math.max(DAY_START, nowMin), DAY_END) : DAY_START;
  };

  // ── render ──────────────────────────────────────────────────────────────────
  const byDay = {};
  weekDayNums.forEach(d => { byDay[d] = []; });
  shown.forEach(ev => { if (byDay[ev.day] !== undefined) byDay[ev.day].push(ev); });
  const activeCats = [...new Set(events.map(e => e.category))];
  const titles = Object.fromEntries([...events, ...(proposal?.events || [])].map(e => [e.id, e.title]));
  // Links stay hidden until they matter: the group of the event you clicked or are holding, or the events in a broken order.
  const focusing = useMemo(() => {
    if (mode !== 'normal') return null;
    if (highlight) return highlight;
    if (orderIssues.length) return new Set(orderIssues.flatMap(v => [...cluster(events, v.id)]));
    if (selectedId && isLinked(events, selectedId)) return cluster(events, selectedId);
    return null;
  }, [mode, highlight, orderIssues, selectedId, events]);
  const selEv = shown.find(e => e.id === selectedId);
  const sidePanel =
    mode === 'normal' && grinderOpen
      ? <GrinderPanel items={grinder} onClose={() => setGrinderOpen(false)} onPlace={placeFromGrinder} onRemove={it => setGrinder(g => g.filter(x => x.id !== it.id))} />
    : mode === 'normal' && selEv && hasPanelContent(shown, selEv, isPast(selEv))
      ? <EventPanel events={shown} selectedId={selectedId} dayLabel={dayLabel} dayIdx={dayIdx} past={isPast(selEv)}
          onClose={() => setSelectedId(null)} onSelect={setSelectedId} onReorder={reorderSteps} onUnlink={unlink}
          onSetGoal={(key, pct) => setEvents(prev => setGoal(prev, selEv.id, key, pct))} onResetGoals={() => setEvents(prev => resetGoals(prev, selEv.id))}
          onReflect={(data, action) => handleReflection(selEv, data, action)} onRest={(a, rest) => handleRest(selEv, a, rest)} />
    : mode === 'clip'
      ? <ClipPanel items={affected} choices={choices} setChoice={(id, v) => setChoices(c => ({ ...c, [id]: v }))}
          windowCount={windows.length} dayLabel={dayLabel} busy={aiLoading} error={panelError}
          onBack={() => setMode('select')} onContinue={proposeArrangement} onCancel={leaveSelect} />
    : mode === 'diff' && proposal
      ? <DiffPanel changes={diffEvents(events, proposal.events)} conflicts={proposal.conflicts || []} titles={titles}
          explanation={proposal.explanation} view={diffView} setView={setDiffView} dayLabel={dayLabel}
          onApply={applyProposal} onBack={() => setMode('clip')} onCancel={leaveSelect} />
    : null;
  const pickProblem = linkPick && [ORDERED, GROUPED].map(t => linkProblem(events, linkPick.fromId, linkPick.toId, t));

  return (
    <>
      {mode !== 'normal' && <div aria-hidden onClick={leaveSelect} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(250,248,245,.78)', backdropFilter: 'blur(1.5px)', animation: 'fadeIn .2s var(--ease)' }} />}

      {orderIssues.length > 0 && !aiLoading && mode === 'normal' && (() => {
        const first = orderIssues[0], many = orderIssues.length > 1 || first.prereq_ids.length > 1;
        const cut = t => (t && t.length > 26 ? t.slice(0, 25) + '…' : t);
        return (
          <div role="alert" className="rise" style={{
            background: 'rgba(247,235,203,.85)', boxShadow: '0 0 0 1px #EBD9A6, 0 18px 28px -22px rgba(125,90,22,.5)', borderRadius: 24, padding: '14px 18px 14px 22px', marginBottom: 14,
            display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <div style={{ flex: '1 1 320px', fontSize: 13, lineHeight: 1.55, color: '#6F4A12' }}>
              {orderIssues.map(v => (
                <div key={v.id}>
                  <strong style={{ fontWeight: 600 }}>{titles[v.id]}</strong> has to come after{' '}
                  {v.prereq_ids.map((p, i) => (
                    <span key={p}>{i > 0 && (i === v.prereq_ids.length - 1 ? ' and ' : ', ')}<strong style={{ fontWeight: 600 }}>{titles[p]}</strong></span>
                  ))}, but it&rsquo;s placed before {v.prereq_ids.length > 1 ? 'them' : 'it'}.
                </div>
              ))}
              {moveFailed === 'later' && <div style={{ marginTop: 4 }}>There&rsquo;s no free time after {many ? 'them' : 'it'} this week to move it into.</div>}
              {moveFailed === 'earlier' && <div style={{ marginTop: 4 }}>There&rsquo;s no room to fit {many ? 'them' : 'it'} in before then (something locked is in the way).</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn--primary" onClick={moveDependentLater} disabled={moveFailed === 'later'} style={{ maxWidth: 300 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{many ? 'Move them later' : `Move “${cut(titles[first.id])}” later`}</span>
              </button>
              <button className="btn btn--primary" onClick={pullPrereqsEarlier} disabled={moveFailed === 'earlier'} style={{ maxWidth: 320 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{many ? 'Move what they need earlier' : `Move “${cut(titles[first.prereq_ids[0]])}” earlier`}</span>
              </button>
              <button className="btn" onClick={() => startMakeRoom(orderIssues)}><IconSelect size={13} />Make room</button>
              <button className="btn" onClick={dropOrderLinks}>Remove the order link</button>
              <button className="btn btn--ghost" onClick={() => setOrderIssues([])}>Keep as is</button>
            </div>
          </div>
        );
      })()}

      {aiNote && !aiLoading && mode === 'normal' && orderIssues.length === 0 && (
        <div role="status" style={{
          background: aiNote.startsWith('⚠') ? '#FBF1E1' : 'var(--surface-2)', border: `1px solid ${aiNote.startsWith('⚠') ? '#EFDCB8' : 'var(--line)'}`,
          borderRadius: 10, padding: '9px 14px', marginBottom: 12, fontSize: 12.5, lineHeight: 1.45,
          color: aiNote.startsWith('⚠') ? '#8A5E16' : 'var(--ink-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <span>{aiNote}</span>
          <button className="btn btn--ghost btn--icon" style={{ width: 24, height: 24 }} onClick={() => setAiNote('')} aria-label="Dismiss"><IconClose size={11} /></button>
        </div>
      )}

      {pendingLink && draftBlock && (
        <div style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--ink-2)' }}>
          New event will run after <strong style={{ fontWeight: 600 }}>{titles[pendingLink.fromId]}</strong>.
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', position: 'relative', zIndex: mode === 'normal' ? 'auto' : 41 }}>
        <div className="bezel rise" style={{ '--i': 2, flex: 1, minWidth: 0 }}><div className="core">

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 14, padding: '10px 14px', borderBottom: '1px solid var(--line-soft)', alignItems: 'center', minHeight: 51 }}>
            {mode === 'normal' ? (
              <>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  {activeCats.map(c => {
                    const s = CATEGORY_COLORS[c] || DEFAULT_CAT_COLOR;
                    return (
                      <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-3)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: s.accent }} />{s.label}
                      </span>
                    );
                  })}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ink-3)' }}><span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--ink)', color: '#fff', display: 'grid', placeItems: 'center' }}><IconLock size={10} strokeWidth={2} /></span>Locked, Otto never moves it</span>
                </div>
                {aiLoading && <span role="status" style={{ fontSize: 12, color: 'var(--ink-3)', animation: 'ringPulse 1.1s var(--ease) infinite' }}>Rescheduling…</span>}
                <button className="btn" onClick={() => { setGrinderOpen(o => !o); setSelectedId(null); }} aria-pressed={grinderOpen} title="Work you parked on purpose"><IconSteps size={13} />Grinder{grinder.length > 0 && <span className="mono" style={{ fontSize: 11, background: 'var(--forest)', color: 'var(--forest-ink)', borderRadius: 999, padding: '1px 7px' }}>{grinder.length}</span>}</button>
                <button className="btn" onClick={handleUndo} disabled={undoStack.length === 0 || aiLoading}><IconUndo size={13} />Undo</button>
                <button className="btn btn--primary" onClick={enterSelect} disabled={aiLoading}><IconSelect size={13} />Reschedule</button>
              </>
            ) : (
              <>
                <div style={{ flex: 1, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.4 }}>
                  {mode === 'select' && roomFor
                    ? <><strong style={{ fontWeight: 600, color: 'var(--ink)' }}>{roomFor.auto ? 'There was no room, so Otto picked a block to clear' : 'Otto picked a block to clear'}</strong> for {roomFor.ids.map(id => `“${titles[id]}”`).join(', ')} to wait for what it needs. {roomFor.enough ? 'Drag a window’s handles to change it, or drag across the grid to add one.' : 'Even everything before it may not be enough; you may need to move the event itself.'}</>
                    : mode === 'select'
                    ? <><strong style={{ fontWeight: 600, color: 'var(--ink)' }}>Drag across the grid</strong> to mark time you want cleared. Locked events stay put; time that has passed can&rsquo;t be moved.</>
                    : mode === 'clip' ? 'Choose what happens to events the selection only partly covers.'
                    : 'Preview. Nothing changes until you apply it.'}
                </div>
                {mode === 'select' && (
                  <>
                    <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{windows.length} window{windows.length === 1 ? '' : 's'}</span>
                    <button className="btn btn--ghost" onClick={() => setWindows([])} disabled={!windows.length}>Clear</button>
                    <button className="btn" onClick={leaveSelect}>Cancel</button>
                    <button className="btn btn--primary" disabled={!windows.length} onClick={() => setMode('clip')}>Review</button>
                  </>
                )}
              </>
            )}
          </div>

          {/* Day header row: one rounded card per day, today in forest green */}
          <div style={{ display: 'flex', gap: compact ? 3 : 6, padding: '12px 8px 8px 0' }}>
            <div style={{ width: 44, flexShrink: 0 }} />
            {weekDates.map((date, i) => {
              const num = date.getDate();
              const isToday = date.toDateString() === todayStr;
              return (
                <button key={i} onClick={() => setSel(num)} aria-label={`${DOW_NAMES[i % 7]} ${num}`} style={{
                  flex: 1, minWidth: 0, textAlign: 'center', padding: compact ? '7px 2px' : '10px 4px', cursor: 'pointer',
                  border: `1px solid ${isToday ? 'var(--forest)' : 'transparent'}`, borderRadius: compact ? 12 : 18,
                  background: isToday ? 'var(--forest)' : 'var(--surface-2)',
                  color: isToday ? 'var(--forest-ink)' : 'var(--ink)',
                  boxShadow: isToday ? '0 10px 18px -12px rgba(30,45,34,.8)' : 'none',
                }}>
                  <div className="label-caps" style={{ fontSize: compact ? 9 : 10.5, color: isToday ? 'rgba(233,240,220,.75)' : 'var(--ink-3)' }}>{DOW_NAMES[i % 7]}</div>
                  <div className="mono" style={{ marginTop: 3, fontSize: compact ? 12.5 : 15, fontWeight: 600 }}>{num}</div>
                </button>
              );
            })}
          </div>

          {/* Scrollable time body */}
          <div ref={scrollRef} style={{ overflowY: 'auto', height: 520 }}>
            <div style={{ display: 'flex', paddingTop: 8 }}>
              <div style={{ width: 44, flexShrink: 0, position: 'relative', height: GRID_H }}>
                {HOURS.map(h => (
                  <div key={h} className="mono" style={{ position: 'absolute', top: (h * 60 - DAY_START) * PX_PER_MIN - 7, right: 8, fontSize: 10.5, color: 'var(--ink-4)' }}>{h}:00</div>
                ))}
              </div>

              <div
                ref={gridRef}
                onPointerMove={onGridMove} onPointerUp={onGridUp} onPointerCancel={onGridCancel}
                style={{ flex: 1, minWidth: 0, position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${numDays},minmax(0,1fr))`, height: GRID_H, touchAction: 'none', cursor: mode === 'select' ? 'crosshair' : 'default' }}
              >
                {HOURS.map(h => (
                  <div key={h} style={{ position: 'absolute', top: (h * 60 - DAY_START) * PX_PER_MIN, left: 0, right: 0, height: 1, background: 'var(--line)', zIndex: 0 }} />
                ))}
                {HOURS.map(h => (
                  <div key={`${h}h`} style={{ position: 'absolute', top: (h * 60 + 30 - DAY_START) * PX_PER_MIN, left: 0, right: 0, height: 1, background: 'var(--line-soft)', zIndex: 0 }} />
                ))}

                {weekDayNums.map((day, ci) => {
                  const isToday = weekDates[ci].toDateString() === todayStr;
                  const dayWindows = windows.filter(w => w.day === day);
                  const live = selecting?.day === day ? makeWindow(day, selecting.a, selecting.b, 15, 15, firstFree(ci), DAY_END) : null;
                  const past = mode === 'select' ? firstFree(ci) : DAY_START;
                  return (
                    <div key={day} onPointerDown={e => onColumnDown(e, day)} style={{
                      height: GRID_H, position: 'relative', minWidth: 0,
                      borderLeft: `1px solid ${ci % 7 === 0 && ci > 0 ? 'var(--ink-4)' : 'var(--line-soft)'}`,
                      background: dragPos?.day === day ? 'rgba(154,106,63,.045)' : isToday ? 'rgba(154,106,63,.035)' : 'transparent',
                      transition: 'background .15s var(--ease)', cursor: mode === 'select' ? 'crosshair' : 'cell',
                    }}>
                      {dragPos?.day === day && (
                        <div style={{ position: 'absolute', top: (dragPos.startMin - DAY_START) * PX_PER_MIN, left: 2, right: 2, height: 2, borderRadius: 2, zIndex: 5,
                          background: dragPos.blocked ? 'var(--danger)' : 'var(--accent)', opacity: dragPos.blocked ? .8 : .5 }} />
                      )}

                      {past > DAY_START && (
                        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: (past - DAY_START) * PX_PER_MIN, zIndex: 11, pointerEvents: 'none',
                          background: 'repeating-linear-gradient(135deg, transparent 0 5px, rgba(42,38,34,.045) 5px 6px)', borderBottom: past < DAY_END ? '1px dashed var(--ink-4)' : 'none' }} />
                      )}

                      {byDay[day].map(ev => (
                        <EventChip
                          key={ev.id} ev={ev} compact={compact}
                          label={displayTitle(shown, ev, dayIdx)}
                          past={isPast(ev)}
                          interactive={mode === 'normal'}
                          draggingThis={dragRef.current?.id === ev.id}
                          noTopTransition={resizingTopId === ev.id}
                          isConflict={conflicts.has(ev.id)}
                          popSide={ci < numDays / 2 ? 'right' : 'left'}
                          flip={flips[ev.id]}
                          thinking={ceremony && !ev.fixed ? 1 + (ci + ev.startMin / 90) % 5 : 0}
                          dim={!!focusing && !focusing.has(ev.id)}
                          ringed={!!((focusing && focusing.has(ev.id)) || (changedIds && changedIds.has(ev.id)))}
                          selected={selectedId === ev.id}
                          linked={isLinked(shown, ev.id)}
                          onPointerDown={e => { e.stopPropagation(); armLongPress(e, ev); startDrag(e, ev); }}
                          onResizeStart={(e, edge) => startResize(e, ev, edge)}
                          onDelete={() => deleteEvent(ev.id)}
                          onToggleLock={() => toggleLock(ev.id)}
                          onLinkStart={e => startLink(e, ev)}
                          onSelect={id => setSelectedId(s => (s === id ? null : id))}
                        />
                      ))}

                      {/* time the user marked as "clear this" */}
                      {[...dayWindows, ...(live ? [{ ...live, live: true }] : [])].map((w, i) => (
                        <div key={i} onPointerDown={e => e.stopPropagation()} style={{
                          position: 'absolute', left: 1, right: 1, zIndex: 12, borderRadius: 5,
                          top: (w.start - DAY_START) * PX_PER_MIN, height: (w.end - w.start) * PX_PER_MIN,
                          background: 'repeating-linear-gradient(135deg, rgba(154,106,63,.16) 0 6px, rgba(154,106,63,.07) 6px 12px)',
                          border: '1.5px solid var(--accent)', pointerEvents: mode === 'select' && !w.live ? 'auto' : 'none',
                        }}>
                          {mode === 'select' && !w.live && ['top', 'bottom'].map(edge => (
                            <div key={edge} onPointerDown={e => startWinResize(e, w, edge)} aria-label={`Drag to change when this window ${edge === 'top' ? 'starts' : 'ends'}`}
                              style={{ position: 'absolute', left: 0, right: 0, [edge]: -6, height: 14, cursor: 'ns-resize', zIndex: 3, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                              <i style={{ width: 30, height: 5, borderRadius: 3, background: 'var(--accent)', boxShadow: '0 0 0 2px var(--surface)' }} />
                            </div>
                          ))}
                          {mode === 'select' && !w.live && (
                            <button className="chip-node" aria-label="Remove this window" title="Remove window"
                              style={{ right: 3, top: 3 }} onClick={() => setWindows(ws => ws.filter(x => !(x.day === w.day && x.start === w.start)))}>
                              <IconClose size={9} />
                            </button>
                          )}
                          {!compact && (
                            <span className="mono" style={{ position: 'absolute', left: 6, top: 4, fontSize: 10, color: 'var(--accent-ink)', pointerEvents: 'none' }}>
                              {fmtTime(w.start)}–{fmtTime(w.end)}
                            </span>
                          )}
                        </div>
                      ))}

                      {draftBlock?.day === day && (
                        <DraftGhost draftBlock={draftBlock} newTaskDraft={newTaskDraft} onCancel={cancelDraft}
                          startDraftResize={startDraftResize} startDraftMove={startDraftMove} />
                      )}
                    </div>
                  );
                })}

                {todayCol >= 0 && nowMin >= DAY_START && nowMin <= DAY_END && (
                  <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: (nowMin - DAY_START) * PX_PER_MIN, zIndex: 9, pointerEvents: 'none', borderTop: '1.5px dashed rgba(76,118,86,.55)' }}>
                    <span className="mono" style={{ position: 'absolute', left: -44, top: -9, width: 40, textAlign: 'center', fontSize: 10, fontWeight: 600, padding: '2px 0', borderRadius: 999, background: 'var(--forest)', color: 'var(--forest-ink)' }}>{fmtTime(nowMin)}</span>
                    <span style={{ position: 'absolute', left: `calc(${(todayCol / numDays) * 100}% - 4px)`, top: -5, width: 9, height: 9, borderRadius: '50%', background: 'var(--forest)' }} />
                  </div>
                )}

                {/* a band of light passes over the week while Otto thinks */}
                {ceremony && (
                  <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 14, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', inset: '0 auto 0 0', width: '38%', background: 'linear-gradient(90deg, transparent, rgba(255,250,225,.55), transparent)', animation: 'sweep 1.5s var(--ease) infinite' }} />
                  </div>
                )}

                {/* where each moved event used to be: a dashed outline that fades */}
                {Object.entries(flips).filter(([, f]) => f.fromCol >= 0).map(([id, f]) => (
                  <div key={`ghost-${id}`} aria-hidden style={{
                    position: 'absolute', zIndex: 4, pointerEvents: 'none', borderRadius: 13, border: '1.5px dashed var(--accent)', background: 'rgba(76,118,86,.07)',
                    left: `calc(${(f.fromCol / numDays) * 100}% + 3px)`, width: `calc(${100 / numDays}% - 6px)`,
                    top: (f.fromStart - DAY_START) * PX_PER_MIN, height: Math.max(f.dur * PX_PER_MIN - 2, 18),
                    animation: `ghostFade 1.6s var(--ease) ${f.delay}ms both`,
                  }} />
                ))}

                <LinkLayer events={shown} weekDayNums={weekDayNums} width={gridW} height={GRID_H}
                  show={focusing} pending={linkDrag && { fromId: linkDrag.fromId, x: linkDrag.x, y: linkDrag.y }}
                  onRemove={l => { if (mode === 'normal') unlink(l); }} />

                {/* Which kind of link? */}
                {linkPick && (
                  <div onPointerDown={e => e.stopPropagation()} style={{
                    position: 'absolute', zIndex: 45, left: Math.min(linkPick.x, Math.max(gridW - 250, 0)), top: Math.min(linkPick.y, GRID_H - 150),
                    width: 240, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 6, boxShadow: 'var(--shadow-md)', animation: 'fadeIn .12s var(--ease)',
                  }}>
                    <div className="label-caps" style={{ padding: '6px 8px 4px' }}>Link as</div>
                    {[[ORDERED, 'Ordered', `${titles[linkPick.fromId]} first, then ${titles[linkPick.toId]}`], [GROUPED, 'Grouped', 'Shown together, no order']].map(([t, name, hint], i) => (
                      <button key={t} disabled={!!pickProblem[i]} onClick={() => chooseLinkType(t)} className="btn btn--ghost"
                        style={{ width: '100%', height: 'auto', justifyContent: 'flex-start', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '8px', textAlign: 'left' }}>
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{name}</span>
                        <span style={{ fontSize: 11.5, color: pickProblem[i] ? 'var(--danger)' : 'var(--ink-3)', fontWeight: 400, lineHeight: 1.35 }}>{pickProblem[i] || hint}</span>
                      </button>
                    ))}
                    <button className="btn btn--ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setLinkPick(null)}>Cancel</button>
                  </div>
                )}

                {/* Drag ghost: follows the cursor during an event drag */}
                {dragPos && dragRef.current && (() => {
                  const dr = dragRef.current;
                  const ev = events.find(x => x.id === dr.id);
                  if (!ev) return null;
                  const c = CATEGORY_COLORS[ev.category] || DEFAULT_CAT_COLOR;
                  const ci = weekDayNums.indexOf(dragPos.day);
                  const pct = 100 / numDays;
                  return (
                    <div style={{
                      position: 'absolute', top: (dragPos.startMin - DAY_START) * PX_PER_MIN,
                      left: `calc(${ci * pct}% + 3px)`, width: `calc(${pct}% - 6px)`, height: dr.duration * PX_PER_MIN - 2,
                      background: dragPos.blocked ? 'var(--danger)' : c.accent, borderRadius: 6, opacity: .92, pointerEvents: 'none', zIndex: 20,
                      padding: '5px 8px', color: '#fff', overflow: 'hidden',
                      boxShadow: dragPos.blocked ? '0 0 0 2px rgba(194,87,79,.35), 0 8px 20px -8px rgba(194,87,79,.5)' : `0 10px 24px -10px ${c.accent}`,
                      transition: 'background .12s var(--ease), box-shadow .12s var(--ease)',
                    }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</div>
                      {!compact && <div className="mono" style={{ fontSize: 10.5, marginTop: 2, opacity: .85 }}>
                        {dragPos.blocked ? 'Blocked: locked event here' : `${fmtTime(dragPos.startMin)} · ${dr.duration}m`}
                      </div>}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--ink-3)', padding: '8px 0 10px', borderTop: '1px solid var(--line-soft)' }}>
            Drag to move · pull the edges to resize · drag from the dot on an event&rsquo;s right edge to link · click a linked event to see what it connects to
          </div>

          {/* the thinking beat: Otto is re-arranging */}
          {ceremony && (
            <div role="status" aria-live="polite" style={{
              position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 18px 6px 8px', borderRadius: 999, background: 'rgba(38,58,44,.94)', color: 'var(--forest-ink)', fontSize: 12.5, fontWeight: 600,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,.14), 0 18px 30px -14px rgba(20,35,25,.8)', animation: 'popIn .5s var(--spring) both',
            }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(233,240,220,.14)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                <Mascot art="otter-shuffling" size={34} zoom={5} float />
              </span>
              {mode === 'clip' ? 'Looking for a new arrangement' : 'Re-arranging your week'}
              <span aria-hidden style={{ display: 'inline-flex', gap: 3 }}>
                {[0, 1, 2].map(i => <i key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', animation: `dotHop 1.1s var(--ease) ${i * 140}ms infinite` }} />)}
              </span>
            </div>
          )}
        </div></div>

        {sidePanel}
      </div>

      {toast && (
        <div key={toast.id} role="status" style={{
          position: 'fixed', top: 22, left: '50%', zIndex: 120, padding: '10px 20px', borderRadius: 999, textAlign: 'center',
          background: 'rgba(251,248,238,.96)', boxShadow: '0 0 0 1px var(--line), 0 24px 40px -18px rgba(46,58,38,.55)',
          animation: 'toastIn .7s var(--spring) both',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-.01em' }}>{toast.text}</div>
          {toast.sub && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>{toast.sub}</div>}
        </div>
      )}

      {draftBlock && !isDraftMoving && (
        <EventCreation
          draftBlock={draftBlock} newTaskDraft={newTaskDraft} setNewTaskDraft={setNewTaskDraft}
          gridRef={gridRef} scrollRef={scrollRef} weekDayNums={weekDayNums} weekDates={weekDates}
          onCommit={commitDraft} onCancel={cancelDraft} onRequestCancel={requestCancel}
          confirmingCancel={confirmingCancel} onConfirmCancel={cancelDraft} onDismissConfirm={() => setConfirmingCancel(false)}
        />
      )}
    </>
  );
}
