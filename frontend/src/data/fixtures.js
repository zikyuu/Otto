import { dayNum } from '../views/calendar/calendarUtils.js';
export const NOW_TASKS = [
  { k: 'n0', t: 'Add embeddings + vector search (pgvector)', meta: '45 min · Ship a RAG app', done: false, star: true },
  { k: 'n1', t: 'Daily LeetCode — 1 medium', meta: '20 min · Finish Blind 75', done: false, star: false },
  { k: 'n2', t: 'Reply to recruiter', meta: '5 min', done: true, star: false },
  { k: 'n3', t: 'Evening walk — 8k steps', meta: 'Lose 5kg', done: false, star: false },
];

export const GOALS = [
  {
    id: 'rag', title: 'Ship a production RAG app', cat: 'LLM ENGINEERING', tag: 'skill',
    pct: 40, label: '40%', accent: '#4C7656', subnote: '2 of 5 steps done',
    direction: "You're spending time on syntax — these roles test retrieval quality and evals.",
    date: 'Updated 24 Jun 2026',
    sources: [
      { name: 'ML Engineer — role requirements' },
      { name: 'Pinecone · RAG in production' },
      { name: 'OpenAI · embeddings guide' },
    ],
    subs: [
      { t: 'Finish Karpathy "Let\'s build GPT"', done: true },
      { t: 'Build a toy chatbot on the OpenAI API', done: true },
      { t: 'Add embeddings + vector search (pgvector)', done: false },
      { t: 'Build the retrieval pipeline', done: false },
      { t: 'Write evals + deploy to a live URL', done: false },
    ],
  },
  {
    id: 'sd', title: 'Pass a system-design interview', cat: 'SKILL GAP', tag: 'skill',
    pct: 25, label: '25%', accent: '#4C7656', subnote: '1 of 4 steps done',
    direction: "You're memorizing components — interviews test tradeoff reasoning out loud.",
    date: 'Updated 22 Jun 2026',
    sources: [
      { name: 'System Design Interview — vol. 1' },
      { name: 'Common patterns cheatsheet' },
    ],
    subs: [
      { t: 'Read "System Design Interview" ch. 1–3', done: true },
      { t: 'Design a URL shortener (write-up + diagram)', done: false },
      { t: 'Caching, load balancing, sharding', done: false },
      { t: '2 mock system-design interviews', done: false },
    ],
  },
  {
    id: 'lc', title: 'Finish Blind 75', cat: 'INTERVIEW PREP', tag: 'skill',
    pct: 43, label: '32/75', accent: '#4C7656', subnote: '32 of 75 solved',
    direction: "You're grinding easy arrays — Blind 75 weights trees & DP more heavily.",
    date: 'Updated 25 Jun 2026',
    sources: [
      { name: 'Blind 75 — topic breakdown' },
      { name: 'NeetCode roadmap' },
    ],
    subs: [
      { t: 'Arrays & Hashing · 9 done', done: true },
      { t: 'Two Pointers · 5 done', done: true },
      { t: 'Sliding Window · 6 problems', done: false },
      { t: 'Trees + BFS/DFS · 11 problems', done: false },
      { t: 'Dynamic Programming · 12 problems', done: false },
    ],
  },
  {
    id: 'fit', title: '72 kg → 67 kg', cat: 'WELLBEING', tag: 'life',
    pct: 36, label: '1.8 / 5 kg', accent: '#6FA079', subnote: '1.8 kg of 5',
    direction: "You're weighing in daily — consistency of steps moves this more than the scale.",
    date: 'Updated 26 Jun 2026',
    sources: [
      { name: 'NHS · safe weight-loss pace' },
      { name: 'Protein & steps basics' },
    ],
    subs: [
      { t: 'Hit 8k steps today', done: false },
      { t: 'Gym 3× this week', done: false },
      { t: 'Stay under calorie target (log meals)', done: false },
      { t: 'Meal prep on Sunday', done: false },
    ],
  },
  {
    id: 'reel', title: 'Edit & publish 5 reels', cat: 'CREATIVE', tag: 'life',
    pct: 20, label: '1/5', accent: '#6FA079', subnote: '1 of 5 published',
    direction: "You're over-editing one reel — shipping volume teaches faster than polish.",
    date: 'Updated 21 Jun 2026',
    sources: [
      { name: 'DaVinci Resolve · fundamentals' },
      { name: 'Short-form editing tips' },
    ],
    subs: [
      { t: 'Finish DaVinci Resolve beginner course', done: true },
      { t: 'Edit first 60-sec reel (cuts + captions)', done: false },
      { t: 'Color-grading basics', done: false },
      { t: 'Transitions / motion graphics', done: false },
      { t: 'Publish 2 reels', done: false },
    ],
  },
];

