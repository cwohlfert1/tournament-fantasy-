import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect, useRef } from 'react';
import { useDocTitle } from '../hooks/useDocTitle';
import api from '../api';

// ─── Keyframe injection ───────────────────────────────────────────────────────
const STYLES = `
@keyframes driftUp {
  0%   { transform: translateY(0px)    translateX(0px);                opacity: 0;    }
  8%   {                                                                opacity: 0.18; }
  92%  {                                                                opacity: 0.18; }
  100% { transform: translateY(-820px) translateX(var(--dx, 0px));     opacity: 0;    }
}
@keyframes glowPulse {
  0%, 100% { opacity: 0.18; transform: scale(1);    }
  50%       { opacity: 0.38; transform: scale(1.12); }
}
@keyframes marquee {
  from { transform: translateX(0); }
  to   { transform: translateX(-50%); }
}
@keyframes countUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0);   }
}
@keyframes arrowPulse {
  0%, 100% { opacity: 0.3; transform: translateX(0); }
  50%      { opacity: 1;   transform: translateX(4px); }
}
`;

// ─── Countdown hook ───────────────────────────────────────────────────────────
const TOURNAMENT_DATE = new Date('2026-03-19T16:00:00Z'); // 12:00 PM EDT (UTC-4, DST active in March)

