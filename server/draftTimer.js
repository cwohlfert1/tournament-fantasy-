const db = require('./db/index');
const { v4: uuidv4 } = require('uuid');
const { addMessage, makeSystemMsg } = require('./chatStore');
const { selectSmartDraftPlayer } = require('./smartDraft');

// Per-league timeout handles — keyed by leagueId
const timers = {};

// ── Bot users — testuser01-testuser09 auto-pick fast ─────────────────────────
function isBotUsername(username) {
  if (/^testuser0[1-9]$/i.test(username || '')) return true;
  if (/^bot_(alpha|beta|gamma|delta|epsilon|zeta|eta|theta)$/i.test(username || '')) return true;
  return false;
}

// ETP calculation (mirrors client-side calcETP)
const ETP_GAMES = {
  1: 3.8, 2: 3.0, 3: 2.5, 4: 2.2, 5: 1.8, 6: 1.7, 7: 1.6,
  8: 1.3, 9: 1.2, 10: 1.1, 11: 1.0, 12: 1.0, 13: 1.0, 14: 1.0, 15: 1.0, 16: 1.0,
};

function calcETP(ppg, seed, isFirstFour) {
  if (!seed || !ppg) return 0;
  const n = parseInt(seed);
  const base = ETP_GAMES[n] ?? 1.0;
  const games = isFirstFour ? base + 0.5 : base;
  return ppg * games;
}

/**
 * Schedule a server-side auto-pick for the current pick in a league.
 * Fires (pick_time_limit + 2) seconds after being called, then checks
 * whether the pick was already made. If not, auto-selects a player using
 * Smart Draft (if purchased or enabled by league default) or Best Available.
 */
async function scheduleAutoPick(leagueId, io) {
  if (timers[leagueId]) {
    clearTimeout(timers[leagueId]);
    delete timers[leagueId];
  }

  const league = await db.get('SELECT * FROM leagues WHERE id = ?', leagueId);
  if (!league || league.status !== 'drafting') return;

  const expectedPick = league.current_pick;

  // Check if current picker is a bot — if so, pick quickly
  const members = await db.all(`
    SELECT lm.*, u.username FROM league_members lm
    JOIN users u ON lm.user_id = u.id
    WHERE lm.league_id = ? ORDER BY lm.draft_order
  `, leagueId);
  const numTeams = members.length;
  const totalPicks = numTeams * league.total_rounds;
  if (expectedPick > totalPicks) return;
  const round = Math.ceil(expectedPick / numTeams);
  const pickInRound = (expectedPick - 1) % numTeams;
  const draftPos = round % 2 === 1 ? pickInRound + 1 : numTeams - pickInRound;
  const currentPicker = members.find(m => m.draft_order === draftPos);

  // Bots pick in 2-3 seconds; real users get the full timer
  const isBot = currentPicker && isBotUsername(currentPicker.username);
  const delay = isBot
    ? 2000 + Math.random() * 1000  // 2–3 seconds
    : (league.pick_time_limit + 2) * 1000;

  timers[leagueId] = setTimeout(() => {
    _doAutoPick(leagueId, expectedPick, io);
  }, delay);
}

function clearAutoPick(leagueId) {
  if (timers[leagueId]) {
    clearTimeout(timers[leagueId]);
    delete timers[leagueId];
  }
}

