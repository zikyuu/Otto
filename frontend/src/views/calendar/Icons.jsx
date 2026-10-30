import { customIcon } from '../../assets/otto/index.js';

// One hairline stroke on one 16px grid. To replace an icon with your own, drop `<name>.svg`
// (24 or 16px viewBox, stroke="currentColor", no fixed size) into src/assets/otto/icons/. Names are in ASSETS_NEEDED.md.
const base = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const make = (name, paths) => function Icon({ size = 14, style, ...p }) {
  const raw = customIcon(name);
  if (raw) {
    return <span aria-hidden style={{ display: 'inline-flex', width: size, height: size, flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: raw.replace('<svg', `<svg width="${size}" height="${size}" style="display:block"`) }} />;
  }
  return <svg {...base} width={size} height={size} style={{ flexShrink: 0, ...style }} {...p}>{paths}</svg>;
};

export const IconLock = make('lock', <><rect x="3.5" y="7" width="9" height="6.5" rx="1.6" /><path d="M5.5 7V5.3a2.5 2.5 0 0 1 5 0V7" /></>);
export const IconUnlock = make('unlock', <><rect x="3.5" y="7" width="9" height="6.5" rx="1.6" /><path d="M5.5 7V5.3a2.5 2.5 0 0 1 4.8-1" /></>);
export const IconClose = make('close', <path d="M4 4l8 8M12 4l-8 8" />);
export const IconUndo = make('undo', <path d="M6 3.5L3 6.5l3 3M3 6.5h6a3.5 3.5 0 0 1 0 7H7" />);
export const IconLink = make('link', <><path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.8.8" /><path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.8-.8" /></>);
export const IconGrip = make('grip', <><circle cx="6" cy="4.5" r=".6" fill="currentColor" /><circle cx="10" cy="4.5" r=".6" fill="currentColor" /><circle cx="6" cy="8" r=".6" fill="currentColor" /><circle cx="10" cy="8" r=".6" fill="currentColor" /><circle cx="6" cy="11.5" r=".6" fill="currentColor" /><circle cx="10" cy="11.5" r=".6" fill="currentColor" /></>);
export const IconChevL = make('chev-l', <path d="M10 3.5L5.5 8l4.5 4.5" />);
export const IconChevR = make('chev-r', <path d="M6 3.5L10.5 8 6 12.5" />);
export const IconWarn = make('warn', <><path d="M8 2.5l6 10.5H2L8 2.5z" /><path d="M8 6.8v2.8M8 11.6v.1" /></>);
export const IconArrow = make('arrow', <path d="M3 8h10M9.5 4.5L13 8l-3.5 3.5" />);
export const IconSelect = make('select', <><path d="M2.5 5.5V3.5a1 1 0 0 1 1-1h2M10.5 2.5h2a1 1 0 0 1 1 1v2M13.5 10.5v2a1 1 0 0 1-1 1h-2M5.5 13.5h-2a1 1 0 0 1-1-1v-2" /><path d="M6 8h4" /></>);
export const IconPencil = make('pencil', <><path d="M10.6 3.4l2 2L5.8 12.2 3.2 12.8l.6-2.6 6.8-6.8z" /></>);
export const IconRepeat = make('repeat', <><path d="M3 7.2V6a2 2 0 0 1 2-2h7.5M10.5 2l2 2-2 2M13 8.8V10a2 2 0 0 1-2 2H3.5M5.5 14l-2-2 2-2" /></>);
export const IconCheck = make('check', <path d="M3.5 8.5l3 3 6-7" />);
export const IconCalendar = make('calendar', <><rect x="2.5" y="3.5" width="11" height="10" rx="1.8" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></>);

// sidebar
export const IconRules = make('rules', <><path d="M3 4.5h10M3 8h10M3 11.5h10" /><circle cx="6" cy="4.5" r="1.4" fill="var(--bg, #fff)" /><circle cx="10.5" cy="8" r="1.4" fill="var(--bg, #fff)" /><circle cx="5" cy="11.5" r="1.4" fill="var(--bg, #fff)" /></>);
export const IconPriority = make('priority', <><rect x="2.5" y="3" width="11" height="3" rx="1" /><rect x="2.5" y="7" width="8" height="3" rx="1" /><rect x="2.5" y="11" width="5" height="2.5" rx="1" /></>);
export const IconNow = make('now', <><circle cx="8" cy="8" r="5.6" /><path d="M8 4.8V8l2.2 1.4" /></>);
export const IconGoals = make('goals', <><circle cx="8" cy="8" r="5.6" /><circle cx="8" cy="8" r="2.6" /><circle cx="8" cy="8" r=".6" fill="currentColor" /></>);
export const IconStats = make('stats', <path d="M3 13V8.5M7 13V3.5M11 13V6.5M14 13H2" />);
export const IconLeaf = make('leaf', <><path d="M3 13c0-6 3.4-9.4 10-9.6 .1 6.6-3.2 10-9.2 9.8" /><path d="M3 13c2.2-3 4.4-4.8 7-6" /></>);
export const IconPlus = make('plus', <path d="M8 3.5v9M3.5 8h9" />);

