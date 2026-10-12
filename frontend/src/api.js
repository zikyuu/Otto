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
// afterMeetingMin: minutes since a meeting ended, if one just did — teaches the post-meeting recovery buffer.
export function sendEnergy(level, afterMeetingMin = null) {
  return post('/api/learning/energy', { level, after_meeting_min: afterMeetingMin });
}

// reason: 'doomscrolled' | 'messages' | 'couldnt_focus' | 'break' | 'medical' | 'family' | 'work_crisis'
// intoTaskMin: minutes into the session when focus broke — teaches the focus span.
export function sendOffTrack({ reason, durationMin, intoTaskMin = null, taskId = null }) {
  return post('/api/learning/off-track', {
    reason, duration_min: durationMin, into_task_min: intoTaskMin, task_id: taskId,
  });
}

// plain done / missed mark — feeds completion rate and how much of the day gets planned
export function sendCompletion({ taskId, done, plannedMinutes }) {
  return post('/api/learning/completion', { task_id: taskId, done, planned_minutes: plannedMinutes });
}

// the user dragged a block's end to what really happened. Resolves { recorded, ask_reflection }:
// close to plan is recorded as 'nailed'; otherwise ask_reflection is true and the caller should
// collect the reason and call sendReflection.
export function sendActual({ taskId, plannedMinutes, actualMinutes, category }) {
  return post('/api/learning/actual', {
    task_id: taskId, planned_minutes: plannedMinutes, actual_minutes: actualMinutes, category,
  });
}

// A rule the user states directly. It is applied now and learning never overwrites it. Keys:
// peak_window [startHour, endHour] · day_start_min · day_end_min · focus_span_min ·
// recovery_after_meeting · post_meal_slump_min · max_deep_run_min · break_min ·
// batching_preference 'none'|'batch'|'spread' · gym_first true|false · planning_bias 0.3–1 ·
// 'ramp_up_min:<category>'
export function setStatedRule(key, value, note = '') {
  return post('/api/learning/stated-rule', { key, value, note });
}

// hand a parameter back to learning
export function clearStatedRule(key) {
  return post('/api/learning/stated-rule/clear', { key });
}

// minutes from midnight; sleepMin may run past midnight (4am = 1680)
export function setSleepWindow(wakeMin, sleepMin) {
  return post('/api/profile/sleep-window', { wake_min: wakeMin, sleep_min: sleepMin });
}

export async function getPriorityWindows() {
  const res = await fetch('/api/priority-windows');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// windows: [{ window: 'week'|'month'|'year', start_iso, end_iso, ranked_task_ids, non_negotiable_ids }]
export async function setPriorityWindows(windows) {
  const res = await fetch('/api/priority-windows', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(windows),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === 'string' ? err.detail : `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getLearned() {
  const res = await fetch('/api/learning');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
