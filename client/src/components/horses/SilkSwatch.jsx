/**
 * SilkSwatch — renders a tiny jockey silk jersey based on silk_colors text.
 * Parses color descriptions like "Royal blue, gold cross" into a visual SVG.
 */

const COLOR_MAP = {
  'royal blue': '#1a4dcc', 'blue': '#2563eb', 'light blue': '#60a5fa', 'dark blue': '#1e3a8a', 'navy': '#1e293b',
  'red': '#dc2626', 'green': '#16a34a', 'dark green': '#14532d', 'white': '#f8fafc', 'black': '#111827',
  'gold': '#eab308', 'yellow': '#facc15', 'orange': '#f97316', 'purple': '#7c3aed', 'pink': '#ec4899',
  'teal': '#14b8a6', 'silver': '#94a3b8', 'brown': '#92400e', 'tan': '#d6b88c', 'sand': '#d6b88c',
  'maroon': '#7f1d1d', 'burgundy': '#881337',
};

const PATTERN_MAP = {
  'cross': 'cross', 'star': 'star', 'diamonds': 'diamonds', 'dots': 'dots',
  'chevrons': 'chevrons', 'chevron': 'chevrons', 'stripes': 'stripes', 'hoops': 'hoops',
  'band': 'band', 'sash': 'sash', 'trim': 'trim', 'sleeves': 'sleeves',
  'lightning': 'bolt', 'bolt': 'bolt', 'eagle': 'star', 'crown': 'star',
};

function parseColors(silkText) {
  if (!silkText) return { bg: '#6b7280', fg: '#d1d5db', pattern: null };
  const lower = silkText.toLowerCase();

  let bg = '#6b7280', fg = '#d1d5db', pattern = null;

  // Find primary color (first match)
  for (const [name, hex] of Object.entries(COLOR_MAP)) {
    if (lower.startsWith(name) || lower.includes(name + ',') || lower.includes(name + ' ')) {
      bg = hex;
      break;
    }
  }

  // Find secondary color (after comma or "and")
  const parts = lower.split(/,| and /);
  if (parts.length > 1) {
    const secondary = parts[1].trim();
    for (const [name, hex] of Object.entries(COLOR_MAP)) {
      if (secondary.includes(name)) {
        fg = hex;
        break;
      }
    }
  }

  // Find pattern
  for (const [keyword, pat] of Object.entries(PATTERN_MAP)) {
    if (lower.includes(keyword)) {
      pattern = pat;
      break;
    }
  }

  return { bg, fg, pattern };
}

function PatternOverlay({ pattern, color, size }) {
  if (!pattern) return null;
  const s = size;

  switch (pattern) {
    case 'cross':
      return <>
        <rect x={s*0.42} y={s*0.15} width={s*0.16} height={s*0.55} fill={color} rx={1} />
        <rect x={s*0.22} y={s*0.32} width={s*0.56} height={s*0.16} fill={color} rx={1} />
      </>;
    case 'star':
      return <polygon points={`${s/2},${s*0.18} ${s*0.58},${s*0.4} ${s*0.68},${s*0.65} ${s/2},${s*0.52} ${s*0.32},${s*0.65} ${s*0.42},${s*0.4}`} fill={color} />;
    case 'diamonds':
      return <>
        <polygon points={`${s/2},${s*0.2} ${s*0.62},${s*0.4} ${s/2},${s*0.6} ${s*0.38},${s*0.4}`} fill={color} />
      </>;
    case 'stripes':
      return <>
        <rect x={0} y={s*0.25} width={s} height={s*0.1} fill={color} />
        <rect x={0} y={s*0.45} width={s} height={s*0.1} fill={color} />
      </>;
    case 'hoops':
      return <>
        <rect x={s*0.1} y={s*0.22} width={s*0.8} height={s*0.08} fill={color} rx={2} />
        <rect x={s*0.1} y={s*0.38} width={s*0.8} height={s*0.08} fill={color} rx={2} />
        <rect x={s*0.1} y={s*0.54} width={s*0.8} height={s*0.08} fill={color} rx={2} />
      </>;
    case 'chevrons':
      return <polyline points={`${s*0.15},${s*0.5} ${s/2},${s*0.3} ${s*0.85},${s*0.5}`} fill="none" stroke={color} strokeWidth={s*0.08} />;
    case 'band':
    case 'trim':
      return <rect x={s*0.1} y={s*0.38} width={s*0.8} height={s*0.12} fill={color} rx={1} />;
    case 'sash':
      return <line x1={s*0.15} y1={s*0.15} x2={s*0.85} y2={s*0.7} stroke={color} strokeWidth={s*0.1} strokeLinecap="round" />;
    case 'bolt':
      return <polyline points={`${s*0.45},${s*0.15} ${s*0.35},${s*0.42} ${s*0.55},${s*0.42} ${s*0.45},${s*0.7}`} fill="none" stroke={color} strokeWidth={s*0.07} strokeLinecap="round" strokeLinejoin="round" />;
    case 'sleeves':
      return <>
        <rect x={0} y={s*0.15} width={s*0.18} height={s*0.55} fill={color} rx={2} />
        <rect x={s*0.82} y={s*0.15} width={s*0.18} height={s*0.55} fill={color} rx={2} />
      </>;
    default:
      return null;
  }
}

export default function SilkSwatch({ silkColors, size = 28 }) {
  const { bg, fg, pattern } = parseColors(silkColors);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, flexShrink: 0 }}>
      {/* Jersey body */}
      <path d={`M${size*0.15},${size*0.15} L${size*0.05},${size*0.3} L${size*0.05},${size*0.7} L${size*0.2},${size*0.85} L${size*0.8},${size*0.85} L${size*0.95},${size*0.7} L${size*0.95},${size*0.3} L${size*0.85},${size*0.15} L${size*0.6},${size*0.08} L${size*0.4},${size*0.08} Z`}
        fill={bg} stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} />
      {/* Pattern overlay */}
      <PatternOverlay pattern={pattern} color={fg} size={size} />
    </svg>
  );
}

export { parseColors };
