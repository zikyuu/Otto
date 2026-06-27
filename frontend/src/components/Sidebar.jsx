const NAV = [
  { key: 'now', icon: '◗', label: 'Now' },
  { key: 'calendar', icon: '▦', label: 'Calendar' },
  { key: 'goals', icon: '◎', label: 'Goals' },
  { key: 'stats', icon: '◔', label: 'Stats' },
];

import { supabase } from '../lib/supabase.js';

export default function Sidebar({ lens, setLens, userName, feasible }) {
  async function logout() {
    await supabase.auth.signOut();
  }
  return (
    <div style={{
      flex: '0 0 244px',
      background: 'linear-gradient(180deg,#F5EEE1,#F1E8D7)',
      borderRight: '1px solid #E9DECC',
      display: 'flex', flexDirection: 'column',
      padding: '24px 18px',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 6px' }}>
        <OtterLogo />
        <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 21, color: '#4A3526' }}>meatballs</div>
      </div>

      {/* Nav */}
      <nav style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {NAV.map(({ key, icon, label }) => {
          const active = lens === key;
          return (
            <div key={key} onClick={() => setLens(key)} style={{
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 15,
              fontFamily: "'Quicksand'", fontWeight: 600, fontSize: 16,
              ...(active
                ? { background: '#fff', color: '#A8703E', boxShadow: '0 6px 14px -8px rgba(150,108,64,.6)' }
                : { color: '#8C7A64', background: 'transparent' }),
            }}>
              <span style={{ fontSize: 17 }}>{icon}</span> {label}
            </div>
          );
        })}
      </nav>

      <div style={{ flex: 1 }} />

      {/* User card */}
      <div style={{
        background: '#fff', borderRadius: 18, padding: 14,
        boxShadow: '0 8px 20px -14px rgba(74,54,38,.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'linear-gradient(135deg,#C49B6E,#A8703E)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Quicksand'", fontWeight: 700,
          }}>{(userName?.[0] ?? '?').toUpperCase()}</div>
          <div>
            <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 15, color: '#4A3526' }}>{userName ?? '—'}</div>
            <div style={{ fontSize: 11, color: '#AD9B84' }}>Free plan</div>
          </div>
        </div>
        <div style={{
          marginTop: 11, display: 'flex', alignItems: 'center', gap: 8,
          background: feasible === false ? '#FBEFD9' : '#E2F2EA',
          borderRadius: 11, padding: '8px 10px',
        }}>
          <div style={{
            width: 9, height: 9, borderRadius: '50%',
            background: feasible === false ? '#ECA94E' : '#6BBF95',
            animation: 'pulseDot 2.2s infinite',
          }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: feasible === false ? '#D8923A' : '#4FA77D' }}>
            {feasible === false ? 'Week is tight' : 'On track this week'}
          </span>
        </div>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between' }}>
          <span onClick={() => setLens('settings')} style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#C9B89A' }}>
            Edit profile
          </span>
          <span onClick={logout} style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#C9B89A' }}>
            Sign out
          </span>
        </div>
      </div>
    </div>
  );
}

function OtterLogo() {
  return (
    <div style={{ position: 'relative', width: 42, height: 40, flex: '0 0 auto' }}>
      <div style={{ position:'absolute', top:4, left:6, width:13, height:13, borderRadius:'50%', background:'#9A6440' }} />
      <div style={{ position:'absolute', top:4, right:6, width:13, height:13, borderRadius:'50%', background:'#9A6440' }} />
      <div style={{ position:'absolute', top:7, left:11, right:11, bottom:0, borderRadius:'50%', background:'radial-gradient(120% 110% at 50% 20%,#B27C53,#9A6440)' }} />
      <div style={{ position:'absolute', bottom:3, left:12, right:12, height:18, borderRadius:'50%', background:'#F0D6B0' }} />
      <div style={{ position:'absolute', top:18, left:13, width:7, height:5, border:'2px solid #3A2A1E', borderTop:'none', borderRadius:'0 0 8px 8px' }} />
      <div style={{ position:'absolute', top:18, right:13, width:7, height:5, border:'2px solid #3A2A1E', borderTop:'none', borderRadius:'0 0 8px 8px' }} />
      <div style={{ position:'absolute', bottom:6, left:'50%', transform:'translateX(-50%)', width:15, height:15, borderRadius:'50%', background:'radial-gradient(circle at 36% 30%,#8A5630,#5E3620)', zIndex:3 }} />
    </div>
  );
}
