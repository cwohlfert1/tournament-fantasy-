import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import api from '../../api';

// ── Gate types ────────────────────────────────────────────────────────────────
// type: 'season_pass' | 'office_pool' | 'comm_pro'
// meta: { tournamentName?, isMajor?, leagueName?, memberCount?, membersNeeded?, refCode? }
// onClose: () => void
// onAlreadyPaid: () => void (if server says already paid — proceed)

const DISMISS_KEY = 'golf_gate_dismissed';

function getDismissed() {
  try { return JSON.parse(sessionStorage.getItem(DISMISS_KEY) || '[]'); } catch { return []; }
}
function setDismissed(key) {
  const d = getDismissed();
  if (!d.includes(key)) d.push(key);
  sessionStorage.setItem(DISMISS_KEY, JSON.stringify(d));
}
export function wasGateDismissed(type, id = '') {
  return getDismissed().includes(`${type}:${id}`);
}

function Bullet({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
      <span style={{ color: '#4ade80', fontSize: 14, marginTop: 1, flexShrink: 0 }}>✓</span>
      <span style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

function Overlay({ children, onClose }) {
  // Close on backdrop click
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 0 0 0',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0a1a0f',
          border: '1px solid #14532d55',
          borderRadius: '20px 20px 0 0',
          padding: '28px 24px 32px',
          width: '100%',
          maxWidth: 480,
          maxHeight: '92vh',
          overflowY: 'auto',
        }}
        className="sm:rounded-2xl sm:mb-4"
      >
        {children}
      </div>
    </div>
  );
}

