/**
 * golfDraftTimer.js — Server-side pick timer for golf snake drafts.
 *
 * When a pick starts, schedules an auto-pick after pick_time_limit seconds.
 * If the player doesn't pick in time, auto-selects the best available golfer
 * by world ranking (lowest = best). Emits socket events so all clients see
 * the countdown and auto-pick in real-time.
 *
 * Adapted from the basketball draftTimer.js but simplified:
 * - No smart draft / ETP calculation
 * - No bot fast-pick
 * - Auto-pick = best available by world_ranking
 */
'use strict';

const db = require('./db/index');
const { v4: uuidv4 } = require('uuid');

// Per-league timeout handles
const timers = {};
let _io = null;

function setIo(io) { _io = io; }

function emit(leagueId, event, data) {
  if (_io) _io.to(`golf_draft_${leagueId}`).emit(event, data);
}

/**
 * Schedule auto-pick for the current pick in a draft league.
 * Call after each pick (or when draft starts) to reset the timer.
 */
async function scheduleAutoPick(leagueId) {
  // Clear any existing timer for this league
  if (timers[leagueId]) {
    clearTimeout(timers[leagueId]);
    delete timers[leagueId];
  }

  const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', leagueId);
  if (!league || league.draft_status !== 'drafting') return;

  const timeLimit = league.pick_time_limit || 60; // seconds
  const expectedPick = league.current_pick || 1;
  const numTeams = (await db.get('SELECT COUNT(*) AS c FROM golf_league_members WHERE golf_league_id = ?', leagueId)).c;
  const totalPicks = numTeams * (league.picks_per_team || 7);

  if (expectedPick > totalPicks) return; // draft already complete

  // Emit timer start so clients can show countdown
  emit(leagueId, 'golf_draft_timer', { secondsRemaining: timeLimit, pickNumber: expectedPick });

  // Schedule auto-pick
  timers[leagueId] = setTimeout(async () => {
    delete timers[leagueId];
    try {
      // Re-check: did someone pick in time?
      const freshLeague = await db.get('SELECT current_pick, draft_status FROM golf_leagues WHERE id = ?', leagueId);
      if (!freshLeague || freshLeague.draft_status !== 'drafting') return;
      if (freshLeague.current_pick !== expectedPick) return; // already advanced

      // Find who's on the clock
      const members = await db.all(`
        SELECT glm.*, u.username FROM golf_league_members glm
        JOIN users u ON glm.user_id = u.id
        WHERE glm.golf_league_id = ? ORDER BY glm.draft_order
      `, leagueId);

      const { getCurrentPicker } = require('./routes/golf-draft');
      const picker = getCurrentPicker(expectedPick, numTeams, members);
      if (!picker) return;

      // Find best available player by world ranking
      const draftedIds = (await db.all('SELECT player_id FROM golf_draft_picks WHERE golf_league_id = ?', leagueId)).map(r => r.player_id);
      const best = await db.get(`
        SELECT ptp.player_id, ptp.player_name, ptp.tier_number, gp.world_ranking,
               ptp.odds_display, gtf.espn_player_id
        FROM pool_tier_players ptp
        LEFT JOIN golf_players gp ON gp.id = ptp.player_id
        LEFT JOIN golf_tournament_fields gtf ON gtf.tournament_id = ptp.tournament_id AND gtf.player_id = ptp.player_id
        WHERE ptp.league_id = ? AND ptp.tournament_id = ?
          AND (ptp.is_withdrawn IS NULL OR ptp.is_withdrawn = 0)
          AND ptp.player_id NOT IN (${draftedIds.map(() => '?').join(',') || "'none'"})
        ORDER BY gp.world_ranking ASC
        LIMIT 1
      `, leagueId, league.pool_tournament_id, ...draftedIds);

      if (!best) return; // no players left

      // Make the auto-pick
      const round = Math.ceil(expectedPick / numTeams);
      const pickId = uuidv4();
      await db.run(`
        INSERT INTO golf_draft_picks (id, golf_league_id, user_id, player_id, pick_number, round)
        VALUES (?, ?, ?, ?, ?, ?)
      `, pickId, leagueId, picker.user_id, best.player_id, expectedPick, round);

      const nextPick = expectedPick + 1;
      const draftComplete = nextPick > totalPicks;

      if (draftComplete) {
        await db.run("UPDATE golf_leagues SET current_pick = ?, draft_status = 'completed' WHERE id = ?", nextPick, leagueId);
        const { bridgeDraftToPoolPicks } = require('./routes/golf-draft');
        await bridgeDraftToPoolPicks(leagueId, league.pool_tournament_id);
      } else {
        await db.run('UPDATE golf_leagues SET current_pick = ? WHERE id = ?', nextPick, leagueId);
      }

      const pick = {
        id: pickId,
        league_id: leagueId,
        user_id: picker.user_id,
        player_id: best.player_id,
        pick_number: expectedPick,
        round,
        player_name: best.player_name,
        tier_number: best.tier_number,
        espn_player_id: best.espn_player_id,
        odds_display: best.odds_display,
        username: picker.username,
        auto_pick: true,
      };

      emit(leagueId, 'golf_draft_pick', { pick, nextPickUserId: null, draftComplete });
      console.log(`[golf-draft-timer] Auto-picked ${best.player_name} for ${picker.username} (pick ${expectedPick})`);

      // Schedule next pick's timer
      if (!draftComplete) {
        scheduleAutoPick(leagueId);
      }
    } catch (err) {
      console.error(`[golf-draft-timer] Auto-pick error for league ${leagueId}:`, err.message);
    }
  }, (timeLimit + 2) * 1000); // +2s grace
}

function cancelTimer(leagueId) {
  if (timers[leagueId]) {
    clearTimeout(timers[leagueId]);
    delete timers[leagueId];
  }
}

module.exports = { scheduleAutoPick, cancelTimer, setIo };
