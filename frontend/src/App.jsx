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
import Settings from './views/Settings.jsx';

const API = import.meta.env.VITE_API ?? '';

// ── calendar helpers ──────────────────────────────────────────────────────────
const SKILL_TO_CAT = [
  [['algorithm','leetcode','data structure','dynamic programming','tree','graph','binary'], 'leetcode'],
  [['system design','architecture','distributed','scalab'], 'system-design'],
  [['llm','embedding','rag','gpt','machine learning',' ml ','nlp','neural','transformer'], 'llm'],
  [['interview'], 'interview'],
];
function skillToCategory(skill) {
  const s = ` ${skill.toLowerCase()} `;
  for (const [keys, cat] of SKILL_TO_CAT) {
    if (keys.some(k => s.includes(k))) return cat;
  }
  return 'deep work';
}
function blocksToEvents(blocks, tasks, walls = []) {
  const planEvents = blocks.map((b, i) => {
    const task = tasks.find(t => t.id === b.task_id);
    return {
      id: `blk_${i}_${b.task_id}`,
      title: task?.title?.replace(/^Build skill:\s*/i, '') ?? b.task_id,
      day: b.day + 22,
      startMin: b.start_min,
      durationMin: Math.max(15, b.end_min - b.start_min),
      category: skillToCategory(task?.skill_served ?? ''),
      fixed: false,
    };
  });
  const wallEvents = walls.map((w, i) => ({
    id: `wall_${i}`,
    title: w.label || 'Busy',
    day: w.day + 22,
    startMin: w.start_min,
    durationMin: Math.max(15, w.end_min - w.start_min),
    category: 'life',
    fixed: true,
  }));
  return [...wallEvents, ...planEvents];
}

