import { useState } from 'react';
import './styles.css';
import TaskCreateModal from './modals/TaskCreateModal.jsx';

import Sidebar from './components/Sidebar.jsx';
import Now from './views/Now.jsx';
import Recovery from './views/Recovery.jsx';
import Calendar from './views/calendar/Calendar.jsx';
import { GoalsList, GoalDetail } from './views/Goals.jsx';
import Stats from './views/Stats.jsx';
import Feasibility from './modals/Feasibility.jsx';
import Tradeoff from './modals/Tradeoff.jsx';

import { NOW_TASKS, initChecks, INITIAL_EVENTS } from './data/fixtures.js';

export default function App() {
  const [lens, setLensRaw] = useState('now');
  const [recovery, setRecovery] = useState(false);
  const [goal, setGoal] = useState(null);
  const [calView, setCalView] = useState('month');
  const [sel, setSel] = useState(27);
  const [modal, setModal] = useState(null);
  const [taskSlot, setTaskSlot] = useState(null);
  const [pick, setPick] = useState(null);
  const [checks, setChecks] = useState(initChecks);
  const [events, setEvents] = useState(INITIAL_EVENTS);

  function setLens(l) { setLensRaw(l); setGoal(null); setRecovery(false); }
  function toggleCheck(k) { setChecks(c => ({ ...c, [k]: !c[k] })); }

  const tasks = NOW_TASKS.map(t => ({ ...t, checked: checks[t.k] }));

  return (
    <div style={{ height:'100vh', display:'flex', overflow:'hidden' }}>
      <div style={{
        position: 'relative',
        width: '100%', height: '100%',
        background: '#FBF8F4',
        display: 'flex',
      }}>
        <Sidebar lens={lens} setLens={setLens} />

        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0, transition:'all .22s ease' }}>
          <div style={{ flex:1, overflowY:'auto' }}>
            {lens === 'now' && !recovery && (
              <Now
                tasks={tasks}
                onToggle={toggleCheck}
                onFellBehind={() => setRecovery(true)}
                onOpenFeasibility={() => setModal('feasibility')}
                onAddTask={() => setTaskSlot({ day: 27, startMin: 600 })}
              />
            )}
            {lens === 'now' && recovery && (
              <Recovery onExit={() => setRecovery(false)} />
            )}
            {lens === 'calendar' && (
              <Calendar calView={calView} setCalView={setCalView} sel={sel} setSel={setSel} events={events} setEvents={setEvents} />
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

        {taskSlot && (
          <TaskCreateModal
            slot={taskSlot}
            onClose={() => setTaskSlot(null)}
            onSubmit={task => { setEvents(e => [...e, task]); setTaskSlot(null); }}
          />
        )}

        {modal === 'feasibility' && (
          <Feasibility
            onChoose={() => setModal('tradeoff')}
            onClose={() => setModal(null)}
          />
        )}
        {modal === 'tradeoff' && (
          <Tradeoff
            pick={pick}
            onPick={setPick}
            onClose={() => { setModal(null); setPick(null); }}
          />
        )}
      </div>
    </div>
  );
}


