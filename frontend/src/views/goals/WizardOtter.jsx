import Mascot from '../../components/Mascot.jsx';
import { art } from '../../assets/otto/index.js';

// The weekly review is the one place Otto asks a language model, so it gets its own character.
// If otter-wizard.png is real art the hat is already drawn on; with the placeholder a hat is drawn over it.
export default function WizardOtter({ size = 112 }) {
  const placeholder = art('otter-wizard')?.placeholder !== false;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0, animation: 'bob 6s var(--ease) infinite' }}>
      <Mascot art="otter-wizard" size={size} zoom={3.1} />
      {placeholder && (
        <svg aria-hidden viewBox="0 0 100 80" style={{ position: 'absolute', left: '19%', top: '-8%', width: '52%', transform: 'rotate(-9deg)', overflow: 'visible', filter: 'drop-shadow(0 3px 3px rgba(20,25,20,.35))' }}>
          <path d="M14 66 Q50 76 86 66 L82 60 Q50 68 18 60 Z" fill="#4B3E6B" />
          <path d="M24 62 L47 6 Q50 2 53 6 L76 62 Q50 70 24 62 Z" fill="#5E4F86" />
          <path d="M24 62 Q50 70 76 62 L74 55 Q50 62 26 55 Z" fill="#D9B45A" opacity=".9" />
          <path d="M47 6 Q58 -2 68 8" fill="none" stroke="#5E4F86" strokeWidth="5" strokeLinecap="round" />
          <path d="M40 38l1.6 3.4 3.6.4-2.7 2.5.8 3.6-3.3-1.9-3.3 1.9.8-3.6-2.7-2.5 3.6-.4z" fill="#F1D98A" />
          <circle cx="58" cy="26" r="2" fill="#F1D98A" /><circle cx="52" cy="48" r="1.6" fill="#F1D98A" />
        </svg>
      )}
    </div>
  );
}
