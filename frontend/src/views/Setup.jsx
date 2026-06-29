import { useState, useEffect, useRef } from 'react';

const wiseImg = '/mascots/wise.png';

export default function Setup({ onComplete, userId }) {
  const [step, setStep] = useState(0); // 0 = resume, 1 = job, 2 = hours, 3 = telegram
  const [resumeReady, setResumeReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [jd, setJd] = useState('');
  const [freeHours, setFreeHours] = useState(3);
  const [loading, setLoading] = useState(false);
  const [buildMsg, setBuildMsg] = useState('');
  const [error, setError] = useState('');
  const [profileId, setProfileId] = useState(null);
  const [builtData, setBuiltData] = useState(null);

  const API = import.meta.env.VITE_API ?? '';

  async function handleResumeFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API}/api/parse-resume-file`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const p = await res.json();
      setProfile(p);
      if (p.name) setName(p.name);
      setResumeReady(true);
    } catch (err) {
      setError(`Couldn't parse resume: ${err.message}. Is the backend running?`);
    } finally {
      setLoading(false);
    }
  }

  async function build() {
    setLoading(true);
    setBuildMsg('Reading your JD…');
    try {
      const p = { ...profile, free_hours_per_day: freeHours, walls: [], name: name.trim() };
      const g = await fetch(`${API}/api/goal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_text: jd, goal_id: 'job1' }),
      }).then(r => r.json());

      setBuildMsg('Running the engine…');
      const result = await fetch(`${API}/api/plan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: p, goals: [g], user_id: userId || '' }),
      }).then(r => r.json());

      setBuildMsg('');
      const data = { profile: p, goal: g, tasks: result.tasks, blocks: result.plan.blocks, plan: result.plan };
      setBuiltData(data);
      if (result.profile_id) setProfileId(result.profile_id);
      setStep(3);
    } catch (err) {
        setBuildMsg(`Something went wrong: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  const STEPS = [
    { label: 'Resume', icon: '◎' },
    { label: 'Job', icon: '◗' },
    { label: 'Time', icon: '◔' },
    { label: 'Telegram', icon: '✈' },
  ];

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(150deg,#F3EBDC 0%,#F5EEE1 50%,#FBF1EC 100%)',
      padding: '24px 16px',
    }}>
      <div style={{ width: 'min(520px,100%)', display: 'flex', flexDirection: 'column', gap: 28, alignItems: 'center' }}>

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 34, color: '#4A3526', letterSpacing: '-0.5px' }}>
            Let's build your plan
          </div>
          <div style={{ fontSize: 15, color: '#8C7A64', marginTop: 5 }}>
            Four quick things and Otto handles the rest.
          </div>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          {STEPS.map((s, i) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 13,
                background: i < step ? '#A8703E' : i === step ? '#fff' : '#F1E8D7',
                color: i < step ? '#fff' : i === step ? '#A8703E' : '#B6A48C',
                border: i === step ? '2px solid #A8703E' : '2px solid transparent',
                boxShadow: i === step ? '0 6px 16px -8px rgba(168,112,62,.5)' : 'none',
                transition: 'all .2s ease',
              }}>
                {i < step ? '✓' : s.icon}
              </div>
              <div style={{ fontFamily: "'Quicksand'", fontWeight: 600, fontSize: 13, color: i === step ? '#4A3526' : '#B6A48C', margin: '0 6px', transition: 'color .2s' }}>
                {s.label}
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 28, height: 2, background: i < step ? '#A8703E' : '#E9DCC8', borderRadius: 2, margin: '0 6px', transition: 'background .2s' }} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div style={{
          width: '100%', background: '#fff', borderRadius: 26, padding: '32px 30px',
          boxShadow: '0 40px 80px -30px rgba(74,54,38,.28)', border: '1px solid #ECE3D4',
        }}>

          {/* Step 0 — Resume */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <SectionHead icon="◎" title="Upload your résumé" sub="PDF or plain text — Otto reads it so you don't have to fill out a form." />
              <label style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 10, cursor: 'pointer', border: `2px dashed ${resumeReady ? '#A8703E' : '#D9CAB2'}`,
                borderRadius: 18, padding: '32px 24px', textAlign: 'center',
                background: resumeReady ? '#FBF4EC' : '#FBF8F4', transition: 'all .2s ease',
              }}>
                <div style={{ fontSize: 32 }}>{resumeReady ? '✓' : '📄'}</div>
                <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 17, color: resumeReady ? '#A8703E' : '#4A3526' }}>
                  {loading ? 'Parsing…' : resumeReady ? 'Resume parsed' : 'Drop your PDF here'}
                </div>
                {!resumeReady && <div style={{ fontSize: 13, color: '#AD9B84' }}>or click to browse</div>}
                <input type="file" accept=".pdf,.txt" onChange={handleResumeFile} style={{ display: 'none' }} />
              </label>
              {resumeReady && (
                <div style={{ background: '#E2F2EA', borderRadius: 14, padding: '12px 16px', fontSize: 14, color: '#4FA77D', fontWeight: 600 }}>
                  ✓ Got it — {profile?.skills?.length ?? 0} skills detected
                </div>
              )}
              {resumeReady && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#8C7A64', marginBottom: 7 }}>What should Otto call you?</div>
                  <input
                    value={name} onChange={e => setName(e.target.value)}
                    placeholder="Your first name"
                    style={{
                      width: '100%', boxSizing: 'border-box', border: '1.5px solid #ECE3D4',
                      borderRadius: 12, padding: '11px 14px', fontSize: 15,
                      fontFamily: "'Quicksand'", fontWeight: 600, color: '#4A3526', outline: 'none',
                    }}
                    onFocus={e => e.target.style.borderColor = '#A8703E'}
                    onBlur={e => e.target.style.borderColor = '#ECE3D4'}
                  />
                </div>
              )}
              {error && (
                <div style={{ background: '#F7E9DF', border: '1px solid #F3DCB0', borderRadius: 14, padding: '12px 16px', fontSize: 13, color: '#C7682E' }}>
                  {error}
                </div>
              )}
              <NavRow
                next={{ label: 'Next →', disabled: !resumeReady || !name.trim(), onClick: () => setStep(1) }}
              />
            </div>
          )}

          {/* Step 1 — JD */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <SectionHead icon="◗" title="The job you want" sub="Paste the job description. Otto extracts the skills and what the interview actually tests." />
              <textarea
                rows={7} value={jd} onChange={e => setJd(e.target.value)}
                placeholder="Paste the full job description here…"
                style={{
                  width: '100%', boxSizing: 'border-box', border: '1.5px solid #ECE3D4', borderRadius: 14,
                  padding: '14px 16px', fontSize: 13, lineHeight: 1.6, resize: 'vertical',
                  fontFamily: 'inherit', color: '#4A3526', outline: 'none',
                  transition: 'border-color .15s',
                }}
                onFocus={e => e.target.style.borderColor = '#A8703E'}
                onBlur={e => e.target.style.borderColor = '#ECE3D4'}
              />
              <NavRow
                back={{ onClick: () => setStep(0) }}
                next={{ label: 'Next →', disabled: jd.trim().length < 20, onClick: () => setStep(2) }}
              />
            </div>
          )}

          {/* Step 2 — Hours + build */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <SectionHead icon="◔" title="How much time do you have?" sub="Honest hours per day — Otto won't overpack your week." />

              <div style={{ background: '#FBF4EC', borderRadius: 18, padding: '22px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                  <span style={{ fontFamily: "'Quicksand'", fontWeight: 600, fontSize: 15, color: '#4A3526' }}>Free hours per day</span>
                  <span style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 26, color: '#A8703E' }}>{freeHours}h</span>
                </div>
                <input type="range" min={0.5} max={8} step={0.5} value={freeHours}
                  onChange={e => setFreeHours(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#A8703E' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#B6A48C', marginTop: 6 }}>
                  <span>0.5h</span><span>8h</span>
                </div>
              </div>

              {buildMsg && (
                <div style={{ fontSize: 13, color: '#8C7A64', textAlign: 'center', fontStyle: 'italic' }}>{buildMsg}</div>
              )}

              <NavRow
                back={{ onClick: () => setStep(1) }}
                next={{
                  label: loading ? 'Building your plan…' : 'Build my plan →',
                  disabled: loading,
                  primary: true,
                  onClick: build,
                }}
              />
            </div>
          )}
          {/* Step 3 — Telegram (compulsory) */}
          {step === 3 && (
            <TelegramStep
              profileId={profileId}
              userId={userId}
              api={API}
              onLinked={() => onComplete(builtData)}
            />
          )}
        </div>

        <div style={{ fontSize: 12, color: '#B6A48C' }}>No fluff. Just the next thing to do.</div>
      </div>
    </div>
  );
}

function SectionHead({ icon, title, sub }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 18, color: '#A8703E' }}>{icon}</span>
        <span style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 20, color: '#4A3526' }}>{title}</span>
      </div>
      <div style={{ fontSize: 14, color: '#8C7A64', lineHeight: 1.5, paddingLeft: 28 }}>{sub}</div>
    </div>
  );
}

function TelegramStep({ profileId, userId, api, onLinked }) {
  const [linked, setLinked] = useState(false);
  const [opened, setOpened] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!userId || linked) return;
    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${api}/api/me/telegram-status?user_id=${userId}`);
        const data = await res.json();
        if (data.linked) {
          setLinked(true);
          clearInterval(intervalRef.current);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(intervalRef.current);
  }, [userId, linked, api]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <SectionHead icon="✈" title="Connect Telegram" sub="Link your Telegram so Otto can nudge you when you fall behind." />

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        background: linked ? '#E2F2EA' : '#FBF4EC', borderRadius: 18, padding: '28px 24px', textAlign: 'center',
        transition: 'background .3s ease',
      }}>
        <div style={{ fontSize: 48 }}>{linked ? '✅' : '🤖'}</div>
        <div style={{ fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 16, color: '#4A3526' }}>
          {linked ? 'Telegram linked!' : 'Otto will message you when you\'re behind schedule'}
        </div>
        <div style={{ fontSize: 13, color: '#8C7A64', lineHeight: 1.6 }}>
          {linked
            ? 'You\'re all set — Otto will send you nudges with your top priority task and can reshuffle your week on demand.'
            : 'Tap the button below to open Telegram and link your account. Come back here once you\'ve tapped Start in the bot.'}
        </div>
        {!linked && (
          <a
            href={`https://t.me/otto_prep_bot?start=${profileId || ''}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpened(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '14px 28px', borderRadius: 14, border: 'none',
              background: 'linear-gradient(135deg, #2AABEE, #229ED9)',
              color: '#fff', fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 15,
              textDecoration: 'none', cursor: 'pointer',
              boxShadow: '0 12px 22px -10px rgba(34,158,217,.5)',
              transition: 'all .15s ease',
            }}
          >
            ✈ Open Telegram
          </a>
        )}
        {opened && !linked && (
          <div style={{ fontSize: 13, color: '#AD9B84', fontStyle: 'italic' }}>
            Waiting for you to tap Start in Telegram…
          </div>
        )}
      </div>

      <NavRow
        next={{
          label: linked ? 'Finish setup →' : 'Waiting for Telegram…',
          primary: linked,
          disabled: !linked,
          onClick: onLinked,
        }}
      />
    </div>
  );
}

function NavRow({ back, next }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
      {back && (
        <button onClick={back.onClick} style={{
          padding: '12px 20px', borderRadius: 13, border: '1.5px solid #E9DCC8',
          background: 'transparent', color: '#8C7A64',
          fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 14, cursor: 'pointer',
        }}>
          ← Back
        </button>
      )}
      {next && (
        <button onClick={next.onClick} disabled={next.disabled} style={{
          flex: 1, padding: '13px 20px', borderRadius: 13, border: 'none', cursor: next.disabled ? 'not-allowed' : 'pointer',
          background: next.disabled ? '#E9DCC8' : next.primary ? 'linear-gradient(135deg,#C0894F,#A8703E)' : '#F5EEE1',
          color: next.disabled ? '#B6A48C' : next.primary ? '#fff' : '#A8703E',
          fontFamily: "'Quicksand'", fontWeight: 700, fontSize: 15,
          boxShadow: (!next.disabled && next.primary) ? '0 12px 22px -10px rgba(150,108,64,.5)' : 'none',
          transition: 'all .15s ease',
        }}>
          {next.label}
        </button>
      )}
    </div>
  );
}
