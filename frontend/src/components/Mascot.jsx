import { art } from '../assets/otto/index.js';

// <Mascot art="otter-reading" size={96} />
// Your regenerated otters are square, transparent and already framed, so they are simply contained.
// The old placeholder art is 16:9 with a small otter in the middle, so those get cropped in.
export default function Mascot({ art: name, size = 96, zoom = 3.2, alt = '', style, className, float = false }) {
  const a = art(name);
  if (!a) return null;
  const box = { width: size, height: size, position: 'relative', flexShrink: 0, ...style };
  const bob = float ? { animation: 'bob 5s var(--ease) infinite' } : null;
  if (!a.placeholder) {
    return <img src={a.src} alt={alt} draggable={false} className={className} style={{ ...box, objectFit: 'contain', ...bob }} />;
  }
  const w = size * zoom;
  return (
    <div className={className} style={{ ...box, ...bob }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <img src={a.src} alt={alt} draggable={false} style={{
          position: 'absolute', left: '50%', top: '50%', width: w, height: (w * 9) / 16, maxWidth: 'none',
          transform: 'translate(-50%, -50%)',
        }} />
      </div>
    </div>
  );
}
