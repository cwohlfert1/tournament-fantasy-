import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useDocTitle } from '../hooks/useDocTitle';
import api from '../api';
import MastersPromoBanner from '../components/golf/MastersPromoBanner';

// ── CSS Animations ────────────────────────────────────────────────────────────

const HUB_CSS = `
  @keyframes hub-drift1 {
    0%,100% { transform: translate(0px,0px) scale(1); }
    25%      { transform: translate(80px,-60px) scale(1.08); }
    50%      { transform: translate(40px,80px) scale(0.95); }
    75%      { transform: translate(-50px,30px) scale(1.03); }
  }
  @keyframes hub-drift2 {
    0%,100% { transform: translate(0px,0px) scale(1); }
    25%      { transform: translate(-90px,50px) scale(1.05); }
    50%      { transform: translate(-30px,-70px) scale(0.97); }
    75%      { transform: translate(60px,-20px) scale(1.04); }
  }
  @keyframes hub-drift3 {
    0%,100% { transform: translate(0px,0px); }
    50%      { transform: translate(40px,-40px); }
  }
  @keyframes hub-float {
    0%,100% { transform: translateY(0px); }
    50%      { transform: translateY(-14px); }
  }
  @keyframes hub-float2 {
    0%,100% { transform: translateY(0px); }
    50%      { transform: translateY(-10px); }
  }
  @keyframes hub-fadeup {
    from { opacity:0; transform:translateY(28px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes hub-fadeup2 {
    from { opacity:0; transform:translateY(28px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes hub-fadeup3 {
    from { opacity:0; transform:translateY(28px); }
    to   { opacity:1; transform:translateY(0); }
  }
  .hub-a1 { animation: hub-fadeup  0.65s ease both; }
  .hub-a2 { animation: hub-fadeup2 0.65s ease 0.12s both; }
  .hub-a3 { animation: hub-fadeup3 0.65s ease 0.24s both; }
  .hub-float  { animation: hub-float  4s ease-in-out infinite; }
  .hub-float2 { animation: hub-float2 4s ease-in-out 1.1s infinite; }
  .hub-card-hover {
    transition: border-color 0.2s, transform 0.25s, box-shadow 0.25s;
  }
  .hub-card-hover:hover {
    transform: translateY(-6px);
    box-shadow: 0 32px 80px rgba(0,0,0,0.5) !important;
  }
  .hub-btn-hover {
    transition: transform 0.18s, box-shadow 0.18s, opacity 0.18s;
  }
  .hub-btn-hover:hover { transform: scale(1.03); }
  .hub-link-hover { transition: color 0.15s; }
  .hub-link-hover:hover { color: #fff !important; }
  .hub-step-card {
    transition: border-color 0.2s, background 0.2s;
  }
  .hub-step-card:hover {
    border-color: rgba(0,204,106,0.25) !important;
    background: rgba(0,204,106,0.04) !important;
  }
  .hub-steps-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  @media (max-width: 767px) {
    .hub-steps-grid {
      grid-template-columns: 1fr !important;
    }
    .hub-steps-grid .hub-step-card {
      padding: 24px 20px !important;
      text-align: left !important;
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
    .hub-steps-grid .hub-step-card > div:first-child {
      width: 48px !important;
      height: 48px !important;
      font-size: 20px !important;
      flex-shrink: 0;
      margin: 0 !important;
    }
  }
`;

// ── Favicon ───────────────────────────────────────────────────────────────────

