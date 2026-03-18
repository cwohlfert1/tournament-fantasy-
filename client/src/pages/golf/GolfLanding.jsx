import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocTitle } from '../../hooks/useDocTitle';
import { useState, useEffect, useRef } from 'react';
import api from '../../api';
import { ArrowRight, Plus, MessageCircle, CheckCircle, XCircle } from 'lucide-react';

// ── Keyframes ─────────────────────────────────────────────────────────────────
const STYLES = `
@keyframes marqueeGolf {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
`;

// ── Intersection Observer fade-in hook ────────────────────────────────────────
function useFadeIn(threshold = 0.1) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

function Section({ children, className = '', style = {} }) {
  const [ref, visible] = useFadeIn();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 0.55s ease, transform 0.55s ease',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Ticker ────────────────────────────────────────────────────────────────────
const TICKER_TEXT =
  '⛳ Masters in 3 weeks  ·  🏆 13 PGA Tour events  ·  📅 Draft before Thursday  ·  💰 One draft all season  ·  ⭐ Majors count 1.5×  ·  🏌️ Real scoring, real stakes  ·  ';

function Ticker() {
  return (
    <div className="border-b border-gray-800 overflow-hidden select-none" style={{ background: '#0a0f0a', height: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <div style={{ animation: 'marqueeGolf 30s linear infinite', display: 'flex', whiteSpace: 'nowrap', willChange: 'transform' }}>
          {[0, 1].map(i => (
            <span key={i} className="inline-flex items-center gap-2 pr-12">
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0, display: 'inline-block' }} />
              <span style={{ color: '#6b7280', fontSize: 12, fontWeight: 500, letterSpacing: '0.03em' }}>
                {TICKER_TEXT}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Scoring data ──────────────────────────────────────────────────────────────
const SCORING = [
  { label: 'Eagle',   pts: '+8',   color: 'text-yellow-400' },
  { label: 'Birdie',  pts: '+3',   color: 'text-green-400'  },
  { label: 'Par',     pts: '+0.5', color: 'text-gray-300'   },
  { label: 'Bogey',   pts: '−0.5', color: 'text-orange-400' },
  { label: 'Double+', pts: '−2',   color: 'text-red-400'    },
];

const FINISH_BONUSES = [
  { label: '1st Place',  pts: '+30', good: true  },
  { label: 'Top 5',      pts: '+12', good: true  },
  { label: 'Top 10',     pts: '+8',  good: true  },
  { label: 'Top 25',     pts: '+3',  good: true  },
  { label: 'Made Cut',   pts: '+2',  good: true  },
  { label: 'Missed Cut', pts: '−5',  good: false },
];

// ── Commissioner pain points ───────────────────────────────────────────────────
const PAIN_POINTS = [
  {
    icon: '📋',
    before: 'Copying scores from PGA.com every Sunday',
    after: 'Scores sync automatically from ESPN',
  },
  {
    icon: '📧',
    before: 'Texting everyone their standings',
    after: 'Automated email after every round',
  },
  {
    icon: '💰',
    before: 'Chasing people for buy-in money',
    after: 'Payment tracker built in',
  },
  {
    icon: '📝',
    before: 'Managing a Google Form for picks',
    after: 'Members submit picks inside the app',
  },
  {
    icon: '📊',
    before: "Answering 'what place am I in?' at 11pm",
    after: 'Live leaderboard, always up to date',
  },
];

// ── Testimonials ──────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote: 'Way better than a golf pool. Every tournament matters when your guys are in it.',
    author: 'Mike T.', location: 'Charlotte, NC',
  },
  {
    quote: "We've run this 3 years. Masters week with the 1.5× is absolutely insane.",
    author: 'Dave R.', location: 'Austin, TX',
  },
  {
    quote: 'Finally a reason to watch every PGA Tour event, not just majors.',
    author: 'Chris W.', location: 'Naples, FL',
  },
];

// ── Date formatter ────────────────────────────────────────────────────────────
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDateRange(start, end) {
  if (!start) return '';
  const s = new Date(start + 'T12:00:00');
  const e = end && end !== start ? new Date(end + 'T12:00:00') : null;
  if (!e) return `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()}`;
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()} – ${e.getDate()}, ${e.getFullYear()}`;
  }
  return `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()} – ${MONTHS_SHORT[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
}

function daysUntil(dateStr) {
  const target = new Date(dateStr + 'T00:00:00');
  const today  = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

// ── Tournament status badge ───────────────────────────────────────────────────
function TournamentBadge({ status, isMajor }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
        style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#22c55e' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        ACTIVE
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-gray-800 border border-gray-700 text-gray-600">
        COMPLETED
      </span>
    );
  }
  if (isMajor) {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
        style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
        MAJOR
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
      style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }}>
      UPCOMING
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function GolfLanding() {
  useDocTitle('Fantasy Golf | TourneyRun');
  const { user } = useAuth();
  const howItWorksRef = useRef(null);
  const [tournaments, setTournaments] = useState([]);
  const [searchParams] = useSearchParams();
  const [poolEmail, setPoolEmail]         = useState('');
  const [poolNotifyStatus, setPoolStatus] = useState('idle'); // idle | loading | done | err

  // Capture referral code from ?ref=CODE and store for checkout
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) sessionStorage.setItem('golf_ref_code', ref.toUpperCase());
  }, [searchParams]);

  useEffect(() => {
    api.get('/golf/tournaments').catch(() => null).then(res => {
      if (res?.data) {
        const list = Array.isArray(res.data) ? res.data : (res.data.tournaments || []);
        setTournaments(list);
      }
    });
  }, []);

  const smsBody = encodeURIComponent(
    'Forget DraftKings for one week - do this all season. ' +
    'Golf fantasy on TourneyRun, one draft, majors count 1.5x. ' +
    'Join here: https://www.tourneyrun.app/golf'
  );

  return (
    <div className="min-h-screen bg-gray-950">
      <style>{STYLES}</style>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* S1: Ticker                                                           */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Ticker />

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* S2: Hero                                                             */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden px-4 pt-16 pb-20 sm:pt-20 sm:pb-24 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,197,94,0.08)_0%,_transparent_65%)] pointer-events-none" />
        <div className="relative max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            2026 PGA Tour Season
          </div>
          <h1 className="text-4xl sm:text-6xl font-black text-white leading-tight mb-4">
            Fantasy Golf<br />
            <span className="text-green-400">Done Right</span>
          </h1>
          <p className="text-gray-400 text-base sm:text-xl max-w-xl mx-auto mb-10 leading-relaxed">
            Season-long fantasy. Office pools. Daily fantasy.<br className="hidden sm:block" /> Play one — or play them all.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {user ? (
              <>
                <Link
                  to="/golf/dashboard"
                  className="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-7 py-3.5 rounded-full transition-all shadow-lg shadow-green-500/25"
                >
                  My Golf Leagues <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/golf/create"
                  className="inline-flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-semibold px-7 py-3.5 rounded-full transition-all"
                >
                  <Plus className="w-4 h-4" /> Create League
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-7 py-3.5 rounded-full transition-all shadow-lg shadow-green-500/25"
                >
                  Get Started Free <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-semibold px-7 py-3.5 rounded-full transition-all"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
          <div className="mt-3 flex justify-center">
            <Link
              to="/golf/create?format=pool"
              className="inline-flex items-center justify-center gap-2 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-semibold px-7 py-3.5 rounded-full transition-all bg-transparent hover:bg-gray-800/50"
            >
              🏆 Run an Office Pool →
            </Link>
          </div>
          <button
            onClick={() => howItWorksRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="mt-4 text-gray-600 hover:text-gray-400 text-sm transition-colors"
          >
            How it works ↓
          </button>
        </div>
      </div>

      {/* Scoring strip */}
      <div className="border-y border-gray-800 bg-gray-900/60 py-6 px-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-center text-gray-500 text-xs uppercase tracking-widest font-bold mb-4">Scoring</p>
          <div className="flex justify-center gap-4 sm:gap-8 flex-wrap">
            {SCORING.map(s => (
              <div key={s.label} className="text-center">
                <div className={`text-xl font-black ${s.color}`}>{s.pts}</div>
                <div className="text-gray-600 text-xs mt-0.5">{s.label}</div>
              </div>
            ))}
            <div className="text-center">
              <div className="text-xl font-black text-yellow-400">1.5×</div>
              <div className="text-gray-600 text-xs mt-0.5">Majors</div>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* S3: The Hook                                                         */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Section className="max-w-4xl mx-auto px-4 py-16 sm:py-20">
        <h2 className="text-3xl sm:text-4xl font-black text-white text-center mb-4">
          Tired of losing your entry on hole 1?
        </h2>
        <p className="text-gray-400 text-center text-base sm:text-lg max-w-2xl mx-auto mb-12 leading-relaxed">
          TourneyRun is season-long fantasy golf — draft once, earn points every weekend all 13 events.
        </p>

        <div className="grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
          {[
            {
              icon: <XCircle className="w-5 h-5 text-red-400 shrink-0" />,
              label: 'Daily DFS',
              sub: 'DraftKings / FanDuel',
              desc: 'Pay every single week',
              cls: 'border-red-900/30 bg-red-950/20',
            },
            {
              icon: <XCircle className="w-5 h-5 text-orange-400 shrink-0" />,
              label: 'Bracket pools',
              sub: 'Pick-the-winner format',
              desc: 'Busted by Sunday',
              cls: 'border-orange-900/30 bg-orange-950/20',
            },
            {
              icon: <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />,
              label: 'TourneyRun',
              sub: 'Season-long, salary cap',
              desc: 'One draft, all season long',
              cls: 'border-green-800/40 bg-green-950/20 ring-1 ring-green-500/20',
              highlight: true,
            },
          ].map(({ icon, label, sub, desc, cls, highlight }) => (
            <div key={label} className={`rounded-2xl border p-5 ${cls}`}>
              <div className="flex items-center gap-2 mb-2">
                {icon}
                <div>
                  <div className={`font-bold text-sm ${highlight ? 'text-green-300' : 'text-white'}`}>{label}</div>
                  <div className="text-gray-600 text-[11px]">{sub}</div>
                </div>
              </div>
              <p className={`text-sm ${highlight ? 'text-green-400' : 'text-gray-500'}`}>{desc}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* S4: Pick your format                                                 */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Section id="formats" className="bg-gray-900/40 border-y border-gray-800 py-16 sm:py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-3">Pick your format</h2>
          <p className="text-gray-500 text-center text-sm mb-10">All formats, one platform.</p>

          <div className="grid sm:grid-cols-3 gap-5">

            {/* Card 1: TourneyRun */}
            <div className="relative bg-gray-900 border border-green-500/35 rounded-2xl p-5 sm:p-6 ring-1 ring-green-500/15">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full"
                  style={{ background: '#22c55e', color: '#052e16' }}>
                  Recommended
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl mb-2">🏌️</div>
                <h3 className="text-white font-black text-base">TourneyRun Format</h3>
                <p className="text-green-400/80 text-xs mt-0.5 mb-4">Best for serious groups</p>
                <ul className="space-y-2 text-sm text-gray-400">
                  {[
                    'Auction draft with salary cap',
                    'Set weekly lineups (4 core + 4 flex)',
                    'FAAB waiver wire between events',
                    'Majors count 1.5×',
                    'Season-long leaderboard',
                  ].map(item => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Card 2: Golf Pool */}
            <div className="relative bg-gray-900 border border-yellow-500/25 rounded-2xl p-5 sm:p-6 ring-1 ring-yellow-500/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full"
                  style={{ background: '#f59e0b', color: '#451a03' }}>
                  New
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl mb-2">📋</div>
                <h3 className="text-white font-black text-base">Golf Pool</h3>
                <p className="text-yellow-400/80 text-xs mt-0.5 mb-4">Best for office pools & casual groups</p>
                <ul className="space-y-2 text-sm text-gray-400">
                  {[
                    'Members submit picks each tournament',
                    'No draft needed — join anytime',
                    'Auto-standings after every round',
                    'Commissioner tools built in',
                    'Replace your Google Sheet for good',
                  ].map(item => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="text-yellow-500 shrink-0 mt-0.5">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 pt-3 border-t border-yellow-900/30">
                  {poolNotifyStatus === 'done' ? (
                    <p style={{ color: '#4ade80', fontSize: 12, fontWeight: 600 }}>✓ You're on the list!</p>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="email"
                        placeholder="your@email.com"
                        value={poolEmail}
                        onChange={e => setPoolEmail(e.target.value)}
                        style={{ flex: 1, background: '#111', border: '1px solid #374151', borderRadius: 8, color: '#d1d5db', fontSize: 12, padding: '7px 10px', outline: 'none', minWidth: 0 }}
                      />
                      <button
                        disabled={poolNotifyStatus === 'loading'}
                        onClick={async () => {
                          if (!poolEmail) return;
                          setPoolStatus('loading');
                          try {
                            await api.post('/golf/waitlist', { email: poolEmail, format: 'golf_pool' });
                            setPoolStatus('done');
                          } catch {
                            setPoolStatus('err');
                            setTimeout(() => setPoolStatus('idle'), 3000);
                          }
                        }}
                        style={{ background: '#f59e0b', color: '#451a03', fontWeight: 700, fontSize: 12, border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {poolNotifyStatus === 'loading' ? '…' : poolNotifyStatus === 'err' ? 'Try again' : 'Notify Me'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Card 3: Pick'em */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 sm:p-6 hover:border-gray-700 transition-colors">
              <div className="text-2xl mb-2">🎯</div>
              <h3 className="text-white font-black text-base">Pick'em Pool</h3>
              <p className="text-gray-400 text-xs mt-0.5 mb-4">Pick tournament winners weekly</p>
              <ul className="space-y-2 text-sm text-gray-400">
                {[
                  'Simple weekly winner picks',
                  'Points for correct predictions',
                  'Great for casual fans',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">·</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-3 border-t border-gray-800">
                <Link to="/golf/create?format=pool" className="text-[11px] font-bold text-green-400 hover:text-green-300 transition-colors uppercase tracking-widest">
                  Start a Pool →
                </Link>
              </div>
            </div>

          </div>
        </div>
      </Section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* S5: Commissioner pain point section                                  */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Section className="max-w-4xl mx-auto px-4 py-16 sm:py-20">
        <div className="text-center mb-12">
          <div className="inline-block text-green-400 text-xs font-black uppercase tracking-widest mb-3">
            Built for commissioners
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">
            Built for commissioners. Finally.
          </h2>
          <p className="text-gray-400 text-base max-w-lg mx-auto">
            Stop managing your golf pool in a spreadsheet.
          </p>
        </div>

        <div className="space-y-3 max-w-2xl mx-auto mb-10">
          {PAIN_POINTS.map(({ icon, before, after }) => (
            <div key={before} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-start gap-4">
              <span className="text-xl shrink-0 mt-0.5">{icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-gray-500 text-sm line-through">{before}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-green-400 text-xs font-bold">→</span>
                  <span className="text-green-300 text-sm font-medium">{after}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Link
            to="/golf/create"
            className="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-7 py-3.5 rounded-full transition-all shadow-lg shadow-green-500/25"
          >
            Create a Golf League <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </Section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* S5b: Competitor comparison                                           */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Section className="max-w-4xl mx-auto px-4 py-16 sm:py-20">
        <div className="text-center mb-10">
          <div className="inline-block text-green-400 text-xs font-black uppercase tracking-widest mb-3">
            Why TourneyRun?
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">
            Why TourneyRun over the other guys?
          </h2>
          <p className="text-gray-400 text-base">
            We built what they should have built years ago.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-gray-800">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#0d1f0f', borderBottom: '1px solid #1f2937' }}>
                <th style={{ padding: '12px 20px', textAlign: 'left', color: '#6b7280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', width: '46%' }}>Feature</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#4ade80', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', width: '27%' }}>TourneyRun</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', color: '#6b7280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', width: '27%' }}>Others</th>
              </tr>
            </thead>
            <tbody>
              {[
                { feature: 'Live scoring',                      us: '✅ Included free',      them: '❌ Paid upgrade only',   highlight: true  },
                { feature: 'Auto standings email after every round', us: '✅ Automatic',     them: '❌ Manual',              highlight: false },
                { feature: 'Commissioner price',                us: '✅ $19.99 total',        them: '❌ $30–$110 per league', highlight: true  },
                { feature: 'Mobile-first design',               us: '✅ Modern & fast',       them: '❌ Desktop only, dated', highlight: false },
                { feature: 'ESPN auto-sync',                    us: '✅ Built in',            them: '⚠️ Varies',             highlight: true  },
                { feature: 'FAAB waiver wire',                  us: '✅ Full support',        them: '⚠️ Some do',            highlight: false },
                { feature: 'Free to create a league',           us: '✅ Always free',         them: '✅ Some do',             highlight: false },
                { feature: 'No credit card for trial',          us: '✅ Browse free',         them: '⚠️ Varies',             highlight: false },
              ].map(({ feature, us, them, highlight }, i) => (
                <tr
                  key={feature}
                  style={{
                    background: highlight ? '#0a1a0f' : '#080f09',
                    borderBottom: i < 7 ? '1px solid #111827' : 'none',
                  }}
                >
                  <td style={{ padding: '13px 20px', color: '#d1d5db', fontSize: 13, fontWeight: 500 }}>{feature}</td>
                  <td style={{ padding: '13px 16px', textAlign: 'center', color: '#4ade80', fontSize: 13, fontWeight: 600 }}>{us}</td>
                  <td style={{ padding: '13px 16px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>{them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p style={{ textAlign: 'center', color: '#374151', fontSize: 12, marginTop: 14, fontStyle: 'italic' }}>
          We won't name names. You know who they are.
        </p>
      </Section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* S6: How it works                                                     */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Section className="bg-gray-900/40 border-y border-gray-800 py-16 sm:py-20 px-4">
        <div ref={howItWorksRef} id="how-it-works" className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-3">
            Up and running before the Masters
          </h2>
          <p className="text-gray-500 text-center text-sm mb-12">Four steps. Five minutes.</p>

          <div className="grid sm:grid-cols-2 gap-5">
            {[
              {
                n: '01',
                title: 'Commissioner creates a league',
                body: 'Free to create. Pick your format.',
              },
              {
                n: '02',
                title: 'Invite your crew',
                body: 'Share your invite link or code. Members sign up in 60 seconds.',
              },
              {
                n: '03',
                title: 'Everyone submits picks or drafts',
                body: 'No Google Forms. No group texts. It\'s all inside the app.',
              },
              {
                n: '04',
                title: 'Auto-standings all season',
                body: 'TourneyRun syncs scores from ESPN and sends standings emails after every round.',
              },
            ].map(({ n, title, body }) => (
              <div key={n} className="flex gap-4 bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-green-500/20 transition-colors">
                <div className="text-3xl font-black text-green-500/25 shrink-0 leading-none pt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {n}
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm mb-1.5">{title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* S7: Scoring breakdown                                                */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Section className="max-w-3xl mx-auto px-4 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-3">
          Real scoring, real stakes
        </h2>
        <p className="text-gray-500 text-center text-sm mb-10">Points awarded shot-by-shot and at tournament end.</p>

        {/* Stroke scoring */}
        <div className="flex justify-center gap-4 sm:gap-8 flex-wrap mb-8">
          {SCORING.map(s => (
            <div key={s.label} className="text-center">
              <div className={`text-2xl font-black ${s.color}`}>{s.pts}</div>
              <div className="text-gray-600 text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Finish bonuses */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 sm:p-6">
          <p className="text-gray-500 text-xs uppercase tracking-widest font-bold mb-5">Finish Bonuses</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {FINISH_BONUSES.map(({ label, pts, good }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{label}</span>
                <span className={`font-bold ${good ? 'text-green-400' : 'text-red-400'}`}>{pts} pts</span>
              </div>
            ))}
          </div>
          <div className="mt-5 pt-4 border-t border-gray-800 flex items-center gap-2 flex-wrap">
            <span className="text-yellow-400 text-base">⭐</span>
            <span className="text-yellow-400 font-bold text-sm">Majors: all points × 1.5</span>
            <span className="text-gray-600 text-xs ml-auto">Masters · PGA Champ · US Open · The Open</span>
          </div>
        </div>
      </Section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* S8: Schedule preview                                                 */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Section className="bg-gray-900/40 border-y border-gray-800 py-16 sm:py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-3">
            13 events. One season.
          </h2>
          <p className="text-gray-500 text-center text-sm mb-10">Your players compete every week. Points stack all season.</p>

          {tournaments.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-gray-900 border border-gray-800 animate-pulse" />
              ))}
            </div>
          ) : (() => {
            const nextUpIdx = tournaments.findIndex(
              t => t.status !== 'completed' && t.status !== 'active'
            );
            return (
              <div className="space-y-2">
                {tournaments.map((t, idx) => {
                  const isNextUp = idx === nextUpIdx;
                  const countdown = isNextUp && t.start_date ? daysUntil(t.start_date) : null;
                  return (
                    <div
                      key={t.id}
                      className={!isNextUp ? `flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-colors ${
                        t.status === 'active'
                          ? 'bg-green-950/20 border-green-800/40'
                          : t.status === 'completed'
                          ? 'border-gray-800 opacity-60'
                          : t.is_major
                          ? 'bg-yellow-950/10 border-yellow-900/30'
                          : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                      }` : undefined}
                      style={isNextUp ? {
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '14px 16px',
                        borderLeft: '3px solid #22c55e',
                        borderTop: '1px solid rgba(34,197,94,0.25)',
                        borderRight: '1px solid rgba(34,197,94,0.25)',
                        borderBottom: '1px solid rgba(34,197,94,0.25)',
                        borderRadius: 12,
                        background: 'rgba(34,197,94,0.05)',
                        boxShadow: '0 0 16px rgba(34,197,94,0.07)',
                      } : undefined}
                    >
                      <div className="flex-1 min-w-0">
                        <span className={`font-semibold text-sm truncate block ${t.status === 'completed' ? 'text-gray-500' : 'text-white'}`}>
                          {t.name}
                        </span>
                        {(t.start_date || t.end_date) && (
                          <span className="text-gray-600 text-xs">
                            {formatDateRange(t.start_date, t.end_date)}
                          </span>
                        )}
                        {isNextUp && countdown !== null && countdown >= 0 && (
                          <span style={{ display: 'block', color: '#4ade80', fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                            {countdown === 0 ? 'Today!' : `${countdown} day${countdown === 1 ? '' : 's'} away`}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {isNextUp && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#22c55e', letterSpacing: '0.08em' }}>
                            NEXT UP
                          </span>
                        )}
                        <TournamentBadge status={t.status} isMajor={!!t.is_major} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </Section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* S9: Social proof                                                     */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Section className="max-w-4xl mx-auto px-4 py-16 sm:py-20">
        <p className="text-center text-green-400 text-xs font-black uppercase tracking-widest mb-3">Trusted since 2016</p>
        <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-10">
          Real leagues. Real stakes.
        </h2>
        <div className="grid sm:grid-cols-3 gap-5">
          {TESTIMONIALS.map(({ quote, author, location }) => (
            <div key={author} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-green-500/20 transition-colors">
              <p className="text-gray-300 text-sm leading-relaxed mb-4">"{quote}"</p>
              <div>
                <div className="text-white font-semibold text-xs">{author}</div>
                <div className="text-gray-600 text-xs">{location}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* S10: Invite Friends                                                  */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div style={{ background: '#111827' }} className="py-20 px-4">
        <div className="max-w-xl mx-auto text-center">
          <div className="inline-block text-green-400 text-xs font-black uppercase tracking-widest mb-4">
            Invite Friends
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight mb-4">
            Forget daily fantasy.<br />Do this all season long.
          </h2>
          <p className="text-gray-400 text-base leading-relaxed mb-8">
            Grab your crew and draft before the Masters.
            One draft. 13 events. Bragging rights til The Open.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/golf/create"
              className="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-7 py-3.5 rounded-full transition-all shadow-lg shadow-green-500/25"
            >
              Create a League <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href={`sms:?body=${smsBody}`}
              className="inline-flex items-center justify-center gap-2 bg-transparent hover:bg-gray-800 border border-gray-700 text-gray-300 font-semibold px-7 py-3.5 rounded-full transition-all"
            >
              <MessageCircle className="w-4 h-4" /> Text a Friend
            </a>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Footer                                                               */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <footer style={{ background: '#0d1117', borderTop: '1px solid #1e293b', padding: '32px 24px' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          {/* Logo + wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg viewBox="0 0 32 32" fill="none" style={{ width: 24, height: 24, flexShrink: 0 }}>
              <circle cx="16" cy="16" r="15" fill="white" stroke="#d1d5db" strokeWidth="0.8"/>
              <circle cx="12" cy="11" r="1.1" fill="#9ca3af"/>
              <circle cx="17" cy="9"  r="1.1" fill="#9ca3af"/>
              <circle cx="21" cy="13" r="1.1" fill="#9ca3af"/>
              <circle cx="10" cy="16" r="1.1" fill="#9ca3af"/>
              <circle cx="15" cy="15" r="1.1" fill="#9ca3af"/>
              <circle cx="20" cy="18" r="1.1" fill="#9ca3af"/>
              <circle cx="13" cy="20" r="1.1" fill="#9ca3af"/>
              <circle cx="19" cy="22" r="1.1" fill="#9ca3af"/>
            </svg>
            <span style={{ color: '#6b7280', fontSize: 13, fontWeight: 500 }}>TourneyRun Fantasy Golf</span>
          </div>
          {/* Center links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              { label: 'FAQ',         to: '/golf/faq' },
              { label: 'Strategy',    to: '/golf/strategy' },
              { label: 'How to Play', to: '/golf#how-it-works' },
            ].map(({ label, to }) => (
              <Link key={label} to={to}
                style={{ color: '#4b5563', fontSize: 13, textDecoration: 'none' }}
                onMouseEnter={e => e.currentTarget.style.color = '#22c55e'}
                onMouseLeave={e => e.currentTarget.style.color = '#4b5563'}
              >{label}</Link>
            ))}
            <a href="https://instagram.com/tourneyrungolf" target="_blank" rel="noopener noreferrer"
              style={{ color: '#4b5563', fontSize: 13, textDecoration: 'none' }}
              onMouseEnter={e => e.currentTarget.style.color = '#22c55e'}
              onMouseLeave={e => e.currentTarget.style.color = '#4b5563'}
            >@tourneyrungolf</a>
          </div>
          {/* Copyright */}
          <span style={{ color: '#374151', fontSize: 12 }}>© 2026 TourneyRun. All rights reserved.</span>
        </div>
      </footer>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* S11: Final CTA                                                       */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-800 py-16 sm:py-20 px-4 text-center">
        <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">Ready to tee off?</h2>
        <p className="text-gray-400 mb-8">Create a private league and invite your crew. Free to play.</p>
        {user ? (
          <Link
            to="/golf/create"
            className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-8 py-4 rounded-full transition-all shadow-lg shadow-green-500/25 text-base sm:text-lg"
          >
            <Plus className="w-5 h-5" /> Create a Golf League
          </Link>
        ) : (
          <Link
            to="/register"
            className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-8 py-4 rounded-full transition-all shadow-lg shadow-green-500/25 text-base sm:text-lg"
          >
            Create Free Account <ArrowRight className="w-5 h-5" />
          </Link>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Sticky mobile CTA bar (Masters countdown)                            */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {(() => {
        const days = daysUntil('2026-04-06');
        if (days < 0) return null;
        return (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: '#0a0f1a', borderTop: '1px solid #1e293b',
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          }} className="md:hidden">
            <span style={{ color: '#9ca3af', fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>
              ⛳ Masters in {days} day{days === 1 ? '' : 's'}
            </span>
            <Link
              to="/golf/create"
              style={{
                background: '#22c55e', color: '#fff', fontWeight: 700, fontSize: 13,
                padding: '9px 16px', borderRadius: 999, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              Create Your League →
            </Link>
          </div>
        );
      })()}
    </div>
  );
}
