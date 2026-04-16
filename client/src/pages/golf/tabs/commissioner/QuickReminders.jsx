/**
 * QuickReminders — 3×2 grid of one-click message templates the
 * commissioner can send to league members. Picking a button opens
 * BlastModal pre-filled with the generated message.
 *
 * All six template bodies are built here (they're only used by this
 * grid) rather than living in CommissionerTab just to be handed back.
 * Parent passes everything the templates interpolate: league meta,
 * prize math, payment methods, standings/members for winner copy.
 */
import { Flag, Hand, DollarSign, BarChart3, Trophy, Megaphone } from 'lucide-react';

const btnBase = {
  border: 'none', borderRadius: 8, padding: '8px 10px',
  fontWeight: 700, fontSize: 11, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 6, textAlign: 'center', lineHeight: 1.3,
};

const BUTTONS = [
  { key: 'picks',       icon: Flag,        label: 'Picks Reminder',      bg: 'rgba(22,163,74,0.15)',   color: '#4ade80', border: 'rgba(22,163,74,0.35)'   },
  { key: 'welcome',     icon: Hand,        label: 'Welcome & Rules',     bg: 'rgba(59,130,246,0.12)',  color: '#93c5fd', border: 'rgba(59,130,246,0.35)'  },
  { key: 'pay',         icon: DollarSign,  label: 'Pay Your Buy-In',     bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24', border: 'rgba(245,158,11,0.35)'  },
  { key: 'leaderboard', icon: BarChart3,   label: 'Leaderboard Update',  bg: 'rgba(139,92,246,0.12)',  color: '#c4b5fd', border: 'rgba(139,92,246,0.35)'  },
  { key: 'winner',      icon: Trophy,      label: 'Winner Announcement', bg: 'rgba(234,179,8,0.12)',   color: '#fde047', border: 'rgba(234,179,8,0.35)'   },
  { key: 'invite',      icon: Megaphone,   label: 'Invite More Players', bg: 'rgba(20,184,166,0.12)',  color: '#5eead4', border: 'rgba(20,184,166,0.35)'  },
];

function buildMessages(ctx) {
  const {
    leagueId, leagueName, league,
    totalPicks, prizePool, scoringLabel,
    p1pct, p2pct, p3pct,
    venmo, zelle, paypal,
    members, poolStandings,
  } = ctx;
  const leagueUrl = `https://www.tourneyrun.app/golf/league/${leagueId}`;

  return {
    picks: () =>
      `⛳ Reminder — picks for ${leagueName} are due before Thursday 8am ET. Head to TourneyRun to lock in your ${totalPicks ?? 7} golfers before the deadline. Don't get locked out!`,

    welcome: () => {
      const picks = totalPicks ?? 'X';
      const pool  = prizePool > 0 ? `$${prizePool.toFixed(0)}` : '[Prize Pool]';
      return `Welcome to ${leagueName}! Here's how it works:\n- Pick ${picks} golfers before Thursday 8am ET\n- Players are grouped into tiers by betting odds\n- ${scoringLabel}\n- Prize pool: ${pool} — ${p1pct}% to 1st, ${p2pct}% to 2nd, ${p3pct}% to 3rd\n- Standings update automatically from ESPN\n\nGood luck and may the best golfer win! 🏆`;
    },

    pay: () => {
      const amount = league?.buy_in_amount > 0 ? `$${league.buy_in_amount}` : '[buy-in amount]';
      const methods = [
        venmo  ? `Venmo: ${venmo}`   : '',
        zelle  ? `Zelle: ${zelle}`   : '',
        paypal ? `PayPal: ${paypal}` : '',
      ].filter(Boolean).join('\n');
      const methodsLine = methods || '[Add your payment methods in the Commissioner Hub]';
      return `Hey! Just a reminder to pay your ${amount} buy-in for ${leagueName}.\n\n${methodsLine}\n\nPlease pay as soon as possible so the prize pool is accurate. Thanks!`;
    },

    leaderboard: () =>
      `Standings are updated in ${leagueName}! Check where you stand and who you need to beat.\n→ ${leagueUrl}`,

    winner: () => {
      let w1, w2;
      if (league?.format_type === 'pool' && poolStandings?.length) {
        const byRank = [...poolStandings].sort((a, b) => a.rank - b.rank);
        w1 = byRank[0]?.team_name || '[1st place]';
        w2 = byRank[1]?.team_name || '[2nd place]';
      } else {
        const sorted = [...(members || [])].sort((a, b) => Number(b.season_points || 0) - Number(a.season_points || 0));
        w1 = sorted[0]?.team_name || '[1st place]';
        w2 = sorted[1]?.team_name || '[2nd place]';
      }
      const prize1 = prizePool > 0 ? `$${(prizePool * p1pct / 100).toFixed(0)}` : '[prize]';
      const prize2 = prizePool > 0 ? `$${(prizePool * p2pct / 100).toFixed(0)}` : '[prize]';
      return `That's a wrap on ${leagueName}!\n🏆 1st place: ${w1} — ${prize1}\n🥈 2nd place: ${w2} — ${prize2}\n\nThanks everyone for playing — see you at the next tournament!\n→ ${leagueUrl}`;
    },

    invite: () => {
      const tournament = league?.pool_tournament_name || 'the upcoming tournament';
      const spotsLeft  = Math.max(0, (league?.max_teams || 0) - (members?.length || 0));
      const spotsLine  = spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left.` : '';
      const codeLine   = league?.invite_code ? `\nInvite code: ${league.invite_code}` : '';
      return `We're running a golf pool for ${tournament}!\n${spotsLine} Join here:${codeLine}\n→ ${leagueUrl}`;
    },
  };
}

export default function QuickReminders({ ctx, onSelect }) {
  const messages = buildMessages(ctx);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 16 }}>
      {BUTTONS.map(({ key, icon: Icon, label, bg, color, border }) => (
        <button
          key={key}
          onClick={() => onSelect(messages[key]())}
          style={{ ...btnBase, background: bg, color, border: `1px solid ${border}` }}
        >
          <Icon size={13} style={{ flexShrink: 0 }} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
