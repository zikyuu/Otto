/**
 * Small × dismiss button that appears at the middle-left edge of its
 * absolutely-positioned parent container. The parent must have
 * `position: relative` and `overflow: visible`.
 */
export default function DeleteButton({ onDelete, visible }) {
  if (!visible) return null;
  return (
    <button
      onPointerDown={e => { e.stopPropagation(); onDelete(); }}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: 4, top: '50%',
        transform: 'translateY(-50%)',
        width: 20, height: 20,
        borderRadius: '50%',
        background: '#fff',
        border: '1.5px solid #D0C4B0',
        color: '#8C7A64',
        fontSize: 13, fontWeight: 700,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 30,
        boxShadow: '0 2px 8px -3px rgba(74,54,38,.28)',
        padding: 0, lineHeight: 1,
        fontFamily: 'inherit',
        animation: 'fadeIn .1s ease',
        transition: 'border-color .12s, color .12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#D44848'; e.currentTarget.style.color = '#D44848'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#D0C4B0'; e.currentTarget.style.color = '#8C7A64'; }}
    >×</button>
  );
}
