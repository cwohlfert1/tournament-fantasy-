import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bell, Users, DollarSign, Grid3X3, ShieldCheck, Calendar, Trophy } from 'lucide-react';
import Navbar from '../../components/Navbar';

const ACCENT = '#3b82f6';

export default function FootballLanding() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleNotify(e) {
    e.preventDefault();
    if (!email) return;
    try {
      const res = await fetch('/api/football/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setSubmitted(true);
    } catch {
      setSubmitted(true); // show confirmation even if API fails
    }
  }

  return (
    <div className="bg-gray-950">
      <Navbar variant="football" />

      {/* ── HERO ── */}
      <div className="relative overflow-hidden px-4 pt-16 pb-20 sm:pt-20 sm:pb-24 text-center">
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at top, ${ACCENT}14 0%, transparent 65%)` }} />
        <div className="relative max-w-3xl mx-auto">
          <span className="inline-block text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-6" style={{ background: `${ACCENT}18`, color: ACCENT, border: `1px solid ${ACCENT}30` }}>
            Coming Fall 2026
          </span>
          <h1 style={{ fontSize: 'clamp(48px,10vw,80px)', fontWeight: 900, lineHeight: 1.05, color: '#fff', marginBottom: 16, letterSpacing: '-0.03em', textTransform: 'uppercase' }}>
            NFL POOLS.<br />
            <span style={{ color: ACCENT }}>ONE PLATFORM.</span>
          </h1>
          <p className="text-gray-400 text-lg sm:text-xl max-w-xl mx-auto mb-12 leading-relaxed">
            Super Bowl Squares. Survivor. Pick'em. Confidence. The same platform your group already uses for golf and Derby pools.
          </p>

          {/* Notify form */}
          {submitted ? (
            <div className="inline-flex items-center gap-2 text-base font-semibold" style={{ color: ACCENT }}>
              <Bell size={18} /> We'll notify you when NFL Pools launches.
            </div>
          ) : (
            <form onSubmit={handleNotify} className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required
                className="flex-1 bg-gray-800 border border-gray-700 rounded-full px-5 py-3.5 text-white text-sm focus:border-blue-500 focus:outline-none" />
              <button type="submit" className="font-bold px-8 py-3.5 rounded-full text-white text-sm transition-all" style={{ background: ACCENT, boxShadow: `0 10px 40px ${ACCENT}40` }}>
                Notify Me
              </button>
            </form>
          )}
        </div>
      </div>

      {/* ── PICK YOUR FORMAT ── */}
      <div className="bg-gray-900/40 border-y border-gray-800 py-16 sm:py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white text-center mb-3">Four formats at launch</h2>
          <p className="text-gray-500 text-center text-sm mb-10">Every pool format your group runs.</p>

          <div className="grid sm:grid-cols-2 gap-5">
            {/* Super Bowl Squares */}
            <div className="relative bg-gray-900 rounded-2xl p-5 sm:p-6" style={{ border: `1px solid ${ACCENT}60` }}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full text-white" style={{ background: ACCENT }}>
                  Same Engine as Derby Squares
                </span>
              </div>
              <div className="mt-3">
                <Grid3X3 size={24} className="mb-2" style={{ color: ACCENT }} />
                <h3 className="text-white font-bold text-base">Super Bowl Squares</h3>
                <p className="text-xs mt-0.5 mb-4" style={{ color: `${ACCENT}cc` }}>10×10 grid. Quarterly payouts.</p>
                <ul className="space-y-2 text-sm text-gray-400">
                  {['100 squares per grid', 'Quarterly payouts (Q1, Q2, Q3, Final)', 'Numbers assigned at kickoff', 'Commissioner sets per-square entry fee', 'Same grid UX as Derby Squares'].map(item => (
                    <li key={item} className="flex items-start gap-2">
                      <span className="shrink-0 mt-0.5" style={{ color: ACCENT }}>✓</span><span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Survivor */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 sm:p-6 hover:border-gray-700 transition-colors">
              <ShieldCheck size={24} className="mb-2" style={{ color: ACCENT }} />
              <h3 className="text-white font-bold text-base">Survivor Pool</h3>
              <p className="text-gray-400 text-xs mt-0.5 mb-4">Last person standing wins.</p>
              <ul className="space-y-2 text-sm text-gray-400">
                {['Pick one team to win each week', 'Lose once and you\'re eliminated', 'No team reuse all season', 'Entry fee + winner-take-all or split', '18 weeks, 32 teams'].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5" style={{ color: ACCENT }}>✓</span><span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Pick'em */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 sm:p-6 hover:border-gray-700 transition-colors">
              <Calendar size={24} className="mb-2" style={{ color: ACCENT }} />
              <h3 className="text-white font-bold text-base">Weekly Pick'em</h3>
              <p className="text-gray-400 text-xs mt-0.5 mb-4">Pick winners every week. Season-long leaderboard.</p>
              <ul className="space-y-2 text-sm text-gray-400">
                {['Pick all games or select matchups', 'Straight up or against the spread', 'Automated scoring from live results', 'Weekly + season standings', 'Great for large office groups'].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5" style={{ color: ACCENT }}>✓</span><span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Confidence */}
            <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 sm:p-6 hover:border-gray-700 transition-colors">
              <Trophy size={24} className="mb-2" style={{ color: ACCENT }} />
              <h3 className="text-white font-bold text-base">Confidence Pool</h3>
              <p className="text-gray-400 text-xs mt-0.5 mb-4">Rank your picks by confidence. Strategic depth.</p>
              <ul className="space-y-2 text-sm text-gray-400">
                {['Pick winners and assign confidence points', 'Higher points on your locks', 'Most total points wins the week', 'Weekly + season standings', 'Strategic depth beyond basic pick\'em'].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5" style={{ color: ACCENT }}>✓</span><span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── WHY TOURNEYRUN ── */}
      <div className="py-16 sm:py-24 px-4 border-b border-gray-800" style={{ background: '#0a0c14' }}>
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-10 sm:gap-16 items-center">
            <div>
              <h2 style={{ color: '#fff', fontSize: 'clamp(28px,4vw,42px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 16, letterSpacing: '-0.02em' }}>
                Your group already<br />
                <span style={{ color: ACCENT }}>has accounts.</span>
              </h2>
              <p style={{ color: '#9ca3af', fontSize: 16, lineHeight: 1.7, marginBottom: 24 }}>
                The same invite link, payment system, and payout tracking your group uses for golf and Derby pools — now for NFL.
              </p>
              <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: 15, padding: '14px 28px', borderRadius: 999, textDecoration: 'none' }}>
                Explore TourneyRun <ArrowRight size={16} />
              </Link>
            </div>
            <div className="space-y-3">
              {[
                { Icon: Users, title: 'One invite link', desc: 'Same join flow as golf and Derby pools. Text the link, they\'re in.' },
                { Icon: DollarSign, title: 'Payments handled', desc: 'Square checkout for entry fees. Venmo/PayPal/Zelle handles for payouts.' },
                { Icon: ArrowRight, title: 'Cross-sport groups', desc: 'Your golf league runs a survivor pool in September. Same app, same people.' },
              ].map(({ Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3 bg-gray-900/50 border border-gray-800 rounded-xl p-4">
                  <Icon size={16} className="shrink-0 mt-0.5" style={{ color: ACCENT }} />
                  <div>
                    <div className="text-white text-sm font-bold">{title}</div>
                    <div className="text-gray-500 text-xs mt-0.5">{desc}</div>
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
          <div className="text-5xl mb-4">🏈</div>
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-3">NFL Season starts September 2026</h2>
          <p className="text-gray-500 text-base mb-8">Same platform quality you know from TourneyRun Golf — applied to every NFL pool format.</p>
          <Link to="/" className="inline-flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-bold px-10 py-4 rounded-full transition-all text-base">
            Explore TourneyRun <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
