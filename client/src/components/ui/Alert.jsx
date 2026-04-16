/**
 * Alert — inline banner component.
 *
 * Same "Broadcast Ticker" design language as Toast: 3px left-edge accent
 * bar in variant color, variant-tinted gradient background, icon → title
 * → description → optional dismiss. Used for persistent banners (form
 * errors, promo callouts, warnings) rather than ephemeral toasts.
 *
 * Usage:
 *   <Alert variant="warning" title="Picks lock Thursday 8am ET">
 *     Lock in your golfers before the deadline.
 *   </Alert>
 *
 *   <Alert variant="destructive" title="Login failed" onClose={() => setErr('')} />
 */
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

const VARIANTS = {
  success:     { accent: '#22c55e', tint: 'rgba(34,197,94,0.06)',  border: 'rgba(34,197,94,0.25)',  Icon: CheckCircle2   },
  destructive: { accent: '#ef4444', tint: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.28)',  Icon: XCircle        },
  warning:     { accent: '#f59e0b', tint: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.28)', Icon: AlertTriangle  },
  info:        { accent: '#38bdf8', tint: 'rgba(56,189,248,0.06)', border: 'rgba(56,189,248,0.26)', Icon: Info           },
  neutral:     { accent: '#6b7280', tint: 'rgba(156,163,175,0.04)', border: 'rgba(156,163,175,0.20)', Icon: Info         },
};

export default function Alert({
  variant = 'info',
  title,
  children,
  onClose,
  action,
  icon: customIcon,
  className = '',
  style = {},
  compact = false,
}) {
  const v = VARIANTS[variant] || VARIANTS.info;
  const Icon = customIcon || v.Icon;

  return (
    <div
      role="alert"
      className={className}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        gap: compact ? 9 : 11,
        padding: compact ? '9px 12px' : '12px 14px',
        borderRadius: 10,
        background: `linear-gradient(to right, ${v.tint}, transparent 80%)`,
        border: `1px solid ${v.border}`,
        borderLeft: `3px solid ${v.accent}`,
        boxShadow: `-4px 0 14px -3px ${v.accent}22`,
        ...style,
      }}
    >
      {Icon && (
        <Icon
          size={compact ? 15 : 17}
          style={{ color: v.accent, flexShrink: 0, marginTop: compact ? 1 : 2 }}
          aria-hidden="true"
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {title && (
          <div style={{
            color: '#f3f4f6',
            fontSize: compact ? 12.5 : 13,
            fontWeight: 600,
            lineHeight: 1.35,
            letterSpacing: '-0.005em',
          }}>
            {title}
          </div>
        )}
        {children && (
          <div style={{
            color: '#9ca3af',
            fontSize: compact ? 11.5 : 12.5,
            lineHeight: 1.5,
            marginTop: title ? 3 : 0,
          }}>
            {children}
          </div>
        )}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            style={{
              marginTop: 7, padding: 0, background: 'none', border: 'none', cursor: 'pointer',
              color: v.accent, fontSize: 12, fontWeight: 600, letterSpacing: '0.01em',
            }}
          >
            {action.label} →
          </button>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
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
      )}
    </div>
  );
}
