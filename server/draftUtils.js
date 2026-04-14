const db = require('./db/index');
const { scheduleAutoPick } = require('./draftTimer');

/**
 * Start the draft for a league. Validates state, randomises draft order,
 * updates DB, and emits 'draft_started' via socket if io is provided.
 * Returns { success, error?, league?, members? }
 */
async function performStartDraft(leagueId, io) {
  try {
    const league = await db.get('SELECT * FROM leagues WHERE id = ?', leagueId);
    if (!league) return { success: false, error: 'League not found' };
    if (league.status !== 'lobby') return { success: false, error: `League is not in lobby (status: ${league.status})` };

    const members = await db.all('SELECT * FROM league_members WHERE league_id = ?', leagueId);
    if (members.length < 2) return { success: false, error: 'Need at least 2 teams to start the draft' };

    // Payment gate — all members must have paid
    const unpaid = await db.get(`
      SELECT COUNT(*) as cnt FROM league_members lm
      LEFT JOIN member_payments mp ON mp.league_id = lm.league_id AND mp.user_id = lm.user_id
      WHERE lm.league_id = ? AND (mp.status IS NULL OR mp.status != 'paid')
    `, leagueId);
    if (unpaid.cnt > 0) {
      return { success: false, error: `${unpaid.cnt} team${unpaid.cnt !== 1 ? 's' : ''} haven't paid yet` };
    }

    // Randomise draft order
    const shuffled = [...members].sort(() => Math.random() - 0.5);
    await db.transaction(async (tx) => {
      for (let i = 0; i < shuffled.length; i++) {
        await tx.run('UPDATE league_members SET draft_order = ? WHERE id = ?', i + 1, shuffled[i].id);
      }
    });

    await db.run("UPDATE leagues SET status = 'drafting', current_pick = 1 WHERE id = ?", leagueId);

    const updatedLeague = await db.get('SELECT * FROM leagues WHERE id = ?', leagueId);
    const updatedMembers = await db.all(`
      SELECT lm.*, u.username FROM league_members lm
      JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = ? ORDER BY lm.draft_order
    `, leagueId);

    if (io) {
      io.to(`draft_${leagueId}`).emit('draft_started', {
        league: updatedLeague,
        members: updatedMembers,
        currentPick: 1,
      });
    }

    // Kick off server-side auto-pick timer for the first pick
    if (io) scheduleAutoPick(leagueId, io);

    console.log(`[auto-start] Draft started: league=${leagueId} (${league.name})`);
    return { success: true, league: updatedLeague, members: updatedMembers };
  } catch (err) {
    console.error('performStartDraft error:', err);
    return { success: false, error: err.message };
  }
}

module.exports = { performStartDraft };
