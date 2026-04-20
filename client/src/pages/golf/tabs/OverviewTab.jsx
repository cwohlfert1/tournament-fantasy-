import { useState } from 'react';
import { Users, Zap, Flag, Check, Copy, MessageSquare } from 'lucide-react';
import { Button, Badge } from '../../../components/ui';

const FORMAT_META = {
  pool:        { label: 'Pool',         color: 'blue'   },
  salary_cap:  { label: 'Salary Cap',   color: 'blue'   },
  draft:       { label: 'Snake Draft',  color: 'purple' },
  dk:          { label: 'Salary Cap',   color: 'blue'   },
  tourneyrun:  { label: 'TourneyRun',   color: 'green'  },
};

export default function OverviewTab({ league, members, user, isComm, navigate, picksStatus }) {
  const inviteUrl = `${window.location.origin}/golf/join?code=${league.invite_code}`;
  const [copied, setCopied] = useState(false);
  const fmt = FORMAT_META[league.format_type] || FORMAT_META.tourneyrun;

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Format-specific stat cards
  const statCards = (() => {
    if (league.format_type === 'pool') return [
      { label: 'Members',         value: `${members.length}/${league.max_teams}` },
      { label: 'Picks Per Team',  value: String(league.picks_per_team || 8) },
    ];
    if (league.format_type === 'salary_cap') return [
      { label: 'Members',         value: `${members.length}/${league.max_teams}` },
      { label: 'Weekly Cap',      value: `$${(league.weekly_salary_cap || 50000).toLocaleString()}` },
      { label: 'Starters / Wk',   value: String(league.starters_per_week || league.roster_size || 6) },
    ];
    if (league.format_type === 'draft') return [
      { label: 'Members',         value: `${members.length}/${league.max_teams}` },
      { label: 'Picks Per Team',  value: String(league.picks_per_team || 7) },
      { label: 'Draft Status',    value: league.draft_status === 'completed' ? 'Complete' : league.draft_status === 'drafting' ? 'Live' : 'Pending' },
    ];
    // tourneyrun default
    return [
      { label: 'Members',         value: `${members.length}/${league.max_teams}` },
      { label: 'Core + Flex',     value: `${league.core_spots || 4} + ${league.flex_spots || 4}` },
      { label: 'FAAB Budget',     value: `$${(league.faab_budget || 500).toLocaleString()}` },
    ];
  })();

  return (
    <div className="space-y-5">
      {/* Format badge */}
      <div className="flex items-center gap-2">
        <Badge color={fmt.color}>{fmt.label}</Badge>
        {league.format_type === 'tourneyrun' && league.use_faab
          ? <Badge color="yellow">FAAB Wire</Badge>
          : league.format_type === 'tourneyrun'
          ? <Badge color="gray">Priority Wire</Badge>
          : null
        }
      </div>

      {/* League info card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="grid sm:grid-cols-3 gap-4 mb-5">
          {statCards.map(s => (
            <div key={s.label} className="bg-gray-800/60 rounded-xl px-4 py-3 text-center">
              <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">{s.label}</div>
              <div className="text-white font-bold text-2xl">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Invite code */}
        <div className="border border-gray-700 rounded-xl p-4 bg-gray-800/30">
          <div className="text-gray-500 text-xs font-bold uppercase tracking-wide mb-2">Invite Code</div>
          <div className="flex items-center gap-3">
            <span className="text-white font-bold text-2xl tracking-widest flex-1">{league.invite_code}</span>
            <button
              onClick={copyInvite}
              className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all border ${
                copied
                  ? 'bg-green-500/20 border-green-500/40 text-green-400'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:text-white hover:border-gray-500'
              }`}
            >
              {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy Link</>}
            </button>
          </div>
        </div>

        {/* Text to join — visible to all members */}
        <a
          href={`sms:?body=${encodeURIComponent(
            league.format_type === 'pool'
              ? `Hey! Join my golf pool "${league.name}" on TourneyRun — pick your golfers, track live scores, winner takes the pot. Join here: https://www.tourneyrun.app/golf/join?code=${league.invite_code}`
              : `Join my fantasy golf league "${league.name}" on TourneyRun! One draft, all season, majors count 1.5x. Use invite code ${league.invite_code} or join here: https://www.tourneyrun.app/golf/join?code=${league.invite_code}`
          )}`}
          title="Opens your texts on mobile"
          className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white font-semibold text-sm rounded-xl transition-all"
        >
          <MessageSquare className="w-4 h-4" /> Text Friends to Join
        </a>
      </div>

      {/* Members list */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <h3 className="text-white font-bold">Members</h3>
        </div>
        <div className="divide-y divide-gray-800">
          {members.map((m, i) => (
            <div key={m.user_id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-gray-400">
                  {i + 1}
                </div>
                <div>
                  <div className="text-white text-sm font-semibold">{m.team_name}</div>
                  <div className="text-gray-500 text-xs">{m.username}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {m.user_id === league.commissioner_id && <Badge color="green">Comm</Badge>}
                {m.user_id === user.id && <Badge color="blue">You</Badge>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pool mode: picks CTA */}
      {league.format_type === 'pool' && league.pool_tournament_id && picksStatus && (() => {
        const { submitted, picks_locked } = picksStatus;
        const picksTarget = `?tab=roster`;
        if (picks_locked) return (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #374151', borderRadius: 16, padding: '20px' }}>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ fontSize: 16 }}>🔒</span>
              <span style={{ color: '#9ca3af', fontWeight: 700, fontSize: 14 }}>Picks Locked</span>
              {league.pool_tournament_name && <span className="text-gray-600 text-xs ml-auto">{league.pool_tournament_name}</span>}
            </div>
            <p className="text-gray-500 text-sm mb-4">The tournament has started. Your picks are locked in.</p>
            <Button variant="outline" color="gray" size="lg" fullWidth onClick={() => navigate(picksTarget)}>
              🔒 View My Picks
            </Button>
          </div>
        );
        if (submitted) return (
          <div style={{ background: 'rgba(0,232,122,0.04)', border: '1px solid rgba(0,232,122,0.25)', borderRadius: 16, padding: '20px' }}>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ fontSize: 16 }}>✅</span>
              <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 14 }}>Picks Submitted</span>
              {league.pool_tournament_name && <span className="text-gray-500 text-xs ml-auto">{league.pool_tournament_name}</span>}
            </div>
            <p className="text-gray-400 text-sm mb-4">You're locked in! You can still edit your picks before tee time.</p>
            <Button variant="outline" color="green" size="lg" fullWidth onClick={() => navigate(picksTarget)}>
              ✅ View / Edit Picks →
            </Button>
          </div>
        );
        return (
          <div style={{ background: 'rgba(0,232,122,0.06)', border: '1px solid rgba(0,232,122,0.2)', borderRadius: 16, padding: '20px' }}>
            <div className="flex items-center gap-2 mb-2">
              <Flag className="w-4 h-4" style={{ color: '#22c55e' }} />
              <span style={{ color: '#22c55e', fontWeight: 700, fontSize: 14 }}>Make Your Picks</span>
              {league.pool_tournament_name && <span className="text-gray-500 text-xs ml-auto">{league.pool_tournament_name}</span>}
            </div>
            <p className="text-gray-400 text-sm mb-1">Pick {league.picks_per_team || 8} golfers before tee time Thursday.</p>
            <p className="text-gray-600 text-xs mb-4">Picks can be changed until the tournament starts.</p>
            <Button variant="primary" color="green" size="lg" fullWidth onClick={() => navigate(picksTarget)}>
              📋 Make Your Picks →
            </Button>
          </div>
        );
      })()}

      {/* Commissioner actions */}
      {isComm && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
            <Zap className="w-4 h-4 text-green-400" />
            <h3 className="text-white font-bold text-sm">Commissioner Actions</h3>
          </div>
          {/* Pick Sheet settings — Pool format only */}
          {league.format_type === 'pool' && (
            <Button
              variant="secondary"
              fullWidth
              className="mb-2 text-sm"
              onClick={() => navigate(`/golf/league/${league.id}/settings`)}
            >
              ⚙ Pick Sheet Settings →
            </Button>
          )}
          {league.format_type === 'pool' && league.pool_tournament_id && (
            <Button
              variant={league.picks_locked ? 'secondary' : 'primary'}
              color={league.picks_locked ? undefined : 'blue'}
              size="lg"
              fullWidth
              className="mb-2"
              onClick={() => navigate('?tab=roster')}
            >
              {league.picks_locked ? 'View My Picks →' : 'Make Your Picks →'}
            </Button>
          )}
          {league.format_type === 'tourneyrun' && league.draft_status !== 'completed' && (
            <>
              <Button variant="primary" color="green" size="lg" fullWidth className="mb-2"
                onClick={() => navigate(`/golf/league/${league.id}/draft`)}>
                Go to Draft Room →
              </Button>
              <p className="text-gray-600 text-xs mb-3 text-center">Draft core players. Flex spots fill via waiver wire.</p>
            </>
          )}
          {league.format_type === 'draft' && league.draft_status !== 'completed' && (
            <Button variant="primary" color="purple" size="lg" fullWidth className="mb-2"
              onClick={() => navigate(`/golf/league/${league.id}/draft-room`)}>
              🐍 {league.draft_status === 'drafting' ? 'Join Draft Room' : 'Open Draft Lobby'} →
            </Button>
          )}
          <Button
            variant="outline"
            color="white"
            size="lg"
            fullWidth
            onClick={() => navigate(`/golf/league/${league.id}/scores`)}
          >
            Enter Scores →
          </Button>
        </div>
      )}


      {/* Snake draft mode: CTA to enter draft room */}
      {league.format_type === 'draft' && (
        <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 16, padding: 20 }}>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-purple-400" />
            <span className="text-purple-400 font-bold text-sm">Snake Draft</span>
            {league.draft_status === 'drafting' && (
              <span className="inline-flex items-center gap-1 bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ml-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" /> LIVE
              </span>
            )}
          </div>
          <p className="text-gray-400 text-sm mb-1">
            {league.draft_status === 'completed'
              ? `Draft complete — ${league.picks_per_team || 7} players per team. Scores update automatically.`
              : league.draft_status === 'drafting'
              ? 'Draft is in progress! Join the draft room to make your picks.'
              : `${members.length} of ${league.max_teams} teams joined. ${isComm ? 'Start the draft when ready.' : 'Waiting for commissioner to start.'}`}
          </p>
          {league.pool_tournament_name && <p className="text-gray-600 text-xs mb-4">{league.pool_tournament_name}</p>}
          {league.draft_status !== 'completed' && (
            <Button
              variant="primary"
              color="purple"
              size="lg"
              fullWidth
              onClick={() => navigate(`/golf/league/${league.id}/draft-room`)}
            >
              {league.draft_status === 'drafting' ? '🐍 Join Draft Room →' : isComm ? '🐍 Open Draft Lobby →' : '🐍 View Draft Lobby →'}
            </Button>
          )}
          {league.draft_status === 'completed' && (
            <Button
              variant="outline"
              color="purple"
              size="lg"
              fullWidth
              onClick={() => navigate(`/golf/league/${league.id}/draft-room`)}
            >
              View Draft Results →
            </Button>
          )}
        </div>
      )}

      {/* Salary cap mode: no draft, direct to picks */}
      {league.format_type === 'salary_cap' && (
        <div className="bg-purple-500/8 border border-purple-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-purple-400" />
            <span className="text-blue-400 font-bold text-sm">Salary Cap Mode</span>
          </div>
          <p className="text-gray-400 text-sm mb-4">
            No draft — pick {league.starters_per_week || 6} golfers fresh each tournament with a ${(league.weekly_salary_cap || 50000).toLocaleString()} cap.
          </p>
          <Button
            variant="primary"
            color="purple"
            size="lg"
            fullWidth
            onClick={() => navigate(`/golf/league/${league.id}?tab=picks`)}
          >
            Set This Week's Lineup →
          </Button>
        </div>
      )}
    </div>
  );
}
