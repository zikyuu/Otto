import { useRef } from 'react';

// A meter you pull with the mouse or the arrow keys. 0-100 in steps of 5.
//   value    where the fill is
//   planned  optional: a marker showing what was promised, so what really happened can be pulled against it
export default function Gauge({ value, onChange, planned, color = 'var(--accent)', label, disabled = false, step = 5 }) {
  const ref = useRef(null);
  const set = v => onChange?.(Math.min(100, Math.max(0, Math.round(v / step) * step)));
  const fromPointer = e => {
    const r = ref.current.getBoundingClientRect();
    set(((e.clientX - r.left) / r.width) * 100);
  };
  const short = planned != null && value < planned;

  return (
    <div
      ref={ref} role="slider" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}
      aria-valuetext={planned != null ? `${value} percent, planned ${planned}` : `${value} percent`}
      onPointerDown={e => { if (disabled) return; e.preventDefault(); ref.current.setPointerCapture(e.pointerId); fromPointer(e); }}
      onPointerMove={e => { if (!disabled && e.buttons === 1) fromPointer(e); }}
      onKeyDown={e => {
        if (disabled) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); set(value + step); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); set(value - step); }
      }}
      style={{ position: 'relative', height: 22, display: 'flex', alignItems: 'center', cursor: disabled ? 'default' : 'ew-resize', touchAction: 'none', outline: 'none' }}
    >
      <div style={{ position: 'absolute', left: 0, right: 0, height: 8, borderRadius: 999, background: 'rgba(32,40,8,.1)', boxShadow: 'none' }} />
      {planned != null && (
        <div style={{ position: 'absolute', left: 0, width: `${planned}%`, height: 8, borderRadius: 999, background: 'rgba(32,40,8,.14)', boxShadow: `inset 0 0 0 1.5px ${color}55` }} />
      )}
      <div style={{ position: 'absolute', left: 0, width: `${value}%`, height: 8, borderRadius: 999, background: short ? 'var(--amber-deep, #8A6A2F)' : color, transition: 'width .35s var(--ease), background .3s var(--ease)' }} />
      {planned != null && <div aria-hidden title={`Planned ${planned}%`} style={{ position: 'absolute', left: `${planned}%`, top: 2, bottom: 2, width: 2, marginLeft: -1, borderRadius: 2, background: 'var(--ink)', opacity: .55 }} />}
      {!disabled && (
        <div aria-hidden style={{ position: 'absolute', left: `${value}%`, width: 16, height: 16, marginLeft: -8, borderRadius: '50%', background: 'var(--surface)', boxShadow: `0 0 0 2px ${short ? 'var(--amber-deep, #8A6A2F)' : color}, 0 4px 8px -3px rgba(32,40,8,.5)`, transition: 'left .35s var(--ease)' }} />
      )}
    </div>
  );
}
