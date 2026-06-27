export const NOW_TASKS = [
  { k: 'n0', t: 'Add embeddings + vector search (pgvector)', meta: '45 min · Ship a RAG app', done: false, star: true },
  { k: 'n1', t: 'Daily LeetCode — 1 medium', meta: '20 min · Finish Blind 75', done: false, star: false },
  { k: 'n2', t: 'Reply to recruiter', meta: '5 min', done: true, star: false },
  { k: 'n3', t: 'Evening walk — 8k steps', meta: 'Lose 5kg', done: false, star: false },
];

export const GOALS = [
  {
    id: 'rag', title: 'Ship a production RAG app', cat: 'LLM ENGINEERING', tag: 'skill',
    pct: 40, label: '40%', accent: '#A8703E', subnote: '2 of 5 steps done',
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
    pct: 25, label: '25%', accent: '#A8703E', subnote: '1 of 4 steps done',
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
    pct: 43, label: '32/75', accent: '#A8703E', subnote: '32 of 75 solved',
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
    pct: 36, label: '1.8 / 5 kg', accent: '#6BBF95', subnote: '1.8 kg of 5',
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
    pct: 20, label: '1/5', accent: '#6BBF95', subnote: '1 of 5 published',
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

export const BUSY_DAYS = { 2:1,4:2,9:1,11:1,16:2,18:1,23:1,24:2,25:1,26:1,27:2,29:1 };

export const WEEK_CHIPS = {
  23: [['#A8703E','RAG · 45m']],
  24: [['#ECA94E','LeetCode']],
  26: [['#6BBF95','Gym']],
  27: [['#A8703E','Embeddings'],['#6BBF95','Walk'],['#ECA94E','LeetCode · moved']],
  28: [['#6BBF95','Meal prep']],
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
