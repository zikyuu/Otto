import { CATEGORY_COLORS, DEFAULT_CAT_COLOR } from '../../data/fixtures.js';
import { fmtTime, DOW_NAMES, dayNum, dateOfDay } from './calendarUtils.js';
import { IconLock } from './Icons.jsx';

const cat = ev => CATEGORY_COLORS[ev.category] || DEFAULT_CAT_COLOR;
const SHOW = 3;

// Any month, from real dates. The grid always shows whole weeks (Monday first); days of the neighbouring months are faded but
// still carry their events, because an event's day is a real date.
//   sel   the selected day number (see calendarUtils.dayNum)
export default function MonthView({ monthOffset, sel, setSel, events, setCalView }) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const lead = (first.getDay() + 6) % 7;                                   // Monday-first grid
  const start = dayNum(first) - lead;
  const total = Math.ceil((lead + last.getDate()) / 7) * 7;
  const cells = Array.from({ length: total }, (_, i) => start + i);
  const todayN = dayNum(now);
  const monthName = first.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  const byDay = {};
  events.forEach(ev => { (byDay[ev.day] ||= []).push(ev); });
  const inMonth = n => { const d = dateOfDay(n); return d.getMonth() === first.getMonth() && d.getFullYear() === first.getFullYear(); };
  const picked = inMonth(sel) ? sel : null;
  const list = [...(byDay[picked ?? -1] || [])].sort((a, b) => a.startMin - b.startMin);
  const pickedDate = picked != null ? dateOfDay(picked) : null;

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div className="bezel" style={{ flex: '3 1 640px', minWidth: 320 }}>
        <div className="core" style={{ padding: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 6, marginBottom: 8 }}>
            {DOW_NAMES.map(d => <span key={d} className="label-caps" style={{ textAlign: 'center' }}>{d}</span>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 6 }}>
            {cells.map(n => {
              const d = dateOfDay(n), mine = inMonth(n);
              const items = [...(byDay[n] || [])].sort((a, b) => a.startMin - b.startMin);
              const isSel = n === sel, isToday = n === todayN, past = n < todayN;
              const shown = items.slice(0, SHOW), more = items.length - shown.length;
              return (
                <button key={n} onClick={() => setSel(n)} aria-pressed={isSel} aria-label={`${d.getDate()} ${d.toLocaleString('en-GB', { month: 'long' })}, ${items.length} events`}
                  style={{
                    minHeight: 118, borderRadius: 14, border: 0, cursor: 'pointer', textAlign: 'left', padding: 8, color: 'inherit', fontFamily: 'inherit',
                    background: isSel ? '#FFFDF6' : items.length ? 'var(--surface-2)' : 'rgba(106,120,77,.05)',
                    boxShadow: isSel ? 'inset 0 0 0 2px var(--forest), 0 10px 18px -14px rgba(32,40,8,.5)' : 'inset 0 0 0 1px var(--line-soft)',
                    display: 'flex', flexDirection: 'column', gap: 4, opacity: !mine ? .55 : past ? .65 : 1, transition: 'box-shadow .3s var(--ease), background .3s var(--ease)',
                  }}>
                  <span className="display" style={{
                    fontSize: 13, minWidth: 24, height: 24, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, padding: '0 6px', gap: 4,
                    background: isToday ? 'var(--copper)' : 'transparent', color: isToday ? '#fff' : mine ? 'var(--ink)' : 'var(--ink-3)',
                  }}>{d.getDate()}{d.getDate() === 1 && <span style={{ fontSize: 10.5, fontWeight: 400 }}>{d.toLocaleString('en-GB', { month: 'short' })}</span>}</span>
                  {shown.map(ev => {
                    const col = cat(ev);
                    return (
                      <span key={ev.id} title={`${fmtTime(ev.startMin)} ${ev.title}`} style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, borderRadius: 6, padding: '2px 6px 2px 7px', background: col.bg, boxShadow: `inset 3px 0 0 ${col.accent}`, color: col.text, fontSize: 11.5, lineHeight: 1.35, opacity: ev.done || ev.reflection?.choice ? .55 : 1 }}>
                        <span className="mono" style={{ opacity: .7, fontSize: 10.5, flexShrink: 0 }}>{fmtTime(ev.startMin)}</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: ev.done ? 'line-through' : 'none' }}>{ev.title.replace(/ \(\d+\/\d+\)$/, '')}</span>
                        {ev.fixed && <IconLock size={9} style={{ marginLeft: 'auto', flexShrink: 0, opacity: .7 }} />}
                      </span>
                    );
                  })}
                  {more > 0 && <span style={{ fontSize: 11.5, color: 'var(--ink-3)', paddingLeft: 4 }}>+{more} more</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ flex: '1 1 260px', minWidth: 240, maxWidth: 380, position: 'sticky', top: 12 }}>
        <h2 style={{ fontSize: 19, margin: '0 0 12px' }}>
          {pickedDate ? pickedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : monthName}
        </h2>
        {list.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>{pickedDate ? 'Nothing scheduled this day.' : 'Pick a day to see what is on it.'}</p>
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
