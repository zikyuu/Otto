import { useEffect, useState } from 'react';
import App from './App.jsx';
import Login from './Login.jsx';
import Mascot from './components/Mascot.jsx';
import { loadAuthConfig, startAuth, authRequired } from './auth.js';
import { prepareLocalData } from './authLogic.js';

// Decides what to show before the app: with login off, the app; with it on, the sign-in screen until there is a session.
// The app is keyed by the signed-in person so a different sign-in starts from a clean slate.
export default function Gate() {
  const [phase, setPhase] = useState('checking');
  const [uid, setUid] = useState(null);

  useEffect(() => {
    let live = true;
    const apply = session => {
      if (!live) return;
      if (!session) { setUid(null); setPhase('login'); return; }
      try { prepareLocalData(localStorage, session.user.id); } catch { /* storage unavailable */ }
      setUid(session.user.id); setPhase('app');
    };
    (async () => {
      await loadAuthConfig();
      if (!authRequired()) { if (live) setPhase('app'); return; }
      apply(await startAuth(apply));
    })();
    return () => { live = false; };
  }, []);

  if (phase === 'checking') {
    return <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--app-bg)' }}><Mascot art="otter-reading" size={110} zoom={2.5} float /></div>;
  }
  if (phase === 'login') return <Login />;
  return <App key={uid || 'local'} />;
}
