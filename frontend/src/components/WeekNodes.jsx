import { IconCheck } from '../views/calendar/Icons.jsx';

// The week as a row of round nodes joined by a line: done days get a tick, today is copper, the rest are hollow.
//   days  [{ label, state: 'done' | 'today' | 'todo', sub }]
export default function WeekNodes({ days }) {
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '4px 4px 0' }}>
      <div aria-hidden style={{ position: 'absolute', left: 22, right: 22, top: 20, borderTop: '2px solid var(--line)' }} />
      {days.map((d, i) => (
        <div key={i} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 40 }}>
          <span aria-label={`${d.label}: ${d.state}`} style={{
            width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', fontFamily: 'var(--display)', fontSize: 13, marginTop: 4,
            background: d.state === 'done' ? 'var(--dingley)' : d.state === 'today' ? 'var(--copper)' : 'var(--surface)',
            color: d.state === 'todo' ? 'var(--ink-3)' : '#fff', boxShadow: d.state === 'todo' ? 'inset 0 0 0 2px var(--line)' : '0 6px 10px -6px rgba(32,40,8,.6)',
          }}>{d.state === 'done' ? <IconCheck size={14} /> : d.label[0]}</span>
          <span className="label-caps" style={{ fontSize: 10, color: d.state === 'today' ? '#8C4A33' : undefined }}>{d.label}</span>
          {d.sub != null && <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{d.sub}</span>}
        </div>
      ))}
    </div>
  );
}
