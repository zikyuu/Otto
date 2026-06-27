import { useState, useEffect } from 'react';
import './styles.css';

import { supabase } from './lib/supabase.js';
import Login from './views/Login.jsx';
import Setup from './views/Setup.jsx';
import Sidebar from './components/Sidebar.jsx';
import Now from './views/Now.jsx';
import Recovery from './views/Recovery.jsx';
import Calendar from './views/Calendar.jsx';
import { GoalsList, GoalDetail } from './views/Goals.jsx';
import Stats from './views/Stats.jsx';
import Feasibility from './modals/Feasibility.jsx';
import Tradeoff from './modals/Tradeoff.jsx';
import { NOW_TASKS, initChecks } from './data/fixtures.js';

const API = import.meta.env.VITE_API ?? '';

export default function App() {
  // ── auth ──────────────────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) setPlanData(null);
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // On every login, sync plan from Supabase (keeps cross-device in sync)
  useEffect(() => {
    if (!user) return;
    setPlanLoading(true);
    fetch(`/api/me/plan?user_id=${user.id}`)
      .then(r => r.json())
      .then(data => {
        if (data?.plan) {
          if (!data.profile?.name) {
            const cached = JSON.parse(localStorage.getItem('otto_plan') || 'null');
            if (cached?.profile?.name) data.profile.name = cached.profile.name;
          }
          localStorage.setItem('otto_plan', JSON.stringify(data));
          setPlanData(data);
          // Derive checks from DB task statuses (authoritative on login)
          const dbChecks = {};
          (data.tasks || []).forEach(t => { dbChecks[t.id] = t.status === 'done'; });
          setChecks(dbChecks);
          localStorage.setItem('otto_checks', JSON.stringify(dbChecks));
        }
      })
      .catch(() => {})
      .finally(() => setPlanLoading(false));
  }, [user?.id]);

  // ── plan data (from setup onboarding) ────────────────────────────────────
  const [planData, setPlanData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('otto_plan') ?? 'null'); } catch { return null; }
  });

  function onSetupComplete(data) {
    localStorage.setItem('otto_plan', JSON.stringify(data));
    setPlanData(data);
  }

  // ── nav / view state ──────────────────────────────────────────────────────
  const [lens, setLensRaw] = useState('now');
  const [recovery, setRecovery] = useState(false);
  const [goal, setGoal] = useState(null);
  const [calView, setCalView] = useState('month');
  const [sel, setSel] = useState(27);
  const [modal, setModal] = useState(null);
  const [pick, setPick] = useState(null);
  const [checks, setChecks] = useState(() => {
    try {
      const saved = localStorage.getItem('otto_checks');
      if (saved) return JSON.parse(saved);
    } catch {}
    return initChecks;
  });
  const [narration, setNarration] = useState('');

  function setLens(l) { setLensRaw(l); setGoal(null); setRecovery(false); }
  function toggleCheck(k) {
    setChecks(c => {
      const next = { ...c, [k]: !c[k] };
      localStorage.setItem('otto_checks', JSON.stringify(next));
      fetch(`/api/tasks/${k}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next[k] ? 'done' : 'todo' }),
      }).catch(() => {});
      return next;
    });
  }

  // ── reshuffle ─────────────────────────────────────────────────────────────
  const [liveTasks, setLiveTasks] = useState(null);
  const [liveBlocks, setLiveBlocks] = useState(null);

  async function fellBehind() {
    setRecovery(true);
    if (!planData) return;
    try {
      const tasks = liveTasks ?? planData.tasks;
      const missedIds = tasks.filter(t => !checks[t.id]).map(t => t.id);
      const result = await fetch(`${API}/api/reshuffle`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: planData.profile,
          goals: [planData.goal],
          missed_task_ids: missedIds,
        }),
      }).then(r => r.json());
      setLiveTasks(result.tasks);
      setLiveBlocks(result.plan.blocks);
      setNarration(result.narration ?? '');
    } catch {}
  }

  // Resolve current tasks + blocks (reshuffle overrides setup data)
  const currentTasks = liveTasks ?? planData?.tasks ?? [];
  const currentBlocks = liveBlocks ?? planData?.blocks ?? [];
  const currentWalls = planData?.profile?.walls ?? [];
  // Support both old single-goal and new multi-goal shape
  const apiGoals = planData?.goals ?? (planData?.goal ? [planData.goal] : []);

  function _applyPlanUpdate(data) {
    if (!data?.plan) return;
    localStorage.setItem('otto_plan', JSON.stringify(data));
    setPlanData(data);
    const dbChecks = {};
    (data.tasks || []).forEach(t => { dbChecks[t.id] = t.status === 'done'; });
    setChecks(dbChecks);
    localStorage.setItem('otto_checks', JSON.stringify(dbChecks));
  }

  async function addGoal(jdText) {
    const data = await fetch('/api/me/goals', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: user.id, jd_text: jdText }),
    }).then(r => r.json());
    _applyPlanUpdate(data);
  }

  async function deleteGoal(goalId) {
    const data = await fetch(`/api/me/goals/${goalId}?user_id=${user.id}`, {
      method: 'DELETE',
    }).then(r => r.json());
    _applyPlanUpdate(data);
  }

  // Map engine tasks → Now view shape; fall back to fixtures before onboarding
  const nowTasks = currentTasks.length > 0
    ? currentTasks.map(t => ({
        k: t.id,
        t: t.title.replace(/^Build skill:\s*/i, ''),
        meta: `${t.full_minutes} min · ${t.skill_served}`,
        done: t.status === 'done',
        star: t.importance >= 0.7,
        checked: checks[t.id] ?? false,
      }))
    : NOW_TASKS.map(t => ({ ...t, checked: checks[t.k] }));

  // ── routing ───────────────────────────────────────────────────────────────
  const rawName = planData?.profile?.name || user?.email?.split('@')[0] || '';
  const userName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  if (authLoading || planLoading) return null;
  if (!user) return <Login onLogin={setUser} />;
  if (!planData) return <Setup onComplete={onSetupComplete} userId={user.id} />;

  // ── main app (original design) ────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{
        position: 'relative',
        width: 'min(1280px,96vw)', height: 'min(862px,93vh)',
        background: '#FBF8F4', borderRadius: 30, overflow: 'hidden',
        display: 'flex',
        boxShadow: '0 50px 100px -38px rgba(74,54,38,.55)',
        border: '1px solid #fff',
      }}>
        <Sidebar lens={lens} setLens={setLens} userName={userName} feasible={planData?.plan?.feasible} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {lens === 'now' && !recovery && (
              <Now tasks={nowTasks} onToggle={toggleCheck} onFellBehind={fellBehind} onOpenFeasibility={() => setModal('feasibility')} userName={userName} feasible={planData?.plan?.feasible} />
            )}
            {lens === 'now' && recovery && (
              <Recovery narration={narration} onExit={() => { setRecovery(false); setNarration(''); }} />
            )}
            {lens === 'calendar' && (
              <Calendar calView={calView} setCalView={setCalView} sel={sel} setSel={setSel}
                walls={currentWalls} blocks={currentBlocks} tasks={currentTasks} />
            )}
            {lens === 'goals' && !goal && (
              <GoalsList checks={checks} onToggleSub={toggleCheck} onOpenGoal={setGoal}
                apiGoals={apiGoals} apiTasks={currentTasks}
                onAddGoal={addGoal} onDeleteGoal={deleteGoal} />
            )}
            {lens === 'goals' && goal && (
              <GoalDetail goalId={goal} checks={checks} onToggleSub={toggleCheck} onClose={() => setGoal(null)}
                apiGoals={apiGoals} apiTasks={currentTasks} />
            )}
            {lens === 'stats' && (
              <Stats tasks={currentTasks} checks={checks} blocks={currentBlocks}
                feasible={planData?.plan?.feasible} goalTitle={planData?.goal?.title} />
            )}
          </div>
        </div>

        {modal === 'feasibility' && (
          <Feasibility
            tradeoff={planData?.plan?.tradeoff}
            plannedHours={Math.round(currentBlocks.reduce((s, b) => s + (b.end_min - b.start_min), 0) / 60)}
            capacityHours={Math.round((planData?.profile?.free_hours_per_day ?? 3) * 7 * (planData?.profile?.velocity ?? 0.8))}
            onChoose={() => setModal('tradeoff')}
            onClose={() => setModal(null)}
          />
        )}
        {modal === 'tradeoff' && (
          <Tradeoff tradeoff={planData?.plan?.tradeoff} pick={pick} onPick={setPick} onClose={() => { setModal(null); setPick(null); }} />
        )}
      </div>
    </div>
  );
}
