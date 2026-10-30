import { useEffect, useMemo, useRef, useState } from 'react';
import './styles.css';
import TaskCreateModal from './modals/TaskCreateModal.jsx';

import Sidebar from './components/Sidebar.jsx';
import Now from './views/Now.jsx';
import Overwhelmed from './views/Overwhelmed.jsx';
import Priorities from './views/Priorities.jsx';
import Calendar from './views/calendar/Calendar.jsx';
import GoalsTracker from './views/goals/GoalsTracker.jsx';
import Rules from './views/Rules.jsx';
import Stats from './views/Stats.jsx';
import Feasibility from './modals/Feasibility.jsx';
import Tradeoff from './modals/Tradeoff.jsx';
import Oversleep from './modals/Oversleep.jsx';
import WeeklyChat from './modals/WeeklyChat.jsx';
import Mascot from './components/Mascot.jsx';
import LaterStart from './modals/LaterStart.jsx';
import LunchNudge from './components/LunchNudge.jsx';

import { INITIAL_EVENTS } from './data/fixtures.js';
import { getDays, isoDate, dayNum, migrateEvents, fmtTime } from './views/calendar/calendarUtils.js';
import { hydrate, installMirror } from './persist.js';
import { getSeries, subscribeSeries } from './views/calendar/seriesStore.js';
import { ensureHorizon } from './views/calendar/recurrence.js';
import { enrichNew } from './enrichment.js';
import { planWindow } from './home/makeTime.js';
import { variantsOf } from './home/overwhelm.js';
import { checkOversleep, applyOversleep, weekCheck, downscope, overwhelmPlan, logLateStart, scheduleEvents, setSleepWindow } from './api.js';

const EVENTS_KEY = 'otto.events.v1';
const GRINDER_KEY = 'otto.grinder.v1';
const OPENED_KEY = 'otto.opened.v1';

const readJSON = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
const writeJSON = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private window */ } };

// Hydrate saved state from the server before anything reads it, then mirror every later write.
export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    hydrate().finally(() => { installMirror(); if (live) setReady(true); });
    return () => { live = false; };
  }, []);
  if (!ready) {
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--app-bg)' }}>
        <Mascot art="otter-reading" size={110} zoom={2.5} float />
      </div>
    );
  }
  return <Otto />;
}

