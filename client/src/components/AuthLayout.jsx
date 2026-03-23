import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

// ── Deterministic particle seeds ─────────────────────────────────────────────
const SEEDS = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  left:     `${5 + (i * 9.3) % 90}%`,
  top:      `${4 + (i * 11.7) % 88}%`,
  fontSize: `${12 + (i * 5) % 16}px`,
  delay:    `${(i * 0.4) % 3.2}s`,
  duration: `${3.5 + (i * 0.55) % 3.5}s`,
  opacity:  0.12 + (i % 4) * 0.04,
}));

const STYLES = `
@keyframes authFloat {
  0%   { transform: translateY(0px) rotate(0deg);    opacity: var(--op); }
  50%  { transform: translateY(-22px) rotate(160deg); opacity: calc(var(--op) * 2.2); }
  100% { transform: translateY(0px) rotate(320deg);  opacity: var(--op); }
}
@keyframes authGlow {
  0%, 100% { opacity: 0.14; transform: scale(1); }
  50%       { opacity: 0.28; transform: scale(1.1); }
}
`;

// ── Icon input ────────────────────────────────────────────────────────────────

export function IconInput({ icon, type = 'text', placeholder, value, onChange, required, autoComplete, rightSlot }) {
  return (
    <div className="relative group">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base select-none pointer-events-none">
        {icon}
      </span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
        className="input pl-10 pr-10 w-full transition-all focus:border-brand-500/60 focus:shadow-[0_0_0_3px_rgba(55,138,221,0.12)]"
      />
      {rightSlot && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</div>
      )}
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
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-brand-600/8 rounded-full blur-3xl"
          style={{ animation: 'authGlow 5s ease-in-out infinite' }} />
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-brand-800/10 rounded-full blur-3xl" />
        <div className="absolute top-0 left-0 w-64 h-64 bg-brand-900/15 rounded-full blur-3xl" />
      </div>


      {/* Card */}
      <div className="relative w-full max-w-md">
        {/* Card glow */}
        <div className="absolute -inset-px bg-gradient-to-b from-brand-500/20 to-transparent rounded-2xl pointer-events-none" />
        <div className="absolute -inset-6 bg-brand-500/5 blur-2xl rounded-3xl pointer-events-none" />

        <div className="relative bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
          {/* Top accent line */}
          <div className="h-0.5 bg-gradient-to-r from-transparent via-brand-500/60 to-transparent" />

          {/* Logo */}
          <div className="flex flex-col items-center pt-8 pb-6 px-8 border-b border-gray-800/60">
            <Link to="/" className="flex items-center gap-2.5 group mb-1">
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#111', border: '1.5px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: '-0.03em' }}>TR</span>
              </div>
              <div className="flex flex-col leading-none">
                <div style={{ fontSize: '22px', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  <span style={{ color: '#B5D4F4', fontWeight: 300 }}>tourney</span>
                  <span style={{ color: '#378ADD', fontWeight: 800 }}>run</span>
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
