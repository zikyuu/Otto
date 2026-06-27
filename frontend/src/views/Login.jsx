import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

const sleepyImg = '/mascots/sleepy.png';

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSent(true);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onLogin(data.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(150deg, #F3EBDC 0%, #F5EEE1 50%, #FBF1EC 100%)',
      padding: '24px 16px',
    }}>
      <div style={{ width: 'min(420px, 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 38, color: '#4A3526', letterSpacing: '-0.5px' }}>
            Otto
          </div>
          <div style={{ fontSize: 15, color: '#8C7A64', marginTop: 4 }}>
            the job becomes your plan
          </div>
        </div>

        {/* Card */}
        <div style={{
          width: '100%', background: '#fff', borderRadius: 26, padding: '32px 28px',
          boxShadow: '0 40px 80px -30px rgba(74,54,38,.3)',
          border: '1px solid #ECE3D4',
        }}>
          {sent ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📬</div>
              <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 20, color: '#4A3526', marginBottom: 8 }}>
                Check your email
              </div>
              <div style={{ fontSize: 14, color: '#8C7A64', lineHeight: 1.6 }}>
                We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then come back and log in.
              </div>
              <button onClick={() => { setSent(false); setMode('login'); }}
                style={{ marginTop: 20, fontSize: 14, fontWeight: 700, color: '#A8703E', background: 'none', border: 'none', cursor: 'pointer' }}>
                Back to login →
              </button>
            </div>
          ) : (
            <>
              {/* Tab toggle */}
              <div style={{ display: 'flex', background: '#F5EEE1', borderRadius: 12, padding: 4, marginBottom: 24 }}>
                {['login', 'signup'].map(m => (
                  <button key={m} onClick={() => { setMode(m); setError(''); }}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                      fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 14,
                      background: mode === m ? '#fff' : 'transparent',
                      color: mode === m ? '#A8703E' : '#AD9B84',
                      boxShadow: mode === m ? '0 4px 10px -6px rgba(150,108,64,.4)' : 'none',
                      transition: 'all .15s ease',
                    }}>
                    {m === 'login' ? 'Log in' : 'Sign up'}
                  </button>
                ))}
              </div>

              <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#4A3526', marginBottom: 6 }}>
                    Email
                  </label>
                  <input
                    type="email" required value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={{
                      width: '100%', padding: '11px 14px', borderRadius: 10, fontSize: 14,
                      border: '1.5px solid #ECE3D4', outline: 'none', boxSizing: 'border-box',
                      fontFamily: 'inherit', color: '#4A3526',
                      transition: 'border-color .15s',
                    }}
                    onFocus={e => e.target.style.borderColor = '#A8703E'}
                    onBlur={e => e.target.style.borderColor = '#ECE3D4'}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#4A3526', marginBottom: 6 }}>
                    Password
                  </label>
                  <input
                    type="password" required value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="········"
                    style={{
                      width: '100%', padding: '11px 14px', borderRadius: 10, fontSize: 14,
                      border: '1.5px solid #ECE3D4', outline: 'none', boxSizing: 'border-box',
                      fontFamily: 'inherit', color: '#4A3526',
                      transition: 'border-color .15s',
                    }}
                    onFocus={e => e.target.style.borderColor = '#A8703E'}
                    onBlur={e => e.target.style.borderColor = '#ECE3D4'}
                  />
                </div>

                {error && (
                  <div style={{ fontSize: 13, color: '#C7682E', background: '#F7E9DF', borderRadius: 8, padding: '9px 12px' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} style={{
                  marginTop: 4, padding: '13px 0', borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: loading ? '#D4B896' : 'linear-gradient(135deg, #C0894F, #A8703E)',
                  color: '#fff', fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 16,
                  boxShadow: '0 12px 22px -10px rgba(150,108,64,.6)',
                  transition: 'opacity .15s',
                }}>
                  {loading ? 'Just a moment…' : mode === 'login' ? 'Log in →' : 'Create account →'}
                </button>
              </form>
            </>
          )}
        </div>

        <div style={{ fontSize: 12, color: '#B6A48C', textAlign: 'center' }}>
          Your plan lives here. No pressure.
        </div>
      </div>
    </div>
  );
}
