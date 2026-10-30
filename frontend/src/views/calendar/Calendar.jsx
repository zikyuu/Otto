import { useState } from 'react';
import WeekView  from './WeekView.jsx';
import MonthView from './MonthView.jsx';
import { getDays, weekRangeLabel, monthLabel } from './calendarUtils.js';
import { IconChevL, IconChevR, IconPlus } from './Icons.jsx';
import GCalButton from './GCalButton.jsx';

const VIEWS = [['month', 'Month'], ['2w', '2 weeks'], ['1w', 'Week']];

export default function Calendar({ calView, setCalView, sel, setSel, events, setEvents, handoff = null, onHandoffClose }) {
  const [offset, setOffset] = useState(0);   // weeks for the week views, months for month
  const [addTick, setAddTick] = useState(0);
  const [note, setNote] = useState('');
  const isMonth = calView === 'month';
  const numDays = calView === '2w' ? 14 : 7;
  const step = calView === '2w' ? 2 : 1;          // the two-week view pages two weeks at a time

  // the days a Google Calendar sync covers: the visible weeks, or the whole visible month
  const gcalDays = (() => {
    if (!isMonth) return getDays(offset, numDays);
    const t = new Date(), first = new Date(t.getFullYear(), t.getMonth() + offset, 1), n = new Date(t.getFullYear(), t.getMonth() + offset + 1, 0).getDate();
    return Array.from({ length: n }, (_, i) => new Date(first.getFullYear(), first.getMonth(), 1 + i));
  })();
  const range = isMonth ? monthLabel(offset) : weekRangeLabel(getDays(offset, numDays));
  const move = dir => setOffset(o => o + dir * (isMonth ? 1 : step));

  function switchView(v) {
    if (v === calView) return;
    setOffset(0);
    setCalView(v);
  }
  function addEvent() {
    if (isMonth) { setOffset(0); setCalView('1w'); }
    setAddTick(t => t + 1);
  }

  return (
    <div style={{ padding: '14px 28px 40px 14px', maxWidth: 1480, margin: '0 auto' }}>
      <div className="rise" style={{ '--i': 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', margin: '4px 0 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn--icon" onClick={() => move(-1)} aria-label="Previous"><IconChevL size={14} /></button>
          <div style={{ height: 34, display: 'inline-flex', alignItems: 'center', padding: '0 20px', borderRadius: 6, background: 'var(--forest)', color: 'var(--forest-ink)', fontSize: 13, fontWeight: 600, letterSpacing: '-.005em', boxShadow: 'none' }}>{range}</div>
          <button className="btn btn--icon" onClick={() => move(1)} aria-label="Next"><IconChevR size={14} /></button>
          <button className="btn" onClick={() => setOffset(0)} disabled={offset === 0}>Today</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="seg" role="group" aria-label="View">
            {VIEWS.map(([v, label]) => (
              <button key={v} aria-pressed={calView === v} onClick={() => switchView(v)}>{label}</button>
            ))}
          </div>
          <GCalButton days={gcalDays} setEvents={setEvents} onNote={setNote} />
          <button className="btn btn--primary" style={{ height: 38, padding: '0 8px 0 18px' }} onClick={addEvent}>Add event<span className="btn__icon" style={{ marginRight: 0, width: 26, height: 26 }}><IconPlus size={13} /></span></button>
        </div>
      </div>

      {note && <p role="status" onClick={() => setNote('')} style={{ margin: '-6px 4px 14px', fontSize: 12.5, color: 'var(--ink-3)', cursor: 'pointer' }}>{note}</p>}

      {!isMonth && (
        <WeekView key={calView} weekOffset={offset} numDays={numDays} sel={sel} setSel={setSel}
          events={events} setEvents={setEvents} addTick={addTick} handoff={handoff} onHandoffClose={onHandoffClose} />
      )}
      {isMonth && (
        <MonthView monthOffset={offset} sel={sel} setSel={setSel} events={events} setCalView={switchView} />
      )}
    </div>
  );
}
