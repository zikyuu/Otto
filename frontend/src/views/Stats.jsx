import { BAR_DATA } from '../data/fixtures.js';
import Banner from '../components/Banner.jsx';
import Mascot from '../components/Mascot.jsx';

function Stat({ kicker, big, unit, sub, tone, i }) {
  return (
    <div className="bezel rise" style={{ '--i': i }}>
      <div className="core" style={{ padding: '22px 24px', background: tone ? '#E4ECD6' : undefined }}>
        <p className="label-caps" style={{ margin: 0, color: tone ? 'var(--accent-ink)' : undefined }}>{kicker}</p>
        <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-.04em', margin: '10px 0 4px', lineHeight: 1 }}>{big}{unit && <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink-3)', letterSpacing: 0, marginLeft: 4 }}>{unit}</span>}</div>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)' }}>{sub}</p>
      </div>
    </div>
  );
}

export default function Stats() {
  return (
    <div style={{ padding: '14px 28px 48px 14px', maxWidth: 1080, margin: '0 auto' }}>
      <Banner art="banner-stats" minHeight={130}>
        <p className="pill-tag" style={{ margin: 0 }}>Last 7 days</p>
        <h1 style={{ margin: '12px 0 0', fontSize: 32, fontWeight: 600, letterSpacing: '-.035em', lineHeight: 1.05 }}>Your week</h1>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-2)' }}>Measured by showing up, not by being perfect.</p>
      </Banner>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginTop: 18 }}>
        <Stat i={1} kicker="Momentum streak" big="12" unit="days" sub="You showed up 12 days running." />
        <Stat i={2} kicker="Versus your plan" big="Slightly ahead" tone sub="+8% on coding, a touch behind on fitness." />
        <Stat i={3} kicker="Focus hours" big="17" unit="h" sub="Across 6 of 7 days." />
      </div>

      <section className="bezel rise" style={{ '--i': 4, marginTop: 18 }}>
        <div className="core" style={{ padding: '26px 28px' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-.02em' }}>How locked-in you were</h2>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, height: 180, marginTop: 24 }}>
            {BAR_DATA.map(({ d, h, today }, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', maxWidth: 46, height: h, borderRadius: 16, transformOrigin: 'bottom', animation: `barGrow 1s var(--spring) ${300 + i * 90}ms both`,
                  background: today ? 'linear-gradient(180deg,#5E8B68,#3F6B49)' : 'linear-gradient(180deg,#E4D9B8,#D6C7A0)', boxShadow: today ? '0 14px 18px -12px rgba(30,45,34,.7)' : 'none' }} />
                <span style={{ fontWeight: 600, fontSize: 12, color: today ? 'var(--accent-ink)' : 'var(--ink-3)' }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bezel rise" style={{ '--i': 5, marginTop: 18 }}>
        <div className="core" style={{ padding: '26px 30px', background: 'linear-gradient(120deg,#FBF8EE,#E9EFD9)', minHeight: 150 }}>
          <p className="label-caps" style={{ margin: 0, color: 'var(--accent-ink)' }}>A realistic recap</p>
          <h2 style={{ margin: '10px 0 8px', fontSize: 22, fontWeight: 600, letterSpacing: '-.03em' }}>A genuinely good week.</h2>
          <p style={{ margin: 0, fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: '70%' }}>
            Given a full work schedule, you shipped 2 RAG milestones and kept a 12-day streak. Fitness slipped a little, and that is fine: it is protected for next week. No catching-up debt. Just forward.
          </p>
          <Mascot art="otter-celebrating" size={150} zoom={2.5} float style={{ position: 'absolute', right: 24, bottom: -6 }} />
        </div>
      </section>
    </div>
  );
}
