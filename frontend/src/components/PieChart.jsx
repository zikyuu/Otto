import { useRef } from 'react';

export const SLICE_COLORS = [
  '#E05A5A','#E8924A','#F5C842','#6BBF95',
  '#5BB8C4','#8450D6','#4373D6','#C49B6E',
];

export default function PieChart({ slices, onDrag, size = 110 }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 3;
  const svgRef  = useRef(null);
  const dragRef = useRef(null);

  let cum = 0;
  const arcs = slices.map((s, i) => {
    const a0 = (cum / 100) * 2 * Math.PI - Math.PI / 2;
    cum += s.percent;
    const a1 = (cum / 100) * 2 * Math.PI - Math.PI / 2;
    return { i, color: s.color ?? SLICE_COLORS[i % SLICE_COLORS.length], a0, a1 };
  });

  function arcPath(a0, a1) {
    if (Math.abs(a1 - a0) < 0.001) return '';
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    return `M${cx},${cy} L${x0},${y0} A${r},${r},0,${a1 - a0 > Math.PI ? 1 : 0},1,${x1},${y1}Z`;
  }

  function onPointerDown(e, idx) {
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    const rect = svgRef.current.getBoundingClientRect();
    dragRef.current = {
      idx,
      startAngle: Math.atan2(e.clientY - rect.top - cy, e.clientX - rect.left - cx),
      startPercent: slices[idx].percent,
    };
  }

  function onPointerMove(e) {
    if (!dragRef.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const angle = Math.atan2(e.clientY - rect.top - cy, e.clientX - rect.left - cx);
    let delta = angle - dragRef.current.startAngle;
    if (delta > Math.PI)  delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    const newPct = dragRef.current.startPercent + (delta / (2 * Math.PI)) * 100;
    onDrag(dragRef.current.idx, newPct);
  }

  function onPointerUp() { dragRef.current = null; }

  return (
    <svg
      ref={svgRef} width={size} height={size}
      onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      style={{ flexShrink: 0, display: 'block' }}
    >
      {arcs.map(a => (
        <path
          key={a.i}
          d={arcPath(a.a0, a.a1)}
          fill={a.color}
          stroke="#fff" strokeWidth={1.5}
          onPointerDown={e => onPointerDown(e, a.i)}
          style={{ cursor: 'grab' }}
        />
      ))}
      {/* donut hole */}
      <circle cx={cx} cy={cy} r={r * 0.38} fill="#fff" style={{ pointerEvents: 'none' }} />
    </svg>
  );
}
