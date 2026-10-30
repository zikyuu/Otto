import { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { CATEGORY_COLORS, DEFAULT_CAT_COLOR } from '../../data/fixtures.js';
import {
  PX_PER_MIN, DAY_START, DAY_END, GRID_H, HOURS, DOW_NAMES,
  fmtTime, snapMin, getDays, isoDate, dayNum, dateOfDay, isoOfDay,
} from './calendarUtils.js';
import { useDragResize } from './useDragResize.js';
import EventCreation from './EventCreation.jsx';
import EventChip from './EventChip.jsx';
import LinkLayer from './LinkLayer.jsx';
import { EventPanel, GrinderPanel, ClipPanel, DiffPanel, PlanPanel, HandoffNotes, hasPanelContent } from './SidePanels.jsx';
import { timeBlockFor, planWindow, sessionsOf } from '../../home/makeTime.js';
import { dropTarget, clashes, allowed } from '../../home/planDrag.js';
import { moveInProposal, resetEdits, problemsOf } from './proposalEdit.js';
import { setGoal, resetGoals, displayTitle, planRows, workDone, reflectionMinutes, remainder, findFreeSlot, restSignature, WHOLE } from './sessionGoals.js';
import { scheduleEvents, sendReflection, sendActual, sendOffTrack, setSleepWindow, getLearned } from '../../api.js';
import { addItem, toggleItem, removeItem, carryOverCandidates, carryMinutes, openItems } from './checklist.js';
import { keep as keepItem, someday as somedayItem, reopen as reopenItem, stale as staleItems } from './grinderAge.js';
import { SleepBands, SleepSettings } from './SleepBands.jsx';
import { dragSleep, withCrunch } from './sleepMath.js';
import CarryOver from './CarryOver.jsx';
import { SleepFold } from './SleepBands.jsx';
import { enrichNew } from '../../enrichment.js';
import { creditGoal, workedMinutes } from '../goals/goalLink.js';
import { resolve as resolveDecision, inherit as inheritImportance } from '../priorityBoard.js';
import ImportanceConflict from '../../modals/ImportanceConflict.jsx';
import { previousCategory, daysToDeadline } from './energyUtils.js';
import { getSeries, setSeriesList, subscribeSeries } from './seriesStore.js';
import { makeSeries, seriesOf, renameEvent, instanceId, materialize, applyEdit, applyRemove, HORIZON_DAYS } from './recurrence.js';
import EnergyTap from '../../components/EnergyTap.jsx';
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
        background: 'rgba(32,40,8,.08)', border: '1.5px dashed var(--accent)', borderRadius: 6,
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
export default function WeekView({ weekOffset, numDays = 7, sel, setSel, events, setEvents, addTick = 0, handoff = null, onHandoffClose = () => {} }) {
  const gridRef   = useRef(null);
  const scrollRef = useRef(null);
  const eventsRef = useRef(events);
  useEffect(() => { eventsRef.current = events; }, [events]);

  const compact = numDays > 7;
  const dayKey      = isoDate(new Date());      // changes at midnight: the week on screen follows the real date
  const weekDates   = useMemo(() => getDays(weekOffset, numDays), [weekOffset, numDays, dayKey]);
  const weekDayNums = weekDates.map(dayNum);
  const dayLabel    = num => { const i = weekDayNums.indexOf(num); return i < 0 ? dateOfDay(num).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : `${DOW_NAMES[i % 7]} ${weekDates[i].getDate()}`; };
  const todayStr    = new Date().toDateString();
  const dayIdx      = d => weekDayNums.indexOf(d);
  // has this block already happened? (then it is time to ask how it went)
  const isPast = ev => {
    const i = dayIdx(ev.day);
    if (i < 0) return false;
    const d = new Date(weekDates[i]); d.setHours(0, 0, 0, 0);
    return d.getTime() + (ev.startMin + ev.durationMin) * 60000 <= Date.now();
  };

  // has it begun? (then "went off track" and "how long did it really take" make sense)
  const isStarted = ev => {
    const i = dayIdx(ev.day);
    if (i < 0) return false;
    const d = new Date(weekDates[i]); d.setHours(0, 0, 0, 0);
    return d.getTime() + ev.startMin * 60000 <= Date.now();
  };

  // the Meatball Grinder: work parked on purpose, never scheduled until the user asks
  const GRINDER_KEY = 'otto.grinder.v1';
  const [grinder, setGrinder] = useState(() => { try { return JSON.parse(localStorage.getItem(GRINDER_KEY)) || []; } catch { return []; } });
  const [grinderOpen, setGrinderOpen] = useState(false);
  useEffect(() => {       // the Home page's "Review Meatball Grinder" lands here with the panel open
    try { if (sessionStorage.getItem('otto.openGrinder')) { sessionStorage.removeItem('otto.openGrinder'); setGrinderOpen(true); } } catch { /* ignore */ }
  }, []);
  useEffect(() => { try { localStorage.setItem(GRINDER_KEY, JSON.stringify(grinder)); } catch { /* private window */ } }, [grinder]);
  // something outside the calendar (the late-start flow) parked work: re-read it
  useEffect(() => {
    const reload = () => { try { setGrinder(JSON.parse(localStorage.getItem(GRINDER_KEY)) || []); } catch { /* ignore */ } };
    window.addEventListener('otto:grinder', reload);
    return () => window.removeEventListener('otto:grinder', reload);
  }, []);
  const staleCount = staleItems(grinder).length;

  // planning time for a goal (from Home's "Find time"): the scheduler suggests sessions, shown as dashed blocks you can drag
  // before anything is booked. Everything else is dimmed meanwhile.
  const [plan, setPlan] = useState(null);       // { nudge, loading?, error?, sessions? }
  const planDrag = useRef(null);
  const proposalDrag = useRef(null);      // a block being moved by hand inside a proposed arrangement
  async function startPlan(nudge) {
    setPlan({ nudge, loading: true });
    try {
      const nowD = new Date(), todayIso = isoDate(nowD), win = planWindow(todayIso);
      const id = 'mt_' + Date.now().toString(36);
      const learned = await getLearned().catch(() => null);          // the numbers the suggestion is based on, shown in the panel
      const block = timeBlockFor(nudge, {
        peak: learned?.peak_window,
        goalTitle: nudge.goal, goalCat: nudge.cat, today: todayIso, todayDay: dayNum(nowD), id,
        tomorrowDay: dayNum(nowD) + 1, nowMin: nowD.getHours() * 60 + nowD.getMinutes(),
      });
      const data = await scheduleEvents({ events: [...eventsRef.current, block], planIds: [id], weekDays: win.days, weekStartIso: win.monday });
      const mine = sessionsOf(data.events, id);
      setPlan({ nudge, learned, category: block.category, sessions: mine.map(x => ({ ...x, suggested: true })) });
    } catch (e) { setPlan({ nudge, error: e.message }); }
  }
  useEffect(() => {
    let raw = null;
    try { raw = sessionStorage.getItem('otto.makeTime'); if (raw) sessionStorage.removeItem('otto.makeTime'); } catch { /* ignore */ }
    if (raw) { try { startPlan(JSON.parse(raw)); } catch { /* ignore a bad value */ } }
  }, []);
  function confirmPlan() {
    const mine = plan.sessions;
    const next = [...eventsRef.current, ...mine.map(({ suggested, ...e }) => e)];
    setUndoStack(prev => [...prev.slice(-4), { events: eventsRef.current, dragId: null }]);
    setEvents(next);
    callScheduler(next, mine.map(x => x.id), eventsRef.current, { keepOnError: true });
    setPlan(null);
    setToast({ id: Date.now(), text: `Booked ${mine.length} session${mine.length === 1 ? '' : 's'} for ${plan.nudge.milestone}.`, sub: '' });
  }

  // the edges of the day: where Otto may schedule. Dragged on the grid, or typed in the Sleep menu.
  const [edges, setEdges] = useState({ wake: 8 * 60, sleep: 23 * 60 });
  const edgesRef = useRef(edges);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  // Only the waking hours are shown. The hours either side (sleep) are folded away behind an arrow, so the page is not full of
  // blank space; open them on purpose to drag something in (a rush job) or to see what is already there.
  const [openTop, setOpenTop] = useState(false);
  const [openBottom, setOpenBottom] = useState(false);
  const vStartBase = Math.max(DAY_START, Math.floor(edges.wake / 60) * 60);
  const vEndBase = Math.min(DAY_END, Math.ceil(edges.sleep / 60) * 60);
  const vStart = openTop ? DAY_START : Math.max(DAY_START, Math.floor(edges.wake / 60) * 60);
  const vEnd = openBottom ? DAY_END : Math.min(DAY_END, Math.ceil(edges.sleep / 60) * 60);
  const [sleepErr, setSleepErr] = useState('');
  const sleepRef = useRef(null);
  const [sleepActive, setSleepActive] = useState(null);
  useEffect(() => { getLearned().then(l => { const e = { wake: l.day_start_min ?? DAY_START, sleep: l.day_end_min ?? DAY_END }; setEdges(e); edgesRef.current = e; }).catch(() => {}); }, []);
  async function saveSleep(wake, sleep) {
    const before = edges;
    setEdges({ wake, sleep }); setSleepErr('');
    try { await setSleepWindow(wake, sleep); setToast({ id: Date.now(), text: 'Your day is updated. Otto will plan inside it.', sub: '' }); }
    catch (e) { setEdges(before); setSleepErr(e.message); setAiNote(`⚠ ${e.message}`); }
  }
  // in the "After" view of a proposed arrangement any flexible block that has not passed can be moved by hand
  function grabProposed(e, ev) {
    e.preventDefault(); e.stopPropagation();
    gridRef.current.setPointerCapture(e.pointerId);
    const top = gridRef.current.getBoundingClientRect().top;
    proposalDrag.current = { id: ev.id, duration: ev.durationMin, grabMin: DAY_START + (e.clientY - top) / PX_PER_MIN - ev.startMin };
  }
  function grabSession(e, x) {
    e.preventDefault(); e.stopPropagation();
    gridRef.current.setPointerCapture(e.pointerId);
    const top = gridRef.current.getBoundingClientRect().top;
    planDrag.current = { id: x.id, duration: x.durationMin, grabMin: DAY_START + (e.clientY - top) / PX_PER_MIN - x.startMin };
  }
  function grabSleep(edge, e, nudge = 0) {
    if (!e) { const next = dragSleep(edge, (edge === 'wake' ? edges.wake : edges.sleep) + nudge, edges.wake, edges.sleep); saveSleep(next.wake, next.sleep); return; }
    e.preventDefault(); e.stopPropagation();
    gridRef.current.setPointerCapture(e.pointerId);
    sleepRef.current = { edge, ...edges };
    setSleepActive(edge);
  }

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
  const [editingEv,    setEditingEv]    = useState(null);   // an existing event open in the form
  const [decisionQ,    setDecisionQ]    = useState([]);     // questions only the user can answer: low-importance deadline vs important work
  const [hv,           setHv]           = useState(null);   // which plan of a hand-off is on show
  const variantStore = useRef({});
  const [seriesAsk,    setSeriesAsk]    = useState(null);   // removing one of a repeating series: how far should it go
  const [seriesList, setSeriesLocal] = useState(getSeries);
  useEffect(() => subscribeSeries(() => setSeriesLocal(getSeries())), []);
  const goals = useMemo(() => { try { const g = JSON.parse(localStorage.getItem('otto.goals.v1')); return Array.isArray(g) ? g.map(x => ({ id: x.id, title: x.title, milestones: (x.milestones || []).map(m => ({ id: m.id, title: m.title, done: m.done })) })) : []; } catch { return []; } }, [draftBlock]);

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
    // what the user just placed in sleep hours is theirs to place: flag it so the scheduler leaves it there
    postDragEvents = postDragEvents.map(e => (pins.includes(e.id) ? withCrunch(e, edgesRef.current.wake, edgesRef.current.sleep) : e));
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
      if (data.decisions?.length) setDecisionQ(data.decisions);
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
    onResizeEnd: (ev, was) => handleResizeEnd(ev, was),
  });

  // ── new events ──────────────────────────────────────────────────────────────
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  function cancelDraft() {
    setConfirmingCancel(false); setDraftBlock(null); setPendingLink(null); setEditingEv(null);
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

  function deleteEvent(id, scope) {
    const ev = events.find(e => e.id === id);
    if (ev?.series_id && !scope) { setSeriesAsk(ev); return; }
    if (ev?.series_id && scope) {
      setUndoStack(prev => [...prev.slice(-4), { events, dragId: null }]);
      const out = applyRemove({ events, list: seriesList, ev, scope });
      setSeriesList(out.list); setEvents(out.events); setSeriesAsk(null);
      if (selectedId === id) setSelectedId(null);
      return;
    }
    setUndoStack(prev => [...prev.slice(-4), { events, dragId: null }]);
    setEvents(prev => dropEvent(prev, id));
    setConflicts(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (selectedId === id) setSelectedId(null);
  }
  function toggleLock(id) { setEvents(prev => prev.map(e => e.id === id ? { ...e, fixed: !e.fixed } : e)); }

  // The new event is added as the user drew it, then handed to the scheduler, which may re-place
  // events it displaces and, from the user's learned focus span, decide to split a long one.
  function startEdit(ev) {
    if (draftBlock || mode !== 'normal') return;
    setEditingEv(ev);
    setSelectedId(null);
    setNewTaskDraft({ ...FRESH_DRAFT, title: ev.title, duration_planned: ev.durationMin, category: ev.category, non_negotiable: !!ev.non_negotiable });
    setDraftBlock({ day: ev.day, startMin: ev.startMin });
  }

  const DETAIL_KEYS = ['description', 'checklist', 'subtasks', 'deadline_iso', 'best_done_by_iso', 'goal_id', 'milestone_id'];
  function saveEdit(details) {
    const ed = editingEv;
    const { repeat, scope, ...rest } = details;
    const empty = v => v == null || v === false || (Array.isArray(v) && v.length === 0);
    const apply = e => {
      const n = { ...e, title: newTaskDraft.title.trim(), day: draftBlock.day, startMin: draftBlock.startMin, durationMin: newTaskDraft.duration_planned, category: newTaskDraft.category };
      if (newTaskDraft.non_negotiable) n.non_negotiable = true; else delete n.non_negotiable;
      for (const k of DETAIL_KEYS) { if (empty(rest[k])) delete n[k]; else n[k] = rest[k]; }
      if (rest.order_specific) n.order_specific = true; else delete n.order_specific;
      if (rest.span_days) n.span_days = true; else delete n.span_days;
      if (rest.deadline_iso) n.hard_deadline = rest.hard_deadline !== false; else delete n.hard_deadline;
      return n;
    };
    const edited = events.map(e => (e.id === ed.id ? apply(e) : e));
    const updated = edited.find(e => e.id === ed.id);
    const out = applyEdit({ events: edited, list: seriesList, original: ed, updated, repeat, scope });
    if (out.list !== seriesList) setSeriesList(out.list);
    const next = out.events, planId = out.planId;
    setEvents(next);
    cancelDraft();
    Promise.resolve(callScheduler(next, planId, events, { planIds: [planId], keepOnError: true }));
  }

  function commitDraft(details = {}) {
    if (!draftBlock || !newTaskDraft.title.trim()) return;
    if (editingEv) { saveEdit(details); return; }
    const clean = obj => Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v != null && !(Array.isArray(v) && v.length === 0) && v !== false));
    const id = 'task_' + Date.now();
    const created = {
      id, title: newTaskDraft.title.trim(), day: draftBlock.day, startMin: draftBlock.startMin,
      durationMin: newTaskDraft.duration_planned, category: newTaskDraft.category, fixed: false,
      ...(newTaskDraft.non_negotiable ? { non_negotiable: true } : {}),
      ...clean((({ repeat, scope, ...d }) => d)(details)),
      ...(details.deadline_iso ? { hard_deadline: details.hard_deadline !== false } : {}),
    };
    let next = [...events, inheritImportance(events, created)];
    if (pendingLink) next = addLink(next, pendingLink.fromId, id, ORDERED);
    let planId = id;
    if (details.repeat?.rule) {
      const ser = makeSeries(created, details.repeat.rule, details.repeat.until);
      planId = instanceId(ser.id, created.day);
      next = renameEvent(next, id, planId).map(e => (e.id === planId ? { ...e, series_id: ser.id } : e));
      next = [...next, ...materialize(ser, next, created.day, created.day + HORIZON_DAYS)];
      setSeriesList(l => [...l, ser]);
    }
    setEvents(next);
    cancelDraft();
    Promise.resolve(callScheduler(next, planId, events, { planIds: [planId], keepOnError: true, ceremonial: true }))
      .then(() => enrichNew(created, setEvents))      // a long, loosely worded event is tidied by one batched call (quiet if short, over quota, or no key)
      .then(t => { if (t) setToast({ id: Date.now(), text: `Otto tidied up “${t}”.`, sub: '' }); });
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
  // the event under a point; a near miss (within a few pixels of a block's edge, in its column or the next one over) still
  // counts, because the link dot sits on the edge between two columns and is easy to overshoot
  const eventAt = (x, y, exceptId) => {
    const colW = gridW / numDays;
    const min = DAY_START + y / PX_PER_MIN;
    const tolMin = 12 / PX_PER_MIN;
    let best = null, bestD = Infinity;
    for (const e of shown) {
      if (e.id === exceptId) continue;
      const c = weekDayNums.indexOf(e.day);
      if (c < 0) continue;
      const left = c * colW + 3, right = (c + 1) * colW - 3;
      const dx = x < left ? left - x : x > right ? x - right : 0;
      const dy = min < e.startMin ? e.startMin - min : min > e.startMin + e.durationMin ? min - (e.startMin + e.durationMin) : 0;
      if (dx > 12 || dy > tolMin) continue;
      const d = dx + dy * PX_PER_MIN;
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
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
    // dropped on empty space: do not open the creator by surprise, ask first
    const col = Math.floor(x / (gridW / numDays));
    if (col >= 0 && col < numDays && y >= 0 && y <= GRID_H) {
      const start = Math.min(snapMin(DAY_START + y / PX_PER_MIN), DAY_END - 60);
      setLinkPick({ fromId: lk.fromId, toId: null, x, y, newAt: { day: weekDayNums[col], startMin: start } });
    }
  }
  function createLinked() {
    const { fromId, newAt } = linkPick;
    setLinkPick(null);
    setPendingLink({ fromId });
    setDraftBlock(newAt);
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
    // a dragged end is what really happened; otherwise it is read from the meters
    const minutes = ev.actual_min != null ? ev.actual_min : reflectionMinutes(ev.durationMin, planned, done);
    sendReflection({ taskId: ev.id, choice, plannedMinutes: ev.planned_min ?? ev.durationMin, actualMinutes: minutes, category: ev.category, daysToDeadline: daysToDeadline(ev.deadline_iso, isoOfDay(ev.day)), prevCategory: previousCategory(events, ev) }).catch(() => {});   // the learning loop; a failure must not block the page
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
    // time on something tied to a goal counts for that goal's step
    let credited = ev.credited_min;
    if (ev.goal_id) {
      try {
        const saved = JSON.parse(localStorage.getItem('otto.goals.v1'));
        if (Array.isArray(saved)) { const r = creditGoal(saved, ev, workedMinutes(ev, choice, planned, done)); if (r.goals !== saved) localStorage.setItem('otto.goals.v1', JSON.stringify(r.goals)); credited = r.credited; }
      } catch { /* goals unreadable: nothing is credited */ }
    }
    setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, ...(credited != null ? { credited_min: credited } : {}), reflection: { choice, actual, notes, remainder: outcome, remainder_ref: ref, at: Date.now() } } : e)));
    const id = Date.now();
    setToast({ id, text: outcome === 'park' ? 'Saved. The rest is in the Meatball Grinder.' : outcome === 'fit' ? 'Saved. The rest is back in your week.' : 'Saved. Otto will learn from this.', sub: '' });
    setTimeout(() => setToast(t => (t && t.id === id ? null : t)), 3200);
  }
  // the end of a block that has begun was dragged to what really happened: a learning signal
  async function handleResizeEnd(ev, was) {
    if (ev.fixed || !isStarted(ev)) return;
    setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, planned_min: e.planned_min ?? was, actual_min: ev.durationMin } : e)));
    try {
      const r = await sendActual({ taskId: ev.id, plannedMinutes: ev.planned_min ?? was, actualMinutes: ev.durationMin, category: ev.category });
      if (r.ask_reflection) { setSelectedId(ev.id); setToast({ id: Date.now(), text: 'That differs from the plan. Tell Otto what happened.', sub: '' }); }
      else setToast({ id: Date.now(), text: 'Noted: it went to plan.', sub: '' });
    } catch (err) { setAiNote(`⚠ Could not record that. (${err.message})`); }
  }

  async function handleOffTrack(ev, { reason, durationMin, intoTaskMin }) {
    try {
      await sendOffTrack({ reason, durationMin, intoTaskMin, taskId: ev.id });
      setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, off_track: [...(e.off_track || []), { reason, durationMin, intoTaskMin }] } : e)));
      setToast({ id: Date.now(), text: 'Noted. It will not count against you.', sub: '' });
      return true;
    } catch (err) { setAiNote(`⚠ Could not save that. (${err.message})`); return false; }
  }

  function handleChecklist(id, action, arg) {
    setEvents(prev => (action === 'add' ? addItem(prev, id, arg) : action === 'toggle' ? toggleItem(prev, id, arg) : removeItem(prev, id, arg)));
  }

  // unfinished checklist items on blocks that are over: ask once whether they get a new slot
  const carryCandidate = carryOverCandidates(events, isPast).find(e => dayIdx(e.day) >= 0) || null;
  function handleCarry(ev, action) {
    let outcome = action, ref = null;
    if (action !== 'dismiss') {
      const open = openItems(ev), minutes = carryMinutes(ev);
      const base = ev.base_title ?? ev.title.replace(/ \(\d+\/\d+\)$/, '');
      const parts = open.map(i => ({ key: i.id, name: i.text, minutes: Math.max(5, Math.round(minutes / open.length / 5) * 5) }));
      const rem = { minutes, parts };
      if (action === 'fit') {
        const id = addRemainder(base, rem, ev.category);
        if (id) ref = { kind: 'event', id };
        else { outcome = 'park'; ref = { kind: 'grinder', id: parkRemainder(base, rem, 'There was no room left this week.') }; }
      } else ref = { kind: 'grinder', id: parkRemainder(base, rem, `Unfinished from “${ev.title}”.`) };
    }
    setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, carry_over: { action: outcome, ref, at: Date.now() } } : e)));
    if (outcome !== 'dismiss') setToast({ id: Date.now(), text: outcome === 'fit' ? 'The unfinished items have a new slot.' : 'The unfinished items are in the Meatball Grinder.', sub: '' });
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
    const key = e => { if (e.key === 'Escape') (handoff ? cancelHandoff() : leaveSelect()); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [mode]);

  const affected = useMemo(() => (mode === 'clip' ? affectedEvents(events, windows) : []), [mode, events, windows]);

  // ---- a plan made elsewhere (late start, overwhelmed, priorities) shown here, like any other proposal ----
  const copyAll = list => list.map(e => ({ ...e }));
  function openVariant(key, h = handoff) {
    if (hv && proposal) variantStore.current[hv] = proposal;
    const v = h.variants.find(x => x.key === key);
    if (!v) return;
    setProposal(variantStore.current[key] || { events: copyAll(v.events), conflicts: v.conflicts || [], explanation: v.explanation, order_violations: [], original: copyAll(v.events), edited: new Set() });
    setHv(key); setDiffView('after');
    if (v.decisions?.length && !variantStore.current[`asked:${key}`]) { variantStore.current[`asked:${key}`] = true; setDecisionQ(v.decisions); }
  }
  useEffect(() => {
    if (!handoff) return;
    variantStore.current = {};
    setMode('diff'); setSelectedId(null); setHighlight(null); setWindows([]); setHv(null);
    setProposal(null);
    const first = handoff.variants[0];
    setProposal({ events: copyAll(first.events), conflicts: first.conflicts || [], explanation: first.explanation, order_violations: [], original: copyAll(first.events), edited: new Set() });
    setHv(first.key); setDiffView('after');
    if (first.decisions?.length) { variantStore.current[`asked:${first.key}`] = true; setDecisionQ(first.decisions); }
  }, [handoff?.id]);
  const hvVariant = handoff?.variants.find(v => v.key === hv) || null;
  function applyHandoff() {
    setUndoStack(prev => [...prev.slice(-4), { events, dragId: null }]);
    playFlips(flipsFor(events, proposal.events));
    setEvents(proposal.events);
    const edits = propEdited.size > 0;
    setConflicts(new Set(proposal.conflicts || []));
    setAiNote(edits ? 'Applied your version.' : (proposal.explanation || ''));
    setMoveFailed(null);
    const info = { applied: true, variant: hv, grinder: hvVariant?.grinder || [], handoff };
    setMode('normal'); setProposal(null); setHv(null); setDiffView('after');
    onHandoffClose(info);
  }
  function cancelHandoff() { setMode('normal'); setProposal(null); setHv(null); onHandoffClose({ applied: false, handoff }); }
  function answerDecision(d, winner) {
    const next = resolveDecision(eventsRef.current, d, winner);
    setEvents(next);
    const rest = decisionQ.filter(x => x.low.id !== d.low.id);
    setDecisionQ(rest);
    if (rest.length) return;
    if (handoff && mode === 'diff') { onHandoffClose({ applied: false, rebuild: true, handoff }); setMode('normal'); setProposal(null); setHv(null); }
    else if (winner === 'low') callScheduler(next, null, eventsRef.current, { keepOnError: true });
  }

  async function proposeArrangement() {
    setAiLoading(true); setPanelError(''); setCeremony(true);
    try {
      const prepared = applyClipChoices(events, windows, choices);
      const [data] = await Promise.all([requestSchedule({
        events: prepared, pinned_ids: roomFor ? roomFor.ids : [],
        blocked_windows: windows.map(w => ({ day: w.day, start_min: w.start, end_min: w.end, ...(roomFor ? { for_ids: roomFor.ids } : {}) })),
        ...(roomFor ? { fix_order: 'move_prerequisites' } : {}),
      }), pause(CEREMONY_MS)]);
      setProposal({ ...data, base: prepared, original: data.events.map(e => ({ ...e })), edited: new Set() });
      setDiffView('after');
      setMode('diff');
    } catch (err) { setPanelError(err.message); }
    finally { setAiLoading(false); setCeremony(false); }
  }
  function applyProposal() {
    setUndoStack(prev => [...prev.slice(-4), { events, dragId: null }]);
    playFlips(flipsFor(events, proposal.events));
    setEvents(proposal.events);
    const edits = propEdited.size > 0;
    const live = problemsOf(proposal.events, { windows, changed: changedIds || new Set(), edited: propEdited });
    setConflicts(new Set(edits ? live.map(x => x.id) : (proposal.conflicts || [])));
    setAiNote(edits ? (live.length ? `Applied your version. ${live.length} thing${live.length === 1 ? '' : 's'} to look at: ${live.map(x => x.text).slice(0, 2).join(' ')}` : 'Applied your version.') : (proposal.explanation || ''));
    setOrderIssues(edits ? live.filter(x => x.kind === 'order').map(x => ({ id: x.id, prereq_ids: (proposal.events.find(e => e.id === x.id)?.prereq_ids || []) })) : (proposal.order_violations || []));   // the warning clears itself if the new arrangement fixed the order
    setMoveFailed(null);
    leaveSelect();
  }

  // pointer handling on the grid (shared by dragging, linking and window selection)
  function onGridMove(e) {
    if (proposalDrag.current) {
      const d = proposalDrag.current;
      const t = dropTarget({ x: e.clientX, y: e.clientY, rect: gridRef.current.getBoundingClientRect(), numDays, pxPerMin: PX_PER_MIN, dayStart: DAY_START, dayEnd: DAY_END, grabMin: d.grabMin, duration: d.duration });
      if (allowed(t, { todayCol, nowMin })) setProposal(p => moveInProposal(p, d.id, weekDayNums[t.col], t.startMin));
      return;
    }
    if (planDrag.current) {
      const d = planDrag.current;
      const t = dropTarget({ x: e.clientX, y: e.clientY, rect: gridRef.current.getBoundingClientRect(), numDays, pxPerMin: PX_PER_MIN, dayStart: DAY_START, dayEnd: DAY_END, grabMin: d.grabMin, duration: d.duration });
      if (allowed(t, { todayCol, nowMin })) setPlan(p => ({ ...p, sessions: p.sessions.map(x => (x.id === d.id ? { ...x, day: weekDayNums[t.col], startMin: t.startMin } : x)) }));
      return;
    }
    if (sleepRef.current) {
      const m = DAY_START + (e.clientY - gridRef.current.getBoundingClientRect().top) / PX_PER_MIN;
      const next = dragSleep(sleepRef.current.edge, m, sleepRef.current.wake, sleepRef.current.sleep);
      sleepRef.current = { ...sleepRef.current, ...next };
      setEdges(next);
      return;
    }
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
    if (proposalDrag.current) { proposalDrag.current = null; return; }
    if (planDrag.current) { planDrag.current = null; return; }
    if (sleepRef.current) { const { wake, sleep } = sleepRef.current; sleepRef.current = null; setSleepActive(null); saveSleep(wake, sleep); return; }
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
  function onGridCancel() { proposalDrag.current = null; planDrag.current = null; sleepRef.current = null; setSleepActive(null); winRef.current = null; linkRef.current = null; selRef.current = null; setLinkDrag(null); setSelecting(null); handlePointerCancel(); }

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
  // what the arrangement breaks as it stands now (including by hand): shown, never blocking
  const propEdited = proposal?.edited || new Set();
  const propProblems = mode === 'diff' && proposal ? problemsOf(proposal.events, { windows, changed: changedIds || new Set(), edited: propEdited }) : [];
  // Links stay hidden until they matter: the group of the event you clicked or are holding, or the events in a broken order.
  const focusing = useMemo(() => {
    if (mode !== 'normal') return null;
    if (plan) return new Set();
    if (highlight) return highlight;
    if (orderIssues.length) return new Set(orderIssues.flatMap(v => [...cluster(events, v.id)]));
    if (selectedId && isLinked(events, selectedId)) return cluster(events, selectedId);
    return null;
  }, [mode, highlight, orderIssues, selectedId, events, plan]);
  const selEv = shown.find(e => e.id === selectedId);
  const sidePanel =
    mode === 'normal' && plan
      ? <PlanPanel plan={plan} events={events} dayLabel={dayLabel} clashOf={x => clashes(x, events, plan.sessions || [])}
          onRemove={id => setPlan(p => ({ ...p, sessions: p.sessions.filter(x => x.id !== id) }))} onConfirm={confirmPlan} onCancel={() => setPlan(null)} onRetry={() => startPlan(plan.nudge)} />
    : mode === 'normal' && grinderOpen
      ? <GrinderPanel items={grinder} onClose={() => setGrinderOpen(false)} onPlace={placeFromGrinder} onRemove={it => setGrinder(g => g.filter(x => x.id !== it.id))}
          onKeep={it => setGrinder(g => keepItem(g, it.id))} onSomeday={it => setGrinder(g => somedayItem(g, it.id))} onReopen={it => setGrinder(g => reopenItem(g, it.id))} />
    : mode === 'normal' && selEv && hasPanelContent(shown, selEv, isPast(selEv) || (isStarted(selEv) && !selEv.fixed))
      ? <EventPanel events={shown} selectedId={selectedId} dayLabel={dayLabel} dayIdx={dayIdx} past={isPast(selEv)} started={isStarted(selEv)}
          onChecklist={(action, arg) => handleChecklist(selEv.id, action, arg)} onOffTrack={d => handleOffTrack(selEv, d)}
          onClose={() => setSelectedId(null)} onSelect={setSelectedId} onReorder={reorderSteps} onUnlink={unlink}
          onSetGoal={(key, pct) => setEvents(prev => setGoal(prev, selEv.id, key, pct))} onResetGoals={() => setEvents(prev => resetGoals(prev, selEv.id))}
          onReflect={(data, action) => handleReflection(selEv, data, action)} onRest={(a, rest) => handleRest(selEv, a, rest)} />
    : mode === 'clip'
      ? <ClipPanel items={affected} choices={choices} setChoice={(id, v) => setChoices(c => ({ ...c, [id]: v }))}
          windowCount={windows.length} dayLabel={dayLabel} busy={aiLoading} error={panelError}
          onBack={() => setMode('select')} onContinue={proposeArrangement} onCancel={leaveSelect} />
    : mode === 'diff' && proposal
      ? <DiffPanel changes={diffEvents(events, proposal.events)} conflicts={propEdited.size ? [] : (proposal.conflicts || [])} titles={titles}
          problems={propProblems} edited={propEdited} onResetOne={id => setProposal(p => resetEdits(p, id))} onResetAll={() => setProposal(p => resetEdits(p))}
          explanation={proposal.explanation} view={diffView} setView={setDiffView} dayLabel={dayLabel}
          {...(handoff ? {
            title: handoff.title, variants: handoff.variants.length > 1 ? handoff.variants : null, variant: hv, onVariant: k => openVariant(k),
            applyLabel: hvVariant?.applyLabel || 'Apply this plan', backLabel: 'Cancel', onBack: cancelHandoff,
            notes: <HandoffNotes variant={hvVariant} titles={titles} />,
          } : {})}
          onApply={handoff ? applyHandoff : applyProposal} onBack={handoff ? cancelHandoff : () => setMode('clip')} onCancel={handoff ? cancelHandoff : leaveSelect} />
    : null;
  const pickProblem = linkPick && linkPick.toId && [ORDERED, GROUPED].map(t => linkProblem(events, linkPick.fromId, linkPick.toId, t));

  return (
    <>
      {mode !== 'normal' && <div aria-hidden onClick={leaveSelect} style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(250,248,245,.78)', backdropFilter: 'blur(1.5px)', animation: 'fadeIn .2s var(--ease)' }} />}

      {carryCandidate && mode === 'normal' && <CarryOver key={carryCandidate.id} ev={carryCandidate} onChoose={a => handleCarry(carryCandidate, a)} />}

      {orderIssues.length > 0 && !aiLoading && mode === 'normal' && (() => {
        const first = orderIssues[0], many = orderIssues.length > 1 || first.prereq_ids.length > 1;
        const cut = t => (t && t.length > 26 ? t.slice(0, 25) + '…' : t);
        return (
          <div role="alert" className="rise" style={{
            background: '#F3E6C8', boxShadow: '0 0 0 1px #E6D3A6', borderRadius: 24, padding: '14px 18px 14px 22px', marginBottom: 14,
            display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <div style={{ flex: '1 1 320px', fontSize: 13, lineHeight: 1.55, color: '#8A6A2F' }}>
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
          background: aiNote.startsWith('⚠') ? '#F3E6C8' : 'var(--surface-2)', border: `1px solid ${aiNote.startsWith('⚠') ? '#E6D3A6' : 'var(--line)'}`,
          borderRadius: 10, padding: '9px 14px', marginBottom: 12, fontSize: 12.5, lineHeight: 1.45,
          color: aiNote.startsWith('⚠') ? '#8A6A2F' : 'var(--ink-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
        }}>
          <span>{aiNote.replace(/^⚠\s*/, '')}</span>
          <button className="btn btn--ghost btn--icon" style={{ width: 24, height: 24 }} onClick={() => setAiNote('')} aria-label="Dismiss"><IconClose size={11} /></button>
        </div>
      )}

      {pendingLink && draftBlock && (
        <div style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--ink-2)' }}>
          New event will run after <strong style={{ fontWeight: 600 }}>{titles[pendingLink.fromId]}</strong>.
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', position: 'relative', zIndex: mode === 'normal' ? 'auto' : 41 }}>
        <div className="bezel rise" style={{ '--i': 2, flex: 1, minWidth: 0 }}><div className="core" style={{ overflow: 'clip' }}>

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
                <EnergyTap events={events} placement="below" />
                <SleepSettings wake={edges.wake} sleep={edges.sleep} onSave={saveSleep} error={sleepErr} />
                <button className="btn" onClick={() => { setGrinderOpen(o => !o); setSelectedId(null); }} aria-pressed={grinderOpen} title={staleCount ? `${staleCount} parked for 5+ days: keep, delete or someday?` : 'Work you parked on purpose'}><IconSteps size={13} />Meatball Grinder{grinder.length > 0 && <span className="mono" style={{ fontSize: 11, background: staleCount ? '#8A6A2F' : 'var(--forest)', color: 'var(--forest-ink)', borderRadius: 999, padding: '1px 7px' }}>{grinder.length}</span>}</button>
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
          <div style={{ display: 'flex', gap: compact ? 3 : 6, padding: '12px 8px 8px 0', position: 'sticky', top: 0, zIndex: 30, background: 'var(--surface)', boxShadow: '0 1px 0 var(--line-soft)' }}>
            <div style={{ width: 44, flexShrink: 0 }} />
            {weekDates.map((date, i) => {
              const num = dayNum(date);
              const isToday = date.toDateString() === todayStr;
              return (
                <button key={i} onClick={() => setSel(num)} aria-label={`${DOW_NAMES[i % 7]} ${date.getDate()}`} style={{
                  flex: 1, minWidth: 0, textAlign: 'center', padding: compact ? '7px 2px' : '10px 4px', cursor: 'pointer',
                  border: `1px solid ${isToday ? 'var(--forest)' : 'transparent'}`, borderRadius: compact ? 12 : 18,
                  background: isToday ? 'var(--forest)' : 'var(--surface-2)',
                  color: isToday ? 'var(--forest-ink)' : 'var(--ink)',
                  boxShadow: isToday ? '0 10px 18px -12px rgba(32,40,8,.8)' : 'none',
                }}>
                  <div className="label-caps" style={{ fontSize: compact ? 9 : 10.5, color: isToday ? 'rgba(233,240,220,.75)' : 'var(--ink-3)' }}>{DOW_NAMES[i % 7]}</div>
                  <div className="mono" style={{ marginTop: 3, fontSize: compact ? 12.5 : 15, fontWeight: 600 }}>{date.getDate()}{date.getDate() === 1 && <span style={{ marginLeft: 4, fontSize: compact ? 9 : 10.5, fontWeight: 500, opacity: .75 }}>{date.toLocaleDateString('en-GB', { month: 'short' })}</span>}</div>
                </button>
              );
            })}
          </div>

          {/* The whole day is on the page: the page scrolls, the day headers stay put */}
          <div ref={scrollRef}>
            <SleepFold side="top" open={openTop} onToggle={() => setOpenTop(o => !o)} label={`${fmtTime(DAY_START)} to ${fmtTime(vStartBase)}`}
              count={events.filter(e => weekDayNums.includes(e.day) && e.startMin < vStartBase).length} hidden={vStartBase <= DAY_START} />
            <div style={{ height: (vEnd - vStart) * PX_PER_MIN + 8, overflow: 'hidden', position: 'relative', paddingRight: 12 }}>
            <div style={{ display: 'flex', paddingTop: 8, transform: `translateY(${-(vStart - DAY_START) * PX_PER_MIN}px)` }}>
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

                {mode === 'normal' && <SleepBands wake={edges.wake} sleep={edges.sleep} onGrab={grabSleep} active={sleepActive} />}

                {weekDayNums.map((day, ci) => {
                  const isToday = weekDates[ci].toDateString() === todayStr;
                  const dayWindows = windows.filter(w => w.day === day);
                  const live = selecting?.day === day ? makeWindow(day, selecting.a, selecting.b, 15, 15, firstFree(ci), DAY_END) : null;
                  const past = mode === 'select' ? firstFree(ci) : DAY_START;
                  return (
                    <div key={day} onPointerDown={e => onColumnDown(e, day)} style={{
                      height: GRID_H, position: 'relative', minWidth: 0,
                      borderLeft: `1px solid ${ci % 7 === 0 && ci > 0 ? 'var(--ink-4)' : 'var(--line-soft)'}`,
                      background: dragPos?.day === day ? 'rgba(32,40,8,.045)' : isToday ? 'rgba(32,40,8,.035)' : 'transparent',
                      transition: 'background .15s var(--ease)', cursor: mode === 'select' ? 'crosshair' : 'cell',
                    }}>
                      {dragPos?.day === day && (
                        <div style={{ position: 'absolute', top: (dragPos.startMin - DAY_START) * PX_PER_MIN, left: 2, right: 2, height: 2, borderRadius: 2, zIndex: 5,
                          background: dragPos.blocked ? 'var(--danger)' : 'var(--accent)', opacity: dragPos.blocked ? .8 : .5 }} />
                      )}

                      {past > DAY_START && (
                        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: (past - DAY_START) * PX_PER_MIN, zIndex: 11, pointerEvents: 'none',
                          background: 'repeating-linear-gradient(135deg, transparent 0 5px, rgba(32,40,8,.045) 5px 6px)', borderBottom: past < DAY_END ? '1px dashed var(--ink-4)' : 'none' }} />
                      )}

                      {byDay[day].map(ev => (
                        <EventChip
                          key={ev.id} ev={ev} compact={compact}
                          label={displayTitle(shown, ev, dayIdx)}
                          past={isPast(ev)}
                          interactive={mode === 'normal'}
                          editOnly={mode === 'diff' && diffView === 'after' && !!proposal && !ev.fixed && !isPast(ev)}
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
                          onPointerDown={e => { e.stopPropagation(); if (mode === 'diff') { grabProposed(e, ev); return; } armLongPress(e, ev); startDrag(e, ev); }}
                          onResizeStart={(e, edge) => startResize(e, ev, edge)}
                          onDelete={() => deleteEvent(ev.id)}
                          onEdit={startEdit}
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
                          background: 'repeating-linear-gradient(135deg, rgba(32,40,8,.16) 0 6px, rgba(32,40,8,.07) 6px 12px)',
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

                      {plan?.sessions?.filter(x => x.day === day).map(x => {
                        const c = CATEGORY_COLORS[x.category] || DEFAULT_CAT_COLOR;
                        const clash = clashes(x, events, plan.sessions).length > 0;
                        return (
                          <div key={x.id} role="button" aria-label={`Suggested session ${fmtTime(x.startMin)}, drag to move`} onPointerDown={e => grabSession(e, x)} style={{
                            position: 'absolute', left: 3, right: 3, top: (x.startMin - DAY_START) * PX_PER_MIN, height: Math.max(x.durationMin * PX_PER_MIN - 2, 22), zIndex: 22,
                            borderRadius: 13, border: `2px dashed ${clash ? '#C4866D' : c.accent}`, background: clash ? 'rgba(196,134,109,.22)' : `${c.bg}F2`, color: c.text,
                            cursor: 'grab', touchAction: 'none', padding: '6px 8px', overflow: 'hidden', boxShadow: '0 10px 18px -12px rgba(32,40,8,.55)', animation: 'popIn .4s var(--spring) both',
                          }}>
                            <div className="display" style={{ fontSize: 12.5, lineHeight: 1.2, fontWeight: 600 }}>{x.title.replace(/ \(\d+\/\d+\)$/, '')}</div>
                            <div className="mono" style={{ fontSize: 10.5, opacity: .8, marginTop: 2 }}>{fmtTime(x.startMin)}-{fmtTime(x.startMin + x.durationMin)}</div>
                          </div>
                        );
                      })}

                      {draftBlock?.day === day && (
                        <DraftGhost draftBlock={draftBlock} newTaskDraft={newTaskDraft} onCancel={cancelDraft}
                          startDraftResize={startDraftResize} startDraftMove={startDraftMove} />
                      )}
                    </div>
                  );
                })}

                {todayCol >= 0 && nowMin >= DAY_START && nowMin <= DAY_END && (
                  <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: (nowMin - DAY_START) * PX_PER_MIN, zIndex: 9, pointerEvents: 'none', borderTop: '1.5px dashed rgba(106,120,77,.55)' }}>
                    <span className="mono" style={{ position: 'absolute', left: -44, top: -9, width: 40, textAlign: 'center', fontSize: 10, fontWeight: 600, padding: '2px 0', borderRadius: 999, background: 'var(--forest)', color: 'var(--forest-ink)' }}>{fmtTime(nowMin)}</span>
                    <span style={{ position: 'absolute', left: `calc(${(todayCol / numDays) * 100}% - 4px)`, top: -5, width: 9, height: 9, borderRadius: '50%', background: 'var(--forest)' }} />
                  </div>
                )}

                {/* a band of light passes over the week while Otto thinks */}
                {ceremony && (
                  <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 14, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', inset: '0 auto 0 0', width: '38%', background: 'rgba(32,40,8,.035)', animation: 'sweep 1.5s var(--ease) infinite' }} />
                  </div>
                )}

                {/* where each moved event used to be: a dashed outline that fades */}
                {Object.entries(flips).filter(([, f]) => f.fromCol >= 0).map(([id, f]) => (
                  <div key={`ghost-${id}`} aria-hidden style={{
                    position: 'absolute', zIndex: 4, pointerEvents: 'none', borderRadius: 13, border: '1.5px dashed var(--accent)', background: 'rgba(106,120,77,.07)',
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
                    {linkPick.toId ? (
                      <>
                        <div className="label-caps" style={{ padding: '6px 8px 4px' }}>Link as</div>
                        {[[ORDERED, 'Ordered', `${titles[linkPick.fromId]} first, then ${titles[linkPick.toId]}`], [GROUPED, 'Grouped', 'Shown together, no order']].map(([t, name, hint], i) => (
                          <button key={t} disabled={!!pickProblem[i]} onClick={() => chooseLinkType(t)} className="btn btn--ghost"
                            style={{ width: '100%', height: 'auto', justifyContent: 'flex-start', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '8px', textAlign: 'left' }}>
                            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{name}</span>
                            <span style={{ fontSize: 11.5, color: pickProblem[i] ? 'var(--danger)' : 'var(--ink-3)', fontWeight: 400, lineHeight: 1.35 }}>{pickProblem[i] || hint}</span>
                          </button>
                        ))}
                      </>
                    ) : (
                      <>
                        <div className="label-caps" style={{ padding: '6px 8px 4px' }}>Nothing there</div>
                        <p style={{ margin: '0 8px 6px', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.4 }}>Drop onto an event to link them, or make a new event that follows {titles[linkPick.fromId]}.</p>
                        <button className="btn btn--primary" style={{ width: 'calc(100% - 8px)', margin: '0 4px 4px', justifyContent: 'center' }} onClick={createLinked}>New event after it</button>
                      </>
                    )}
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
            <SleepFold side="bottom" open={openBottom} onToggle={() => setOpenBottom(o => !o)} label={`${fmtTime(vEndBase)} to ${fmtTime(DAY_END)}`}
              count={events.filter(e => weekDayNums.includes(e.day) && e.startMin + e.durationMin > vEndBase).length} hidden={vEndBase >= DAY_END} />
          </div>

          <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--ink-3)', padding: '8px 0 10px', borderTop: '1px solid var(--line-soft)' }}>
            Drag to move · pull the edges to resize · drag from the dot on an event&rsquo;s right edge to link · click a linked event to see what it connects to
          </div>

          {/* the thinking beat: Otto is re-arranging */}
          {ceremony && (
            <div role="status" aria-live="polite" style={{
              position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 18px 6px 8px', borderRadius: 6, background: 'rgba(38,58,44,.94)', color: 'var(--forest-ink)', fontSize: 12.5, fontWeight: 600,
              boxShadow: 'none', animation: 'popIn .5s var(--spring) both',
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

        {sidePanel && <div style={{ position: 'sticky', top: 12, alignSelf: 'flex-start', maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', borderRadius: 28 }}>{sidePanel}</div>}
      </div>

      {toast && (
        <div key={toast.id} role="status" style={{
          position: 'fixed', top: 22, left: '50%', zIndex: 120, padding: '10px 20px', borderRadius: 6, textAlign: 'center',
          background: 'rgba(251,248,238,.96)', boxShadow: '0 0 0 1px var(--line)',
          animation: 'toastIn .7s var(--spring) both',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-.01em' }}>{toast.text}</div>
          {toast.sub && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>{toast.sub}</div>}
        </div>
      )}

      {seriesAsk && (
        <div role="dialog" aria-label="Remove a repeating event" onPointerDown={e => e.stopPropagation()} style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'grid', placeItems: 'center', background: 'rgba(32,40,8,.32)' }} onClick={() => setSeriesAsk(null)}>
          <div className="bezel" onClick={e => e.stopPropagation()}><div className="core" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12, width: 340 }}>
            <span className="display" style={{ fontSize: 20 }}>Remove “{seriesAsk.title}”?</span>
            <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>It repeats. How much of it should go?</span>
            <button className="btn btn--primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => deleteEvent(seriesAsk.id, 'this')}>Just this one</button>
            <button className="btn btn--primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => deleteEvent(seriesAsk.id, 'following')}>This and every one after</button>
            <button className="btn" onClick={() => setSeriesAsk(null)}>Keep it</button>
          </div></div>
        </div>
      )}

      {decisionQ.length > 0 && <ImportanceConflict decisions={decisionQ} onAnswer={answerDecision} onClose={() => setDecisionQ([])} />}

      {draftBlock && !isDraftMoving && (
        <EventCreation
          draftBlock={draftBlock} newTaskDraft={newTaskDraft} setNewTaskDraft={setNewTaskDraft}
          gridRef={gridRef} scrollRef={scrollRef} weekDayNums={weekDayNums} weekDates={weekDates}
          onCommit={commitDraft} onCancel={cancelDraft} onRequestCancel={requestCancel}
          confirmingCancel={confirmingCancel} onConfirmCancel={cancelDraft} onDismissConfirm={() => setConfirmingCancel(false)}
          setDraftBlock={setDraftBlock} editing={editingEv} series={seriesOf(seriesList, editingEv || {})} goals={goals}
        />
      )}
    </>
  );
}
