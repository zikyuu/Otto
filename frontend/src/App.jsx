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

export default function App() {
  const [lens, setLensRaw] = useState('now');
  const [recovery, setRecovery] = useState(false);
  const [goal, setGoal] = useState(null);
  const [calView, setCalView] = useState('month');
  const [sel, setSel] = useState(27);
  const [modal, setModal] = useState(null);
  const [pick, setPick] = useState(null);
  const [checks, setChecks] = useState(initChecks);

  function setLens(l) { setLensRaw(l); setGoal(null); setRecovery(false); }
  function toggleCheck(k) { setChecks(c => ({ ...c, [k]: !c[k] })); }

  const tasks = NOW_TASKS.map(t => ({ ...t, checked: checks[t.k] }));

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
