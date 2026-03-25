/**
 * Shared Badge / Chip primitive — status indicators, format pills, labels.
 *
 * color : "gray" | "green" | "yellow" | "blue" | "red" | "purple" | "teal" | "amber"
 * size  : "sm" (default) | "md"
 *
 * Based on the Chip component used across GolfLeague, GolfDashboard, and other pages.
 */

const COLORS = {
  gray:   'bg-gray-700/60   text-gray-400   border-gray-700',
  green:  'bg-green-500/15  text-green-400  border-green-500/30',
  yellow: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  amber:  'bg-amber-500/15  text-amber-400  border-amber-500/30',
  blue:   'bg-blue-500/15   text-blue-400   border-blue-500/30',
  red:    'bg-red-500/15    text-red-400    border-red-500/30',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  teal:   'bg-teal-500/15   text-teal-400   border-teal-500/30',
};

const SIZES = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-2.5 py-1 text-xs',
};

export default function Badge({ children, color = 'gray', size = 'sm', className = '' }) {
  return (
    <span className={`inline-block border rounded-full font-bold uppercase tracking-wide ${COLORS[color] ?? COLORS.gray} ${SIZES[size] ?? SIZES.sm} ${className}`}>
      {children}
    </span>
  );
}
