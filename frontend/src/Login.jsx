import { useState } from 'react';
import Mascot from './components/Mascot.jsx';
import { signInWithGoogle } from './auth.js';

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true); setError('');
    try { await signInWithGoogle(); }                       // leaves the page for Google, then comes back signed in
    catch (e) { setError(e.message || 'Could not start sign-in.'); setBusy(false); }
  }
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--app-bg)' }}>
      <div className="bezel bezel--float" style={{ width: 'min(420px,100%)' }}>
        <div className="core" style={{ padding: '34px 32px 30px', textAlign: 'center' }}>
          <Mascot art="otter-reading" size={120} zoom={2.5} float />
          <h1 className="display" style={{ margin: '14px 0 6px', fontSize: 30 }}>Otto</h1>
          <p style={{ margin: 0, fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>Your week, rebuilt the moment life gets in the way.</p>
          <button className="btn btn--primary" onClick={go} disabled={busy} style={{ marginTop: 24, height: 46, width: '100%', justifyContent: 'center', fontSize: 14.5 }}>
            {busy ? 'Opening Google…' : 'Continue with Google'}
          </button>
          {error && <p role="alert" style={{ margin: '14px 0 0', fontSize: 13, color: '#A5543F' }}>{error}</p>}
          <p style={{ margin: '18px 0 0', fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.5 }}>Your calendar and goals are saved to your account and only you can see them.</p>
        </div>
      </div>
    </div>
  );
}