// ── Season Pass Modal ─────────────────────────────────────────────────────────
function SeasonPassModal({ meta, credits, loading, onPay, onClose }) {
  const price = credits > 0 ? Math.max(0, 4.99 - credits).toFixed(2) : '4.99';
  const perTournament = (4.99 / 13).toFixed(2);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <span style={{ background: '#14532d', color: '#4ade80', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 20, border: '1px solid #166534' }}>
          2026 Season Pass
        </span>
        <button onClick={onClose} aria-label="Close" style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0, borderRadius: 4, transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = '#d1d5db'} onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}><X size={16} /></button>
      </div>

      <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 900, margin: '0 0 6px' }}>Unlock the full 2026 season</h2>
      <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 20px', lineHeight: 1.5 }}>One payment. Every PGA Tour event. All season long.</p>

      {/* Comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div style={{ background: '#111', border: '1px solid #1f2937', borderRadius: 12, padding: 14, textAlign: 'center' }}>
          <div style={{ color: '#6b7280', fontSize: 11, marginBottom: 4 }}>Per-tournament pricing</div>
          <div style={{ color: '#ef4444', fontWeight: 800, fontSize: 18, textDecoration: 'line-through' }}>$12.87</div>
          <div style={{ color: '#4b5563', fontSize: 11 }}>13 events × $0.99</div>
        </div>
        <div style={{ background: '#0d2016', border: '1px solid #166534', borderRadius: 12, padding: 14, textAlign: 'center' }}>
          <div style={{ color: '#4ade80', fontSize: 11, marginBottom: 4 }}>Season Pass</div>
          <div style={{ color: '#22c55e', fontWeight: 800, fontSize: 18 }}>$4.99</div>
          <div style={{ color: '#166534', fontSize: 11 }}>just ${perTournament}/event</div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <Bullet>All 13 tournaments covered — one draft, all season</Bullet>
        <Bullet>Full FAAB waiver wire access between events</Bullet>
        <Bullet>Weekly lineup management & automatic standings</Bullet>
        <Bullet>Round-by-round score updates every tournament</Bullet>
        <Bullet>Majors at 1.5× — Masters, PGA, US Open, The Open</Bullet>
      </div>

      {credits > 0 && (
        <div style={{ background: '#0d2016', border: '1px solid #166534', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>💚</span>
          <span style={{ color: '#4ade80', fontSize: 13 }}>Referral credit applied — <strong>−${credits.toFixed(2)}</strong></span>
        </div>
      )}

      <button
        onClick={onPay}
        disabled={loading}
        style={{ width: '100%', padding: '14px 0', background: loading ? '#166534' : '#16a34a', color: '#fff', fontWeight: 800, fontSize: 15, border: 'none', borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer', marginBottom: 10, transition: 'background 0.15s' }}
      >
        {loading ? 'Redirecting…' : `Pay $${price} and join league`}
      </button>
      <button onClick={onClose} style={{ width: '100%', padding: '11px 0', background: 'transparent', color: '#6b7280', fontSize: 13, border: 'none', cursor: 'pointer' }}>
        Maybe later — I'll decide after the draft
      </button>
    </>
  );
}

// ── Office Pool Modal ─────────────────────────────────────────────────────────
function OfficePoolModal({ meta, credits, loading, onPay, onClose }) {
  const price = credits > 0 ? Math.max(0, 0.99 - credits).toFixed(2) : '0.99';

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <span style={{ background: '#451a03', color: '#fbbf24', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 20, border: '1px solid #78350f' }}>
          Office Pool Entry
        </span>
        <button onClick={onClose} aria-label="Close" style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0, borderRadius: 4, transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = '#d1d5db'} onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}><X size={16} /></button>
      </div>

      <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 900, margin: '0 0 4px' }}>
        {meta.tournamentName || 'Tournament Entry'}
        {meta.isMajor && <span style={{ marginLeft: 8, fontSize: 13, color: '#fbbf24', fontWeight: 700 }}>★ MAJOR</span>}
      </h2>
      <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 20px' }}>Lock in your picks for this week's tournament.</p>

      <div style={{ marginBottom: 20 }}>
        <Bullet>Auto-calculated standings updated every round</Bullet>
        <Bullet>Round-completion email with your score</Bullet>
        <Bullet>One-time entry — no recurring charges</Bullet>
        {meta.isMajor && <Bullet>All points multiplied 1.5× — it's a Major!</Bullet>}
      </div>

      {credits > 0 && (
        <div style={{ background: '#0d2016', border: '1px solid #166534', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>💚</span>
          <span style={{ color: '#4ade80', fontSize: 13 }}>Referral credit applied — <strong>−${credits.toFixed(2)}</strong></span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
        <span style={{ color: '#22c55e', fontWeight: 900, fontSize: 28 }}>${price}</span>
        <span style={{ color: '#4b5563', fontSize: 13 }}>one-time entry</span>
      </div>

      <button
        onClick={onPay}
        disabled={loading}
        style={{ width: '100%', padding: '14px 0', background: loading ? '#78350f' : '#d97706', color: '#fff', fontWeight: 800, fontSize: 15, border: 'none', borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer', marginBottom: 10 }}
      >
        {loading ? 'Redirecting…' : `Pay $${price} and lock in picks`}
      </button>
      <button onClick={onClose} style={{ width: '100%', padding: '11px 0', background: 'transparent', color: '#6b7280', fontSize: 13, border: 'none', cursor: 'pointer' }}>
        I'll sit this one out
      </button>
    </>
  );
}

// ── Commissioner Pro Modal ─────────────────────────────────────────────────────
function CommProModal({ meta, loading, onPay, onClose }) {
  const { memberCount = 0, membersNeeded = 6, alreadyUsedPromo = false } = meta;
  const pct = Math.min(100, Math.round((memberCount / 6) * 100));
  const canUnlockFree = !alreadyUsedPromo && membersNeeded > 0;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <span style={{ background: '#2e1065', color: '#a78bfa', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 20, border: '1px solid #4c1d95' }}>
          Commissioner Pro
        </span>
        <button onClick={onClose} aria-label="Close" style={{ color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 4, lineHeight: 0, borderRadius: 4, transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = '#d1d5db'} onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}><X size={16} /></button>
      </div>

      <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 900, margin: '0 0 4px' }}>Run your league like a pro</h2>
      <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 20px' }}>Commissioner tools that save you hours every tournament week.</p>

      <div style={{ marginBottom: 20 }}>
        <Bullet>Auto round-completion emails to all members</Bullet>
        <Bullet>Mass blast — send a message to your entire league</Bullet>
        <Bullet>Payment tracker — see who owes what</Bullet>
        <Bullet>Full member roster management</Bullet>
        <Bullet>CSV export of standings and scores</Bullet>
        <Bullet>FAAB results report after each waiver window</Bullet>
      </div>

      {/* Bring Your League promo */}
      {canUnlockFree && (
        <div style={{ background: '#0d1a2e', border: '1px solid #1e3a5f', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: '#60a5fa', fontSize: 12, fontWeight: 700 }}>🎁 Bring Your League — Unlock Free</span>
            <span style={{ color: '#60a5fa', fontSize: 12, fontWeight: 700 }}>{memberCount}/6</span>
          </div>
          <div style={{ background: '#0f172a', borderRadius: 6, height: 8, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)', borderRadius: 6, transition: 'width 0.4s' }} />
          </div>
          <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>
            Invite <strong style={{ color: '#fff' }}>{membersNeeded} more member{membersNeeded !== 1 ? 's' : ''}</strong> to unlock Commissioner Pro free for 2026. One-time per account.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
        <span style={{ color: '#a78bfa', fontWeight: 900, fontSize: 28 }}>$19.99</span>
        <span style={{ color: '#4b5563', fontSize: 13 }}>/ season</span>
      </div>

      <button
        onClick={onPay}
        disabled={loading}
        style={{ width: '100%', padding: '14px 0', background: loading ? '#4c1d95' : '#7c3aed', color: '#fff', fontWeight: 800, fontSize: 15, border: 'none', borderRadius: 12, cursor: loading ? 'not-allowed' : 'pointer', marginBottom: 10 }}
      >
        {loading ? 'Redirecting…' : 'Unlock Commissioner Pro — $19.99'}
      </button>
      <button onClick={onClose} style={{ width: '100%', padding: '11px 0', background: 'transparent', color: '#6b7280', fontSize: 13, border: 'none', cursor: 'pointer' }}>
        Not now — keep basic access
      </button>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function GolfPaymentModal({ type, meta = {}, onClose, onAlreadyPaid }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    api.get('/golf/payments/status')
      .then(r => setCredits(r.data.referralCredits || 0))
      .catch(() => {});
  }, []);

  async function handlePay() {
    setError('');
    setLoading(true);
    try {
      const refCode = sessionStorage.getItem('golf_ref_code') || undefined;
      const res = await api.post('/golf/payments/create-checkout-session', {
        type,
        leagueId:     meta.leagueId,
        tournamentId: meta.tournamentId,
        refCode,
      });
      if (res.data.alreadyPaid) {
        onAlreadyPaid?.();
        return;
      }
      window.location.href = res.data.url;
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Try again.');
      setLoading(false);
    }
  }

  function handleClose() {
    const id = type === 'office_pool' ? meta.tournamentId : '';
    setDismissed(`${type}:${id}`);
    onClose?.();
  }

  return (
    <Overlay onClose={handleClose}>
      {error && (
        <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', color: '#fca5a5', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}
      {type === 'season_pass' && (
        <SeasonPassModal meta={meta} credits={credits} loading={loading} onPay={handlePay} onClose={handleClose} />
      )}
      {type === 'office_pool' && (
        <OfficePoolModal meta={meta} credits={credits} loading={loading} onPay={handlePay} onClose={handleClose} />
      )}
      {type === 'comm_pro' && (
        <CommProModal meta={meta} loading={loading} onPay={handlePay} onClose={handleClose} />
      )}
    </Overlay>
  );
}
