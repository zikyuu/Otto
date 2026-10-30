import { art } from '../assets/otto/index.js';

// A wide illustrated strip behind a page header. The text sits on the left, the otter and scenery on the right.
export default function Banner({ art: name, children, minHeight = 132, style }) {
  const a = art(name);
  return (
    <section className="bezel rise" style={{ '--i': 0, ...style }}>
      <div className="core" style={{ minHeight, display: 'flex', alignItems: 'center', background: '#E9E3C8' }}>
        {a && <img src={a.src} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'right bottom', pointerEvents: 'none' }} />}
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(246,239,224,.97) 0%, rgba(246,239,224,.84) 52%, rgba(246,239,224,0) 90%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', width: '100%', padding: '26px 34px' }}>{children}</div>
      </div>
    </section>
  );
}
