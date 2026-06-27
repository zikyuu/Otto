import { useState } from 'react';

const API = import.meta.env.VITE_API ?? '';

export default function Settings({ planData, onSave, onStartOver }) {
  const [name, setName] = useState(planData?.profile?.name ?? '');
  const [freeHours, setFreeHours] = useState(planData?.profile?.free_hours_per_day ?? 3);
  const [resumeFile, setResumeFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  async function handleSave() {
    setLoading(true);
    setMsg('');
    try {
      let profile = { ...planData.profile, name: name.trim(), free_hours_per_day: freeHours };

      if (resumeFile) {
        setMsg('Parsing new resume…');
        const form = new FormData();
        form.append('file', resumeFile);
        const res = await fetch(`${API}/api/parse-resume-file`, { method: 'POST', body: form });
        if (!res.ok) throw new Error(`Resume parse failed (${res.status})`);
        const parsed = await res.json();
        profile = { ...profile, skills: parsed.skills };
        if (parsed.name && !name.trim()) setName(parsed.name);
      }

      setMsg('Rebuilding plan…');
      await onSave(profile);
      setMsg('');
    } catch (err) {
      setMsg(`Something went wrong: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '32px 44px 40px', animation: 'fadeIn .45s ease', maxWidth: 560 }}>
      <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 30, color: '#4A3526' }}>Profile & settings</div>
      <div style={{ fontSize: 14, color: '#8C7A64', marginTop: 3 }}>Changes here rebuild your plan automatically.</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 28 }}>

        {/* Name */}
        <div style={{ background: '#fff', border: '1px solid #ECE3D4', borderRadius: 20, padding: '20px 22px' }}>
          <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 15, color: '#4A3526', marginBottom: 10 }}>Your name</div>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="First name"
            style={{
              width: '100%', boxSizing: 'border-box', border: '1.5px solid #ECE3D4',
              borderRadius: 12, padding: '11px 14px', fontSize: 15,
              fontFamily: "'Quicksand'", fontWeight: 600, color: '#4A3526', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = '#A8703E'}
            onBlur={e => e.target.style.borderColor = '#ECE3D4'}
          />
        </div>

        {/* Hours */}
        <div style={{ background: '#fff', border: '1px solid #ECE3D4', borderRadius: 20, padding: '20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 15, color: '#4A3526' }}>Free hours per day</div>
            <span style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 24, color: '#A8703E' }}>{freeHours}h</span>
          </div>
          <input type="range" min={0.5} max={8} step={0.5} value={freeHours}
            onChange={e => setFreeHours(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#A8703E' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#B6A48C', marginTop: 6 }}>
            <span>0.5h</span><span>8h</span>
          </div>
        </div>

        {/* Resume re-upload (optional) */}
        <div style={{ background: '#fff', border: '1px solid #ECE3D4', borderRadius: 20, padding: '20px 22px' }}>
          <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 15, color: '#4A3526', marginBottom: 4 }}>Update résumé</div>
          <div style={{ fontSize: 13, color: '#AD9B84', marginBottom: 12 }}>Optional — only if your skills have changed.</div>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            border: `2px dashed ${resumeFile ? '#A8703E' : '#D9CAB2'}`,
            borderRadius: 14, padding: '14px 18px',
            background: resumeFile ? '#FBF4EC' : '#FBF8F4',
          }}>
            <span style={{ fontSize: 20 }}>{resumeFile ? '✓' : '📄'}</span>
            <span style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 14, color: resumeFile ? '#A8703E' : '#8C7A64' }}>
              {resumeFile ? resumeFile.name : 'Upload new PDF'}
            </span>
            <input type="file" accept=".pdf,.txt" onChange={e => setResumeFile(e.target.files[0] || null)} style={{ display: 'none' }} />
          </label>
          {resumeFile && (
            <div onClick={() => setResumeFile(null)} style={{ marginTop: 8, fontSize: 12, color: '#AD9B84', cursor: 'pointer' }}>
              × Remove
            </div>
          )}
        </div>

        {msg && (
          <div style={{ fontSize: 13, color: '#8C7A64', textAlign: 'center', fontStyle: 'italic' }}>{msg}</div>
        )}

        {/* Save */}
        <button onClick={handleSave} disabled={loading || !name.trim()} style={{
          padding: '14px 20px', borderRadius: 14, border: 'none',
          cursor: loading || !name.trim() ? 'not-allowed' : 'pointer',
          background: loading || !name.trim() ? '#E9DCC8' : 'linear-gradient(135deg,#C0894F,#A8703E)',
          color: loading || !name.trim() ? '#B6A48C' : '#fff',
          fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 16,
          boxShadow: loading || !name.trim() ? 'none' : '0 12px 22px -10px rgba(150,108,64,.5)',
        }}>
          {loading ? 'Rebuilding…' : 'Save & rebuild plan →'}
        </button>

        {/* Danger zone */}
        <div style={{ borderTop: '1px solid #ECE3D4', paddingTop: 20 }}>
          <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 15, color: '#4A3526', marginBottom: 6 }}>Start over</div>
          <div style={{ fontSize: 13, color: '#AD9B84', marginBottom: 12 }}>Clears your plan and takes you back to onboarding.</div>
          {!confirmReset ? (
            <div onClick={() => setConfirmReset(true)} style={{
              cursor: 'pointer', display: 'inline-block', fontSize: 13, fontWeight: 700,
              color: '#C7682E', border: '1.5px solid #F3DCB0', borderRadius: 11, padding: '9px 16px',
            }}>
              Reset everything
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div onClick={onStartOver} style={{
                cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff',
                background: '#C7682E', borderRadius: 11, padding: '9px 16px',
              }}>Yes, reset</div>
              <div onClick={() => setConfirmReset(false)} style={{
                cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#8C7A64',
              }}>Cancel</div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
