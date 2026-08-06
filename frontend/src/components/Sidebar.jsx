import { useState, useEffect, useRef } from 'react';
import mainLogo from '../assets/mascots/main logo.png';

const NAV = [
  { key: 'now',      icon: '◗', label: 'Now'      },
  { key: 'calendar', icon: '▦', label: 'Calendar' },
  { key: 'goals',    icon: '◎', label: 'Goals'    },
  { key: 'stats',    icon: '◔', label: 'Stats'    },
];

export default function Sidebar({ lens, setLens }) {
  const [expanded, setExpanded] = useState(false);
  const ref = useRef(null);

  // collapse when user clicks outside the sidebar
  useEffect(() => {
    if (!expanded) return;
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setExpanded(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [expanded]);

  function handleNavClick(key) {
    setLens(key);
    setExpanded(false); // collapse after picking a page
  }

  return (
    <div
      ref={ref}
      onClick={() => !expanded && setExpanded(true)}
      style={{
        flex: `0 0 ${expanded ? 220 : 64}px`,
        width: expanded ? 220 : 64,
        background: 'linear-gradient(180deg,#F5EEE1,#F1E8D7)',
        borderRight: '1px solid #E9DECC',
        display: 'flex', flexDirection: 'column',
        padding: expanded ? '22px 16px' : '22px 10px',
        transition: 'flex-basis .22s ease, width .22s ease, padding .22s ease',
        overflow: 'hidden',
        cursor: expanded ? 'default' : 'pointer',
        userSelect: 'none',
        zIndex: 10,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: expanded ? 10 : 0, padding: '0 3px', marginBottom: 28 }}>
        <img
          src={mainLogo}
          alt="OTTO logo"
          style={{ width: 40, height: 40, objectFit: 'contain', flex: '0 0 auto' }}
        />
        <span style={{
          fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 20, color: '#4A3526',
          whiteSpace: 'nowrap',
          maxWidth: expanded ? 120 : 0,
          opacity: expanded ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-width .2s ease, opacity .18s ease',
        }}>
          OTTO
        </span>
      </div>

      {/* Nav items */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {NAV.map(({ key, icon, label }) => {
          const active = lens === key;
          return (
            <div
              key={key}
              onClick={e => { e.stopPropagation(); if (!expanded) { setExpanded(true); } else { handleNavClick(key); } }}
              title={!expanded ? label : undefined}
              style={{
                cursor: 'pointer',
                display: 'flex', alignItems: 'center',
                justifyContent: expanded ? 'flex-start' : 'center',
                gap: 12,
                padding: expanded ? '11px 13px' : '11px 0',
                borderRadius: 13,
                fontFamily: "'Quicksand'", fontWeight: 600, fontSize: 15,
                transition: 'padding .2s ease, background .15s ease',
                ...(active
                  ? { background: '#fff', color: '#A8703E', boxShadow: '0 4px 12px -6px rgba(150,108,64,.55)' }
                  : { color: '#8C7A64', background: 'transparent' }),
              }}
            >
              <span style={{ fontSize: 17, flex: '0 0 auto' }}>{icon}</span>
              <span style={{
                whiteSpace: 'nowrap', overflow: 'hidden',
                maxWidth: expanded ? 120 : 0,
                opacity: expanded ? 1 : 0,
                transition: 'max-width .2s ease, opacity .15s ease',
              }}>
                {label}
              </span>
            </div>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      {/* User card */}
      <div style={{
        background: '#fff', borderRadius: 16,
        padding: expanded ? 13 : '10px 0',
        boxShadow: '0 6px 18px -12px rgba(74,54,38,.4)',
        display: 'flex', flexDirection: 'column',
        alignItems: expanded ? 'stretch' : 'center',
        overflow: 'hidden',
        transition: 'padding .2s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: expanded ? 9 : 0, justifyContent: expanded ? 'flex-start' : 'center' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', flex: '0 0 auto',
            background: 'linear-gradient(135deg,#C49B6E,#A8703E)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 14,
          }}>Y</div>
          <div style={{
            overflow: 'hidden',
            maxWidth: expanded ? 120 : 0,
            opacity: expanded ? 1 : 0,
            transition: 'max-width .2s ease, opacity .15s ease',
            whiteSpace: 'nowrap',
          }}>
            <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 14, color: '#4A3526' }}>Yuki</div>
            <div style={{ fontSize: 10, color: '#AD9B84' }}>Free plan</div>
          </div>
        </div>

        <div style={{
          overflow: 'hidden',
          maxHeight: expanded ? 48 : 0,
          opacity: expanded ? 1 : 0,
          transition: 'max-height .2s ease, opacity .15s ease',
          marginTop: expanded ? 10 : 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: '#E2F2EA', borderRadius: 10, padding: '7px 9px',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6BBF95', animation: 'pulseDot 2.2s infinite', flex: '0 0 auto' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#4FA77D' }}>Slightly ahead this week</span>
          </div>
        </div>
      </div>
    </div>
  );
}
