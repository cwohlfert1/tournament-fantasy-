import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocTitle } from '../../hooks/useDocTitle';
import { useState, useEffect, useRef } from 'react';
import api from '../../api';
import {
  ArrowRight, Plus, MessageCircle, CheckCircle, XCircle, Flag,
  Calendar, TrendingUp, Award, RefreshCw, Target,
} from 'lucide-react';

// ── Keyframes ─────────────────────────────────────────────────────────────────
const STYLES = `
@keyframes marqueeGolf {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
`;

// ── Intersection Observer fade-in hook ────────────────────────────────────────
function useFadeIn() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

// ── Section wrapper with fade-in ──────────────────────────────────────────────
function Section({ children, className = '', style = {} }) {
  const [ref, visible] = useFadeIn();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Ticker ────────────────────────────────────────────────────────────────────
const TICKER_ITEMS = [
  '⛳ Masters in 3 weeks',
  '🏆 13 PGA Tour events',
  '📅 Draft before Thursday',
  '💰 $500 FAAB budget',
  '⭐ Majors count 1.5×',
  '🏌️ Real scoring, real stakes',
];
const TICKER_TEXT = TICKER_ITEMS.join('  ·  ') + '  ·  ';

function Ticker() {
  return (
    <div
      className="border-b border-gray-800 overflow-hidden select-none"
      style={{ background: '#0a0f0a', height: 36 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <div style={{ animation: 'marqueeGolf 28s linear infinite', display: 'flex', whiteSpace: 'nowrap' }}>
          {[0, 1].map(i => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, paddingRight: 48 }}>
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
  { label: '1st Place',  pts: '+30' },
  { label: 'Top 5',      pts: '+12' },
  { label: 'Top 10',     pts: '+8'  },
  { label: 'Top 25',     pts: '+3'  },
  { label: 'Made Cut',   pts: '+2'  },
  { label: 'Missed Cut', pts: '−5'  },
];

// ── Testimonials ──────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  {
    quote: 'Way better than a golf pool. Every tournament matters when your guys are in it.',
    author: 'Mike T.', location: 'Charlotte, NC',
  },
  {
    quote: "We've run this for 3 years. Masters week is insane with the 1.5× multiplier.",
    author: 'Dave R.', location: 'Austin, TX',
  },
  {
    quote: 'Finally a reason to watch every PGA event, not just majors.',
    author: 'Chris W.', location: 'Naples, FL',
  },
];

// ── Tournament status badge ────────────────────────────────────────────────────
function TournamentBadge({ status, isMajor }) {
  if (isMajor && status !== 'completed') {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b' }}>
        MAJOR
      </span>
    );
  }
  if (status === 'completed') {
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-500">
        COMPLETED
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#22c55e' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        ACTIVE
      </span>
    );
  }
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#4ade80' }}>
      UPCOMING
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GolfLanding() {
  useDocTitle('Golf Fantasy | TourneyRun');
  const { user } = useAuth();
  const howItWorksRef = useRef(null);
  const [tournaments, setTournaments] = useState([]);

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

      {/* ── Section 1: Ticker ── */}
      <Ticker />

      {/* ── Section 2: Hero ── */}
      <div className="relative overflow-hidden px-4 pt-16 pb-20 sm:pt-20 sm:pb-24 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,197,94,0.08)_0%,_transparent_65%)] pointer-events-none" />
        <div className="relative max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            2026 PGA Tour Season
          </div>
          <h1 className="text-4xl sm:text-6xl font-black text-white leading-tight mb-4">
            Golf Fantasy<br />
            <span className="text-green-400">Done Right</span>
          </h1>
          <p className="text-gray-400 text-base sm:text-xl max-w-xl mx-auto mb-10 leading-relaxed">
            One draft. All season. Majors count 1.5×.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {user ? (
              <>
                <Link
                  to="/golf/dashboard"
                  className="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-7 py-3.5 rounded-full transition-all shadow-lg shadow-green-500/25 hover:shadow-green-500/40"
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
                  className="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white font-bold px-7 py-3.5 rounded-full transition-all shadow-lg shadow-green-500/25 hover:shadow-green-500/40"
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
          <button
            onClick={() => howItWorksRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="mt-6 text-gray-600 hover:text-gray-400 text-sm transition-colors underline underline-offset-2"
          >
            How it works ↓
          </button>
        </div>
      </div>

      {/* ── Scoring strip ── */}
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

      {/* ── Section 3: The Hook ── */}
      <Section className="max-w-4xl mx-auto px-4 py-16 sm:py-20">
        <h2 className="text-3xl sm:text-4xl font-black text-white text-center mb-4">
          Tired of losing your entry fee on hole&nbsp;1?
        </h2>
        <p className="text-gray-400 text-center text-base sm:text-lg max-w-2xl mx-auto mb-12 leading-relaxed">
          TourneyRun is season-long golf fantasy — draft once, play all 13 events,
          earn points every weekend your players tee it up.
        </p>

        {/* Comparison pills */}
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              icon: <XCircle className="w-5 h-5 text-red-400 shrink-0" />,
              label: 'Daily Fantasy',
              sub: 'DraftKings / FanDuel',
              pain: 'Pay every week, re-enter every week',
              bg: 'bg-red-950/20',
              border: 'border-red-900/30',
            },
            {
              icon: <XCircle className="w-5 h-5 text-orange-400 shrink-0" />,
              label: 'Golf Pools',
              sub: 'Pick-the-winner format',
              pain: 'Boring after week 1 if your pick misses',
              bg: 'bg-orange-950/20',
              border: 'border-orange-900/30',
            },
            {
              icon: <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />,
              label: 'TourneyRun',
              sub: 'Season-long, salary cap',
              pain: 'One draft, all season, real stakes',
              bg: 'bg-green-950/20',
              border: 'border-green-900/30',
              highlight: true,
            },
          ].map(({ icon, label, sub, pain, bg, border, highlight }) => (
            <div key={label} className={`rounded-2xl border p-5 ${bg} ${border} ${highlight ? 'ring-1 ring-green-500/30' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                {icon}
                <div>
                  <div className={`font-bold text-sm ${highlight ? 'text-green-300' : 'text-white'}`}>{label}</div>
                  <div className="text-gray-600 text-[11px]">{sub}</div>
                </div>
              </div>
              <p className={`text-sm leading-snug ${highlight ? 'text-green-400' : 'text-gray-400'}`}>{pain}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Section 4: Game types ── */}
      <Section className="bg-gray-900/40 border-y border-gray-800 py-16 sm:py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-3">Pick your game</h2>
          <p className="text-gray-500 text-center text-sm mb-10">All formats, one platform.</p>

          <div className="grid sm:grid-cols-3 gap-5">
            {/* Card 1: TourneyRun */}
            <div className="relative bg-gray-900 border border-green-500/30 rounded-2xl p-5 sm:p-6 ring-1 ring-green-500/20">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full"
                  style={{ background: '#22c55e', color: '#052e16' }}>
                  Recommended
                </span>
              </div>
              <div className="mt-3 mb-1">
                <Flag className="w-5 h-5 text-green-400 mb-2" />
                <h3 className="text-white font-black text-base">TourneyRun Format</h3>
                <p className="text-green-400/70 text-xs mt-0.5">Best for serious groups</p>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-gray-400">
                {[
                  'Auction draft with $2,400 salary cap',
                  '4 core + 4 flex roster spots',
                  'Set weekly lineups before Thursday lock',
                  'FAAB waiver wire between events',
                  'Points all season — majors count 1.5×',
                  'Best total points at The Open wins',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Card 2: DFS */}
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 sm:p-6">
              <Target className="w-5 h-5 text-blue-400 mb-2" />
              <h3 className="text-white font-black text-base">DFS Format</h3>
              <p className="text-blue-400/70 text-xs mt-0.5">Best for casual groups</p>
              <ul className="mt-4 space-y-2 text-sm text-gray-400">
                {[
                  'Salary cap draft, no weekly lineups',
                  'Pick your team once at the draft',
                  'Points accumulate automatically',
                  'No roster management required',
                  'Good intro to golf fantasy',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Card 3: Pick'em — coming soon */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 sm:p-6 opacity-50">
              <Award className="w-5 h-5 text-gray-600 mb-2" />
              <h3 className="text-gray-500 font-black text-base">Pick'em Pool</h3>
              <p className="text-gray-600 text-xs mt-0.5">Coming soon</p>
              <ul className="mt-4 space-y-2 text-sm text-gray-600">
                {[
                  'Pick tournament winners each week',
                  'Points for correct picks',
                  'Great for casual fans',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-0.5">·</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 text-[10px] font-bold text-gray-700 uppercase tracking-widest">Coming Soon</div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Section 5: How it works ── */}
      <Section className="max-w-4xl mx-auto px-4 py-16 sm:py-20" style={{}}>
        <div ref={howItWorksRef} id="how-it-works">
          <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-3">
            Up and running before the Masters
          </h2>
          <p className="text-gray-500 text-center text-sm mb-12">Four steps. Five minutes.</p>

          <div className="grid sm:grid-cols-2 gap-6">
            {[
              {
                n: '01',
                title: 'Commissioner creates a league',
                body: 'Free to create. Set your format, salary caps, and invite your crew.',
              },
              {
                n: '02',
                title: '$5 per team to join',
                body: 'No free riders. Everyone\'s locked in before the draft.',
              },
              {
                n: '03',
                title: 'Auction draft your golfers',
                body: 'Live auction draft — nominate players, bid with your budget, build your team.',
              },
              {
                n: '04',
                title: 'Earn points all season',
                body: 'Every tournament your players tee it up, you score points. Majors count 1.5×.',
              },
            ].map(({ n, title, body }) => (
              <div key={n} className="flex gap-4 bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-green-500/20 transition-colors">
                <div className="text-3xl font-black text-green-500/30 shrink-0 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {n}
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm mb-1">{title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Section 6: Scoring breakdown ── */}
      <Section className="bg-gray-900/40 border-y border-gray-800 py-16 sm:py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-3">
            Real scoring, real stakes
          </h2>
          <p className="text-gray-500 text-center text-sm mb-10">Points are awarded shot-by-shot and at the end of each tournament.</p>

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
            <p className="text-gray-400 text-xs uppercase tracking-widest font-bold mb-4">Finish Bonuses</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
              {FINISH_BONUSES.map(({ label, pts }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">{label}</span>
                  <span className={`font-bold ${pts.startsWith('+') ? 'text-green-400' : 'text-red-400'}`}>{pts} pts</span>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-gray-800 flex items-center gap-2">
              <span className="text-yellow-400 text-lg">⭐</span>
              <span className="text-yellow-400 font-bold text-sm">Majors: all points × 1.5</span>
              <span className="text-gray-600 text-xs ml-auto">Masters, PGA Champ, US Open, The Open</span>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Section 7: Season schedule ── */}
      <Section className="max-w-3xl mx-auto px-4 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-3">
          13 events. All season long.
        </h2>
        <p className="text-gray-500 text-center text-sm mb-10">Your players compete every week. Points stack all season.</p>

        {tournaments.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-gray-900 border border-gray-800 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {tournaments.map(t => (
              <div
                key={t.id}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-colors ${
                  t.status === 'active'
                    ? 'bg-green-950/20 border-green-800/40'
                    : t.status === 'completed'
                    ? 'bg-gray-900/40 border-gray-800'
                    : 'bg-gray-900 border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-semibold text-sm truncate ${t.status === 'completed' ? 'text-gray-500' : 'text-white'}`}>
                      {t.name}
                    </span>
                    {t.is_major && t.status !== 'completed' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                        MAJOR
                      </span>
                    )}
                  </div>
                  {(t.start_date || t.end_date) && (
                    <div className="text-gray-600 text-xs mt-0.5">
                      {t.start_date} {t.end_date && t.end_date !== t.start_date ? `– ${t.end_date}` : ''}
                    </div>
                  )}
                </div>
                <TournamentBadge status={t.status} isMajor={!!t.is_major} />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Section 8: Social proof ── */}
      <Section className="bg-gray-900/40 border-y border-gray-800 py-16 sm:py-20 px-4">
        <div className="max-w-4xl mx-auto">
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
        </div>
      </Section>

      {/* ── Section 9: Invite Friends ── */}
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

      {/* ── Section 10: Final CTA ── */}
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
    </div>
  );
}
