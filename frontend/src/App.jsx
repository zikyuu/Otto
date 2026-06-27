import { useState } from 'react';
import './styles.css';

import Sidebar from './components/Sidebar.jsx';
import Now from './views/Now.jsx';
import Recovery from './views/Recovery.jsx';
import Calendar from './views/Calendar.jsx';
import { GoalsList, GoalDetail } from './views/Goals.jsx';
import Stats from './views/Stats.jsx';
import Feasibility from './modals/Feasibility.jsx';
import Tradeoff from './modals/Tradeoff.jsx';

import { NOW_TASKS, initChecks } from './data/fixtures.js';

      const res = await fetch(`${API}/api/plan`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: p, goals: [g], deadline_day: DEADLINE_DAY }),
      }).then((r) => r.json());
      setPlan(res.plan);
      setTasks(res.tasks);
      setScreen("plan");
    } finally {
      setLoading(false);
    }
  }

  async function markMissed(taskId) {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/reshuffle`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile, goals, deadline_day: DEADLINE_DAY, missed_task_ids: [taskId],
        }),
      }).then((r) => r.json());
      setPlan(res.plan);
      setTasks(res.tasks);
      setNarration(res.narration);
    } finally {
      setLoading(false);
    }
  }

  const onTrack = plan && plan.feasible && !plan.tradeoff;

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:'24px 16px' }}>
      <div style={{
        position: 'relative',
        width: 'min(1280px,96vw)', height: 'min(862px,93vh)',
        background: '#FBF8F4', borderRadius: 30, overflow: 'hidden',
        display: 'flex',
        boxShadow: '0 50px 100px -38px rgba(74,54,38,.55)',
        border: '1px solid #fff',
      }}>
        <Sidebar lens={lens} setLens={setLens} />

        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
          <div style={{ flex:1, overflowY:'auto' }}>
            {lens === 'now' && !recovery && (
              <Now
                tasks={tasks}
                onToggle={toggleCheck}
                onFellBehind={() => setRecovery(true)}
                onOpenFeasibility={() => setModal('feasibility')}
              />
            )}
            {lens === 'now' && recovery && (
              <Recovery onExit={() => setRecovery(false)} />
            )}
            {lens === 'calendar' && (
              <Calendar calView={calView} setCalView={setCalView} sel={sel} setSel={setSel} />
            )}
            {lens === 'goals' && !goal && (
              <GoalsList checks={checks} onToggleSub={toggleCheck} onOpenGoal={setGoal} />
            )}
            {lens === 'goals' && goal && (
              <GoalDetail goalId={goal} checks={checks} onToggleSub={toggleCheck} onClose={() => setGoal(null)} />
            )}
            {lens === 'stats' && <Stats />}
          </div>
        </div>
      )}

      {screen === "plan" && plan && (
        <div style={ui.planView}>
          <div style={ui.statusRow}>
            <div>
              <div className="display" style={ui.goalTitle}>
                {goals[0]?.title || "Your role"}
              </div>
              <div style={ui.gapline}>
                Roadmap: {tasks.map((t) => t.skill_served).join(" · ") || "no gaps"}
              </div>
            </div>
            <span style={{ ...ui.statusPill,
              background: onTrack ? "var(--accent-soft)" : "var(--warn-soft)",
              color: onTrack ? "var(--accent)" : "var(--warn)" }}>
              ● {onTrack ? "On track" : plan.tradeoff ? "Choose one" : "At risk"}
            </span>
          </div>

          <WeekGrid walls={walls} blocks={plan.blocks} tasks={tasks}
            deadlineDay={DEADLINE_DAY} />

          {plan.tradeoff && (
            <div style={ui.tradeoff}>
              <div style={ui.tradeoffReason}>{plan.tradeoff.reason}</div>
              <div style={ui.tradeoffOpts}>
                {plan.tradeoff.options.map((o) => (
                  <button key={o.goal_id} style={ui.tradeoffBtn}>{o.label}</button>
                ))}
              </div>
            </div>
          )}

          {narration && <div style={ui.narration}>◇ {narration}</div>}

          <div style={ui.taskList}>
            <div style={ui.taskListHead}>This week's tasks — tap one you didn't finish</div>
            {tasks.map((t) => (
              <button key={t.id} onClick={() => markMissed(t.id)} style={ui.taskRow}>
                <span>{t.title}</span>
                <span style={ui.taskMeta} className="mono">{t.est_minutes}m</span>
              </button>
            ))}
          </div>

          <button onClick={() => setScreen("setup")} style={{ marginTop: 4 }}>← Edit inputs</button>
        </div>
      )}
    </div>
  );
}
