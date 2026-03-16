/**
 * standingsBuilder.js
 * Shared logic for computing league standings + sgLeader.
 * Used by both the REST endpoint (scores.js) and the ESPN poller socket push.
 */
const db = require('./db');

function buildStandings(leagueId) {
  // Fall back to pts_per_point = 1 if scoring settings haven't been configured yet
  const settings = db.prepare('SELECT * FROM scoring_settings WHERE league_id = ?').get(leagueId)
    || { pts_per_point: 1 };

  const members = db.prepare(`
    SELECT lm.*, u.username, u.venmo_handle, lm.avatar_url
    FROM league_members lm
    JOIN users u ON lm.user_id = u.id
    WHERE lm.league_id = ?
  `).all(leagueId);

  // Which player IDs are currently in a live game?
  const liveGameIds = db.prepare('SELECT id FROM games WHERE is_live = 1').all().map(r => r.id);
  const livePlayerIds = new Set();
  if (liveGameIds.length > 0) {
    const placeholders = liveGameIds.map(() => '?').join(',');
    const livePlayers = db.prepare(
      `SELECT DISTINCT player_id FROM player_stats WHERE game_id IN (${placeholders})`
    ).all(...liveGameIds);
    livePlayers.forEach(r => livePlayerIds.add(r.player_id));
  }

  const standings = members.map(member => {
    const draftedPlayers = db.prepare(`
      SELECT dp.player_id, p.name, p.team, p.position, p.is_eliminated
      FROM draft_picks dp
      JOIN players p ON dp.player_id = p.id
      WHERE dp.league_id = ? AND dp.user_id = ?
    `).all(leagueId, member.user_id);

    let totalPoints = 0;
    const playerStats = draftedPlayers.map(player => {
      const stats = db.prepare(`
        SELECT COALESCE(SUM(ps.points), 0) as total_points
        FROM player_stats ps
        JOIN games g ON ps.game_id = g.id
        WHERE ps.player_id = ?
      `).get(player.player_id);

      const fantasyPoints = stats.total_points * settings.pts_per_point;
      totalPoints += fantasyPoints;

      // Find today's game stats for this player (for live/final display)
      const today = new Date().toISOString().slice(0, 10);
      const todayStats = db.prepare(`
        SELECT ps.points, g.is_live, g.is_completed, g.team1, g.team2, g.winner_team
        FROM player_stats ps
        JOIN games g ON ps.game_id = g.id
        WHERE ps.player_id = ? AND g.game_date = ?
        ORDER BY g.game_date DESC
        LIMIT 1
      `).get(player.player_id, today);

      return {
        ...player,
        stats,
        fantasy_points: Math.round(fantasyPoints * 10) / 10,
        is_live: livePlayerIds.has(player.player_id),
        today_stats: todayStats || null,
      };
    });

    db.prepare('UPDATE league_members SET total_points = ? WHERE league_id = ? AND user_id = ?')
      .run(Math.round(totalPoints * 10) / 10, leagueId, member.user_id);

    const totalPlayers = draftedPlayers.length;
    const aliveCount = draftedPlayers.filter(p => !p.is_eliminated).length;

    return {
      ...member,
      total_points: Math.round(totalPoints * 10) / 10,
      players: playerStats,
      totalPlayers,
      aliveCount,
    };
  });

  standings.sort((a, b) => b.total_points - a.total_points);

  // Single-game bonus leader
  const sgLeader = db.prepare(`
    SELECT
      ps.player_id,
      p.name  AS player_name,
      p.team  AS player_team,
      ps.points,
      g.team1, g.team2, g.round_name,
      dp.user_id        AS owner_user_id,
      lm2.team_name     AS owner_team_name,
      u2.username       AS owner_username,
      u2.venmo_handle   AS owner_venmo
    FROM player_stats ps
    JOIN players p  ON ps.player_id = p.id
    JOIN games g    ON ps.game_id = g.id
    LEFT JOIN draft_picks dp   ON dp.player_id = ps.player_id AND dp.league_id = ?
    LEFT JOIN league_members lm2 ON lm2.user_id = dp.user_id AND lm2.league_id = ?
    LEFT JOIN users u2 ON u2.id = dp.user_id
    WHERE g.is_completed = 1 AND ps.points > 0
    ORDER BY ps.points DESC
    LIMIT 1
  `).get(leagueId, leagueId) || null;

  if (sgLeader) {
    const opp = sgLeader.team1 === sgLeader.player_team ? sgLeader.team2 : sgLeader.team1;
    sgLeader.opponent = opp;
  }

  const isLive = liveGameIds.length > 0;

  return { standings, settings, sgLeader, isLive, livePlayerIds: [...livePlayerIds] };
}

module.exports = { buildStandings };
