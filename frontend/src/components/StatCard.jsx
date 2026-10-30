import { IconLeaf } from '../views/calendar/Icons.jsx';

// A big number on a parchment card, with a small leaf in the corner: "128  ACTIVE PROJECTS".
//   tone  'plain' | 'green' | 'copper'
export default function StatCard({ value, unit, label, hint, tone = 'plain', i = 1 }) {
  const bg = tone === 'green' ? '#E4EAD3' : tone === 'copper' ? '#F3DDD2' : undefined;
  const fg = tone === 'copper' ? '#8C4A33' : 'var(--forest)';
  return (
    <div className="bezel rise" style={{ '--i': i }}>
      <div className="core" style={{ padding: '18px 22px 16px', background: bg, textAlign: 'center' }}>
        <IconLeaf size={13} style={{ position: 'absolute', top: 12, right: 14, color: tone === 'copper' ? '#C4866D' : 'var(--dingley)', opacity: .8 }} />
        <div className="display" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.05, color: fg }}>
          {value}{unit && <span style={{ fontSize: 16, fontWeight: 500, marginLeft: 4, color: 'var(--ink-3)' }}>{unit}</span>}
        </div>
        <p className="label-caps" style={{ margin: '6px 0 0', color: tone === 'copper' ? '#8C4A33' : 'var(--ink-2)' }}>{label}</p>
        {hint && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.4 }}>{hint}</p>}
      </div>
    </div>
  );
}
