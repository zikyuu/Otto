import { useEffect, useState } from 'react';
import Mascot from './Mascot.jsx';
import { getMetrics } from '../api.js';
import { nudgeFor } from '../home/lunchNudge.js';
import { isoDate } from '../views/calendar/calendarUtils.js';

// A small reminder at lunch when a "move towards" target is set for the post-lunch slump. Shown once a day.
const KEY = 'otto.lunchNudge.v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private window */ } };

export default function LunchNudge() {
  const [data, setData] = useState(null);       // { target, current }
  const [nudge, setNudge] = useState(null);
  useEffect(() => {
    getMetrics().then(r => { const m = r.metrics.find(x => x.key === 'post_meal_slump_min'); setData({ target: r.targets?.post_meal_slump_min ?? null, current: m?.value ?? null }); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!data) return;
    const check = () => {
      const d = new Date(), st = read();
      setNudge(nudgeFor({ nowMin: d.getHours() * 60 + d.getMinutes(), today: isoDate(d), shownOn: st.shownOn, snoozedUntil: st.snoozedUntil || 0, ...data }));
    };
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, [data]);
  if (!nudge) return null;
  const done = later => {
    const d = new Date(), st = read();
    write(later ? { ...st, snoozedUntil: d.getHours() * 60 + d.getMinutes() + 30 } : { ...st, shownOn: isoDate(d) });
    setNudge(null);
  };
  return (
    <div role="status" style={{ position: 'absolute', right: 24, bottom: 24, zIndex: 80, width: 'min(340px, 90%)', animation: 'popIn .5s var(--spring) both' }}>
      <div className="bezel bezel--float"><div className="core" style={{ padding: '16px 18px', display: 'flex', gap: 12, alignItems: 'center' }}>
        <Mascot art="otter-eating" size={64} zoom={2.5} float />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.35 }}>{nudge.text}</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 4, lineHeight: 1.4 }}>{nudge.sub}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn--primary" onClick={() => done(false)} style={{ height: 32 }}>On it</button>
            <button className="btn btn--ghost" onClick={() => done(true)} style={{ height: 32 }}>In 30 min</button>
          </div>
        </div>
      </div></div>
    </div>
  );
}
