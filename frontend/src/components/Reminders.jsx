import { useState } from 'react';
import { add, toggle, remove, setDue, sorted, dueLabel, urgency } from '../reminders.js';
import { fileCapture } from '../home/capture.js';
import { isStale } from '../views/calendar/grinderAge.js';
import { fmtDur } from '../views/calendar/calendarUtils.js';
import { IconCheck, IconClose, IconPlus, IconSteps } from '../views/calendar/Icons.jsx';

const TONE = { overdue: ['#F3DDD2', '#8C4A33'], soon: ['#F3E6C8', '#8A6A2F'], later: ['#E4EAD3', '#4E5C36'], open: ['rgba(106,120,77,.12)', 'var(--ink-3)'] };

// "Remind me": one box. Type it the way you would say it ("pay rent by friday", "renew passport 30 oct every month",
// "read the paper 45 min"); Otto reads the date, the repeat and the length and files it as a checklist item.
// Ticking never removes anything: a finished item stays, struck through, until you press the cross.
// A repeating item moves to its next date when ticked. The pill at the bottom opens the Meatball Grinder.
export default function Reminders({ list, setList, today, grinder = [], onReviewGrinder }) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null);       // the reminder whose deadline is being changed
  const [due, setDueDraft] = useState('');       // optional deadline picked by hand; it wins over a date found in the words
  const all = sorted(list, today);
  const stale = grinder.filter(g => isStale(g)).length;
  const parsed = text.trim() ? fileCapture(text, today) : null;
  const read = parsed && (due ? { ...parsed, due } : parsed);

  function submit(e) {
    e.preventDefault();
    if (!read) return;
    setList(add(list, read));
    setText(''); setDueDraft('');
  }
  const understood = read && [
    read.due && dueLabel({ due: read.due }, today).replace('Due ', 'due ').replace('Whenever', 'whenever'),
    read.repeat && `repeats ${read.repeat}`,
    read.minutes && fmtDur(read.minutes),
  ].filter(Boolean).join(' · ');

  return (
    <section className="bezel rise" style={{ '--i': 5 }} aria-label="Remind me">
      <div className="core">
        <header style={{ padding: '16px 20px 6px' }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Remind me</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--ink-3)' }}>No slot on the calendar, but it has to happen.</p>
        </header>
        <div style={{ padding: '6px 20px 18px' }}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input value={text} onChange={e => setText(e.target.value)} placeholder="pay rent by friday" aria-label="What to remember"
              style={{ height: 36, padding: '0 14px', borderRadius: 999, border: 0, fontFamily: 'inherit', fontSize: 14, color: 'var(--ink)', background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 6px 0 14px', borderRadius: 999, background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--line)', fontSize: 12.5, color: 'var(--ink-3)' }}>
                Deadline
                <input type="date" value={due} min={today} onChange={e => setDueDraft(e.target.value)} aria-label="Deadline (optional)"
                  style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', fontFamily: 'inherit', fontSize: 13, color: due ? 'var(--ink)' : 'var(--ink-3)', outline: 'none' }} />
                {due && <button type="button" className="btn btn--ghost btn--icon" aria-label="Clear the deadline" style={{ width: 24, height: 24 }} onClick={() => setDueDraft('')}><IconClose size={10} /></button>}
              </label>
              <button className="btn btn--primary" type="submit" disabled={!read} style={{ height: 34, padding: '0 14px 0 16px' }}>Add<span className="btn__icon" style={{ width: 20, height: 20, marginRight: 0 }}><IconPlus size={11} /></span></button>
            </div>
          </form>
          <p style={{ margin: '6px 4px 8px', minHeight: 18, fontSize: 12, color: 'var(--ink-3)' }}>
            {read ? <>Will remind you: <strong style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{read.text}</strong>{understood ? `, ${understood}` : ''}</> : 'Say it as you would: a deadline in the words ("by friday", "every month") or pick one above.'}
          </p>

          {all.length === 0 && <p style={{ margin: '4px 0 10px', fontSize: 13.5, color: 'var(--ink-3)' }}>Nothing to remember. Add rent, a renewal, a gift.</p>}
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {all.map(r => {
              const [bg, fg] = TONE[r.done ? 'open' : urgency(r, today)];
              return (
                <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--line-soft)' }}>
                  <button role="checkbox" aria-checked={r.done} aria-label={r.text} onClick={() => setList(toggle(list, r.id))} style={{
                    width: 22, height: 22, borderRadius: 8, border: 0, cursor: 'pointer', flexShrink: 0, display: 'grid', placeItems: 'center', color: '#fff',
                    background: r.done ? 'var(--dingley)' : 'transparent', boxShadow: `inset 0 0 0 2px ${r.done ? 'var(--dingley)' : 'var(--ink-4)'}`,
                  }}>{r.done && <IconCheck size={13} />}</button>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, color: r.done ? 'var(--ink-4)' : 'var(--ink)', textDecoration: r.done ? 'line-through' : 'none' }}>
                    {r.text}
                    {r.repeat && <span style={{ marginLeft: 6, fontSize: 11.5, color: 'var(--ink-3)' }}>{r.repeat}</span>}
                    {r.minutes && <span style={{ marginLeft: 6, fontSize: 11.5, color: 'var(--ink-3)' }}>{fmtDur(r.minutes)}</span>}
                  </span>
                  {!r.done && (editing === r.id ? (
                    <input type="date" autoFocus defaultValue={r.due || ''} aria-label={`Deadline for ${r.text}`}
                      onChange={e => { setList(setDue(list, r.id, e.target.value)); if (e.target.value) setEditing(null); }}
                      onBlur={() => setEditing(null)} onKeyDown={e => { if (e.key === 'Escape') setEditing(null); }}
                      style={{ width: 138, height: 28, padding: '0 8px', borderRadius: 999, border: 0, fontFamily: 'inherit', fontSize: 12.5, background: 'var(--surface-2)', boxShadow: 'inset 0 0 0 1px var(--accent)', outline: 'none' }} />
                  ) : (
                    <button onClick={() => setEditing(r.id)} title="Change the deadline" aria-label={`Change the deadline of ${r.text}`} className="pill-tag"
                      style={{ background: bg, color: fg, textTransform: 'none', letterSpacing: 0, fontSize: 12, border: 0, cursor: 'pointer' }}>{r.due ? dueLabel(r, today) : 'Add a date'}</button>
                  ))}
                  <button className="btn btn--ghost btn--icon" aria-label={`Delete ${r.text}`} style={{ width: 26, height: 26 }} onClick={() => setList(remove(list, r.id))}><IconClose size={11} /></button>
                </li>
              );
            })}
          </ul>

          <button onClick={onReviewGrinder} className="btn" style={{ marginTop: 12, width: '100%', justifyContent: 'center', background: stale ? '#F3E6C8' : undefined, color: stale ? '#8A6A2F' : undefined }}>
            <IconSteps size={13} />Review Meatball Grinder
            <span className="mono" style={{ fontSize: 11.5, background: stale ? '#8A6A2F' : 'var(--forest)', color: '#fff', borderRadius: 999, padding: '1px 8px' }}>{grinder.length}</span>
            {stale > 0 && <span style={{ fontSize: 12 }}>{stale} stale</span>}
          </button>
        </div>
      </div>
    </section>
  );
}
