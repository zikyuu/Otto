import { useState, useEffect, useRef } from 'react';
import Mascot from './Mascot.jsx';
import { art } from '../assets/otto/index.js';
import { authRequired, currentUser, signOut } from '../auth.js';
import { IconNow, IconCalendar, IconGoals, IconStats, IconRules, IconPriority, IconLeaf } from '../views/calendar/Icons.jsx';

const NAV = [
  { key: 'now',      Icon: IconNow,      label: 'Now'      },
  { key: 'calendar', Icon: IconCalendar, label: 'Calendar' },
  { key: 'goals',    Icon: IconGoals,    label: 'Goals'    },
  { key: 'stats',    Icon: IconStats,    label: 'Stats'    },
  { key: 'priorities', Icon: IconPriority, label: 'Priorities' },
  { key: 'rules',    Icon: IconRules,    label: 'Rules'    },
];

const OPEN_W = 232, SHUT_W = 76;
const soft = (open) => ({ maxWidth: open ? 150 : 0, opacity: open ? 1 : 0, overflow: 'hidden', whiteSpace: 'nowrap', transition: 'max-width .2s var(--ease), opacity .15s var(--ease)' });

// A floating forest-green panel. Collapsed to icons by default; clicking it opens it.
export default function Sidebar({ lens, setLens }) {
  const [expanded, setExpanded] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!expanded) return;
    const outside = e => { if (ref.current && !ref.current.contains(e.target)) setExpanded(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [expanded]);

  return (
    <aside
      ref={ref}
      onClick={() => !expanded && setExpanded(true)}
      style={{
        flex: `0 0 ${expanded ? OPEN_W : SHUT_W}px`, width: expanded ? OPEN_W : SHUT_W,
        margin: 14, borderRadius: 30, overflow: 'hidden', position: 'relative',
        background: 'linear-gradient(180deg, #3B4D32 0%, #33432B 55%, #2A3724 100%)',
        boxShadow: 'inset 0 1px 0 rgba(244,236,216,.12), 0 0 0 1px rgba(32,40,8,.5), 0 30px 50px -28px rgba(32,40,8,.75)',
        display: 'flex', flexDirection: 'column', padding: expanded ? '20px 14px 14px' : '20px 10px 14px',
        transition: 'flex-basis .22s var(--ease), width .22s var(--ease), padding .22s var(--ease)',
        cursor: expanded ? 'default' : 'pointer', userSelect: 'none', zIndex: 10,
      }}
    >
      {/* wooden sign */}
      <div className="plaque" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: expanded ? 56 : 48,
        marginBottom: 26, padding: '0 6px', transition: 'height .2s var(--ease)',
      }}>
        {art('logo-mark') && !art('logo-mark').placeholder
          ? <img src={art('logo-mark').src} alt="" style={{ width: expanded ? 26 : 30, height: expanded ? 26 : 30, objectFit: 'contain' }} />
          : <IconLeaf size={expanded ? 18 : 20} style={{ color: '#E4EAD3' }} />}
        <span style={{ fontSize: 22, fontWeight: 600, ...soft(expanded) }}>Otto</span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-label="Main">
        {NAV.map(({ key, Icon, label }) => {
          const active = lens === key;
          return (
            <button
              key={key}
              aria-current={active ? 'page' : undefined}
              title={!expanded ? label : undefined}
              onClick={e => { e.stopPropagation(); if (!expanded) setExpanded(true); else { setLens(key); setExpanded(false); } }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: expanded ? 'flex-start' : 'center', gap: 12,
                height: 38, padding: expanded ? '0 12px' : 0, border: 0, borderRadius: 6, cursor: 'pointer',
                fontSize: 14, fontWeight: 500, textAlign: 'left',
                background: active ? '#EFE5CF' : 'transparent', color: active ? 'var(--ink)' : 'var(--ink-3)',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <Icon size={18} />
              <span style={soft(expanded)}>{label}</span>
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      {/* the otter keeps an eye on the week */}
      <div style={{
        position: 'relative', borderRadius: 22, background: 'rgba(244,236,216,.08)', border: '1px solid rgba(244,236,216,.12)',
        padding: expanded ? '14px 12px 12px' : '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden',
        transition: 'padding .2s var(--ease)',
      }}>
        <Mascot art="otter-reading" alt="Otto the otter" size={expanded ? 124 : 44} zoom={expanded ? 3.1 : 3.4} style={{ transition: 'width .5s var(--ease), height .5s var(--ease)' }} />
        <div style={{ ...soft(expanded), maxWidth: expanded ? 190 : 0, textAlign: 'center', marginTop: expanded ? 6 : 0, maxHeight: expanded ? 80 : 0 }}>
          <div className="display" style={{ fontSize: 15, color: '#F6EFE0' }}>{currentUser()?.name?.split(' ')[0] || 'Yuki'}</div>
          <div style={{ fontSize: 12, color: 'rgba(244,236,216,.7)', marginTop: 2 }}>Slightly ahead this week</div>
        </div>
      </div>

      {authRequired() && expanded && currentUser() && (
        <div style={{ marginTop: 10, textAlign: 'center' }}>
          <div style={{ fontSize: 11.5, color: 'rgba(244,236,216,.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentUser().email}</div>
          <button onClick={e => { e.stopPropagation(); signOut(); }} style={{ marginTop: 6, height: 30, padding: '0 14px', borderRadius: 999, border: '1px solid rgba(244,236,216,.25)', background: 'transparent', color: '#F6EFE0', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>Sign out</button>
        </div>
      )}
    </aside>
  );
}
