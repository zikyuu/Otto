
const NAV = [
  { key: 'now', icon: '◗', label: 'Now' },
  { key: 'calendar', icon: '▦', label: 'Calendar' },
  { key: 'goals', icon: '◎', label: 'Goals' },
  { key: 'stats', icon: '◔', label: 'Stats' },
];

export default function Sidebar({ lens, setLens }) {
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
        <div style={{ fontFamily: "'Quicksand'", fontWeight: 800, fontSize: 24, color: '#4A3526', letterSpacing: '-0.5px' }}>OTTO</div>
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
          }}>Y</div>
          <div>
            <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 15, color: '#4A3526' }}>Yuki</div>
            <div style={{ fontSize: 11, color: '#AD9B84' }}>Free plan</div>
          </div>
        </div>
        <div style={{
          marginTop: 11, display: 'flex', alignItems: 'center', gap: 8,
          background: '#E2F2EA', borderRadius: 11, padding: '8px 10px',
        }}>
          <div style={{
            width: 9, height: 9, borderRadius: '50%', background: '#6BBF95',
            animation: 'pulseDot 2.2s infinite',
          }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#4FA77D' }}>Slightly ahead this week</span>
        </div>
      </div>
    </div>
  );
}
