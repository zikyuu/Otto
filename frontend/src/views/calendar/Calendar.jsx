import { useState } from 'react';
import WeekView  from './WeekView.jsx';
import MonthView from './MonthView.jsx';
import { getWeekDates, weekRangeLabel } from './calendarUtils.js';

const SEG        = ['month', '1w'];
const SEG_LABELS = { month: 'Month', '1w': '1 week' };

export default function Calendar({ calView, setCalView, sel, setSel, events, setEvents }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const weekDates = getWeekDates(weekOffset);
  const headerLabel = calView === '1w' ? weekRangeLabel(weekDates) : 'June 2026';

  return (
    <div style={{ padding: '28px 36px 40px', animation: 'fadeIn .45s ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 28, color: '#4A3526' }}>
          {headerLabel}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Week navigation — only shown in week view */}
          {calView === '1w' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => setWeekOffset(o => o - 1)} style={navBtnStyle}>‹</button>
              {weekOffset !== 0 && (
                <button onClick={() => setWeekOffset(0)} style={{ ...navBtnStyle, fontSize: 11, padding: '6px 10px' }}>Today</button>
              )}
              <button onClick={() => setWeekOffset(o => o + 1)} style={navBtnStyle}>›</button>
            </div>
          )}
          {/* View toggle */}
          <div style={{ display: 'flex', background: '#F1E8D7', borderRadius: 999, padding: 4, fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 13 }}>
            {SEG.map(v => (
              <span key={v} onClick={() => setCalView(v)} style={{
                cursor: 'pointer', padding: '7px 14px', borderRadius: 999, transition: 'all .2s ease',
                ...(calView === v
                  ? { background: '#fff', color: '#A8703E', boxShadow: '0 4px 10px -6px rgba(150,108,64,.5)' }
                  : { color: '#AD9B84' }),
              }}>{SEG_LABELS[v]}</span>
            ))}
          </div>
        </div>
      </div>

      {calView === '1w' && (
        <WeekView
          weekOffset={weekOffset}
          sel={sel}
          setSel={setSel}
          events={events}
          setEvents={setEvents}
        />
      )}

      {calView === 'month' && (
        <MonthView
          sel={sel}
          setSel={setSel}
          events={events}
          setCalView={setCalView}
        />
      )}
    </div>
  );
}

const navBtnStyle = {
  padding: '6px 12px', borderRadius: 999,
  border: '1.5px solid #ECE3D4',
  background: '#fff', color: '#8A5A2E',
  fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 15,
  cursor: 'pointer',
  boxShadow: '0 2px 8px -4px rgba(74,54,38,.2)',
};
