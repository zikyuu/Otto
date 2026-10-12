import { getLinks, linkPath, pathMidpoint, ORDERED } from './linkUtils.js';
import { PX_PER_MIN, DAY_START } from './calendarUtils.js';
import { catOf } from './EventChip.jsx';

// All links, drawn as curves over the grid. Lines sit under the chips: they run from an event's
// right edge to the next one's left edge, so they mostly travel through empty space.
//   pending  { fromId, x, y } — the line being dragged out right now (grid pixel coordinates)
//   show     Set of ids whose links to draw. null draws none: links appear only for the group you are looking at.
export default function LinkLayer({ events, weekDayNums, width, height, show, pending, onRemove }) {
  if (!width) return null;
  const colW = width / weekDayNums.length;
  const byId = Object.fromEntries(events.map(e => [e.id, e]));
  const col = e => weekDayNums.indexOf(e.day);
  const midY = e => (e.startMin - DAY_START + e.durationMin / 2) * PX_PER_MIN;

  const lines = (show ? getLinks(events).filter(l => show.has(l.from) && show.has(l.to)) : []).map(l => {
    const a = byId[l.from], b = byId[l.to];
    if (!a || !b || col(a) < 0 || col(b) < 0) return null;
    const same = col(a) === col(b);
    const x1 = (col(a) + 1) * colW - 3, y1 = midY(a);
    const x2 = same ? (col(b) + 1) * colW - 3 : col(b) * colW + 3, y2 = midY(b);
    return { ...l, x1, y1, x2, y2, same, color: catOf(a).accent };
  }).filter(Boolean);

  return (
    <svg width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, overflow: 'visible' }}>
      {lines.map(l => {
        const mid = pathMidpoint(l.x1, l.y1, l.x2, l.y2, l.same);
        const markerId = `arrow-${l.from}-${l.to}`.replace(/[^\w-]/g, '_');
        return (
          <g key={`${l.type}:${l.from}:${l.to}`} style={{ animation: 'fadeIn .5s var(--ease) both' }}>
            <defs>
              <marker id={markerId} viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M1 1l5 3-5 3" fill="none" stroke={l.color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </marker>
            </defs>
            <path d={linkPath(l.x1, l.y1, l.x2, l.y2, l.same)} fill="none" stroke={l.color}
              strokeWidth={2} strokeLinecap="round"
              strokeDasharray={l.type === ORDERED ? undefined : '1 5'}
              markerEnd={l.type === ORDERED ? `url(#${markerId})` : undefined} opacity={0.85} />
            <circle cx={l.x1} cy={l.y1} r="2.5" fill={l.color} />
            {l.type !== ORDERED && <circle cx={l.x2} cy={l.y2} r="2.5" fill={l.color} />}
            <g style={{ pointerEvents: 'auto', cursor: 'pointer' }} onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onRemove(l); }}>
              <title>{l.type === ORDERED ? 'Ordered link: click to remove' : 'Grouped link: click to remove'}</title>
              <circle cx={mid.x} cy={mid.y} r="7" fill="transparent" />
              <circle cx={mid.x} cy={mid.y} r="3" fill="var(--surface)" stroke={l.color} strokeWidth="1.5" />
            </g>
          </g>
        );
      })}
      {pending && (() => {
        const from = byId[pending.fromId];
        if (!from || col(from) < 0) return null;
        const x1 = (col(from) + 1) * colW - 3, y1 = midY(from);
        return <path d={linkPath(x1, y1, pending.x, pending.y)} fill="none" stroke={catOf(from).accent}
          strokeWidth="1.75" strokeDasharray="5 4" strokeLinecap="round" style={{ animation: 'dash .8s linear infinite' }} />;
      })()}
    </svg>
  );
}
