import { useState } from 'react';
import WeekView  from './WeekView.jsx';
import MonthView from './MonthView.jsx';
import { getDays, weekRangeLabel, monthLabel } from './calendarUtils.js';
import { IconChevL, IconChevR, IconPlus } from './Icons.jsx';
import { DEMO_WEEK_OFFSET } from '../../data/fixtures.js';
import Mascot from '../../components/Mascot.jsx';
import Banner from '../../components/Banner.jsx';

const VIEWS = [['month', 'Month'], ['2w', '2 weeks'], ['1w', 'Week']];

export default function Calendar({ calView, setCalView, sel, setSel, events, setEvents }) {
  const [offset, setOffset] = useState(calView === 'month' ? 0 : DEMO_WEEK_OFFSET);   // weeks for the week views, months for month
  const [addTick, setAddTick] = useState(0);
  const isMonth = calView === 'month';
  const numDays = calView === '2w' ? 14 : 7;
  const step = calView === '2w' ? 2 : 1;          // the two-week view pages two weeks at a time

  const range = isMonth ? monthLabel(offset) : weekRangeLabel(getDays(offset, numDays));
  const move = dir => setOffset(o => o + dir * (isMonth ? 1 : step));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  function switchView(v) {
    if (v === calView) return;
    setOffset(v === 'month' ? 0 : DEMO_WEEK_OFFSET === 0 || offset !== 0 ? 0 : DEMO_WEEK_OFFSET);
    setCalView(v);
  }
  function addEvent() {
    if (isMonth) { setOffset(0); setCalView('1w'); }
    setAddTick(t => t + 1);
  }

  return (
    <div style={{ padding: '14px 28px 40px 14px', maxWidth: 1480, margin: '0 auto' }}>
      <Banner art="banner-calendar">
        <p className="pill-tag" style={{ margin: 0 }}>{isMonth ? 'This month' : numDays === 14 ? 'Next two weeks' : 'This week'}</p>
        <h1 style={{ margin: '12px 0 0', fontSize: 32, fontWeight: 600, letterSpacing: '-.035em', lineHeight: 1.05 }}>{greeting}, Yuki</h1>
        <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink-2)', maxWidth: 380, lineHeight: 1.5 }}>Laid out around how you actually work.</p>
        <Mascot art="otter-waving" size={124} zoom={2.5} float style={{ position: 'absolute', right: 40, bottom: 2 }} />
      </Banner>

      <div className="rise" style={{ '--i': 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', margin: '22px 0 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn--icon" onClick={() => move(-1)} aria-label="Previous"><IconChevL size={14} /></button>
          <div style={{ height: 34, display: 'inline-flex', alignItems: 'center', padding: '0 20px', borderRadius: 999, background: 'var(--forest)', color: 'var(--forest-ink)', fontSize: 13, fontWeight: 600, letterSpacing: '-.005em', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.14), 0 10px 18px -10px rgba(30,45,34,.7)' }}>{range}</div>
          <button className="btn btn--icon" onClick={() => move(1)} aria-label="Next"><IconChevR size={14} /></button>
          <button className="btn" onClick={() => setOffset(0)} disabled={offset === 0}>Today</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="seg" role="group" aria-label="View">
            {VIEWS.map(([v, label]) => (
              <button key={v} aria-pressed={calView === v} onClick={() => switchView(v)}>{label}</button>
            ))}
          </div>
          <button className="btn btn--primary" style={{ height: 38, padding: '0 8px 0 18px' }} onClick={addEvent}>Add event<span className="btn__icon" style={{ marginRight: 0, width: 26, height: 26 }}><IconPlus size={13} /></span></button>
        </div>
      </div>

      {!isMonth && (
        <WeekView key={calView} weekOffset={offset} numDays={numDays} sel={sel} setSel={setSel}
          events={events} setEvents={setEvents} addTick={addTick} />
      )}
      {isMonth && (
        <MonthView monthOffset={offset} sel={sel} setSel={setSel} events={events} setCalView={switchView} />
      )}
    </div>
  );
}
