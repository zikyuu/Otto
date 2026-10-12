import { CATEGORY_COLORS, DEFAULT_CAT_COLOR } from '../../data/fixtures.js';
import { fmtTime, DOW_NAMES } from './calendarUtils.js';
import { IconLock } from './Icons.jsx';

const cat = ev => CATEGORY_COLORS[ev.category] || DEFAULT_CAT_COLOR;

// Events carry only a date-of-month, so they belong to the month the app is open on. Other months are empty.
export default function MonthView({ monthOffset, sel, setSel, events, setCalView }) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;                         // Monday-first grid
  const isThisMonth = monthOffset === 0;
  const todayNum = isThisMonth ? now.getDate() : -1;
  const live = isThisMonth ? events : [];

  const byDay = {};
  live.forEach(ev => { (byDay[ev.day] ||= []).push(ev); });
  const picked = byDay[sel] ? sel : null;
  const list = [...(byDay[sel] || [])].sort((a, b) => a.startMin - b.startMin);
  const monthName = first.toLocaleString('en-GB', { month: 'long' });

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 460px', minWidth: 320, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: 18, boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 6 }}>
          {DOW_NAMES.map(d => <span key={d} className="label-caps" style={{ textAlign: 'center' }}>{d}</span>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(n => {
            const items = byDay[n] || [];
            const isSel = isThisMonth && n === sel;
            const isToday = n === todayNum;
            return (
              <button key={n} onClick={() => setSel(n)} aria-pressed={isSel} aria-label={`${n} ${monthName}, ${items.length} events`}
                style={{
                  aspectRatio: '1.15', borderRadius: 10, border: `1px solid ${isSel ? 'var(--ink)' : 'transparent'}`, cursor: 'pointer',
                  background: isSel ? 'var(--surface)' : items.length ? 'var(--surface-2)' : 'transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', padding: '7px 8px',
                }}>
                <span className="mono" style={{
                  fontSize: 12.5, fontWeight: 500, minWidth: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999,
                  background: isToday ? 'var(--ink)' : 'transparent', color: isToday ? '#fff' : 'var(--ink)',
                }}>{n}</span>
                {items.length > 0 && (
                  <span style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                    {items.slice(0, 4).map(ev => <i key={ev.id} style={{ width: 6, height: 6, borderRadius: 2, background: cat(ev).accent }} />)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: '1 1 260px', minWidth: 240, maxWidth: 380 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.01em', marginBottom: 12 }}>
          {isThisMonth ? `${sel} ${monthName}` : monthName}
        </div>
        {list.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>
            {isThisMonth ? 'Nothing scheduled this day.' : 'Events are shown for the current month only.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map(ev => {
              const c = cat(ev);
              return (
                <div key={ev.id} style={{ background: c.bg, boxShadow: `inset 3px 0 0 ${c.accent}`, borderRadius: 8, padding: '10px 12px 10px 15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: c.text, flex: 1 }}>{ev.title}</span>
                    {ev.fixed && <IconLock size={12} style={{ color: c.text, opacity: .7 }} />}
                  </div>
                  <div className="mono" style={{ fontSize: 11.5, color: c.text, opacity: .7, marginTop: 3 }}>
                    {fmtTime(ev.startMin)}–{fmtTime(ev.startMin + ev.durationMin)} · {c.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 16 }}>
          To move or link events, open the{' '}
          <button className="btn btn--ghost" style={{ height: 'auto', padding: 0, color: 'var(--accent)', textDecoration: 'underline' }} onClick={() => setCalView('1w')}>week view</button>.
        </p>
      </div>
    </div>
  );
}
