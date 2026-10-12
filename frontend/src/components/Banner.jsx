import { art } from '../assets/otto/index.js';

// A wide illustrated strip behind a page header. `side` is where the art is busiest, so the text goes opposite.
export default function Banner({ art: name, children, minHeight = 132, style }) {
  const a = art(name);
  return (
    <section className="bezel rise" style={{ '--i': 0, ...style }}>
      <div className="core" style={{ minHeight, display: 'flex', alignItems: 'center', background: '#F1EBD4' }}>
        {a && <img src={a.src} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'right bottom', pointerEvents: 'none' }} />}
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(246,240,221,.96) 0%, rgba(246,240,221,.82) 50%, rgba(246,240,221,0) 88%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', width: '100%', padding: '26px 34px' }}>{children}</div>
      </div>
    </section>
  );
}
