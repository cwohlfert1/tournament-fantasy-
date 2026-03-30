import { useState, useEffect } from 'react';
import api from '../api';

// ── Shared constants ──────────────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set(['active', 'lobby', 'draft', 'draft_pending', 'drafting']);

export const NOTIF_STYLE = {
  PICKS_DUE:       { color: '#f59e0b', label: 'Picks Due'       },
  PICKS_LOCKED:    { color: '#f59e0b', label: 'Picks Locked'    },
  TOURNAMENT_LIVE: { color: '#22c55e', label: 'Tournament Live' },
  ROUND_COMPLETE:  { color: '#60a5fa', label: 'Scores Updated'  },
  WINNER:          { color: '#eab308', label: 'Results In!'     },
};

// ── Notification builder ──────────────────────────────────────────────────────

export function buildNotifications(activeLeagues, poolPicksMap, standingsMap, userId) {
  const notifs = [];
  for (const league of activeLeagues) {
    if (league.format_type !== 'pool') continue;
    const picks  = poolPicksMap[league.id] || {};
    const sData  = standingsMap[league.id];
    const status = league.pool_tournament_status;
    const tName  = league.pool_tournament_name || 'the tournament';

    if (status === 'completed' && sData?.standings?.length) {
      const winner = sData.standings[0];
      notifs.push({
        id: `winner-${league.id}`, type: 'WINNER', leagueName: league.name,
        title: `${tName} complete!`,
        body: winner ? `🏆 ${winner.team_name} wins ${league.name}.` : `${league.name} is complete.`,
        cta: { label: 'See Final Standings', href: `/golf/league/${league.id}?tab=standings` },
      });
      continue;
    }

    if (status === 'active' && picks.submitted) {
      const allStandings = sData?.standings || [];
      const myTeam    = allStandings.find(s => s.user_id === userId);
      const hasScores = allStandings.some(s => s.picks?.some(p => p.round1 != null || p.round2 != null));
      notifs.push({
        id: `live-${league.id}`, type: hasScores ? 'ROUND_COMPLETE' : 'TOURNAMENT_LIVE',
        leagueName: league.name,
        title: hasScores ? `${tName} — scores updated` : `${tName} is live!`,
        body: myTeam
          ? `You're currently ranked #${myTeam.rank} in ${league.name}.`
          : `${league.name} is in progress.`,
        cta: { label: 'View Standings', href: `/golf/league/${league.id}?tab=standings` },
      });
      continue;
    }

    if (picks.picks_locked && !picks.submitted) {
      notifs.push({
        id: `picks-locked-${league.id}`, type: 'PICKS_LOCKED', leagueName: league.name,
        title: 'Picks are locked',
        body: `You didn't submit picks for ${tName} — picks are now locked.`,
        cta: null,
      });
      continue;
    }

    if (!picks.submitted && !picks.picks_locked && status !== 'completed') {
      notifs.push({
        id: `picks-due-${league.id}`, type: 'PICKS_DUE', leagueName: league.name,
        title: 'Submit your picks',
        body: `You haven't submitted picks for ${tName} yet.`,
        cta: { label: 'Make Picks', href: `/golf/league/${league.id}?tab=roster` },
      });
    }
  }
  return notifs;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useGolfNotifications(userId) {
  const [leagues, setLeagues]           = useState([]);
  const [poolPicksMap, setPoolPicksMap] = useState({});
  const [standingsMap, setStandingsMap] = useState({});
  const [loading, setLoading]           = useState(true);
  const [dismissed, setDismissed]       = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('golf-notif-dismissed') || '[]')); }
    catch { return new Set(); }
  });

  // Fetch leagues + picks on mount (or when userId changes)
  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      api.get('/golf/leagues'),
      api.get('/golf/leagues/my-rosters'),
    ]).then(([lr, rr]) => {
      setLeagues(lr.data.leagues || []);
      setPoolPicksMap(rr.data || {});
    }).catch(() => {}).finally(() => setLoading(false));
  }, [userId]);

  // Fetch standings for active/completed pool leagues
  useEffect(() => {
    if (!userId || !leagues.length) return;
    const targets = leagues.filter(l =>
      l.format_type === 'pool' &&
      (l.pool_tournament_status === 'active' || l.pool_tournament_status === 'completed')
    );
    if (!targets.length) return;
    Promise.allSettled(
      targets.map(l => api.get(`/golf/leagues/${l.id}/standings`).then(r => ({ id: l.id, data: r.data })))
    ).then(results => {
      const map = {};
      results.forEach(r => { if (r.status === 'fulfilled') map[r.value.id] = r.value.data; });
      setStandingsMap(map);
    });
  }, [leagues, userId]);

  // Derive active leagues + build notifications
  const activeLeagues  = leagues.filter(
    l => ACTIVE_STATUSES.has(l.status) && !(l.format_type === 'pool' && l.pool_tournament_status === 'completed')
  );
  const notifications  = buildNotifications(activeLeagues, poolPicksMap, standingsMap, userId);
  const unreadCount    = notifications.filter(n => !dismissed.has(n.id)).length;

  function dismiss(id) {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem('golf-notif-dismissed', JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  function markAllRead() {
    setDismissed(prev => {
      const next = new Set([...prev, ...notifications.map(n => n.id)]);
      try { localStorage.setItem('golf-notif-dismissed', JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  return {
    notifications,
    dismissed,
    dismiss,
    markAllRead,
    unreadCount,
    leagues,
    poolPicksMap,
    standingsMap,
    loading,
  };
}
