// Learning-loop signals. The scheduler reads the learned profile on every /api/schedule
// call, so each signal sent here shapes the next reschedule. No LLM involved.

async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === 'string' ? err.detail : `HTTP ${res.status}`);
  }
  return res.json();
}

// choice: 'nailed' | 'harder' | 'outlier' | 'interrupted' | 'gap'
// category: calendar category label ('leetcode', 'gym', …) — mapped server-side
export function sendReflection({ taskId, choice, plannedMinutes, actualMinutes, category }) {
  return post('/api/learning/reflection', {
    task_id: taskId, choice,
    planned_minutes: plannedMinutes, actual_minutes: actualMinutes, category,
  });
}

// level: 1 drained … 5 energised. Peak hours shift after ~10 taps across 3+ hours of the day.
export function sendEnergy(level) {
  return post('/api/learning/energy', { level });
}

export async function getLearned() {
  const res = await fetch('/api/learning');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
