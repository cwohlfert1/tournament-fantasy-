const db = require('./db');

// ── Tracking tables ──────────────────────────────────────────────────────────
try { db.exec(`CREATE TABLE IF NOT EXISTS lock_emails_sent (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(league_id, user_id)
)`); } catch (_) {}

try { db.exec(`CREATE TABLE IF NOT EXISTS round_emails_sent (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(league_id, round_number)
)`); } catch (_) {}

function computeLockTime(startDate) {
  const d = new Date(startDate);
  const dow = d.getUTCDay();
  const daysBack = (dow + 3) % 7;
  d.setDate(d.getDate() - daysBack);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

function checkPoolLocks() {
  try {
    const activeLeagues = db.prepare(`
      SELECT gl.* FROM golf_leagues gl
      WHERE gl.picks_locked = 0
        AND gl.pool_tournament_id IS NOT NULL
    `).all();

    for (const league of activeLeagues) {
      const tourn = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(league.pool_tournament_id);
      if (!tourn) continue;
      const lockTime = league.picks_lock_time ? new Date(league.picks_lock_time) : computeLockTime(tourn.start_date);
      if (new Date() >= lockTime) {
        db.prepare('UPDATE golf_leagues SET picks_locked = 1, picks_lock_time = ? WHERE id = ?')
          .run(lockTime.toISOString(), league.id);
        console.log(`[golf-pool-lock] Locked picks for league "${league.name}" (${league.id})`);

        // Fire lock confirmation emails (async, non-blocking)
        sendLockEmails(league, tourn).catch(err =>
          console.error(`[golf-pool-lock] Email error for "${league.name}":`, err.message)
        );
      }
    }
  } catch (err) {
    console.error('[golf-pool-lock] Error checking locks:', err.message);
  }
}

async function sendLockEmails(league, tourn) {
  const { sendPicksLockConfirmation } = require('./mailer');
  const { v4: uuidv4 } = require('uuid');

  // Get all members with picks
  const members = db.prepare(`
    SELECT DISTINCT pp.user_id, u.email, u.username
    FROM pool_picks pp
    JOIN users u ON u.id = pp.user_id
    WHERE pp.league_id = ? AND pp.tournament_id = ?
  `).all(league.id, league.pool_tournament_id);

  const baseUrl = 'https://www.tourneyrun.app';
  const leagueUrl = `${baseUrl}/golf/league/${league.id}?tab=standings`;

  for (const member of members) {
    // Check if already sent
    const already = db.prepare('SELECT 1 FROM lock_emails_sent WHERE league_id = ? AND user_id = ?')
      .get(league.id, member.user_id);
    if (already) continue;

    // Get all entries for this user
    const entryNumbers = db.prepare(`
      SELECT DISTINCT COALESCE(entry_number, 1) as entry_number
      FROM pool_picks WHERE league_id = ? AND tournament_id = ? AND user_id = ?
      ORDER BY entry_number ASC
    `).all(league.id, league.pool_tournament_id, member.user_id);

    const entries = entryNumbers.map(({ entry_number }) => {
      const picks = db.prepare(`
        SELECT pp.player_name, pp.tier_number, pp.tiebreaker_score,
               pp.entry_team_name, ptp.odds_display
        FROM pool_picks pp
        LEFT JOIN pool_tier_players ptp ON ptp.league_id = pp.league_id AND ptp.player_id = pp.player_id
        WHERE pp.league_id = ? AND pp.tournament_id = ? AND pp.user_id = ? AND COALESCE(pp.entry_number, 1) = ?
        ORDER BY pp.tier_number ASC
      `).all(league.id, league.pool_tournament_id, member.user_id, entry_number);

      const teamName = entry_number === 1
        ? (db.prepare('SELECT team_name FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?').get(league.id, member.user_id)?.team_name || '')
        : (picks[0]?.entry_team_name || `Entry ${entry_number}`);

      return {
        entryNumber: entry_number,
        teamName,
        tiebreaker: picks[0]?.tiebreaker_score ?? null,
        picks: picks.map(p => ({
          playerName: p.player_name,
          tierNumber: p.tier_number,
          odds: p.odds_display || '',
        })),
      };
    });

    if (entries.length === 0 || entries.every(e => e.picks.length === 0)) continue;

    try {
      await sendPicksLockConfirmation(member.email, {
        username: member.username,
        leagueName: league.name,
        tournamentName: tourn.name,
        entries,
        leagueUrl,
      });

      db.prepare('INSERT OR IGNORE INTO lock_emails_sent (id, league_id, user_id) VALUES (?, ?, ?)')
        .run(uuidv4(), league.id, member.user_id);

      console.log(`[golf-pool-lock] Lock email sent to ${member.username} (${entries.length} entries)`);
    } catch (err) {
      console.error(`[golf-pool-lock] Failed to send lock email to ${member.email}:`, err.message);
    }
  }
}

// Boot repair: recompute picks_lock_time for ANY league whose tournament hasn't
// ended yet. Fixes stale values from a previous getDay()/midnight-UTC bug.
function repairStaleLockTimes() {
  try {
    const leagues = db.prepare(`
      SELECT gl.id, gl.name, gl.picks_locked, gl.picks_lock_time, gt.start_date, gt.end_date
      FROM golf_leagues gl
      JOIN golf_tournaments gt ON gt.id = gl.pool_tournament_id
      WHERE gt.end_date >= date('now')
    `).all();

    for (const league of leagues) {
      const correct = computeLockTime(league.start_date).toISOString();
      const shouldBeLocked = new Date() >= new Date(correct);
      const needsRepair =
        league.picks_lock_time !== correct ||
        !!league.picks_locked !== shouldBeLocked;

      if (needsRepair) {
        db.prepare('UPDATE golf_leagues SET picks_lock_time = ?, picks_locked = ? WHERE id = ?')
          .run(correct, shouldBeLocked ? 1 : 0, league.id);
        console.log(`[golf-pool-lock] Repaired "${league.name}": lock_time ${league.picks_lock_time} → ${correct}, locked: ${!!league.picks_locked} → ${shouldBeLocked}`);
      }
    }
  } catch (err) {
    console.error('[golf-pool-lock] Lock time repair error:', err.message);
  }
}

function startPoolLockScheduler() {
  repairStaleLockTimes();
  checkPoolLocks(); // run immediately on start
  setInterval(checkPoolLocks, 5 * 60 * 1000); // every 5 minutes
  console.log('[golf-pool-lock] Lock scheduler started (5-minute interval)');
}

module.exports = { startPoolLockScheduler, computeLockTime };
