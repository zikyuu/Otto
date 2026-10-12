import { IconClose } from '../views/calendar/Icons.jsx';

/**
 * Small dismiss button at the middle-left edge of its absolutely-positioned parent
 * (the parent needs `position: relative` and `overflow: visible`).
 */
export default function DeleteButton({ onDelete, visible, label = 'Remove' }) {
  if (!visible) return null;
  return (
    <button
      aria-label={label}
      title={label}
      onPointerDown={e => { e.stopPropagation(); onDelete(); }}
      onClick={e => e.stopPropagation()}
      className="chip-node chip-node--danger"
      style={{ left: -9, top: '50%', transform: 'translateY(-50%)' }}
    ><IconClose size={9} /></button>
  );
}