// ---------------------------------------------------------------------------
// Category colour system — each category has a distinct colour so the
// calendar is scannable at a glance. Locked/flexible is shown as a lock icon,
// NOT via colour. Add new categories here and they automatically get picked
// up across the whole calendar.
// ---------------------------------------------------------------------------
export const CATEGORY_COLORS = {
  'llm':           { bg:'#DCE7E2', accent:'#5B8C86', text:'#2F5A55', label:'LLM / RAG'     },
  'leetcode':      { bg:'#E2E9CF', accent:'#6A784D', text:'#3F4C28', label:'LeetCode'       },
  'interview':     { bg:'#F3DDD2', accent:'#C4866D', text:'#8C4A33', label:'Interview'       },
  'gym':           { bg:'#F3E6C8', accent:'#C9A66B', text:'#7A5A1E', label:'Gym / Health'   },
  'social':        { bg:'#F6E0CF', accent:'#D49A6A', text:'#8A501F', label:'Social'         },
  'leisure':       { bg:'#E9DFEA', accent:'#9A7BA3', text:'#5B4063', label:'Leisure'        },
  'system-design': { bg:'#DDE3EC', accent:'#6F82A8', text:'#3A4C75', label:'System Design'  },
  'admin':         { bg:'#EAE3D0', accent:'#9A946F', text:'#55512F', label:'Admin'          },
  'life':          { bg:'#EFE3C9', accent:'#B59B66', text:'#6B5522', label:'Life'           },
  'deep_work':     { bg:'#DCE7E2', accent:'#5B8C86', text:'#2F5A55', label:'Deep Work'      },
  'deep work':     { bg:'#DCE7E2', accent:'#5B8C86', text:'#2F5A55', label:'Deep Work'      },
};

// Fallback for unknown categories
export const DEFAULT_CAT_COLOR = { bg:'#EAE3D0', accent:'#9A946F', text:'#55512F', label:'Other' };

