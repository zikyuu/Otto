// Pure allocation math for the event popup's subtask planner (no React).

export const MIN_SUB  = 5;    // smallest slice a subtask can be squeezed to (minutes)

// Split `amount` whole minutes across items in proportion to `weights`. The result always
// sums to exactly `amount` (largest-remainder rounding) — this is what keeps the subtask
// times adding up to the block with no stray "5m unplanned".
export function spread(weights, amount, floor = MIN_SUB) {
  const n = weights.length;
  if (n === 0) return [];
  const w = weights.map(x => Math.max(x, 0));
  const useFloor = amount >= floor * n;

  // Proportional shares; any slice that would fall under the floor is clamped to it and the
  // rest re-shared over what remains. (The floor must clamp, not add — adding skews ratios.)
  const clamped = Array(n).fill(false);
  for (let pass = 0; pass < n && useFloor; pass++) {
    const free = [...w.keys()].filter(i => !clamped[i]);
    const remaining = amount - floor * clamped.filter(Boolean).length;
    const wsum = free.reduce((a, i) => a + w[i], 0);
    let changed = false;
    free.forEach(i => {
      const share = wsum > 0 ? remaining * w[i] / wsum : remaining / free.length;
      if (share < floor) { clamped[i] = true; changed = true; }
    });
    if (!changed) break;
  }

  const free = [...w.keys()].filter(i => !clamped[i]);
  const pool = amount - floor * clamped.filter(Boolean).length;
  const wsum = free.reduce((a, i) => a + w[i], 0);
  const raw  = free.map(i => (wsum > 0 ? pool * w[i] / wsum : pool / free.length));
  const ints = raw.map(Math.floor);
  const left = pool - ints.reduce((a, b) => a + b, 0);
  raw.map((r, k) => [r - Math.floor(r), k]).sort((x, y) => y[0] - x[0])
     .slice(0, left).forEach(([, k]) => { ints[k] += 1; });

  const out = Array(n).fill(floor);
  free.forEach((i, k) => { out[i] = ints[k]; });
  return out;
}

// Re-fit the unpinned subtasks so everything adds up to T. Pinned ones keep their minutes.
export function refit(list, T) {
  const pinnedSum = list.filter(s => s.pinned).reduce((a, s) => a + s.mins, 0);
  const free = list.filter(s => !s.pinned);
  if (free.length === 0) return list;
  const mins = spread(free.map(s => s.mins), Math.max(T - pinnedSum, 0));
  let k = 0;
  return list.map(s => (s.pinned ? s : { ...s, mins: mins[k++] }));
}

// Block length typed at the top of the popup: "2h", "1h30", "1.5h", "90", "90m". A bare small
// number is read as hours ("2" -> 2h) because nobody means a 2-minute block.
export function parseDuration(str) {
  const t = String(str).trim().toLowerCase();
  if (!t) return 0;
  const hm = t.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(?:(\d+)\s*m?(?:in(?:s|utes?)?)?)?$/);
  if (hm) return Math.round(parseFloat(hm[1]) * 60 + (hm[2] ? parseInt(hm[2], 10) : 0));
  const m = t.match(/^(\d+(?:\.\d+)?)\s*m(?:in(?:s|utes?)?)?$/);
  if (m) return Math.round(parseFloat(m[1]));
  const bare = t.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) {
    const v = parseFloat(bare[1]);
    return Math.round(v <= 12 ? v * 60 : v);
  }
  return 0;
}
