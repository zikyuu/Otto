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
export function sendReflection({ taskId, choice, plannedMinutes, actualMinutes, category, daysToDeadline = null, prevCategory = null }) {
  return post('/api/learning/reflection', {
    task_id: taskId, choice,
    planned_minutes: plannedMinutes, actual_minutes: actualMinutes, category,
    ...(daysToDeadline != null ? { days_to_deadline: daysToDeadline } : {}), ...(prevCategory ? { prev_category: prevCategory } : {}),
  });
}

// level: 1 drained … 5 energised. Peak hours shift after ~10 taps across 3+ hours of the day.
// afterMeetingMin: minutes since a meeting ended, if one just did — teaches the post-meeting recovery buffer.
export function sendEnergy(level, afterMeetingMin = null, afterHardMin = null) {
  return post('/api/learning/energy', { level, after_meeting_min: afterMeetingMin, ...(afterHardMin != null ? { after_hard_min: afterHardMin } : {}) });
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

// ---- reads and the rest of the features ------------------------------------------------------------

async function get(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.detail === 'string' ? err.detail : `HTTP ${res.status}`);
  }
  return res.json();
}

// ---- oversleep / late start --------------------------------------------------------------------------
// events: the calendar events; weekDays: date-of-month numbers of the visible days (Monday first)

const calBody = (events, weekDays, extra = {}) => ({ events, week_days: weekDays, ...extra });

// { late, first_start, late_by_min, triage?: { ranked, line, capacity_min } }
export function checkOversleep(events, weekDays, nowMin) {
  return post('/api/oversleep/check', calBody(events, weekDays, nowMin != null ? { now_min: nowMin } : {}));
}

// mode: 'reschedule' | 'keep' | 'write_off'. keepIds = what stays today (above the line).
// -> { events, grinder, ghosts, moved, conflicts, explanation, late_starts: { late_starts_this_week, suggest_later_start } }
export function applyOversleep({ events, weekDays, mode, keepIds = null, choices = null, protectTomorrow = false, nowMin = null, dryRun = false }) {
  return post('/api/oversleep/apply', calBody(events, weekDays, {
    mode, keep_ids: keepIds, choices, protect_tomorrow: protectTomorrow, ...(dryRun ? { dry_run: true } : {}), ...(nowMin != null ? { now_min: nowMin } : {}),
  }));
}

// ---- feasibility, tradeoff, recovery -------------------------------------------------------------------

// { overcommitted, planned_min, need_min, capacity_min, overshoot_min, trade: { a, b } | null }
export const weekCheck = (events, weekDays) => post('/api/week-check', calBody(events, weekDays));
// shorten the named events to a lite version -> { events, changed }
export const downscope = (events, ids, factor = 0.5) => post('/api/week-check/downscope', { events, ids, factor });
// { focus: { id, title, minutes, category } | null, shrink: { id, title, from_min, to_min } | null }
export const recovery = (events, weekDays) => post('/api/recovery', calBody(events, weekDays));

// ---- weekly reflection, drift review, the weekly chat --------------------------------------------------

export const getWeekly = () => get('/api/reflection/weekly');
export const narrateWeekly = () => post('/api/reflection/weekly/narrate', {});
export const ackDrift = () => post('/api/reflection/drift/ack', {});
// text -> { reply, follow_up, rules: [{ key, value, note, label }], via }. Nothing is applied yet.
export const chatRules = text => post('/api/chat/rules', { text });
// rules the user confirmed -> { applied, rejected, learned }
export const applyChatRules = rules => post('/api/chat/rules/apply', { rules });
// only a short summary of each check-in is kept, never the conversation
// whose OpenAI key pays: { gated, mode: 'own'|'free'|'none'|'host', own_hint, free_left }
async function send(method, path, body) {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `HTTP ${res.status}`);
  return data;
}
export const getLLMStatus = () => send('GET', '/api/llm/status');
export const saveLLMKey = key => send('PUT', '/api/llm/key', { key });
export const removeLLMKey = () => send('DELETE', '/api/llm/key');
export const getMetrics = () => send('GET', '/api/metrics');
export const setTarget = (key, value) => send('PUT', '/api/targets', { key, value });
export const setStatedRuleValue = (key, value) => send('POST', '/api/learning/stated-rule', { key, value, note: '' });
export const getRules = () => fetch('/api/rules').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
export const getPatterns = () => fetch('/api/patterns').then(r => (r.ok ? r.json() : { patterns: [] }));
export const chatHistory = () => fetch('/api/chat/history').then(r => (r.ok ? r.json() : { summaries: [], opener: null }));
export const getSummaries = () => fetch('/api/summaries').then(r => (r.ok ? r.json() : { summaries: [] }));
export const addSummary = (kind, text, items = []) => post('/api/summaries', { kind, text, items }).catch(() => null);   // a failure must not block the page

// ---- task enrichment -----------------------------------------------------------------------------------

// tasks: [{ id, text }] -> { enriched: [{ id, title, category, minutes, importance, subtasks }], quota_left, reason }
export const enrichTasks = tasks => post('/api/tasks/enrich', { tasks });

// ---- Google Calendar -----------------------------------------------------------------------------------

export const gcalStatus = () => get('/api/gcal/status');
export const gcalAuthUrl = () => get('/api/gcal/auth-url');
export const gcalEvents = (start, end) => get(`/api/gcal/events?start=${start}&end=${end}`);
export const gcalDisconnect = () => post('/api/gcal/disconnect', {});

// the date-of-month numbers the backend uses for "the visible week"
export const weekDayNumbers = dates => dates.map(d => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000));

// run the scheduler on a calendar: new events listed in planIds may be split into sessions and are placed at free times
// -> { events, conflicts, moved, explanation, order_violations }
export function scheduleEvents({ events, planIds = [], pinnedIds = [], weekDays, weekStartIso, mode = 'displaced' }) {
  return post('/api/schedule', { events, pinned_ids: pinnedIds, plan_ids: planIds, week_days: weekDays, week_start_iso: weekStartIso, mode });
}

// is a language model connected on the server? { llm, model }
export const aiStatus = () => get('/api/ai/status');

// ---- "I'm overwhelmed" and late-start planning ----------------------------------------------------------
export const overwhelmTriage = (events, weekDays, nowMin) => post('/api/overwhelm/triage', { events, week_days: weekDays, now_min: nowMin });
export const overwhelmPlan = ({ events, weekDays, hours, keepIds, nowMin }) => post('/api/overwhelm/plan', { events, week_days: weekDays, now_min: nowMin, hours, keep_ids: keepIds });
export const logLateStart = ({ firstStart, nowMin }) => post('/api/oversleep/log', { first_start: firstStart, now_min: nowMin });