// ---------------------------------------------------------------------------
// Calendar events
// Each event: { id, title, day (date 22-28), startMin (mins from midnight),
//               durationMin, category, fixed }
// No hardcoded color — display color is derived from category via CATEGORY_COLORS.
// fixed:true  → locked (cannot be moved by AI or user drag)
// fixed:false → flexible (AI can reschedule freely)
//
// TODO (backend dev): replace INITIAL_EVENTS with data from GET /api/plan
// Map Block[] + Task[] → CalEvent[]: frontendDay = block.day + 22 (0-indexed Mon-Sun)
// ---------------------------------------------------------------------------
// Week of Aug 4–10 2026 (Mon=4, Tue=5, Wed=6, Thu=7, Fri=8, Sat=9, Sun=10)
const RAW_EVENTS = [
  // Monday Aug 4
  { id:'e1',  title:'RAG pipeline design',         day:4,  startMin:9*60,     durationMin:90, category:'llm',           fixed:false,
    subtasks:[{ id:'e1a', name:'Pick a chunking strategy', minutes:45 }, { id:'e1b', name:'Wire up retrieval', minutes:45 }] },
  { id:'e2',  title:'Reply to recruiters',          day:4,  startMin:11*60,    durationMin:15, category:'admin',         fixed:false },
  // Tuesday Aug 5
  { id:'e3',  title:'System design mock',           day:5,  startMin:10*60,    durationMin:60, category:'interview',     fixed:true  },
  { id:'e4',  title:'LeetCode — 2 mediums',         day:5,  startMin:14*60,    durationMin:30, category:'leetcode',      fixed:false },
  // Wednesday Aug 6
  { id:'e5',  title:'Recruiter call — Meta',        day:6,  startMin:11*60,    durationMin:30, category:'interview',     fixed:true  },
  { id:'e6',  title:'Gym session',                  day:6,  startMin:17*60+30, durationMin:60, category:'gym',           fixed:true  },
  // Thursday Aug 7 (today)
  { id:'e7',  title:'Full LeetCode set',            day:7,  startMin:9*60,     durationMin:60, category:'leetcode',      fixed:false },
  { id:'e8',  title:'Onsite prep — system design',  day:7,  startMin:14*60,    durationMin:90, category:'system-design', fixed:false },
  // Friday Aug 8
  { id:'e9',  title:'Gym session',                  day:8,  startMin:8*60+30,  durationMin:60, category:'gym',           fixed:true  },
  { id:'e10', title:'Apply to 3 roles',             day:8,  startMin:11*60,    durationMin:45, category:'admin',         fixed:false },
  // Saturday Aug 9
  { id:'e11', title:'Add embeddings + pgvector',    day:9,  startMin:10*60,    durationMin:45, category:'llm',           fixed:false },
  { id:'e12', title:'Daily LeetCode',               day:9,  startMin:11*60,    durationMin:20, category:'leetcode',      fixed:false },
  { id:'e13', title:'Evening walk · 8k steps',      day:9,  startMin:18*60+30, durationMin:30, category:'gym',           fixed:false },
  // A thesis chapter Otto split into three sessions: research 120m, intro 60m, body 90m
  { id:'th#1', title:'Write thesis chapter (1/3)', base_title:'Write thesis chapter', split_of:'th', session:1, sessions_total:3, day:6, startMin:14*60, durationMin:90, category:'llm', fixed:false,
    subtasks:[{ id:'r_0', name:'Research', minutes:90, base_id:'r', base_name:'Research', base_minutes:120, order:1 }] },
  { id:'th#2', title:'Write thesis chapter (2/3)', base_title:'Write thesis chapter', split_of:'th', session:2, sessions_total:3, day:7, startMin:10*60+30, durationMin:90, category:'llm', fixed:false,
    subtasks:[{ id:'r_1', name:'Research', minutes:30, base_id:'r', base_name:'Research', base_minutes:120, order:1 }, { id:'i_1', name:'Write intro', minutes:60, base_id:'i', base_name:'Write intro', base_minutes:60, order:2 }] },
  { id:'th#3', title:'Write thesis chapter (3/3)', base_title:'Write thesis chapter', split_of:'th', session:3, sessions_total:3, day:8, startMin:13*60, durationMin:90, category:'llm', fixed:false,
    subtasks:[{ id:'b_2', name:'Write the body', minutes:90, base_id:'b', base_name:'Write the body', base_minutes:90, order:3 }] },
  // Sunday Aug 10
  { id:'e14', title:'Meal prep',                    day:10, startMin:12*60,    durationMin:45, category:'life',          fixed:false },
  { id:'e15', title:'Week review + next plan',      day:10, startMin:16*60,    durationMin:30, category:'admin',         fixed:false },
];

