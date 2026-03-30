import { useDocTitle } from '../../hooks/useDocTitle';

const TIPS = [
  {
    icon: '⛳',
    title: 'Spend your cap in the middle',
    body: "Three or four mid-tier guys in the $250–$350 range will outscore two studs most weeks. Players ranked 20–50 in the world play every tournament, make cuts at a high clip, and cost half as much as the headline names. Your elite pick should anchor the team — not dominate the budget.",
  },
  {
    icon: '🏆',
    title: 'Majors change the leaderboard overnight',
    body: "All points multiply 1.5× at The Masters, PGA Championship, US Open, and The Open. One great major week — eagle on 13, top-5 finish — can swing you 40+ positions in the standings. Target players who are playing well going in, not just world-ranking names. Form matters more than reputation on major weeks.",
  },
  {
    icon: '📊',
    title: 'A missed cut is a season killer',
    body: "The −5 penalty adds up fast. Four missed cuts costs you 20 points — the same as a top-5 finish. Build your core four around players who regularly make cuts in elite fields. Save the speculative picks for your flex spots where missing one event isn't catastrophic.",
  },
  {
    icon: '🔀',
    title: 'Your flex spots are where you win leagues',
    body: "Stream players who have a history at the upcoming venue, then move on after the event. Look at guys coming back from a break — they often run hot in their first event back. Snipe them before the week gets going while others are focused on the obvious favorites.",
  },
  {
    icon: '💎',
    title: 'Recent form beats world ranking',
    body: "A player ranked 55th who's made 8 of his last 10 cuts and finished top-20 four times is worth more than his number suggests. Check Strokes Gained: Total over the last 8 weeks — that's a better predictor of what you'll score this week than any season-long stat.",
  },
  {
    icon: '🎯',
    title: 'Match your flex picks to the course',
    body: "Short par-70s reward accurate iron players. Long courses favor bombers. Links setups at The Open punish U.S.-style power games. Find the fit between player strengths and venue demands, and you'll uncover value others miss. One tournament winner in a flex spot adds 30 pts. That swings a season.",
  },
  {
    icon: '⚠️',
    title: 'Watch for withdrawals mid-week',
    body: "WDs happen every week. A player who pulls out after round 1 still gets scored on those holes. Monitor beat reporters and the PGA Tour site Tuesday–Wednesday for late scratches. Drop anyone showing injury signs before they collect a −5 missed cut that wasn't their fault.",
  },
  {
    icon: '🧠',
    title: "The Open is an annual pricing edge",
    body: "U.S. managers consistently overpay for big hitters who struggle at links courses. Meanwhile, shot-shapers from Europe and Australia who thrive on ground games get undervalued. Every year there's a links specialist you can grab cheap while the room fights over the favorites. Find yours.",
  },
];

export default function GolfStrategy() {
  useDocTitle('Strategy | TourneyRun Golf');

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-10">
        <p style={{ color: '#22c55e', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 12 }}>
          Strategy Guide
        </p>
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">How to win your league</h1>
        <p className="text-gray-400 text-base max-w-2xl leading-relaxed">
          One draft, all season, majors at 1.5×. Here's what separates the winners from the mid-table.
        </p>
      </div>

      {/* Tips grid */}
      <div className="grid sm:grid-cols-2 gap-4 mb-10">
        {TIPS.map(({ icon, title, body }) => (
          <div
            key={title}
            className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-green-500/25 transition-colors"
          >
            <div className="flex items-start gap-3 mb-2">
              <span className="text-xl shrink-0">{icon}</span>
              <h3 className="text-white font-bold text-sm leading-snug">{title}</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed pl-8">{body}</p>
          </div>
        ))}
      </div>

      {/* Quick scoring reference */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 sm:p-6">
        <h3 className="text-white font-bold text-sm mb-4">⚡ Quick Scoring Reference</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5 text-sm mb-4">
          {[
            { label: 'Eagle',      pts: '+8',   color: 'text-yellow-400' },
            { label: 'Birdie',     pts: '+3',   color: 'text-green-400'  },
            { label: 'Par',        pts: '+0.5', color: 'text-gray-300'   },
            { label: 'Bogey',      pts: '−0.5', color: 'text-orange-400' },
            { label: 'Double+',    pts: '−2',   color: 'text-red-400'    },
            { label: '1st Place',  pts: '+30',  color: 'text-green-400'  },
            { label: 'Top 5',      pts: '+12',  color: 'text-green-400'  },
            { label: 'Top 10',     pts: '+8',   color: 'text-green-400'  },
            { label: 'Top 25',     pts: '+3',   color: 'text-green-400'  },
            { label: 'Made Cut',   pts: '+2',   color: 'text-green-400'  },
            { label: 'Missed Cut', pts: '−5',   color: 'text-red-400'    },
          ].map(({ label, pts, color }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="text-gray-400">{label}</span>
              <span className={`font-bold ${color}`}>{pts}</span>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t border-gray-800 flex items-center gap-2">
          <span className="text-yellow-400">⭐</span>
          <span className="text-yellow-400 font-bold text-sm">Majors: all points × 1.5</span>
          <span className="text-gray-600 text-xs ml-auto hidden sm:inline">Masters · PGA Champ · US Open · The Open</span>
        </div>
      </div>
    </div>
  );
}
