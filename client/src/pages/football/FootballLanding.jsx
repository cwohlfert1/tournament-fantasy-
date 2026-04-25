import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bell, Users, DollarSign, Grid3X3, ShieldCheck, Calendar, Trophy } from 'lucide-react';
import footballLogo from '../../assets/TourneyRun_Football_Logo_Dark.svg';
import Navbar from '../../components/Navbar';

const BLUE = '#3b82f6';
const BLUE_LIGHT = '#93c5fd';

const FORMATS = [
  {
    name: 'Super Bowl Squares',
    desc: '10×10 grid pool for the Big Game. Claim squares, numbers assigned at kickoff. Score by last digit of each team\'s score.',
    features: ['100 squares per grid', 'Quarterly payouts (Q1, Q2, Q3, Final)', 'Same grid engine as Derby Squares'],
    icon: <Grid3X3 size={28} />,
    ready: true,
  },
  {
    name: 'Survivor Pool',
    desc: 'Pick one team to win each week. If they lose, you\'re eliminated. Use each team only once all season.',
    features: ['Last person standing wins', 'No team reuse — 18 weeks, 32 teams', 'Entry fee + winner-take-all or split'],
    icon: <ShieldCheck size={28} />,
    ready: true,
  },
  {
    name: 'Weekly Pick\'em',
    desc: 'Pick winners for every game each week. Straight up or against the spread. Season-long leaderboard.',
    features: ['Pick all games or select matchups', 'ATS or straight-up options', 'Automated scoring from live results'],
    icon: <Calendar size={28} />,
    ready: true,
  },
  {
    name: 'Confidence Pool',
    desc: 'Pick winners and assign confidence points (1–16). Higher points on locks, lower on toss-ups. Most points wins.',
    features: ['Rank your picks by confidence', 'Strategic depth beyond pick\'em', 'Weekly + season standings'],
    icon: <Trophy size={28} />,
    ready: true,
  },
];

export default function FootballLanding() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleNotify(e) {
    e.preventDefault();
    // For now, just show confirmation — wire to API later
    if (email) setSubmitted(true);
  }

  return (
    <div className="min-h-screen" style={{ background: '#0a0c14' }}>

      {/* ── NAV — same unified Navbar as golf/horses ── */}
      <Navbar variant="football" />

      {/* ── HERO ── */}
      <section style={{ borderBottom: '0.5px solid rgba(59,130,246,0.15)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -200, right: -200, width: 500, height: 500, background: `radial-gradient(circle, ${BLUE}12 0%, transparent 70%)`, pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'clamp(60px,10vw,100px) 24px' }}>
          <div style={{ marginBottom: 24 }}>
            <img src={footballLogo} alt="TourneyRun NFL Pools" style={{ height: 48 }} />
          </div>

          <span style={{
            display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
            background: `${BLUE}18`, color: BLUE_LIGHT, border: `1px solid ${BLUE}30`,
            padding: '5px 14px', borderRadius: 100, marginBottom: 24,
          }}>Coming Fall 2026</span>

          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 3.5rem)', fontWeight: 900, color: '#fff', lineHeight: 1.08, letterSpacing: '-0.03em', marginBottom: 20, maxWidth: 700 }}>
            Every NFL pool format.<br />
            <span style={{ color: BLUE }}>One platform your group already knows.</span>
          </h1>

          <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, maxWidth: 550, marginBottom: 32 }}>
            Super Bowl Squares. Survivor. Pick'em. Confidence. The same invite-link, payment, and payout system your group uses for golf and Derby pools.
          </p>

          {/* Notify form */}
          {submitted ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: BLUE_LIGHT, fontSize: 15, fontWeight: 600 }}>
              <Bell size={18} /> We'll notify you when NFL Pools launches.
            </div>
          ) : (
            <form onSubmit={handleNotify} style={{ display: 'flex', gap: 10, maxWidth: 440 }}>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com" required
                style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '12px 16px', color: '#fff', fontSize: 14 }}
              />
              <button type="submit"
                style={{ background: BLUE, color: '#fff', fontWeight: 800, fontSize: 14, padding: '12px 24px', borderRadius: 10, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Notify Me
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ── FORMATS ── */}
      <section style={{ padding: 'clamp(48px,8vw,80px) 24px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: BLUE, marginBottom: 12 }}>Pool Formats</div>
            <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>Four formats at launch</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {FORMATS.map(({ name, desc, features, icon }) => (
              <div key={name} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(59,130,246,0.1)', borderRadius: 20, overflow: 'hidden' }}>
                <div style={{ height: 3, background: `linear-gradient(90deg, ${BLUE}, ${BLUE_LIGHT} 50%, transparent)` }} />
                <div style={{ padding: 28 }}>
                  <div style={{ color: BLUE, marginBottom: 12 }}>{icon}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 8 }}>{name}</h3>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: 16 }}>{desc}</p>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {features.map(f => (
                      <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        <span style={{ color: BLUE, fontWeight: 800 }}>✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY TOURNEYRUN ── */}
      <section style={{ padding: 'clamp(48px,8vw,80px) 24px', background: `${BLUE}05`, borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: BLUE, marginBottom: 12 }}>Same Platform</div>
            <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>Your group already has accounts</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: <Users size={20} />, title: 'One invite link', desc: 'Same join flow as golf and Derby pools. Text the link, they\'re in.' },
              { icon: <DollarSign size={20} />, title: 'Payments handled', desc: 'Square checkout for entry fees. Venmo/PayPal/Zelle handles for payouts.' },
              { icon: <ArrowRight size={20} />, title: 'Cross-sport groups', desc: 'Your golf league runs a survivor pool in September. Same app, same people.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, textAlign: 'center' }}>
                <div style={{ color: BLUE, marginBottom: 12, display: 'flex', justifyContent: 'center' }}>{icon}</div>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 6 }}>{title}</h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section style={{ padding: 'clamp(48px,8vw,80px) 24px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏈</div>
          <h2 style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.2rem)', fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', marginBottom: 12 }}>NFL season starts September 2026</h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, marginBottom: 32 }}>
            We're building the same platform quality you know from TourneyRun Golf — applied to every NFL pool format your group runs.
          </p>
          <Link to="/"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: `1.5px solid rgba(255,255,255,0.2)`, color: '#fff', fontWeight: 700, fontSize: 15, padding: '13px 28px', borderRadius: 12, textDecoration: 'none' }}>
            Explore TourneyRun <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
