import { useState } from 'react';
import { CATEGORY_COLORS, DEFAULT_CAT_COLOR } from '../../data/fixtures.js';
import { PX_PER_MIN, DAY_START, fmtTime, fmtDur } from './calendarUtils.js';
import DeleteButton from '../../components/DeleteButton.jsx';
import { IconLock, IconUnlock, IconLink, IconCheck, categoryIcon } from './Icons.jsx';

export const catOf = ev => CATEGORY_COLORS[ev.category] || DEFAULT_CAT_COLOR;

function hasDetails(ev) {
  return !!(ev.description || ev.subtasks?.length || ev.deadline_iso || ev.best_done_by_iso);
}

// Read-only summary shown beside an event on hover. Opens sideways (not above) because the
// grid's scroll area clips anything that pokes out over the date header.
function EventDetailsCard({ ev, accent, side }) {
  const sum = (ev.subtasks || []).reduce((a, s) => a + s.minutes, 0);
  return (
    <div style={{
      position: 'absolute', top: 0, zIndex: 60, width: 232, pointerEvents: 'none',
      ...(side === 'right' ? { left: 'calc(100% + 12px)' } : { right: 'calc(100% + 12px)' }),
      background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12,
      padding: '12px 14px', boxShadow: 'var(--shadow-md)',
      animation: 'fadeIn .12s var(--ease)', whiteSpace: 'normal', cursor: 'default',
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>{ev.title}</div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 3 }}>
        {fmtTime(ev.startMin)}–{fmtTime(ev.startMin + ev.durationMin)} · {fmtDur(ev.durationMin)}
      </div>
      {ev.description && <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 8, lineHeight: 1.45 }}>{ev.description}</div>}
      {ev.subtasks?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="label-caps" style={{ marginBottom: 4 }}>{ev.order_specific ? 'Subtasks, in order' : 'Subtasks'}</div>
          {ev.subtasks.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--ink)', marginBottom: 3 }}>
              <span className="mono" style={{ color: accent, width: 16, flexShrink: 0 }}>{s.order != null ? `${s.order}.` : '·'}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{s.name}</span>
              <span className="mono" style={{ color: 'var(--ink-3)', flexShrink: 0 }}>{fmtDur(s.minutes)}</span>
            </div>
          ))}
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', textAlign: 'right', marginTop: 4 }}>
            {fmtDur(sum)} of {fmtDur(ev.durationMin)}
          </div>
        </div>
      )}
      {(ev.deadline_iso || ev.best_done_by_iso) && (
        <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          {ev.deadline_iso && (
            <div>
              <strong style={{ fontWeight: 600, color: ev.hard_deadline === false ? 'var(--ink-3)' : 'var(--danger)' }}>
                {ev.hard_deadline === false ? 'Soft deadline' : 'Hard deadline'}
              </strong> <span className="mono">{ev.deadline_iso.slice(0, 10)}</span>
            </div>
          )}
          {ev.best_done_by_iso && <div><strong style={{ fontWeight: 600 }}>Best done by</strong> <span className="mono">{ev.best_done_by_iso.slice(0, 10)}</span></div>}
        </div>
      )}
      {ev.non_negotiable && <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600, color: accent }}>Must-do</div>}
    </div>
  );
}

