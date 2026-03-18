import { useState } from 'react';
import { useDocTitle } from '../../hooks/useDocTitle';

const FAQ_SECTIONS = [
  {
    category: 'General',
    icon: '🏌️',
    questions: [
      {
        q: 'What is TourneyRun Golf?',
        a: 'TourneyRun Golf is a season-long fantasy golf platform. You draft a roster of PGA Tour players at an auction draft, then score points all season based on how your players perform — strokes, finishes, and bonus points at the four Majors. The manager with the most cumulative points at the end of the season wins.',
      },
      {
        q: 'How is this different from DraftKings or FanDuel golf?',
        a: 'Daily fantasy (DFS) resets every tournament — you build a new lineup and pay an entry fee each week. TourneyRun Golf is season-long: one draft, one roster, all season. Points accumulate across every tournament your players enter. It\'s closer to a traditional fantasy baseball or football league than DFS.',
      },
      {
        q: 'Do I need to know golf to play?',
        a: 'Basic familiarity helps — knowing the top 30–50 players in the world is a good starting point. But the strategy guide on the Strategy page covers everything you need to compete. Most leagues have a mix of die-hard golf fans and casual players.',
      },
    ],
  },
  {
    category: 'How to Play',
    icon: '📋',
    questions: [
      {
        q: 'How does the season work?',
        a: 'Your league covers a set number of PGA Tour events (typically 13–20 tournaments depending on your commissioner\'s settings). Points accumulate all season. After the final event, the manager with the highest cumulative point total wins.',
      },
      {
        q: 'When does my lineup lock each week?',
        a: 'Lineups lock Thursday at 12:00 PM Eastern Time — when the first tee shots of the PGA Tour week go off. You must set your starting 4 core + 4 flex players before that deadline. Any flex players who do not tee it up that week score 0 for you.',
      },
      {
        q: 'What is the difference between core and flex spots?',
        a: 'Core spots (4) are permanent — you set them at the draft and cannot swap them out or drop them. They play for you every week regardless. Flex spots (4) are your weekly picks from the rest of your roster. You choose which 4 non-core players start each week, and you can change those picks before each event locks.',
      },
      {
        q: 'What happens if I forget to set my lineup?',
        a: 'Your previous week\'s lineup carries over automatically. If a flex player from last week is not entered in this week\'s tournament, they score 0. Always double-check your lineup by Wednesday night.',
      },
      {
        q: 'Can I drop a core player?',
        a: 'No. Core players (your 4 designated core roster spots) are protected and cannot be dropped. Only flex players can be dropped via the waiver wire. Choose your 4 core players carefully at the auction draft — they are yours for the season.',
      },
    ],
  },
  {
    category: 'Draft',
    icon: '🎯',
    questions: [
      {
        q: 'How does the auction draft work?',
        a: 'The commissioner kicks off the draft and any manager can nominate a player for auction at any time. All managers bid simultaneously using their $2,400 salary budget. The highest bidder wins the player and their budget decreases by that amount. The draft continues until all roster spots are filled. You must stay within your $2,400 cap total.',
      },
      {
        q: 'What is the roster size?',
        a: 'Standard TourneyRun rosters have 8 spots: 4 core and 4 flex. Your auction budget is $2,400 to fill all 8. Average spend per player is $300, but you can load up on one elite anchor and go cheap elsewhere, or spread evenly across all 8.',
      },
      {
        q: 'What happens if I run out of budget before filling my roster?',
        a: 'Each roster spot has a $1 minimum bid. If you\'ve spent nearly all your budget, you can still fill remaining spots for $1 each. Budget management is a core skill — try to always keep at least $50–$100 in reserve heading into the final few nominations.',
      },
      {
        q: 'Can I join mid-season?',
        a: 'If the commissioner allows it, yes. Mid-season joiners typically go through an accelerated draft or are assigned a roster by the commissioner. Keep in mind you will have missed points from earlier events — most leagues cap mid-season joins after the second or third tournament.',
      },
    ],
  },
  {
    category: 'Scoring',
    icon: '📊',
    questions: [
      {
        q: 'How does stroke scoring work?',
        a: 'Points are awarded per shot your players make: Eagle (+8 pts), Birdie (+3 pts), Par (+0.5 pts), Bogey (−0.5 pts), Double Bogey or worse (−2 pts). Points accumulate across every round of every tournament your players enter all season.',
      },
      {
        q: 'How do finish bonuses work?',
        a: 'At the end of each tournament, additional bonus points are added based on your players\' final position: 1st Place (+30), Top 5 (+12), Top 10 (+8), Top 25 (+3), Made Cut (+2), Missed Cut (−5). These stack on top of stroke points for the week.',
      },
      {
        q: 'What is the Majors multiplier?',
        a: 'The four Majors (The Masters, PGA Championship, US Open, The Open Championship) multiply ALL points — both stroke scoring and finish bonuses — by 1.5×. A birdie at a Major is worth 4.5 pts. A top-5 at a Major is worth 18 pts. Plan your roster construction with Majors in mind.',
      },
      {
        q: 'Do points reset between tournaments?',
        a: 'No. Points accumulate all season long. Every birdie your players make in every event adds to their cumulative total. The manager with the highest total at the end of the season wins.',
      },
      {
        q: 'What happens if my player withdraws mid-round?',
        a: 'Your player scores points for every shot they actually played before withdrawing. If they WD after completing round 1, they receive all stroke points from that round. They do not receive a finish bonus (no placement) and do not receive the Missed Cut penalty either.',
      },
    ],
  },
  {
    category: 'Buy-in & Payouts',
    icon: '🏆',
    questions: [
      {
        q: 'How do payouts work?',
        a: 'The commissioner sets the payout structure when creating the league. Common formats: winner-take-all, top-2 split, or top-3 split. Your league\'s payout breakdown is shown on the leaderboard page. TourneyRun does not handle money directly — payouts are managed by your group via Venmo, Zelle, cash, or however your group prefers.',
      },
      {
        q: 'What is the Single Game Bonus?',
        a: 'If your league enables a Single Game Bonus, a separate prize (typically $100) goes to the owner of the player who posted the highest single-round score during the entire season. It\'s a secondary pot that gives everyone a shot at winning something even if they\'re not leading overall standings.',
      },
      {
        q: 'Does TourneyRun take a cut?',
        a: 'No. TourneyRun does not take a rake or percentage of the pot. The platform is free to use. All buy-in money stays with your group.',
      },
      {
        q: 'Can I set up multiple prize pots?',
        a: 'Yes, in league settings the commissioner can configure a main prize pool, a Single Game Bonus pot, and any other side bets your group wants to track. Custom prize structures are handled outside the platform via your group\'s preferred payment method.',
      },
    ],
  },
  {
    category: 'FAAB Waiver Wire',
    icon: '💰',
    questions: [
      {
        q: 'What is FAAB and how do I use it?',
        a: 'FAAB stands for Free Agent Acquisition Budget — each manager gets $500 to spend on waiver wire pickups throughout the season. When you want to add a free agent, you submit a blind bid. After the waiver window closes, the highest bidder wins the player. FAAB spent is permanent — it does not refresh. Spend wisely across the whole season.',
      },
      {
        q: 'When does the waiver wire run?',
        a: 'Waivers process between events, typically after a tournament ends and before the next one begins. Your league commissioner can also process waivers manually at any time. During an active tournament, rosters are locked and no transactions are processed.',
      },
      {
        q: 'What happens to the dropped player?',
        a: 'When you drop a flex player, they go to waivers. Other managers can then bid on them via FAAB. If no one bids, they become a free agent available on a first-come, first-served basis after the waiver period ends.',
      },
      {
        q: 'Can I bid $0 on a player?',
        a: 'Yes. A $0 bid is valid. If no other manager bids on a player, you win them for free. If another manager bids $1 or more, they win. $0 bids are a good strategy for clearly undesirable players you still want on your roster as a depth option.',
      },
      {
        q: 'What is the best FAAB strategy?',
        a: 'Don\'t blow your budget early in the season chasing obvious targets. Save $150–$200 for the final 4–5 events when playoff-push scenarios emerge. The managers who spend 80% of their FAAB by week 6 are vulnerable to being outbid on late-season waiver wire stars.',
      },
    ],
  },
  {
    category: 'Legal',
    icon: '⚖️',
    questions: [
      {
        q: 'Is fantasy golf legal?',
        a: 'Season-long fantasy sports leagues are legal in the United States under the Unlawful Internet Gambling Enforcement Act (UIGEA) of 2006, which explicitly exempts fantasy sports contests that involve skill-based competition over a full season. TourneyRun Golf is a season-long skill game, not a gambling product. That said, a small number of states (including Washington, Idaho, Montana, Nevada, and Louisiana at various times) have taken positions that restrict paid fantasy sports. Check your local laws before collecting buy-ins. TourneyRun does not collect or distribute money on your behalf.',
      },
      {
        q: 'Is my data safe?',
        a: 'TourneyRun stores only what is necessary to run your league: your username, email address, and league activity. We do not sell your data to third parties. Passwords are hashed using bcrypt and never stored in plaintext. We do not store payment information — all financial transactions between league members happen outside the platform.',
      },
      {
        q: 'What happens if there is a dispute in my league?',
        a: 'TourneyRun does not mediate disputes between league members. The commissioner has full control over league settings, waiver processing, and score adjustments. If your group has a disagreement, the commissioner is the final authority within the platform. For financial disputes, your group should establish ground rules before the season starts — TourneyRun recommends setting clear rules about payouts, mid-season joins, and scoring corrections before the draft.',
      },
    ],
  },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-800 last:border-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between gap-4 py-4 text-left hover:text-white transition-colors"
      >
        <span className={`text-sm font-semibold ${open ? 'text-white' : 'text-gray-300'}`}>{q}</span>
        <svg
          className="w-4 h-4 text-gray-500 shrink-0 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="pb-4 text-gray-400 text-sm leading-relaxed">{a}</div>
      )}
    </div>
  );
}

export default function GolfFaq() {
  useDocTitle('Golf FAQ | TourneyRun');

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
          ⛳ Golf FAQ
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">Frequently asked questions</h1>
        <p className="text-gray-400 text-base">Everything you need to know about TourneyRun Golf.</p>
      </div>

      {/* Sections */}
      <div className="space-y-6">
        {FAQ_SECTIONS.map(({ category, icon, questions }) => (
          <div key={category} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-base">{icon}</span>
              <h2 className="text-white font-bold text-sm uppercase tracking-wider">{category}</h2>
            </div>
            <div>
              {questions.map(item => <FaqItem key={item.q} {...item} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
