import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// ── Favicon: TR monogram ──────────────────────────────────────────────────────

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

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: '#f59e0b', color: '#000', fontSize: 13, fontWeight: 700, padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        className="hover:brightness-110 transition-all"
      >
        My Leagues {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#1a1a2e', border: '0.5px solid #2a2a4e', borderRadius: 12, padding: '8px 0', minWidth: 200, zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
          <Link to="/golf/dashboard" onClick={() => setOpen(false)} style={{ display: 'block', padding: '10px 16px', color: '#e5e7eb', fontSize: 14, textDecoration: 'none', fontWeight: 500 }} className="hover:bg-white/5 transition-colors">
            ⛳ Golf Leagues
          </Link>
          <Link to="/basketball/dashboard" onClick={() => setOpen(false)} style={{ display: 'block', padding: '10px 16px', color: '#e5e7eb', fontSize: 14, textDecoration: 'none', fontWeight: 500 }} className="hover:bg-white/5 transition-colors">
            🏀 College Basketball
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Product card ──────────────────────────────────────────────────────────────

function ProductCard({ emoji, title, sub, bullets, badge, ctaLabel, ctaTo, accent, featured }) {
  return (
    <Link
      to={ctaTo}
      className="group relative flex flex-col rounded-3xl border overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl"
      style={{
        background: featured
          ? 'linear-gradient(145deg, #0f1f12 0%, #0a150c 100%)'
          : 'linear-gradient(145deg, #0e0e18 0%, #080810 100%)',
        borderColor: featured ? `${accent}40` : '#1f1f2e',
        boxShadow: featured ? `0 0 40px ${accent}10` : 'none',
      }}
    >
      {/* Top accent line */}
      <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${accent}, ${accent}00)` }} />

      <div className="p-7 sm:p-8 flex flex-col flex-1">
        {/* Badge */}
        {badge && (
          <div className="mb-4">
            <span className="inline-block text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full"
              style={{ background: `${accent}25`, color: accent, border: `1px solid ${accent}40` }}>
              {badge}
            </span>
          </div>
        )}

        {/* Emoji + title */}
        <div className="mb-4">
          <div className="text-5xl mb-3">{emoji}</div>
          <h2 className="text-2xl font-black text-white mb-2">{title}</h2>
          <p className="text-gray-400 text-sm leading-relaxed">{sub}</p>
        </div>

        {/* Bullets */}
        <ul className="space-y-2 mb-8 flex-1">
          {bullets.map(b => (
            <li key={b} className="flex items-center gap-2.5 text-sm" style={{ color: '#9ca3af' }}>
              <span style={{ color: accent, fontWeight: 700, flexShrink: 0 }}>✓</span>
              {b}
            </li>
          ))}
        </ul>

        {/* CTA */}
        <div
          className="w-full py-3.5 px-6 rounded-2xl text-center font-black text-sm transition-all duration-200 group-hover:brightness-110"
          style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)`, color: '#fff' }}
        >
          {ctaLabel} →
        </div>
      </div>
    </Link>
  );
}

// ── How it works column ───────────────────────────────────────────────────────

