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

  // ── Diagnostic: raw pick count before any JOIN ─────────────────────────────
  const rawCount = db.prepare(
    'SELECT COUNT(*) as cnt FROM draft_picks WHERE league_id = ?'
  ).get(leagueId);
  console.log(`[standings] league=${leagueId} raw picks=${rawCount.cnt} members=${members.length}`);


  // ── Fetch ALL picks + player info for this league in one batch query ────────
  // Using LEFT JOIN so picks with orphaned player_id still surface (shows up as
  // null player fields rather than silently disappearing from the results).
  const allPicks = db.prepare(`
    SELECT
      dp.user_id,
      dp.player_id,
      dp.pick_number,
      dp.round,
      COALESCE(p.name, '[unknown]')         AS name,
      COALESCE(p.team, '')                  AS team,
      COALESCE(p.position, '')              AS position,
      COALESCE(p.seed, 0)                   AS seed,
      COALESCE(p.is_eliminated, 0)          AS is_eliminated,
      COALESCE(p.season_ppg, 0)             AS season_ppg,
      COALESCE(p.region, '')                AS region,
      COALESCE(p.is_first_four, 0)          AS is_first_four,
      COALESCE(p.jersey_number, '')         AS jersey_number
    FROM draft_picks dp
    LEFT JOIN players p ON dp.player_id = p.id
    WHERE dp.league_id = ?
    ORDER BY dp.pick_number
  `).all(leagueId);

  console.log(`[standings] batch picks returned=${allPicks.length}`);
  if (allPicks.length > 0) {
    console.log('[standings] sample pick:', JSON.stringify(allPicks[0]));
  }

  // Group picks by user_id for O(1) lookup per member
  const picksByUser = {};
  for (const pick of allPicks) {
    if (!picksByUser[pick.user_id]) picksByUser[pick.user_id] = [];
    picksByUser[pick.user_id].push(pick);
  }

  // Batch-fetch next scheduled (unplayed, not live) game per team for "Next game" display
  const upcomingGameRows = db.prepare(`
    SELECT game_date, round_name, team1, team2, tip_off_time, tv_network
    FROM games
    WHERE is_completed = 0 AND (is_live IS NULL OR is_live = 0)
    ORDER BY game_date ASC
  `).all();
  const nextGameByTeam = {};
  for (const g of upcomingGameRows) {
    if (!nextGameByTeam[g.team1]) nextGameByTeam[g.team1] = g;
    if (!nextGameByTeam[g.team2]) nextGameByTeam[g.team2] = g;
  }

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
    const draftedPlayers = picksByUser[member.user_id] || [];

    let totalPoints = 0;
    const playerStats = draftedPlayers.map(player => {
      const stats = db.prepare(`
        SELECT COALESCE(SUM(ps.points), 0) as total_points
        FROM player_stats ps
        JOIN games g ON ps.game_id = g.id
        WHERE ps.player_id = ?
      `).get(player.player_id);

      const fantasyPoints = (stats?.total_points ?? 0) * settings.pts_per_point;
      totalPoints += fantasyPoints;

      // Today's game stats for live/final display
      const today = new Date().toISOString().slice(0, 10);
      const todayStats = db.prepare(`
        SELECT ps.points, g.is_live, g.is_completed, g.team1, g.team2, g.winner_team
        FROM player_stats ps
        JOIN games g ON ps.game_id = g.id
        WHERE ps.player_id = ? AND g.game_date = ?
        ORDER BY g.game_date DESC
        LIMIT 1
      `).get(player.player_id, today);

      // Full game log (round, opponent, points per game played)
      // round_code: prefer ps.round (set by espnPoller roundNameToCode), fall back to
      // normalizing g.round_name (admin-entered stats skip the round column).
      const gameLog = db.prepare(`
        SELECT
          COALESCE(
            NULLIF(ps.round, ''),
            CASE lower(g.round_name)
              WHEN 'first four'   THEN 'First Four'
              WHEN 'first round'  THEN 'R64'
              WHEN 'second round' THEN 'R32'
              WHEN 'sweet 16'     THEN 'S16'
              WHEN 'elite 8'      THEN 'E8'
              WHEN 'final four'   THEN 'F4'
              WHEN 'championship' THEN 'NCG'
              ELSE g.round_name
            END
          ) AS round_code,
          COALESCE(
            NULLIF(ps.opponent, ''),
            CASE WHEN g.team1 = p2.team THEN g.team2 ELSE g.team1 END
          ) AS opponent,
          ps.points,
          g.game_date
        FROM player_stats ps
        JOIN games g ON ps.game_id = g.id
        JOIN players p2 ON p2.id = ps.player_id
        WHERE ps.player_id = ?
        ORDER BY g.game_date ASC
      `).all(player.player_id);


      // Projected ETP = current_pts + (alive_players × tourney_ppg × games_remaining)
      // games_remaining: First Four teams can play up to 7 games total;
      // all others up to 6. Subtract games already played (game_log rows).
      // Eliminated players always get 0.
      //
      // Rate uses ACTUAL tournament points-per-game, not season PPG.
      // This correctly reflects upset teams — an 11-seed that's scored well
      // in the tournament projects forward from their actual pace, not seed odds.
      const totalPossible  = player.is_first_four ? 7 : 6;
      const gamesPlayed    = gameLog.length;
      const gamesRemaining = player.is_eliminated
        ? 0
        : Math.max(0, totalPossible - gamesPlayed);

      // tourney_ppg: points scored in this tournament ÷ games played.
      // Fall back to season_ppg only if the player hasn't played yet.
      const tourneyPpg = gamesPlayed > 0
        ? (stats?.total_points ?? 0) / gamesPlayed
        : player.season_ppg;

      const projEtp = Math.round(tourneyPpg * gamesRemaining * 10) / 10;

      return {
        player_id:     player.player_id,
        name:          player.name,
        team:          player.team,
        position:      player.position,
        seed:          player.seed,
        is_eliminated:  player.is_eliminated,
        season_ppg:     player.season_ppg,
        tourney_ppg:    Math.round(tourneyPpg * 10) / 10,
        region:         player.region,
        is_first_four:  player.is_first_four,
        jersey_number:  player.jersey_number || '',
        stats,
        fantasy_points:  Math.round(fantasyPoints * 10) / 10,
        is_live:         livePlayerIds.has(player.player_id),
        today_stats:     todayStats || null,
        game_log:        gameLog,
        proj_etp:        projEtp,
        games_remaining: gamesRemaining,
        next_game: (() => {
          if (player.is_eliminated) return null;
          const g = nextGameByTeam[player.team] || null;
          if (!g) return null;
          return {
            opponent:     g.team1 === player.team ? g.team2 : g.team1,
            game_date:    g.game_date,
            round_name:   g.round_name,
            tip_off_time: g.tip_off_time || null,
            tv_network:   g.tv_network   || null,
          };
        })(),
      };
    });

    db.prepare('UPDATE league_members SET total_points = ? WHERE league_id = ? AND user_id = ?')
      .run(Math.round(totalPoints * 10) / 10, leagueId, member.user_id);

    const totalPlayers = draftedPlayers.length;
    const aliveCount   = draftedPlayers.filter(p => !p.is_eliminated).length;

    return {
      ...member,
      total_points: Math.round(totalPoints * 10) / 10,
      players:      playerStats,
      totalPlayers,
      aliveCount,
    };
  });

  standings.sort((a, b) => b.total_points - a.total_points);

  // Single-game bonus — top 10 for expanded leaderboard.
  // Includes live games (is_live=1) so current scores update in real time.
  const sgBoard = db.prepare(`
    SELECT
      ps.player_id,
      p.name  AS player_name,
      p.team  AS player_team,
      ps.points,
      g.team1, g.team2, g.round_name,
      g.is_live,
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
    WHERE (g.is_completed = 1 OR g.is_live = 1) AND ps.points > 0 AND dp.player_id IS NOT NULL
    ORDER BY ps.points DESC
    LIMIT 10
  `).all(leagueId, leagueId);

  sgBoard.forEach(row => {
    row.opponent = row.team1 === row.player_team ? row.team2 : row.team1;
    row.is_live  = !!row.is_live;
  });

  const sgLeader = sgBoard[0] || null;
  const isLive = liveGameIds.length > 0;

  return { standings, settings, sgLeader, sgBoard, isLive, livePlayerIds: [...livePlayerIds] };
}

module.exports = { buildStandings };
