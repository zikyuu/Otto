import Banner from '../components/Banner.jsx';
import Mascot from '../components/Mascot.jsx';
import { IconArrow, IconCheck, IconPlus, IconClock, IconSparkle } from './calendar/Icons.jsx';

export default function Now({ tasks, onToggle, onFellBehind, onOpenFeasibility, onAddTask }) {
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <div style={{ padding: '14px 28px 48px 14px', maxWidth: 1080, margin: '0 auto' }}>
      <Banner art="banner-now" minHeight={168}>
        <p className="pill-tag" style={{ margin: 0 }}>{date}</p>
        <h1 style={{ margin: '12px 0 0', fontSize: 40, fontWeight: 600, letterSpacing: '-.04em', lineHeight: 1 }}>Hello, Yuki</h1>
        <p style={{ margin: '10px 0 0', fontSize: 15, color: 'var(--ink-2)', maxWidth: 420 }}>Lock in now. It is not too late to reverse unemployment.</p>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, marginTop: 16, background: 'rgba(224,235,211,.9)', borderRadius: 999, padding: '7px 14px', fontWeight: 600, fontSize: 12.5, color: '#3F6B49' }}>
          <i style={{ width: 8, height: 8, borderRadius: '50%', background: '#6FA079', animation: 'pulseDot 2.2s infinite' }} />Slightly ahead this week
        </span>
        <Mascot art="otter-eating" size={170} zoom={2.4} float style={{ position: 'absolute', right: 36, bottom: -6 }} />
      </Banner>

      <section className="bezel bezel--float rise" style={{ '--i': 1, marginTop: 18 }} aria-label="Your one best move">
        <div className="core" style={{ padding: '26px 30px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 260 }}>
            <p className="label-caps" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-ink)' }}><IconSparkle size={12} />Your one best move right now</p>
            <h2 style={{ margin: '10px 0 10px', fontSize: 25, fontWeight: 600, letterSpacing: '-.03em', lineHeight: 1.1 }}>Add embeddings + vector search (pgvector)</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="pill-tag" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>Ship a production RAG app</span>
              <span style={{ color: 'var(--ink-3)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 5 }}><IconClock size={13} />45 min</span>
            </div>
          </div>
          <button className="btn btn--primary" style={{ height: 46, padding: '0 10px 0 24px', fontSize: 14 }}>Start<span className="btn__icon" style={{ width: 30, height: 30, marginRight: 0 }}><IconArrow size={14} /></span></button>
        </div>
      </section>

      <button onClick={onOpenFeasibility} className="rise" style={{
        '--i': 2, width: '100%', marginTop: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
        background: 'rgba(247,235,203,.8)', border: 0, borderRadius: 22, padding: '14px 20px', boxShadow: '0 0 0 1px #EBD9A6',
      }}>
        <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#F6E1B8', color: '#B98532', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><IconClock size={16} /></span>
        <span style={{ flex: 1, fontSize: 13.5, color: '#9C7A33' }}><strong style={{ color: '#7D5A16', fontWeight: 600 }}>This week is a little full at your pace.</strong> Tap to see what to protect.</span>
        <IconArrow size={15} style={{ color: '#B98532' }} />
      </button>

      <div className="rise" style={{ '--i': 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '30px 4px 14px' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-.025em' }}>Today, in order</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn--icon" onClick={onAddTask} aria-label="Add a task"><IconPlus size={14} /></button>
          <button className="btn" onClick={onFellBehind}>I fell behind<IconArrow size={13} /></button>
        </div>
      </div>

      <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tasks.map((t, i) => (
          <li key={t.k} className="bezel bezel--sm rise" style={{ '--i': i + 4, listStyle: 'none' }}>
            <button className="core" onClick={() => onToggle(t.k)} role="checkbox" aria-checked={t.checked} style={{
              width: '100%', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', textAlign: 'left', color: 'inherit',
            }}>
              <span style={{
                width: 24, height: 24, borderRadius: 9, flex: '0 0 auto', display: 'grid', placeItems: 'center', color: '#fff',
                background: t.checked ? 'var(--accent)' : 'transparent', boxShadow: `inset 0 0 0 1.5px ${t.checked ? 'var(--accent)' : 'var(--ink-4)'}`,
                animation: t.checked ? 'checkPop .5s var(--spring)' : 'none',
              }}>{t.checked && <IconCheck size={14} />}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15.5, fontWeight: 600, letterSpacing: '-.01em', color: t.checked ? 'var(--ink-4)' : 'var(--ink)', textDecoration: t.checked ? 'line-through' : 'none' }}>{t.t}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>{t.meta}</span>
              </span>
              {t.star && !t.checked && <span className="pill-tag">Now</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
