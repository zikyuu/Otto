import { useState } from 'react';

export default function TaskCreateModal({ slot, onClose, onSubmit}) {

const [draft, setDraft] = useState({
  title: '',
  duration_planned: 60,
  category: 'deep_work',
  effort_tier: 'med',
  deadline_iso: '',
  non_negotiable: false,
});

// 3. The checklist items being built
const [checklistItems, setChecklistItems] = useState([]);
// each item: { text: '', done: false, weight: null }
// 
function deriveEffortTier(minutes) {
    if (minutes < 30)  return 'low';
    if (minutes < 90)  return 'med';
    if (minutes < 180) return 'high';
    return 'deep';
    }

function addChecklistItem(text) {
const newItems = [...checklistItems, { text, done: false, weight: null }];
const equal = Math.round(100 / newItems.length);
const normalized = newItems.map((item, i) => ({
    ...item,
    weight: i === newItems.length - 1 ? 100 - equal * (newItems.length - 1) : equal
    // last item gets the remainder so they always sum to exactly 100
}));
setChecklistItems(normalized);
}

function handleSubmit() {
const task = {
    id: String(Date.now()),   // quick unique id
    ...draft,                 // spreads all the fields you collected
    status: 'todo',
    checklist: [],
    completion_mode: 'percentage',
    completion_percentage: 0,
};
onSubmit(task);
onClose();
}
return (
<div onClick={onClose} style={{

  position: 'fixed', inset: 0,           // covers the whole screen

  background: 'rgba(0,0,0,0.3)',

  zIndex: 100,

  display: 'flex', alignItems: 'center', justifyContent: 'center',

}}>

  {/* Card — stopPropagation so clicking inside doesn't close it */}

  <div onClick={e => e.stopPropagation()} style={{

    background: '#fff', borderRadius: 24, padding: 32,

    width: 480, boxShadow: '...',

  }}>

<input 
    type='text'
value={draft.title}
    onChange={e => setDraft({ ...draft, title: e.target.value })}
    placeholder='Task name'
    style={{ width: '100%', padding: 8, fontSize: 16, marginBottom: 12 }}
/>
<input
  type="number"
  value={draft.duration_planned}
  onChange={e => {
    const minutes = Number(e.target.value);
    setDraft({
      ...draft,
      duration_planned: minutes,
      effort_tier: deriveEffortTier(minutes),
    });
  }}
/>

<select
  value={draft.category}
  onChange={e => setDraft({ ...draft, category: e.target.value })}
>
  <option value="deep_work">Deep Work</option>
  <option value="admin">Admin</option>
  <option value="creative">Creative</option>
  <option value="physical">Physical</option>
  <option value="social">Social</option>
</select>
<input
  type="checkbox"
  checked={draft.non_negotiable}
  onChange={e => setDraft({ ...draft, non_negotiable: e.target.checked })}
/>
<button onClick={handleSubmit} style={{ marginTop: 16, width: '100%', padding: '12px', borderRadius: 12, background: '#4E5C36', color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer' }}>
  Save Task
</button>
</div>
</div>
    );
}

