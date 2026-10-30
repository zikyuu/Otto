import { useEffect, useMemo, useRef, useState } from 'react';
import Banner from '../components/Banner.jsx';
import { CATS, items, board, place, syncTemplates } from './priorityBoard.js';
import { getSeries, setSeriesList } from './calendar/seriesStore.js';
import { isoOfDay } from './calendar/calendarUtils.js';
import { IconRepeat, IconFlag } from './calendar/Icons.jsx';
import { fmtDur } from './calendar/calendarUtils.js';

// Priorities: sort work into three cards, then into tiers inside a card. Otto uses it as a second reason, besides deadlines, to put
// something first. Drag a card into a tier, or use the menu on it.

const TONE = { important: { bg: '#E4EAD3', edge: '#D3DBBB', ink: 'var(--accent-ink)' }, good: { bg: '#F6EFDC', edge: '#E7DCB9', ink: '#7A5A1E' }, whatever: { bg: '#EFE8DA', edge: '#E2D8C2', ink: 'var(--ink-3)' } };

function Chip({ it, onMove, onDrag }) {
  const when = new Date(isoOfDay(it.first) + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <div draggable onDragStart={e => { e.dataTransfer.setData('text/plain', it.key); e.dataTransfer.effectAllowed = 'move'; onDrag(true); }} onDragEnd={() => onDrag(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 12, background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--line)', cursor: 'grab', fontSize: 13, maxWidth: '100%' }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={it.title}>{it.title}</span>
      {it.count > 1 && <span title={it.repeats ? 'Repeats: ranked once for all of them' : 'Several of these: ranked once for all of them'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--ink-3)' }}>{it.repeats && <IconRepeat size={11} />}×{it.count}</span>}
      {it.count === 1 && it.repeats && <IconRepeat size={12} style={{ color: 'var(--ink-3)' }} aria-label="Repeats" />}
      {it.deadline && <span title={`Due ${it.deadline}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#A5543F' }}><IconFlag size={11} />{new Date(it.deadline + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }} title={`From ${when}`}>{fmtDur(it.minutes)}</span>
      <select aria-label={`Move ${it.title}`} value="" onChange={e => { if (e.target.value) onMove(it.key, ...e.target.value.split(':')); }} style={{ width: 22, border: 0, background: 'transparent', color: 'var(--ink-3)', cursor: 'pointer', fontSize: 12 }}>
        <option value="">⋯</option>
        {CATS.map(c => <option key={c.key} value={`${c.key}:new`}>{c.label}</option>)}
        <option value="none:new">Not sorted</option>
      </select>
    </div>
  );
}

function Zone({ label, quiet, shown = false, show = false, onDrop, children, tone }) {
  const [over, setOver] = useState(false);
  if (quiet && !shown && !show) return null;
  return (
    <div onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onDrop(e.dataTransfer.getData('text/plain')); }}
      style={{ borderRadius: 14, padding: quiet ? '6px 10px' : '8px 10px 10px', minHeight: quiet ? 0 : 46, border: `1.5px dashed ${over ? 'var(--accent)' : quiet ? 'transparent' : tone?.edge || 'var(--line)'}`, background: over ? 'rgba(106,120,77,.12)' : 'transparent', transition: 'all .25s var(--ease)' }}>
      {label && <p className="label-caps" style={{ margin: '0 0 6px', fontSize: 10, color: over ? 'var(--accent-ink)' : 'var(--ink-3)' }}>{label}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  );
}

// A new tier between two others. While something is being dragged it is only a thin strip between tiers; hold the dragged card over
// it for a moment and it opens into a proper drop zone. (Dropping straight onto the strip works too.)
function InsertGap({ show, label, onDrop }) {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  useEffect(() => { if (!show) { clearTimeout(timer.current); setOpen(false); } }, [show]);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!show) return null;
  const arm = () => { if (!timer.current) timer.current = setTimeout(() => setOpen(true), 350); };
  const disarm = () => { clearTimeout(timer.current); timer.current = null; setOpen(false); };
  return (
    <div onDragOver={e => { e.preventDefault(); arm(); }} onDragLeave={disarm}
      onDrop={e => { e.preventDefault(); disarm(); onDrop(e.dataTransfer.getData('text/plain')); }}
      style={{ height: open ? 40 : 12, margin: open ? '0' : '-2px 0', borderRadius: 12, display: 'flex', alignItems: 'center', padding: open ? '0 12px' : 0, overflow: 'hidden',
        border: open ? '1.5px dashed var(--accent)' : 'none', background: open ? 'rgba(106,120,77,.14)' : 'transparent', transition: 'height .2s var(--ease), background .2s var(--ease)' }}>
      {open ? <span className="label-caps" style={{ fontSize: 10, color: 'var(--accent-ink)' }}>{label}</span>
        : <span aria-hidden style={{ flex: 1, height: 2, borderRadius: 2, background: 'rgba(106,120,77,.35)' }} />}
    </div>
  );
}

export default function Priorities({ events, setEvents, today, onReplan }) {
  const list = useMemo(() => items(events, today), [events, today]);
  const b = useMemo(() => board(list), [list]);
  const byKey = useMemo(() => Object.fromEntries(list.map(i => [i.key, i])), [list]);
  const [replan, setReplan] = useState(null);
  const [touched, setTouched] = useState(false);
  const [dragging, setDragging] = useState(false);       // while something is being dragged, the places a new tier can go light up

  function move(key, cat, tier) {
    if (!byKey[key]) return;
    const c = cat === 'none' ? null : cat;
    const t = tier === 'new' || tier === 'top' || String(tier).startsWith('before:') ? tier : Number(tier);
    const next = place(events, key, c, t);
    setEvents(next);
    setSeriesList(syncTemplates(getSeries(), next));
    setTouched(true); setReplan(null);
  }

  return (
    <div style={{ padding: '14px 28px 48px 14px', maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Banner art="banner-goals" minHeight={120}>
        <p className="pill-tag" style={{ margin: 0 }}>What comes first</p>
        <h1 style={{ margin: '12px 0 0', fontSize: 34, lineHeight: 1.05 }}>Priorities</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14.5, color: 'var(--ink-2)', maxWidth: 520 }}>Drag what is coming up into a card. Inside a card, higher tiers matter more; things on the same tier have no order between them. Otto weighs this alongside deadlines.</p>
      </Banner>

      <section className="bezel rise" style={{ '--i': 1 }}>
        <div className="core" style={{ padding: '14px 18px 16px' }}>
          <Zone label={`Not sorted yet (${b.unsorted.length}). Otto treats these as in the middle.`} quiet shown onDrop={k => move(k, 'none', 'new')}>
            {b.unsorted.length === 0 ? <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-3)' }}>Everything coming up is sorted.</p>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{b.unsorted.map(i => <Chip key={i.key} it={i} onMove={move} onDrag={setDragging} />)}</div>}
          </Zone>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 14, alignItems: 'start' }}>
        {CATS.map((c, n) => {
          const tone = TONE[c.key], tiers = b[c.key];
          return (
            <section key={c.key} className="bezel rise" style={{ '--i': 2 + n }}>
              <div className="core" style={{ background: tone.bg }}>
                <header style={{ padding: '16px 18px 6px' }}>
                  <h2 style={{ margin: 0, fontSize: 18, color: tone.ink }}>{c.label}</h2>
                  <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--ink-3)' }}>{c.hint}</p>
                </header>
                <div style={{ padding: '6px 14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tiers.map((tier, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <InsertGap show={dragging} label={i === 0 ? 'New top tier here' : `New tier here, between ${i} and ${i + 1}`} onDrop={k => move(k, c.key, `before:${i + 1}`)} />
                      <Zone tone={tone} label={`Tier ${i + 1}${tier.length > 1 ? ', no order between these' : ''}`} onDrop={k => move(k, c.key, i + 1)}>
                        {tier.map(it => <Chip key={it.key} it={it} onMove={move} onDrag={setDragging} />)}
                      </Zone>
                    </div>
                  ))}
                  <Zone tone={tone} label={tiers.length ? 'New tier below' : 'Drop here'} onDrop={k => move(k, c.key, 'new')} />
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {touched && onReplan && (
        <section className="bezel rise" style={{ '--i': 1 }}>
          <div className="core" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, fontSize: 13.5, minWidth: 220 }}>Otto uses this the next time it plans. Want to see the plan with it now?</span>
            <button className="btn btn--primary" disabled={replan?.busy} onClick={async () => { setReplan({ busy: true }); try { setReplan(await onReplan() || null); } catch { setReplan(null); } }}>{replan?.busy ? 'Working…' : 'Show me the plan'}</button>
          </div>
        </section>
      )}
    </div>
  );
}
