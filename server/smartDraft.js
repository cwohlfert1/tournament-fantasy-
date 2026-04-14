/**
 * smartDraft.js
 *
 * Server-side Smart Draft algorithm.
 * Used by draftTimer.js when a player has purchased Smart Draft
 * or the commissioner has set the league autodraft default to 'smart_draft'.
 */

const db = require('./db/index');

// ETP calculation — mirrors client-side calcETP in DraftRoom.jsx
const ETP_GAMES = {
  1: 3.8, 2: 3.0, 3: 2.5, 4: 2.2, 5: 1.8, 6: 1.7, 7: 1.6,
  8: 1.3, 9: 1.2, 10: 1.1, 11: 1.0, 12: 0.9,
};

function expectedGames(seed) {
  if (!seed) return null;
  const n = parseInt(seed);
  if (ETP_GAMES[n] !== undefined) return ETP_GAMES[n];
  return (n >= 13 && n <= 16) ? 0.5 : null;
}

function calcETP(ppg, seed) {
  const games = expectedGames(seed);
  if (!games || !ppg) return null;
  return Math.round(ppg * games * 10) / 10;
}

const GUARD_POSITIONS = new Set(['G', 'PG', 'SG']);

/**
 * Select the best available player for a user using the Smart Draft algorithm.
 *
 * Priority rules:
 * 1. Never draft an injured player (injury_flagged = 1) — skip entirely
 * 2. Penalize 3rd+ player from the same team  (-40% ETP)
 * 3. Penalize over-concentration in one region (-20% ETP if 3+ from same region)
 * 4. Boost mid-seeds 5-10 if user already has 4+ top-seed (1-4) players (+10%)
 * 5. Boost guards if user has no guards after round 3 (+15%)
 *
 * @param {string} leagueId
 * @param {string} userId
 * @param {Array}  availablePlayers — full player rows already NOT in draft_picks
 * @returns {Object|null} best player object, or null if none available
 */
async function selectSmartDraftPlayer(leagueId, userId, availablePlayers) {
  // Load this user's current picks
  const myPicks = await db.all(`
    SELECT p.team, p.region, p.seed, p.position
    FROM draft_picks dp
    JOIN players p ON dp.player_id = p.id
    WHERE dp.league_id = ? AND dp.user_id = ?
  `, leagueId, userId);

  const round = myPicks.length + 1; // next pick number for this user

  // Tally existing roster composition
  const teamCounts    = {};
  const regionCounts  = {};
  let hiSeedCount     = 0;  // players from seed 1-4 teams
  let hasGuard        = false;

  for (const p of myPicks) {
    if (p.team)   teamCounts[p.team]     = (teamCounts[p.team]     || 0) + 1;
    if (p.region) regionCounts[p.region] = (regionCounts[p.region] || 0) + 1;
    if (p.seed && parseInt(p.seed) <= 4)   hiSeedCount++;
    if (p.position && GUARD_POSITIONS.has(p.position)) hasGuard = true;
  }

  // Score each available player with contextual adjustments
  const candidates = availablePlayers
    .filter(p => !p.injury_flagged)                          // Rule 1: skip injured
    .map(p => {
      const baseETP = calcETP(p.season_ppg, p.seed) ?? (p.season_ppg || 0);
      let score     = baseETP;

      // Rule 2: penalize 3rd player from same team
      if (p.team && (teamCounts[p.team] || 0) >= 2) score *= 0.60;

      // Rule 3: penalize over-concentration in one region
      if (p.region && (regionCounts[p.region] || 0) >= 3) score *= 0.80;

      // Rule 4: boost mid-seeds when already stacked with top-seed players
      if (hiSeedCount >= 4 && p.seed && parseInt(p.seed) >= 5 && parseInt(p.seed) <= 10) {
        score *= 1.10;
      }

      // Rule 5: boost guards if no guards have been drafted after round 3
      if (!hasGuard && round > 3 && p.position && GUARD_POSITIONS.has(p.position)) {
        score *= 1.15;
      }

      return { player: p, score };
    });

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].player;
}

module.exports = { selectSmartDraftPlayer };
