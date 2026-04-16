/**
 * Toast — imperative alert replacement for native window.alert().
 *
 * Design: "Broadcast Ticker" — left-edge 3px accent bar in variant color,
 * variant-tinted background at 4% opacity, icon → title → optional action →
 * dismiss X. Same visual grammar as the sportsbook pick card redesign.
 *
 * Usage:
 *   import { showToast } from '@/components/ui/Toast';
 *   showToast.success('Reminders sent to 5 members');
 *   showToast.error('Something went wrong');
 *   showToast.warning('This action cannot be undone');
 *   showToast.info('Tournament starts Thursday');
 *
 * Mount <ToastContainer /> once at the app root.
 *
 * Auto-dismiss defaults: success 4s, info 5s, warning 7s, destructive 0 (sticky)
 */
import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

// ── Variant palette — matches site's existing tier/feedback colors ────────────
const VARIANTS = {
  success:     { accent: '#22c55e', tint: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  glow: 'rgba(34,197,94,0.35)',  Icon: CheckCircle2, defaultDuration: 4000 },
  destructive: { accent: '#ef4444', tint: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.30)',  glow: 'rgba(239,68,68,0.35)',  Icon: XCircle,      defaultDuration: 0 },
  warning:     { accent: '#f59e0b', tint: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.30)', glow: 'rgba(245,158,11,0.35)', Icon: AlertTriangle, defaultDuration: 7000 },
  info:        { accent: '#38bdf8', tint: 'rgba(56,189,248,0.08)', border: 'rgba(56,189,248,0.28)', glow: 'rgba(56,189,248,0.35)', Icon: Info,         defaultDuration: 5000 },
};

// ── Subscriber pub/sub so showToast can fire from anywhere ───────────────────
const listeners = new Set();
let idCounter = 0;

function emit(toast) {
  const next = { id: ++idCounter, ...toast };
  listeners.forEach(l => l(next));
}

export const showToast = {
  success:     (title, opts = {}) => emit({ variant: 'success',     title, ...opts }),
  error:       (title, opts = {}) => emit({ variant: 'destructive', title, ...opts }),
  destructive: (title, opts = {}) => emit({ variant: 'destructive', title, ...opts }),
  warning:     (title, opts = {}) => emit({ variant: 'warning',     title, ...opts }),
  info:        (title, opts = {}) => emit({ variant: 'info',        title, ...opts }),
};

// ── Individual toast row ─────────────────────────────────────────────────────
function ToastRow({ toast, onDismiss }) {
  const v = VARIANTS[toast.variant] || VARIANTS.info;
  const { Icon } = v;
  const duration = toast.duration != null ? toast.duration : v.defaultDuration;
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!duration) return;
    const id = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 200);
    }, duration);
    return () => clearTimeout(id);
  }, [duration, toast.id, onDismiss]);

  function close() {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  }

  return (
    <div
      role="alert"
      style={{
        position: 'relative',
        minWidth: 300,
        maxWidth: 420,
        background: `linear-gradient(to right, ${v.tint}, rgba(15,23,35,0.95) 60%)`,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: `1px solid ${v.border}`,
        borderLeft: `3px solid ${v.accent}`,
        borderRadius: 10,
        boxShadow: `0 12px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.2), -4px 0 16px -2px ${v.glow}`,
        padding: '12px 14px 12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 11,
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'translateX(12px)' : 'translateX(0)',
        transition: 'opacity 0.2s ease, transform 0.2s ease',
        animation: exiting ? 'none' : 'tr-toast-in 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        pointerEvents: 'auto',
      }}
    >
      <Icon size={18} style={{ color: v.accent, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.005em' }}>
          {toast.title}
        </div>
        {toast.description && (
          <div style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.45, marginTop: 2 }}>
            {toast.description}
          </div>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => { toast.action.onClick(); close(); }}
            style={{
              marginTop: 6, padding: 0, background: 'none', border: 'none', cursor: 'pointer',
              color: v.accent, fontSize: 12, fontWeight: 600, letterSpacing: '0.01em',
            }}
          >
            {toast.action.label} →
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss"
        style={{
          flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer',
          color: '#6b7280', padding: 2, lineHeight: 0, borderRadius: 4,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#d1d5db'}
        onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ── Container — mount once at app root ──────────────────────────────────────
export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  const ref = useRef(null);

  useEffect(() => {
    function handle(toast) { setToasts(prev => [...prev, toast]); }
    listeners.add(handle);
    return () => listeners.delete(handle);
  }, []);

  function dismiss(id) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  return (
    <>
      <style>{`
        @keyframes tr-toast-in {
          from { opacity: 0; transform: translateX(24px) scale(0.98); }
          to   { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>
      <div
        ref={ref}
        aria-live="polite"
        aria-atomic="false"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: 10,
          pointerEvents: 'none',
        }}
      >
        {toasts.map(t => (
          <ToastRow key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </>
  );
}