// `flip` = { dx, dy, delay }: the chip travels in from where it used to be (staggered).
export default function EventChip({
  ev, label, past, draggingThis, noTopTransition, isConflict, popSide, compact, dim, ringed, selected, flip, thinking = 0, interactive = true,
  onPointerDown, onResizeStart, onDelete, onToggleLock, onLinkStart, onSelect, linked,
}) {
  const [hovered, setHovered]       = useState(false);
  const [confirming, setConfirming] = useState(false);
  const c        = catOf(ev);
  const height   = Math.max(ev.durationMin * PX_PER_MIN - 2, 18);
  const tall     = !compact && height >= 62;      // room for the icon medallion above the title
  const Glyph    = categoryIcon(ev.category);
  const settling = !draggingThis && !noTopTransition && !flip;
  const showNodes = interactive && hovered && !draggingThis && !confirming;

  return (
    <div
      onPointerDown={e => { if (!interactive) return; e.stopPropagation(); if (!confirming) onPointerDown(e); }}
      onClick={() => { if (interactive) onSelect?.(ev.id); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        top: (ev.startMin - DAY_START) * PX_PER_MIN, left: 3, right: 3, height,
        background: isConflict ? '#F7E2DA' : c.bg,
        border: `${ev.fixed && !isConflict ? 1.5 : 1}px solid ${isConflict ? 'var(--danger)' : c.accent + (ev.fixed ? 'AA' : '33')}`,
        boxShadow: ringed ? `0 0 0 2px ${c.accent}` : selected ? `0 0 0 2px ${c.accent}AA` : 'var(--shadow-sm)',
        borderRadius: compact ? 10 : 14, padding: compact ? '4px 6px 0' : tall ? '9px 11px 0' : '5px 9px 0',
        cursor: !interactive ? 'default' : ev.fixed ? 'default' : draggingThis ? 'grabbing' : 'grab',
        userSelect: 'none',
        zIndex: draggingThis ? 1 : (hovered || confirming) ? 8 : ringed ? 6 : 3,
        opacity: draggingThis ? 0.18 : dim ? 0.3 : 1,
        transition: draggingThis ? 'opacity .1s var(--ease)'
          : settling ? 'top .32s var(--ease), height .2s var(--ease), opacity .2s var(--ease), box-shadow .2s var(--ease)'
          : 'opacity .2s var(--ease), box-shadow .2s var(--ease)',
        animation: flip ? `flipMove .95s var(--spring) ${flip.delay}ms both, arriveGlow 1.3s var(--ease) ${flip.delay + 550}ms both`
          : thinking ? `breathe ${1.1 + thinking * 0.12}s var(--ease) ${thinking * 90}ms infinite`
          : isConflict ? 'shakeWobble .6s var(--ease) both' : 'none',
        ...(flip ? { '--dx': `${flip.dx}px`, '--dy': `${flip.dy}px` } : {}),
        overflow: 'visible', display: 'flex', flexDirection: 'column',
      }}
    >
      {confirming && (
        <div onPointerDown={e => e.stopPropagation()} style={{
          position: 'absolute', top: 0,
          ...(popSide === 'right' ? { left: 'calc(100% + 12px)' } : { right: 'calc(100% + 12px)' }),
          background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px',
          boxShadow: 'var(--shadow-md)', zIndex: 50, whiteSpace: 'nowrap',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>Remove “{ev.title}”?</span>
          {linked && <span style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: -4 }}>Its links go with it.</span>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn--primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
              onPointerDown={e => { e.stopPropagation(); onDelete(); }}>Remove</button>
            <button className="btn" onPointerDown={e => { e.stopPropagation(); setConfirming(false); setHovered(false); }}>Keep</button>
          </div>
        </div>
      )}

      {hovered && interactive && !draggingThis && !confirming && hasDetails(ev) && <EventDetailsCard ev={ev} accent={c.accent} side={popSide} />}

      {!ev.fixed && <DeleteButton visible={showNodes} onDelete={() => setConfirming(true)} label="Remove event" />}

      {/* link node — drag from here to another event to link them */}
      {showNodes && (
        <button className="chip-node chip-node--link" aria-label="Link to another event" title="Drag to another event to link"
          onPointerDown={e => { e.stopPropagation(); onLinkStart(e); }}
          style={{ right: -9, top: '50%', transform: 'translateY(-50%)' }}>
          <IconLink size={10} />
        </button>
      )}

      <div onPointerDown={e => { if (!interactive) return; e.stopPropagation(); if (!ev.fixed) onResizeStart(e, 'top'); }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, cursor: ev.fixed || !interactive ? 'default' : 'ns-resize', zIndex: 1 }} />

      {(() => {
        // Locked reads as a solid badge with a white padlock; unlocked only shows an outlined open padlock on hover.
        const bs = compact ? 16 : 22;
        const lockStyle = ev.fixed
          ? { width: bs, height: bs, borderRadius: '50%', background: c.text, color: '#fff', border: 0, boxShadow: `0 6px 10px -4px ${c.text}88, 0 0 0 2px ${c.bg}` }
          : { width: bs, height: bs, borderRadius: '50%', background: 'transparent', color: c.text, border: `1.5px dashed ${c.text}66`, opacity: .8 };
        const lockTitle = ev.fixed ? 'Locked: Otto never moves this. Click to unlock.' : 'Lock in place so Otto never moves it';
        const lock = (ev.fixed || (interactive && hovered)) && (interactive ? (
          <button
            onPointerDown={e => { e.stopPropagation(); onToggleLock(); }}
            aria-label={ev.fixed ? 'Locked. Click to unlock' : 'Lock in place'} aria-pressed={!!ev.fixed} title={lockTitle}
            style={{ ...lockStyle, flexShrink: 0, padding: 0, cursor: 'pointer', display: 'grid', placeItems: 'center', transition: 'transform .4s var(--spring)' }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.12)'; }} onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
          >{ev.fixed ? <IconLock size={compact ? 9 : 12} strokeWidth={2} /> : <IconUnlock size={compact ? 9 : 12} strokeWidth={1.6} />}</button>
        ) : (
          <span role="img" aria-label="Locked" title="Locked" style={{ ...lockStyle, flexShrink: 0, display: 'grid', placeItems: 'center' }}><IconLock size={compact ? 9 : 12} strokeWidth={2} /></span>
        ));
        // a finished block either shows a tick (reflected on) or a quiet dot asking how it went
        const state = past && (ev.reflection
          ? <span title="You said how it went" aria-label="Reflected" style={{ display: 'flex', color: c.text, opacity: .7, flexShrink: 0 }}><IconCheck size={12} strokeWidth={2} /></span>
          : <span title="How did this go? Click to say." aria-label="Not reflected yet" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, animation: 'arriveGlow 2.4s var(--ease) infinite' }} />);
        const badge = linked && (
          <span title="Linked to other events. Click to see how." aria-label="Linked" style={{ display: 'flex', color: c.text, opacity: .5, flexShrink: 0 }}><IconLink size={11} /></span>
        );
        const title = (
          <div style={{
            fontSize: compact ? 10.5 : 12, fontWeight: 600, color: isConflict ? 'var(--danger)' : c.text, lineHeight: 1.25, letterSpacing: '-.005em',
            ...(tall ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
                     : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }),
          }}>{label ?? ev.title}</div>
        );
        const time = ev.durationMin >= 25 && !compact && (
          <div className="mono" style={{ fontSize: 10, color: c.text, opacity: .62, marginTop: tall ? 3 : 2, lineHeight: 1 }}>
            {fmtTime(ev.startMin)}-{fmtTime(ev.startMin + ev.durationMin)}
          </div>
        );
        if (tall) {
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,.7)', color: c.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Glyph size={13} />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{state}{badge}{lock}</span>
              </div>
              {title}
              {time}
            </>
          );
        }
        return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
              {!compact && <Glyph size={12} style={{ color: c.accent }} />}
              {title}
              {state}
              {badge}
              {lock}
            </div>
            {time}
          </>
        );
      })()}

      {tall && (() => {
        const room = Math.floor((height - 92) / 12);
        const lines = [];
        if (ev.description) lines.push({ k: 'd', t: ev.description, muted: true });
        (ev.subtasks || []).forEach(s => lines.push({ k: s.id, t: `${s.order != null ? s.order + '. ' : ''}${s.name}`, r: fmtDur(s.minutes) }));
        if (room < 1 || lines.length === 0) return null;
        const shown = lines.length > room ? lines.slice(0, Math.max(room - 1, 0)) : lines;
        const hidden = lines.length - shown.length;
        return (
          <div style={{ marginTop: 6, overflow: 'hidden', pointerEvents: 'none' }}>
            {shown.map(l => (
              <div key={l.k} style={{ display: 'flex', gap: 4, fontSize: 10, lineHeight: '12px', color: c.text, opacity: l.muted ? .55 : .8, whiteSpace: 'nowrap' }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.t}</span>
                {l.r && <span className="mono" style={{ opacity: .7 }}>{l.r}</span>}
              </div>
            ))}
            {hidden > 0 && <div style={{ fontSize: 10, lineHeight: '12px', color: c.text, opacity: .55 }}>+{hidden} more</div>}
          </div>
        );
      })()}

      <div onPointerDown={e => { if (!interactive) return; e.stopPropagation(); onResizeStart(e, 'bottom'); }}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 6, cursor: interactive ? 'ns-resize' : 'default', zIndex: 1 }} />
    </div>
  );
}
