import Banner from '../components/Banner.jsx';
import Mascot from '../components/Mascot.jsx';
import { IconArrow, IconShuffle } from './calendar/Icons.jsx';

export default function Recovery({ onExit }) {
  return (
    <div style={{ padding: '14px 28px 48px 14px', maxWidth: 960, margin: '0 auto' }}>
      <Banner art="banner-now" minHeight={170}>
        <p className="pill-tag" style={{ margin: 0, background: 'rgba(247,235,203,.9)', color: '#7D5A16' }}>A gentle reset</p>
        <h1 style={{ margin: '12px 0 0', fontSize: 32, fontWeight: 600, letterSpacing: '-.035em', lineHeight: 1.05, maxWidth: 440 }}>Rough week. That is completely normal.</h1>
        <p style={{ margin: '10px 0 0', fontSize: 14.5, color: 'var(--ink-2)', maxWidth: 420, lineHeight: 1.55 }}>Nothing is overdue. Let us find the best path from where you are right now.</p>
        <Mascot art="otter-panicked" size={150} zoom={2.5} float style={{ position: 'absolute', right: 40, bottom: 0 }} />
      </Banner>

      <section className="bezel bezel--float rise" style={{ '--i': 1, marginTop: 18 }}>
        <div className="core" style={{ padding: '26px 30px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <p className="label-caps" style={{ margin: 0, color: 'var(--accent-ink)' }}>Start here, just this</p>
            <h2 style={{ margin: '10px 0 6px', fontSize: 24, fontWeight: 600, letterSpacing: '-.03em' }}>Add embeddings + vector search</h2>
            <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 13.5 }}>One clean win, 45 min, moves your top goal.</p>
          </div>
          <button className="btn btn--primary" style={{ height: 44, padding: '0 10px 0 22px', fontSize: 14 }}>Start<span className="btn__icon" style={{ width: 28, height: 28, marginRight: 0 }}><IconArrow size={14} /></span></button>
        </div>
      </section>

      <section className="bezel rise" style={{ '--i': 2, marginTop: 16 }}>
        <div className="core" style={{ padding: '24px 30px', background: '#E4ECD6', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <p className="label-caps" style={{ margin: 0, color: 'var(--accent-ink)' }}>Shrink it, do not skip it</p>
            <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--ink-3)', textDecoration: 'line-through' }}>Full 1-hour LeetCode set</p>
            <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 600, letterSpacing: '-.025em' }}>Just 2 problems, 15 min</p>
          </div>
          <button className="btn" style={{ height: 40 }}>Swap it in<IconShuffle size={14} /></button>
        </div>
      </section>

      <p style={{ textAlign: 'center', marginTop: 28 }}>
        <button className="btn btn--ghost" onClick={onExit}>I am okay now, back to my plan</button>
      </p>
    </div>
  );
}
