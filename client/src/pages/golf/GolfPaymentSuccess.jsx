import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useDocTitle } from '../../hooks/useDocTitle';

const MESSAGES = {
  season_pass: {
    icon: '⛳',
    title: 'Season Pass activated!',
    body: "You're in for the full 2026 PGA Tour season. Draft your roster, set your lineup every week, and make your run.",
    cta: 'Go to Golf Dashboard',
    href: '/golf/dashboard',
  },
  office_pool: {
    icon: '🏌️',
    title: 'Picks locked in!',
    body: "Your office pool entry is confirmed. Standings update automatically after each round.",
    cta: 'Go to Golf Dashboard',
    href: '/golf/dashboard',
  },
  comm_pro: {
    icon: '🏆',
    title: 'Commissioner Pro unlocked!',
    body: "Full access to commissioner tools — auto-emails, payment tracker, FAAB results, CSV export, and more.",
    cta: 'Open Commissioner Hub',
    href: '/golf/dashboard',
  },
};

export default function GolfPaymentSuccess() {
  useDocTitle('Payment Confirmed | TourneyRun Golf');
  const [params] = useSearchParams();
  const type = params.get('type') || 'season_pass';
  const msg = MESSAGES[type] || MESSAGES.season_pass;
  const [dots, setDots] = useState('');

  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{
        maxWidth: 440,
        width: '100%',
        background: '#0a1a0f',
        border: '1px solid #14532d55',
        borderRadius: 20,
        padding: '40px 32px',
        textAlign: 'center',
      }}>
        {/* Animated check */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: '#14532d33',
          border: '2px solid #22c55e55',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, margin: '0 auto 20px',
        }}>
          {msg.icon}
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#14532d33', border: '1px solid #166534', borderRadius: 20, padding: '4px 12px', marginBottom: 16 }}>
          <span style={{ color: '#4ade80', fontSize: 12, fontWeight: 700 }}>✓ Payment confirmed</span>
        </div>

        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, margin: '0 0 10px' }}>{msg.title}</h1>
        <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.6, margin: '0 0 28px' }}>{msg.body}</p>

        <Link
          to={msg.href}
          style={{
            display: 'block',
            background: '#16a34a',
            color: '#fff',
            fontWeight: 800,
            fontSize: 15,
            textDecoration: 'none',
            padding: '14px 0',
            borderRadius: 12,
            marginBottom: 12,
          }}
        >
          {msg.cta} →
        </Link>

        <Link to="/golf" style={{ color: '#4b5563', fontSize: 13, textDecoration: 'none' }}>
          Back to Golf Home
        </Link>
      </div>
    </div>
  );
}
