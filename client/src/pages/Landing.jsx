import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect, useRef } from 'react';
import { useDocTitle } from '../hooks/useDocTitle';

// ─── Keyframe injection ───────────────────────────────────────────────────────
const STYLES = `
@keyframes floatParticle {
  0%   { transform: translateY(0px) rotate(0deg);   opacity: 0.25; }
  50%  { transform: translateY(-28px) rotate(180deg); opacity: 0.55; }
  100% { transform: translateY(0px) rotate(360deg); opacity: 0.25; }
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
const TOURNAMENT_DATE = new Date('2026-03-19T17:00:00Z'); // 12:00 PM ET (UTC-5)

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

// ─── Particles ────────────────────────────────────────────────────────────────
const PARTICLE_SEEDS = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  left:     `${4 + (i * 6.7) % 92}%`,
  top:      `${5 + (i * 9.1) % 85}%`,
  fontSize: `${14 + (i * 4) % 18}px`,
  delay:    `${(i * 0.35) % 3.5}s`,
  duration: `${3.2 + (i * 0.6) % 3.8}s`,
}));

function Particles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden>
      {PARTICLE_SEEDS.map(p => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            fontSize: p.fontSize,
            animation: `floatParticle ${p.duration} ease-in-out ${p.delay} infinite`,
          }}
        >
          🏀
        </span>
      ))}
    </div>
  );
}

// ─── Draft room mockup ────────────────────────────────────────────────────────
const MOCK_PLAYERS = [
  { name: 'Cooper Flagg',    ppg: 22.1, pos: 'F', picked: true,  picker: "Mike's Squad"  },
  { name: 'Dylan Harper',    ppg: 19.8, pos: 'G', picked: false, picker: null            },
  { name: 'Ace Bailey',      ppg: 18.3, pos: 'F', picked: false, picker: null            },
  { name: 'Tre Johnson',     ppg: 17.9, pos: 'G', picked: false, picker: null            },
  { name: 'VJ Edgecombe',    ppg: 16.5, pos: 'G', picked: false, picker: null            },
];

const POS_COLOR = { G: 'text-blue-400', F: 'text-orange-400', C: 'text-red-400' };

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
          <span className="text-brand-400 text-xs font-bold uppercase tracking-wide">On the clock: Alex's Squad</span>
        </div>
        {/* Player rows */}
        {MOCK_PLAYERS.map((p, i) => (
          <div key={p.name}
            className={`flex items-center px-4 py-2.5 border-b border-gray-800/60 transition-colors ${
              i === 1 ? 'bg-brand-500/5' : ''
            } ${p.picked ? 'opacity-40' : ''}`}
          >
            <span className="text-gray-600 text-[10px] font-mono w-4">{i + 1}</span>
            <span className={`text-[10px] font-bold ml-1 mr-2 ${POS_COLOR[p.pos] || 'text-gray-400'}`}>{p.pos}</span>
            <span className={`text-sm font-semibold flex-1 ${i === 1 ? 'text-white' : 'text-gray-300'}`}>{p.name}</span>
            {p.picked ? (
              <span className="text-[9px] text-gray-500 italic">{p.picker}</span>
            ) : (
              <span className={`text-xs font-bold ${i === 1 ? 'text-brand-400' : 'text-gray-500'}`}>{p.ppg}</span>
            )}
            {i === 1 && <span className="ml-2 text-[9px] font-bold text-brand-400 bg-brand-500/20 border border-brand-500/30 px-1.5 py-0.5 rounded">Pick →</span>}
          </div>
        ))}
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
    <div className="flex items-center justify-center gap-3 flex-wrap">
      {[
        { v: days,  l: 'DAYS'  },
        { v: hours, l: 'HRS'   },
        { v: mins,  l: 'MIN'   },
        { v: secs,  l: 'SEC'   },
      ].map(({ v, l }, i) => (
        <div key={l} className="flex items-center gap-3">
          <div className="text-center">
            <div className="text-4xl sm:text-5xl font-black text-white tabular-nums w-16 sm:w-20">
              {String(v).padStart(2, '0')}
            </div>
            <div className="text-gray-500 text-[10px] font-bold tracking-widest mt-1">{l}</div>
          </div>
          {i < 3 && <span className="text-gray-600 text-3xl font-bold mb-4">:</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Landing() {
  useDocTitle('TourneyRun — Player Pool Fantasy');
  const { user } = useAuth();

  const [c1, r1] = useCountUp(68);
  const [c2, r2] = useCountUp(300);

  const tickerText = '🏀 The 2026 Tournament starts Thursday March 19th at 12PM ET  ·  Draft day is coming  ·  Secure your spot before your friends do  ·  $5 entry per team  ·  You keep 100% of the prize pool  ·  ';

  return (
    <div className="overflow-x-hidden bg-gray-950">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      {/* ── Live ticker ── */}
      <div className="bg-brand-500/10 border-b border-brand-500/20 overflow-hidden py-2">
        <div style={{ display: 'flex', width: 'max-content', animation: 'marquee 30s linear infinite' }}>
          {[tickerText, tickerText].map((t, i) => (
            <span key={i} className="text-brand-400 text-xs font-semibold tracking-wide whitespace-nowrap px-4">{t}</span>
          ))}
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex items-center px-4 py-16 overflow-hidden">
        {/* Glow orbs */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[700px] bg-brand-600/10 rounded-full blur-3xl"
            style={{ animation: 'glowPulse 4s ease-in-out infinite' }} />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-brand-800/15 rounded-full blur-3xl" />
          <div className="absolute top-0 left-0 w-64 h-64 bg-brand-900/20 rounded-full blur-3xl" />
        </div>

        <Particles />

        <div className="relative max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left — copy */}
          <div>
            <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/30 text-brand-400 text-xs font-bold px-4 py-1.5 rounded-full mb-5 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-ping" />
              2026 College Basketball Fantasy
            </div>

            {/* Hook line — mobile-first, reads first */}
            <p className="text-gray-400 text-base sm:text-lg font-semibold mb-3 leading-snug">
              Tired of busting your bracket on day one? 🤦
            </p>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] mb-5">
              <span className="bg-gradient-to-br from-white to-gray-300 bg-clip-text text-transparent block">
                Your Players.
              </span>
              <span className="bg-gradient-to-r from-brand-300 via-brand-400 to-brand-500 bg-clip-text text-transparent block">
                Their Points.
              </span>
              <span className="bg-gradient-to-br from-white to-gray-300 bg-clip-text text-transparent block">
                Your Prize.
              </span>
            </h1>

            <p className="text-gray-300 text-lg sm:text-xl leading-relaxed mb-8 max-w-xl">
              Unlike bracket challenges,{' '}
              <span className="text-white font-semibold">your players score your points</span>{' '}
              all tournament long — every bucket counts.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-10">
              <Link
                to={user ? '/create-league' : '/register'}
                className="group relative inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-black text-lg px-8 py-4 rounded-xl transition-all duration-200 hover:scale-105 shadow-xl shadow-brand-500/30 hover:shadow-brand-500/50"
              >
                <span>Create Your Account</span>
                <span className="text-brand-200 text-sm font-normal">— Free</span>
                <span className="absolute -inset-0.5 rounded-xl bg-brand-400/20 blur opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 bg-transparent hover:bg-white/5 border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white font-bold text-lg px-8 py-4 rounded-xl transition-all duration-200"
              >
                See How It Works
              </a>
            </div>

            {/* Micro-stats */}
            <div className="flex items-center gap-6 flex-wrap">
              <div ref={r1} className="text-center" style={{ animation: 'countUp 0.6s ease-out' }}>
                <div className="text-2xl font-black text-brand-400">{c1}+</div>
                <div className="text-gray-500 text-xs">Tournament Teams</div>
              </div>
              <div className="w-px h-8 bg-gray-700" />
              <div ref={r2} className="text-center">
                <div className="text-2xl font-black text-brand-400">{c2}+</div>
                <div className="text-gray-500 text-xs">Draftable Players</div>
              </div>
              <div className="w-px h-8 bg-gray-700" />
              <div className="text-center">
                <div className="text-2xl font-black text-brand-400">1pt</div>
                <div className="text-gray-500 text-xs">Per Point Scored</div>
              </div>
            </div>
          </div>

          {/* Right — mockup */}
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
            Real players. Real points. Real money.
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
              TourneyRun takes nothing from your prize pool. Commissioners set the entry fee, teams pay to join, and winners get paid however your league decides —{' '}
              <span className="text-white">Venmo, Zelle, cash, whatever works.</span>
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: '💰', text: 'Set any buy-in your group agrees on — play for fun or play for some serious cash!' },
              { icon: '🏆', text: 'Prize pool and payout structure decided by your league' },
              { icon: '✅', text: 'TourneyRun just runs the game — you keep 100% of the pot' },
            ].map(item => (
              <div key={item.text}
                className="flex items-start gap-3 bg-gray-900 border border-gray-800 hover:border-brand-500/40 rounded-xl p-5 transition-all duration-200 group hover:-translate-y-0.5"
              >
                <span className="text-2xl shrink-0 group-hover:scale-110 transition-transform">{item.icon}</span>
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
                icon: '🎯',
                title: 'Draft Like a Pro',
                desc: 'Real-time snake draft with live countdown timer, auto-pick, and player queue. No waiting, no confusion.',
              },
              {
                icon: '📊',
                title: 'Score Every Point',
                desc: 'Live scoring updates as your players perform. Watch your standings shift in real time with every bucket.',
              },
              {
                icon: '💵',
                title: 'Win Real Money',
                desc: 'Commissioner sets the stakes. Everyone pays. Winner takes the pot. No middleman. No platform cut.',
              },
            ].map(card => (
              <div
                key={card.title}
                className="group relative bg-gray-900 border border-gray-800 hover:border-brand-500/50 rounded-2xl p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-brand-500/10 cursor-default"
              >
                <div className="absolute inset-0 rounded-2xl bg-brand-500/0 group-hover:bg-brand-500/3 transition-colors duration-300" />
                <div className="relative">
                  <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-200 inline-block">{card.icon}</div>
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
              { icon: '🏀', num: '01', title: 'Commissioner creates a league', desc: 'Free to create. Name it, set the draft rules, and invite your crew.' },
              { icon: '📨', num: '02', title: '$5 per team to join — everyone\'s in, no free riders', desc: 'Secure entry for every team. No free riders, no ghosting.' },
              { icon: '⏱',  num: '03', title: 'Snake draft your player pool', desc: 'Live real-time draft with countdown timer and auto-pick fallback.' },
              { icon: '🏆', num: '04', title: 'Watch your players ball out', desc: '3 weeks of live scoring. Every bucket, every upset, every hero.' },
            ].map(step => (
              <div
                key={step.num}
                className="group bg-gray-900 border border-gray-800 hover:border-brand-500/50 rounded-2xl p-6 flex flex-col items-start transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg hover:shadow-brand-500/10 cursor-default"
              >
                <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">{step.icon}</div>
                <div className="text-brand-500 text-xs font-black uppercase tracking-widest mb-1">{step.num}</div>
                <h3 className="font-black text-white text-base mb-2 leading-tight">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Smart Draft feature section ── */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-3xl border border-brand-500/30 bg-gradient-to-br from-brand-900/40 via-gray-900 to-gray-900 p-8 sm:p-12"
            style={{ boxShadow: '0 0 60px rgba(55,138,221,0.12), 0 0 120px rgba(55,138,221,0.06)' }}>
            {/* Glow */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(55,138,221,0.15)_0%,_transparent_65%)] pointer-events-none" />

            <div className="relative">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 bg-brand-500/20 border border-brand-500/30 rounded-full px-3 py-1 text-brand-400 text-xs font-bold uppercase tracking-widest mb-5">
                ⚡ Premium Feature
              </div>

              {/* Headline */}
              <h2 className="text-3xl sm:text-4xl font-black text-white mb-3 leading-tight">
                Can't make the draft?<br />
                <span className="text-brand-400">We've got you. ⚡</span>
              </h2>

              <p className="text-gray-300 text-lg mb-8 max-w-xl">
                Smart Draft is your AI-powered backup plan. For just <span className="text-white font-bold">$2.99</span> it drafts like a seasoned pro while you're stuck in traffic, at dinner, or just forgot. No bad picks. No excuses.
              </p>

              {/* Three bullets */}
              <div className="grid sm:grid-cols-3 gap-4 mb-8">
                {[
                  { icon: '🚫', title: 'Avoids injured players', desc: 'Automatically skips anyone flagged with injury news.' },
                  { icon: '🗺️', title: 'Balances regions & teams', desc: 'No stacking — diversifies your roster like an expert.' },
                  { icon: '📈', title: 'Targets the highest upside', desc: 'Picks by ETP with context — never leaves value on the board.' },
                ].map(b => (
                  <div key={b.title} className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-4">
                    <div className="text-2xl mb-2">{b.icon}</div>
                    <div className="font-bold text-white text-sm mb-1">{b.title}</div>
                    <div className="text-gray-500 text-xs leading-relaxed">{b.desc}</div>
                  </div>
                ))}
              </div>

              <Link
                to={user ? '/create-league' : '/register'}
                className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-black text-base px-7 py-3.5 rounded-xl transition-all duration-200 hover:scale-105 shadow-lg shadow-brand-500/30"
              >
                ⚡ Add Smart Draft for $2.99
                <span className="text-brand-200 text-sm">›</span>
              </Link>
              <p className="text-gray-600 text-xs mt-3">Available per manager, per league — upgrade any time before or during the draft.</p>
            </div>
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
          <p className="text-gray-500 text-xs mt-4">Tournament tips off Thursday, March 19th at 12PM ET</p>

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
      <div className="border-t border-gray-800 py-6 px-4 text-center space-y-2">
        <div className="flex items-center justify-center gap-4 text-xs">
          <Link to="/strategy" className="text-gray-500 hover:text-gray-300 transition-colors">Strategy Hub</Link>
          <span className="text-gray-800">·</span>
          <Link to="/faq" className="text-gray-500 hover:text-gray-300 transition-colors">FAQ</Link>
        </div>
        <p className="text-gray-600 text-xs">
          © 2026 TourneyRun · Skill-based fantasy game · Payments powered by Stripe ·
          <span className="ml-1">Not available in WA, ID, MT, NV, LA</span>
        </p>
      </div>
    </div>
  );
}
