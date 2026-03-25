/**
 * Shared Button primitive
 *
 * variant : "primary" | "secondary" | "outline" | "ghost" | "danger"
 * color   : "green" (default) | "blue" | "purple" | "red" | "white"
 *           — only affects primary + outline variants
 * size    : "sm" | "md" (default) | "lg"
 * fullWidth : boolean
 */

const SIZES = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'px-6 py-3 text-base rounded-xl',
};

const PRIMARY_COLORS = {
  green:  'bg-green-500 hover:bg-green-400 text-white',
  blue:   'bg-blue-500  hover:bg-blue-400  text-white',
  purple: 'bg-purple-500 hover:bg-purple-400 text-white',
  red:    'bg-red-600   hover:bg-red-500   text-white',
  white:  'bg-white     hover:bg-gray-100  text-gray-900',
};

const OUTLINE_COLORS = {
  white: 'border border-white/20 hover:border-white/50 text-white hover:bg-white/5',
  green: 'border border-green-500/60 hover:border-green-400 text-green-400 hover:bg-green-500/5',
  gray:  'border border-gray-700 text-gray-400',          // locked / disabled visual
  red:   'border border-red-500/40 hover:border-red-400 text-red-400 hover:bg-red-500/5',
};

export default function Button({
  variant   = 'primary',
  color     = 'green',
  size      = 'md',
  fullWidth = false,
  disabled  = false,
  loading   = false,
  className = '',
  children,
  ...props
}) {
  let base = 'inline-flex items-center justify-center gap-2 font-bold transition-all';

  if (variant === 'primary') {
    base += ` ${PRIMARY_COLORS[color] ?? PRIMARY_COLORS.green}`;
  } else if (variant === 'secondary') {
    base += ' bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200';
  } else if (variant === 'outline') {
    base += ` ${OUTLINE_COLORS[color] ?? OUTLINE_COLORS.white}`;
  } else if (variant === 'ghost') {
    base += ' text-gray-400 hover:text-white hover:bg-gray-800/60';
  } else if (variant === 'danger') {
    base += ' bg-red-600 hover:bg-red-500 text-white';
  }

  if (disabled || loading) {
    base += ' opacity-50 cursor-not-allowed pointer-events-none';
  }

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${base} ${SIZES[size] ?? SIZES.md} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {loading && (
        <svg className="animate-spin w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