function Otto() {
  const [lens, setLensRaw] = useState('now');
  const [recovery, setRecovery] = useState(false);      // the overwhelmed page is showing
  const [handoff, setHandoff] = useState(null);         // a plan made elsewhere, shown on the calendar to compare and adjust before it is applied
  const [calView, setCalView] = useState('1w');
  const [sel, setSel] = useState(dayNum(new Date()));
  const [modal, setModal] = useState(null);
  const [taskSlot, setTaskSlot] = useState(null);
  const [pick, setPick] = useState(null);
  const [events, setEventsRaw] = useState(() => { const saved = readJSON(EVENTS_KEY, INITIAL_EVENTS); const fixed = migrateEvents(saved); if (fixed !== saved) writeJSON(EVENTS_KEY, fixed); return fixed; });      // old saves know only the date of the month
  const [note, setNote] = useState(null);
  const [chat, setChat] = useState(null);                // null | { prompt }
  const [statsKey, setStatsKey] = useState(0);
  const [late, setLate] = useState(null);                // oversleep: { info, busy, error }
  const [startAsk, setStartAsk] = useState(null);        // three late starts this week: offer a later planned start
  const [check, setCheck] = useState(null);              // the engine's read on this week
  const [busy, setBusy] = useState(false);
  const eventsRef = useRef(events);
  useEffect(() => { if (localStorage.getItem(EVENTS_KEY) == null) writeJSON(EVENTS_KEY, eventsRef.current); }, []);      // the first run's calendar is saved too

  // every change to the calendar is kept
  const setEvents = upd => setEventsRaw(prev => {
    const next = typeof upd === 'function' ? upd(prev) : upd;
    eventsRef.current = next;
    writeJSON(EVENTS_KEY, next);
    return next;
  });

  const say = text => { const id = Date.now(); setNote({ id, text }); setTimeout(() => setNote(n => (n && n.id === id ? null : n)), 4200); };
  function setLens(l) { setLensRaw(l); setRecovery(false); if (l !== 'calendar') setHandoff(null); }

  // the calendar always follows the real date: when midnight passes (or the tab wakes up on a new day) the week moves on
  const [today, setToday] = useState(() => isoDate(new Date()));
  useEffect(() => {
    const t = setInterval(() => setToday(old => { const n = isoDate(new Date()); return n === old ? old : n; }), 30000);
    const wake = () => setToday(isoDate(new Date()));
    document.addEventListener('visibilitychange', wake);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', wake); };
  }, []);
  // repeating events are laid out twelve weeks ahead, and topped up as days pass or a series changes
  useEffect(() => {
    const topUp = () => setEvents(prev => ensureHorizon(getSeries(), prev, dayNum(new Date())));
    topUp();
    return subscribeSeries(topUp);
  }, [today]);
  const planDays = useMemo(() => getDays(0, 7).map(dayNum), [today]);
  const openDays = useMemo(() => getDays(0, 14).map(dayNum), [today]);
  const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  // ---- oversleep: the first time the app is opened today, if the day has already started without the user ----
  const checkedLate = useRef(false);
  async function runLateCheck(force = false) {
    try {
      const info = await checkOversleep(eventsRef.current, openDays, nowMinutes());
      if (info.late) setLate({ info, busy: false, error: '' });
      else if (force) say('You are on time. Nothing to rescue.');
    } catch (e) { if (force) say(e.message); }
  }
  useEffect(() => {
    if (checkedLate.current) return;
    checkedLate.current = true;
    const today = isoDate(new Date());
    const firstOpenToday = readJSON(OPENED_KEY, null) !== today;
    writeJSON(OPENED_KEY, today);
    if (firstOpenToday) runLateCheck(false);
  }, []);

  // "Re-plan my day": the plan is made, then shown on the calendar next to the current one. Nothing changes until it is applied.
  async function planLate(info, { keepIds, choices }) {
    const nowMin = nowMinutes();
    setLate(l => (l ? { ...l, busy: true, error: '' } : l));
    try {
      const r = await applyOversleep({ events: eventsRef.current, weekDays: openDays, mode: 'reschedule', keepIds, choices, nowMin, dryRun: true });
      const dropped = Object.entries(r.outcomes || {}).filter(([, v]) => v === 'drop').map(([id]) => id);
      setLate(null);
      openHandoff({
        title: 'Re-plan after a late start',
        variants: [{ key: 'otto', label: 'Otto\u2019s plan', events: r.events, grinder: r.grinder, dropped, conflicts: r.conflicts, decisions: r.decisions, explanation: r.explanation, warnings: [], applyLabel: 'Use this plan' }],
        rebuild: () => planLate(info, { keepIds, choices }),
        onCancel: () => setLate({ info, busy: false, error: '' }),                      // back to the choices
        onApplied: async () => {
          const ls = await logLateStart({ firstStart: info.first_start, nowMin }).catch(() => null);      // only now does it count as a late start
          if (ls?.suggest_later_start && ls.suggested_start_min != null && !snoozed()) setStartAsk(ls);
        },
        doneText: r.explanation,
      });
    } catch (e) { setLate(l => (l ? { ...l, busy: false, error: e.message } : l)); }
  }

  async function resolveLate(mode, { keepIds, choices, protectTomorrow }) {
    if (mode === 'reschedule') return planLate(late.info, { keepIds, choices });
    setLate(l => ({ ...l, busy: true, error: '' }));
    try {
      const r = await applyOversleep({ events: eventsRef.current, weekDays: openDays, mode, keepIds, choices, protectTomorrow, nowMin: nowMinutes() });
      setEvents(r.events);
      if (r.grinder.length) parkInGrinder(r.grinder);
      setLate(null);
      say(r.explanation);
      const ls = r.late_starts;
      if (ls?.suggest_later_start && ls.suggested_start_min != null && !snoozed()) setStartAsk(ls);      // third late start this week
    } catch (e) { setLate(l => ({ ...l, busy: false, error: e.message })); }
  }

  // ---- plans made elsewhere open on the calendar: current beside new, drag to adjust, then apply ----
  function parkInGrinder(items) {
    writeJSON(GRINDER_KEY, [...items, ...readJSON(GRINDER_KEY, [])]);
    window.dispatchEvent(new Event('otto:grinder'));
  }
  function openHandoff(h) {
    const nextWeek = h.variants.some(v => v.events.some(e => e.day > planDays[6]));
    setCalView(nextWeek ? '2w' : '1w');
    setHandoff({ ...h, id: Date.now() });
    setLensRaw('calendar'); setRecovery(false);
  }
  async function closeHandoff(info) {
    const h = info.handoff || handoff;
    setHandoff(null);
    if (info.rebuild) { setTimeout(() => h?.rebuild?.(), 0); return; }
    if (!info.applied) { h?.onCancel?.(); return; }
    if (info.grinder?.length) parkInGrinder(info.grinder);
    if (h?.doneText) say(h.doneText);
    await h?.onApplied?.(info);
  }

  // ---- "I'm overwhelmed" ----
  function showOverwhelmPlan(plan, { restFirst, args }) {
    openHandoff({
      title: 'Making today doable',
      variants: variantsOf(plan, { restFirst }),
      rebuild: async () => { try { showOverwhelmPlan(await overwhelmPlan({ ...args, events: eventsRef.current }), { restFirst, args }); } catch (e) { say(e.message); } },
      onCancel: () => setRecovery(true),
      doneText: 'Plan applied. Anything parked is in the Meatball Grinder.',
    });
  }

  // ---- three late starts in a week: the planned start may be wrong ----
  const SNOOZE_KEY = 'otto.startAsk.v1';
  const snoozed = () => { const u = readJSON(SNOOZE_KEY, null); return !!u && u > isoDate(new Date()); };
  async function moveStart() {
    setBusy(true);
    try { await setSleepWindow(startAsk.suggested_start_min, startAsk.current_end_min); say(`Your day now starts at ${fmtTime(startAsk.suggested_start_min)}. Otto plans from there.`); setStartAsk(null); }
    catch (e) { say(e.message); } finally { setBusy(false); }
  }
  function keepStart() {                                    // "keep it": do not ask again for two weeks
    const d = new Date(); d.setDate(d.getDate() + 14); writeJSON(SNOOZE_KEY, isoDate(d)); setStartAsk(null);
  }

  // ---- feasibility: re-read the week whenever the calendar changes (debounced) ----
  useEffect(() => {
    const t = setTimeout(() => { weekCheck(events, planDays).then(setCheck).catch(() => setCheck(null)); }, 500);
    return () => clearTimeout(t);
  }, [events, planDays]);

  async function confirmTradeoff() {
    const side = check?.trade?.[pick === 'a' ? 'b' : 'a'];
    if (!side) return;
    setBusy(true);
    try {
      const r = await downscope(eventsRef.current, side.ids, 0.5);
      setEvents(r.events);
      say(`${side.title} is down to a lite version. The rest of your week has room again.`);
      setModal(null); setPick(null);
    } catch (e) { say(e.message); } finally { setBusy(false); }
  }

  // ---- "I'm overwhelmed": rank today, pick the hours, see the plan on the calendar ----
  const fellBehind = () => setRecovery(true);

  // ---- new tasks: the "+" form makes a task; it becomes a calendar block at the slot it was opened from ----
  async function addTask(task) {
    const block = {
      id: task.id, title: task.title.trim() || 'New task', day: taskSlot?.day ?? dayNum(new Date()), startMin: taskSlot?.startMin ?? 600,
      durationMin: Math.max(15, Number(task.duration_planned) || 60), category: task.category || 'admin', fixed: false,
      ...(task.non_negotiable ? { non_negotiable: true } : {}), ...(task.deadline_iso ? { deadline_iso: task.deadline_iso, hard_deadline: true } : {}),
    };
    setEvents(e => [...e, block]);
    setTaskSlot(null);
    const title = await enrichNew(block, setEvents);       // long, loosely worded ones are tidied by one batched call
    if (title) say(`Otto tidied up “${title}”.`);
  }

  // after the weekly chat changed how Otto plans: re-plan the flexible blocks of the next two weeks (only on the user's say-so)
  async function replanWeeks() {
    const before = eventsRef.current;
    const win = planWindow(isoDate(new Date()));
    const data = await scheduleEvents({ events: before, weekDays: win.days, weekStartIso: win.monday, mode: 'full' });
    const moved = data.moved?.length ?? 0;
    if (moved) setEvents(data.events);
    return { moved, undo: () => { setEvents(before); say('Taken back.'); } };
  }

  // the same re-plan, but shown on the calendar first (used by Priorities)
  async function previewReplan() {
    const win = planWindow(isoDate(new Date()));
    const data = await scheduleEvents({ events: eventsRef.current, weekDays: win.days, weekStartIso: win.monday, mode: 'full' });
    if (!(data.moved?.length)) { say('Nothing needs to move: your plan already follows this.'); return null; }
    openHandoff({ title: 'Plan with your priorities', variants: [{ key: 'new', label: 'With your priorities', events: data.events, grinder: [], dropped: [], conflicts: data.conflicts, decisions: data.decisions, explanation: data.explanation, warnings: [], applyLabel: 'Use this plan' }],
      rebuild: previewReplan, doneText: 'Plan applied.' });
    return null;
  }

  // "Find time" on a goal: the calendar opens in planning mode and suggests where the hours could go
  function planTime(n) {
    try { sessionStorage.setItem('otto.makeTime', JSON.stringify(n)); } catch { /* ignore */ }
    setCalView('2w');            // two weeks from this Monday, so every suggested slot is on screen
    setLens('calendar');
  }

  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden' }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', background: 'var(--app-bg)', display: 'flex' }}>
        <Sidebar lens={lens} setLens={setLens} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, transition: 'all .22s var(--ease)' }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {lens === 'now' && !recovery && (
              <Now
                events={events}
                setEvents={setEvents}
                onGo={setLens}
                check={check}
                onPlanTime={planTime}
                onFellBehind={fellBehind}
                onOverslept={() => runLateCheck(true)}
                onOpenFeasibility={() => setModal('feasibility')}
                onAddTask={() => setTaskSlot({ day: dayNum(new Date()), startMin: 600 })}
              />
            )}
            {lens === 'now' && recovery && (
              <Overwhelmed events={events} weekDays={openDays} nowMin={nowMinutes()} onPlan={showOverwhelmPlan} onClose={() => setRecovery(false)} />
            )}
            {lens === 'calendar' && (
              <Calendar calView={calView} setCalView={setCalView} sel={sel} setSel={setSel} events={events} setEvents={setEvents} handoff={handoff} onHandoffClose={closeHandoff} />
            )}
            {lens === 'goals' && <GoalsTracker />}
            {lens === 'priorities' && <Priorities events={events} setEvents={setEvents} today={dayNum(new Date())} onReplan={previewReplan} />}
            {lens === 'rules' && <Rules />}
            {lens === 'stats' && <Stats refreshKey={statsKey} onOpenChat={prompt => setChat({ prompt })} />}
          </div>
        </div>

        {taskSlot && <TaskCreateModal slot={taskSlot} onClose={() => setTaskSlot(null)} onSubmit={addTask} />}

        {modal === 'feasibility' && <Feasibility check={check} onChoose={() => setModal('tradeoff')} onClose={() => setModal(null)} />}
        {modal === 'tradeoff' && <Tradeoff trade={check?.trade} pick={pick} onPick={setPick} busy={busy} onConfirm={confirmTradeoff} onClose={() => { setModal(null); setPick(null); }} />}
        {late && <Oversleep info={late.info} busy={late.busy} error={late.error} onApply={resolveLate} onClose={() => setLate(null)} />}
        <LunchNudge />
        {startAsk && <LaterStart ask={startAsk} busy={busy} onMove={moveStart} onKeep={keepStart} onLater={() => setStartAsk(null)} />}
        {chat && <WeeklyChat prompt={chat.prompt} onClose={() => setChat(null)} onApplied={() => setStatsKey(k => k + 1)} onReplan={replanWeeks} />}

        {note && (
          <div role="status" style={{ position: 'absolute', left: '50%', bottom: 26, transform: 'translateX(-50%)', zIndex: 70, maxWidth: 'min(560px, 90%)', padding: '12px 20px', borderRadius: 6,
            background: 'var(--forest)', color: 'var(--forest-ink)', fontSize: 13.5, fontWeight: 500, boxShadow: 'none', animation: 'popIn .4s var(--spring) both' }}>{note.text}</div>
        )}
      </div>
    </div>
  );
}
