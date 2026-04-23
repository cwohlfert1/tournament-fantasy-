const db = require('./db/index');

async function checkHorsesLocks() {
  try {
    const pools = await db.all(
      "SELECT * FROM horses_pools WHERE status = 'open' AND lock_time <= NOW()"
    );

    for (const pool of pools) {
      try {
        console.log(`[horses-lock] Locking pool ${pool.id} (${pool.format_type})`);

        if (pool.format_type === 'random_draw') {
          const { executeRandomDraw } = require('./routes/horses');
          await executeRandomDraw(pool.id);
        } else if (pool.format_type === 'squares') {
          const { assignSquareNumbers } = require('./routes/horses');
          await assignSquareNumbers(pool.id);
          await db.run("UPDATE horses_pools SET status = 'locked' WHERE id = ?", [pool.id]);
        } else if (pool.format_type === 'pick_wps') {
          await db.run("UPDATE horses_pools SET status = 'locked' WHERE id = ?", [pool.id]);
        }

        // Send lock notification emails (non-fatal if email fails)
        try {
          const { sendHorsesLockEmail } = require('./horsesMailer');
          const entries = await db.all(`
            SELECT e.*, u.email FROM horses_entries e
            JOIN users u ON e.user_id = u.id
            WHERE e.pool_id = ?
          `, [pool.id]);
          const event = await db.get('SELECT * FROM horses_events WHERE id = ?', [pool.event_id]);

          let assignments = null;
          if (pool.format_type === 'random_draw') {
            assignments = await db.all(`
              SELECT e.user_id, e.display_name, h.horse_name, h.post_position, h.jockey_name, h.morning_line_odds
              FROM horses_entries e
              JOIN horses_horses h ON e.assigned_horse_id = h.id
              WHERE e.pool_id = ? AND e.assigned_horse_id IS NOT NULL
            `, [pool.id]);
          }

          await sendHorsesLockEmail(entries, pool, event, assignments);
        } catch (emailErr) {
          console.error(`[horses-lock] Email error for pool ${pool.id}:`, emailErr.message);
        }
      } catch (poolErr) {
        console.error(`[horses-lock] Error locking pool ${pool.id}:`, poolErr.message);
      }
    }
  } catch (err) {
    console.error('[horses-lock] Service error:', err.message);
  }
}

function startHorsesLockService() {
  // Run immediately on startup, then every 30s
  checkHorsesLocks();
  setInterval(checkHorsesLocks, 30000);
  console.log('[horses-lock] Service started (30s interval)');
}

module.exports = { startHorsesLockService, checkHorsesLocks };
