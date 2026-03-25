import { useState, useEffect } from 'react';
import { MASTERS_PROMO_END } from '../../utils/mastersPromo';

const TIERS = [
  { orig: '$12.99', promo: '$9.99'  },
  { orig: '$19.99', promo: '$14.99' },
  { orig: '$24.99', promo: '$18.99' },
  { orig: '$34.99', promo: '$26.99' },
  { orig: '$49.99', promo: '$37.99' },
];

function getCountdown() {
  const diff = MASTERS_PROMO_END - new Date();
  if (diff <= 0) return null;
  const days  = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  return { days, hours };
}

export default function MastersPromoBanner() {
  const [countdown, setCountdown] = useState(getCountdown);

  useEffect(() => {
    const iv = setInterval(() => setCountdown(getCountdown()), 60_000);
    return () => clearInterval(iv);
  }, []);

  if (!countdown) return null;

  const { days, hours } = countdown;
  const timeStr = days > 0 ? `${days}d ${hours}h` : `${hours}h`;

  return (
    <div style={{
      maxWidth: 700,
      margin: '0 auto 32px',
      background: 'linear-gradient(135deg, rgba(251,146,60,0.1), rgba(245,158,11,0.07))',
      border: '1.5px solid rgba(251,146,60,0.4)',
      borderRadius: 16,
      padding: '18px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🏌️</span>
          <div>
            <div style={{ color: '#fb923c', fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
              Masters Launch Pricing
            </div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 1.4 }}>
              Pools at our original launch price. Offer ends April 10.
            </div>
          </div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          background: 'rgba(251,146,60,0.15)',
          border: '1px solid rgba(251,146,60,0.3)',
          borderRadius: 8,
          padding: '5px 12px',
          fontSize: 13, fontWeight: 700, color: '#fb923c',
        }}>
          ⏱ {timeStr} left
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {TIERS.map(({ orig, promo }) => (
          <div key={orig} style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid rgba(251,146,60,0.2)',
            borderRadius: 8,
            padding: '5px 11px',
          }}>
            <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: 13, textDecoration: 'line-through' }}>{orig}</span>
            <span style={{ color: '#fb923c', fontSize: 14, fontWeight: 800 }}>{promo}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>
        25% off applied automatically at checkout — no promo code needed
      </div>
    </div>
  );
}