function HowItWorksCol({ icon, title, body }) {
  return (
    <div className="text-center px-4">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-white font-black text-lg mb-2">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

// ── Format card ───────────────────────────────────────────────────────────────

function FormatCard({ icon, title, desc, tag }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6">
      <div className="text-2xl mb-3">{icon}</div>
      <h3 className="text-white font-bold text-base mb-2">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed mb-4">{desc}</p>
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">{tag}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function HubLanding() {
  useHubFavicon();
  const { user } = useAuth();

  return (
    <div style={{ background: '#08080f', minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Minimal nav ── */}
      <nav style={{ borderBottom: '0.5px solid #1a1a2e', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>🏆</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
            tourney<span style={{ color: '#f59e0b' }}>run</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {user ? (
            <MyLeaguesDropdown />
          ) : (
            <>
              <Link to="/login" style={{ color: '#9ca3af', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}
                className="hover:text-white transition-colors">
                Sign in
              </Link>
              <Link to="/register" style={{ background: '#f59e0b', color: '#000', fontSize: 13, fontWeight: 700, padding: '6px 16px', borderRadius: 20, textDecoration: 'none' }}
                className="hover:brightness-110 transition-all">
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <div className="max-w-5xl mx-auto px-4 pt-16 pb-10 text-center">
        <p className="text-xs font-bold uppercase tracking-widest mb-5" style={{ color: '#f59e0b' }}>
          ⚡ Free to play · No credit card required
        </p>
        <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 4rem)', fontWeight: 900, color: '#ffffff', lineHeight: 1.08, letterSpacing: '-0.03em', marginBottom: 20 }}>
          Fantasy sports the way<br />it should be played.
        </h1>
        <p style={{ fontSize: 'clamp(1rem, 2.5vw, 1.2rem)', color: '#6b7280', maxWidth: 540, margin: '0 auto 52px', lineHeight: 1.6 }}>
          Draft players. Score points. Beat your crew.
        </p>

        {/* ── Product cards ── */}
        <div className="grid sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
          <ProductCard
            emoji="⛳"
            title="Golf Fantasy"
            sub="PGA Tour season-long fantasy, office pools, and DFS. One platform, every format."
            bullets={[
              'Season-long auction draft',
              'Masters & major office pools',
              'Daily fantasy (DFS)',
              'Majors score 1.5×',
            ]}
            badge="FEATURED · 2026 PGA Season Live"
            ctaLabel={user ? 'My Golf Leagues →' : 'Get Started →'}
            ctaTo={user ? '/golf/dashboard' : '/golf'}
            accent="#22c55e"
            featured
          />
          <ProductCard
            emoji="🏀"
            title="College Basketball Fantasy"
            sub="Draft college players. Score points as they win tournament games. 3 weeks, one champion."
            bullets={[
              'Snake or auction draft',
              'Live scoring all tournament',
              'Player pool format',
              'Up to 12 teams',
            ]}
            badge="2026 Tournament · Starting Soon"
            ctaLabel={user ? 'My Leagues →' : 'Get Started →'}
            ctaTo={user ? '/basketball/dashboard' : '/basketball'}
            accent="#f97316"
            featured={false}
          />
        </div>
      </div>

      {/* ── How it works ── */}
      <div style={{ borderTop: '0.5px solid #1a1a2e', marginTop: 40, padding: '60px 24px' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fff', marginBottom: 8 }}>
              One platform. Every format.
            </h2>
            <p style={{ color: '#6b7280', fontSize: 15 }}>From casual office pools to competitive season-long leagues.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-10">
            <HowItWorksCol
              icon="📋"
              title="Pick your players"
              body="Auction or snake draft before the season or tournament starts. Or submit a tournament pick sheet — no draft needed."
            />
            <HowItWorksCol
              icon="📊"
              title="Score as they play"
              body="Points update live as your players compete. Majors count 1.5× in golf. Every shot, every win matters."
            />
            <HowItWorksCol
              icon="🏆"
              title="Take the prize"
              body="Highest score wins the pot. The commissioner manages payouts — we track everything for you."
            />
          </div>
        </div>
      </div>

      {/* ── Formats ── */}
      <div style={{ padding: '60px 24px', borderTop: '0.5px solid #1a1a2e' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fff', marginBottom: 8 }}>Play how you want</h2>
            <p style={{ color: '#6b7280', fontSize: 15 }}>Three ways to compete — pick the one that fits your crew.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <FormatCard
              icon="🗓️"
              title="Season-Long Fantasy"
              desc="Draft once, compete all season. Waiver wire, weekly lineups, FAAB bidding."
              tag="→ Golf & College Basketball"
            />
            <FormatCard
              icon="📋"
              title="Office Pool"
              desc="No draft needed. Pick your players each tournament. Perfect for casual groups."
              tag="→ Golf only"
            />
            <FormatCard
              icon="⚡"
              title="Daily Fantasy"
              desc="New roster every tournament. Salary cap, no season commitment."
              tag="→ Golf only"
            />
          </div>
        </div>
      </div>

      {/* ── Social proof ── */}
      <div style={{ padding: '48px 24px', borderTop: '0.5px solid #1a1a2e', textAlign: 'center' }}>
        <p style={{ color: '#374151', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 20 }}>
          Trusted by fantasy players everywhere
        </p>
        <div className="flex flex-wrap justify-center gap-8 sm:gap-16">
          {[
            ['5,000+', 'Leagues created'],
            ['25,000+', 'Players'],
            ['$250K+', 'Prizes managed'],
          ].map(([num, label]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#f59e0b', letterSpacing: '-0.02em' }}>{num}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <footer style={{ borderTop: '0.5px solid #1a1a2e', padding: '32px 24px', textAlign: 'center' }}>
        <div className="flex flex-wrap justify-center gap-6 mb-6 text-sm" style={{ color: '#6b7280' }}>
          <Link to="/golf" style={{ color: '#6b7280', textDecoration: 'none' }} className="hover:text-white transition-colors">⛳ Golf Fantasy</Link>
          <Link to="/basketball" style={{ color: '#6b7280', textDecoration: 'none' }} className="hover:text-white transition-colors">🏀 College Basketball</Link>
          <Link to="/golf/faq" style={{ color: '#6b7280', textDecoration: 'none' }} className="hover:text-white transition-colors">FAQ</Link>
          <Link to="/golf/strategy" style={{ color: '#6b7280', textDecoration: 'none' }} className="hover:text-white transition-colors">Strategy</Link>
          <Link to="/login" style={{ color: '#6b7280', textDecoration: 'none' }} className="hover:text-white transition-colors">Sign In</Link>
        </div>
        <p style={{ color: '#374151', fontSize: 12 }}>© 2026 TourneyRun · Player Pool Fantasy</p>
      </footer>

    </div>
  );
}
