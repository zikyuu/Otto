// Which goals need a look: the plan says they are behind, at risk or out of reach, or their next milestone is close and
// the calendar has little time for it. Everything else is "on track" and stays out of the way.
import { statusOf, STATUS, insights, progressPct, expectedPct } from '../views/goals/goalMath.js';
import { goalNudges, catchUpFor } from './goalNudge.js';

// 1 = slightly behind, 2 = clearly behind or at risk, 3 = severely behind or out of reach. The status says whether the hours exist;
// the gap says how far reality is from the plan.
export function severityOf(status, gapPoints) {
  if (status === 'impossible') return 3;
  if (status === 'at_risk') return gapPoints >= 30 ? 3 : 2;
  if (status === 'behind') return gapPoints >= 30 ? 3 : gapPoints >= 15 ? 2 : 1;
  return 0;
}

export function goalsNeedingAttention({ goals = [], events = [], today }) {
  const nudges = Object.fromEntries(goalNudges({ goals, events, today, limit: 99 }).map(n => [n.goalId, n]));
  const out = [];
  for (const g of goals) {
    const key = statusOf(g, today);
    const bad = ['behind', 'at_risk', 'impossible'].includes(key);
    // a goal that is behind always gets a way to make the time (not only the ones whose next milestone is close)
    // the close-milestone request comes first (it is the sharpest), then a catch-up for a goal that is behind
    const nudge = nudges[g.id] || (bad ? catchUpFor(g, events, today) : null);
    const gap = Math.max(0, expectedPct(g, today) - progressPct(g));
    if (!bad && !nudge) continue;
    const worst = insights(g, today).find(i => i.tone !== 'good');
    out.push({
      goalId: g.id, title: g.title, status: key, label: STATUS[key].label, tone: STATUS[key].tone, severity: severityOf(key, gap),
      reason: bad ? (worst?.text || STATUS[key].label) : '', nudge,
    });
  }
  const rank = { impossible: 0, at_risk: 1, behind: 2 };
  return out.sort((a, b) => b.severity - a.severity || (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || (a.nudge?.days ?? 999) - (b.nudge?.days ?? 999));
}
