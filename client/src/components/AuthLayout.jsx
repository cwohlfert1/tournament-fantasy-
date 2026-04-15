import { Link } from 'react-router-dom';
import { isValidElement } from 'react';

const STYLES = `
@keyframes authGlow {
  0%, 100% { opacity: 0.10; transform: scale(1); }
  50%       { opacity: 0.20; transform: scale(1.1); }
}
`;

// ── Icon input ────────────────────────────────────────────────────────────────
// `icon` accepts either:
//   - a lucide React element (preferred): icon={<Mail size={16} />}
//   - a string emoji (legacy, still supported): icon="📧"
// `label` optional — renders above the input for the new 21st-style layout.
// `labelRight` optional — right-side slot beside the label (e.g. "Forgot?" link).

export function IconInput({
  icon,
  type = 'text',
  placeholder,
  value,
  onChange,
  required,
  autoComplete,
  rightSlot,
  label,
  labelRight,
  id,
}) {
  const isEmoji = typeof icon === 'string';
  const hasIcon = !!icon;
  return (
    <div className="w-full">
      {(label || labelRight) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <label htmlFor={id} className="text-xs font-medium text-gray-300 leading-none">
              {label}
            </label>
          )}
          {labelRight}
        </div>
      )}
      <div className="relative group">
        {hasIcon && (
          <span
            className={
              'absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none select-none ' +
              (isEmoji ? 'text-base' : 'text-gray-500')
            }
          >
            {isEmoji ? icon : (isValidElement(icon) ? icon : null)}
          </span>
        )}
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          autoComplete={autoComplete}
          className={
            'w-full h-10 rounded-lg bg-gray-800/80 border border-gray-700 text-gray-100 placeholder-gray-500 text-sm ' +
            'transition-all outline-none ' +
            'focus:border-green-500/60 focus:shadow-[0_0_0_3px_rgba(0,232,122,0.10)] ' +
            (hasIcon ? 'pl-9 ' : 'pl-3 ') +
            (rightSlot ? 'pr-10' : 'pr-3')
          }
        />
        {rightSlot && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2">{rightSlot}</div>
        )}
      </div>
    </div>
  );
}

// ── Main layout ───────────────────────────────────────────────────────────────

export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      {/* Ambient glow orbs */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full blur-3xl"
          style={{ background: 'rgba(0,232,122,0.06)', animation: 'authGlow 5s ease-in-out infinite' }} />
        <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full blur-3xl"
          style={{ background: 'rgba(0,232,122,0.04)' }} />
        <div className="absolute top-0 left-0 w-64 h-64 rounded-full blur-3xl"
          style={{ background: 'rgba(0,232,122,0.05)' }} />
      </div>

      {/* Card */}
      <div className="relative w-full max-w-md">
        {/* Card glow */}
        <div className="absolute -inset-px rounded-2xl pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(0,232,122,0.15), transparent)' }} />
        <div className="absolute -inset-6 blur-2xl rounded-3xl pointer-events-none"
          style={{ background: 'rgba(0,232,122,0.04)' }} />

        <div className="relative bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
          {/* Top accent line */}
          <div className="h-0.5"
            style={{ background: 'linear-gradient(to right, transparent, rgba(0,232,122,0.5), transparent)' }} />

          {/* Logo */}
          <div className="flex flex-col items-center pt-8 pb-6 px-8 border-b border-gray-800/60">
            <Link to="/" className="flex items-center gap-2.5 group mb-1" style={{ textDecoration: 'none' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'linear-gradient(135deg, #22c55e 0%, #00c96a 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <span style={{ color: '#000', fontWeight: 900, fontSize: 14, letterSpacing: '-0.03em' }}>TR</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                <div style={{ fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  <span style={{ color: '#ffffff', fontWeight: 300 }}>tourney</span>
                  <span style={{ color: '#22c55e', fontWeight: 800 }}>run</span>
                </div>
              </div>
            </Link>
          </div>

          {/* Form content */}
          <div className="px-8 py-7">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
