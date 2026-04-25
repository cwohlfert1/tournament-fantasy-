import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowRight, Trophy, Users, Clipboard, Mail, DollarSign, BarChart2 } from 'lucide-react';

const ACCENT = '#2AA6A6';

const PAIN_POINTS = [
  { Icon: Clipboard, before: 'Writing names on scraps of paper', after: 'Digital pool with invite links' },
  { Icon: DollarSign, before: 'Chasing people for entry fees at the party', after: 'Square checkout collects before the race' },
  { Icon: BarChart2, before: 'Doing payout math on your phone calculator', after: 'Automatic payout calculation' },
  { Icon: Mail, before: '"Wait, who drew which horse?"', after: 'Verifiable random assignment emailed to everyone' },
  { Icon: Users, before: '"Who won the squares pool?"', after: 'Results + payouts emailed automatically' },
];

export default function HorsesLanding() {
  const { user } = useAuth();

  return (
    <div className="bg-gray-950">

      {/* ── HERO ── */}
      <div className="relative overflow-hidden px-4 pt-16 pb-20 sm:pt-20 sm:pb-24 text-center">
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at top, ${ACCENT}14 0%, transparent 65%)` }} />
        <div className="relative max-w-3xl mx-auto">
          <h1 style={{ fontSize: 'clamp(48px,10vw,80px)', fontWeight: 900, lineHeight: 1.05, color: '#fff', marginBottom: 16, letterSpacing: '-0.03em', textTransform: 'uppercase' }}>
            DERBY POOLS.<br />
            <span style={{ color: ACCENT }}>AT YOUR PARTY.</span>
          </h1>
          <p className="text-gray-400 text-lg sm:text-xl max-w-xl mx-auto mb-12 leading-relaxed">
            Stop running pools on napkins. Three formats, one invite link, payouts calculated automatically.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              <>
                <Link to="/horses/create" className="inline-flex items-center justify-center gap-2 font-bold px-10 py-4 rounded-full transition-all text-base text-white" style={{ background: ACCENT, boxShadow: `0 10px 40px ${ACCENT}40` }}>
                  <Trophy size={15} strokeWidth={1.75} /> Create a Pool →
                </Link>
                <Link to="/horses/join" className="inline-flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-bold px-10 py-4 rounded-full transition-all text-base">
                  Join a Pool
                </Link>
              </>
            ) : (
              <>
                <Link to="/register" className="inline-flex items-center justify-center gap-2 font-bold px-10 py-4 rounded-full transition-all text-base text-white" style={{ background: ACCENT, boxShadow: `0 10px 40px ${ACCENT}40` }}>
                  Get Started Free <ArrowRight className="w-5 h-5" />
                </Link>
                <Link to="/login" className="inline-flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-bold px-10 py-4 rounded-full transition-all text-base">
                  Sign In
                </Link>
              </>
            )}
          </div>
          <p className="mt-4 text-gray-600 text-sm">Free beta — no platform fee for Derby 2026</p>
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <div className="border-y border-gray-800 bg-gray-900/60 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-center text-xs uppercase tracking-widest font-bold mb-6" style={{ color: ACCENT }}>How It Works</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { step: '1', title: 'Create pool', desc: 'Pick format, set entry fee, configure payouts' },
              { step: '2', title: 'Share link', desc: 'Text invite link — they join and pay via Square' },
              { step: '3', title: 'Race happens', desc: 'Pool locks 10 min before post time' },
              { step: '4', title: 'Get paid', desc: 'Enter results, payouts calculate automatically' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="text-xl font-bold" style={{ color: ACCENT }}>{step}</div>
                <div className="text-white font-bold text-sm mt-1">{title}</div>
                <div className="text-gray-600 text-xs mt-1">{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── PICK YOUR FORMAT ── */}
      <div className="bg-gray-900/40 border-y border-gray-800 py-16 sm:py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white text-center mb-3">Pick your format</h2>
          <p className="text-gray-500 text-center text-sm mb-10">Three formats. One platform.</p>

          <div className="grid sm:grid-cols-3 gap-5">
            {/* Random Draw */}
            <div className="relative bg-gray-900 rounded-2xl p-5 sm:p-6" style={{ border: `1px solid ${ACCENT}60` }}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full text-white" style={{ background: ACCENT }}>
                  Most Popular
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl mb-2">🎲</div>
                <h3 className="text-white font-bold text-base">Random Draw</h3>
                <p className="text-xs mt-0.5 mb-4" style={{ color: `${ACCENT}cc` }}>Pure luck. No skill required.</p>
                <ul className="space-y-2 text-sm text-gray-400">
                  {['System randomly assigns one horse per entrant', 'Shared horses if 20+ entrants', 'Auto-draw at lock time', 'Payout for Win / Place / Show positions', 'Commissioner can trigger early'].map(item => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="shrink-0 mt-0.5" style={{ color: ACCENT }}>✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Pick W/P/S */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 sm:p-6 hover:border-gray-700 transition-colors">
              <div className="text-2xl mb-2">🏆</div>
              <h3 className="text-white font-bold text-base">Pick Win / Place / Show</h3>
              <p className="text-gray-400 text-xs mt-0.5 mb-4">Pick horses, score points for correct picks.</p>
              <ul className="space-y-2 text-sm text-gray-400">
                {['Pick one horse for Win, Place, and Show', 'Default scoring: 5 / 3 / 2 pts', 'No duplicate picks allowed', 'Picks hidden until lock time', 'Commissioner-configurable points'].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5" style={{ color: ACCENT }}>✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Squares */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 sm:p-6 hover:border-gray-700 transition-colors">
              <div className="text-2xl mb-2">🔲</div>
              <h3 className="text-white font-bold text-base">Squares</h3>
              <p className="text-gray-400 text-xs mt-0.5 mb-4">10×10 grid pool. Claim squares, win by post positions.</p>
              <ul className="space-y-2 text-sm text-gray-400">
                {['100 squares — claim up to 10 per person', 'Numbers randomly assigned at lock', 'Three winning squares (Win/Place/Show)', 'Unclaimed squares roll down', 'Per-square entry fee'].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5" style={{ color: ACCENT }}>✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── PAIN POINTS — before/after ── */}
      <div className="py-16 sm:py-24 px-4 border-b border-gray-800" style={{ background: '#0a1414' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-10 sm:gap-16 items-center">
            <div>
              <h2 style={{ color: '#fff', fontSize: 'clamp(28px,4vw,42px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 16, letterSpacing: '-0.02em' }}>
                Stop running pools<br />
                <span style={{ color: ACCENT }}>on napkins.</span>
              </h2>
              <p style={{ color: '#9ca3af', fontSize: 16, lineHeight: 1.7, marginBottom: 24 }}>
                TourneyRun replaces the group text, the calculator app, and the argument about who drew which horse.
              </p>
              <Link to={user ? '/horses/create' : '/register'} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: ACCENT, color: '#fff', fontWeight: 800, fontSize: 15, padding: '14px 28px', borderRadius: 999, textDecoration: 'none' }}>
                Create Your Derby Pool <ArrowRight size={16} />
              </Link>
            </div>
            <div className="space-y-3">
              {PAIN_POINTS.map(({ Icon, before, after }) => (
                <div key={before} className="flex items-start gap-3 bg-gray-900/50 border border-gray-800 rounded-xl p-3">
                  <Icon size={16} className="shrink-0 mt-0.5" style={{ color: ACCENT }} />
                  <div>
                    <div className="text-gray-500 text-xs line-through">{before}</div>
                    <div className="text-white text-sm font-semibold mt-0.5">{after}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM CTA ── */}
      <div className="relative overflow-hidden px-4 py-20 sm:py-28 text-center">
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at bottom, ${ACCENT}0a 0%, transparent 65%)` }} />
        <div className="relative max-w-2xl mx-auto">
          <div className="text-5xl mb-4">🐴</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">Kentucky Derby 2026</h2>
          <p className="text-gray-500 text-base mb-8">May 2 · Churchill Downs · Post time 6:57 PM ET</p>
          <Link to={user ? '/horses/create' : '/register'} className="inline-flex items-center justify-center gap-2 font-bold px-10 py-4 rounded-full transition-all text-base text-white" style={{ background: ACCENT, boxShadow: `0 10px 40px ${ACCENT}40` }}>
            Create Your Derby Pool <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="text-gray-700 text-xs mt-4">Free for Derby 2026. No credit card required.</p>
        </div>
      </div>
    </div>
  );
}
