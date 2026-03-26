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
const TOURNAMENT_DATE = new Date('2026-03-19T16:00:00Z');

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
              background: 'rgba(255,255,255,0.025)',
              border: '0.5px solid rgba(255,255,255,0.07)',
              borderRadius: 10,
              padding: '10px 12px',
            }}>
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
              <div style={{ fontSize: 9, color: card.textColor, marginBottom: 6, paddingLeft: 29 }}>
                {card.team} {card.emoji}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 29 }}>
                <span style={{
                  background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)',
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
    null,
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
  const timerColor = timerSecs <= 10 ? '#ef4444' : timerSecs <= 20 ? '#f59e0b' : '#f97316';

  return (
    <div className="relative w-full max-w-sm mx-auto lg:mx-0 lg:ml-auto">
      <div className="absolute -inset-6 rounded-3xl blur-2xl" style={{ background: 'rgba(249,115,22,0.08)' }} />
      <div className="relative rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'rgba(255,255,255,0.025)',
          border: '0.5px solid rgba(255,255,255,0.07)',
          borderRadius: 16,
          boxShadow: '0 24px 80px rgba(0,0,0,0.55), 0 0 40px rgba(249,115,22,0.07)',
        }}
      >
        {/* Title bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f97316', display: 'inline-block', animation: 'glowPulse 2s ease-in-out infinite' }} />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>Live Draft — Round 1</span>
          <div style={{ marginLeft: 'auto', position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
            <svg style={{ width: 36, height: 36, transform: 'rotate(-90deg)' }} viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
              <circle cx="18" cy="18" r="14" fill="none" stroke={timerColor}
                strokeWidth="3" strokeDasharray={`${pct} 100`} strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 1s linear, stroke 0.3s' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 10, color: timerColor }}>
              {timerSecs}
            </div>
          </div>
        </div>
        {/* On the clock */}
        <div style={{ padding: '8px 16px', background: 'rgba(249,115,22,0.08)', borderBottom: '0.5px solid rgba(249,115,22,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', display: 'inline-block', animation: 'glowPulse 1.5s ease-in-out infinite' }} />
          <span style={{ color: '#fb923c', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>On the clock: Mike's Squad</span>
        </div>
        {/* 3-column draft board grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
          {BOARD_COLS.map(col => (
            <div key={col.name} style={{
              borderTop: `2px solid ${col.color}`,
              padding: '6px 7px 5px',
              borderRight: '0.5px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: col.color, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {col.name}
              </div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{col.handle}</div>
            </div>
          ))}
          {BOARD_CELLS.map((row, ri) =>
            row.map((cell, ci) => {
              if (!cell) {
                return (
                  <div key={`${ri}-${ci}`} style={{
                    padding: '6px 7px',
                    borderRight: ci < 2 ? '0.5px solid rgba(255,255,255,0.06)' : 'none',
                    borderTop: '0.5px solid rgba(255,255,255,0.06)',
                    background: 'rgba(249,115,22,0.05)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                    minHeight: 46,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', display: 'inline-block' }} />
                    <span style={{ fontSize: 8, color: '#fb923c', fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>On the clock...</span>
                  </div>
                );
              }
              const pill = POS_PILL[cell.pos] || POS_PILL.G;
              return (
                <div key={`${ri}-${ci}`} style={{
                  padding: '6px 7px',
                  borderRight: ci < 2 ? '0.5px solid rgba(255,255,255,0.06)' : 'none',
                  borderTop: '0.5px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.01)',
                }}>
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
        <div style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>Pick 2 of 120</span>
          <span style={{ color: '#4ade80', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block', animation: 'glowPulse 2s ease-in-out infinite' }} /> 8 teams live
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
          <div style={{
            background: 'rgba(255,255,255,0.025)',
            border: '0.5px solid rgba(255,255,255,0.07)',
            borderRadius: 16,
          }} className="px-4 sm:px-6 py-4 sm:py-5 text-center min-w-[72px] sm:min-w-[90px]">
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

// ─── Live bracket scores mockup ───────────────────────────────────────────────
const BRACKET_GAMES = [
  { round: 'Sweet 16', region: 'East',     home: { name: 'Duke',    seed: 1, score: 78 }, away: { name: 'Houston',  seed: 2, score: 71 }, status: 'Final',   pick: true  },
  { round: 'Sweet 16', region: 'West',     home: { name: 'Arizona', seed: 1, score: 82 }, away: { name: 'Michigan', seed: 1, score: 74 }, status: 'Final',   pick: false },
  { round: 'Sweet 16', region: 'South',    home: { name: 'Florida', seed: 1, score: 61 }, away: { name: 'Gonzaga',  seed: 3, score: 58 }, status: 'Final',   pick: true  },
  { round: 'Sweet 16', region: 'Midwest',  home: { name: 'UConn',   seed: 2, score: 74 }, away: { name: 'Virginia', seed: 3, score: 66 }, status: '2nd · 12:34', pick: false },
];

function BracketMockup() {
  return (
    <div style={{
      background: '#060d07',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 24px 80px rgba(0,0,0,0.55), 0 0 40px rgba(249,115,22,0.05)',
    }}>
      {/* Chrome bar */}
      <div style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '0.5px solid rgba(255,255,255,0.07)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />)}
        </div>
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 6, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>tourneyrun.app · Live Bracket · Sweet 16</span>
        </div>
      </div>

      {/* Header */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>2026 NCAA Tournament</div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 2 }}>Sweet 16 · March 27–28</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 8, padding: '4px 10px' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'glowPulse 2s ease-in-out infinite' }} />
          <span style={{ color: '#fb923c', fontSize: 11, fontWeight: 700 }}>Live</span>
        </div>
      </div>

      {/* Games */}
      <div>
        {BRACKET_GAMES.map((game, i) => (
          <div key={i} style={{
            padding: '10px 16px',
            borderBottom: i < BRACKET_GAMES.length - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none',
            background: game.pick ? 'rgba(249,115,22,0.04)' : 'transparent',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.25)' }}>
                {game.region}
              </span>
              <span style={{ fontSize: 10, color: game.status.includes('·') ? '#fb923c' : 'rgba(255,255,255,0.3)', fontWeight: game.status.includes('·') ? 700 : 400 }}>
                {game.status}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[game.home, game.away].map((team, ti) => (
                  <div key={ti} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', width: 12, textAlign: 'right', flexShrink: 0 }}>{team.seed}</span>
                      <span style={{ fontSize: 12, fontWeight: team.score > (ti === 0 ? game.away.score : game.home.score) ? 700 : 400, color: team.score > (ti === 0 ? game.away.score : game.home.score) ? '#fff' : 'rgba(255,255,255,0.5)' }}>{team.name}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: team.score > (ti === 0 ? game.away.score : game.home.score) ? '#fff' : 'rgba(255,255,255,0.4)' }}>{team.score}</span>
                  </div>
                ))}
              </div>
              {game.pick && (
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 4, background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', color: '#fb923c', flexShrink: 0 }}>MY PICK</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ background: 'rgba(255,255,255,0.02)', borderTop: '0.5px solid rgba(255,255,255,0.07)', padding: '7px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>Updated 2 min ago · Data via ESPN</span>
        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>64 players scoring</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Landing() {
  useDocTitle('College Basketball Fantasy | TourneyRun', {
    description: 'Run a college basketball fantasy league with your crew. Smart drafts, live tournament scores, and prize pools that pay out instantly.',
  });
  const { user } = useAuth();
  const navigate = useNavigate();

  const [copyConfirm, setCopyConfirm] = useState(false);
  const [sdLoading, setSdLoading] = useState(false);
  const [heroHovered, setHeroHovered] = useState(false);

  const handleSmartDraftCta = async () => {
    if (user) {
      navigate('/create-league?smartdraft=1');
      return;
    }
    setSdLoading(true);
    try {
      const res = await api.post('/payments/smart-draft-standalone');
      window.location.href = res.data.url;
    } catch {
      navigate('/register?smartdraft=1');
    } finally {
      setSdLoading(false);
    }
  };

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

      {/* ── Hero ── */}
      <section
        className="relative flex items-center justify-center px-4 overflow-hidden text-center"
        style={{ paddingTop: 'clamp(64px,10vw,96px)', paddingBottom: 'clamp(64px,10vw,96px)' }}
        onMouseEnter={() => setHeroHovered(true)}
        onMouseLeave={() => setHeroHovered(false)}
      >
        {/* Glow orbs */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute inset-0"
            style={{ background: 'radial-gradient(ellipse at top, rgba(249,115,22,0.08) 0%, transparent 65%)' }} />
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full blur-3xl"
            style={{ background: 'rgba(249,115,22,0.07)', animation: 'glowPulse 4s ease-in-out infinite' }} />
          <div className="absolute bottom-0 right-0 w-72 h-72 rounded-full blur-3xl"
            style={{ background: 'rgba(249,115,22,0.06)' }} />
        </div>
        <FloatingCards slowdown={heroHovered} />

        <div className="relative z-10 max-w-3xl mx-auto w-full">
          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] px-4 py-1.5 rounded-full mb-6"
            style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)', color: '#fb923c' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', display: 'inline-block', animation: 'glowPulse 2s ease-in-out infinite' }} />
            2026 Fantasy Basketball
          </div>

          {/* Main headline */}
          <h1 style={{
            fontSize: 'clamp(48px,10vw,80px)',
            fontWeight: 900,
            lineHeight: 1.05,
            color: '#fff',
            marginBottom: 16,
            letterSpacing: '-0.03em',
            textTransform: 'uppercase',
          }}>
            YOUR PLAYERS.<br />
            <span style={{ color: '#f97316' }}>THEIR POINTS.</span>
          </h1>

          <p className="text-gray-400 max-w-xl mx-auto leading-relaxed mb-10"
            style={{ fontSize: 'clamp(16px,2vw,20px)' }}>
            Draft college basketball players. Score points as they win games. Play for three full weeks with your crew.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 font-black text-white px-10 py-4 rounded-full transition-all text-base"
              style={{
                background: '#f97316',
                boxShadow: '0 8px 32px rgba(249,115,22,0.35)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ea6c0a'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f97316'; }}
            >
              See How It Works →
            </a>
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center justify-center gap-2 font-semibold text-sm px-10 py-4 rounded-full transition-all"
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; }}
            >
              {copyConfirm ? '✓ Copied! Send it to your crew 🏀' : '📲 Text This To Your Group Chat'}
            </button>
          </div>
        </div>
      </section>

      {/* ── Social proof bar ── */}
      <section style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)', padding: '40px 16px' }}>
        <div className="max-w-4xl mx-auto text-center space-y-3">
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em' }}>
            Trusted since 2016
          </p>
          <h2 style={{ color: '#fff', fontSize: 'clamp(22px,4vw,32px)', fontWeight: 900, letterSpacing: '-0.02em' }}>
            Born from a decade of tournament fantasy experience.
          </h2>
          <p className="text-gray-400 text-base max-w-2xl mx-auto">
            What started as a friend-group tradition is now built for everyone. Real players. Real points. Real stakes.
          </p>
          <p style={{ color: '#f97316', fontWeight: 700, fontSize: 18 }}>
            Real players. Real points. Real stakes.
          </p>
        </div>
      </section>

      {/* ── Grab Your Crew ── */}
      <section style={{ padding: 'clamp(64px,10vw,96px) 16px' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p style={{ color: '#f97316', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 12 }}>
              Get started
            </p>
            <h2 style={{ color: '#fff', fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.025em', marginBottom: 16 }}>
              Grab Your Crew.<br className="hidden sm:block" /> Forget the Bracket.
            </h2>
            <p className="text-gray-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
              Brackets are busted by day one. TourneyRun keeps every game meaningful — draft real players, score real points, and play with your people for three full weeks of action.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mb-10">
            {[
              {
                icon: '👥',
                title: 'Round up your group',
                desc: 'Invite friends, coworkers, or family. Anyone can join with an invite code.',
              },
              {
                icon: '📅',
                title: 'Schedule your draft',
                desc: 'Pick a time that works for everyone. Commissioner sets it, everyone shows up.',
              },
              {
                icon: '🏆',
                title: 'Play for real stakes',
                desc: 'Set your own buy-in with your group. TourneyRun charges a $5 platform fee per team. Your prize pool is managed entirely outside the platform.',
              },
            ].map(card => (
              <div key={card.title} style={{
                background: 'rgba(255,255,255,0.025)',
                border: '0.5px solid rgba(255,255,255,0.07)',
                borderRadius: 16,
                padding: '20px',
                transition: 'border-color 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(249,115,22,0.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
              >
                <div style={{ fontSize: 28, marginBottom: 12 }}>{card.icon}</div>
                <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{card.title}</h3>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, lineHeight: 1.6 }}>{card.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link
              to={user ? '/create-league' : '/register'}
              className="inline-flex items-center justify-center font-black text-white text-base px-8 py-4 rounded-full transition-all"
              style={{
                background: '#f97316',
                boxShadow: '0 8px 32px rgba(249,115,22,0.3)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ea6c0a'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f97316'; }}
            >
              Start Your Group League — Free
            </Link>
          </div>
        </div>
      </section>

      {/* ── Live Draft Room Mockup ── */}
      <section style={{ padding: 'clamp(64px,10vw,96px) 16px', borderTop: '0.5px solid rgba(255,255,255,0.06)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <p style={{ color: '#f97316', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 12 }}>
              Live draft room
            </p>
            <h2 style={{ color: '#fff', fontSize: 'clamp(26px,4vw,40px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 12 }}>
              A live draft your crew will actually show up for.
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15 }}>Real-time snake draft — countdown timer, auto-pick, live player queue.</p>
          </div>
          <DraftMockup />
        </div>
      </section>

      {/* ── Live Bracket Section ── */}
      <section style={{ padding: 'clamp(64px,10vw,96px) 16px' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <p style={{ color: '#f97316', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 12 }}>
              Exclusive feature
            </p>
            <h2 style={{ color: '#fff', fontSize: 'clamp(26px,4vw,40px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 12 }}>
              Live Bracket. Built in.
            </h2>
            <p className="text-gray-400 text-base max-w-xl mx-auto">
              See every game's score inside your league — no tab-switching. Track your players' wins in real time as the bracket unfolds.
            </p>
          </div>
          <BracketMockup />
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 12, marginTop: 12, fontStyle: 'italic' }}>
            Live bracket inside your league. No refreshing ESPN.
          </p>
        </div>
      </section>

      {/* ── Why TourneyRun ── */}
      <section style={{ padding: 'clamp(64px,10vw,96px) 16px', borderTop: '0.5px solid rgba(255,255,255,0.06)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p style={{ color: '#f97316', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 12 }}>
              Unlike anything else
            </p>
            <h2 style={{ color: '#fff', fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.025em', marginBottom: 12 }}>
              Unlike bracket challenges,<br className="hidden sm:block" /> YOUR players score YOUR points.
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 17 }}>Three weeks of non-stop action with every bucket counting.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: '⏱',
                title: 'Draft Like a Pro',
                desc: 'Real-time snake draft with live countdown timer, auto-pick, and player queue. No waiting, no confusion.',
              },
              {
                icon: '📊',
                title: 'Score Every Point',
                desc: 'Live scoring updates as your players perform. Watch your standings shift in real time with every bucket.',
              },
              {
                icon: '💰',
                title: 'Play for Real Stakes',
                desc: 'Commissioner sets the buy-in. Your league handles payouts directly via Venmo or Zelle. TourneyRun never touches your prize pool.',
              },
            ].map(card => (
              <div
                key={card.title}
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '0.5px solid rgba(255,255,255,0.07)',
                  borderRadius: 16,
                  padding: '24px',
                  transition: 'border-color 0.3s, transform 0.3s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(249,115,22,0.35)'; e.currentTarget.style.transform = 'translateY(-4px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ fontSize: 32, marginBottom: 14 }}>{card.icon}</div>
                <h3 style={{ color: '#fff', fontWeight: 900, fontSize: 18, marginBottom: 8 }}>{card.title}</h3>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, lineHeight: 1.6 }}>{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" style={{ padding: 'clamp(64px,10vw,96px) 16px' }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: '#f97316', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 12 }}>
              Up and running in minutes
            </p>
            <h2 style={{ color: '#fff', fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.025em' }}>
              Four steps. Infinite trash talk.
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            {[0,1,2].map(i => (
              <div key={i} className="hidden lg:block absolute"
                style={{ top: 40, left: `calc(${(i + 1) * 25}% - 12px)`, width: 24, zIndex: 10 }}>
                <span style={{ animation: 'arrowPulse 1.5s ease-in-out infinite', display: 'block', textAlign: 'center', color: '#f97316', fontSize: 20 }}>›</span>
              </div>
            ))}

            {[
              { icon: '⭐', num: '01', title: 'Commissioner creates a league', desc: 'Free to create. Name it, set the draft rules, and invite your crew.' },
              { icon: '📨', num: '02', title: '$5 per team to join — everyone\'s in, no free riders', desc: 'Secure entry for every team. No free riders, no ghosting.' },
              { icon: '⏱',  num: '03', title: 'Snake draft your player pool', desc: 'Live real-time draft with countdown timer and auto-pick fallback.' },
              { icon: '🏀', num: '04', title: 'Watch your players ball out', desc: '3 weeks of live scoring. Every bucket, every upset, every hero.' },
            ].map(step => (
              <div
                key={step.num}
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '0.5px solid rgba(255,255,255,0.07)',
                  borderRadius: 16,
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  transition: 'border-color 0.3s, transform 0.3s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(249,115,22,0.35)'; e.currentTarget.style.transform = 'translateY(-4px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{ fontSize: 28, marginBottom: 12 }}>{step.icon}</div>
                <div style={{ color: '#f97316', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 8 }}>{step.num}</div>
                <h3 style={{ fontWeight: 900, color: '#fff', fontSize: 14, marginBottom: 8, lineHeight: 1.3 }}>{step.title}</h3>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, lineHeight: 1.6 }}>{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              to={user ? '/create-league' : '/register'}
              className="inline-flex items-center gap-2 font-black text-white text-lg px-8 py-4 rounded-full transition-all"
              style={{
                background: '#f97316',
                boxShadow: '0 8px 32px rgba(249,115,22,0.35)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ea6c0a'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f97316'; }}
            >
              Create Your League — Free
            </Link>
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, marginTop: 12 }}>Free to create · $5 platform fee per team · Prize pool managed by your league</p>
          </div>
        </div>
      </section>

      {/* ── ETP Scoring breakdown ── */}
      <section style={{ padding: 'clamp(64px,10vw,96px) 16px', borderTop: '0.5px solid rgba(255,255,255,0.06)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p style={{ color: '#f97316', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 12 }}>
              ETP scoring system
            </p>
            <h2 style={{ color: '#fff', fontSize: 'clamp(26px,4vw,40px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 12 }}>
              Real scoring. Real stakes.
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, maxWidth: 560, margin: '0 auto' }}>
              Unlike bracket challenges, players earn points every single game. Every bucket, every win — your team stays alive all tournament long.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 mb-8">
            {/* Game scoring */}
            <div style={{ background: 'rgba(255,255,255,0.025)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px' }}>
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 16 }}>Per Game Scoring</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'Win in Round of 64',  pts: '+1',   color: '#4ade80' },
                  { label: 'Win in Round of 32',  pts: '+2',   color: '#4ade80' },
                  { label: 'Win in Sweet 16',     pts: '+4',   color: '#4ade80' },
                  { label: 'Win in Elite 8',      pts: '+8',   color: '#fb923c' },
                  { label: 'Win in Final Four',   pts: '+16',  color: '#fb923c' },
                  { label: 'Win Championship',    pts: '+32',  color: '#fbbf24' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{item.label}</span>
                    <span style={{ color: item.color, fontWeight: 900, fontSize: 15 }}>{item.pts}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ETP & Elimination rules */}
            <div style={{ background: 'rgba(255,255,255,0.025)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px' }}>
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 16 }}>ETP & Elimination Rules</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { label: 'ETP = Expected Tournament Points', note: 'Pre-tournament value based on bracket odds' },
                  { label: 'Players eliminated = dropped', note: 'Your roster evolves as the bracket narrows' },
                  { label: 'Region balance encouraged', note: 'Smart Draft builds a balanced roster for you' },
                  { label: 'No team stacking', note: 'Max 2 players per team — spread the risk' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ color: '#f97316', flexShrink: 0, marginTop: 2 }}>✓</span>
                    <div>
                      <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{item.label}</div>
                      <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 }}>{item.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section style={{ padding: 'clamp(64px,10vw,96px) 16px' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <p style={{ color: '#f97316', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 12 }}>
              What people are saying
            </p>
            <h2 style={{ color: '#fff', fontSize: 'clamp(26px,4vw,40px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em' }}>
              Trusted since 2016
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-5">
            {[
              { quote: 'Way better than brackets. My players stayed alive all tournament long.', name: 'Pat T.',    loc: 'Charlotte, NC', init: 'PT' },
              { quote: 'Won $340 last year. Already signed up my whole office for 2026.',       name: 'Garrett W.', loc: 'New York, NY',   init: 'GW' },
              { quote: 'Finally a fantasy game that lasts the whole tournament. We run 3 leagues now.', name: 'Jon W.', loc: 'Naples, FL', init: 'JW' },
            ].map(t => (
              <div key={t.name} style={{
                background: 'rgba(255,255,255,0.025)',
                border: '0.5px solid rgba(255,255,255,0.07)',
                borderRadius: 16,
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                transition: 'border-color 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(249,115,22,0.25)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
              >
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.6, flex: 1 }}>"{t.quote}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'rgba(249,115,22,0.15)',
                    border: '1px solid rgba(249,115,22,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fb923c', fontSize: 11, fontWeight: 900, flexShrink: 0,
                  }}>{t.init}</div>
                  <div>
                    <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{t.name}</div>
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{t.loc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How the money works ── */}
      <section style={{ padding: 'clamp(64px,10vw,96px) 16px', borderTop: '0.5px solid rgba(255,255,255,0.06)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <p style={{ color: '#f97316', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 12 }}>
              Zero platform cut
            </p>
            <h2 style={{ color: '#fff', fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.025em', marginBottom: 16 }}>
              You set the stakes.<br className="hidden sm:block" /> You keep the winnings.
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto leading-relaxed">
              TourneyRun charges a flat $5 platform fee per team — that's it. Commissioners collect buy-ins and pay out winners directly via Venmo, Zelle, or cash.{' '}
              <span style={{ color: '#fff' }}>We never hold or touch your prize money.</span>
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: '💵', text: 'Set any buy-in your group agrees on — your league collects and pays out directly.' },
              { icon: '📈', text: 'Prize pool and payout structure decided by your league' },
              { icon: '✓',  text: 'TourneyRun just runs the game — you keep 100% of the pot' },
            ].map(item => (
              <div key={item.text}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  background: 'rgba(255,255,255,0.025)',
                  border: '0.5px solid rgba(255,255,255,0.07)',
                  borderRadius: 16,
                  padding: '20px',
                  transition: 'border-color 0.2s, transform 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(249,115,22,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <span style={{ fontSize: 24, flexShrink: 0 }}>{item.icon}</span>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.6 }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Smart Draft comparison ── */}
      <section style={{ padding: 'clamp(64px,10vw,96px) 16px' }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-6"
              style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#fbbf24' }}>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>⚡ Premium Feature</span>
            </div>
            <h2 style={{ color: '#fff', fontSize: 'clamp(26px,4vw,40px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 12 }}>
              Can't make the draft?<br />
              <span style={{ color: '#fb923c' }}>We've got you. ⚡</span>
            </h2>
            <p className="text-gray-400 text-base max-w-xl mx-auto">
              Smart Draft is your backup plan for <span className="text-white font-bold">$2.99</span> — it drafts like a seasoned pro while you're stuck in traffic, at dinner, or just forgot.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-8">
            <div style={{
              background: 'rgba(255,255,255,0.025)',
              border: '0.5px solid rgba(255,255,255,0.07)',
              borderRadius: 16,
              padding: '24px',
            }}>
              <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 16 }}>Free Auto-Pick</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {['Uses raw PPG only', 'Ignores injuries', 'No team balance', 'No region balance'].map(item => (
                  <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>
                    <span style={{ color: '#ef4444', fontWeight: 900, fontSize: 16, flexShrink: 0 }}>✗</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{
              position: 'relative',
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(245,158,11,0.4)',
              borderRadius: 16,
              padding: '24px',
              overflow: 'hidden',
              boxShadow: '0 0 40px rgba(245,158,11,0.08)',
            }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top right, rgba(245,158,11,0.06) 0%, transparent 65%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>⚡ Smart Draft</span>
                  <span style={{ background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.35)', color: '#fbbf24', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>$2.99</span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    'ETP scoring (expected tournament points)',
                    'Skips injured players automatically',
                    'No team stacking',
                    'Region balance built in',
                  ].map(item => (
                    <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'rgba(255,255,255,0.8)', fontSize: 14 }}>
                      <span style={{ color: '#4ade80', fontWeight: 900, fontSize: 16, flexShrink: 0 }}>✓</span>
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
              className="inline-flex items-center gap-2 font-black text-base px-8 py-4 rounded-full transition-all disabled:opacity-70"
              style={{
                background: '#f59e0b',
                color: '#111',
                boxShadow: '0 8px 32px rgba(245,158,11,0.3)',
              }}
              onMouseEnter={e => { if (!sdLoading) e.currentTarget.style.background = '#d97706'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f59e0b'; }}
            >
              {sdLoading ? 'Redirecting…' : '⚡ Add Smart Draft — $2.99'}
              {!sdLoading && <span style={{ color: 'rgba(0,0,0,0.4)', fontSize: 16 }}>›</span>}
            </button>
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, marginTop: 12 }}>Per manager, per league — upgrade any time before or during the draft.</p>
          </div>
        </div>
      </section>

      {/* ── Urgency CTA ── */}
      <section style={{
        position: 'relative',
        padding: 'clamp(64px,10vw,96px) 16px',
        overflow: 'hidden',
        borderTop: '0.5px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(249,115,22,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(249,115,22,0.06) 0%, transparent 50%, rgba(249,115,22,0.04) 100%)', pointerEvents: 'none' }} />

        <div className="relative max-w-3xl mx-auto text-center">
          <p style={{ color: '#f97316', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.22em', marginBottom: 16 }}>
            ⚡ Time is running out
          </p>
          <h2 style={{ color: '#fff', fontSize: 'clamp(36px,8vw,64px)', fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.03em', marginBottom: 16 }}>
            The bracket drops soon.<br />
            <span style={{ color: '#f97316' }}>Don't get left out.</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 18, marginBottom: 40 }}>
            Create your league now and send invites before your friends do.
          </p>

          <CountdownBlock />
          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block', animation: 'glowPulse 2s ease-in-out infinite', flexShrink: 0 }} />
            Tournament tips off Thursday, March 19th at 12PM ET
          </p>

          <div style={{ marginTop: 40 }}>
            <Link
              to={user ? '/create-league' : '/register'}
              className="inline-flex items-center gap-3 font-black text-white text-xl px-10 py-5 rounded-full transition-all"
              style={{
                background: '#f97316',
                boxShadow: '0 8px 48px rgba(249,115,22,0.4)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ea6c0a'; e.currentTarget.style.boxShadow = '0 8px 48px rgba(249,115,22,0.6)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f97316'; e.currentTarget.style.boxShadow = '0 8px 48px rgba(249,115,22,0.4)'; }}
            >
              Create Your League
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 18 }}>›</span>
            </Link>
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, marginTop: 16 }}>Free to join · $5 entry when you join a league</p>
          </div>
        </div>
      </section>

      {/* ── Footer strip ── */}
      <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.07)', padding: '32px 16px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '8px 16px', marginBottom: 12 }}>
          <Link to="/strategy" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}>
            How to Play
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
          <Link to="/faq" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}>
            FAQ
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
          <Link to="/privacy" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}>
            Privacy
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
          <Link to="/terms" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}>
            Terms
          </Link>
          <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
          <a href="mailto:support@tourneyrun.app" style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}>
            Contact
          </a>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, marginBottom: 6 }}>
          © 2026 TourneyRun · WohlBuilt Group LLC · Payments by Stripe
        </p>
        <p style={{ color: 'rgba(255,255,255,0.15)', fontSize: 12, marginBottom: 4 }}>
          Skill-based fantasy game · Not available in WA, ID, MT, NV, LA
        </p>
        <p style={{ color: 'rgba(255,255,255,0.12)', fontSize: 12 }}>
          TourneyRun charges a $5 platform fee per team for use of the software. Prize pools are managed independently by league commissioners outside of TourneyRun. TourneyRun does not hold, collect, or distribute prize money.
        </p>
      </div>
    </div>
  );
}
