/**
 * ConfirmDialog — imperative confirm() replacement.
 *
 * Same "Broadcast Ticker" design language as Toast/Alert (3px left-edge
 * variant accent, tinted gradient bg, lucide icon). Replaces
 * window.confirm() which renders an OS-grey dialog that breaks the theme.
 *
 * Usage (imperative):
 *   import { showConfirm } from '@/components/ui/ConfirmDialog';
 *   const ok = await showConfirm({
 *     title: 'Delete this league?',
 *     description: 'This cannot be undone. All picks, payments, and chat will be lost.',
 *     variant: 'destructive',
 *     confirmLabel: 'Delete league',
 *   });
 *   if (ok) { ... }
 *
 * Mount <ConfirmDialogHost /> once at the app root.
 */
import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, XCircle, Info, CheckCircle2, X } from 'lucide-react';

const VARIANTS = {
  destructive: { accent: '#ef4444', tint: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.30)',  glow: 'rgba(239,68,68,0.35)',  Icon: XCircle,       confirmBg: '#dc2626', confirmHover: '#b91c1c' },
  warning:     { accent: '#f59e0b', tint: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.30)', glow: 'rgba(245,158,11,0.35)', Icon: AlertTriangle, confirmBg: '#d97706', confirmHover: '#b45309' },
  info:        { accent: '#38bdf8', tint: 'rgba(56,189,248,0.08)', border: 'rgba(56,189,248,0.28)', glow: 'rgba(56,189,248,0.35)', Icon: Info,          confirmBg: '#0284c7', confirmHover: '#0369a1' },
  success:     { accent: '#22c55e', tint: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  glow: 'rgba(34,197,94,0.35)',  Icon: CheckCircle2,  confirmBg: '#16a34a', confirmHover: '#15803d' },
};

// ── Pub/sub so showConfirm can fire from anywhere ────────────────────────────
let resolver = null;
const listeners = new Set();
let idCounter = 0;

export function showConfirm(opts = {}) {
  return new Promise(resolve => {
    resolver = resolve;
    const payload = {
      id: ++idCounter,
      title: opts.title || 'Are you sure?',
      description: opts.description || '',
      variant: opts.variant || 'destructive',
      confirmLabel: opts.confirmLabel || 'Confirm',
      cancelLabel: opts.cancelLabel || 'Cancel',
    };
    listeners.forEach(l => l(payload));
  });
}

// ── Host — mount once at app root ───────────────────────────────────────────
export default function ConfirmDialogHost() {
  const [payload, setPayload] = useState(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    function handle(p) { setPayload(p); }
    listeners.add(handle);
    return () => listeners.delete(handle);
  }, []);

  // Focus cancel by default (safer on destructive dialogs) + esc to cancel
  useEffect(() => {
    if (!payload) return;
    cancelRef.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape') respond(false);
      if (e.key === 'Enter') respond(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  function respond(ok) {
    resolver?.(ok);
    resolver = null;
    setPayload(null);
  }

  if (!payload) return null;
  const v = VARIANTS[payload.variant] || VARIANTS.destructive;
  const { Icon } = v;

  return (
    <>
      <style>{`
        @keyframes tr-confirm-overlay { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tr-confirm-in {
          from { opacity: 0; transform: translate(-50%, -46%) scale(0.96); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
      <div
        role="presentation"
        onClick={() => respond(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 10050,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          animation: 'tr-confirm-overlay 0.15s ease-out',
        }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="tr-confirm-title"
        aria-describedby={payload.description ? 'tr-confirm-desc' : undefined}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10051,
          width: 'min(460px, calc(100vw - 32px))',
          background: `linear-gradient(to right, ${v.tint}, rgba(15,23,35,0.98) 55%)`,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${v.border}`,
          borderLeft: `3px solid ${v.accent}`,
          borderRadius: 12,
          boxShadow: `0 28px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.3), -6px 0 24px -4px ${v.glow}`,
          padding: '20px 22px',
          animation: 'tr-confirm-in 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <button
          type="button"
          onClick={() => respond(false)}
          aria-label="Close"
          style={{
            position: 'absolute', top: 10, right: 10,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#6b7280', padding: 4, lineHeight: 0, borderRadius: 4,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#d1d5db'}
          onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}
        >
          <X size={14} />
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, paddingRight: 16 }}>
          <Icon size={22} style={{ color: v.accent, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              id="tr-confirm-title"
              style={{
                margin: 0, color: '#f3f4f6',
                fontSize: 15, fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.01em',
              }}
            >
              {payload.title}
            </h3>
            {payload.description && (
              <p
                id="tr-confirm-desc"
                style={{
                  margin: '6px 0 0', color: '#9ca3af',
                  fontSize: 13, lineHeight: 1.5,
                }}
              >
                {payload.description}
              </p>
            )}
          </div>
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={() => respond(false)}
            style={{
              padding: '8px 14px', borderRadius: 8,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(255,255,255,0.04)', color: '#d1d5db',
              border: '1px solid rgba(255,255,255,0.1)',
              transition: 'background 0.15s, border-color 0.15s',
              letterSpacing: '-0.005em',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
          >
            {payload.cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => respond(true)}
            style={{
              padding: '8px 16px', borderRadius: 8,
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: v.confirmBg, color: '#fff',
              border: 'none',
              boxShadow: `0 6px 14px -4px ${v.glow}`,
              transition: 'background 0.15s, transform 0.08s',
              letterSpacing: '-0.005em',
            }}
            onMouseEnter={e => e.currentTarget.style.background = v.confirmHover}
            onMouseLeave={e => e.currentTarget.style.background = v.confirmBg}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            {payload.confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
