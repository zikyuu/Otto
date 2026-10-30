// The lunch reminder. When the person has set a target for how long their post-lunch slump lasts ("try to move towards 15 minutes"),
// Otto reminds them around lunch, once a day. There is no lunch event to read, so lunch is the stretch from 12:30 to 15:00.

export const WINDOW = [12 * 60 + 30, 15 * 60];

// -> { text, sub } when a reminder is due, else null
export function nudgeFor({ nowMin, today, shownOn, snoozedUntil = 0, target, current }) {
  if (target == null || target <= 0) return null;
  if (shownOn === today) return null;
  if (nowMin < WINDOW[0] || nowMin >= WINDOW[1]) return null;
  if (nowMin < snoozedUntil) return null;
  return {
    text: `Freshen up!! You promised you would stop your doomscroll in ${target} min this time!`,
    sub: current != null && current > target ? `Your slump has been lasting about ${current} min. Today, aim for ${target}.` : `You are already close to ${target} min. Keep it up.`,
  };
}
