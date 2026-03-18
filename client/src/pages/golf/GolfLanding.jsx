import { Link } from 'react-router-dom';
import { Flag, Calendar, TrendingUp, Award, RefreshCw, Target, ArrowRight, Plus, MessageCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDocTitle } from '../../hooks/useDocTitle';

const SCORING = [
  { label: 'Eagle',   pts: '+8',   color: 'text-yellow-400' },
  { label: 'Birdie',  pts: '+3',   color: 'text-green-400'  },
  { label: 'Par',     pts: '+0.5', color: 'text-gray-300'   },
  { label: 'Bogey',   pts: '−0.5', color: 'text-orange-400' },
  { label: 'Double+', pts: '−2',   color: 'text-red-400'    },
];

const FEATURES = [
  { Icon: Flag,       title: 'Salary Cap Draft',  body: 'Each golfer has a salary. Build the best lineup within your $2,400 budget.' },
  { Icon: Calendar,   title: 'Weekly Lineups',    body: 'Set your 6-man starting lineup before Thursday 12pm ET each week. Lock it in or miss out.' },
  { Icon: TrendingUp, title: 'Real Scoring',      body: 'Fantasy points tied to actual round-by-round performance — eagles, birdies, finish bonuses.' },
  { Icon: Award,      title: '1.5× Major Bonus',  body: 'All points double-and-a-half during The Masters, PGA Championship, US Open, and The Open.' },
  { Icon: RefreshCw,  title: 'Waiver Wire',       body: 'Drop and add players any time a tournament is not locked. Manage your $2,400 cap strategically.' },
  { Icon: Target,     title: 'Season Leaderboard',body: 'Points accumulate all season long. The best manager across all PGA Tour events wins.' },
];

export default function GolfLanding() {
  useDocTitle('Golf Fantasy | TourneyRun');
  const { user } = useAuth();

  const smsBody = encodeURIComponent(
    'Forget DraftKings for one week - do this all season. ' +
    'Golf fantasy on TourneyRun, one draft, majors count 1.5x. ' +
    'Join here: https://www.tourneyrun.app/golf'
  );

  return (
    <div className="min-h-screen bg-gray-950">

      {/* ── Hero ── */}
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
            Draft golfers, set weekly lineups, and rack up points across the full PGA Tour season. Majors count 1.5×.
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

      {/* ── Feature grid ── */}
      <div className="max-w-5xl mx-auto px-4 py-16 sm:py-20">
        <h2 className="text-2xl sm:text-3xl font-black text-white text-center mb-10">Everything you need</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {FEATURES.map(({ Icon, title, body }) => (
            <div
              key={title}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-5 sm:p-6 hover:border-green-500/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-green-400" />
              </div>
              <h3 className="text-white font-bold text-base mb-1.5">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Invite Friends ── */}
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

      {/* ── CTA bottom ── */}
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