async function _doAutoPick(leagueId, expectedPick, io) {
  try {
    const league = await db.get('SELECT * FROM leagues WHERE id = ?', leagueId);
    if (!league || league.status !== 'drafting') return;
    if (league.current_pick !== expectedPick) return; // pick already made

    const members = await db.all(`
      SELECT lm.*, u.username FROM league_members lm
      JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = ? ORDER BY lm.draft_order
    `, leagueId);

    const numTeams  = members.length;
    const totalPicks = numTeams * league.total_rounds;
    if (expectedPick > totalPicks) return;

    // Snake draft: determine who is on the clock
    const round        = Math.ceil(expectedPick / numTeams);
    const pickInRound  = (expectedPick - 1) % numTeams;
    const draftPos     = round % 2 === 1 ? pickInRound + 1 : numTeams - pickInRound;
    const currentPicker = members.find(m => m.draft_order === draftPos);
    if (!currentPicker) return;

    // ── Fetch all available players ──────────────────────────────────────────
    const allAvailable = await db.all(`
      SELECT * FROM players
      WHERE id NOT IN (SELECT player_id FROM draft_picks WHERE league_id = ?)
      ORDER BY season_ppg DESC, name ASC
    `, leagueId);

    let available     = null;
    let usedSmartDraft = false;

    // ── Bot users always pick highest ETP (no smart draft, no injury skip) ──
    if (isBotUsername(currentPicker.username)) {
      const sorted = [...allAvailable].sort((a, b) => {
        const etpA = calcETP(a.season_ppg, a.seed, !!a.is_first_four);
        const etpB = calcETP(b.season_ppg, b.seed, !!b.is_first_four);
        return etpB - etpA;
      });
      available = sorted[0] || null;
    } else {
      // ── Smart Draft check ──────────────────────────────────────────────────
      const hasSmart = await db.get(
        "SELECT id FROM smart_draft_upgrades WHERE user_id = ? AND league_id = ? AND status = 'active' AND enabled != 0",
        currentPicker.user_id, leagueId
      );

      const useSmartDraft = !!(hasSmart || league.autodraft_mode === 'smart_draft');

      if (useSmartDraft && allAvailable.length) {
        available = selectSmartDraftPlayer(leagueId, currentPicker.user_id, allAvailable);
        if (available) usedSmartDraft = true;
      }

      if (!available) {
        // Best Available: sort by ETP (not raw PPG), skip injured if possible
        const sorted = [...allAvailable].sort((a, b) =>
          calcETP(b.season_ppg, b.seed, !!b.is_first_four) - calcETP(a.season_ppg, a.seed, !!a.is_first_four)
        );
        available = sorted.find(p => !p.injury_flagged) || sorted[0] || null;
      }
    }

    if (!available) return;

    // ── Insert the pick ──────────────────────────────────────────────────────
    const pickId = uuidv4();
    await db.run(`
      INSERT INTO draft_picks (id, league_id, user_id, player_id, pick_number, round)
      VALUES (?, ?, ?, ?, ?, ?)
    `, pickId, leagueId, currentPicker.user_id, available.id, expectedPick, round);

    const nextPick     = expectedPick + 1;
    const draftComplete = nextPick > totalPicks;

    if (draftComplete) {
      await db.run("UPDATE leagues SET current_pick = ?, status = 'active', draft_status = 'completed' WHERE id = ?", nextPick, leagueId);
    } else {
      await db.run('UPDATE leagues SET current_pick = ? WHERE id = ?', nextPick, leagueId);
    }

    // Determine next picker
    const nextRound       = Math.ceil(nextPick / numTeams);
    const nextPickInRound = (nextPick - 1) % numTeams;
    const nextDraftPos    = nextRound % 2 === 1 ? nextPickInRound + 1 : numTeams - nextPickInRound;
    const nextPicker      = draftComplete ? null : members.find(m => m.draft_order === nextDraftPos);

    io.to(`draft_${leagueId}`).emit('pick_made', {
      pick: {
        id:          pickId,
        league_id:   leagueId,
        user_id:     currentPicker.user_id,
        player_id:   available.id,
        pick_number: expectedPick,
        round,
        player_name: available.name,
        team:        available.team,
        position:    available.position,
        seed:        available.seed,
        username:    currentPicker.username,
        auto_picked:      true,
        smart_drafted:    usedSmartDraft,
      },
      nextPickUserId:   nextPicker?.user_id   || null,
      nextPickUsername: nextPicker?.username  || null,
      draftComplete,
      currentPick: nextPick,
    });

    // System chat message
    const label  = usedSmartDraft ? ' (Smart Draft ⚡)' : '';
    const sysMsg = makeSystemMsg(
      `${currentPicker.team_name} selected ${available.name} with pick #${expectedPick}${label}`
    );
    addMessage(leagueId, sysMsg);
    io.to(`draft_${leagueId}`).emit('chat_message', sysMsg);

    if (draftComplete) {
      const { getDraftState } = require('./routes/draft');
      io.to(`draft_${leagueId}`).emit('draft_completed', await getDraftState(leagueId));
    } else {
      scheduleAutoPick(leagueId, io);
    }

    const algo = usedSmartDraft ? 'Smart Draft' : 'Best Available';
    console.log(`[auto-pick] ${leagueId} pick #${expectedPick}: ${available.name} (${algo}) → ${currentPicker.username}`);
  } catch (err) {
    console.error('[auto-pick] error:', err);
  }
}

module.exports = { scheduleAutoPick, clearAutoPick };