function useCountdown() {
  const calc = () => {
    const diff = TOURNAMENT_DATE - Date.now();
    if (diff <= 0) return { days: 0, hours: 0, mins: 0, secs: 0 };
    return {
      days:  Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      mins:  Math.floor((diff % 3600000)  / 60000),
      secs:  Math.floor((diff % 60000)    / 1000),
    };
  };
  const [t, setT] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

// ─── Count-up on scroll ───────────────────────────────────────────────────────
function useCountUp(target, duration = 1400) {
  const [count, setCount] = useState(0);
  const ref  = useRef(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !done.current) {
        done.current = true;
        const start = Date.now();
        const tick = () => {
          const p = Math.min((Date.now() - start) / duration, 1);
          const e = 1 - Math.pow(1 - p, 3);
          setCount(Math.floor(e * target));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, duration]);
  return [count, ref];
}

// ─── Floating player cards ────────────────────────────────────────────────────
// Lightened team colors (raw school colors brightened for dark-bg readability)
const FLOAT_CARDS = [
  { name: 'Cameron Boozer',    initials: 'CB', team: 'Duke',    emoji: '😈', pos: 'F', seed: 1, etp: '61.2', avatarBg: 'rgba(0,48,135,0.22)',   textColor: '#8ca2c9', left: '4%',  delay: '0s',  dur: '18s', dx: '12px'  },
  { name: 'Thomas Haugh',      initials: 'TH', team: 'Florida', emoji: '🐊', pos: 'F', seed: 1, etp: '58.4', avatarBg: 'rgba(0,33,165,0.22)',   textColor: '#8c9bd7', left: '12%', delay: '2s',  dur: '22s', dx: '-8px'  },
  { name: 'Kingston Flemings', initials: 'KF', team: 'Houston', emoji: '🐆', pos: 'G', seed: 2, etp: '49.1', avatarBg: 'rgba(200,16,46,0.22)',  textColor: '#e693a1', left: '28%', delay: '3s',  dur: '16s', dx: '18px'  },
  { name: 'Yaxel Lendeborg',   initials: 'YL', team: 'Michigan',emoji: '🦡', pos: 'F', seed: 1, etp: '54.7', avatarBg: 'rgba(255,203,5,0.18)',  textColor: '#ffcb05', left: '40%', delay: '5s',  dur: '20s', dx: '-14px' },
  { name: 'Brayden Burries',   initials: 'BB', team: 'Arizona', emoji: '🐱', pos: 'G', seed: 1, etp: '52.3', avatarBg: 'rgba(204,0,51,0.22)',   textColor: '#e88ca3', left: '55%', delay: '7s',  dur: '14s', dx: '8px'   },
  { name: 'Graham Ike',        initials: 'GI', team: 'Gonzaga', emoji: '🐶', pos: 'F', seed: 3, etp: '46.8', avatarBg: 'rgba(0,41,102,0.22)',   textColor: '#8c9fba', left: '64%', delay: '9s',  dur: '19s', dx: '-20px' },
  { name: 'Isaiah Evans',      initials: 'IE', team: 'Duke',    emoji: '😈', pos: 'G', seed: 1, etp: '50.1', avatarBg: 'rgba(0,48,135,0.22)',   textColor: '#8ca2c9', left: '72%', delay: '11s', dur: '21s', dx: '16px'  },
  { name: 'Koa Peat',          initials: 'KP', team: 'Arizona', emoji: '🐱', pos: 'F', seed: 1, etp: '55.9', avatarBg: 'rgba(204,0,51,0.22)',   textColor: '#e88ca3', left: '82%', delay: '1s',  dur: '17s', dx: '-10px' },
];

function FloatingCards({ slowdown }) {
  return (
    <div className="absolute inset-0 pointer-events-none select-none" aria-hidden style={{ zIndex: 0 }}>
      {FLOAT_CARDS.map((card, i) => {
        const baseDur = parseFloat(card.dur);
        const dur = slowdown ? `${(baseDur / 0.6).toFixed(1)}s` : card.dur;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: card.left,
              bottom: '-80px',
              width: 168,
              animation: `driftUp ${dur} linear ${card.delay} infinite`,
              '--dx': card.dx,
            }}
          >
            <div style={{
              background: '#0f1923',
              border: '0.5px solid #1f2d3d',
              borderRadius: 10,
              padding: '10px 12px',
            }}>
              {/* Row 1: avatar + name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: card.avatarBg,
                  border: `1px solid ${card.textColor}44`,
                  color: card.textColor,
                  fontSize: 8, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {card.initials}
                </div>
                <span style={{
                  color: '#ffffff', fontSize: 11, fontWeight: 600, lineHeight: 1.2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {card.name}
                </span>
              </div>
              {/* Row 2: team + emoji */}
              <div style={{ fontSize: 9, color: card.textColor, marginBottom: 6, paddingLeft: 29 }}>
                {card.team} {card.emoji}
              </div>
              {/* Row 3: pos·seed pill + ETP */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 29 }}>
                <span style={{
                  background: '#1a2535', border: '0.5px solid #2a3a50',
                  borderRadius: 4, padding: '1px 5px',
                  fontSize: 9, fontWeight: 700, color: '#6b8cba', lineHeight: 1.4,
                }}>
                  {card.pos}·#{card.seed}
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b' }}>
                  {card.etp} ETP
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Draft room mockup ────────────────────────────────────────────────────────
const BOARD_COLS = [
  { name: "Mike's Squad", handle: '@mikeD',     color: '#ec4899' },
  { name: 'The Bracket',  handle: '@joshwin',   color: '#8b5cf6' },
  { name: 'Slam Dunk FC', handle: '@courtking', color: '#06b6d4' },
];

const BOARD_CELLS = [
  [
    { name: 'Kingston Flemings', init: 'KF', team: 'Houston', pos: 'G', seed: 2, avatarBg: 'rgba(200,16,46,0.2)',   textColor: '#e693a1' },
    { name: 'Yaxel Lendeborg',   init: 'YL', team: 'Michigan', pos: 'F', seed: 1, avatarBg: 'rgba(255,203,5,0.18)',  textColor: '#e6c900' },
    { name: 'Thomas Haugh',      init: 'TH', team: 'Florida',  pos: 'F', seed: 1, avatarBg: 'rgba(0,33,165,0.2)',   textColor: '#8c9bd7' },
  ],
  [
    { name: 'Graham Ike',        init: 'GI', team: 'Gonzaga',  pos: 'F', seed: 3, avatarBg: 'rgba(0,41,102,0.2)',   textColor: '#8c9fba' },
    { name: 'Boogie Fland',      init: 'BF', team: 'Florida',  pos: 'G', seed: 1, avatarBg: 'rgba(0,33,165,0.2)',   textColor: '#8c9bd7' },
    { name: 'Thijs De Ridder',   init: 'TD', team: 'Virginia', pos: 'F', seed: 3, avatarBg: 'rgba(35,45,75,0.3)',   textColor: '#8caad0' },
  ],
  [
    { name: 'Silas Demary Jr.',  init: 'SD', team: 'UConn',    pos: 'G', seed: 2, avatarBg: 'rgba(0,14,47,0.4)',    textColor: '#8ca8d0' },
    { name: 'Ivan Kharchenkov', init: 'IK', team: 'Arizona',  pos: 'F', seed: 1, avatarBg: 'rgba(204,0,51,0.2)',   textColor: '#e88ca3' },
    null, // on the clock
  ],
];

const POS_PILL = {
  G: { bg: 'rgba(59,130,246,0.13)',  color: '#60a5fa' },
  F: { bg: 'rgba(34,197,94,0.13)',   color: '#4ade80' },
  C: { bg: 'rgba(249,115,22,0.13)',  color: '#fb923c' },
};

function DraftMockup() {
  const [timerSecs, setTimerSecs] = useState(34);
  useEffect(() => {
    const id = setInterval(() => setTimerSecs(s => s <= 1 ? 60 : s - 1), 1000);
    return () => clearInterval(id);
  }, []);
  const pct = Math.round((timerSecs / 60) * 100);
  const timerColor = timerSecs <= 10 ? '#ef4444' : timerSecs <= 20 ? '#f59e0b' : '#378ADD';

  return (
    <div className="relative w-full max-w-sm mx-auto lg:mx-0 lg:ml-auto">
      {/* Glow behind mockup */}
      <div className="absolute -inset-6 bg-brand-500/10 rounded-3xl blur-2xl" />
      <div className="relative rounded-2xl border border-brand-500/30 bg-gray-900 overflow-hidden shadow-2xl shadow-brand-500/20">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-800 border-b border-gray-700">
          <span className="w-2.5 h-2.5 rounded-full bg-brand-500 animate-pulse" />
          <span className="text-white font-bold text-sm">Live Draft — Round 1</span>
          {/* Timer ring */}
          <div className="ml-auto relative w-9 h-9 shrink-0">
            <svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="#1f2937" strokeWidth="3" />
              <circle cx="18" cy="18" r="14" fill="none" stroke={timerColor}
                strokeWidth="3" strokeDasharray={`${pct} 100`} strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 1s linear, stroke 0.3s' }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-bold text-[10px]"
              style={{ color: timerColor }}>{timerSecs}</div>
          </div>
        </div>
        {/* On the clock */}
        <div className="px-4 py-2 bg-brand-500/10 border-b border-brand-500/20 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-ping" />
          <span className="text-brand-400 text-xs font-bold uppercase tracking-wide">On the clock: Mike's Squad</span>
        </div>
        {/* 3-column draft board grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '0.5px solid #1f2937' }}>
          {/* Column headers */}
          {BOARD_COLS.map(col => (
            <div key={col.name} style={{
              borderTop: `2px solid ${col.color}`,
              padding: '6px 7px 5px',
              borderRight: '0.5px solid #1f2937',
              background: '#111827',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: col.color, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {col.name}
              </div>
              <div style={{ fontSize: 8, color: '#4b5563', marginTop: 1 }}>{col.handle}</div>
            </div>
          ))}
          {/* Player cells */}
          {BOARD_CELLS.map((row, ri) =>
            row.map((cell, ci) => {
              if (!cell) {
                // "On the clock" empty cell
                return (
                  <div key={`${ri}-${ci}`} style={{
                    padding: '6px 7px',
                    borderRight: ci < 2 ? '0.5px solid #1f2937' : 'none',
                    borderTop: '0.5px solid #1f2937',
                    background: 'rgba(55,138,221,0.06)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                    minHeight: 46,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#378ADD', display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    <span style={{ fontSize: 8, color: '#378ADD', fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>On the clock...</span>
                  </div>
                );
              }
              const pill = POS_PILL[cell.pos] || POS_PILL.G;
              return (
                <div key={`${ri}-${ci}`} style={{
                  padding: '6px 7px',
                  borderRight: ci < 2 ? '0.5px solid #1f2937' : 'none',
                  borderTop: '0.5px solid #1f2937',
                  background: '#0d1117',
                }}>
                  {/* Avatar + name row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      background: cell.avatarBg,
                      border: `1px solid ${cell.textColor}44`,
                      color: cell.textColor,
                      fontSize: 7, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {cell.init}
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 600, color: '#e2e8f0',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      lineHeight: 1.2,
                    }}>
                      {cell.name}
                    </span>
                  </div>
                  {/* Team + position pill row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 3 }}>
                    <span style={{ fontSize: 8, color: cell.textColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cell.team}
                    </span>
                    <span style={{
                      background: pill.bg, color: pill.color,
                      fontSize: 7, fontWeight: 700, lineHeight: 1,
                      padding: '2px 4px', borderRadius: 3, flexShrink: 0,
                    }}>
                      {cell.pos}·#{cell.seed}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {/* Footer */}
        <div className="px-4 py-2 bg-gray-800/50 flex items-center justify-between">
          <span className="text-gray-600 text-[10px]">Pick 2 of 120</span>
          <span className="text-green-400 text-[10px] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> 8 teams live
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Countdown block ──────────────────────────────────────────────────────────
function CountdownBlock() {
  const { days, hours, mins, secs } = useCountdown();
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-4 flex-wrap">
      {[
        { v: days,  l: 'DAYS'  },
        { v: hours, l: 'HRS'   },
        { v: mins,  l: 'MIN'   },
        { v: secs,  l: 'SEC'   },
      ].map(({ v, l }, i) => (
        <div key={l} className="flex items-center gap-2 sm:gap-4">
          <div className="bg-gray-900/80 border border-gray-700 rounded-2xl px-4 sm:px-6 py-4 sm:py-5 text-center min-w-[72px] sm:min-w-[90px]">
            <div className="text-5xl sm:text-6xl font-black text-white tabular-nums leading-none">
              {String(v).padStart(2, '0')}
            </div>
            <div className="text-gray-500 text-[10px] sm:text-xs font-bold tracking-widest mt-2">{l}</div>
          </div>
          {i < 3 && <span className="text-gray-600 text-3xl sm:text-4xl font-bold mb-2">:</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Landing() {
  useDocTitle('TourneyRun — Player Pool Fantasy');
  const { user } = useAuth();
  const navigate = useNavigate();

  const [copyConfirm, setCopyConfirm] = useState(false);
  const [sdLoading, setSdLoading] = useState(false);
  const [heroHovered, setHeroHovered] = useState(false);

  const handleSmartDraftCta = async () => {
    if (user) {
      // Already logged in — go straight to create league with Smart Draft pre-selected
      navigate('/create-league?smartdraft=1');
      return;
    }
    setSdLoading(true);
    try {
      const res = await api.post('/payments/smart-draft-standalone');
      window.location.href = res.data.url;
    } catch {
      // Fallback: send to register with intent flag (no charge)
      navigate('/register?smartdraft=1');
    } finally {
      setSdLoading(false);
    }
  };

  const tickerText = '🏀 The 2026 Tournament starts Thursday March 19th at 12PM ET  ·  Draft day is coming  ·  Secure your spot before your friends do  ·  $5 platform fee per team  ·  Prize pool managed by your league  ·  ';

  const SHARE_TEXT = "Skip the bracket this year 🏀 We're doing TourneyRun — draft real players, score real points, win real money.\n\nJoin here → https://www.tourneyrun.app";

  const handleShare = async () => {
    if (navigator.share) {
      try { await navigator.share({ text: SHARE_TEXT }); } catch (e) {}
    } else {
      try {
        await navigator.clipboard.writeText(SHARE_TEXT);
        setCopyConfirm(true);
        setTimeout(() => setCopyConfirm(false), 2500);
      } catch (e) {}
    }
  };

  return (
    <div className="overflow-x-hidden bg-gray-950">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      {/* ── Announcement ticker ── */}
      <div style={{
        background: '#080e1a',
        borderBottom: '0.5px solid #1a2744',
        height: 38,
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Left fade mask */}
        <div aria-hidden style={{
          position: 'absolute', top: 0, left: 0, bottom: 0, width: 80, zIndex: 2,
          background: 'linear-gradient(to right, #080e1a, transparent)',
          pointerEvents: 'none',
        }} />
        {/* Right fade mask */}
        <div aria-hidden style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 80, zIndex: 2,
          background: 'linear-gradient(to left, #080e1a, transparent)',
          pointerEvents: 'none',
        }} />
        {/* Orange static dot — anchored left, above fade */}
        <div aria-hidden style={{
          position: 'absolute', top: '50%', left: 18, transform: 'translateY(-50%)',
          width: 6, height: 6, borderRadius: '50%', background: '#f97316', zIndex: 3,
        }} />
        {/* Scrolling track — duplicated 2× for seamless loop */}
        <div style={{
          display: 'flex', alignItems: 'center', height: '100%',
          width: 'max-content',
          animation: 'marquee 35s linear infinite',
        }}>
          {[0, 1].map(i => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center',
              paddingLeft: 48, paddingRight: 0,
              fontSize: 12, fontWeight: 400, letterSpacing: '0.3px', whiteSpace: 'nowrap',
              color: '#94a3b8',
            }}>
              The 2026 Tournament starts Thursday March 19th at 12PM ET
              <span style={{ color: '#1e3a5f', margin: '0 14px', fontSize: 14 }}>·</span>
              Draft day is coming
              <span style={{ color: '#1e3a5f', margin: '0 10px', fontSize: 14 }}>·</span>
              Secure your spot before your friends do
              <span style={{ color: '#1e3a5f', margin: '0 14px', fontSize: 14 }}>·</span>
              $5 platform fee per team
              <span style={{ color: '#1e3a5f', margin: '0 10px', fontSize: 14 }}>·</span>
              Prize pool managed by your league
              <span style={{ color: '#1e3a5f', margin: '0 14px', fontSize: 14 }}>·</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Hero ── */}
      <section
        className="relative flex items-center justify-center px-4 py-16 sm:py-24 overflow-hidden"
        onMouseEnter={() => setHeroHovered(true)}
        onMouseLeave={() => setHeroHovered(false)}
      >
        {/* Glow orbs */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-600/10 rounded-full blur-3xl"
            style={{ animation: 'glowPulse 4s ease-in-out infinite' }} />
          <div className="absolute bottom-0 right-0 w-72 h-72 bg-brand-800/15 rounded-full blur-3xl" />
          <div className="absolute top-0 left-0 w-52 h-52 bg-brand-900/20 rounded-full blur-3xl" />
        </div>
        <FloatingCards slowdown={heroHovered} />

        <div className="relative z-10 max-w-xl mx-auto w-full text-center">
          {/* Badge */}
          <div className="inline-flex items-center bg-brand-500/10 border border-brand-500/30 text-brand-400 text-xs font-bold px-4 py-1.5 rounded-full mb-5 uppercase tracking-wider">
            2026 Fantasy Basketball
          </div>

          {/* Pre-headline hook */}
          <p className="text-gray-400 text-base sm:text-lg font-semibold mb-3 leading-snug">
            Tired of busting your bracket on day one? 🤦
          </p>

          {/* Main headline */}
          <h1 className="text-5xl sm:text-6xl font-black leading-[1.05] mb-4">
            <span className="bg-gradient-to-br from-white to-gray-300 bg-clip-text text-transparent block">Your Players.</span>
            <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-brand-500 bg-clip-text text-transparent block">Their Points.</span>
            <span className="bg-gradient-to-br from-white to-gray-300 bg-clip-text text-transparent block">Your Prize.</span>
          </h1>

          {/* Supporting subheadline */}
          <p className="text-gray-300 text-base sm:text-lg leading-relaxed mb-8 max-w-sm mx-auto">
            Draft college basketball players. Score points as they win games. Play for 3 full weeks with your crew.
          </p>

          {/* 2 CTAs stacked full-width */}
          <div className="flex flex-col gap-3 w-full max-w-xs mx-auto sm:max-w-sm">
            <a
              href="#how-it-works"
              className="w-full inline-flex items-center justify-center bg-brand-500 hover:bg-brand-400 text-white font-black text-base px-6 py-4 rounded-xl transition-all duration-200 hover:scale-105 shadow-xl shadow-brand-500/30"
            >
              See How It Works
            </a>
            <button
              type="button"
              onClick={handleShare}
              className="w-full inline-flex items-center justify-center gap-2 bg-transparent border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-gray-200 font-medium text-sm px-6 py-3.5 rounded-xl transition-all duration-200"
            >
              {copyConfirm ? '✓ Copied! Send it to your crew 🏀' : '📲 Text This To Your Group Chat'}
            </button>
          </div>
        </div>
      </section>

{/* ── Grab Your Crew ── */}
      <section className="py-16 sm:py-20 px-4 bg-gray-900/40">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4 leading-tight">
              Grab Your Crew. Forget the Bracket.<br className="hidden sm:block" /> Play All Tournament Long.
            </h2>
            <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
              Brackets are busted by day one. TourneyRun keeps every game meaningful — draft real players, score real points, and play with your people for three full weeks of action.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mb-10">
            {[
              {
                svg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
                title: 'Round up your group', desc: 'Invite friends, coworkers, or family. Anyone can join with an invite code.',
              },
              {
                svg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
                title: 'Schedule your draft', desc: 'Pick a time that works for everyone. Commissioner sets it, everyone shows up.',
              },
              {
                svg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
                title: 'Play for real stakes', desc: 'Set your own buy-in with your group. TourneyRun charges a $5 platform fee per team. Your prize pool is managed entirely outside the platform.',
              },
            ].map(card => (
              <div key={card.title} className="bg-gray-900 border border-gray-800 hover:border-brand-500/40 rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5">
                <div style={{ background: '#1e3a5f22', borderRadius: 10, padding: 10, marginBottom: 14, display: 'inline-flex' }}>{card.svg}</div>
                <h3 className="text-white font-bold text-base mb-2">{card.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link
              to={user ? '/create-league' : '/register'}
              className="inline-flex items-center justify-center bg-brand-500 hover:bg-brand-400 text-white font-black text-base px-8 py-4 rounded-xl transition-all duration-200 hover:scale-105 shadow-lg shadow-brand-500/20"
            >
              Start Your Group League — Free
            </Link>
          </div>
        </div>
      </section>

      {/* ── Live Draft Room Mockup ── */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-3">Live draft room</div>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              A live draft your crew will actually show up for.
            </h2>
            <p className="text-gray-400 text-sm mt-2">Real-time snake draft — countdown timer, auto-pick, live player queue.</p>
          </div>
          <DraftMockup />
        </div>
      </section>

      {/* ── Social proof bar ── */}
      <section className="bg-gray-900/60 border-y border-gray-800 py-10 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-3">
          <p className="text-gray-400 text-sm font-medium uppercase tracking-widest">
            Trusted by players since 2016
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Born from a decade of tournament fantasy experience.
          </h2>
          <p className="text-gray-400 text-base max-w-2xl mx-auto">
            What started as a friend-group tradition is now built for everyone.
          </p>
          <p className="text-brand-400 font-bold text-lg">
            Real players. Real points. Real stakes.
          </p>

        </div>
      </section>

      {/* ── How the money works ── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-3">Zero platform cut</div>
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
              You set the stakes.<br className="hidden sm:block" /> You keep the winnings.
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto leading-relaxed">
              TourneyRun charges a flat $5 platform fee per team — that's it. Commissioners collect buy-ins and pay out winners directly via Venmo, Zelle, or cash.{' '}
              <span className="text-white">We never hold or touch your prize money.</span>
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                svg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
                text: 'Set any buy-in your group agrees on — your league collects and pays out directly.',
              },
              {
                svg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
                text: 'Prize pool and payout structure decided by your league',
              },
              {
                svg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
                text: 'TourneyRun just runs the game — you keep 100% of the pot',
              },
            ].map(item => (
              <div key={item.text}
                className="flex items-start gap-3 bg-gray-900 border border-gray-800 hover:border-brand-500/40 rounded-xl p-5 transition-all duration-200 group hover:-translate-y-0.5"
              >
                <div style={{ background: '#1e3a5f22', borderRadius: 10, padding: 10, display: 'inline-flex', flexShrink: 0 }}>{item.svg}</div>
                <span className="text-gray-300 text-sm leading-relaxed font-medium">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why TourneyRun ── */}
      <section className="py-20 px-4 bg-gray-900/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-3">Unlike anything else</div>
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">
              Unlike bracket challenges, YOUR players score YOUR points.
            </h2>
            <p className="text-gray-400 text-lg">Three weeks of non-stop action with every bucket counting.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                svg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="12" x2="15" y2="15"/><circle cx="12" cy="12" r="1" fill="#60a5fa"/></svg>,
                title: 'Draft Like a Pro',
                desc: 'Real-time snake draft with live countdown timer, auto-pick, and player queue. No waiting, no confusion.',
              },
              {
                svg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
                title: 'Score Every Point',
                desc: 'Live scoring updates as your players perform. Watch your standings shift in real time with every bucket.',
              },
              {
                svg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
                title: 'Play for Real Stakes',
                desc: 'Commissioner sets the buy-in. Your league handles payouts directly via Venmo or Zelle. TourneyRun never touches your prize pool.',
              },
            ].map(card => (
              <div
                key={card.title}
                className="group relative bg-gray-900 border border-gray-800 hover:border-brand-500/50 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-brand-500/10 cursor-default"
              >
                <div className="absolute inset-0 rounded-2xl bg-brand-500/0 group-hover:bg-brand-500/3 transition-colors duration-300" />
                <div className="relative">
                  <div style={{ background: '#1e3a5f22', borderRadius: 10, padding: 10, marginBottom: 14, display: 'inline-flex' }}>{card.svg}</div>
                  <h3 className="text-xl font-black text-white mb-2">{card.title}</h3>
                  <p className="text-gray-400 leading-relaxed text-sm">{card.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-3">Up and running in minutes</div>
            <h2 className="text-3xl sm:text-4xl font-black text-white">
              Four steps. Infinite trash talk.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            {/* Connecting arrows (desktop) */}
            {[0,1,2].map(i => (
              <div key={i} className="hidden lg:block absolute"
                style={{ top: 40, left: `calc(${(i + 1) * 25}% - 12px)`, width: 24, zIndex: 10 }}>
                <span style={{ animation: 'arrowPulse 1.5s ease-in-out infinite', display: 'block', textAlign: 'center', color: '#378ADD', fontSize: 20 }}>›</span>
              </div>
            ))}

            {[
              { svg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>, num: '01', title: 'Commissioner creates a league', desc: 'Free to create. Name it, set the draft rules, and invite your crew.' },
              { icon: '📨', num: '02', title: '$5 per team to join — everyone\'s in, no free riders', desc: 'Secure entry for every team. No free riders, no ghosting.' },
              { icon: '⏱',  num: '03', title: 'Snake draft your player pool', desc: 'Live real-time draft with countdown timer and auto-pick fallback.' },
              { svg: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>, num: '04', title: 'Watch your players ball out', desc: '3 weeks of live scoring. Every bucket, every upset, every hero.' },
            ].map(step => (
              <div
                key={step.num}
                className="group bg-gray-900 border border-gray-800 hover:border-brand-500/50 rounded-2xl p-6 flex flex-col items-start transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg hover:shadow-brand-500/10 cursor-default"
              >
                {step.svg
                  ? <div style={{ background: '#1e3a5f22', borderRadius: 10, padding: 10, marginBottom: 14, display: 'inline-flex' }}>{step.svg}</div>
                  : <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">{step.icon}</div>
                }
                <div className="text-brand-500 text-xs font-black uppercase tracking-widest mb-1">{step.num}</div>
                <h3 className="font-black text-white text-base mb-2 leading-tight">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>

          {/* CTA after How It Works */}
          <div className="text-center mt-12">
            <Link
              to={user ? '/create-league' : '/register'}
              className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-black text-lg px-8 py-4 rounded-xl transition-all duration-200 hover:scale-105 shadow-xl shadow-brand-500/30"
            >
              Create Your League — Free
            </Link>
            <p className="text-gray-600 text-xs mt-3">Free to create · $5 platform fee per team · Prize pool managed by your league</p>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="py-16 px-4 bg-gray-900/40">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-3">What people are saying</div>
            <h2 className="text-3xl sm:text-4xl font-black text-white">Trusted since 2016</h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-5">
            {[
              {
                quote: 'Way better than brackets. My players stayed alive all tournament long.',
                name:  'Pat T.',
                loc:   'Charlotte, NC',
                init:  'PT',
              },
              {
                quote: 'Won $340 last year. Already signed up my whole office for 2026.',
                name:  'Garrett W.',
                loc:   'New York, NY',
                init:  'GW',
              },
              {
                quote: 'Finally a fantasy game that lasts the whole tournament. We run 3 leagues now.',
                name:  'Jon W.',
                loc:   'Naples, FL',
                init:  'JW',
              },
            ].map(t => (
              <div key={t.name} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-4">
                <p className="text-gray-200 text-sm leading-relaxed flex-1">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 text-xs font-black shrink-0">
                    {t.init}
                  </div>
                  <div>
                    <div className="text-white text-sm font-bold">{t.name}</div>
                    <div className="text-gray-500 text-xs">{t.loc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Smart Draft comparison ── */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-brand-500/20 border border-brand-500/30 rounded-full px-3 py-1 text-brand-400 text-xs font-bold uppercase tracking-widest mb-4">
              ⚡ Premium Feature
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-3 leading-tight">
              Can't make the draft?<br />
              <span className="text-brand-400">We've got you. ⚡</span>
            </h2>
            <p className="text-gray-400 text-base max-w-xl mx-auto">
              Smart Draft is your backup plan for <span className="text-white font-bold">$2.99</span> — it drafts like a seasoned pro while you're stuck in traffic, at dinner, or just forgot.
            </p>
          </div>

          {/* Side-by-side comparison */}
          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            {/* Free auto-pick */}
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6">
              <div className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-4">Free Auto-Pick</div>
              <ul className="space-y-3">
                {[
                  'Uses raw PPG only',
                  'Ignores injuries',
                  'No team balance',
                  'No region balance',
                ].map(item => (
                  <li key={item} className="flex items-center gap-3 text-gray-400 text-sm">
                    <span className="text-red-500 font-black text-base shrink-0">✗</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Smart Draft */}
            <div className="relative bg-gray-900 border border-amber-500/50 rounded-2xl p-6 overflow-hidden"
              style={{ boxShadow: '0 0 40px rgba(245,158,11,0.08)' }}>
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(245,158,11,0.06)_0%,_transparent_65%)] pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">⚡ Smart Draft</span>
                  <span className="bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full">$2.99</span>
                </div>
                <ul className="space-y-3">
                  {[
                    'ETP scoring (expected tournament points)',
                    'Skips injured players automatically',
                    'No team stacking',
                    'Region balance built in',
                  ].map(item => (
                    <li key={item} className="flex items-center gap-3 text-gray-200 text-sm">
                      <span className="text-green-400 font-black text-base shrink-0">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={handleSmartDraftCta}
              disabled={sdLoading}
              className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-gray-950 font-black text-base px-8 py-4 rounded-xl transition-all duration-200 hover:scale-105 shadow-lg shadow-amber-500/30 disabled:opacity-70 disabled:scale-100"
            >
              {sdLoading ? 'Redirecting…' : '⚡ Add Smart Draft — $2.99'}
              {!sdLoading && <span className="text-gray-700 text-sm">›</span>}
            </button>
            <p className="text-gray-600 text-xs mt-3">Per manager, per league — upgrade any time before or during the draft.</p>
          </div>
        </div>
      </section>

      {/* ── Urgency CTA ── */}
      <section className="relative px-4 py-20 overflow-hidden">
        {/* Deep blue fill */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/60 via-gray-900 to-brand-900/40" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(55,138,221,0.12)_0%,_transparent_70%)]" />

        <div className="relative max-w-3xl mx-auto text-center">
          <div className="text-brand-400 text-xs font-bold uppercase tracking-widest mb-4">⚡ Time is running out</div>
          <h2 className="text-4xl sm:text-5xl font-black text-white leading-tight mb-4">
            The bracket drops soon.<br />
            <span className="text-brand-400">Don't get left out.</span>
          </h2>
          <p className="text-gray-300 text-lg mb-10">
            Create your league now and send invites before your friends do.
          </p>

          <CountdownBlock />
          <p className="text-gray-500 text-xs mt-5 flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            Tournament tips off Thursday, March 19th at 12PM ET
          </p>

          <div className="mt-10">
            <Link
              to={user ? '/create-league' : '/register'}
              className="group inline-flex items-center gap-3 bg-brand-500 hover:bg-brand-400 text-white font-black text-xl px-10 py-5 rounded-xl transition-all duration-200 hover:scale-105 shadow-2xl shadow-brand-500/30 hover:shadow-brand-500/50"
            >
              Create Your League
              <span className="text-brand-200 text-base">›</span>
            </Link>
            <p className="text-gray-600 text-xs mt-4">Free to join — $5 entry when you join a league</p>
          </div>
        </div>
      </section>

      {/* ── Footer strip ── */}
      <div className="border-t border-gray-800 py-8 px-4 text-center space-y-3">
        <div className="flex items-center justify-center flex-wrap gap-x-4 gap-y-2 text-xs">
          <Link to="/strategy" className="text-gray-500 hover:text-gray-300 transition-colors">How to Play</Link>
          <span className="text-gray-800">·</span>
          <Link to="/faq" className="text-gray-500 hover:text-gray-300 transition-colors">FAQ</Link>
          <span className="text-gray-800">·</span>
          <Link to="/privacy" className="text-gray-500 hover:text-gray-300 transition-colors">Privacy</Link>
          <span className="text-gray-800">·</span>
          <Link to="/terms" className="text-gray-500 hover:text-gray-300 transition-colors">Terms</Link>
          <span className="text-gray-800">·</span>
          <a href="mailto:support@tourneyrun.app" className="text-gray-500 hover:text-gray-300 transition-colors">Contact</a>
        </div>
        <p className="text-gray-600 text-xs">
          © 2026 TourneyRun · WohlBuilt Group LLC · Payments by Stripe
        </p>
        <p className="text-gray-700 text-xs">
          Skill-based fantasy game · Not available in WA, ID, MT, NV, LA
        </p>
        <p className="text-gray-700 text-xs mt-1">
          TourneyRun charges a $5 platform fee per team for use of the software. Prize pools are managed independently by league commissioners outside of TourneyRun. TourneyRun does not hold, collect, or distribute prize money.
        </p>
      </div>
    </div>
  );
}