export default function App() {
  // ── auth ──────────────────────────────────────────────────────────────────
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
      if (!data.session) setPlanLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { setPlanData(null); setChecks({}); setPlanLoading(false); }
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // On every login, load plan from Supabase
  useEffect(() => {
    if (!user) return;
    setPlanLoading(true);
    fetch(`/api/me/plan?user_id=${user.id}`)
      .then(r => r.json())
      .then(data => {
        if (data?.plan) {
          setPlanData(data);
          const dbChecks = {};
          (data.tasks || []).forEach(t => { dbChecks[t.id] = t.status === 'done'; });
          setChecks(dbChecks);
        }
        // No plan in DB → planData stays null → Setup shows (new user)
      })
      .catch(() => {})
      .finally(() => setPlanLoading(false));
  }, [user?.id]);

  // ── plan data ─────────────────────────────────────────────────────────────
  const [planData, setPlanData] = useState(null);
  const [checks, setChecks] = useState({});

  function onSetupComplete(data) {
    setPlanData(data);
    setChecks({});
  }

  // ── nav / view state ──────────────────────────────────────────────────────
  const [lens, setLensRaw] = useState('now');
  const [recovery, setRecovery] = useState(false);
  const [goal, setGoal] = useState(null);
  const [calView, setCalView] = useState('month');
  const [sel, setSel] = useState(27);
  const [modal, setModal] = useState(null);
  const [pick, setPick] = useState(null);
  const [narration, setNarration] = useState('');

  function setLens(l) { setLensRaw(l); setGoal(null); setRecovery(false); }

  function toggleCheck(k) {
    setChecks(c => {
      const next = { ...c, [k]: !c[k] };
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
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const blocks = liveBlocks ?? planData?.blocks ?? [];
    const tasks  = liveTasks  ?? planData?.tasks  ?? [];
    const walls  = planData?.profile?.walls ?? [];
    setEvents(blocksToEvents(blocks, tasks, walls));
  }, [planData, liveBlocks]);

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
          goals: apiGoals,
          missed_task_ids: missedIds,
        }),
      }).then(r => r.json());
      setLiveTasks(result.tasks);
      setLiveBlocks(result.plan.blocks);
      setNarration(result.narration ?? '');
    } catch {}
  }

  const currentTasks = liveTasks ?? planData?.tasks ?? [];
  const currentBlocks = liveBlocks ?? planData?.blocks ?? [];
  const currentWalls = planData?.profile?.walls ?? [];
  const apiGoals = planData?.goals ?? (planData?.goal ? [planData.goal] : []);

  function _applyPlanUpdate(data) {
    if (!data?.plan) return;
    setPlanData(data);
    const dbChecks = {};
    (data.tasks || []).forEach(t => { dbChecks[t.id] = t.status === 'done'; });
    setChecks(dbChecks);
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

  // Handle Google Calendar OAuth callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google') === 'connected') {
      window.history.replaceState({}, '', window.location.pathname);
      if (user) {
        fetch(`/api/google/walls?user_id=${user.id}`)
          .then(r => r.json())
          .then(({ walls }) => walls?.length && handleWallsUpdate(walls))
          .catch(() => {});
      }
    }
  }, [user?.id]);

  function handleWallsUpdate(newWalls) {
    if (!planData) return;
    const updated = { ...planData, profile: { ...planData.profile, walls: newWalls } };
    setPlanData(updated);
    fetch('/api/plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: updated.profile, goals: apiGoals, user_id: user?.id ?? '' }),
    }).then(r => r.json()).then(result => {
      if (result?.plan) _applyPlanUpdate({ ...updated, ...result });
    }).catch(() => {});
  }

  const nowTasks = currentTasks.map(t => ({
    k: t.id,
    t: t.title.replace(/^Build skill:\s*/i, ''),
    meta: `${t.full_minutes} min · ${t.skill_served}`,
    skill: t.skill_served,
    done: t.status === 'done',
    star: t.importance >= 0.7,
    checked: checks[t.id] ?? false,
  }));

  // ── routing ───────────────────────────────────────────────────────────────
  const rawName = planData?.profile?.name || user?.email?.split('@')[0] || '';
  const userName = rawName.charAt(0).toUpperCase() + rawName.slice(1);

  if (authLoading || planLoading) return null;
  if (!user) return <Login onLogin={setUser} />;
  if (!planData) return <Setup onComplete={onSetupComplete} userId={user.id} />;

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
              <Now tasks={nowTasks} onToggle={toggleCheck} onFellBehind={fellBehind} onOpenFeasibility={() => setModal('feasibility')} userName={userName} feasible={planData?.plan?.feasible} role={planData?.goal?.title ?? planData?.goals?.[0]?.title ?? ''} />
            )}
            {lens === 'now' && recovery && (
              <Recovery narration={narration} tasks={currentTasks} checks={checks}
                onExit={() => { setRecovery(false); setNarration(''); }} />
            )}
            {lens === 'calendar' && (
              <Calendar calView={calView} setCalView={setCalView} sel={sel} setSel={setSel}
                events={events} setEvents={setEvents}
                userId={user?.id} onWallsUpdate={handleWallsUpdate} />
            )}
            {lens === 'goals' && !goal && (
              <GoalsList checks={checks} onToggleSub={toggleCheck} onOpenGoal={setGoal}
                apiGoals={apiGoals} apiTasks={currentTasks}
                onAddGoal={addGoal} onDeleteGoal={deleteGoal} />
            )}
            {lens === 'goals' && goal && (
              <GoalDetail goalId={goal} checks={checks} onToggleSub={toggleCheck}
                onClose={() => setGoal(null)} apiGoals={apiGoals} apiTasks={currentTasks} />
            )}
            {lens === 'stats' && (
              <Stats tasks={currentTasks} checks={checks} blocks={currentBlocks}
                feasible={planData?.plan?.feasible} goalTitle={planData?.goal?.title} />
            )}
            {lens === 'settings' && (
              <Settings
                planData={planData}
                onSave={async (profile) => {
                  const data = await fetch('/api/plan', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profile, goals: apiGoals, user_id: user.id }),
                  }).then(r => r.json());
                  if (data?.plan) {
                    _applyPlanUpdate({ ...planData, profile, tasks: data.tasks, blocks: data.plan.blocks, plan: data.plan });
                    setLens('now');
                  }
                }}
                onStartOver={() => { setPlanData(null); setChecks({}); }}
              />
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
          <Tradeoff tradeoff={planData?.plan?.tradeoff} pick={pick} onPick={setPick}
            onClose={() => { setModal(null); setPick(null); }} />
        )}
      </div>
    </div>
  );
}
