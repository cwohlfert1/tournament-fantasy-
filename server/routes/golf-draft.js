/**
 * Golf Draft Routes — Snake draft for golf pools.
 *
 * Same scoring/standings/prizes as pool format. The only difference is
 * the player selection method: instead of everyone independently picking
 * golfers (pool) or building under a salary cap (salary_cap), teams take
 * turns in a snake draft (1→N, N→1, repeat).
 *
 * Each golfer can only be on ONE team (exclusive picks). After the draft
 * completes, picks are copied to pool_picks so all downstream scoring,
 * standings, and prize logic works identically.
 *
 * Reuses the basketball draft pattern (routes/draft.js) adapted for
 * golf player data (tournament field + odds + ESPN headshots).
 */
'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/index');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const { scheduleAutoPick, cancelTimer, setIo: setTimerIo } = require('../golfDraftTimer');

// Socket.io reference — injected from index.js
let _io = null;
function setIo(io) { _io = io; setTimerIo(io); }
function emit(leagueId, event, data) {
  if (_io) _io.to(`golf_draft_${leagueId}`).emit(event, data);
}

// ── Snake draft order ────────────────────────────────────────────────────────
// Round 1: pick 1→N (ascending draft_order)
// Round 2: pick N→1 (descending)
// Round 3: pick 1→N again, etc.
function getCurrentPicker(currentPick, numTeams, members) {
  const round = Math.ceil(currentPick / numTeams);
  const pickInRound = (currentPick - 1) % numTeams;
  const draftPos = round % 2 === 1 ? pickInRound + 1 : numTeams - pickInRound;
  return members.find(m => m.draft_order === draftPos);
}

// ── Full draft state ─────────────────────────────────────────────────────────
async function getGolfDraftState(leagueId) {
  const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', leagueId);
  if (!league) return null;

  const members = await db.all(`
    SELECT glm.*, u.username, u.avatar_url
    FROM golf_league_members glm
    JOIN users u ON glm.user_id = u.id
    WHERE glm.golf_league_id = ?
    ORDER BY glm.draft_order
  `, leagueId);

  const picks = await db.all(`
    SELECT gdp.*, gp.name AS player_name, gp.country, gp.world_ranking,
           ptp.odds_display, ptp.odds_decimal, ptp.tier_number,
           gtf.espn_player_id
    FROM golf_draft_picks gdp
    JOIN golf_players gp ON gdp.player_id = gp.id
    LEFT JOIN pool_tier_players ptp ON ptp.league_id = gdp.golf_league_id
      AND ptp.tournament_id = ? AND ptp.player_id = gdp.player_id
    LEFT JOIN golf_tournament_fields gtf ON gtf.tournament_id = ?
      AND gtf.player_id = gdp.player_id
    WHERE gdp.golf_league_id = ?
    ORDER BY gdp.pick_number
  `, league.pool_tournament_id, league.pool_tournament_id, leagueId);

  // Available players: tournament field minus already-drafted
  const draftedIds = new Set(picks.map(p => p.player_id));
  const available = league.pool_tournament_id ? await db.all(`
    SELECT ptp.player_id, ptp.player_name, ptp.tier_number, ptp.odds_display,
           ptp.odds_decimal, ptp.world_ranking, ptp.salary,
           COALESCE(ptp.country, gp.country) AS country,
           gtf.espn_player_id
    FROM pool_tier_players ptp
    LEFT JOIN golf_players gp ON gp.id = ptp.player_id
    LEFT JOIN golf_tournament_fields gtf ON gtf.tournament_id = ptp.tournament_id AND gtf.player_id = ptp.player_id
    WHERE ptp.league_id = ? AND ptp.tournament_id = ?
      AND (ptp.is_withdrawn IS NULL OR ptp.is_withdrawn = 0)
    ORDER BY ptp.odds_decimal ASC, ptp.world_ranking ASC
  `, leagueId, league.pool_tournament_id) : [];

  const numTeams = members.length;
  const totalRounds = league.picks_per_team || 7;
  const totalPicks = numTeams * totalRounds;
  const currentPick = league.current_pick || 1;
  const currentPicker = currentPick <= totalPicks ? getCurrentPicker(currentPick, numTeams, members) : null;
  const draftComplete = currentPick > totalPicks || league.draft_status === 'completed';

  // Recent form: last 3 tournament finishes per player (for player card modal)
  const recentForm = {};
  if (league.pool_tournament_id) {
    const allPlayerIds = available.map(p => p.player_id);
    if (allPlayerIds.length > 0) {
      const formRows = await db.all(`
        SELECT gs.player_id, gt.name AS tournament_name,
               gs.round1, gs.round2, gs.round3, gs.round4,
               gs.finish_position, gs.made_cut
        FROM golf_scores gs
        JOIN golf_tournaments gt ON gt.id = gs.tournament_id
        WHERE gs.player_id IN (${allPlayerIds.map(() => '?').join(',')})
          AND gs.tournament_id != ?
          AND (gs.round1 IS NOT NULL OR gs.finish_position IS NOT NULL)
        ORDER BY gt.start_date DESC
      `, ...allPlayerIds, league.pool_tournament_id);
      for (const r of formRows) {
        if (!recentForm[r.player_id]) recentForm[r.player_id] = [];
        if (recentForm[r.player_id].length < 3) {
          const total = [r.round1, r.round2, r.round3, r.round4].filter(v => v != null).reduce((s, v) => s + v, 0);
          recentForm[r.player_id].push({
            tournament: r.tournament_name,
            finish: r.finish_position,
            total,
            made_cut: r.made_cut,
          });
        }
      }
    }
  }

  return {
    league,
    members,
    picks,
    available: available.filter(p => !draftedIds.has(p.player_id)),
    recentForm,
    currentPick,
    currentPicker,
    totalPicks,
    totalRounds,
    draftComplete,
    numTeams,
  };
}

