const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/index');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function getCurrentPicker(currentPick, numTeams, members) {
  const round = Math.ceil(currentPick / numTeams);
  const pickInRound = (currentPick - 1) % numTeams;
  const draftPos = round % 2 === 1 ? pickInRound + 1 : numTeams - pickInRound;
  return members.find(m => m.draft_order === draftPos);
}

async function getDraftState(leagueId) {
  const league = await db.get('SELECT * FROM leagues WHERE id = ?', leagueId);
  if (!league) return null;

  const members = await db.all(`
    SELECT lm.*, u.username
    FROM league_members lm
    JOIN users u ON lm.user_id = u.id
    WHERE lm.league_id = ?
    ORDER BY lm.draft_order
  `, leagueId);

  const picks = await db.all(`
    SELECT dp.*, p.name as player_name, p.team, p.position, p.season_ppg, p.seed, p.is_eliminated, p.region, p.is_first_four, p.jersey_number, u.username
    FROM draft_picks dp
    JOIN players p ON dp.player_id = p.id
    JOIN users u ON dp.user_id = u.id
    WHERE dp.league_id = ?
    ORDER BY dp.pick_number
  `, leagueId);

  const numTeams = members.length;
  const totalPicks = numTeams * league.total_rounds;
  const currentPick = league.current_pick;
  const currentPicker = currentPick <= totalPicks ? getCurrentPicker(currentPick, numTeams, members) : null;
  const draftComplete = currentPick > totalPicks || league.status === 'active';

  return {
    league,
    members,
    picks,
    currentPick,
    currentPicker,
    totalPicks,
    draftComplete,
    numTeams,
  };
}

// GET /api/draft/:leagueId/state
router.get('/:leagueId/state', authMiddleware, async (req, res) => {
  try {
    const state = await getDraftState(req.params.leagueId);
    if (!state) return res.status(404).json({ error: 'League not found' });
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/draft/:leagueId/pick
router.post('/:leagueId/pick', authMiddleware, async (req, res) => {
  try {
    const { player_id } = req.body;
    const { leagueId } = req.params;

    const league = await db.get('SELECT * FROM leagues WHERE id = ?', leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.status !== 'drafting') {
      return res.status(400).json({ error: 'Draft is not active' });
    }

    const members = await db.all(`
      SELECT lm.*, u.username FROM league_members lm
      JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = ? ORDER BY lm.draft_order
    `, leagueId);

    const numTeams = members.length;
    const totalPicks = numTeams * league.total_rounds;
    const currentPick = league.current_pick;

    if (currentPick > totalPicks) {
      return res.status(400).json({ error: 'Draft is complete' });
    }

    const currentPicker = getCurrentPicker(currentPick, numTeams, members);
    if (!currentPicker || currentPicker.user_id !== req.user.id) {
      return res.status(403).json({ error: "It is not your turn to pick" });
    }

    // Check player exists and not already drafted
    const player = await db.get('SELECT * FROM players WHERE id = ?', player_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const alreadyPicked = await db.get('SELECT id FROM draft_picks WHERE league_id = ? AND player_id = ?', leagueId, player_id);
    if (alreadyPicked) return res.status(409).json({ error: 'Player already drafted' });

    const round = Math.ceil(currentPick / numTeams);
    const pickId = uuidv4();

    await db.run(`
      INSERT INTO draft_picks (id, league_id, user_id, player_id, pick_number, round)
      VALUES (?, ?, ?, ?, ?, ?)
    `, pickId, leagueId, req.user.id, player_id, currentPick, round);

    const nextPick = currentPick + 1;
    const draftComplete = nextPick > totalPicks;

    if (draftComplete) {
      await db.run("UPDATE leagues SET current_pick = ?, status = 'active', draft_status = 'completed' WHERE id = ?", nextPick, leagueId);
    } else {
      await db.run('UPDATE leagues SET current_pick = ? WHERE id = ?', nextPick, leagueId);
    }

    const nextPicker = draftComplete ? null : getCurrentPicker(nextPick, numTeams, members);

    const pick = {
      id: pickId,
      league_id: leagueId,
      user_id: req.user.id,
      player_id,
      pick_number: currentPick,
      round,
      player_name: player.name,
      team: player.team,
      position: player.position,
      username: req.user.username,
    };

    res.json({ pick, nextPickUserId: nextPicker?.user_id || null, draftComplete });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { router, getDraftState, getCurrentPicker };
