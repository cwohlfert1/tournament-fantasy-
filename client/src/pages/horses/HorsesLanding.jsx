import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowRight, Users, Clock, DollarSign, Shield, Smartphone, Trophy } from 'lucide-react';
import horsesLogo from '../../assets/TourneyRun_Horses_Logo_Dark.svg';

const TEAL = '#2AA6A6';
const TEAL_LIGHT = '#5cd4d4';

const FORMATS = [
  {
    name: 'Random Draw',
    desc: 'Every entrant gets randomly assigned a horse at lock time. If your horse wins, you win.',
    features: ['No skill required — pure luck', 'Shared horses if 20+ entrants', 'Auto-draw at post time'],
    icon: '🎲',
  },
  {
    name: 'Pick Win / Place / Show',
    desc: 'Pick one horse for Win (1st), Place (top 2), and Show (top 3). Score points for correct picks.',
    features: ['Default scoring: Win 5 / Place 3 / Show 2', 'No duplicate picks allowed', 'Commissioner-configurable points'],
    icon: '🏆',
  },
  {
    name: 'Squares',
    desc: '10×10 grid pool. Claim squares, numbers assigned at lock. Winning squares determined by post positions.',
    features: ['100 squares, claim up to 10 per person', 'Three winning squares (Win/Place/Show)', 'Unclaimed squares roll down'],
    icon: '🔲',
  },
];

const HOW_IT_WORKS = [
  { step: '1', title: 'Commissioner creates pool', desc: 'Pick a format, set the entry fee, configure payouts. Takes 60 seconds.' },
  { step: '2', title: 'Share invite link', desc: 'Text the link to your group. They join and pay via Square checkout.' },
  { step: '3', title: 'Race happens', desc: 'Pool locks 10 min before post. Random Draw auto-assigns. Picks freeze. Squares lock.' },
  { step: '4', title: 'Enter results, get paid', desc: 'Commissioner enters the finish order. Payouts calculate automatically. Venmo handles displayed.' },
];

const PAIN_POINTS = [
  { before: 'Writing names on scraps of paper', after: 'Digital pool with invite links' },
  { before: 'Arguing about who drew which horse', after: 'Verifiable random assignment with timestamps' },
  { before: 'Doing payout math on your phone calculator', after: 'Automatic payout calculation with admin fee support' },
  { before: 'Chasing people for entry fees', after: 'Square checkout collects before the race' },
  { before: '"Wait, who won the squares pool?"', after: 'Results + payouts emailed to everyone' },
];

export default function HorsesLanding() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen" style={{ background: '#0a0a14' }}>

      {/* ── HERO ── */}
      <section style={{ borderBottom: '0.5px solid rgba(42,166,166,0.15)', position: 'relative', overflow: 'hidden' }}>
        {/* Ambient glow */}
        <div style={{ position: 'absolute', top: -200, right: -200, width: 500, height: 500, background: `radial-gradient(circle, ${TEAL}15 0%, transparent 70%)`, pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'clamp(60px,10vw,100px) 24px' }}>
          <div style={{ marginBottom: 24 }}>
            <img src={horsesLogo} alt="TourneyRun Horse Racing Pools" style={{ height: 48 }} />
          </div>

          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.5rem)', fontWeight: 900, color: '#fff', lineHeight: 1.08, letterSpacing: '-0.03em', marginBottom: 20, maxWidth: 700 }}>
            Derby pools for your party.<br />
            <span style={{ color: TEAL }}>Not a spreadsheet.</span>
          </h1>

          <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: 520, marginBottom: 32 }}>
            Three pool formats. One invite link. Entry fees collected. Payouts calculated. All on your phone at the party.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to={user ? '/horses/create' : '/register'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: TEAL, color: '#fff', fontWeight: 800, fontSize: 15, padding: '14px 28px', borderRadius: 12, textDecoration: 'none', boxShadow: `0 8px 32px ${TEAL}40` }}>
              Create a Pool <ArrowRight size={16} />
            </Link>
            <Link to="/horses/join"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: `1.5px solid rgba(255,255,255,0.2)`, color: '#fff', fontWeight: 700, fontSize: 15, padding: '13px 28px', borderRadius: 12, textDecoration: 'none' }}>
              Join a Pool
            </Link>
          </div>

          <div style={{ marginTop: 32, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[
              { icon: <DollarSign size={14} />, text: 'Free beta — no platform fee' },
              { icon: <Smartphone size={14} />, text: 'Mobile-first, party-ready' },
              { icon: <Shield size={14} />, text: 'Payout math guaranteed correct' },
            ].map(({ icon, text }) => (
              <span key={text} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                <span style={{ color: TEAL }}>{icon}</span> {text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ padding: 'clamp(48px,8vw,80px) 24px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: 12 }}>How It Works</div>
            <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>Pool running in 60 seconds</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {HOW_IT_WORKS.map(({ step, title, desc }) => (
              <div key={step} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${TEAL}18`, border: `1px solid ${TEAL}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900, color: TEAL, marginBottom: 14 }}>{step}</div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 6 }}>{title}</h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── THREE FORMATS ── */}
      <section style={{ padding: 'clamp(48px,8vw,80px) 24px', background: 'rgba(42,166,166,0.03)', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: 12 }}>Pick Your Format</div>
            <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>Three ways to play</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {FORMATS.map(({ name, desc, features, icon }) => (
              <div key={name} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(42,166,166,0.12)', borderRadius: 20, overflow: 'hidden' }}>
                <div style={{ height: 3, background: `linear-gradient(90deg, ${TEAL}, ${TEAL_LIGHT} 50%, transparent)` }} />
                <div style={{ padding: 28 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 8 }}>{name}</h3>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: 16 }}>{desc}</p>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {features.map(f => (
                      <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        <span style={{ color: TEAL, fontWeight: 800 }}>✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PAIN POINTS ── */}
      <section style={{ padding: 'clamp(48px,8vw,80px) 24px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: TEAL, marginBottom: 12 }}>Why TourneyRun</div>
            <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>Stop running pools on napkins</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {PAIN_POINTS.map(({ before, after }) => (
              <div key={before} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, padding: '14px 20px' }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textDecoration: 'line-through' }}>{before}</span>
                <ArrowRight size={14} style={{ color: TEAL, flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{after}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DERBY 2026 CTA ── */}
      <section style={{ padding: 'clamp(48px,8vw,80px) 24px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🐴</div>
          <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', marginBottom: 12 }}>Kentucky Derby 2026</h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 32 }}>
            May 2, 2026 &middot; Churchill Downs &middot; Post time 6:57 PM ET<br />
            Free beta — no platform fee. Create your pool now.
          </p>
          <Link to={user ? '/horses/create' : '/register'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: TEAL, color: '#fff', fontWeight: 800, fontSize: 16, padding: '16px 36px', borderRadius: 14, textDecoration: 'none', boxShadow: `0 8px 32px ${TEAL}40` }}>
            Create Your Derby Pool <ArrowRight size={18} />
          </Link>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: 16 }}>
            Free for Derby 2026. No credit card required to create a pool.
          </p>
        </div>
      </section>
    </div>
  );
}