// ── GET /golf/draft/:leagueId/state ──────────────────────────────────────────
router.get('/:leagueId/state', authMiddleware, async (req, res) => {
  try {
    const state = await getGolfDraftState(req.params.leagueId);
    if (!state) return res.status(404).json({ error: 'League not found' });
    // Verify membership
    const isMember = state.members.some(m => m.user_id === req.user.id);
    if (!isMember && state.league.commissioner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not a member of this league' });
    }
    res.json(state);
  } catch (err) {
    console.error('[golf-draft] state error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /golf/draft/:leagueId/pick ──────────────────────────────────────────
router.post('/:leagueId/pick', authMiddleware, async (req, res) => {
  try {
    const { player_id } = req.body;
    const { leagueId } = req.params;

    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.draft_status !== 'drafting') {
      return res.status(400).json({ error: 'Draft is not active' });
    }

    const members = await db.all(`
      SELECT glm.*, u.username FROM golf_league_members glm
      JOIN users u ON glm.user_id = u.id
      WHERE glm.golf_league_id = ? ORDER BY glm.draft_order
    `, leagueId);

    const numTeams = members.length;
    const totalRounds = league.picks_per_team || 7;
    const totalPicks = numTeams * totalRounds;
    const currentPick = league.current_pick || 1;

    if (currentPick > totalPicks) {
      return res.status(400).json({ error: 'Draft is complete' });
    }

    const currentPicker = getCurrentPicker(currentPick, numTeams, members);
    if (!currentPicker || currentPicker.user_id !== req.user.id) {
      return res.status(403).json({ error: "It's not your turn to pick" });
    }

    // Validate player exists in tournament field and not already drafted
    const player = await db.get(`
      SELECT gp.id, gp.name, gp.country, gp.world_ranking
      FROM golf_players gp
      WHERE gp.id = ?
    `, player_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const alreadyPicked = await db.get(
      'SELECT id FROM golf_draft_picks WHERE golf_league_id = ? AND player_id = ?',
      leagueId, player_id
    );
    if (alreadyPicked) return res.status(409).json({ error: 'Player already drafted' });

    const round = Math.ceil(currentPick / numTeams);
    const pickId = uuidv4();

    await db.run(`
      INSERT INTO golf_draft_picks (id, golf_league_id, user_id, player_id, pick_number, round)
      VALUES (?, ?, ?, ?, ?, ?)
    `, pickId, leagueId, req.user.id, player_id, currentPick, round);

    const nextPick = currentPick + 1;
    const draftComplete = nextPick > totalPicks;

    if (draftComplete) {
      await db.run(
        "UPDATE golf_leagues SET current_pick = ?, draft_status = 'completed' WHERE id = ?",
        nextPick, leagueId
      );
      // Bridge: copy draft picks → pool_picks so scoring/standings work
      await bridgeDraftToPoolPicks(leagueId, league.pool_tournament_id);

      // Send draft-complete emails to all participants (async, non-blocking)
      sendDraftCompleteEmails(leagueId, league).catch(err =>
        console.error(`[golf-draft] Draft complete email error:`, err.message)
      );
    } else {
      await db.run('UPDATE golf_leagues SET current_pick = ? WHERE id = ?', nextPick, leagueId);
    }

    const nextPicker = draftComplete ? null : getCurrentPicker(nextPick, numTeams, members);

    // Get full player data for the response
    const tierData = await db.get(`
      SELECT ptp.odds_display, ptp.tier_number, gtf.espn_player_id
      FROM pool_tier_players ptp
      LEFT JOIN golf_tournament_fields gtf ON gtf.tournament_id = ptp.tournament_id AND gtf.player_id = ptp.player_id
      WHERE ptp.league_id = ? AND ptp.player_id = ?
    `, leagueId, player_id);

    const pick = {
      id: pickId,
      league_id: leagueId,
      user_id: req.user.id,
      player_id,
      pick_number: currentPick,
      round,
      player_name: player.name,
      country: player.country,
      world_ranking: player.world_ranking,
      odds_display: tierData?.odds_display,
      tier_number: tierData?.tier_number,
      espn_player_id: tierData?.espn_player_id,
      username: req.user.username,
    };

    // Broadcast to all clients in the draft room
    emit(leagueId, 'golf_draft_pick', { pick, nextPickUserId: nextPicker?.user_id || null, draftComplete });

    // Schedule next pick's timer (or cancel if complete)
    if (draftComplete) { cancelTimer(leagueId); } else { scheduleAutoPick(leagueId); }

    res.json({ pick, nextPickUserId: nextPicker?.user_id || null, draftComplete });
  } catch (err) {
    console.error('[golf-draft] pick error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /golf/draft/:leagueId/start ─────────────────────────────────────────
// Commissioner starts the draft. Randomizes order if not already done.
router.post('/:leagueId/start', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    if (league.draft_status === 'completed') return res.status(400).json({ error: 'Draft already completed' });
    if (league.draft_status === 'drafting') return res.status(400).json({ error: 'Draft already in progress' });

    const members = await db.all(
      'SELECT id, user_id FROM golf_league_members WHERE golf_league_id = ?',
      req.params.leagueId
    );
    if (members.length < 1) return res.status(400).json({ error: 'Need at least 1 member to start draft' });

    // Randomize draft order if not already set
    if (!league.draft_order_randomized) {
      const shuffled = [...members].sort(() => Math.random() - 0.5);
      await db.transaction(async (tx) => {
        for (let i = 0; i < shuffled.length; i++) {
          await tx.run('UPDATE golf_league_members SET draft_order = ? WHERE id = ?', i + 1, shuffled[i].id);
        }
      });
      await db.run('UPDATE golf_leagues SET draft_order_randomized = 1 WHERE id = ?', req.params.leagueId);
    }

    await db.run(
      "UPDATE golf_leagues SET draft_status = 'drafting', current_pick = 1 WHERE id = ?",
      req.params.leagueId
    );

    emit(req.params.leagueId, 'golf_draft_started', { leagueId: req.params.leagueId });

    // Start the pick timer for the first pick
    scheduleAutoPick(req.params.leagueId);

    res.json({ ok: true, message: 'Draft started' });
  } catch (err) {
    console.error('[golf-draft] start error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Bridge: draft picks → pool_picks ─────────────────────────────────────────
// After the draft completes, copy each pick into pool_picks so the scoring
// engine, standings, and all downstream logic works without changes.
async function bridgeDraftToPoolPicks(leagueId, tournamentId) {
  if (!tournamentId) return;
  const draftPicks = await db.all(
    'SELECT * FROM golf_draft_picks WHERE golf_league_id = ? ORDER BY pick_number',
    leagueId
  );
  if (!draftPicks.length) return;

  // Clear any existing pool_picks for this league/tournament (fresh start)
  await db.run('DELETE FROM pool_picks WHERE league_id = ? AND tournament_id = ?', leagueId, tournamentId);

  await db.transaction(async (tx) => {
    for (const dp of draftPicks) {
      const player = await tx.get('SELECT name, country FROM golf_players WHERE id = ?', dp.player_id);
      const tierData = await tx.get(
        'SELECT tier_number FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND player_id = ?',
        leagueId, tournamentId, dp.player_id
      );
      await tx.run(`
        INSERT INTO pool_picks (id, league_id, tournament_id, user_id, player_id, player_name, tier_number, country)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, uuidv4(), leagueId, tournamentId, dp.user_id, dp.player_id, player?.name || '', tierData?.tier_number || 1, player?.country || '');
    }
  });
  console.log(`[golf-draft] Bridged ${draftPicks.length} draft picks → pool_picks for league ${leagueId}`);
}

// ── POST /golf/draft/:leagueId/override-pick ─────────────────────────────────
// Commissioner can swap a player's pick for any available player.
// Logged with timestamp + reason. Affects future score syncs only.
router.post('/:leagueId/override-pick', authMiddleware, async (req, res) => {
  try {
    const { user_id, old_player_id, new_player_id, reason } = req.body;
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    if (!reason || reason.trim().length < 3) return res.status(400).json({ error: 'A reason is required (min 3 characters)' });

    // Verify old pick exists
    const oldPick = await db.get(
      'SELECT * FROM golf_draft_picks WHERE golf_league_id = ? AND user_id = ? AND player_id = ?',
      req.params.leagueId, user_id, old_player_id
    );
    if (!oldPick) return res.status(404).json({ error: 'Original pick not found' });

    // Verify new player isn't already drafted by someone else
    const conflict = await db.get(
      'SELECT id FROM golf_draft_picks WHERE golf_league_id = ? AND player_id = ? AND user_id != ?',
      req.params.leagueId, new_player_id, user_id
    );
    if (conflict) return res.status(409).json({ error: 'That player is already drafted by another team' });

    // Swap in draft_picks
    await db.run(
      'UPDATE golf_draft_picks SET player_id = ?, override_reason = ?, override_at = datetime(\'now\'), override_by = ? WHERE id = ?',
      new_player_id, reason.trim(), req.user.id, oldPick.id
    );

    // Also swap in pool_picks if draft is completed and bridge has run
    if (league.draft_status === 'completed' && league.pool_tournament_id) {
      await db.run(
        'UPDATE pool_picks SET player_id = ?, player_name = (SELECT name FROM golf_players WHERE id = ?) WHERE league_id = ? AND tournament_id = ? AND user_id = ? AND player_id = ?',
        new_player_id, new_player_id, req.params.leagueId, league.pool_tournament_id, user_id, old_player_id
      );
    }

    // Log it
    console.log(`[golf-draft] OVERRIDE: league=${req.params.leagueId} user=${user_id} ${old_player_id}→${new_player_id} reason="${reason}" by=${req.user.username}`);

    res.json({ ok: true, message: 'Pick overridden' });
  } catch (err) {
    console.error('[golf-draft] override error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /golf/draft/:leagueId/time ─────────────────────────────────────────
// Commissioner can update draft_start_time up until 10 minutes before the
// scheduled time. After that window, the field is locked.
router.patch('/:leagueId/time', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    if (league.draft_status === 'drafting' || league.draft_status === 'completed') {
      return res.status(400).json({ error: 'Cannot change time — draft already started or completed' });
    }

    const { draft_start_time } = req.body;
    if (!draft_start_time) return res.status(400).json({ error: 'draft_start_time required' });

    // Enforce 10-minute lock window on current scheduled time
    if (league.draft_start_time) {
      const msUntil = new Date(league.draft_start_time) - Date.now();
      if (msUntil > 0 && msUntil < 10 * 60 * 1000) {
        return res.status(400).json({ error: 'Cannot change draft time within 10 minutes of the scheduled start' });
      }
    }

    await db.run('UPDATE golf_leagues SET draft_start_time = ? WHERE id = ?', draft_start_time, req.params.leagueId);

    // Notify all members about the scheduled draft time
    const { sendDraftTimeSet } = require('../mailer');
    const members = await db.all(
      'SELECT u.email, u.username FROM golf_league_members glm JOIN users u ON u.id = glm.user_id WHERE glm.golf_league_id = ?',
      req.params.leagueId
    );
    const tourn = league.pool_tournament_id
      ? await db.get('SELECT name FROM golf_tournaments WHERE id = ?', league.pool_tournament_id)
      : null;
    for (const m of members) {
      sendDraftTimeSet(m.email, {
        username: m.username,
        leagueName: league.name,
        leagueId: req.params.leagueId,
        tournamentName: tourn?.name,
        draftTime: draft_start_time,
      }).catch(err => console.error(`[golf-draft] Draft time email error for ${m.email}:`, err.message));
    }

    res.json({ ok: true, draft_start_time });
  } catch (err) {
    console.error('[golf-draft] time update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Draft-complete emails to all participants ─────────────────��──────────────
async function sendDraftCompleteEmails(leagueId, league) {
  const { sendDraftComplete } = require('../mailer');
  const tourn = league.pool_tournament_id
    ? await db.get('SELECT name FROM golf_tournaments WHERE id = ?', league.pool_tournament_id)
    : null;

  const members = await db.all(
    'SELECT u.email, u.username, u.id AS user_id FROM golf_league_members glm JOIN users u ON u.id = glm.user_id WHERE glm.golf_league_id = ?',
    leagueId
  );

  const allPicks = await db.all(`
    SELECT gdp.user_id, gdp.pick_number, gdp.round, gp.name AS player_name,
           ptp.odds_display
    FROM golf_draft_picks gdp
    JOIN golf_players gp ON gp.id = gdp.player_id
    LEFT JOIN pool_tier_players ptp ON ptp.league_id = gdp.golf_league_id AND ptp.player_id = gdp.player_id
    WHERE gdp.golf_league_id = ?
    ORDER BY gdp.pick_number ASC
  `, leagueId);

  for (const m of members) {
    const myPicks = allPicks.filter(p => p.user_id === m.user_id);
    try {
      await sendDraftComplete(m.email, {
        username: m.username,
        leagueName: league.name,
        leagueId,
        tournamentName: tourn?.name,
        picks: myPicks,
        totalTeams: members.length,
      });
      console.log(`[golf-draft] Draft complete email sent to ${m.username}`);
    } catch (err) {
      console.error(`[golf-draft] Draft complete email failed for ${m.email}:`, err.message);
    }
  }
}

module.exports = { router, getGolfDraftState, getCurrentPicker, bridgeDraftToPoolPicks, setIo };
