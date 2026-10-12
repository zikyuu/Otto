import { useState, useRef, useEffect } from 'react';
import Mascot from '../../components/Mascot.jsx';
import { IconCalendar, IconClock, IconFlag, IconTarget, IconPin, IconClose, IconPlus, IconArrow, IconGrip, IconSteps, IconTrash, categoryIcon } from './Icons.jsx';
import { CATEGORY_COLORS } from '../../data/fixtures.js';
import { fmtTime, isoDate, DAY_START, DAY_END, PX_PER_MIN } from './calendarUtils.js';
import { checkDates } from './dateChecks.js';
import PieChart, { SLICE_COLORS } from '../../components/PieChart.jsx';
import { MIN_SUB, spread, refit, parseDuration } from './subtaskMath.js';

// the same palette the calendar draws with, so a dot here is the colour the event will have
const EVENT_COLORS = ['llm', 'leetcode', 'interview', 'gym', 'leisure', 'admin']
  .map(category => ({ ...CATEGORY_COLORS[category], category }));

const MAX_BLOCK   = 105 * 60;   // a week of working days: past this, the event is probably a typo
const POPUP_W     = 352;
const POPUP_W_ADV = 800;

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
  gridRef, scrollRef, weekDayNums, weekDates,
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

  const total = newTaskDraft.duration_planned;

  const [subtasks, setSubtasks] = useState(() => {
    const half = Math.floor(total / 2);
    return [
      { id: 1, name: '', mins: half,         pinned: false, orderGroup: null },
      { id: 2, name: '', mins: total - half, pinned: false, orderGroup: null },
    ];
  });
  const [pending,     setPending]     = useState(null);   // a typed time awaiting "how should the rest adjust?"
  const [inputNonce,  setInputNonce]  = useState(0);      // bump to reset time inputs after a cancel
  const [durNonce,    setDurNonce]    = useState(0);      // bump to reset the duration input after a bad entry

  // Block resized from the grid → re-fit the unpinned subtasks to the new length.
  useEffect(() => {
    setSubtasks(prev => (prev.reduce((a, x) => a + x.mins, 0) === total ? prev : refit(prev, total)));
  }, [total]);

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
    const colW      = rect.width / weekDayNums.length;
    const colIdx    = weekDayNums.indexOf(draftBlock.day);
    const blockTop  = rect.top + (draftBlock.startMin - DAY_START) * PX_PER_MIN;   // rect.top already includes the scroll
    const colLeft   = rect.left + colIdx * colW;
    left = colIdx <= 3 ? colLeft + colW + 10 : colLeft - popW - 10;
    left = Math.max(12, Math.min(window.innerWidth - popW - 12, left));
    top  = Math.max(8, Math.min(window.innerHeight - (isAdvanced ? 700 : 610), blockTop));
  }

  const sel    = EVENT_COLORS.find(c => c.category === newTaskDraft.category) || EVENT_COLORS[0];
  const endMin = draftBlock.startMin + newTaskDraft.duration_planned;
  const spans  = endMin > DAY_END;      // longer than what is left of the day: Otto spreads it over several days
  const orderNums = computeOrderNums(subtasks);

  const plannedSum = subtasks.reduce((a, x) => a + x.mins, 0);
  const mismatch   = isAdvanced && plannedSum !== total;
  // Dates must be today-or-later and not before the day this event sits on.
  const eventIso   = weekDates?.[weekDayNums.indexOf(draftBlock.day)] ? isoDate(weekDates[weekDayNums.indexOf(draftBlock.day)]) : isoDate(new Date());
  const todayIso   = isoDate(new Date());
  const dateErrors = isAdvanced ? checkDates({ deadline, bestDoneBy, eventIso, todayIso }) : {};
  const datesOk    = Object.keys(dateErrors).length === 0;
  const dateFloor  = eventIso > todayIso ? eventIso : todayIso;
  const canCommit  = !!newTaskDraft.title.trim() && !pending && !mismatch && datesOk;

  function commit() {
    if (!canCommit) return;
    // keep every subtask once the user has named at least one, so the saved minutes add up
    const keep = isAdvanced && subtasks.some(x => x.name.trim()) ? subtasks.map((x, i) => ({ x, i })) : [];
    const saved = keep.map(({ x, i }) => ({
      id: String(x.id), name: x.name.trim() || `Subtask ${i + 1}`, minutes: x.mins,
      order: orderSpecific ? orderNums[i] : null,
    }));
    onCommit({
      description: description.trim() || null,
      span_days: spans,
      subtasks: saved,
      order_specific: isAdvanced && orderSpecific,
      deadline_iso:     isAdvanced && deadline ? deadline : null,
      hard_deadline:    isHardDeadline,
      best_done_by_iso: isAdvanced && bestDoneBy ? bestDoneBy : null,
    });
  }

  // ── Subtask helpers ─────────────────────────────────────────────────────────
  function addSubtask() {
    setPending(null);
    setSubtasks(prev => {
      const free = prev.filter(x => !x.pinned);
      const avg  = free.length ? free.reduce((a, x) => a + x.mins, 0) / free.length : MIN_SUB;
      return refit([...prev, { id: Date.now(), name: '', mins: Math.round(avg), pinned: false, orderGroup: null }], total);
    });
  }

  function removeSubtask(id) {
    setPending(null);
    setSubtasks(prev => {
      const next = prev.filter(x => x.id !== id);
      return next.length ? refit(next, total) : next;
    });
    setSelectedIds(prev => { const n = new Set(prev); n.delete(String(id)); return n; });
  }

  function togglePin(id) {
    setSubtasks(prev => prev.map(x => (x.id === id ? { ...x, pinned: !x.pinned } : x)));
  }

  // Block length typed at the top. Subtasks re-fit to it through the [total] effect.
  function setDuration(str) {
    const m = parseDuration(str);
    setDurNonce(n => n + 1);
    if (m <= 0) return;
    const clamped = Math.max(15, Math.min(m, MAX_BLOCK));   // longer than what is left of the day is fine: it gets spread over days
    setPending(null);
    setNewTaskDraft(d => ({ ...d, duration_planned: clamped }));
  }

  // Typing a time on a subtask always asks how the rest should adjust:
  //   keep the block  -> this subtask stays as typed, the others share the remainder by their ratio
  //   keep the ratios -> every subtask scales by the same factor, so the block length changes
  function handleTimeInput(id, inputStr) {
    const m = parseMins(inputStr);
    const idx = subtasks.findIndex(x => x.id === id);
    if (idx === -1 || m <= 0 || m === subtasks[idx].mins) return;
    const cur = subtasks[idx].mins;

    const withEdit = list => list.map(x => (x.id === id ? { ...x, mins: m, pinned: true } : x));
    const others     = subtasks.filter(x => x.id !== id);
    const freeOthers = others.filter(x => !x.pinned);
    const pinnedSum  = others.filter(x => x.pinned).reduce((a, x) => a + x.mins, 0);
    const fits       = (T) => T >= 15 && T <= MAX_BLOCK;

    // keep the block: the others share what is left, in proportion to their current times
    const keepRoom = total - m - pinnedSum;
    const keepOk   = freeOthers.length > 0 && keepRoom >= MIN_SUB * freeOthers.length;
    const keepList = keepOk ? refit(withEdit(subtasks), total) : null;

    // keep the ratios: scale everything by the same factor
    const k         = m / cur;
    const scaleT    = Math.max(15, Math.round((total * k) / 5) * 5);
    const scaleOth  = spread(others.map(x => x.mins), Math.max(scaleT - m, 0), 1);
    let oi = 0;
    const scaleList = withEdit(subtasks).map(x => (x.id === id ? x : { ...x, mins: scaleOth[oi++] }));

    setPending({
      id, name: subtasks[idx].name.trim() || `Subtask ${idx + 1}`, m, cur,
      opts: [
        { key: 'keep', list: keepList, T: total, ok: keepOk,
          title: `Keep the block at ${fmtMins(total)}`,
          sub: keepOk ? 'the others share the rest, keeping their ratio'
                      : 'not possible — there is no room left for the others' },
        { key: 'scale', list: scaleList, T: scaleT, ok: fits(scaleT),
          title: `Keep the ratios — block becomes ${fmtMins(scaleT)}`,
          sub: draftBlock.startMin + scaleT > DAY_END
            ? 'Every subtask scales together. It is longer than what is left today, so it will be spread over several days at times that are free.'
            : 'every subtask grows or shrinks together' },
      ],
    });
  }

  function applyOption(o) {
    setSubtasks(o.list);
    if (o.T !== total) setNewTaskDraft(d => ({ ...d, duration_planned: o.T }));
    setPending(null);
  }

  function cancelPending() { setPending(null); setInputNonce(n => n + 1); }

  // Pie drag changes the ratio only. The block length never moves; the others absorb the change.
  function handlePieDrag(idx, newPct) {
    setPending(null);
    setSubtasks(prev => {
      const others     = prev.filter((_, i) => i !== idx);
      const freeOthers = others.filter(x => !x.pinned);
      if (freeOthers.length === 0) return prev;
      const pinnedSum = others.filter(x => x.pinned).reduce((a, x) => a + x.mins, 0);
      const maxFor    = total - pinnedSum - MIN_SUB * freeOthers.length;
      const target    = Math.max(MIN_SUB, Math.min(maxFor, Math.round((newPct / 100 * total) / 5) * 5));
      const edited    = prev.map((x, i) => (i === idx ? { ...x, mins: target } : x));
      const wasPinned = prev[idx].pinned;
      return refit(edited.map((x, i) => (i === idx ? { ...x, pinned: true } : x)), total)
        .map((x, i) => (i === idx ? { ...x, pinned: wasPinned } : x));
    });
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
  const dateField = err => ({
    width: '100%', height: 38, padding: '0 12px', borderRadius: 12, border: 0, outline: 'none', fontSize: 13, fontWeight: 500, color: 'var(--ink)',
    background: 'var(--surface-2)', boxShadow: `inset 0 0 0 1px ${err ? 'var(--danger)' : 'var(--line)'}`, fontFamily: 'inherit', accentColor: 'var(--accent)',
  });
  const Switch = ({ on, onChange, label }) => (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} style={{
      width: 38, height: 22, borderRadius: 999, border: 0, padding: 2, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center',
      background: on ? 'var(--accent)' : 'rgba(46,74,56,.18)', transition: 'background .5s var(--ease)', justifyContent: on ? 'flex-end' : 'flex-start',
    }}>
      <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,.25)', transition: 'transform .5s var(--spring)' }} />
    </button>
  );
  const Seg = ({ value, onChange, options, label }) => (
    <div role="group" aria-label={label} className="seg" style={{ padding: 3 }}>
      {options.map(([v, text]) => <button key={String(v)} aria-pressed={value === v} onClick={() => onChange(v)} style={{ height: 26, padding: '0 14px', fontSize: 12 }}>{text}</button>)}
    </div>
  );

  const detailsCol = (
    <div style={{ padding: '22px 24px 20px', display: 'flex', flexDirection: 'column', gap: 16, width: POPUP_W, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          className="bare" autoFocus type="text" placeholder="Name this event"
          value={newTaskDraft.title}
          onChange={e => setNewTaskDraft(d => ({ ...d, title: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onRequestCancel(); }}
          style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', fontSize: 21, fontWeight: 600, letterSpacing: '-.03em', color: 'var(--ink)', background: 'transparent', fontFamily: 'inherit' }}
        />
        <button aria-label="Close" onPointerDown={e => { e.stopPropagation(); onRequestCancel(); }} className="btn btn--ghost btn--icon" style={{ width: 30, height: 30 }}><IconClose size={13} /></button>
      </div>

      <input className="bare" type="text" placeholder="Add a note" value={description} onChange={e => setDescription(e.target.value)}
        style={{ border: 0, outline: 'none', fontSize: 13.5, color: 'var(--ink-2)', background: 'transparent', fontFamily: 'inherit', marginTop: -8 }} />

      {/* when */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 14px', borderRadius: 16, background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line-soft)' }}>
        <IconClock size={15} style={{ color: 'var(--ink-3)' }} />
        <span className="mono" style={{ fontSize: 13.5, fontWeight: 500 }}>{spans ? `From ${fmtTime(draftBlock.startMin)}` : `${fmtTime(draftBlock.startMin)} to ${fmtTime(endMin)}`}</span>
        <input
          className="bare" type="text" key={`dur-${total}-${durNonce}`} defaultValue={fmtMins(total)}
          title="Block length: type 2h, 1h30 or 90" aria-label="Block length"
          onFocus={e => e.target.select()} onBlur={e => setDuration(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }} onPointerDown={e => e.stopPropagation()}
          style={{ marginLeft: 'auto', width: 62, textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: sel.text, fontFamily: 'inherit', background: sel.bg, boxShadow: `inset 0 0 0 1px ${sel.accent}40`, border: 0, borderRadius: 999, padding: '5px 8px', outline: 'none' }}
        />
      </div>

      {spans && (
        <div role="note" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 13px', borderRadius: 16, background: '#E4ECD6', boxShadow: 'inset 0 0 0 1px #C9DBB9', marginTop: -4 }}>
          <IconCalendar size={16} style={{ color: 'var(--accent-ink)', marginTop: 1 }} />
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--ink-2)' }}>
            <strong style={{ fontWeight: 600, color: 'var(--ink)' }}>This event will span several days</strong> and be filled in at the times you have free, not as one block.
          </p>
        </div>
      )}

      {/* what kind */}
      <div>
        <p className="label-caps" style={{ margin: '0 0 8px' }}>Kind of work</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {EVENT_COLORS.map(c => {
            const Glyph = categoryIcon(c.category), on = c.category === newTaskDraft.category;
            return (
              <button key={c.category} onClick={() => setNewTaskDraft(d => ({ ...d, category: c.category }))} aria-pressed={on} style={{
                display: 'flex', alignItems: 'center', gap: 7, height: 36, padding: '0 10px', borderRadius: 12, border: 0, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12, fontWeight: 600, color: on ? c.text : 'var(--ink-3)', background: on ? c.bg : 'transparent',
                boxShadow: `inset 0 0 0 1px ${on ? c.accent + '66' : 'var(--line)'}`, transform: on ? 'translateY(-1px)' : 'none',
                transition: 'all .5s var(--ease)',
              }}>
                <Glyph size={14} style={{ color: c.accent }} /><span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label.split(' / ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* must-do */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Must-do</div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.4 }}>Otto protects this first when the week gets tight.</div>
        </div>
        <Switch on={!!newTaskDraft.non_negotiable} onChange={v => setNewTaskDraft(d => ({ ...d, non_negotiable: v }))} label="Must-do" />
      </div>

      {/* advanced planning entry */}
      <button onClick={() => setIsAdvanced(a => !a)} aria-expanded={isAdvanced} style={{
        display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', border: 0, fontFamily: 'inherit', color: 'inherit',
        padding: '10px 10px 10px 8px', borderRadius: 20, background: isAdvanced ? '#E4ECD6' : 'var(--surface-2)', boxShadow: `inset 0 0 0 1px ${isAdvanced ? '#C9DBB9' : 'var(--line)'}`,
        transition: 'background .5s var(--ease), box-shadow .5s var(--ease)',
      }}>
        <span style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(255,255,255,.7)', display: 'grid', placeItems: 'center', overflow: 'hidden', flexShrink: 0 }}>
          <Mascot art="otter-thinking" size={52} zoom={2.6} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>Advanced planning</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.35 }}>{isAdvanced ? 'Steps, deadlines and order are open on the right.' : 'Split it into steps and set a deadline.'}</span>
        </span>
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(46,74,56,.1)', display: 'grid', placeItems: 'center', transform: isAdvanced ? 'rotate(180deg)' : 'none', transition: 'transform .6s var(--ease)' }}>
          <IconArrow size={13} style={{ transform: 'rotate(90deg)' }} />
        </span>
      </button>
    </div>
  );

  const planCol = isAdvanced && (
    <div style={{ flex: 1, minWidth: 0, padding: '22px 24px 20px', background: 'linear-gradient(180deg, rgba(240,234,214,.55), rgba(240,234,214,.25))', borderLeft: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: 22, animation: 'riseIn .8s var(--ease) both' }}>
      {/* timing */}
      <section aria-label="Timing">
        <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600, letterSpacing: '-.015em' }}>When it has to be done</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12 }}>
          <div className="bezel bezel--sm"><div className="core" style={{ padding: 14 }}>
            <label style={{ display: 'block', marginBottom: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}><IconFlag size={13} style={{ color: isHardDeadline ? 'var(--danger)' : 'var(--ink-3)' }} />Deadline</span>
              <input type="date" value={deadline} min={dateFloor} onChange={e => setDeadline(e.target.value)} aria-invalid={!!dateErrors.deadline} style={{ ...dateField(dateErrors.deadline), display: 'block' }} />
            </label>
            <Seg label="Deadline firmness" value={isHardDeadline} onChange={setIsHardDeadline} options={[[true, 'Hard'], [false, 'Soft']]} />
            {dateErrors.deadline && <p role="alert" style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--danger)', fontWeight: 500, lineHeight: 1.35 }}>{dateErrors.deadline}</p>}
          </div></div>
          <div className="bezel bezel--sm"><div className="core" style={{ padding: 14 }}>
            <label style={{ display: 'block', marginBottom: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 8 }}><IconTarget size={13} style={{ color: 'var(--accent)' }} />Best done by</span>
              <input type="date" value={bestDoneBy} min={dateFloor} onChange={e => setBestDoneBy(e.target.value)} aria-invalid={!!dateErrors.bestDoneBy} style={{ ...dateField(dateErrors.bestDoneBy), display: 'block' }} />
            </label>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.45 }}>A nudge, never a wall.</p>
            {dateErrors.bestDoneBy && <p role="alert" style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--danger)', fontWeight: 500, lineHeight: 1.35 }}>{dateErrors.bestDoneBy}</p>}
          </div></div>
        </div>
      </section>

      {/* steps */}
      <section aria-label="Steps">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, letterSpacing: '-.015em', flex: 1 }}>Break it into steps</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' }}>
            In order
            <Switch on={orderSpecific} onChange={v => { setOrderSpecific(v); setSelectedIds(new Set()); }} label="Steps must be done in order" />
          </label>
        </div>
        {orderSpecific && <p style={{ margin: '-4px 0 10px', fontSize: 12, color: 'var(--ink-3)' }}>Drag the grip to reorder. Right-click and drag across steps to group ones that can happen together.</p>}

        {orderSpecific && selectedIds.size >= 2 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: `${sel.accent}18`, boxShadow: `inset 0 0 0 1px ${sel.accent}44`, borderRadius: 14, padding: '7px 8px 7px 14px', marginBottom: 10, animation: 'popIn .4s var(--spring) both' }}>
            <span style={{ fontSize: 12.5, color: sel.text, fontWeight: 600, flex: 1 }}>{selectedIds.size} steps selected</span>
            <button className="btn btn--primary" onClick={groupSelected} style={{ height: 28, padding: '0 14px', fontSize: 12 }}>Group together</button>
            <button className="btn btn--ghost btn--icon" aria-label="Clear selection" onClick={() => setSelectedIds(new Set())} style={{ width: 28, height: 28 }}><IconClose size={12} /></button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0, position: 'relative', paddingTop: 2 }}>
            <PieChart
              slices={subtasks.map((s, i) => ({ percent: total > 0 ? (s.mins / total) * 100 : 0, color: SLICE_COLORS[i % SLICE_COLORS.length] }))}
              onDrag={handlePieDrag} size={118} center={{ top: fmtMins(total), bottom: 'block' }}
            />
            <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: 11, color: 'var(--ink-3)', maxWidth: 118, lineHeight: 1.35 }}>Drag a slice to rebalance</p>
          </div>

          <div ref={listRef} style={{ flex: 1, minWidth: 0, position: 'relative', userSelect: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}
            onPointerMove={onListPointerMove} onPointerUp={onListPointerUp} onPointerCancel={onListPointerUp} onPointerDown={onListPointerDown} onContextMenu={e => e.preventDefault()}>
            {selRect && selRect.height > 4 && (
              <div style={{ position: 'absolute', left: -4, right: -4, top: selRect.top, height: selRect.height, background: `${sel.accent}18`, boxShadow: `inset 0 0 0 1.5px ${sel.accent}88`, borderRadius: 14, pointerEvents: 'none', zIndex: 10 }} />
            )}

            {subtasks.map((s, i) => {
              const isDragging = i === draggingIdx;
              const isDropOver = orderSpecific && i === overIdx && draggingIdx !== null && i !== draggingIdx;
              const isSelected = selectedIds.has(String(s.id));
              const orderNum = orderSpecific ? orderNums[i] : null;
              const color = SLICE_COLORS[i % SLICE_COLORS.length];
              return (
                <div key={s.id} data-subtask-row="1" data-subtask-id={String(s.id)} className="step-row" style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px 6px 10px', borderRadius: 14, minHeight: 42,
                  background: isSelected ? `${sel.accent}18` : 'var(--surface)', opacity: isDragging ? .35 : 1,
                  boxShadow: `inset 0 0 0 1px ${isSelected ? sel.accent + '77' : 'var(--line-soft)'}${isDropOver ? `, 0 -2px 0 0 ${sel.accent}` : ''}`,
                  transition: 'opacity .3s var(--ease), box-shadow .3s var(--ease), background .3s var(--ease)',
                }}>
                  {orderSpecific && <span onPointerDown={e => onDragHandleDown(e, i)} aria-label="Drag to reorder" style={{ color: 'var(--ink-4)', cursor: 'grab', display: 'flex', touchAction: 'none' }}><IconGrip size={14} /></span>}
                  <span title={s.orderGroup != null ? 'Grouped. Click to ungroup.' : undefined} onClick={() => s.orderGroup != null && ungroupItem(s.id)}
                    style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: '#fff', background: color, cursor: s.orderGroup != null ? 'pointer' : 'default', boxShadow: s.orderGroup != null ? `0 0 0 2px var(--surface), 0 0 0 3.5px ${color}` : 'none' }}>
                    {orderSpecific ? orderNum : ''}
                  </span>
                  <input className="bare" type="text" placeholder={`Step ${i + 1}`} aria-label={`Step ${i + 1} name`} value={s.name}
                    onChange={e => setSubtasks(prev => prev.map(x => x.id === s.id ? { ...x, name: e.target.value } : x))}
                    onPointerDown={e => e.stopPropagation()}
                    style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', fontSize: 13.5, fontWeight: 500, fontFamily: 'inherit', color: 'var(--ink)', background: 'transparent' }} />
                  <button onClick={() => togglePin(s.id)} onPointerDown={e => e.stopPropagation()} aria-pressed={s.pinned} aria-label={s.pinned ? 'Unpin this time' : 'Pin this time'}
                    title={s.pinned ? 'Pinned: this time holds while the others change' : 'Pin this time so it holds while the others change'}
                    style={{ border: 0, background: s.pinned ? `${color}26` : 'transparent', color: s.pinned ? color : 'var(--ink-4)', width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all .4s var(--ease)' }}>
                    <IconPin size={13} />
                  </button>
                  <input className="bare" type="text" defaultValue={fmtMins(s.mins)} key={`${s.id}-${s.mins}-${inputNonce}`} aria-label={`Step ${i + 1} time`}
                    onBlur={e => handleTimeInput(s.id, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                    onPointerDown={e => e.stopPropagation()} onFocus={e => e.target.select()}
                    className="mono" style={{ width: 54, height: 28, textAlign: 'center', border: 0, outline: 'none', fontSize: 12.5, fontWeight: s.pinned ? 700 : 500, fontFamily: 'inherit', color: s.pinned ? 'var(--ink)' : 'var(--ink-2)', background: 'var(--surface-2)', borderRadius: 999, flexShrink: 0 }} />
                  {subtasks.length > 1 && (
                    <button onClick={() => removeSubtask(s.id)} onPointerDown={e => e.stopPropagation()} aria-label={`Remove step ${i + 1}`} className="btn btn--ghost btn--icon" style={{ width: 26, height: 26, color: 'var(--ink-4)' }}><IconTrash size={13} /></button>
                  )}
                </div>
              );
            })}

            <button className="btn btn--ghost" onClick={addSubtask} onPointerDown={e => e.stopPropagation()} style={{ alignSelf: 'flex-start', height: 30, color: 'var(--accent-ink)', paddingLeft: 10 }}><IconPlus size={13} />Add a step</button>
          </div>
        </div>

        {pending && (
          <div role="group" aria-label="How should the rest adjust?" style={{ marginTop: 14, padding: 14, borderRadius: 18, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line), 0 14px 24px -18px rgba(46,58,38,.5)', animation: 'popIn .5s var(--spring) both' }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>“{pending.name}” becomes {fmtMins(pending.m)} (it was {fmtMins(pending.cur)}). What should adjust?</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {pending.opts.map(o => (
                <button key={o.key} disabled={!o.ok} onClick={() => applyOption(o)} style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 14, border: 0, fontFamily: 'inherit', cursor: o.ok ? 'pointer' : 'not-allowed', opacity: o.ok ? 1 : .5,
                  background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)', transition: 'all .4s var(--ease)',
                }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: sel.text }}>{o.title}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.35 }}>{o.ok ? o.sub : o.key === 'scale' ? 'That is longer than a week can hold.' : o.sub}</span>
                  {o.ok && <span className="mono" style={{ display: 'block', fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{o.list.map(x => fmtMins(x.mins)).join(' / ')}</span>}
                </button>
              ))}
            </div>
            <button className="btn btn--ghost" onClick={cancelPending} style={{ height: 28, marginTop: 8, padding: '0 10px' }}>Cancel</button>
          </div>
        )}

        {!pending && mismatch && (
          <div role="alert" style={{ marginTop: 14, padding: '12px 14px', borderRadius: 16, background: '#F7E4DE', boxShadow: 'inset 0 0 0 1px #E8C0B2', fontSize: 12.5, color: '#8A3A26', lineHeight: 1.45 }}>
            Pinned steps add up to <strong>{fmtMins(plannedSum)}</strong>, but the block is <strong>{fmtMins(total)}</strong>.
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn btn--primary" style={{ height: 28, background: 'var(--danger)', boxShadow: 'none' }} onClick={() => setNewTaskDraft(d => ({ ...d, duration_planned: plannedSum }))}>Make the block {fmtMins(plannedSum)}</button>
              <button className="btn" style={{ height: 28 }} onClick={() => setSubtasks(prev => { const mins = spread(prev.map(x => x.mins), total); return prev.map((x, i) => ({ ...x, mins: mins[i], pinned: false })); })}>Unpin and re-spread</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );

  const stepCount = isAdvanced ? subtasks.filter(x => x.name.trim()).length : 0;
  return (
    <div className="bezel bezel--float" onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.stopPropagation()}
      style={{ position: 'fixed', zIndex: 100, top, left, width: popW, maxHeight: 'calc(100vh - 24px)', transition: 'width .7s var(--ease)', animation: 'riseIn .6s var(--ease) both' }}>
      <div className="core" style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 36px)' }}>
        <div style={{ height: 4, background: `linear-gradient(90deg, ${sel.accent}, ${sel.accent}88)`, flexShrink: 0 }} />

        {confirmingCancel && (
          <div onPointerDown={e => e.stopPropagation()} role="alertdialog" aria-label="Discard this event?" style={{
            position: 'absolute', inset: 0, zIndex: 20, background: 'rgba(251,248,238,.9)', backdropFilter: 'blur(8px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, animation: 'fadeIn .3s var(--ease)',
          }}>
            <Mascot art="otter-sad" size={92} zoom={2.6} />
            <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.02em' }}>Discard this event?</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary" style={{ background: 'var(--danger)' }} onPointerDown={e => { e.stopPropagation(); onConfirmCancel(); }}>Discard</button>
              <button className="btn" onPointerDown={e => { e.stopPropagation(); onDismissConfirm(); }}>Keep editing</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {detailsCol}
          {planCol}
        </div>

        {/* footer: the summary, and the one action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 24px', borderTop: '1px solid var(--line-soft)', background: 'rgba(240,234,214,.4)', flexShrink: 0 }}>
          <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.4 }}>
            {pending ? 'Choose how the rest should adjust first.'
              : !datesOk ? 'Fix the dates to continue.'
              : mismatch ? 'Fix the step total to continue.'
              : <><strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{fmtMins(total)}</strong>{spans ? ', spread over several days' : ''}{stepCount ? ` in ${stepCount} step${stepCount === 1 ? '' : 's'}` : ''}{isAdvanced && deadline ? `, due ${deadline}` : ''}</>}
          </p>
          <button className="btn btn--ghost" onPointerDown={e => { e.stopPropagation(); onRequestCancel(); }}>Cancel</button>
          <button className="btn btn--primary" onClick={commit} disabled={!canCommit} style={{ height: 40, padding: '0 8px 0 20px', fontSize: 13.5 }}>
            Add to calendar<span className="btn__icon" style={{ width: 26, height: 26, marginRight: 0 }}><IconArrow size={13} /></span>
          </button>
        </div>
      </div>
    </div>
  );
}
