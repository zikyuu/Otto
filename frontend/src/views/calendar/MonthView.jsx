import { BUSY_DAYS, CATEGORY_COLORS, DEFAULT_CAT_COLOR } from '../../data/fixtures.js';
import { fmtTime } from './calendarUtils.js';

function cat(ev) { return CATEGORY_COLORS[ev.category] || DEFAULT_CAT_COLOR; }

function cellStyleFn(n, sel) {
  if (n === sel) return { background: '#A8703E', color: '#fff' };
  if ([23, 24, 25, 26, 28].includes(n)) return { background: '#F5EEE1', color: '#4A3526' };
  return { background: 'transparent', color: '#4A3526' };
}

function MonthGrid({ sel, setSel, events }) {
  const busy = {};
  events.forEach(ev => { busy[ev.day] = (busy[ev.day] || 0) + 1; });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
      {Array.from({ length: 30 }, (_, i) => i + 1).map(n => {
        const count = busy[n] || BUSY_DAYS[n] || 0;
        return (
          <div key={n} onClick={() => setSel(n)} style={{
            cursor: 'pointer', aspectRatio: '1', borderRadius: 12,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Quicksand'", fontWeight: 600, fontSize: 15, transition: 'background .15s ease',
            ...cellStyleFn(n, sel),
          }}>
            <span>{n}</span>
            {count > 0 && (
              <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                  <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', display: 'inline-block', background: n === sel ? 'rgba(255,255,255,.7)' : '#A8703E' }} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Day-of-week label for the selected day — used in the detail sidebar
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOW_LABELS = { 22: 'Mon', 23: 'Tue', 24: 'Wed', 25: 'Thu', 26: 'Fri', 27: 'Sat', 28: 'Sun' };

export default function MonthView({ sel, setSel, events, setCalView }) {
  const byDay = {};
  events.forEach(ev => { if (!byDay[ev.day]) byDay[ev.day] = []; byDay[ev.day].push(ev); });
  const selLabel = DOW_LABELS[sel] || '';

  return (
    <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 380px', minWidth: 320, background: '#fff', border: '1px solid #ECE3D4', borderRadius: 22, padding: 20, boxShadow: '0 12px 30px -22px rgba(74,54,38,.5)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, fontWeight: 700, fontSize: 11, color: '#B6A48C', textAlign: 'center', marginBottom: 8 }}>
          {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map(d => <span key={d}>{d}</span>)}
        </div>
        <MonthGrid sel={sel} setSel={setSel} events={events} />
      </div>

      <div style={{ flex: '1 1 220px', minWidth: 200 }}>
        <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 18, color: '#4A3526', marginBottom: 12 }}>
          {selLabel && `${selLabel}, `}{sel} June
        </div>
        {(byDay[sel] || []).length === 0
          ? <div style={{ fontSize: 13, color: '#AD9B84', fontStyle: 'italic' }}>Nothing scheduled.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[...(byDay[sel] || [])].sort((a, b) => a.startMin - b.startMin).map(ev => {
                const c = cat(ev);
                return (
                  <div key={ev.id} style={{
                    background: '#fff', border: `1px solid ${c.accent}44`,
                    borderLeft: `5px solid ${c.accent}`, borderRadius: 14, padding: '12px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 14, color: '#4A3526', flex: 1 }}>{ev.title}</span>
                      {ev.fixed && <span style={{ fontSize: 14 }}>🔒</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: c.text, background: c.bg, borderRadius: 5, padding: '2px 6px' }}>{c.label}</span>
                      <span style={{ fontSize: 12, color: '#AD9B84' }}>{fmtTime(ev.startMin)} – {fmtTime(ev.startMin + ev.durationMin)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
        <div style={{ fontStyle: 'italic', fontSize: 11, color: '#AD9B84', marginTop: 14, textAlign: 'center' }}>
          Switch to <span onClick={() => setCalView('1w')} style={{ cursor: 'pointer', color: '#A8703E', fontWeight: 700, fontStyle: 'normal' }}>week view</span> to drag events.
        </div>
      </div>
    </div>
  );
}
