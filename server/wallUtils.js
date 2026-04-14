/**
 * wallUtils.js
 * Helper to post auto-generated system messages to the wall.
 */
const db = require('./db/index');
const { v4: uuidv4 } = require('uuid');

async function postSystemMessage(leagueId, text, io) {
  try {
    const id = uuidv4();
    await db.run(`
      INSERT INTO wall_posts (id, league_id, user_id, text, gif_url, is_system)
      VALUES (?, ?, NULL, ?, '', 1)
    `, id, leagueId, text);

    const post = {
      id, league_id: leagueId, user_id: null, text, gif_url: '',
      is_system: 1, created_at: new Date().toISOString(),
      reactions: {}, replies: [],
    };

    if (io) io.to(`league_${leagueId}`).emit('wall_new_post', post);
    return post;
  } catch (err) {
    console.error('[wallUtils] postSystemMessage error:', err.message);
  }
}

/**
 * Post draft pick system messages to all relevant leagues.
 * Called from the pick_made socket handler.
 */
async function postDraftPick(leagueId, teamName, playerName, io) {
  await postSystemMessage(leagueId, `🏀 ${teamName} drafted ${playerName}`, io);
}

/**
 * Post elimination messages for all leagues that have drafted players
 * from the eliminated team.
 *
 * loserTeams: string OR array of strings — ESPN display name + any known aliases
 * (e.g. ['North Carolina State', 'NC State']) so players stored under either
 * name are all found.
 */
async function postEliminations(loserTeams, io) {
  const names = Array.isArray(loserTeams) ? loserTeams : [loserTeams];
  if (!names.length) return;

  const leagues = await db.all("SELECT id FROM leagues WHERE status IN ('active', 'drafting')");
  const placeholders = names.map(() => '?').join(', ');

  for (const { id: leagueId } of leagues) {
    const owners = await db.all(`
      SELECT lm.team_name, p.name AS player_name
      FROM draft_picks dp
      JOIN players p ON dp.player_id = p.id
      JOIN league_members lm ON dp.user_id = lm.user_id AND dp.league_id = lm.league_id
      WHERE dp.league_id = ? AND p.team IN (${placeholders})
    `, leagueId, ...names);

    for (const owner of owners) {
      await postSystemMessage(leagueId, `💀 ${owner.player_name} has been eliminated from ${owner.team_name}'s roster`, io);
    }
  }
}

/**
 * Check for standings rank changes and post messages when a team moves to 1st.
 * prevSnapshot: Map of leagueId -> [{user_id, rank}]
 */
const prevStandingsMap = new Map();

async function checkAndPostRankChanges(leagueId, newStandings, io) {
  const prev = prevStandingsMap.get(leagueId) || [];
  const prevRankById = {};
  prev.forEach((s, i) => { prevRankById[s.user_id] = i + 1; });

  for (let i = 0; i < newStandings.length; i++) {
    const s = newStandings[i];
    const newRank = i + 1;
    const oldRank = prevRankById[s.user_id];
    // Only post when a team newly moves to 1st (didn't start there)
    if (newRank === 1 && oldRank && oldRank > 1) {
      await postSystemMessage(leagueId, `🔥 ${s.team_name} just jumped to 1st place 👀`, io);
    }
  }

  prevStandingsMap.set(leagueId, newStandings.map((s, i) => ({ user_id: s.user_id, team_name: s.team_name, rank: i + 1 })));
}

module.exports = { postSystemMessage, postDraftPick, postEliminations, checkAndPostRankChanges };
