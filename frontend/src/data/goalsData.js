// Demo goals for the tracker. Dates are relative to today so the page always looks lived-in:
// one goal ahead, one on track, one behind, one at risk, one out of reach.
import { addDays } from '../views/goals/goalMath.js';

export const todayIso = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function demoGoals(today = todayIso()) {
  const r = n => addDays(today, n);
  const m = (id, title, effort_h, due, extra = {}) => ({ id, title, effort_h, due: r(due), done: false, ...extra });
  const done = (id, title, effort_h, due, doneOn) => m(id, title, effort_h, due, { done: true, done_on: r(doneOn) });
  const subs = (...items) => items.map(([t, d], i) => ({ id: i + 1, t, done: d }));

  return [
    {
      id: 'rag', title: 'Ship a production RAG app', cat: 'LLM engineering', start: r(-49), target: r(35), hours_per_week: 8,
      recent_focus: 'Python syntax drills and general tutorials; little on retrieval quality or evals.',
      milestones: [
        done('rag1', 'Finish Karpathy "Let\'s build GPT"', 6, -35, -37),
        done('rag2', 'Build a toy chatbot on the OpenAI API', 5, -21, -22),
        m('rag3', 'Add embeddings + vector search (pgvector)', 8, -7, { subtasks: subs(['Set up pgvector', true], ['Chunk and embed the docs', true], ['Similarity search endpoint', false], ['Check recall on 20 queries', false]) }),
        m('rag4', 'Build the retrieval pipeline', 10, 14),
        m('rag5', 'Write evals and deploy to a live URL', 8, 35),
      ],
      detours: [{ date: r(-12), type: 'sidetrack', text: 'A week on Python syntax and unrelated tutorials', impact_days: 5 }],
    },
    {
      id: 'sd', title: 'Pass a system-design interview', cat: 'Skill gap', start: r(-21), target: r(14), hours_per_week: 4,
      recent_focus: 'Memorising component lists; not practising tradeoff reasoning out loud.',
      milestones: [
        done('sd1', 'Read "System Design Interview" ch. 1-3', 4, -14, -15),
        m('sd2', 'Design a URL shortener (write-up + diagram)', 5, -3),
        m('sd3', 'Caching, load balancing, sharding', 6, 4),
        m('sd4', '2 mock system-design interviews', 5, 12),
      ],
      detours: [{ date: r(-9), type: 'roadblock', text: 'Laptop died, a week without practice', impact_days: 7 }],
    },
    {
      id: 'lc', title: 'Finish Blind 75', cat: 'Interview prep', start: r(-60), target: r(45), hours_per_week: 6,
      recent_focus: 'Steady daily problems; leaning on arrays more than trees and DP.',
      milestones: [
        done('lc1', 'Arrays and hashing (9 problems)', 6, -40, -41),
        done('lc2', 'Two pointers (5 problems)', 4, -28, -29),
        done('lc3', 'Sliding window (6 problems)', 4, -12, -13),
        m('lc4', 'Trees + BFS/DFS (11 problems)', 8, 3, { subtasks: subs(['Tree traversals', true], ['Max depth and diameter', true], ['Level order', true], ['Validate BST', false], ['Lowest common ancestor', false]) }),
        m('lc5', 'Dynamic programming (12 problems)', 10, 24),
        m('lc6', 'One timed mock set', 3, 45),
      ],
      detours: [],
    },
    {
      id: 'fit', title: '72 kg to 67 kg', cat: 'Wellbeing', start: r(-40), target: r(50), hours_per_week: 3,
      recent_focus: 'Gym three times a week, logging meals most days.',
      milestones: [
        done('f1', '8k steps a day for two weeks', 2, -26, -26),
        done('f2', 'Gym 3x a week for a month', 6, -5, -6),
        done('f3', 'Log every meal for four weeks', 4, 10, -3),
        m('f4', 'Sunday meal-prep routine', 2, 25),
        m('f5', 'Reach 70 kg', 4, 50),
      ],
      detours: [],
    },
    {
      id: 'reel', title: 'Edit and publish 5 reels', cat: 'Creative', start: r(-30), target: r(30), hours_per_week: 3,
      recent_focus: 'Re-editing the same first reel over and over.',
      milestones: [
        done('r1', 'DaVinci Resolve beginner course', 6, -20, -21),
        m('r2', 'Edit and post the first 60-second reel', 4, -8),
        m('r3', 'Colour-grading basics', 3, 5),
        m('r4', 'Transitions and motion graphics', 3, 15),
        m('r5', 'Publish reels 2 to 5', 6, 30),
      ],
      detours: [{ date: r(-6), type: 'pivot', text: 'Switched to vertical-first editing', impact_days: 2 }],
    },
  ];
}
