import { plannedCurve, actualCurve, projectedFinish, progressPct, parseDay, daysBetween, statusOf, STATUS } from './goalMath.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = iso => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]}`; };

const W = 440, H = 176, L = 36, R = 16, T = 14, B = 28;
const TONE = { good: '#4E5C36', warn: '#8A6A2F', bad: '#A5543F' };

// Planned against actual. The dashed line is what the plan said; the solid one is what happened;
// a dotted tail shows where the current pace ends up if that is later than the target.
export default function ProgressChart({ goal, today }) {
  const fin = projectedFinish(goal, today);
  const end = fin && daysBetween(goal.target, fin) > 0 ? fin : goal.target;
  const span = Math.max(daysBetween(goal.start, end), 1);
  const x = iso => L + (Math.min(Math.max(daysBetween(goal.start, iso), 0), span) / span) * (W - L - R);
  const y = pct => T + (1 - Math.min(Math.max(pct, 0), 100) / 100) * (H - T - B);
  const line = pts => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ');

  const planned = plannedCurve(goal), actual = actualCurve(goal, today);
  const now = progressPct(goal);
  const tone = TONE[STATUS[statusOf(goal, today)].tone];
  const area = `${line(actual)} L${x(today).toFixed(1)},${y(0)} L${x(goal.start).toFixed(1)},${y(0)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" width="100%" style={{ display: 'block', overflow: 'visible' }}
      aria-label={`Progress ${Math.round(now)}% against the plan, target ${goal.target}`}>
      {[0, 25, 50, 75, 100].map(v => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
          <text x={L - 8} y={y(v) + 3.5} textAnchor="end" fontSize="9.5" fill="var(--ink-4)" fontFamily="var(--mono)">{v}</text>
        </g>
      ))}
      <path d={area} fill={tone} opacity=".10" />
      <path d={line(planned)} fill="none" stroke="var(--ink-3)" strokeWidth="1.6" strokeDasharray="5 4" strokeLinejoin="round" />
      <path d={line(actual)} fill="none" stroke={tone} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {fin && fin !== today && daysBetween(goal.target, fin) > 0 && (
        <path d={`M${x(today)},${y(now)} L${x(fin)},${y(100)}`} fill="none" stroke={TONE.warn} strokeWidth="1.6" strokeDasharray="1.5 4" strokeLinecap="round" />
      )}
      {/* target date */}
      <line x1={x(goal.target)} x2={x(goal.target)} y1={T} y2={H - B} stroke="var(--forest)" strokeWidth="1.2" opacity=".55" />
      <text x={x(goal.target)} y={H - 10} textAnchor="middle" fontSize="9.5" fill="var(--forest)" fontFamily="var(--mono)">target {shortDate(goal.target)}</text>
      {/* today */}
      <line x1={x(today)} x2={x(today)} y1={T} y2={H - B} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="2 3" />
      <circle cx={x(today)} cy={y(now)} r="4.2" fill={tone} stroke="var(--surface)" strokeWidth="2" />
      <text x={x(goal.start)} y={H - 10} fontSize="9.5" fill="var(--ink-4)" fontFamily="var(--mono)">{shortDate(goal.start)}</text>
      {Math.abs(x(today) - x(goal.target)) > 70 && Math.abs(x(today) - x(goal.start)) > 50 && (
        <text x={x(today)} y={H - 10} textAnchor="middle" fontSize="9.5" fill="var(--ink-3)" fontFamily="var(--mono)">today</text>
      )}
    </svg>
  );
}
