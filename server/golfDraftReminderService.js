const db = require('./db/index');

/**
 * Draft Reminder Scheduler
 *
 * Checks every 5 minutes for upcoming snake drafts and sends:
 *   - 24h reminder (type = 'draft_24h')
 *   - 1h reminder  (type = 'draft_1h')
 *
 * Uses the existing `reminder_emails_sent` table with draft-specific types
 * to ensure each member gets each reminder exactly once.
 */

async function checkDraftReminders() {
  try {
    const leagues = await db.all(`
      SELECT gl.*, gt.name AS tournament_name
      FROM golf_leagues gl
      LEFT JOIN golf_tournaments gt ON gt.id = gl.pool_tournament_id
      WHERE gl.format_type = 'draft'
        AND gl.draft_status = 'pending'
        AND gl.draft_start_time IS NOT NULL
    `);

    const now = Date.now();

    for (const league of leagues) {
      const draftTime = new Date(league.draft_start_time).getTime();
      const hoursUntil = (draftTime - now) / 3600000;

      // 24h reminder: between 24h and 23h before draft
      if (hoursUntil > 0 && hoursUntil <= 24) {
        await sendReminders(league, 'draft_24h', 'in 24 hours');
      }

      // 1h reminder: between 1h and 0h before draft
      if (hoursUntil > 0 && hoursUntil <= 1) {
        await sendReminders(league, 'draft_1h', 'in 1 hour');
      }
    }
  } catch (err) {
    console.error('[draft-reminder] Error:', err.message);
  }
}

async function sendReminders(league, type, timeLabel) {
  const { sendDraftReminder } = require('./mailer');
  const { v4: uuidv4 } = require('uuid');

  const members = await db.all(
    'SELECT u.email, u.username, u.id AS user_id FROM golf_league_members glm JOIN users u ON u.id = glm.user_id WHERE glm.golf_league_id = ?',
    league.id
  );

  for (const m of members) {
    const already = await db.get(
      'SELECT 1 FROM reminder_emails_sent WHERE league_id = ? AND user_id = ? AND type = ?',
      league.id, m.user_id, type
    );
    if (already) continue;

    try {
      await sendDraftReminder(m.email, {
        username: m.username,
        leagueName: league.name,
        leagueId: league.id,
        tournamentName: league.tournament_name,
        draftTime: league.draft_start_time,
        timeLabel,
      });
      await db.run(
        'INSERT OR IGNORE INTO reminder_emails_sent (id, league_id, user_id, type) VALUES (?, ?, ?, ?)',
        uuidv4(), league.id, m.user_id, type
      );
      console.log(`[draft-reminder] ${type} sent to ${m.username} for "${league.name}"`);
    } catch (err) {
      console.error(`[draft-reminder] Failed for ${m.email}:`, err.message);
    }
  }
}

function startDraftReminderScheduler() {
  checkDraftReminders();
  setInterval(checkDraftReminders, 5 * 60 * 1000);
  console.log('[draft-reminder] Scheduler started (5-minute interval)');
}

module.exports = { startDraftReminderScheduler };