// The mock week is re-dated onto the current week (Mon = fixture day 4) so a first run opens on something real. Events carry real
// day numbers (see calendarUtils.dayNum), so this only seeds the first run: after that the calendar is whatever was saved.
export const DEMO_WEEK_OFFSET = 0;
function currentWeekEvents(raw) {
  const t = new Date();
  const monday = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7) + 7 * DEMO_WEEK_OFFSET);
  const at = i => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  // deadline_in_days: a deadline that many days after the event's own date, so the demo never goes stale
  return raw.map(({ deadline_in_days, ...e }) => ({
    ...e, day: dayNum(at(e.day - 4)),
    ...(deadline_in_days != null ? { deadline_iso: iso(at(e.day - 4 + deadline_in_days)), hard_deadline: true } : {}),
  }));
}
// More to play with: the week before (history) and the week after (what is coming), same fixture-day scheme
// (Mon of the demo week = 4, so the week after starts at 11 and the week before at -3).
const RAW_NEXT = [
  { id:'n1',  title:'Mock interview prep',           day:11, startMin:14*60,    durationMin:90,  category:'interview',     fixed:false, non_negotiable:true, deadline_in_days:3 },
  { id:'n2',  title:'Retrieval pipeline build',      day:11, startMin:16*60+30, durationMin:150, category:'llm',           fixed:false,
    subtasks:[{ id:'s1', name:'Chunking strategy', minutes:50, order:1 }, { id:'s2', name:'Hybrid search', minutes:60, order:2 }, { id:'s3', name:'Rerank + test', minutes:40, order:3 }], order_specific:true },
  { id:'n3',  title:'Team standup',                  day:12, startMin:10*60,    durationMin:30,  category:'social',        fixed:true },
  { id:'n4',  title:'System design: caching',        day:12, startMin:14*60,    durationMin:75,  category:'system-design', fixed:false },
  { id:'n5',  title:'LeetCode: trees',               day:13, startMin:15*60,    durationMin:60,  category:'leetcode',      fixed:false },
  { id:'n6',  title:'Gym session',                   day:13, startMin:9*60,     durationMin:60,  category:'gym',           fixed:false },
  { id:'n7',  title:'Recruiter screen: Stripe',      day:14, startMin:11*60,    durationMin:45,  category:'interview',     fixed:true },
  { id:'n8',  title:'Evals harness',                 day:14, startMin:15*60,    durationMin:120, category:'llm',           fixed:false },
  { id:'n9',  title:'Gym session',                   day:15, startMin:9*60,     durationMin:60,  category:'gym',           fixed:false },
  { id:'n10', title:'Apply to 4 roles',              day:15, startMin:11*60,    durationMin:60,  category:'admin',         fixed:false },
  { id:'n11', title:'Dinner with Mei',               day:15, startMin:19*60,    durationMin:120, category:'social',        fixed:true },
  { id:'n12', title:'Edit reel #2',                  day:16, startMin:13*60,    durationMin:90,  category:'leisure',       fixed:false },
  { id:'n13', title:'Laundry + groceries',           day:16, startMin:17*60,    durationMin:60,  category:'life',          fixed:false },
];
const RAW_PREV = [
  { id:'p1', title:'Karpathy: build GPT, part 3', day:-3, startMin:15*60,    durationMin:120, category:'llm',      fixed:false },
  { id:'p2', title:'Gym session',                 day:-3, startMin:9*60,     durationMin:60,  category:'gym',      fixed:false },
  { id:'p3', title:'LeetCode: sliding window',    day:-2, startMin:15*60,    durationMin:60,  category:'leetcode', fixed:false },
  { id:'p4', title:'Reply to recruiters',         day:-2, startMin:11*60,    durationMin:20,  category:'admin',    fixed:false },
  { id:'p5', title:'1:1 with manager',            day:-1, startMin:10*60,    durationMin:45,  category:'social',   fixed:true },
  { id:'p6', title:'System design: URL shortener',day:-1, startMin:14*60+30, durationMin:90,  category:'system-design', fixed:false },
  { id:'p7', title:'Gym session',                 day:0,  startMin:9*60,     durationMin:60,  category:'gym',      fixed:false },
  { id:'p8', title:'Embeddings experiments',      day:0,  startMin:15*60,    durationMin:105, category:'llm',      fixed:false,
    subtasks:[{ id:'p8a', name:'Compare embedding models', minutes:60 }, { id:'p8b', name:'Build the index', minutes:45 }] },
  { id:'p9', title:'Meal prep',                   day:2,  startMin:12*60,    durationMin:45,  category:'life',     fixed:false },
];

export const INITIAL_EVENTS = [...currentWeekEvents(RAW_PREV), ...currentWeekEvents(RAW_EVENTS), ...currentWeekEvents(RAW_NEXT)].map(e =>
  e.id === 'e8'  ? { ...e, prereq_ids: ['e7'] } :                    // ordered: onsite prep follows the LeetCode set
  e.id === 'e11' ? { ...e, grouped_with: ['e12'] } :                 // grouped: embeddings + daily LeetCode
  e.id === 'e12' ? { ...e, grouped_with: ['e11'] } :
  e.id === 'n2'  ? { ...e, prereq_ids: ['n4'] } :                    // retrieval build waits for the caching study
  e.id === 'n8'  ? { ...e, prereq_ids: ['n2'] } : e);                // evals follow the retrieval build

export const BUSY_DAYS = { 2:1,4:2,9:1,11:1,16:2,18:1,23:1,24:2,25:1,26:1,27:2,29:1 };

export const WEEK_CHIPS = {
  23: [['#4C7656','RAG · 45m']],
  24: [['#D2A04B','LeetCode']],
  26: [['#6FA079','Gym']],
  27: [['#4C7656','Embeddings'],['#6FA079','Walk'],['#D2A04B','LeetCode · moved']],
  28: [['#6FA079','Meal prep']],
};

export const BAR_DATA = [
  { d:'M', h:96, today:false },
  { d:'T', h:123, today:false },
  { d:'W', h:69, today:false },
  { d:'T', h:135, today:false },
  { d:'F', h:111, today:false },
  { d:'S', h:87, today:true },
  { d:'S', h:45, today:false },
];

export function initChecks() {
  const c = {};
  NOW_TASKS.forEach(t => { c[t.k] = t.done; });
  GOALS.forEach(g => g.subs.forEach((s, i) => { c[`${g.id}_${i}`] = s.done; }));
  return c;
}
