import { useRef } from 'react';

// Earthy, distinct, readable on parchment
export const SLICE_COLORS = ['#4C7656', '#C08A2B', '#5B7F8F', '#BC6A47', '#8C6FA0', '#7C9A3F', '#5F6FA8', '#8C876B'];

// A ring, not a pie: drag any slice around the ring to change its share. `center` = { top, bottom } label.
export default function PieChart({ slices, onDrag, size = 110, center }) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 3, r = R * 0.64;
  const svgRef = useRef(null);
  const dragRef = useRef(null);

  let cum = 0;
  const arcs = slices.map((s, i) => {
    const a0 = (cum / 100) * 2 * Math.PI - Math.PI / 2;
    cum += s.percent;
    const a1 = (cum / 100) * 2 * Math.PI - Math.PI / 2;
    return { i, color: s.color ?? SLICE_COLORS[i % SLICE_COLORS.length], a0, a1 };
  });

  function ring(a0, a1) {
    if (Math.abs(a1 - a0) < 0.001) return '';
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, a) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
    return `M${p(R, a0)} A${R},${R} 0 ${big} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${big} 0 ${p(r, a0)} Z`;
  }

  function onPointerDown(e, idx) {
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const rect = svgRef.current.getBoundingClientRect();
    dragRef.current = { idx, startAngle: Math.atan2(e.clientY - rect.top - cy, e.clientX - rect.left - cx), startPercent: slices[idx].percent };
  }
  function onPointerMove(e) {
    if (!dragRef.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const angle = Math.atan2(e.clientY - rect.top - cy, e.clientX - rect.left - cx);
    let delta = angle - dragRef.current.startAngle;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    onDrag(dragRef.current.idx, dragRef.current.startPercent + (delta / (2 * Math.PI)) * 100);
  }
  const end = () => { dragRef.current = null; };

  return (
    <svg ref={svgRef} width={size} height={size} role="img" aria-label="Share of the block for each step" onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end}
      style={{ flexShrink: 0, display: 'block', overflow: 'visible' }}>
      {arcs.map(a => (
        <path key={a.i} d={ring(a.a0, a.a1)} fill={a.color} stroke="var(--surface-2, #F0EAD6)" strokeWidth={3} strokeLinejoin="round"
          onPointerDown={e => onPointerDown(e, a.i)} style={{ cursor: 'grab', transition: 'opacity .3s var(--ease)' }}
          onPointerEnter={e => { e.currentTarget.style.opacity = .86; }} onPointerLeave={e => { e.currentTarget.style.opacity = 1; }} />
      ))}
      {center && (
        <g style={{ pointerEvents: 'none' }} textAnchor="middle">
          <text x={cx} y={cy + 2} fontSize={size * 0.17} fontWeight="600" fill="var(--ink)" style={{ fontFamily: 'var(--font)', fontVariantNumeric: 'tabular-nums' }}>{center.top}</text>
          <text x={cx} y={cy + size * 0.14} fontSize={size * 0.085} fill="var(--ink-3)" style={{ fontFamily: 'var(--font)', letterSpacing: '.1em', textTransform: 'uppercase' }}>{center.bottom}</text>
        </g>
      )}
    </svg>
  );
}
