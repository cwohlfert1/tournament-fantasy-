import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDocTitle } from '../../hooks/useDocTitle';
import React, { useState, useEffect, useRef } from 'react';
import api from '../../api';
import MastersPromoBanner from '../../components/golf/MastersPromoBanner';
import { ArrowRight, Plus, MessageCircle, CheckCircle, XCircle, Trophy, DollarSign, Star, Flag, BarChart2, Clipboard, Mail, FileText } from 'lucide-react';

const STYLES = ``;

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
  return (
    <div className={className} style={style}>
      {children}
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
    Icon: Clipboard,
    before: 'Copying scores from PGA.com every Sunday',
    after: 'Scores sync automatically from ESPN',
  },
  {
    Icon: Mail,
    before: 'Texting everyone their standings',
    after: 'Automated email after every round',
  },
  {
    Icon: DollarSign,
    before: 'Chasing people for buy-in money',
    after: 'Payment tracker built in',
  },
  {
    Icon: FileText,
    before: 'Managing a Google Form for picks',
    after: 'Members submit picks inside the app',
  },
  {
    Icon: BarChart2,
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

// ── Tournament status helpers ─────────────────────────────────────────────────
// Derive display status from dates so DB sync errors can't show future
// events as completed.
function getTournamentDisplayStatus(t) {
  if (t.end_date && new Date(t.end_date + 'T23:59:59') < new Date()) return 'completed';
  if (t.status === 'active') return 'active';
  return 'upcoming';
}

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
  useDocTitle('Fantasy Golf & Office Pools | TourneyRun', {
    description: 'Run golf office pools for the Masters and every PGA tournament. Pick players by tier, track live leaderboards, and keep 100% of your prize pool.',
    image: 'https://www.tourneyrun.app/golf-og-image.png',
  });
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
    <div className="bg-gray-950">
      <style>{STYLES}</style>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* S1: Ticker                                                           */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* S2: Hero                                                             */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden px-4 pt-16 pb-20 sm:pt-20 sm:pb-24 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,197,94,0.08)_0%,_transparent_65%)] pointer-events-none" />
        <div className="relative max-w-3xl mx-auto">
          <h1 style={{ fontSize: 'clamp(48px,10vw,80px)', fontWeight: 900, lineHeight: 1.05, color: '#fff', marginBottom: 16, letterSpacing: '-0.03em', textTransform: 'uppercase' }}>
            FANTASY GOLF.<br />
            <span style={{ color: '#22c55e' }}>DONE RIGHT.</span>
          </h1>
          <p className="text-gray-400 text-lg sm:text-xl max-w-xl mx-auto mb-12 leading-relaxed">
            Stop texting scores. Stop updating spreadsheets. Run your pool in one place — from $12.99/tournament.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              <>
                <Link
                  to="/golf/create?format=pool"
                  className="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white font-black px-10 py-4 rounded-full transition-all shadow-lg shadow-green-500/30 text-base"
                >
                  <Trophy size={15} strokeWidth={1.75} /> Run an Office Pool →
                </Link>
                <Link
                  to="/golf/create"
                  className="inline-flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-bold px-10 py-4 rounded-full transition-all text-base"
                >
                  <Plus className="w-5 h-5" /> Create League
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-white font-black px-10 py-4 rounded-full transition-all shadow-lg shadow-green-500/30 text-base"
                >
                  Get Started Free <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-bold px-10 py-4 rounded-full transition-all text-base"
                >
                  Sign In
                </Link>
              </>
            )}
          </div>
          <button
            onClick={() => howItWorksRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="mt-4 text-gray-600 hover:text-gray-400 text-sm transition-colors"
          >
            How it works ↓
          </button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* PGA Scoreboard mockup                                                */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div className="px-4 pb-0 pt-2">
        <div className="max-w-3xl mx-auto">
          {/* Browser frame */}
          <div style={{ background: '#060d07', border: '1px solid #0f1a10', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.55), 0 0 40px rgba(34,197,94,0.05)' }}>
            {/* Chrome bar */}
            <div style={{ background: '#040a05', borderBottom: '1px solid #0a1209', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: '#1f2937' }} />)}
              </div>
              <div style={{ flex: 1, background: '#080f08', borderRadius: 6, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#1f2937', fontSize: 11 }}>tourneyrun.com · PGA Scoreboard · Valspar Championship</span>
              </div>
            </div>

            {/* Tournament header */}
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #0a1209' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Valspar Championship</div>
                <div style={{ color: '#4b5563', fontSize: 11, marginTop: 2 }}>Innisbrook Resort · Round 2</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: 8, padding: '4px 10px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                <span style={{ color: '#4ade80', fontSize: 11, fontWeight: 700 }}>Live</span>
              </div>
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#040a05', borderBottom: '1px solid #0a1209' }}>
                    {['Pos','Player','R1','R2','R3','R4','Total','Today'].map((h, ci) => (
                      <th key={h} style={{
                        padding: ci === 0 ? '7px 10px' : ci === 1 ? '7px 10px 7px 0' : '7px 8px',
                        textAlign: ci <= 1 ? 'left' : 'center',
                        color: h === 'Total' ? '#22c55e' : '#1f2937',
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { pos: 1, flag: '🇺🇸', name: 'S. Scheffler',  r1: '-7', r2: '-6', total: '-13', today: '-6', expanded: true  },
                    { pos: 2, flag: '🇮🇪', name: 'R. McIlroy',    r1: '-5', r2: '-4', total: '-9',  today: '-4', expanded: false },
                    { pos: 3, flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', name: 'R. MacIntyre', r1: '-4', r2: '-4', total: '-8',  today: '-4', expanded: false },
                    { pos: 4, flag: '🇺🇸', name: 'C. Morikawa',   r1: '-3', r2: '-5', total: '-8',  today: '-5', expanded: false },
                    { pos: 5, flag: '🇺🇸', name: 'X. Schauffele', r1: '-4', r2: '-3', total: '-7',  today: '-3', expanded: false },
                  ].flatMap(({ pos, flag, name, r1, r2, total, today, expanded }) => {
                    const sc = v => v.startsWith('-') ? '#4ade80' : v === 'E' ? '#9ca3af' : '#f87171';
                    const playerRow = (
                      <tr key={`p${pos}`} style={{ background: expanded ? 'rgba(34,197,94,0.04)' : pos % 2 === 0 ? '#070e08' : '#060d07', borderBottom: expanded ? 'none' : '1px solid #0a1209' }}>
                        <td style={{ padding: '9px 10px', color: '#4b5563', fontSize: 12, fontWeight: 700 }}>{pos}</td>
                        <td style={{ padding: '9px 10px 9px 0', fontSize: 12, whiteSpace: 'nowrap' }}>
                          <span style={{ marginRight: 5 }}>{flag}</span>
                          <span style={{ color: expanded ? '#fff' : '#d1d5db', fontWeight: expanded ? 700 : 400 }}>{name}</span>
                          <span style={{ marginLeft: 5, color: '#1f2937', fontSize: 9 }}>{expanded ? '▼' : '▶'}</span>
                        </td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', color: sc(r1), fontSize: 12 }}>{r1}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', color: sc(r2), fontSize: 12, fontWeight: expanded ? 700 : 400 }}>{r2}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', color: '#1a2e1b', fontSize: 12 }}>—</td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', color: '#1a2e1b', fontSize: 12 }}>—</td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', color: sc(total), fontSize: 12, fontWeight: 700 }}>{total}</td>
                        <td style={{ padding: '9px 10px', textAlign: 'center', color: sc(today), fontSize: 12, fontWeight: 600 }}>{today}</td>
                      </tr>
                    );
                    if (!expanded) return [playerRow];
                    const holes = [
                      {h:1,s:4,par:4},{h:2,s:3,par:4},{h:3,s:4,par:4},{h:4,s:3,par:3},{h:5,s:5,par:5},{h:6,s:3,par:4},
                      {h:7,s:4,par:4},{h:8,s:3,par:4},{h:9,s:4,par:4},{h:10,s:3,par:4},{h:11,s:4,par:4},{h:12,s:3,par:3},
                      {h:13,s:4,par:4},{h:14,s:3,par:4},{h:15,s:3,par:4},{h:16,s:4,par:3},{h:17,s:3,par:4},{h:18,s:4,par:4},
                    ];
                    const holeRow = (
                      <tr key={`h${pos}`} style={{ background: '#091208', borderBottom: '1px solid #0a1209' }}>
                        <td colSpan={8} style={{ padding: '10px 14px 13px' }}>
                          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#1f2937', marginBottom: 8 }}>Round 2 — Hole by Hole</div>
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {holes.map(({ h, s, par }) => {
                              const diff = s - par;
                              const color = diff <= -2 ? '#eab308' : diff === -1 ? '#4ade80' : diff === 0 ? '#374151' : '#f97316';
                              const ring  = diff !== 0 ? color : null;
                              return (
                                <div key={h} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                                  <span style={{ fontSize: 9, color: '#1f2937', marginBottom: 2 }}>{h}</span>
                                  <div style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: diff <= -2 ? 3 : '50%', border: ring ? `1px solid ${ring}55` : 'none', background: ring ? `${ring}15` : 'transparent' }}>
                                    <span style={{ fontSize: 11, fontWeight: diff !== 0 ? 700 : 400, color }}>{s}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                            {[
                              { dot: '#eab308', label: 'Eagle+' },
                              { dot: '#4ade80', label: 'Birdie' },
                              { dot: null,      label: 'Par',    color: '#374151' },
                              { dot: '#f97316', label: 'Bogey'  },
                            ].map(({ dot, label, color }) => (
                              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot || 'transparent', border: dot ? 'none' : '1px solid #374151', display: 'inline-block', flexShrink: 0 }} />
                                <span style={{ fontSize: 10, color: color || dot }}>{label}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                    return [playerRow, holeRow];
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer bar */}
            <div style={{ background: '#040a05', borderTop: '1px solid #0a1209', padding: '7px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#1f2937', fontSize: 11 }}>Synced 3 min ago · updates every 10 min</span>
              <span style={{ color: '#1f2937', fontSize: 11 }}>Data via ESPN</span>
            </div>
          </div>

          <p style={{ textAlign: 'center', color: '#374151', fontSize: 12, marginTop: 10, fontStyle: 'italic' }}>
            Live scoreboard inside your pool. No tab-switching.
          </p>
        </div>
      </div>

      {/* Scoring options callout */}
      <div className="px-4 pt-8 pb-8">
        <div className="max-w-3xl mx-auto">
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <h3 style={{ color: '#fff', fontWeight: 800, fontSize: 18, marginBottom: 6, letterSpacing: '-0.01em' }}>Your pool, your rules.</h3>
            <p style={{ color: '#6b7280', fontSize: 13 }}>Choose how your group scores — switch anytime before the tournament starts.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
            {[
              {
                badge: 'STANDARD', badgeColor: '#9ca3af', badgeBg: 'rgba(156,163,175,0.12)',
                title: 'Stroke Play',
                desc: 'Lowest combined score wins. Simple, classic. The way real golf is played.',
                active: true,
              },
              {
                badge: 'EXCLUSIVE', badgeColor: '#4ade80', badgeBg: 'rgba(34,197,94,0.12)',
                title: 'TourneyRun Style',
                desc: 'Eagle +8 · Birdie +3 · Par +0.5 · Bogey −0.5. Majors count 1.5×. Every hole matters.',
                active: false,
              },
              {
                badge: null,
                title: 'Points Race',
                desc: 'Custom points per finishing position. Winner gets the most points, not the lowest score.',
                active: false,
              },
            ].map(({ badge, badgeColor, badgeBg, title, desc, active }) => (
              <div key={title} style={{
                background: active ? 'rgba(34,197,94,0.04)' : '#070e08',
                border: active ? '1px solid rgba(34,197,94,0.18)' : '1px solid #0f1a10',
                borderRadius: 12, padding: '14px 16px',
              }}>
                {badge && (
                  <span style={{ display: 'inline-block', marginBottom: 8, background: badgeBg, borderRadius: 4, padding: '2px 7px', color: badgeColor, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{badge}</span>
                )}
                <div style={{ color: '#f9fafb', fontWeight: 700, fontSize: 14, marginBottom: 5 }}>{title}</div>
                <div style={{ color: '#4b5563', fontSize: 12, lineHeight: 1.55 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scoring strip */}
      <div className="border-y border-gray-800 bg-gray-900/60 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-center text-gray-500 text-xs uppercase tracking-widest font-bold mb-2">TourneyRun Style Scoring</p>
          <p className="text-center text-gray-600 text-sm max-w-lg mx-auto mb-6 leading-relaxed">
            Unlike stroke play where one bad hole can end your week, TourneyRun scoring rewards every shot. Eagles and birdies build your lead, pars hold steady, and majors are worth 1.5× — so the biggest events matter most.
          </p>
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
                <h3 className="text-white font-black text-base">Season Long Fantasy</h3>
                <p className="text-green-400/80 text-xs mt-0.5 mb-4">Draft once. Compete all season.</p>
                <ul className="space-y-2 text-sm text-gray-400">
                  {[
                    'Auction draft to build your team before the season',
                    'Set your lineup each week — 4 starters, 4 flex',
                    'FAAB waiver wire keeps every week fresh',
                    'Majors count 1.5× — big moments hit harder',
                    'Live standings update after every tournament',
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
            <div className="relative bg-gray-900 border border-green-500/40 rounded-2xl p-5 sm:p-6 ring-1 ring-yellow-500/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full"
                  style={{ background: '#f59e0b', color: '#451a03' }}>
                  New
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl mb-2">📋</div>
                <span className="bg-green-500/20 text-green-400 text-xs font-semibold px-2 py-0.5 rounded-full inline-block mb-2">Most Popular</span>
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
                  <Link
                    to="/golf/create?format=pool"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f59e0b', color: '#451a03', fontWeight: 700, fontSize: 13, padding: '9px 18px', borderRadius: 8, textDecoration: 'none' }}
                  >
                    Start a Pool <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </div>

            {/* Card 3: Daily Fantasy Pool */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 sm:p-6 hover:border-green-500/30 transition-colors">
              <div className="text-2xl mb-2">⛳</div>
              <h3 className="text-white font-black text-base">Daily Fantasy Pool</h3>
              <p className="text-gray-400 text-xs mt-0.5 mb-4">DFS-style picks without the salary cap hassle</p>
              <ul className="space-y-2 text-sm text-gray-400">
                {[
                  'Pick your lineup each tournament',
                  'Player pools with tiers and odds',
                  'Score based on real tournament results',
                  'New lineups every week — no season commitment',
                  'Great for casual and competitive players',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 pt-3 border-t border-gray-800">
                <Link
                  to="/golf/create?format=dk"
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold text-green-400 hover:text-green-300 transition-colors uppercase tracking-widest"
                >
                  Start a DFS League <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

          </div>
        </div>
      </Section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Product Sections                                                     */}
      {/* ──────────────────────────────────────────────────────────────────── */}

      {/* Section A — Golf Office Pool */}
      <Section style={{ background: '#0a1a0f' }} className="py-16 sm:py-24 px-4 border-b border-gray-800">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-10 sm:gap-16 items-center">
            <div>
              <h2 style={{ color: '#fff', fontSize: 'clamp(28px,4vw,42px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 16, letterSpacing: '-0.02em' }}>
                Run your office pool.<br />
                <span style={{ color: '#22c55e' }}>Without the spreadsheet.</span>
              </h2>
              <p style={{ color: '#9ca3af', fontSize: 16, lineHeight: 1.7, marginBottom: 24 }}>
                The easiest way to run a tournament pool with your friends, coworkers, or group chat.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Players pick from tiered player pools sorted by odds',
                  'Live standings auto-update after every round',
                  'Commissioner controls — lock picks, manage entries',
                  'No more Google Sheets, no more group texts',
                  'Free to join — commissioner pays one flat fee',
                ].map(item => (
                  <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: '#d1d5db', fontSize: 14, lineHeight: 1.5 }}>
                    <span style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }}>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                to="/golf/create?format=pool"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#22c55e', color: '#001a0d', fontWeight: 800, fontSize: 15, padding: '14px 28px', borderRadius: 999, textDecoration: 'none', transition: 'background 0.15s' }}
              >
                Run an Office Pool <ArrowRight size={16} />
              </Link>
            </div>
            <div style={{ background: '#060d07', border: '1px solid #0f1a10', borderRadius: 20, padding: '24px 20px', boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 40px rgba(0,232,122,0.05)' }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}>Houston Open Pool · Standings</div>
                {[
                  { name: 'BirdieMachine', pts: 47.5, picks: ['Scheffler 🇺🇸','Burns 🇺🇸','Lee 🇦🇺'], rank: 1 },
                  { name: 'GolfGod2026',  pts: 38.0, picks: ['Koepka 🇺🇸','Fox 🇳🇿','Im 🇰🇷'],    rank: 2 },
                  { name: 'FairwayMike',  pts: 31.5, picks: ['Knapp 🇺🇸','Gotterup 🇺🇸'],          rank: 3 },
                ].map(({ name, pts, picks, rank }) => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: rank === 1 ? 'rgba(0,232,122,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${rank === 1 ? 'rgba(0,232,122,0.18)' : 'rgba(255,255,255,0.05)'}`, borderRadius: 10, marginBottom: 6 }}>
                    <span style={{ color: rank === 1 ? '#22c55e' : '#4b5563', fontWeight: 800, fontSize: 13, width: 20 }}>{rank}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: rank === 1 ? '#fff' : '#d1d5db', fontWeight: 700, fontSize: 13 }}>{name}</div>
                      <div style={{ color: '#4b5563', fontSize: 11, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{picks.join(' · ')}</div>
                    </div>
                    <span style={{ color: '#22c55e', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{pts}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                {['Live', 'Auto-sync', 'ESPN data'].map(tag => (
                  <span key={tag} style={{ background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.15)', borderRadius: 999, padding: '4px 10px', color: '#4ade80', fontSize: 10, fontWeight: 600 }}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Import Your Existing Group ─────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #1a2733' }} />
      <Section style={{ background: '#0a1a0f' }} className="py-16 sm:py-24 px-4 border-b border-gray-800">
        <div className="max-w-5xl mx-auto">

          {/* Two-column grid */}
          <div className="grid sm:grid-cols-2 gap-10 sm:gap-16 items-start">

            {/* LEFT — copy */}
            <div>
              <p style={{ color: '#22c55e', fontSize: 'clamp(14px,1.5vw,16px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 16 }}>
                Already running a pool?
              </p>
              <h3 style={{ color: '#fff', fontSize: 'clamp(24px,3.5vw,38px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 16, letterSpacing: '-0.02em' }}>
                Import your <span style={{ color: '#22c55e' }}>existing</span> group.
              </h3>
              <p style={{ color: '#9ca3af', fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>
                Already running a pool in a spreadsheet or group chat? Upload your member list and TourneyRun handles the rest — invites, accounts, everything.
              </p>

              {/* Numbered steps */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 36 }}>
                {[
                  { n: 1, title: 'Upload your Excel or CSV',       sub: 'Just needs a name and email column' },
                  { n: 2, title: 'We create accounts automatically', sub: 'Members just set a password to activate' },
                  { n: 3, title: 'Everyone gets an invite email',   sub: '"Your league is getting an upgrade"' },
                ].map(({ n, title, sub }) => (
                  <div key={n} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: '#22c55e', color: '#001a0d', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      {n}
                    </div>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{title}</div>
                      <div style={{ color: '#6b7280', fontSize: 13 }}>{sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              <Link
                to="/golf/create?format=pool"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#22c55e', color: '#001a0d', fontWeight: 800, fontSize: 15, padding: '13px 26px', borderRadius: 999, textDecoration: 'none' }}
              >
                Import your group <ArrowRight size={15} />
              </Link>
            </div>

            {/* RIGHT — import UI mockup */}
            <div style={{ background: '#0f1923', border: '1px solid #1a2733', borderRadius: 16, padding: '20px', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>

              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>Import members</span>
                <span style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Commissioner only</span>
              </div>

              {/* Upload zone */}
              <div style={{ border: '1px dashed rgba(34,197,94,0.4)', borderRadius: 10, padding: '16px', textAlign: 'center', marginBottom: 14, background: 'rgba(34,197,94,0.03)' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>📂</div>
                <div style={{ color: '#d1d5db', fontWeight: 600, fontSize: 12, marginBottom: 3 }}>Choose file or drag and drop</div>
                <div style={{ color: '#4b5563', fontSize: 11 }}>.xlsx, .xls, .csv accepted</div>
              </div>

              {/* Preview table */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: '0 8px', alignItems: 'center' }}>
                  {[
                    { initials: 'JD', name: 'John D.',  email: 'j.d***@gmail.com',   status: 'New',            statusColor: '#22c55e', statusBg: 'rgba(34,197,94,0.1)' },
                    { initials: 'SM', name: 'Sarah M.', email: 's.m***@yahoo.com',   status: 'New',            statusColor: '#22c55e', statusBg: 'rgba(34,197,94,0.1)' },
                    { initials: 'TR', name: 'Tom R.',   email: 't.r***@gmail.com',   status: 'Already member', statusColor: '#6b7280', statusBg: 'rgba(107,114,128,0.1)' },
                    { initials: 'AK', name: 'Amy K.',   email: 'a.k***@work.com',    status: 'New',            statusColor: '#22c55e', statusBg: 'rgba(34,197,94,0.1)' },
                    { initials: 'MB', name: 'Mike B.',  email: 'm.b***@hotmail.com', status: 'New',            statusColor: '#22c55e', statusBg: 'rgba(34,197,94,0.1)' },
                  ].map(({ initials, name, email, status, statusColor, statusBg }) => (
                    <React.Fragment key={initials}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', color: '#4ade80', fontWeight: 700, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials}</div>
                      <div style={{ paddingTop: 6, paddingBottom: 6 }}>
                        <div style={{ color: '#d1d5db', fontWeight: 600, fontSize: 11 }}>{name}</div>
                        <div style={{ color: '#4b5563', fontSize: 10 }}>{email}</div>
                      </div>
                      <span style={{ background: statusBg, color: statusColor, fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>{status}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Summary row */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                {[
                  { label: '4 New',         color: '#22c55e' },
                  { label: '1 Already in',  color: '#6b7280' },
                  { label: '0 Errors',      color: '#4b5563' },
                  { label: '5 Total',       color: '#9ca3af' },
                ].map(({ label, color }) => (
                  <span key={label} style={{ color, fontSize: 11, fontWeight: 600 }}>{label}</span>
                ))}
              </div>

              {/* CTA */}
              <div style={{ background: '#22c55e', borderRadius: 8, padding: '9px 0', textAlign: 'center', color: '#001a0d', fontWeight: 800, fontSize: 12 }}>
                Import 4 members + send invites
              </div>
            </div>
          </div>

          {/* Full-width email preview card */}
          <div style={{ marginTop: 40, background: '#0f1923', border: '1px solid #1a2733', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #1a2733' }}>
              <span style={{ color: '#6b7280', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Each new member gets this invite automatically</span>
            </div>
            <div style={{ padding: '24px 28px', display: 'grid', sm: undefined }} className="grid sm:grid-cols-2 gap-8">
              {/* Email metadata */}
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                  {[
                    { lbl: 'From',    val: 'TourneyRun Golf <noreply@tourneyrun.app>' },
                    { lbl: 'Subject', val: 'Your league is getting an upgrade' },
                  ].map(({ lbl, val }) => (
                    <div key={lbl} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color: '#4b5563', fontSize: 11, fontWeight: 700, width: 48, flexShrink: 0, paddingTop: 1 }}>{lbl}</span>
                      <span style={{ color: '#9ca3af', fontSize: 11 }}>{val}</span>
                    </div>
                  ))}
                </div>
                {/* Email body preview */}
                <div style={{ background: '#111c27', border: '1px solid #1a2733', borderRadius: 10, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    <span style={{ color: '#d1d5db', fontSize: 13, fontWeight: 300 }}>tourney</span><span style={{ color: '#22c55e', fontSize: 13, fontWeight: 800 }}>run</span>
                  </div>
                  <p style={{ color: '#9ca3af', fontSize: 12, lineHeight: 1.65, margin: '0 0 14px' }}>
                    Good news — your commissioner has moved{' '}
                    <span style={{ color: '#fff', fontWeight: 600 }}>[League Name]</span>{' '}
                    to TourneyRun. Everything runs automatically now: live ESPN scoring, standings that update themselves, and no more spreadsheets.
                  </p>
                  <div style={{ background: '#22c55e', borderRadius: 7, padding: '9px 18px', display: 'inline-block', color: '#001a0d', fontWeight: 700, fontSize: 12 }}>
                    Create my account →
                  </div>
                </div>
              </div>
              {/* What they see note */}
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
                {[
                  { icon: '✉️', text: 'One invite email per new member, sent automatically' },
                  { icon: '🔑', text: 'They click the link, pick a username and password — done' },
                  { icon: '⛳', text: 'They\'re added to your league and ready to pick golfers' },
                ].map(({ icon, text }) => (
                  <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                    <span style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.5 }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </Section>

      {/* Section B — Daily Fantasy Pool */}
      <Section style={{ background: '#0d1117' }} className="py-16 sm:py-24 px-4 border-b border-gray-800">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-10 sm:gap-16 items-center">
            <div style={{ order: 2 }}>
              <h2 style={{ color: '#fff', fontSize: 'clamp(28px,4vw,42px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 16, letterSpacing: '-0.02em' }}>
                DFS without<br />
                <span style={{ color: '#22c55e' }}>the complexity.</span>
              </h2>
              <p style={{ color: '#9ca3af', fontSize: 16, lineHeight: 1.7, marginBottom: 24 }}>
                New tournament, new picks. No salary cap math, no complicated rules. Just pick your golfers and compete.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Tier-based picks — Elite, Contenders, Longshots, The Field',
                  'Real DraftKings odds shown for every player',
                  'Score based on actual tournament performance',
                  'Start fresh every week — no season commitment',
                  'Perfect for Masters, US Open, The Open',
                ].map(item => (
                  <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: '#d1d5db', fontSize: 14, lineHeight: 1.5 }}>
                    <span style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }}>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                to="/golf/create?format=dk"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#22c55e', color: '#001a0d', fontWeight: 800, fontSize: 15, padding: '14px 28px', borderRadius: 999, textDecoration: 'none' }}
              >
                Start a DFS League <ArrowRight size={16} />
              </Link>
            </div>
            <div style={{ order: 1, background: '#060d07', border: '1px solid #0f1a10', borderRadius: 20, padding: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
              <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>Houston Open · Tier 1 — Elite</div>
              {[
                { name: 'Scottie Scheffler', odds: '8:1',  flag: '🇺🇸', picked: true  },
                { name: 'Min Woo Lee',       odds: '15:1', flag: '🇦🇺', picked: false },
                { name: 'Sam Burns',         odds: '27:1', flag: '🇺🇸', picked: true  },
                { name: 'Chris Gotterup',    odds: '20:1', flag: '🇺🇸', picked: false },
              ].map(({ name, odds, flag, picked }) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: picked ? 'rgba(0,232,122,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${picked ? 'rgba(0,232,122,0.2)' : 'rgba(255,255,255,0.05)'}`, borderRadius: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 20 }}>{flag}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#f1f5f9', fontWeight: picked ? 700 : 400, fontSize: 13 }}>{name}</div>
                    <div style={{ color: '#4b5563', fontSize: 11 }}>DK {odds}</div>
                  </div>
                  {picked && <span style={{ background: 'rgba(0,232,122,0.12)', border: '1px solid rgba(0,232,122,0.25)', borderRadius: 4, padding: '2px 7px', color: '#22c55e', fontSize: 10, fontWeight: 700 }}>PICKED</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Section C — TourneyRun Season Long */}
      <Section style={{ background: '#0a1a0f' }} className="py-16 sm:py-24 px-4 border-b border-gray-800">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-10 sm:gap-16 items-center">
            <div>
              <h2 style={{ color: '#fff', fontSize: 'clamp(28px,4vw,42px)', fontWeight: 900, lineHeight: 1.1, marginBottom: 16, letterSpacing: '-0.02em' }}>
                Season-long fantasy golf.<br />
                <span style={{ color: '#22c55e' }}>Draft once. Win all year.</span>
              </h2>
              <p style={{ color: '#9ca3af', fontSize: 16, lineHeight: 1.7, marginBottom: 24 }}>
                One draft. Trash talk from January through Augusta. 13 events, one champion.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Auction draft with salary cap — strategy matters',
                  'Set weekly lineups (4 core + 4 flex players)',
                  'FAAB waiver wire to add players between events',
                  'Majors count 1.5× — Augusta decides everything',
                  'Season-long leaderboard with automatic scoring',
                ].map(item => (
                  <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: '#d1d5db', fontSize: 14, lineHeight: 1.5 }}>
                    <span style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }}>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                to="/golf/create"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#22c55e', color: '#001a0d', fontWeight: 800, fontSize: 15, padding: '14px 28px', borderRadius: 999, textDecoration: 'none' }}
              >
                Create a League <ArrowRight size={16} />
              </Link>
            </div>
            <div style={{ background: '#060d07', border: '1px solid #0f1a10', borderRadius: 20, padding: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
              <div style={{ color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12 }}>Season Standings · 8 events in</div>
              {[
                { name: 'ScottieOrBust',  pts: 312.5, change: '▲1', rank: 1 },
                { name: 'AuctionKing',    pts: 298.0, change: '—',  rank: 2 },
                { name: 'WaiverWizard',   pts: 281.5, change: '▲3', rank: 3 },
                { name: 'MajorMoney',     pts: 267.0, change: '▼1', rank: 4 },
              ].map(({ name, pts, change, rank }) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: rank === 1 ? 'rgba(0,232,122,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${rank === 1 ? 'rgba(0,232,122,0.18)' : 'rgba(255,255,255,0.05)'}`, borderRadius: 10, marginBottom: 6 }}>
                  <span style={{ color: rank === 1 ? '#22c55e' : '#4b5563', fontWeight: 800, fontSize: 13, width: 20 }}>{rank}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: rank === 1 ? '#fff' : '#d1d5db', fontWeight: 700, fontSize: 13 }}>{name}</div>
                  </div>
                  <span style={{ color: change.includes('▲') ? '#4ade80' : change === '—' ? '#4b5563' : '#f87171', fontSize: 11, marginRight: 8 }}>{change}</span>
                  <span style={{ color: '#22c55e', fontWeight: 800, fontSize: 14 }}>{pts}</span>
                </div>
              ))}
              <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#f59e0b', fontSize: 13 }}>★</span>
                <span style={{ color: '#f59e0b', fontSize: 12, fontWeight: 600 }}>Masters next — all points ×1.5</span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Live PGA Scoreboard feature highlight                                */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Section className="max-w-4xl mx-auto px-4 py-16 sm:py-20">
        <div className="text-center mb-10">
          <div className="inline-block text-green-400 text-xs font-black uppercase tracking-widest mb-3">
            Exclusive Feature
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">
            Live PGA Scoreboard. Built in.
          </h2>
          <p className="text-gray-400 text-base max-w-xl mx-auto">
            See every player's round-by-round scores inside your pool. No tab-switching. No ESPN refreshing.{' '}
            <span className="text-gray-500 italic">Splash Sports doesn't have this.</span>
          </p>
        </div>

        {/* Browser mockup */}
        <div style={{
          background: '#0d1f0f',
          border: '1px solid #1a3a1a',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 0 40px rgba(34,197,94,0.05)',
          marginBottom: 24,
        }}>
          {/* Browser chrome */}
          <div style={{ background: '#080f09', borderBottom: '1px solid #1a3a1a', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#1f2937' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#1f2937' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#1f2937' }} />
            </div>
            <div style={{ flex: 1, background: '#0a1509', borderRadius: 6, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#374151', fontSize: 11 }}>PGA Tour Live · Masters 2026 · Round 3</span>
            </div>
          </div>

          {/* Tab bar */}
          <div style={{ background: '#080f09', borderBottom: '1px solid #111827', padding: '0 16px', display: 'flex', gap: 0 }}>
            {['Standings', 'My Picks', 'PGA Scoreboard', 'Messages'].map((tab, i) => (
              <div key={tab} style={{
                padding: '10px 14px',
                fontSize: 12,
                fontWeight: i === 2 ? 700 : 400,
                color: i === 2 ? '#4ade80' : '#4b5563',
                borderBottom: i === 2 ? '2px solid #22c55e' : '2px solid transparent',
                cursor: 'default',
                whiteSpace: 'nowrap',
              }}>{tab}</div>
            ))}
          </div>

          {/* Scoreboard table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
              <thead>
                <tr style={{ background: '#0a1509', borderBottom: '1px solid #111827' }}>
                  <th style={{ padding: '8px 14px', textAlign: 'left', color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', width: 36 }}>Pos</th>
                  <th style={{ padding: '8px 14px', textAlign: 'left', color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Player</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Thru</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Today</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', color: '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>R1</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', color: '#6b7280', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>R2</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', color: '#4ade80', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>R3</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', color: '#4b5563', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>R4</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', color: '#22c55e', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Pts</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { pos: 1,  player: 'S. Scheffler',   pick: true,  thru: 'F',  today: '-7', r1: 67, r2: 65, r3: 65, r4: null, pts: '+62.5' },
                  { pos: 2,  player: 'R. McIlroy',     pick: false, thru: 'F',  today: '-5', r1: 68, r2: 67, r3: 67, r4: null, pts: '+51.0' },
                  { pos: 3,  player: 'C. Morikawa',    pick: true,  thru: '14', today: '-4', r1: 69, r2: 66, r3: null, r4: null, pts: '+44.0' },
                  { pos: 4,  player: 'X. Schauffele',  pick: false, thru: '12', today: '-3', r1: 70, r2: 68, r3: null, r4: null, pts: '+39.5' },
                  { pos: 5,  player: 'T. Fleetwood',   pick: true,  thru: '11', today: '-2', r1: 68, r2: 70, r3: null, r4: null, pts: '+33.0' },
                  { pos: 6,  player: 'P. Cantlay',     pick: false, thru: '10', today: '-2', r1: 71, r2: 67, r3: null, r4: null, pts: '+31.5' },
                  { pos: 7,  player: 'B. DeChambeau',  pick: false, thru: 'F',  today: '+1', r1: 72, r2: 69, r3: 70, r4: null, pts: '+18.0' },
                  { pos: 8,  player: 'J. Thomas',      pick: true,  thru: '9',  today: 'E',  r1: 70, r2: 72, r3: null, r4: null, pts: '+14.5' },
                ].map(({ pos, player, pick, thru, today, r1, r2, r3, r4, pts }, i) => (
                  <tr key={player} style={{
                    background: pick ? 'rgba(34,197,94,0.05)' : i % 2 === 0 ? '#080f09' : '#060d07',
                    borderBottom: '1px solid #0f1a10',
                  }}>
                    <td style={{ padding: '9px 14px', color: '#6b7280', fontSize: 12, fontWeight: 600 }}>{pos}</td>
                    <td style={{ padding: '9px 14px', fontSize: 12 }}>
                      <span style={{ color: pick ? '#ffffff' : '#d1d5db', fontWeight: pick ? 700 : 400 }}>{player}</span>
                      {pick && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.05em' }}>MY PICK</span>}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', color: thru === 'F' ? '#6b7280' : '#4ade80', fontSize: 12, fontWeight: thru !== 'F' ? 600 : 400 }}>{thru}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: today.startsWith('-') ? '#4ade80' : today === 'E' ? '#9ca3af' : '#f87171' }}>{today}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', color: '#6b7280', fontSize: 12 }}>{r1 ?? '—'}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', color: '#6b7280', fontSize: 12 }}>{r2 ?? '—'}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', color: '#9ca3af', fontSize: 12, fontWeight: 500 }}>{r3 ?? <span style={{ color: '#1f2937' }}>—</span>}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', color: '#1f2937', fontSize: 12 }}>{r4 ?? '—'}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', color: '#4ade80', fontSize: 12, fontWeight: 700 }}>{pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer bar */}
          <div style={{ background: '#080f09', borderTop: '1px solid #111827', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#374151', fontSize: 11 }}>Updated 4 min ago · 87 players</span>
            <span style={{ color: '#374151', fontSize: 11 }}>Data via ESPN</span>
          </div>
        </div>

        {/* Feature callouts */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginTop: 4 }}>
          {[
            { icon: '⚡', label: 'Scores refresh every 10 min', sub: 'No manual refresh needed' },
            { icon: '📬', label: 'Auto standings email after each round', sub: 'ESPN → DB → your inbox' },
            { icon: '🏌️', label: 'Your picks highlighted in the field', sub: 'See exactly where you stand' },
          ].map(({ icon, label, sub }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              background: '#080f09',
              border: '1px solid #14532d55',
              borderRadius: 14,
              padding: '12px 16px',
              maxWidth: 220,
              flex: '1 1 180px',
            }}>
              <span style={{ fontSize: 18, lineHeight: 1, marginTop: 1 }}>{icon}</span>
              <div>
                <div style={{ color: '#d1d5db', fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{label}</div>
                <div style={{ color: '#4b5563', fontSize: 11, marginTop: 3 }}>{sub}</div>
              </div>
            </div>
          ))}
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
            Built for commissioners. Priced for everyone.
          </h2>
          <p className="text-gray-400 text-base max-w-lg mx-auto">
            Stop managing your golf pool in a spreadsheet.
          </p>
        </div>

        <div className="space-y-3 max-w-2xl mx-auto mb-10">
          {PAIN_POINTS.map(({ Icon, before, after }) => (
            <div key={before} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-start gap-4">
              <Icon size={18} color="#22c55e" strokeWidth={1.5} className="shrink-0 mt-0.5" />
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

        {/* Masters promo banner */}
        <MastersPromoBanner />

        {/* Pricing callout */}
        <div style={{ maxWidth: 480, margin: '0 auto 32px', background: 'rgba(0,232,122,0.04)', border: '1.5px solid rgba(0,232,122,0.2)', borderRadius: 16, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>💰</span>
            <span style={{ color: '#22c55e', fontWeight: 800, fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>TourneyRun Commissioner Fee</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 32, lineHeight: 1 }}>$12.99</span>
            <span style={{ color: '#9ca3af', fontSize: 14 }}>per tournament to start</span>
          </div>
          <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>
            Competitors charge <span style={{ color: '#f87171', textDecoration: 'line-through' }}>$30–$110</span> for the same thing.
          </div>
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
                { feature: 'League fee',                        us: '✅ Starts at $12.99',    them: '❌ $30–$110 per league', highlight: true  },
                { feature: '300-player pool cost',              us: '✅ $49.99 flat',          them: '❌ ~$600 (Splash Sports)', highlight: true  },
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
                    borderBottom: i < 8 ? '1px solid #111827' : 'none',
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

        <p style={{ textAlign: 'center', color: '#4ade80', fontSize: 13, fontWeight: 600, marginTop: 14 }}>
          A 300-person pool costs ~$600 on Splash Sports. Here it's $49.99. Flat.
        </p>
        <p style={{ textAlign: 'center', color: '#374151', fontSize: 12, marginTop: 8, fontStyle: 'italic' }}>
          We won't name names. You know who they are.
        </p>
      </Section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Ditch the spreadsheet — before/after                                 */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Section className="max-w-4xl mx-auto px-4 py-16 sm:py-20">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">
            Ditch the spreadsheet.
          </h2>
          <p className="text-gray-400 text-base">
            You've been managing your golf pool the hard way. There's a better one.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {/* Old way */}
          <div style={{ background: '#0f0a0a', border: '1px solid #1f1010', borderRadius: 16, padding: '24px 20px' }}>
            <div style={{ color: '#6b7280', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>The old way</div>
            {[
              'Manually track scores from Google',
              'Update a shared Google Sheet every round',
              'Text 40 people with standings',
              'Argue about who picked who',
              'Forget to send payouts',
            ].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <span style={{ color: '#ef4444', fontSize: 14, flexShrink: 0, marginTop: 1 }}>✗</span>
                <span style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.4 }}>{item}</span>
              </div>
            ))}
          </div>
          {/* TourneyRun way */}
          <div style={{ background: '#0a1a0f', border: '1px solid #14532d55', borderRadius: 16, padding: '24px 20px' }}>
            <div style={{ color: '#4ade80', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>With TourneyRun</div>
            {[
              'ESPN syncs scores automatically after every round',
              'Live standings always up to date — no work required',
              'Standings emails sent to everyone automatically',
              'Every pick logged and locked in the app',
              'Payout tracking built right in',
            ].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <span style={{ color: '#4ade80', fontSize: 14, flexShrink: 0, marginTop: 1 }}>✓</span>
                <span style={{ color: '#d1d5db', fontSize: 13, lineHeight: 1.4 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
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
            <Star size={16} color="#f59e0b" fill="#f59e0b" strokeWidth={1} />
            <span className="text-yellow-400 font-bold text-sm">Majors: all points × 1.5</span>
            <span className="text-gray-600 text-xs ml-auto">Masters · PGA Champ · US Open · The Open</span>
          </div>
        </div>
      </Section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Masters CTA                                                          */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0a1a0f 0%, #0d2310 50%, #0a1a0f 100%)',
        borderTop: '1px solid #14532d55',
        borderBottom: '1px solid #14532d55',
        padding: '56px 24px',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 999, padding: '5px 14px', marginBottom: 20 }}>
            <span style={{ color: '#eab308', fontSize: 14 }}>★</span>
            <span style={{ color: '#eab308', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Major Tournament</span>
          </div>
          <h2 style={{ color: '#fff', fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 900, lineHeight: 1.15, marginBottom: 14 }}>
            The Masters is April 10th.
          </h2>
          <p style={{ color: '#9ca3af', fontSize: 16, lineHeight: 1.6, marginBottom: 8 }}>
            The biggest event in golf. All points × 1.5 for Masters week.
          </p>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 32 }}>
            Set up your pool in 5 minutes. First picks start Sunday night.
          </p>
          <Link
            to="/golf/create?format=pool"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#16a34a',
              color: '#fff',
              fontWeight: 700,
              fontSize: 15,
              padding: '14px 32px',
              borderRadius: 999,
              textDecoration: 'none',
              boxShadow: '0 0 32px rgba(34,197,94,0.25)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#15803d'}
            onMouseLeave={e => e.currentTarget.style.background = '#16a34a'}
          >
            Create Your Masters Pool →
          </Link>
          <div style={{ marginTop: 16, color: '#374151', fontSize: 12 }}>
            Free to create · From $12.99/tournament for pools
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* S8: Schedule preview                                                 */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <Section className="bg-gray-900/40 border-y border-gray-800 py-16 sm:py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-3">
            Majors + Signature Events
          </h2>
          <p className="text-gray-500 text-center text-sm mb-10">The biggest events of the season. Points stack all year.</p>

          {tournaments.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-gray-900 border border-gray-800 animate-pulse" />
              ))}
            </div>
          ) : (() => {
            const featured = tournaments.filter(t => t.is_major || t.is_signature);
            const nextUpIdx = featured.findIndex(t => {
              const ds = getTournamentDisplayStatus(t);
              return ds !== 'completed' && ds !== 'active';
            });
            return (
              <div className="space-y-2">
                {featured.map((t, idx) => {
                  const displayStatus = getTournamentDisplayStatus(t);
                  const isNextUp = idx === nextUpIdx;
                  const countdown = isNextUp && t.start_date ? daysUntil(t.start_date) : null;
                  return (
                    <div
                      key={t.id}
                      className={!isNextUp ? `flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-colors ${
                        displayStatus === 'active'
                          ? 'bg-green-950/20 border-green-800/40'
                          : displayStatus === 'completed'
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
                        <span className={`font-semibold text-sm truncate block ${displayStatus === 'completed' ? 'text-gray-500' : 'text-white'}`}>
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
                        <TournamentBadge status={displayStatus} isMajor={!!t.is_major} />
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
            <span style={{ color: '#9ca3af', fontSize: 13, fontWeight: 500, lineHeight: 1.3, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Flag size={13} color="#22c55e" strokeWidth={2} />
              Masters in {days} day{days === 1 ? '' : 's'}
            </span>
            <Link
              to="/golf/create"
              onClick={() => window.scrollTo(0, 0)}
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
