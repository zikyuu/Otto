import { useEffect, useMemo, useState } from 'react';
import Banner from '../components/Banner.jsx';
import Mascot from '../components/Mascot.jsx';
import EnergyTap from '../components/EnergyTap.jsx';
import Reminders from '../components/Reminders.jsx';
import { TodayLine, DayList, RadarCard, WrapUpCard, GoalsAttentionCard } from '../components/HomeCards.jsx';
import { buildRadar } from '../home/radar.js';
import { goalsNeedingAttention } from '../home/goalAttention.js';
import { wrapUp } from '../home/wrapUp.js';
import { todaySummary, currentTask, toggleItem, todaysBlocks, isDone } from '../home/today.js';
import { sendCompletion } from '../api.js';
import { demoGoals } from '../data/goalsData.js';
import { isoDate, dayNum } from './calendar/calendarUtils.js';
import { freeMinutesLeft } from './calendar/dayStats.js';
import { IconArrow, IconPlus, IconClock } from './calendar/Icons.jsx';

const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private window */ } };

export default function Now({ events = [], setEvents, onGo, check, onFellBehind, onOverslept, onOpenFeasibility, onAddTask, onPlanTime }) {
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const [reminders, setRemindersRaw] = useState(() => read('otto.reminders.v1', []));
  const setReminders = v => { setRemindersRaw(v); write('otto.reminders.v1', v); };
  const [grinder, setGrinderRaw] = useState(() => read('otto.grinder.v1', []));
  useEffect(() => {          // the grinder is also changed by the calendar and the late-start flow
    const reload = () => setGrinderRaw(read('otto.grinder.v1', []));
    window.addEventListener('otto:grinder', reload);
    return () => window.removeEventListener('otto:grinder', reload);
  }, []);

  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes(), day = dayNum(now);
  const todayIso = isoDate(now);
  const tomorrow = day + 1;
  const goals = useMemo(() => read('otto.goals.v1', null) || demoGoals(todayIso), [todayIso]);

  const radar = buildRadar({ events, goals, reminders, today: todayIso });
  const items = todaysBlocks(events, day);
  const tasks = items.filter(e => !e.fixed).map(e => ({ k: e.id, t: e.title, checked: isDone(e) }));      // for the wrap-up counts
  const summary = todaySummary({ events, radar, day, nowMin });
  const cur = currentTask({ events, day, nowMin });
  const attention = goalsNeedingAttention({ goals, events, today: todayIso });
  const wrap = wrapUp({ events, tasks, today: day, tomorrow, nowMin });
  const free = freeMinutesLeft(events, day, nowMin);
  const reviewGrinder = () => { try { sessionStorage.setItem('otto.openGrinder', '1'); } catch { /* ignore */ } onGo('calendar'); };

  return (
    <div style={{ padding: '14px 28px 48px 14px', maxWidth: 1180, margin: '0 auto' }}>
      <Banner art="banner-now" minHeight={210}>
        <p className="pill-tag" style={{ margin: 0 }}>{date}</p>
        <h1 style={{ margin: '12px 0 0', fontSize: 42, lineHeight: 1 }}>Welcome back, Yuki</h1>
        <p style={{ margin: '10px 0 0', fontSize: 15, color: 'var(--ink-2)', maxWidth: 420 }}>Lock in now. It is not too late to reverse unemployment.</p>
        <TodayLine s={summary} freeMin={free} />
        <Mascot art="otter-eating" size={170} zoom={2.4} float style={{ position: 'absolute', right: 36, bottom: -6 }} />
      </Banner>

      {check?.overcommitted && (
        <button onClick={onOpenFeasibility} className="rise" style={{
          '--i': 2, width: '100%', marginTop: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
          background: '#F3E6C8', border: 0, borderRadius: 22, padding: '14px 20px', boxShadow: '0 0 0 1px #E6D3A6',
        }}>
          <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#E6D3A6', color: '#8A6A2F', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><IconClock size={16} /></span>
          <span style={{ flex: 1, fontSize: 14, color: '#8A6A2F' }}><strong className="display" style={{ fontWeight: 600 }}>This week is a little full at your pace.</strong> Tap to see what to protect.</span>
          <IconArrow size={15} style={{ color: '#8A6A2F' }} />
        </button>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(300px,1fr)', gap: 16, marginTop: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {wrap.show && <WrapUpCard w={wrap} setEvents={setEvents} />}
          <DayList items={items} curId={cur?.event.id} curState={cur?.state} nowMin={nowMin}
            onToggleDone={(id, ev) => {
              setEvents(prev => prev.map(e => (e.id === id ? { ...e, done: !e.done } : e)));
              if (!isDone(ev) && !ev.fixed) sendCompletion({ taskId: id, done: true, plannedMinutes: ev.durationMin }).catch(() => {});      // feeds the completion rate
            }}
            onTickItem={(evId, item) => setEvents(prev => toggleItem(prev, evId, item))}
            actions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn--icon" onClick={onAddTask} aria-label="Add a task"><IconPlus size={14} /></button>
                <button className="btn btn--ghost" onClick={onOverslept} title="You started the day late: Otto re-plans what is left of today around the time you have now">I started late</button>
                <button className="btn" onClick={onFellBehind} title="You are overwhelmed or behind on the week: Otto picks one thing to start and one thing to shrink">I'm overwhelmed<IconArrow size={13} /></button>
              </div>} />

          <GoalsAttentionCard items={attention} goalCount={goals.length} onPlan={onPlanTime} onOpenGoals={() => onGo('goals')} />
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Reminders list={reminders} setList={setReminders} today={todayIso} grinder={grinder} onReviewGrinder={reviewGrinder} />
          <RadarCard rows={radar} />
        </aside>
      </div>
      <EnergyTap events={events} style={{ position: 'fixed', right: 28, bottom: 24, zIndex: 30 }} />
    </div>
  );
}
