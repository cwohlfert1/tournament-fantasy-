const db = require('./db');

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
      WHERE gl.format_type = 'pool'
        AND gl.picks_locked = 0
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
      }
    }
  } catch (err) {
    console.error('[golf-pool-lock] Error checking locks:', err.message);
  }
}

function startPoolLockScheduler() {
  checkPoolLocks(); // run immediately on start
  setInterval(checkPoolLocks, 5 * 60 * 1000); // every 5 minutes
  console.log('[golf-pool-lock] Lock scheduler started (5-minute interval)');
}

module.exports = { startPoolLockScheduler, computeLockTime };