const TR_FAVICON = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='18' fill='%23111'/><text x='50' y='72' text-anchor='middle' font-family='system-ui,sans-serif' font-weight='900' font-size='52' fill='white'>TR</text></svg>`;

function useHubFavicon() {
  useEffect(() => {
    const setIcon = (el) => { if (el) el.href = TR_FAVICON; };
    setIcon(document.querySelector("link[rel*='icon']"));
    setIcon(document.querySelector("link[rel*='apple-touch-icon']"));
  }, []);
}

// ── My Leagues dropdown ───────────────────────────────────────────────────────

function MyLeaguesDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = () => {
    setOpen(false);
    logout();
    navigate('/');
  };

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const Chevron = ({ up }) => (
    <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0 }}>
      <path d={up ? 'M1 5L5 1L9 5' : 'M1 1L5 5L9 1'} stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'rgba(0,232,122,0.1)',
          border: '0.5px solid rgba(0,232,122,0.3)',
          color: '#22c55e', fontSize: 13, fontWeight: 600,
          padding: '8px 18px', borderRadius: 7, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 7,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,232,122,0.16)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,232,122,0.1)'}
      >
        My Leagues <Chevron up={open} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          background: '#13131f',
          border: '0.5px solid rgba(255,255,255,0.12)',
          borderRadius: 10, padding: 6, minWidth: 180, zIndex: 200,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          {[
            { to: '/golf/dashboard', dot: '#22c55e', label: 'Golf Leagues' },
            { to: '/horses/dashboard', dot: '#2AA6A6', label: 'Horse Racing' },
            { to: '/basketball/dashboard', dot: '#ff8c00', label: 'College Basketball' },
          ].map(({ to, dot, label }) => (
            <Link
              key={to} to={to} onClick={() => setOpen(false)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', color: '#fff', fontSize: 13, textDecoration: 'none', fontWeight: 500, borderRadius: 6 }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
              {label}
            </Link>
          ))}
          <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
          <Link
            to="/account/profile" onClick={() => setOpen(false)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', color: '#9ca3af', fontSize: 13, textDecoration: 'none', fontWeight: 500, borderRadius: 6 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
            </svg>
            Profile
          </Link>
          <div style={{ height: '0.5px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
          <button
            onClick={handleSignOut}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', color: '#6b7280', fontSize: 13, fontWeight: 500, borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

// ── Referral Section ──────────────────────────────────────────────────────────

const REFERRAL_STEPS = [
  { n: '1', title: 'Share your link',    desc: 'Text it to whoever runs your pool' },
  { n: '2', title: 'They set up a pool', desc: 'No spreadsheets. No group chat chaos.' },
  { n: '3', title: 'You both save 50%',  desc: 'Half off your next tournament. No strings.' },
];

function ReferralSection() {
  const { user, token } = useAuth();
  const [refLink, setRefLink]   = useState('');
  const [copied, setCopied]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [refError, setRefError] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api.get('/auth/referral/my-code')
      .then(r => setRefLink(r.data.link || ''))
      .catch(() => setRefError(true))
      .finally(() => setLoading(false));
  }, [token]);

  const handleCopy = () => {
    navigator.clipboard.writeText(refLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const smsBody = encodeURIComponent(
    `Hey — we should run our pool on TourneyRun instead of the spreadsheet. ` +
    `Auto scoring, live standings, starting at $12.99/tournament. ` +
    `Use my link and we both get 50% off: ${refLink || 'tourneyrun.app/ref/...'}`
  );

  const displayLink = refLink.replace(/^https?:\/\//, '');

  return (
    <section style={{ padding: 'clamp(64px,10vw,96px) 24px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Eyebrow + headline */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 14 }}>
            Refer a Commissioner
          </div>
          <h2 style={{ margin: '0 0 16px', fontSize: 'clamp(1.9rem,4.5vw,3rem)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff' }}>
            Still running your pool in a group chat?
          </h2>
          <p style={{ margin: '0 auto', fontSize: 16, color: 'rgba(255,255,255,0.5)', maxWidth: 580, lineHeight: 1.7 }}>
            Send your commissioner the link. If they set up a pool on TourneyRun, you both get{' '}
            <span style={{ color: '#22c55e', fontWeight: 700 }}>50% off</span>{' '}
            your next tournament — starting at $12.99/tournament.
          </p>
        </div>

        {/* Three steps */}
        <div className="hub-steps-grid" style={{ display: 'grid', gap: 16, marginBottom: 48 }}>
          {REFERRAL_STEPS.map(({ n, title, desc }) => (
            <div key={n} className="hub-step-card" style={{
              background: 'rgba(255,255,255,0.025)',
              border: '0.5px solid rgba(255,255,255,0.07)',
              borderRadius: 16, padding: '28px 24px', textAlign: 'center',
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
                color: '#f59e0b', fontWeight: 900, fontSize: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 16px',
              }}>
                {n}
              </div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#fff', marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>

        {/* Referral input or CTA */}
        <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
          {user ? (
            loading ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>Loading your link…</div>
            ) : refError ? (
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Couldn't load your referral link. Try refreshing.</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                  <input
                    readOnly
                    value={displayLink}
                    onClick={e => e.target.select()}
                    style={{
                      flex: 1, background: 'rgba(255,255,255,0.05)',
                      border: '0.5px solid rgba(255,255,255,0.12)',
                      borderRadius: 10, padding: '12px 16px',
                      color: 'rgba(255,255,255,0.8)', fontSize: 14,
                      outline: 'none', cursor: 'text', fontFamily: 'monospace',
                    }}
                  />
                  <button
                    onClick={handleCopy}
                    style={{
                      background: copied ? '#16a34a' : '#22c55e',
                      color: '#fff', fontWeight: 700, fontSize: 14,
                      padding: '12px 20px', borderRadius: 10, border: 'none',
                      cursor: 'pointer', whiteSpace: 'nowrap', minWidth: 104,
                      transition: 'background 0.15s',
                    }}
                  >
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>
                <a
                  href={`sms:?&body=${smsBody}`}
                  style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textDecoration: 'none', transition: 'color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
                >
                  Or text your commissioner directly →
                </a>
              </>
            )
          ) : (
            <Link
              to="/register"
              style={{
                display: 'inline-block',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: '#fff', fontWeight: 800, fontSize: 15,
                padding: '14px 32px', borderRadius: 12,
                textDecoration: 'none', letterSpacing: '0.01em',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              Sign up to get your referral link →
            </Link>
          )}

          {/* Pricing footnote */}
          <p style={{ margin: '20px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.2)', lineHeight: 1.6 }}>
            From $12.99/tournament · up to 20 players · $19.99 up to 40 · $24.99 up to 60 · $34.99 up to 100 · $49.99 up to 300 · Enterprise $69.99
          </p>
        </div>

      </div>
    </section>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function HubLanding() {
  useHubFavicon();
  useDocTitle('TourneyRun | Fantasy Sports Leagues', {
    description: 'Run fantasy leagues for golf office pools and basketball. Invite your crew, set your buy-in, and keep 100% of the prize pool.',
  });
  const { user } = useAuth();

  useEffect(() => {
    const el = document.createElement('style');
    el.id = 'hub-landing-css';
    el.textContent = HUB_CSS;
    document.head.appendChild(el);
    return () => document.getElementById('hub-landing-css')?.remove();
  }, []);

  return (
    <div style={{ background: '#080810', minHeight: '100vh', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", color: '#fff', overflowX: 'hidden' }}>

      {/* ──────────────────── NAV ──────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: '#0a0a14',
        borderLeft: '3px solid #22c55e',
        borderBottom: '0.5px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <Link to="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: '#fff' }}>
              tourney<span style={{ color: '#22c55e' }}>run</span>
            </span>
          </Link>

          {/* Center nav — pill container, desktop only */}
          <div className="hidden md:flex" style={{
            background: 'rgba(255,255,255,0.04)',
            border: '0.5px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            overflow: 'hidden',
          }}>
            {[
              { to: '/golf', label: 'Golf' },
              { to: '/basketball', label: 'Basketball' },
              { to: '/golf/faq', label: 'FAQ' },
            ].map(({ to, label }, i, arr) => (
              <Link key={to} to={to}
                style={{
                  padding: '8px 18px', color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500,
                  textDecoration: 'none', display: 'block',
                  borderRight: i < arr.length - 1 ? '0.5px solid rgba(255,255,255,0.1)' : 'none',
                  transition: 'color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; e.currentTarget.style.background = 'transparent'; }}
              >
                {label}
              </Link>
            ))}
          </div>

          {/* Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {user ? (
              <MyLeaguesDropdown />
            ) : (
              <>
                <Link to="/login"
                  className="hidden md:inline-flex items-center border border-gray-600 text-gray-300 hover:text-white hover:border-gray-400 px-4 py-1.5 rounded-full text-sm transition-all"
                  style={{ textDecoration: 'none' }}
                >
                  Sign In
                </Link>
                <Link to="/register"
                  style={{
                    background: '#22c55e', color: '#001a0d',
                    fontSize: 13, fontWeight: 700,
                    padding: '8px 22px', borderRadius: 7, textDecoration: 'none',
                    transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ──────────────────── HERO ─────────────────────────────────────────── */}
      <section style={{ position: 'relative', minHeight: '93vh', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>

        {/* Background orbs */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', width: 700, height: 700, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,204,106,0.1) 0%, transparent 65%)',
            top: -150, left: -150,
            animation: 'hub-drift1 22s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', width: 600, height: 600, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,107,0,0.09) 0%, transparent 65%)',
            bottom: -100, right: -100,
            animation: 'hub-drift2 28s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', width: 350, height: 350, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 65%)',
            top: '35%', right: '28%',
            animation: 'hub-drift3 16s ease-in-out 4s infinite',
          }} />
          {/* Grid texture */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }} />
        </div>

        <div style={{ maxWidth: 1200, margin: '0 auto', padding: 'clamp(60px,10vw,100px) 24px', width: '100%', position: 'relative', zIndex: 1 }}>
          <div className="grid md:grid-cols-2 gap-12 lg:gap-20 items-center">

            {/* ── LEFT: Text ── */}
            <div>
              {/* Eyebrow */}
              <div className="hub-a1" style={{ marginBottom: 30 }}>
                <Link to="/golf" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.28)',
                  color: '#fbbf24', borderRadius: 100, padding: '7px 18px',
                  fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', textDecoration: 'none',
                  transition: 'background 0.2s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.18)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.1)'}
                >
                  ⚡ Masters in 19 days — Get Your Pool In →
                </Link>
              </div>

              {/* Headline */}
              <h1 className="hub-a2" style={{ margin: '0 0 24px', lineHeight: 0.93, letterSpacing: '-0.035em', fontWeight: 900 }}>
                <span style={{ display: 'block', fontSize: 'clamp(3.2rem, 8.5vw, 6rem)', color: '#ffffff' }}>PLAY WITH</span>
                <span style={{ display: 'block', fontSize: 'clamp(3.2rem, 8.5vw, 6rem)', color: '#ffffff' }}>YOUR CREW.</span>
                <span style={{
                  display: 'block', fontSize: 'clamp(3.2rem, 8.5vw, 6rem)',
                  background: 'linear-gradient(135deg, #00ff88, #16a34a, #0d9488)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}>WIN FOR REAL.</span>
              </h1>

              {/* Sub */}
              <p className="hub-a3" style={{ margin: '0 0 42px', fontSize: 'clamp(1rem, 2vw, 1.15rem)', color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: 460 }}>
                Golf fantasy, office pools, and college basketball — all in one place. One draft, all season.
              </p>

              {/* CTAs */}
              <div className="hub-a3" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <Link to={user ? '/golf/dashboard' : '/golf'}
                  className="hub-btn-hover"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: 'linear-gradient(135deg, #16a34a, #059669)',
                    color: '#fff', fontWeight: 800, fontSize: 15,
                    padding: '15px 30px', borderRadius: 16, textDecoration: 'none',
                    boxShadow: '0 0 36px rgba(0,204,106,0.4)',
                  }}
                >
                  ⛳ {user ? 'My Golf Leagues' : 'Start a Golf League'}
                </Link>
                <Link to={user ? '/basketball/dashboard' : '/basketball'}
                  className="hub-btn-hover"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1.5px solid rgba(255,255,255,0.18)',
                    color: 'rgba(255,255,255,0.85)', fontWeight: 700, fontSize: 15,
                    padding: '15px 30px', borderRadius: 16, textDecoration: 'none',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                >
                  🏀 {user ? 'My Leagues' : 'College Basketball →'}
                </Link>
              </div>
            </div>

            {/* ── RIGHT: Floating product cards ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Golf card */}
              <div className="hub-float hub-card-hover" style={{
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(28px)',
                border: '1px solid rgba(0,204,106,0.2)',
                borderRadius: 22, overflow: 'hidden',
                boxShadow: '0 24px 64px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
              }}>
                <div style={{ height: 2, background: 'linear-gradient(90deg, #00ff88, #16a34a 40%, transparent)' }} />
                <div style={{ padding: '22px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 24 }}>⛳</span>
                      <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', color: '#fff' }}>FANTASY GOLF</span>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                      background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.3)',
                      padding: '4px 10px', borderRadius: 100,
                    }}>FEATURED · 2026 LIVE</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {[
                      { icon: '🏆', name: 'Season Long', desc: 'Full PGA season' },
                      { icon: '⛳', name: 'Office Pool', desc: 'Per tournament' },
                      { icon: '💰', name: 'Salary Cap', desc: 'Budget-based picks' },
                    ].map(({ icon, name, desc }) => (
                      <div key={name} style={{
                        flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 14, padding: '14px 8px', textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 20, marginBottom: 7 }}>{icon}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#d1d5db', marginBottom: 3 }}>{name}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{desc}</div>
                      </div>
                    ))}
                  </div>
                  <Link to={user ? '/golf/dashboard' : '/golf'} style={{
                    display: 'block', marginTop: 16, textAlign: 'center',
                    background: 'linear-gradient(135deg, #16a34a, #059669)',
                    color: '#fff', fontWeight: 700, fontSize: 13,
                    padding: '11px 0', borderRadius: 12, textDecoration: 'none',
                    boxShadow: '0 4px 20px rgba(0,204,106,0.25)',
                    transition: 'opacity 0.15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    {user ? 'My Golf Leagues →' : 'Get Started →'}
                  </Link>
                </div>
              </div>

              {/* Basketball card */}
              <div className="hub-float2 hub-card-hover" style={{
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(28px)',
                border: '1px solid rgba(249,115,22,0.2)',
                borderRadius: 22, overflow: 'hidden',
                boxShadow: '0 24px 64px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
                marginLeft: 28,
              }}>
                <div style={{ height: 2, background: 'linear-gradient(90deg, #ff6b00, #ff9500 40%, transparent)' }} />
                <div style={{ padding: '22px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 24 }}>🏀</span>
                      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: '#fff' }}>COLLEGE BASKETBALL</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { icon: '🎯', text: 'Draft college players' },
                      { icon: '📊', text: 'Score as they win games' },
                      { icon: '🏆', text: '3 weeks, one champion' },
                      { icon: '👥', text: 'Up to 12 teams' },
                    ].map(({ icon, text }) => (
                      <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                        <span style={{
                          width: 30, height: 30, borderRadius: 8,
                          background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.15)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 15,
                        }}>{icon}</span>
                        {text}
                      </div>
                    ))}
                  </div>
                  <Link to={user ? '/basketball/dashboard' : '/basketball'} style={{
                    display: 'block', marginTop: 18, textAlign: 'center',
                    background: 'linear-gradient(135deg, #ff6b00, #ff9500)',
                    color: '#fff', fontWeight: 700, fontSize: 13,
                    padding: '11px 0', borderRadius: 12, textDecoration: 'none',
                    boxShadow: '0 4px 20px rgba(249,115,22,0.25)',
                    transition: 'opacity 0.15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    {user ? 'My Leagues →' : 'Get Started →'}
                  </Link>
                </div>
              </div>

              {/* Horse Racing card */}
              <div className="hub-float hub-card-hover" style={{
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(28px)',
                border: '1px solid rgba(42,166,166,0.3)',
                borderRadius: 22, overflow: 'hidden',
                animationDelay: '1.2s',
              }}>
                <div style={{ height: 2, background: 'linear-gradient(90deg, #2AA6A6, #36bfbf 40%, transparent)' }} />
                <div style={{ padding: '22px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <svg viewBox="0 0 384 512" style={{ width: 20, height: 20 }}>
                        <path fill="#5cd4d4" d="M19 345.5l-10.1 10.1c-4.7 4.7-12.3 4.7-17 0l-5.7-5.7c-4.7-4.7-4.7-12.3 0-17l6.1-6.1c-3.1-6.2-5.1-13.2-5.1-20.5V208c0-34.2 19.1-63.8 47.2-79.1C24.4 112.2 16 91.5 16 68.8 16 30.8 46.8 0 84.8 0c11.8 0 22.9 3 32.6 8.2C125.5 3.1 134.5 0 144 0c44.2 0 80 35.8 80 80v16.2c18.8 15.3 37.6 34.6 37.6 78.4 0 4.1-.3 8.1-.8 12L304 208c12.4 4.4 22.4 13.3 28.2 24.8l38.1 76.2c6.1 12.2 8.8 25.8 7.7 39.4l-4.5 58.4C371.7 429.1 352.5 448 330.2 448H192c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64v-38.5zm64-188.9V306c0 5.5 4.5 10 10 10h2.3c4 0 7.5-2.4 9.1-6l48-112c2.8-6.5-2.1-13.6-9.1-13.6H96.8c-8 0-13.8 7.7-13.8 15.1V156.6zM80 96a16 16 0 1 0 0-32 16 16 0 1 0 0 32z"/>
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: '#fff' }}>HORSE RACING</span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#5cd4d4', background: 'rgba(42,166,166,0.2)', border: '1px solid rgba(42,166,166,0.3)', padding: '3px 8px', borderRadius: 6, letterSpacing: '0.04em' }}>DERBY 2026</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      { text: 'Random Draw — horses assigned at lock' },
                      { text: 'Pick Win / Place / Show' },
                      { text: 'Squares — 10x10 grid pools' },
                    ].map(({ text }) => (
                      <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                        <span style={{
                          width: 30, height: 30, borderRadius: 8,
                          background: 'rgba(42,166,166,0.1)', border: '1px solid rgba(42,166,166,0.15)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, color: '#5cd4d4',
                        }}>&#x2713;</span>
                        {text}
                      </div>
                    ))}
                  </div>
                  <Link to={user ? '/horses/dashboard' : '/horses/dashboard'} style={{
                    display: 'block', marginTop: 18, textAlign: 'center',
                    background: 'linear-gradient(135deg, #2AA6A6, #36bfbf)',
                    color: '#fff', fontWeight: 700, fontSize: 13,
                    padding: '11px 0', borderRadius: 12, textDecoration: 'none',
                    boxShadow: '0 4px 20px rgba(42,166,166,0.25)',
                    transition: 'opacity 0.15s',
                  }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    Derby Pools →
                  </Link>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────── PRODUCT CARDS ────────────────────────────────── */}
      <section style={{ padding: 'clamp(64px,10vw,100px) 24px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#16a34a', marginBottom: 14 }}>Choose Your Game</div>
            <h2 style={{ margin: 0, fontSize: 'clamp(1.9rem, 4.5vw, 3rem)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff', lineHeight: 1.1 }}>
              Two sports. One platform.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* Golf */}
            <div className="hub-card-hover" style={{
              background: 'rgba(255,255,255,0.03)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(0,204,106,0.15)',
              borderRadius: 24, overflow: 'hidden',
              boxShadow: '0 0 60px rgba(0,204,106,0.05)',
            }}>
              <div style={{ height: 3, background: 'linear-gradient(90deg, #00ff88, #16a34a 50%, transparent)' }} />
              <div style={{ padding: 'clamp(24px,4vw,36px)' }}>
                <div style={{ marginBottom: 20 }}>
                  <span style={{
                    display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                    background: 'rgba(0,204,106,0.12)', color: '#16a34a', border: '1px solid rgba(0,204,106,0.25)',
                    padding: '4px 12px', borderRadius: 100, marginBottom: 16,
                  }}>FEATURED · 2026 PGA Season Live</span>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>⛳</div>
                  <h3 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>Fantasy Golf</h3>
                  <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65 }}>
                    PGA Tour season-long fantasy, office pools, and salary cap. One platform, every format.
                  </p>
                </div>
                <ul style={{ margin: '0 0 28px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {['Season-long auction draft', 'Masters & major office pools', 'Salary cap leagues', 'Majors score 1.5×'].map(b => (
                    <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>
                      <span style={{ color: '#16a34a', fontWeight: 800, flexShrink: 0 }}>✓</span>{b}
                    </li>
                  ))}
                </ul>
                <Link to={user ? '/golf/dashboard' : '/golf'}
                  className="hub-btn-hover"
                  style={{
                    display: 'block', textAlign: 'center', textDecoration: 'none',
                    background: 'linear-gradient(135deg, #16a34a, #059669)',
                    color: '#fff', fontWeight: 800, fontSize: 15,
                    padding: '14px 0', borderRadius: 14,
                    boxShadow: '0 8px 32px rgba(0,204,106,0.3)',
                  }}
                >
                  {user ? 'My Golf Leagues →' : 'Get Started →'}
                </Link>
              </div>
            </div>

            {/* Basketball */}
            <div className="hub-card-hover" style={{
              background: 'rgba(255,255,255,0.03)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(249,115,22,0.15)',
              borderRadius: 24, overflow: 'hidden',
              boxShadow: '0 0 60px rgba(249,115,22,0.04)',
            }}>
              <div style={{ height: 3, background: 'linear-gradient(90deg, #ff6b00, #ff9500 50%, transparent)' }} />
              <div style={{ padding: 'clamp(24px,4vw,36px)' }}>
                <div style={{ marginBottom: 20 }}>
                  <span style={{
                    display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
                    background: 'rgba(249,115,22,0.12)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.25)',
                    padding: '4px 12px', borderRadius: 100, marginBottom: 16,
                  }}>2026 Tournament · Starting Soon</span>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🏀</div>
                  <h3 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>Fantasy Basketball</h3>
                  <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65 }}>
                    Draft college players. Score points as they win tournament games. 3 weeks, one champion.
                  </p>
                </div>
                <ul style={{ margin: '0 0 28px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {['Snake or auction draft', 'Live scoring all tournament', 'Player pool format', 'Up to 12 teams'].map(b => (
                    <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>
                      <span style={{ color: '#ff6b00', fontWeight: 800, flexShrink: 0 }}>✓</span>{b}
                    </li>
                  ))}
                </ul>
                <Link to={user ? '/basketball/dashboard' : '/basketball'}
                  className="hub-btn-hover"
                  style={{
                    display: 'block', textAlign: 'center', textDecoration: 'none',
                    background: 'linear-gradient(135deg, #ff6b00, #ff9500)',
                    color: '#fff', fontWeight: 800, fontSize: 15,
                    padding: '14px 0', borderRadius: 14,
                    boxShadow: '0 8px 32px rgba(249,115,22,0.3)',
                  }}
                >
                  {user ? 'My Leagues →' : 'Get Started →'}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────── FEATURE STRIP ────────────────────────────────── */}
      <section style={{ padding: '40px 24px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 12 }}>
          {[
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              ),
              title: 'Live PGA Scoreboard',
              desc: 'Round-by-round scores sync automatically from ESPN. No spreadsheets.',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="8.5" cy="9" r="1.5" fill="#22c55e" stroke="none"/>
                  <circle cx="15.5" cy="9" r="1.5" fill="#22c55e" stroke="none"/>
                  <circle cx="12" cy="13" r="1.5" fill="#22c55e" stroke="none"/>
                </svg>
              ),
              title: 'Golf-Specific Platform',
              desc: 'Built only for golf pools. Not a generic sports app with a golf tab.',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23"/>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              ),
              title: 'From $12.99/tournament',
              desc: 'No prize pool fees. Your group keeps every dollar.',
            },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{
              display: 'flex', alignItems: 'flex-start', gap: 14,
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14,
              padding: '18px 20px',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {icon}
              </div>
              <div>
                <div style={{ color: '#f9fafb', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{title}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 1.55 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────────────── HOW IT WORKS ─────────────────────────────────── */}
      <section style={{ padding: 'clamp(64px,10vw,100px) 24px', borderTop: '0.5px solid rgba(255,255,255,0.06)', position: 'relative' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 68 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#16a34a', marginBottom: 14 }}>How It Works</div>
            <h2 style={{ margin: 0, fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              <span style={{ color: '#fff' }}>Three steps. </span>
              <span style={{
                background: 'linear-gradient(135deg, #00ff88, #16a34a)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>That's it.</span>
            </h2>
          </div>

          <div className="hub-steps-grid" style={{ display: 'grid', gap: 16, position: 'relative' }}>
            {/* Connecting dashed line — desktop only */}
            <div className="hidden md:block" style={{
              position: 'absolute', top: 44, left: '20%', right: '20%', height: 1,
              backgroundImage: 'linear-gradient(90deg, rgba(0,204,106,0.3) 50%, transparent 50%)',
              backgroundSize: '12px 1px',
              zIndex: 0,
            }} />

            {[
              { num: '01', icon: '📋', title: 'PICK YOUR PLAYERS', body: 'Draft once before the season — or pick new golfers every tournament. Snake draft, auction draft, or simple pick sheet.', sub: 'Golf: auction or snake draft. Pool: simple pick sheet. No experience needed.' },
              { num: '02', icon: '📊', title: 'SCORE AS THEY PLAY', body: 'Points update live every round. Majors count 1.5×. Watch your league move in real time.', sub: 'We sync scores automatically from ESPN. No manual entry, ever.' },
              { num: '03', icon: '🏆', title: 'TAKE THE PRIZE', body: 'Highest score wins. Commissioner handles payouts. We track everything for you.', sub: 'Commissioner sets payouts. We show who owes who. You collect.' },
            ].map(({ num, icon, title, body, sub }) => (
              <div key={num} className="hub-step-card" style={{
                textAlign: 'center', padding: '32px 28px',
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 20, position: 'relative', zIndex: 1,
              }}>
                <div style={{
                  width: 76, height: 76, borderRadius: '50%',
                  background: 'rgba(0,204,106,0.07)', border: '1px solid rgba(0,204,106,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 18px', fontSize: 30,
                }}>
                  {icon}
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', letterSpacing: '0.18em', marginBottom: 12 }}>{num}</div>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', color: '#f9fafb' }}>{title}</h3>
                <p style={{ margin: '0 0 12px', fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.75 }}>{body}</p>
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(0,204,106,0.6)', lineHeight: 1.65, fontStyle: 'italic' }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────── FORMATS ──────────────────────────────────────── */}
      <section style={{ padding: 'clamp(64px,10vw,96px) 24px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 14 }}>Play How You Want</div>
            <h2 style={{ margin: 0, fontSize: 'clamp(1.9rem, 4.5vw, 3rem)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff' }}>
              Three formats. One platform.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
            {[
              { icon: '🗓️', title: 'Season-Long Fantasy', desc: 'Draft once, compete all season. Waiver wire, weekly lineups, FAAB bidding.', tag: '→ Golf & College Basketball' },
              { icon: '📋', title: 'Office Pool', desc: 'No draft needed. Pick your players each tournament. Perfect for casual groups.', tag: '→ Golf only' },
              { icon: '💰', title: 'Salary Cap', desc: 'New roster every tournament. Budget-based picks, no season commitment.', tag: '→ Golf only' },
            ].map(({ icon, title, desc, tag }) => (
              <div key={title}
                className="hub-card-hover"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  backdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 20, padding: '28px 24px',
                }}
              >
                <div style={{ fontSize: 34, marginBottom: 16 }}>{icon}</div>
                <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 800, color: '#f9fafb', letterSpacing: '-0.01em' }}>{title}</h3>
                <p style={{ margin: '0 0 20px', fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>{desc}</p>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────── PRICING ─────────────────────────────────────── */}
      <section style={{ padding: 'clamp(64px,10vw,96px) 24px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <MastersPromoBanner />
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 14 }}>Pricing</div>
            <h2 style={{ margin: '0 0 12px', fontSize: 'clamp(1.9rem, 4.5vw, 3rem)', fontWeight: 900, letterSpacing: '-0.03em', color: '#fff' }}>
              We charge a flat fee per tournament. That's it.
            </h2>
            <p style={{ margin: 0, fontSize: 16, color: 'rgba(255,255,255,0.4)' }}>The bigger your pool, the worse the deal gets on other platforms. With us, you pay once — whether it's 8 players or 80.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 40, alignItems: 'center' }}>
            {/* Left — statement */}
            <div>
              <p style={{ margin: '0 0 16px', fontSize: 'clamp(1.5rem,3vw,2.2rem)', fontWeight: 900, color: '#fff', lineHeight: 1.2, letterSpacing: '-0.02em' }}>
                From <span style={{ color: '#22c55e' }}>$12.99</span> per tournament.
              </p>
              <p style={{ margin: '0 0 12px', fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75 }}>
                Zero prize pool fees. Zero subscriptions.
              </p>
              <p style={{ margin: '0 0 32px', fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75 }}>
                Your $100 buy-in? <span style={{ color: '#22c55e', fontWeight: 700 }}>Your crew keeps $100.</span>
              </p>
              <Link to="/golf" style={{
                display: 'inline-block', padding: '12px 28px',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                color: '#001a0d', fontWeight: 800, fontSize: 14,
                borderRadius: 10, textDecoration: 'none',
                letterSpacing: '0.02em',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                Start your free league →
              </Link>
            </div>

            {/* Right — comparison table */}
            <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, overflow: 'hidden' }}>
              {/* Header row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ padding: '14px 16px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase' }} />
                <div style={{ padding: '14px 16px', fontSize: 12, fontWeight: 800, color: '#f59e0b', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center', background: 'rgba(245,158,11,0.06)', borderLeft: '1px solid rgba(245,158,11,0.15)', borderRight: '1px solid rgba(245,158,11,0.15)' }}>
                  TourneyRun
                </div>
                <div style={{ padding: '14px 16px', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'center' }}>
                  The Big Guys
                </div>
              </div>
              {[
                { label: 'Platform fee',   ours: 'From $12.99/tournament', theirs: '10–25% + sub' },
                { label: 'Prize pool cut', ours: 'Zero',                  theirs: 'Up to 12.5%'  },
                { label: 'Subscriptions',  ours: 'None',                  theirs: '$5–20/month'  },
                { label: 'Setup fees',     ours: 'None',                  theirs: 'Often yes'    },
                { label: 'Transparency',   ours: 'Always',                theirs: 'Buried'       },
              ].map(({ label, ours, theirs }, i) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                  <div style={{ padding: '13px 16px', fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>{label}</div>
                  <div style={{ padding: '13px 16px', fontSize: 13, color: '#f59e0b', fontWeight: 700, textAlign: 'center', background: 'rgba(245,158,11,0.04)', borderLeft: '1px solid rgba(245,158,11,0.1)', borderRight: '1px solid rgba(245,158,11,0.1)' }}>{ours}</div>
                  <div style={{ padding: '13px 16px', fontSize: 13, color: 'rgba(255,255,255,0.25)', fontWeight: 500, textAlign: 'center' }}>{theirs}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────── REFERRAL ─────────────────────────────────────── */}
      <ReferralSection />

      {/* ──────────────────── FOOTER ───────────────────────────────────────── */}
      <footer style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)', padding: '32px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>🏆</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.02em' }}>
                <span style={{ color: '#fff', fontWeight: 400 }}>tourney</span><span style={{ color: '#16a34a', fontWeight: 700 }}>run</span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>© 2026 Player Pool Fantasy</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              { to: '/golf', label: '⛳ Fantasy Golf' },
              { to: '/basketball', label: '🏀 College Basketball' },
              { to: '/golf/faq', label: 'FAQ' },
              { to: '/golf/strategy', label: 'Strategy' },
              { to: '/login', label: 'Sign In' },
            ].map(({ to, label }) => (
              <Link key={to} to={to}
                className="hub-link-hover"
                style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </footer>

    </div>
  );
}
