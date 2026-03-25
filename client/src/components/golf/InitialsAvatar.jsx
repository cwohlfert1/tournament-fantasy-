const ROSTER_TIER_COLORS = {
  1: { bg: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'rgba(245,158,11,0.3)', accent: '#f59e0b', label: '#fbbf24' },
  2: { bg: 'linear-gradient(135deg,#8b5cf6,#7c3aed)', border: 'rgba(139,92,246,0.3)', accent: '#8b5cf6', label: '#a78bfa' },
  3: { bg: 'linear-gradient(135deg,#3b82f6,#2563eb)', border: 'rgba(59,130,246,0.3)', accent: '#3b82f6', label: '#60a5fa' },
  4: { bg: 'linear-gradient(135deg,#10b981,#059669)', border: 'rgba(16,185,129,0.3)', accent: '#10b981', label: '#34d399' },
};

export default function InitialsAvatar({ name, tier, size = 44 }) {
  const tc = ROSTER_TIER_COLORS[tier] || ROSTER_TIER_COLORS[4];
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: tc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.36, flexShrink: 0,
      boxShadow: `0 2px 8px ${tc.border}`,
    }}>{initials}</div>
  );
}
