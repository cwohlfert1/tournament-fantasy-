/**
 * Shared Card primitive — dark panel with border, common across all pages.
 *
 * noPadding : skip the default p-5 (for cards with internal dividers / lists)
 * className : extra Tailwind classes
 */
export default function Card({ children, noPadding = false, className = '' }) {
  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-2xl ${noPadding ? '' : 'p-5'} ${className}`}>
      {children}
    </div>
  );
}