// one glyph per category, drawn in the same 16px grid
export const CATEGORY_ICON = {
  'llm':           make('cat-llm', <><rect x="4" y="4" width="8" height="8" rx="1.8" /><path d="M6.5 2.5v1.5M9.5 2.5v1.5M6.5 12v1.5M9.5 12v1.5M2.5 6.5H4M2.5 9.5H4M12 6.5h1.5M12 9.5h1.5" /></>),
  'leetcode':      make('cat-leetcode', <path d="M6 4.5L2.8 8 6 11.5M10 4.5L13.2 8 10 11.5" />),
  'interview':     make('cat-interview', <path d="M3 4.2c0-.7.6-1.2 1.2-1.2h7.6c.7 0 1.2.5 1.2 1.2v5.1c0 .7-.5 1.2-1.2 1.2H7.6L5 13V10.5H4.2C3.6 10.5 3 10 3 9.3V4.2z" />),
  'gym':           make('cat-gym', <path d="M2.5 6.2v3.6M4.6 4.8v6.4M11.4 4.8v6.4M13.5 6.2v3.6M4.6 8h6.8" />),
  'social':        make('cat-social', <><circle cx="6" cy="6" r="2" /><circle cx="11" cy="6.6" r="1.6" /><path d="M2.4 12.6c.3-2 1.8-3.2 3.6-3.2s3.3 1.2 3.6 3.2M10.2 9.7c1.6-.1 3 .9 3.4 2.9" /></>),
  'leisure':       make('cat-leisure', <path d="M8 2.8l1.3 3.2 3.2 1.3-3.2 1.3L8 11.8 6.7 8.6 3.5 7.3 6.7 6 8 2.8z" />),
  'system-design': make('cat-system-design', <path d="M8 2.8l5.2 2.6L8 8 2.8 5.4 8 2.8zM2.8 8.2L8 10.8l5.2-2.6M2.8 10.9L8 13.5l5.2-2.6" />),
  'admin':         make('cat-admin', <><rect x="3" y="3" width="10" height="10" rx="2" /><path d="M5.8 8.2l1.6 1.6 3-3.4" /></>),
};
CATEGORY_ICON['life'] = CATEGORY_ICON['gym'];
CATEGORY_ICON['deep work'] = CATEGORY_ICON['deep_work'] = CATEGORY_ICON['llm'];
export const categoryIcon = cat => CATEGORY_ICON[cat] || IconLeaf;

// goals tracker
export const IconBranch = make('branch', <><circle cx="4.5" cy="3.8" r="1.5" /><circle cx="4.5" cy="12.2" r="1.5" /><circle cx="11.5" cy="6.4" r="1.5" /><path d="M4.5 5.3v5.4M11.5 7.9c0 2.4-2.4 2.6-7 3" /></>);
export const IconStop = make('stop', <><path d="M5.2 2.5h5.6l2.7 2.7v5.6l-2.7 2.7H5.2l-2.7-2.7V5.2L5.2 2.5z" /><path d="M8 5.6v3M8 10.6v.1" /></>);
export const IconTurn = make('turn', <path d="M3.5 12.5V8.2c0-1.6 1.2-2.7 2.8-2.7h6.2M10 3l2.7 2.5L10 8" />);
export const IconTrash = make('trash', <path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8" />);
export const IconCaret = make('caret', <path d="M4.5 6.5L8 10l3.5-3.5" />);

// planner
export const IconPin     = make('pin', <path d="M9.8 2.8l3.4 3.4-1.6.5-2.2 2.3.1 2.4-.9.9-2.2-2.2-3 3M9.8 2.8L8.4 4.3 6.1 5.1 5 6.2l4.8 4.8" />);
export const IconClock   = make('clock', <><circle cx="8" cy="8" r="5.6" /><path d="M8 4.8V8l2.2 1.4" /></>);
export const IconFlag    = make('flag', <path d="M4 13.5V2.8M4 3.5h7.2l-1.4 2.6 1.4 2.6H4" />);
export const IconTarget  = make('target', <><circle cx="8" cy="8" r="5.4" /><circle cx="8" cy="8" r="2.2" /></>);
export const IconSteps   = make('steps', <path d="M3 4.5h3M3 8h5M3 11.5h7M11 3.5l1.5 1.5L15 2.5" />);
export const IconWand    = make('wand', <path d="M3 13l7-7M9.5 3.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7zM12.5 9l.4.9.9.4-.9.4-.4.9-.4-.9-.9-.4.9-.4z" />);
export const IconShuffle = make('shuffle', <path d="M2.5 5h2.2c1.4 0 2.4.6 3.2 1.8M13.5 11h-2.2c-1.4 0-2.4-.6-3.2-1.8M2.5 11h2.2c1.4 0 2.4-.6 3.2-1.8L9.100 6.800c.8-1.200 1.800-1.800 3.200-1.800h1.200M11.500 3l2 2-2 2M11.500 9l2 2-2 2" />);
export const IconSparkle = make('sparkle', <path d="M8 2.5l1.5 3.7 3.7 1.5-3.7 1.5L8 13l-1.5-3.8L2.8 7.7l3.7-1.5L8 2.5z" />);
