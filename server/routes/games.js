const express = require('express');
const db = require('../db/index');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ── ESPN odds cache ────────────────────────────────────────────────────────────
// Map<espn_event_id, { spread, overUnder, fetchedAt }>
const oddsCache = new Map();
const ODDS_TTL_MS = 30 * 60 * 1000; // 30 minutes

async function fetchOdds(espnEventId) {
  const cached = oddsCache.get(espnEventId);
  if (cached && Date.now() - cached.fetchedAt < ODDS_TTL_MS) {
    return { spread: cached.spread, overUnder: cached.overUnder };
  }

  try {
    const url = `https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/events/${espnEventId}/competitions/${espnEventId}/odds`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = await res.json();
    const item = Array.isArray(data.items) ? data.items[0] : null;
    if (!item) return null;

    const spread = item.details || null;
    const overUnder = item.overUnder != null ? item.overUnder : null;

    oddsCache.set(espnEventId, { spread, overUnder, fetchedAt: Date.now() });
    return { spread, overUnder };
  } catch {
    return null;
  }
}

// GET /api/games/schedule
// Returns all games with scores + user's drafted players per game
router.get('/schedule', authMiddleware, async (req, res) => {
  try {
    const games = await db.all(`
      SELECT g.*,
             t1.seed AS team1_seed,
             t2.seed AS team2_seed
      FROM games g
      LEFT JOIN (SELECT team, MIN(seed) AS seed FROM players GROUP BY team) t1 ON t1.team = g.team1
      LEFT JOIN (SELECT team, MIN(seed) AS seed FROM players GROUP BY team) t2 ON t2.team = g.team2
      ORDER BY g.game_date ASC, g.tip_off_time ASC, g.id ASC
    `);

    if (!games.length) return res.json({ games: [], myDraftedPlayerIds: [] });

    // All player stats across all games
    const placeholders = games.map(() => '?').join(',');
    const allStats = await db.all(`
      SELECT ps.game_id, ps.player_id, ps.points, p.name AS player_name, p.team AS player_team
      FROM player_stats ps
      JOIN players p ON ps.player_id = p.id
      WHERE ps.game_id IN (${placeholders})
    `, ...games.map(g => g.id));

    const statsByGame = {};
    for (const s of allStats) {
      if (!statsByGame[s.game_id]) statsByGame[s.game_id] = [];
      statsByGame[s.game_id].push(s);
    }

    // User's drafted players across ALL their leagues (deduplicated)
    const myDrafted = await db.all(`
      SELECT DISTINCT dp.player_id, p.name AS player_name, p.team AS player_team
      FROM draft_picks dp
      JOIN players p ON dp.player_id = p.id
      WHERE dp.user_id = ?
    `, req.user.id);

    const myPlayerIdSet = new Set(myDrafted.map(p => p.player_id));

    // Fetch odds for upcoming games in parallel
    const upcomingWithEspnId = games.filter(g => !g.is_completed && !g.is_live && g.espn_event_id);
    const oddsResults = await Promise.all(
      upcomingWithEspnId.map(g => fetchOdds(g.espn_event_id).then(o => [g.id, o]))
    );
    const oddsMap = Object.fromEntries(oddsResults.filter(([, o]) => o !== null));

    const result = games.map(g => {
      const gameStats = statsByGame[g.id] || [];

      const myPlayersInGame = myDrafted
        .filter(p => p.player_team === g.team1 || p.player_team === g.team2)
        .map(p => {
          const stat = gameStats.find(s => s.player_id === p.player_id);
          return { ...p, points: stat?.points ?? null };
        });

      const odds = oddsMap[g.id] || null;

      return {
        ...g,
        player_stats: gameStats,
        my_players: myPlayersInGame,
        spread: odds?.spread ?? null,
        overUnder: odds?.overUnder ?? null,
      };
    });

    res.json({ games: result, myDraftedPlayerIds: [...myPlayerIdSet] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
