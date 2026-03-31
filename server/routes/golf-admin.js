const express = require('express');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const superadmin = require('../middleware/superadmin');
require('../golf-db');
const db = require('../db');

const router = express.Router();

// ── Sandbox bot runner ─────────────────────────────────────────────────────────

const activeBotRunners = new Map(); // leagueId → intervalId

function botMaxBid(salary) {
  if (salary >= 800) return 400;
  if (salary >= 700) return 300;
  if (salary >= 500) return 200;
  return 150;
}

function botAutoNominate(leagueId, session, league) {
  const wonIds = new Set(
    db.prepare("SELECT player_id FROM golf_auction_bids WHERE league_id = ? AND status='won' AND bid_type='auction'")
      .all(leagueId).map(r => r.player_id)
  );
  const player = db.prepare('SELECT * FROM golf_players WHERE is_active = 1 ORDER BY world_ranking ASC NULLS LAST').all()
    .find(p => !wonIds.has(p.id));
  if (!player) return;
  const timerSecs = league.bid_timer_seconds || 10;
  const endsAt = new Date(Date.now() + timerSecs * 1000).toISOString();
  db.prepare('UPDATE golf_auction_sessions SET current_player_id=?, current_high_bid=1, current_high_bidder_id=NULL, nomination_ends_at=? WHERE id=?')
    .run(player.id, endsAt, session.id);
}

function sandboxBotTick(leagueId, botMemberIds) {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(leagueId);
    if (!league || league.draft_status === 'completed') {
      const iv = activeBotRunners.get(leagueId);
      if (iv) { clearInterval(iv); activeBotRunners.delete(leagueId); }
      return;
    }
    const session = db.prepare('SELECT * FROM golf_auction_sessions WHERE league_id = ?').get(leagueId);
    if (!session || session.status !== 'active') return;
    const now = new Date();

    // Timer expired → finalize
    if (session.current_player_id && session.nomination_ends_at && now > new Date(session.nomination_ends_at)) {
      try {
        require('./golf-auction').finalizeNomination(session, league);
      } catch (e) { console.error('[golf-bot] finalize error:', e.message); return; }
      const freshLeague = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(leagueId);
      if (!freshLeague || freshLeague.draft_status === 'completed') return;
      const freshSession = db.prepare('SELECT * FROM golf_auction_sessions WHERE league_id = ?').get(leagueId);
      if (!freshSession) return;
      if (!freshSession.current_player_id && botMemberIds.has(freshSession.current_nomination_member_id)) {
        botAutoNominate(leagueId, freshSession, freshLeague);
      }
      return;
    }

    // Active nomination: eligible bots may bid
    if (session.current_player_id) {
      const player = db.prepare('SELECT salary FROM golf_players WHERE id = ?').get(session.current_player_id);
      if (!player) return;
      const maxBid = botMaxBid(player.salary);
      const currentBid = session.current_high_bid || 1;
      if (currentBid < maxBid && Math.random() < 0.5) {
        const candidates = [...botMemberIds].filter(id => id !== session.current_high_bidder_id);
        if (!candidates.length) return;
        const botId = candidates[Math.floor(Math.random() * candidates.length)];
        const budget = db.prepare('SELECT auction_credits_remaining FROM golf_auction_budgets WHERE league_id = ? AND member_id = ?').get(leagueId, botId);
        const remaining = budget?.auction_credits_remaining ?? (league.auction_budget || 1000);
        const raise = Math.floor(Math.random() * 21) + 5; // $5–$25
        const newBid = Math.min(currentBid + raise, maxBid, remaining);
        if (newBid > currentBid) {
          const timerSecs = league.bid_timer_seconds || 10;
          const newEndsAt = new Date(Date.now() + timerSecs * 1000).toISOString();
          db.prepare('UPDATE golf_auction_sessions SET current_high_bid=?, current_high_bidder_id=?, nomination_ends_at=? WHERE id=?')
            .run(newBid, botId, newEndsAt, session.id);
        }
      }
      return;
    }

    // No active nomination: bot auto-nominates if it's their turn
    if (!session.current_player_id && session.current_nomination_member_id && botMemberIds.has(session.current_nomination_member_id)) {
      botAutoNominate(leagueId, session, league);
    }
  } catch (e) { console.error('[golf-bot] tick error:', e.message); }
}

const BOT_NAMES = ['Bot Birdie', 'Bot Eagle', 'Bot Par', 'Bot Bogey', 'Bot Albatross', 'Bot Condor', 'Bot Ace'];

// All routes require superadmin (auth + role check bundled in middleware)

// ── Leagues ───────────────────────────────────────────────────────────────────

router.get('/admin/leagues', superadmin, (req, res) => {
  try {
    const leagues = db.prepare(`
      SELECT
        gl.*,
        u.username  AS commissioner_name,
        u.email     AS commissioner_email,
        COUNT(DISTINCT glm.id) AS member_count,
        COALESCE((
          SELECT COUNT(*) FROM golf_season_passes gsp
          JOIN golf_league_members m2 ON m2.user_id = gsp.user_id
          WHERE m2.golf_league_id = gl.id AND gsp.season = '2026' AND gsp.paid_at IS NOT NULL
        ), 0) AS season_pass_count,
        COALESCE((
          SELECT COUNT(*) FROM golf_comm_pro gcp
          WHERE gcp.league_id = gl.id AND gcp.season = '2026'
            AND (gcp.paid_at IS NOT NULL OR gcp.promo_applied = 1)
        ), 0) AS comm_pro_paid
      FROM golf_leagues gl
      LEFT JOIN users u ON u.id = gl.commissioner_id
      LEFT JOIN golf_league_members glm ON glm.golf_league_id = gl.id
      GROUP BY gl.id
      ORDER BY gl.created_at DESC
    `).all();

    const withMembers = leagues.map(l => {
      const members = db.prepare(`
        SELECT glm.user_id, glm.team_name, glm.season_points, glm.joined_at,
               u.username, u.email
        FROM golf_league_members glm
        JOIN users u ON u.id = glm.user_id
        WHERE glm.golf_league_id = ?
        ORDER BY glm.season_points DESC
      `).all(l.id);
      return {
        ...l,
        members,
        season_pass_rev:  (l.season_pass_count * 4.99).toFixed(2),
        comm_pro_rev:     (l.comm_pro_paid * 19.99).toFixed(2),
      };
    });

    res.json({ leagues: withMembers });
  } catch (err) {
    console.error('[golf-admin] leagues:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/leagues/:id/archive', superadmin, (req, res) => {
  try {
    db.prepare("UPDATE golf_leagues SET status = 'archived' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/leagues/:id', superadmin, (req, res) => {
  try {
    const id = req.params.id;
    const deleteCascade = db.transaction(() => {
      const childDeletes = [
        'DELETE FROM golf_draft_picks WHERE league_id = ?',
        'DELETE FROM golf_auction_bids WHERE league_id = ?',
        'DELETE FROM golf_auction_sessions WHERE league_id = ?',
        'DELETE FROM golf_auction_budgets WHERE league_id = ?',
        'DELETE FROM golf_faab_bids WHERE golf_league_id = ?',
        'DELETE FROM golf_weekly_lineups WHERE member_id IN (SELECT id FROM golf_league_members WHERE golf_league_id = ?)',
        'DELETE FROM golf_rosters WHERE member_id IN (SELECT id FROM golf_league_members WHERE golf_league_id = ?)',
        'DELETE FROM golf_core_players WHERE member_id IN (SELECT id FROM golf_league_members WHERE golf_league_id = ?)',
        'DELETE FROM golf_comm_pro WHERE league_id = ?',
        'DELETE FROM golf_league_members WHERE golf_league_id = ?',
        'DELETE FROM golf_leagues WHERE id = ?',
      ];
      for (const sql of childDeletes) {
        try { db.prepare(sql).run(id); } catch (_) {} // skip missing tables
      }
    });
    deleteCascade();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/leagues/:id/sync', superadmin, async (req, res) => {
  try {
    // Trigger the existing golf score sync if available
    const syncFn = (() => {
      try { return require('../golf-score-sync'); } catch { return null; }
    })();
    if (syncFn?.syncLeague) {
      await syncFn.syncLeague(req.params.id);
    }
    res.json({ success: true, message: 'Sync triggered' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/leagues/:id/email', superadmin, async (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    const members = db.prepare(`
      SELECT glm.team_name, u.email, u.username, glm.season_points
      FROM golf_league_members glm JOIN users u ON u.id = glm.user_id
      WHERE glm.golf_league_id = ?
    `).all(req.params.id);
    const { sendGolfPaymentConfirmation } = require('../mailer');
    // Send standings update email to each member
    await Promise.all(members.map(m =>
      sendGolfPaymentConfirmation(m.email, m.username, 'standings_update', {
        league_name: league.name,
      }).catch(() => {})
    ));
    res.json({ success: true, sent: members.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Users ─────────────────────────────────────────────────────────────────────

router.get('/admin/users', superadmin, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT
        u.id, u.email, u.username, u.role, u.created_at,
        u.gender, u.dob,
        COALESCE(gup.profile_complete, 0) AS profile_complete,
        COUNT(DISTINCT glm.id) AS league_count,
        COALESCE(sp.paid, 0) AS season_pass_paid
      FROM users u
      LEFT JOIN golf_user_profiles gup ON gup.user_id = u.id
      LEFT JOIN golf_league_members glm ON glm.user_id = u.id
      LEFT JOIN (
        SELECT user_id, 1 AS paid FROM golf_season_passes
        WHERE season = '2026' AND paid_at IS NOT NULL
      ) sp ON sp.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();
    res.json({ users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/users/:id/ban', superadmin, (req, res) => {
  try {
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    const newRole = user.role === 'banned' ? 'user' : 'banned';
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(newRole, req.params.id);
    res.json({ success: true, role: newRole });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/users/:id/reset-password', superadmin, async (req, res) => {
  try {
    const tempPw = Math.random().toString(36).slice(2, 10);
    const hash = await bcrypt.hash(tempPw, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
    res.json({ success: true, tempPassword: tempPw });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/users/:id', superadmin, (req, res) => {
  try {
    db.prepare('DELETE FROM golf_user_profiles WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM golf_referral_credits WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM golf_season_passes WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM golf_league_members WHERE user_id = ?').run(req.params.id);
    // Do NOT delete the users row — it may be shared with basketball leagues
    // Just ban them instead
    db.prepare("UPDATE users SET role = 'banned' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Recovery: restore deleted golf league members ────────────────────────────
// POST /api/golf-admin/admin/leagues/:id/recover-members
// Finds users who:
//   (a) have pool_picks for this league but are NOT in golf_league_members, OR
//   (b) are banned and have a username/email matching known missing names
// Re-adds them to golf_league_members and unbans them.
router.post('/admin/leagues/:id/recover-members', superadmin, (req, res) => {
  try {
    const leagueId = req.params.id;

    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const currentMemberIds = new Set(
      db.prepare('SELECT user_id FROM golf_league_members WHERE golf_league_id = ?')
        .all(leagueId).map(r => r.user_id)
    );

    // Strategy 1: users who have pool_picks for this league but aren't members
    const pickOrphans = db.prepare(`
      SELECT DISTINCT pp.user_id, u.username, u.email, u.role
      FROM pool_picks pp
      JOIN users u ON u.id = pp.user_id
      WHERE pp.league_id = ?
    `).all(leagueId).filter(u => !currentMemberIds.has(u.user_id));

    // Strategy 2: recently banned users matching known missing names
    const nameHints = ['max', 'cady', 'drew', 'bartlett', 'jon', 'wohlfert'];
    const bannedCandidates = db.prepare(`
      SELECT id AS user_id, username, email, role
      FROM users
      WHERE role = 'banned'
      AND (${nameHints.map(() => "lower(username) LIKE ?").join(' OR ')})
    `).all(...nameHints.map(n => `%${n}%`))
      .filter(u => !currentMemberIds.has(u.user_id));

    // Deduplicate
    const toRestore = new Map();
    for (const u of [...pickOrphans, ...bannedCandidates]) {
      toRestore.set(u.user_id, u);
    }

    const restored = [];
    const restore = db.transaction(() => {
      for (const [userId, u] of toRestore) {
        // Unban if banned
        if (u.role === 'banned') {
          db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(userId);
        }
        // Re-add to golf_league_members
        const existingMember = db.prepare(
          'SELECT id FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?'
        ).get(leagueId, userId);
        if (!existingMember) {
          db.prepare(`
            INSERT INTO golf_league_members (id, golf_league_id, user_id, team_name, joined_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run(uuidv4(), leagueId, userId, u.username);
        }
        restored.push({ user_id: userId, username: u.username, email: u.email, was_banned: u.role === 'banned' });
      }
    });
    restore();

    // Also list all current members + diagnostic info for the response
    const allMembers = db.prepare(`
      SELECT glm.user_id, glm.team_name, glm.joined_at, u.username, u.email, u.role
      FROM golf_league_members glm
      JOIN users u ON u.id = glm.user_id
      WHERE glm.golf_league_id = ?
      ORDER BY glm.joined_at
    `).all(leagueId);

    // All users with pool_picks for forensics
    const allPickUsers = db.prepare(`
      SELECT DISTINCT pp.user_id, u.username, u.email, COUNT(*) as picks
      FROM pool_picks pp
      LEFT JOIN users u ON u.id = pp.user_id
      WHERE pp.league_id = ?
      GROUP BY pp.user_id
    `).all(leagueId);

    console.log(`[recovery] league ${leagueId}: restored ${restored.length} members`);
    res.json({
      restored,
      current_members: allMembers,
      pool_pick_users: allPickUsers,
      invite_code: league.invite_code,
    });
  } catch (err) {
    console.error('[recovery] error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Players ───────────────────────────────────────────────────────────────────

router.get('/admin/players', superadmin, (req, res) => {
  try {
    const players = db.prepare(`
      SELECT gp.*,
        COALESCE(SUM(gs.fantasy_points), 0) AS season_pts
      FROM golf_players gp
      LEFT JOIN golf_scores gs ON gs.player_id = gp.id
      GROUP BY gp.id
      ORDER BY gp.world_ranking ASC NULLS LAST
    `).all();
    res.json({ players });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/admin/players/:id', superadmin, (req, res) => {
  try {
    const { name, salary, world_ranking, is_active, status, country } = req.body;
    db.prepare(`
      UPDATE golf_players SET
        name = COALESCE(?, name),
        salary = COALESCE(?, salary),
        world_ranking = COALESCE(?, world_ranking),
        is_active = COALESCE(?, is_active),
        country = COALESCE(?, country)
      WHERE id = ?
    `).run(name ?? null, salary ?? null, world_ranking ?? null,
           is_active ?? null, country ?? null, req.params.id);
    const updated = db.prepare('SELECT * FROM golf_players WHERE id = ?').get(req.params.id);
    res.json({ player: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/players', superadmin, (req, res) => {
  try {
    const { name, country = 'USA', world_ranking, salary = 200, is_active = 1 } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const id = uuidv4();
    db.prepare(`
      INSERT INTO golf_players (id, name, country, world_ranking, salary, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, country, world_ranking || null, salary, is_active);
    res.json({ player: db.prepare('SELECT * FROM golf_players WHERE id = ?').get(id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/players/:id', superadmin, (req, res) => {
  try {
    db.prepare("UPDATE golf_players SET is_active = 0 WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Financials ────────────────────────────────────────────────────────────────

router.get('/admin/financials', superadmin, (req, res) => {
  try {
    const seasonPassCount = db.prepare(
      "SELECT COUNT(*) as n, COUNT(*) * 4.99 as rev FROM golf_season_passes WHERE paid_at IS NOT NULL"
    ).get();
    const poolEntryCount = db.prepare(
      "SELECT COUNT(*) as n, COUNT(*) * 0.99 as rev FROM golf_pool_entries WHERE paid_at IS NOT NULL"
    ).get();
    const commProCount = db.prepare(
      "SELECT COUNT(*) as n, SUM(CASE WHEN paid_at IS NOT NULL THEN 19.99 ELSE 0 END) as rev FROM golf_comm_pro WHERE paid_at IS NOT NULL OR promo_applied = 1"
    ).get();
    const promoCount = db.prepare(
      "SELECT COUNT(*) as n FROM golf_comm_pro WHERE promo_applied = 1"
    ).get();

    const totalRev = (seasonPassCount.rev || 0) + (poolEntryCount.rev || 0) + (commProCount.rev || 0);

    const activeLeagues = db.prepare(
      "SELECT COUNT(*) as n FROM golf_leagues WHERE status != 'archived'"
    ).get().n;
    const totalUsers = db.prepare(
      "SELECT COUNT(DISTINCT user_id) as n FROM golf_league_members"
    ).get().n;

    const referralCredits = db.prepare(
      "SELECT COALESCE(SUM(credit_amount), 0) as total FROM golf_referral_redemptions"
    ).get().total;

    // Revenue by format
    const revenueByFormat = db.prepare(`
      SELECT
        COALESCE(gl.format_type, 'tourneyrun') AS format,
        COUNT(DISTINCT gl.id) AS leagues,
        COUNT(DISTINCT glm.user_id) AS players
      FROM golf_leagues gl
      LEFT JOIN golf_league_members glm ON glm.golf_league_id = gl.id
      GROUP BY gl.format_type
    `).all();

    // Recent payments
    const recentPayments = [
      ...db.prepare(`
        SELECT u.username, 'Season Pass' AS product, 4.99 AS amount,
               NULL AS league_name, gsp.paid_at
        FROM golf_season_passes gsp JOIN users u ON u.id = gsp.user_id
        WHERE gsp.paid_at IS NOT NULL ORDER BY gsp.paid_at DESC LIMIT 20
      `).all(),
      ...db.prepare(`
        SELECT u.username, 'Office Pool Entry' AS product, 0.99 AS amount,
               gt.name AS league_name, gpe.paid_at
        FROM golf_pool_entries gpe
        JOIN users u ON u.id = gpe.user_id
        LEFT JOIN golf_tournaments gt ON gt.id = gpe.tournament_id
        WHERE gpe.paid_at IS NOT NULL ORDER BY gpe.paid_at DESC LIMIT 20
      `).all(),
      ...db.prepare(`
        SELECT u.username, 'Commissioner Pro' AS product, 19.99 AS amount,
               gl.name AS league_name, gcp.paid_at
        FROM golf_comm_pro gcp
        JOIN users u ON u.id = gcp.commissioner_id
        JOIN golf_leagues gl ON gl.id = gcp.league_id
        WHERE gcp.paid_at IS NOT NULL ORDER BY gcp.paid_at DESC LIMIT 20
      `).all(),
    ].sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at)).slice(0, 30);

    // Top referrers
    const topReferrers = db.prepare(`
      SELECT u.username,
             COUNT(*) AS referral_count,
             SUM(grd.credit_amount) AS credits_earned
      FROM golf_referral_redemptions grd
      JOIN users u ON u.id = grd.referrer_id
      GROUP BY grd.referrer_id
      ORDER BY referral_count DESC
      LIMIT 10
    `).all();

    const referralCodesIssued = db.prepare('SELECT COUNT(*) as n FROM golf_referral_codes').get().n;
    const referralRedemptions = db.prepare('SELECT COUNT(*) as n FROM golf_referral_redemptions').get().n;
    const creditsUsed = db.prepare(
      "SELECT COALESCE(SUM(CASE WHEN balance < 1 THEN 1 ELSE 0 END), 0) as n FROM golf_referral_credits"
    ).get().n;

    res.json({
      summary: {
        totalRev: totalRev.toFixed(2),
        seasonPassRev:  (seasonPassCount.rev || 0).toFixed(2),
        poolEntryRev:   (poolEntryCount.rev || 0).toFixed(2),
        commProRev:     (commProCount.rev || 0).toFixed(2),
        seasonPassCount: seasonPassCount.n,
        poolEntryCount:  poolEntryCount.n,
        commProCount:    commProCount.n,
        promoCount:      promoCount.n,
        activeLeagues,
        totalUsers,
        referralCredits: (referralCredits || 0).toFixed(2),
      },
      revenueByFormat,
      recentPayments,
      referralStats: {
        codesIssued: referralCodesIssued,
        redemptions: referralRedemptions,
        creditsEarned: (referralCredits || 0).toFixed(2),
        creditsUsed,
        topReferrers,
      },
    });
  } catch (err) {
    console.error('[golf-admin] financials:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Promo / Ambassador Codes ──────────────────────────────────────────────────

router.get('/admin/promo-codes', superadmin, (req, res) => {
  try {
    const codes = db.prepare(`
      SELECT pc.*,
        (SELECT COUNT(*) FROM promo_code_uses WHERE promo_code_id = pc.id) AS uses_count_live,
        (SELECT COUNT(*) FROM promo_code_uses
         WHERE promo_code_id = pc.id
           AND strftime('%Y-%m', used_at) = strftime('%Y-%m', 'now')) AS uses_this_month
      FROM promo_codes pc
      ORDER BY pc.created_at DESC
    `).all();
    const now = new Date();
    const monthStats = {
      activeCodes: codes.filter(c => c.active).length,
      usesThisMonth: codes.reduce((s, c) => s + (c.uses_this_month || 0), 0),
      discountsGiven: db.prepare(
        "SELECT COALESCE(SUM(discount_amount),0) as n FROM promo_code_uses"
      ).get().n,
    };
    res.json({ codes, monthStats });
  } catch (err) {
    console.error('[golf-admin] promo-codes list:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/promo-codes', superadmin, (req, res) => {
  try {
    const { code, ambassador_name, ambassador_email, discount_type, discount_value, active } = req.body;
    if (!code || !discount_type) return res.status(400).json({ error: 'code and discount_type required' });
    const validTypes = ['percent', 'free'];
    if (!validTypes.includes(discount_type)) return res.status(400).json({ error: 'Invalid discount_type' });
    const id = uuidv4();
    db.prepare(`
      INSERT INTO promo_codes (id, code, ambassador_name, ambassador_email, discount_type, discount_value, active)
      VALUES (?, UPPER(?), ?, ?, ?, ?, ?)
    `).run(id, code.trim(), ambassador_name || '', ambassador_email || '',
      discount_type, parseFloat(discount_value) || 100, active !== false ? 1 : 0);
    res.status(201).json({ code: db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(id) });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Code already exists' });
    console.error('[golf-admin] promo-codes create:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/admin/promo-codes/:id', superadmin, (req, res) => {
  try {
    const { ambassador_name, ambassador_email, discount_type, discount_value, active } = req.body;
    const promo = db.prepare('SELECT id FROM promo_codes WHERE id = ?').get(req.params.id);
    if (!promo) return res.status(404).json({ error: 'Not found' });
    const fields = [];
    const vals = [];
    if (ambassador_name  !== undefined) { fields.push('ambassador_name = ?');  vals.push(ambassador_name); }
    if (ambassador_email !== undefined) { fields.push('ambassador_email = ?'); vals.push(ambassador_email); }
    if (discount_type    !== undefined) { fields.push('discount_type = ?');    vals.push(discount_type); }
    if (discount_value   !== undefined) { fields.push('discount_value = ?');   vals.push(parseFloat(discount_value)); }
    if (active           !== undefined) { fields.push('active = ?');           vals.push(active ? 1 : 0); }
    if (fields.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id);
    db.prepare(`UPDATE promo_codes SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    res.json({ code: db.prepare('SELECT * FROM promo_codes WHERE id = ?').get(req.params.id) });
  } catch (err) {
    console.error('[golf-admin] promo-codes patch:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/promo-codes/:id', superadmin, (req, res) => {
  try {
    db.prepare('DELETE FROM promo_code_uses WHERE promo_code_id = ?').run(req.params.id);
    db.prepare('DELETE FROM promo_codes WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[golf-admin] promo-codes delete:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/promo-codes/:id/uses', superadmin, (req, res) => {
  try {
    const uses = db.prepare(`
      SELECT pcu.*, u.username, u.email,
             gl.name AS league_name
      FROM promo_code_uses pcu
      LEFT JOIN users u ON u.id = pcu.user_id
      LEFT JOIN golf_leagues gl ON gl.id = pcu.league_id
      WHERE pcu.promo_code_id = ?
      ORDER BY pcu.used_at DESC
    `).all(req.params.id);
    res.json({ uses });
  } catch (err) {
    console.error('[golf-admin] promo-codes uses:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/promo-codes/:id/qr', superadmin, async (req, res) => {
  try {
    const promo = db.prepare('SELECT code FROM promo_codes WHERE id = ?').get(req.params.id);
    if (!promo) return res.status(404).json({ error: 'Not found' });
    const baseUrl = process.env.CLIENT_URL
      ? process.env.CLIENT_URL.replace(/\/$/, '')
      : 'https://www.tourneyrun.app';
    const url = `${baseUrl}/golf/create?promo=${encodeURIComponent(promo.code)}`;
    const QRCode = require('qrcode');
    const png = await QRCode.toBuffer(url, {
      type: 'png', width: 400,
      color: { dark: '#000000', light: '#ffffff' },
      margin: 2,
    });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    console.error('[golf-admin] promo-codes qr:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Analytics ─────────────────────────────────────────────────────────────────

router.get('/admin/analytics', superadmin, (req, res) => {
  try {
    // Gender breakdown
    const genderData = db.prepare(`
      SELECT
        COALESCE(u.gender, 'not_provided') AS gender,
        COUNT(*) AS count
      FROM users u
      WHERE u.id IN (SELECT DISTINCT user_id FROM golf_league_members)
      GROUP BY u.gender
    `).all();

    // Age distribution (from dob)
    const ageRaw = db.prepare(`
      SELECT u.dob FROM users u
      WHERE u.dob IS NOT NULL
        AND u.id IN (SELECT DISTINCT user_id FROM golf_league_members)
    `).all();

    const ageBuckets = { '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 };
    const now = new Date();
    for (const { dob } of ageRaw) {
      const age = Math.floor((now - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
      if (age >= 18 && age <= 24)       ageBuckets['18-24']++;
      else if (age >= 25 && age <= 34)  ageBuckets['25-34']++;
      else if (age >= 35 && age <= 44)  ageBuckets['35-44']++;
      else if (age >= 45 && age <= 54)  ageBuckets['45-54']++;
      else if (age >= 55)               ageBuckets['55+']++;
    }

    // Signups per week (last 12 weeks) — golf users only
    const signupsPerWeek = db.prepare(`
      SELECT
        strftime('%Y-W%W', u.created_at) AS week,
        COUNT(*) AS count
      FROM users u
      WHERE u.id IN (SELECT DISTINCT user_id FROM golf_league_members)
        AND u.created_at >= date('now', '-84 days')
      GROUP BY week
      ORDER BY week ASC
    `).all();

    // Office pool entries per tournament
    const poolByTournament = db.prepare(`
      SELECT gt.name, COUNT(*) AS entries
      FROM golf_pool_entries gpe
      LEFT JOIN golf_tournaments gt ON gt.id = gpe.tournament_id
      WHERE gpe.paid_at IS NOT NULL
      GROUP BY gpe.tournament_id
      ORDER BY entries DESC
      LIMIT 10
    `).all();

    // Average league size
    const avgLeagueSize = db.prepare(`
      SELECT AVG(cnt) AS avg FROM (
        SELECT COUNT(*) AS cnt FROM golf_league_members GROUP BY golf_league_id
      )
    `).get().avg;

    // Average FAAB spend
    const avgFaab = db.prepare(`
      SELECT AVG(2400 - COALESCE(season_budget, 2400)) AS avg
      FROM golf_league_members
      WHERE season_budget < 2400
    `).get().avg;

    res.json({
      genderData,
      ageDistribution: Object.entries(ageBuckets).map(([range, count]) => ({ range, count })),
      signupsPerWeek,
      poolByTournament,
      metrics: {
        avgLeagueSize: avgLeagueSize ? avgLeagueSize.toFixed(1) : null,
        avgFaabSpend:  avgFaab ? avgFaab.toFixed(0) : null,
      },
    });
  } catch (err) {
    console.error('[golf-admin] analytics:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Dev Tools ─────────────────────────────────────────────────────────────────

router.post('/admin/dev/sync/:tournamentId', superadmin, async (req, res) => {
  try {
    const tournId = req.params.tournamentId;
    const tourn = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tournId);
    if (!tourn) return res.status(404).json({ error: 'Tournament not found' });
    // Attempt to call existing sync module
    try {
      const sync = require('../golf-score-sync');
      if (sync?.syncTournament) await sync.syncTournament(tournId);
    } catch {}
    db.prepare("UPDATE golf_tournaments SET status = 'active' WHERE id = ?").run(tournId);
    res.json({ success: true, tournament: tourn.name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/dev/test-email', superadmin, async (req, res) => {
  try {
    const user = db.prepare('SELECT email, username FROM users WHERE id = ?').get(req.user.id);
    const { sendGolfPaymentConfirmation } = require('../mailer');
    await sendGolfPaymentConfirmation(user.email, user.username, 'golf_season_pass', {
      season: '2026',
    });
    res.json({ success: true, sentTo: user.email });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/dev/db-health', superadmin, (req, res) => {
  try {
    const tables = [
      'golf_leagues', 'golf_league_members', 'golf_players',
      'golf_tournaments', 'golf_scores', 'golf_rosters',
      'pool_tier_players', 'pool_picks',
      'golf_season_passes', 'golf_pool_entries', 'golf_comm_pro',
      'golf_referral_codes', 'golf_referral_credits',
    ];
    const counts = {};
    for (const t of tables) {
      try {
        counts[t] = db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get().n;
      } catch {
        counts[t] = 'N/A';
      }
    }
    const lastSync = db.prepare(
      "SELECT MAX(updated_at) as t FROM golf_scores"
    ).get()?.t || null;
    res.json({ counts, lastSync, uptime: process.uptime() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /admin/dev/sync-pool-tiers ──────────────────────────────────────────
// Re-assign pool_tier_players for one or all pool leagues.
// Accepts optional body.league_id; if omitted, runs for all pool leagues
// that have pool_tournament_id set.

router.post('/admin/dev/sync-pool-tiers', superadmin, (req, res) => {
  try {
    const filter = req.body.league_id
      ? 'AND id = ?'
      : '';
    const args = req.body.league_id ? [req.body.league_id] : [];
    const leagues = db.prepare(
      `SELECT * FROM golf_leagues WHERE format_type = 'pool' AND pool_tournament_id IS NOT NULL AND status != 'archived' ${filter}`
    ).all(...args);

    if (!leagues.length) return res.status(404).json({ error: 'No matching pool leagues with tournament assigned' });

    const insPlayer = db.prepare(`
      INSERT OR REPLACE INTO pool_tier_players
        (id, league_id, tournament_id, player_id, player_name, tier_number,
         odds_display, odds_decimal, world_ranking, salary, manually_overridden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `);

    const results = [];
    for (const league of leagues) {
      const tid = league.pool_tournament_id;

      let tiersConfig = [];
      try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}
      if (!tiersConfig.length) {
        results.push({ league: league.name, skipped: 'no tier config' });
        continue;
      }

      // Clear non-manually-overridden rows so we get a clean re-assign
      db.prepare('DELETE FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND manually_overridden = 0')
        .run(league.id, tid);

      // Use tournament-specific field if available, otherwise all active players
      const fieldCount = db.prepare('SELECT COUNT(*) as cnt FROM golf_tournament_fields WHERE tournament_id = ?').get(tid).cnt;
      const players = fieldCount > 0
        ? db.prepare(`
            SELECT gp.* FROM golf_players gp
            INNER JOIN golf_tournament_fields tf ON tf.player_id = gp.id AND tf.tournament_id = ?
            ORDER BY gp.world_ranking ASC
          `).all(tid)
        : db.prepare('SELECT * FROM golf_players WHERE is_active = 1 ORDER BY world_ranking ASC').all();
      let count = 0;

      db.transaction(() => {
        for (const p of players) {
          const gen = (!p.odds_display || !p.odds_decimal) ? _rankToOdds(p.world_ranking) : null;
          const odds_display = p.odds_display || gen.odds_display;
          const odds_decimal = p.odds_decimal || gen.odds_decimal;
          // Pick tier using league's own tier config
          const dec = odds_decimal || 999;
          let tierNum = tiersConfig[tiersConfig.length - 1]?.tier || 1;
          for (const t of tiersConfig) {
            if (dec >= _oddsToDecimal(t.odds_min) && dec <= _oddsToDecimal(t.odds_max)) { tierNum = t.tier; break; }
          }
          insPlayer.run(uuidv4(), league.id, tid, p.id, p.name, tierNum, odds_display, odds_decimal, p.world_ranking);
          count++;
        }
      })();

      results.push({ league: league.name, tournament_id: tid, players_assigned: count });
    }

    res.json({ ok: true, results });
  } catch (err) {
    console.error('[admin] sync-pool-tiers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /admin/dev/sync-espn-field ──────────────────────────────────────────
// Fetches the official entry list from ESPN for a tournament, stores it in
// golf_tournament_fields, and rebuilds pool_tier_players for any pool leagues
// pointing at that tournament.
// Body: { tournament_id } (required)

router.post('/admin/dev/sync-espn-field', superadmin, async (req, res) => {
  const https = require('https');
  function espnFetch(url) {
    return new Promise((resolve) => {
      https.get(url, resp => {
        let body = '';
        resp.on('data', chunk => body += chunk);
        resp.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(null); } });
      }).on('error', () => resolve(null));
    });
  }

  try {
    const { tournament_id } = req.body;
    if (!tournament_id) return res.status(400).json({ error: 'tournament_id required' });

    const tourn = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tournament_id);
    if (!tourn) return res.status(404).json({ error: 'Tournament not found' });
    if (!tourn.espn_event_id) return res.status(400).json({ error: 'Tournament has no espn_event_id' });

    const eid = tourn.espn_event_id;

    // ── Step 1: Fetch ESPN scoreboard for entry list ──────────────────────────
    const espnData = await espnFetch(`https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${eid}`);
    const events = espnData?.events || [];
    if (!events.length) return res.status(502).json({ error: 'No events returned from ESPN' });

    const competitors = (events[0].competitions || []).flatMap(c => c.competitors || []);
    if (!competitors.length) return res.status(502).json({ error: 'No competitors found in ESPN response' });

    // Build espnId → American odds map from scoreboard (sometimes included)
    const scoreboardOdds = {};
    for (const c of competitors) {
      if (c.athlete?.id && c.moneyLine != null) {
        scoreboardOdds[String(c.athlete.id)] = c.moneyLine;
      }
    }

    // ── Step 2: Fetch ESPN odds endpoint for sportsbook odds ──────────────────
    let oddsMap = {}; // espn player id → { odds_display, odds_decimal }
    const nameOddsMap = {}; // full name (lowercase) → odds
    const lastNameOddsMap = {}; // last name (lowercase) → odds  (unique last names only)
    const lastNameCount = {}; // track ambiguity
    try {
      const oddsData = await espnFetch(
        `https://sports.core.api.espn.com/v2/sports/golf/leagues/pga/events/${eid}/competitions/${eid}/odds`
      );
      const items = oddsData?.items || [];
      // Find item with futures (player-level odds)
      for (const item of items) {
        const futures = item.futures || [];
        if (!futures.length) continue;
        for (const f of futures) {
          const espnPlayerId = String(f.athlete?.id || '');
          const american = parseInt(f.value || f.current?.moneyLine || 0);
          if (american <= 0) continue;
          // Convert American odds (+1500) to display ("15:1") and decimal (16.0)
          const ratio = american / 100;
          const nice = ratio < 5   ? Math.round(ratio * 4) / 4 :
                       ratio < 20  ? Math.round(ratio * 2) / 2 :
                       ratio < 100 ? Math.round(ratio / 5) * 5 :
                                     Math.round(ratio / 25) * 25;
          const oddsObj = { odds_display: `${nice}:1`, odds_decimal: nice + 1 };
          if (espnPlayerId) oddsMap[espnPlayerId] = oddsObj;
          // Build name-based fallback maps
          const fName = (f.athlete?.displayName || f.athlete?.fullName || '').toLowerCase().trim();
          if (fName) {
            nameOddsMap[fName] = oddsObj;
            const lastName = fName.split(' ').pop();
            lastNameCount[lastName] = (lastNameCount[lastName] || 0) + 1;
            lastNameOddsMap[lastName] = lastNameCount[lastName] === 1 ? oddsObj : null; // null = ambiguous
          }
        }
        break; // use first provider with futures
      }
    } catch (oddsErr) {
      console.warn('[admin] ESPN odds fetch non-fatal:', oddsErr.message);
    }

    // Also merge scoreboard odds for any not already in oddsMap
    for (const [espnId, american] of Object.entries(scoreboardOdds)) {
      if (!oddsMap[espnId] && american > 0) {
        const ratio = american / 100;
        const nice = ratio < 5   ? Math.round(ratio * 4) / 4 :
                     ratio < 20  ? Math.round(ratio * 2) / 2 :
                     ratio < 100 ? Math.round(ratio / 5) * 5 :
                                   Math.round(ratio / 25) * 25;
        oddsMap[espnId] = { odds_display: `${nice}:1`, odds_decimal: nice + 1 };
      }
    }

    // ── Step 3: Upsert golf_tournament_fields + golf_players ──────────────────
    const _getGP = db.prepare('SELECT * FROM golf_players WHERE name = ? LIMIT 1');
    const _insGP = db.prepare('INSERT OR IGNORE INTO golf_players (id, name, country, is_active, world_ranking) VALUES (?, ?, ?, 1, ?)');
    const _insTF = db.prepare(`
      INSERT OR REPLACE INTO golf_tournament_fields
        (id, tournament_id, player_name, player_id, espn_player_id, world_ranking, odds_display, odds_decimal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const _updGP = db.prepare('UPDATE golf_players SET odds_display = ?, odds_decimal = ? WHERE id = ?');
    const _updGPCountry = db.prepare('UPDATE golf_players SET country = ? WHERE id = ? AND (country IS NULL OR length(country) != 2)');

    db.prepare('DELETE FROM golf_tournament_fields WHERE tournament_id = ?').run(tournament_id);

    const fieldPlayers = [];
    db.transaction(() => {
      for (const c of competitors) {
        const name    = c.athlete?.displayName || c.athlete?.fullName;
        const espnId  = String(c.athlete?.id || '');
        const ranking = c.athlete?.ranking ? parseInt(c.athlete.ranking) : null;
        const country = c.athlete?.flag?.alt || c.athlete?.country || null;
        if (!name) continue;

        let gp = _getGP.get(name);
        if (!gp) {
          _insGP.run(uuidv4(), name, country, 1, ranking || 200);
          gp = _getGP.get(name);
        }
        if (!gp) continue;

        // Update country if we have it and the stored value isn't already a 2-letter code
        if (country) _updGPCountry.run(country, gp.id);

        // Try ESPN ID, then full name, then unique last name
        const nameLower = name.toLowerCase();
        const lastName  = nameLower.split(' ').pop();
        const playerOdds = oddsMap[espnId]
          || nameOddsMap[nameLower]
          || lastNameOddsMap[lastName]   // null if last name is ambiguous
          || null;
        _insTF.run(
          uuidv4(), tournament_id, name, gp.id, espnId,
          ranking || gp.world_ranking || 200,
          playerOdds?.odds_display || null,
          playerOdds?.odds_decimal || null
        );
        // Update global player record with current-week odds if available
        if (playerOdds) _updGP.run(playerOdds.odds_display, playerOdds.odds_decimal, gp.id);

        fieldPlayers.push({ name, espnId, world_ranking: ranking || gp.world_ranking, ...playerOdds });
      }
    })();

    // ── Step 4: Rebuild pool_tier_players (now with updated odds) ─────────────
    const affectedLeagues = db.prepare(
      "SELECT * FROM golf_leagues WHERE format_type = 'pool' AND pool_tournament_id = ? AND status != 'archived'"
    ).all(tournament_id);

    const rebuildResults = [];
    for (const league of affectedLeagues) {
      let tiersConfig = [];
      try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}
      if (!tiersConfig.length) { rebuildResults.push({ league: league.name, skipped: 'no tier config' }); continue; }

      const insTP = db.prepare(`
        INSERT OR REPLACE INTO pool_tier_players
          (id, league_id, tournament_id, player_id, player_name, tier_number,
           odds_display, odds_decimal, world_ranking, salary, manually_overridden)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
      `);

      db.prepare('DELETE FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND manually_overridden = 0')
        .run(league.id, tournament_id);

      const allTF = db.prepare(`
        SELECT gp.*, tf.odds_display AS tf_od, tf.odds_decimal AS tf_dec
        FROM golf_players gp
        INNER JOIN golf_tournament_fields tf ON tf.player_id = gp.id AND tf.tournament_id = ?
        ORDER BY COALESCE(tf.odds_decimal, gp.odds_decimal, 999) ASC
      `).all(tournament_id);

      let count = 0;
      db.transaction(() => {
        for (const p of allTF) {
          const gen = (!p.tf_od && !p.odds_display) ? _rankToOdds(p.world_ranking || 200) : null;
          const odds_display = p.tf_od  || p.odds_display  || gen.odds_display;
          const odds_decimal = p.tf_dec || p.odds_decimal  || gen.odds_decimal;
          let tierNum = tiersConfig[tiersConfig.length - 1]?.tier || 1;
          for (const t of tiersConfig) {
            if (odds_decimal >= _oddsToDecimal(t.odds_min) && odds_decimal <= _oddsToDecimal(t.odds_max)) { tierNum = t.tier; break; }
          }
          insTP.run(uuidv4(), league.id, tournament_id, p.id, p.name, tierNum, odds_display, odds_decimal, p.world_ranking || null);
          count++;
        }
      })();

      rebuildResults.push({ league: league.name, players_assigned: count });
    }

    const oddsCount = Object.keys(oddsMap).length;
    res.json({ ok: true, tournament: tourn.name, espn_event_id: eid, field_size: fieldPlayers.length, odds_fetched: oddsCount, leagues_rebuilt: rebuildResults });
  } catch (err) {
    console.error('[admin] sync-espn-field error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/sandbox/auction-draft', superadmin, (req, res) => {
  try {
    const admin = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    // Ensure bot users exist
    const BOT_HASH = bcrypt.hashSync('botpass_sandbox', 4);
    const botUserIds = BOT_NAMES.map(botName => {
      let row = db.prepare('SELECT id FROM users WHERE username = ?').get(botName);
      if (!row) {
        const botId = uuidv4();
        const botEmail = botName.toLowerCase().replace(/\s+/g, '.') + '@sandbox.internal';
        db.prepare('INSERT OR IGNORE INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)').run(botId, botName, botEmail, BOT_HASH, 'user');
        row = { id: botId };
      }
      return row.id;
    });

    const leagueId = uuidv4();
    const inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    const leagueName = `[SANDBOX] Auction ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

    db.prepare(`
      INSERT INTO golf_leagues
        (id, name, commissioner_id, invite_code, status, format_type, draft_status, is_sandbox, bid_timer_seconds, auction_budget, roster_size, core_spots)
      VALUES (?, ?, ?, ?, 'lobby', 'tourneyrun', 'pending', 1, 10, 1000, 8, 4)
    `).run(leagueId, leagueName, admin.id, inviteCode);

    // Add admin + 7 bots as members
    db.prepare('INSERT INTO golf_league_members (id, golf_league_id, user_id, team_name, season_budget) VALUES (?, ?, ?, ?, 2400)')
      .run(uuidv4(), leagueId, admin.id, admin.username || 'Admin');

    for (let i = 0; i < BOT_NAMES.length; i++) {
      db.prepare('INSERT OR IGNORE INTO golf_league_members (id, golf_league_id, user_id, team_name, season_budget) VALUES (?, ?, ?, ?, 2400)')
        .run(uuidv4(), leagueId, botUserIds[i], BOT_NAMES[i]);
    }

    // Start the auction immediately
    const allMembers = db.prepare('SELECT * FROM golf_league_members WHERE golf_league_id = ?').all(leagueId);
    const shuffled = [...allMembers].sort(() => Math.random() - 0.5);

    db.transaction(() => {
      shuffled.forEach((m, i) => {
        db.prepare('UPDATE golf_league_members SET draft_order = ? WHERE id = ?').run(i + 1, m.id);
        db.prepare('INSERT OR IGNORE INTO golf_auction_budgets (id, league_id, member_id, auction_credits_remaining, faab_credits_remaining) VALUES (?, ?, ?, 1000, 100)')
          .run(uuidv4(), leagueId, m.id);
      });
      const nominationOrder = JSON.stringify(shuffled.map(m => m.id));
      db.prepare("INSERT INTO golf_auction_sessions (id, league_id, status, current_nomination_member_id, nomination_order, nomination_index) VALUES (?, ?, 'active', ?, ?, 0)")
        .run(uuidv4(), leagueId, shuffled[0].id, nominationOrder);
      db.prepare("UPDATE golf_leagues SET draft_status='active', status='drafting' WHERE id=?").run(leagueId);
    })();

    // Identify bot member IDs and start bot runner
    const botUserIdSet = new Set(botUserIds);
    const botMemberIds = new Set(allMembers.filter(m => botUserIdSet.has(m.user_id)).map(m => m.id));

    // Start the bot runner
    if (!activeBotRunners.has(leagueId)) {
      const iv = setInterval(() => sandboxBotTick(leagueId, botMemberIds), 3000);
      activeBotRunners.set(leagueId, iv);
    }

    // If the first nominator is a bot, nominate immediately
    const firstSession = db.prepare('SELECT * FROM golf_auction_sessions WHERE league_id = ?').get(leagueId);
    const firstLeague  = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(leagueId);
    if (firstSession && botMemberIds.has(firstSession.current_nomination_member_id)) {
      botAutoNominate(leagueId, firstSession, firstLeague);
    }

    res.json({ success: true, leagueId, url: `/golf/league/${leagueId}/auction` });
  } catch (err) {
    console.error('[golf-admin] sandbox auction-draft error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/dev/sandbox', superadmin, async (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const leagueId = uuidv4();
    const inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    db.prepare(`
      INSERT INTO golf_leagues (id, name, commissioner_id, invite_code, status, format_type, draft_status)
      VALUES (?, ?, ?, ?, 'lobby', 'tourneyrun', 'pending')
    `).run(leagueId, `[SANDBOX] ${user.username} Auction Test`, user.id, inviteCode);
    const memberId = uuidv4();
    db.prepare(`
      INSERT INTO golf_league_members (id, golf_league_id, user_id, team_name, season_budget)
      VALUES (?, ?, ?, ?, 2400)
    `).run(memberId, leagueId, user.id, user.username);
    // Add bot members
    const bots = ['Bot Alpha', 'Bot Beta', 'Bot Gamma', 'Bot Delta', 'Bot Epsilon', 'Bot Zeta', 'Bot Theta'];
    for (const botName of bots) {
      const botUserId = db.prepare('SELECT id FROM users WHERE username = ?').get(botName)?.id;
      if (botUserId) {
        db.prepare(`
          INSERT OR IGNORE INTO golf_league_members (id, golf_league_id, user_id, team_name, season_budget)
          VALUES (?, ?, ?, ?, 2400)
        `).run(uuidv4(), leagueId, botUserId, botName);
      }
    }
    res.json({ success: true, leagueId, inviteCode, url: `/golf/league/${leagueId}/auction` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Dev: Create Valspar Test Pool ─────────────────────────────────────────────

const VALSPAR_LEAGUE_ID = '68b1e250-6afc-4e80-ad7b-d8a22ae3ad7d';

const VALSPAR_TIERS = [
  { tier: 1, odds_min: '8:1',   odds_max: '33:1',   picks: 2 },
  { tier: 2, odds_min: '35:1',  odds_max: '125:1',  picks: 3 },
  { tier: 3, odds_min: '150:1', odds_max: '400:1',  picks: 2 },
  { tier: 4, odds_min: '500:1', odds_max: '2000:1', picks: 2 },
];

const VALSPAR_BOT_NAMES = [
  'FairwayFred',    'BogeySlayer',       'HoleInWon',        'EaglesAndAles',
  'GolfDegens',     'AceMakers',         'BirdieBunch',       'TigerWoodshed',
  'ThreeWoodTheo',  'IronMaidens',       'ChipAndDip',        'AlbatrossAl',
  'TurfNurfers',    'MulliganMike',      'DriveThruDave',     'ShankMaster',
  'WedgeWizard',    'PuttPuttPro',       'GreenJacketJim',    'FlopShotFrank',
  'DoubleBogeyDave','BunkerBuster',      'RoughRider',        'FairwayFelicia',
  'PinSeekerPete',  'SandTrapStan',      'OverParOliver',     'BogeyBrigade',
  'CondorHunter',   'ClubheadSpeed',     'BackswingBob',      'DownswingDave',
  'FollowThroughFred','GripItAndRip',    'SliceMaster3000',   'HookLineAndSinker',
  'TopshotTommy',   'LayUpLarry',        'GoForGreenGary',    'PinHighPaul',
  'ChipyMcChipface','PuttingForBirdie',  'EagleEyeEd',        'BirdieOrBust',
  'PartyAtPar',     'WaterHazardWally',  'OBOutOfBounds',     'DropZoneDan',
  'CartsOnlyCarla', 'ClubhouseKevin',
];

// Inlined tier-assignment helpers (mirrors golf-pool.js, avoids circular require)
function _oddsToDecimal(str) {
  if (!str) return 999;
  const [a, b] = String(str).split(':').map(parseFloat);
  if (isNaN(a) || isNaN(b) || b === 0) return 999;
  return a / b + 1;
}
function _rankToOdds(rank) {
  const r = rank || 9999;
  const bands = [
    { minRank:1,   maxRank:5,    minOdds:8,   maxOdds:15   },
    { minRank:6,   maxRank:15,   minOdds:18,  maxOdds:33   },
    { minRank:16,  maxRank:30,   minOdds:35,  maxOdds:80   },
    { minRank:31,  maxRank:60,   minOdds:90,  maxOdds:150  },
    { minRank:61,  maxRank:100,  minOdds:175, maxOdds:400  },
    { minRank:101, maxRank:9999, minOdds:500, maxOdds:2000 },
  ];
  const band = bands.find(b => r >= b.minRank && r <= b.maxRank) || bands[bands.length - 1];
  const pos = Math.min(1, (r - band.minRank) / Math.max(1, band.maxRank - band.minRank));
  const raw = Math.round(band.minOdds + pos * (band.maxOdds - band.minOdds));
  const nice = raw < 20 ? Math.round(raw/2)*2 : raw < 100 ? Math.round(raw/5)*5 : Math.round(raw/25)*25;
  return { odds_display: `${nice}:1`, odds_decimal: nice + 1 };
}
function _pickTier(odds_decimal) {
  const dec = odds_decimal || 999;
  for (const t of VALSPAR_TIERS) {
    if (dec >= _oddsToDecimal(t.odds_min) && dec <= _oddsToDecimal(t.odds_max)) return t.tier;
  }
  return VALSPAR_TIERS[VALSPAR_TIERS.length - 1].tier;
}

router.post('/admin/dev/create-valspar-test-pool', superadmin, (req, res) => {
  try {
    // ── STEP 1: Find or create Valspar tournament ──────────────────────────────
    let tourn = db.prepare("SELECT * FROM golf_tournaments WHERE name LIKE '%Valspar%'").get();
    if (!tourn) {
      const tid = uuidv4();
      db.prepare(`
        INSERT INTO golf_tournaments (id, name, course, start_date, end_date, season_year, is_major, status)
        VALUES (?, 'Valspar Championship', 'Innisbrook Resort (Copperhead), FL',
                '2026-03-19', '2026-03-23', 2026, 0, 'upcoming')
      `).run(tid);
      tourn = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tid);
    }
    const tournId = tourn.id;

    // ── STEP 2: Update Beta Group 1.0 ─────────────────────────────────────────
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(VALSPAR_LEAGUE_ID);
    if (!league) return res.status(404).json({ error: `League ${VALSPAR_LEAGUE_ID} not found` });

    db.prepare(`
      UPDATE golf_leagues SET
        format_type       = 'pool',
        pick_sheet_format = 'tiered',
        status            = 'lobby',
        max_teams         = 60,
        pool_tournament_id = ?,
        pool_tiers         = ?
      WHERE id = ?
    `).run(tournId, JSON.stringify(VALSPAR_TIERS), VALSPAR_LEAGUE_ID);

    // ── STEP 3: Save tier config to pool_tiers table ───────────────────────────
    db.prepare('DELETE FROM pool_tiers WHERE league_id = ?').run(VALSPAR_LEAGUE_ID);
    const insTier = db.prepare(
      'INSERT INTO pool_tiers (id, league_id, tier_number, odds_min, odds_max, picks_allowed) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const t of VALSPAR_TIERS) {
      insTier.run(uuidv4(), VALSPAR_LEAGUE_ID, t.tier, t.odds_min, t.odds_max, t.picks);
    }

    // ── STEP 4: Assign players to tiers ───────────────────────────────────────
    db.prepare(
      'DELETE FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND manually_overridden = 0'
    ).run(VALSPAR_LEAGUE_ID, tournId);

    const insPlayer = db.prepare(`
      INSERT OR REPLACE INTO pool_tier_players
        (id, league_id, tournament_id, player_id, player_name, tier_number,
         odds_display, odds_decimal, world_ranking, salary, manually_overridden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const tierMap = {}; // tier_number → [{player_id, player_name, world_ranking}]
    const players = db.prepare('SELECT * FROM golf_players WHERE is_active = 1 ORDER BY world_ranking ASC').all();

    db.transaction(() => {
      for (const p of players) {
        const gen = (!p.odds_display || !p.odds_decimal) ? _rankToOdds(p.world_ranking) : null;
        const odds_display = p.odds_display || gen.odds_display;
        const odds_decimal = p.odds_decimal || gen.odds_decimal;
        const tierNum = _pickTier(odds_decimal);
        insPlayer.run(uuidv4(), VALSPAR_LEAGUE_ID, tournId, p.id, p.name, tierNum,
                      odds_display, odds_decimal, p.world_ranking, 0);
        if (!tierMap[tierNum]) tierMap[tierNum] = [];
        tierMap[tierNum].push({ player_id: p.id, player_name: p.name, world_ranking: p.world_ranking || 9999 });
      }
    })();

    for (const t of VALSPAR_TIERS) {
      (tierMap[t.tier] || []).sort((a, b) => a.world_ranking - b.world_ranking);
    }
    const totalAssigned = Object.values(tierMap).reduce((s, a) => s + a.length, 0);

    // ── STEP 5: Add 50 bots with auto-picks ───────────────────────────────────
    const BOT_HASH = bcrypt.hashSync('botpass_pool', 4);

    // Wipe previous bot picks for this tournament (safe — dev tool only)
    db.prepare('DELETE FROM pool_picks WHERE league_id = ? AND tournament_id = ?').run(VALSPAR_LEAGUE_ID, tournId);

    const insPick = db.prepare(`
      INSERT OR IGNORE INTO pool_picks
        (id, league_id, tournament_id, user_id, player_id, player_name, tier_number, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    db.transaction(() => {
      for (let i = 0; i < VALSPAR_BOT_NAMES.length; i++) {
        const botName = VALSPAR_BOT_NAMES[i];
        const botEmail = `${botName.toLowerCase()}@pool.bot`;

        // Find or create bot user
        let botRow = db.prepare('SELECT id FROM users WHERE username = ?').get(botName);
        if (!botRow) {
          const botId = uuidv4();
          db.prepare(
            'INSERT OR IGNORE INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
          ).run(botId, botName, botEmail, BOT_HASH, 'user');
          botRow = { id: botId };
        }

        // Add as league member (idempotent)
        db.prepare(
          'INSERT OR IGNORE INTO golf_league_members (id, golf_league_id, user_id, team_name) VALUES (?, ?, ?, ?)'
        ).run(uuidv4(), VALSPAR_LEAGUE_ID, botRow.id, botName);

        // Auto-pick: stagger through tier players so bots have varied selections
        for (const t of VALSPAR_TIERS) {
          const pool = tierMap[t.tier] || [];
          if (!pool.length) continue;
          for (let j = 0; j < t.picks && j < pool.length; j++) {
            const pick = pool[(i + j) % pool.length];
            insPick.run(uuidv4(), VALSPAR_LEAGUE_ID, tournId, botRow.id, pick.player_id, pick.player_name, t.tier);
          }
        }
      }
    })();

    // ── STEP 6: Response ───────────────────────────────────────────────────────
    const fresh = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(VALSPAR_LEAGUE_ID);
    res.json({
      success:          true,
      leagueId:         VALSPAR_LEAGUE_ID,
      leagueName:       fresh.name,
      inviteCode:       fresh.invite_code,
      tournament:       tourn.name,
      botsAdded:        VALSPAR_BOT_NAMES.length,
      tiersConfigured:  VALSPAR_TIERS.length,
      playersAssigned:  totalAssigned,
      message:          'Share invite code with friends to join',
    });
  } catch (err) {
    console.error('[golf-admin] create-valspar-test-pool error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Export ────────────────────────────────────────────────────────────────────

router.get('/admin/export/users', superadmin, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        u.username, u.email, u.gender, u.dob, u.created_at,
        COUNT(DISTINCT glm.id) AS leagues_count,
        COALESCE(sp.paid, 0) AS season_pass_paid,
        COALESCE(sp.paid * 4.99 + pe.entries * 0.99 + cp.paid * 19.99, 0) AS total_spent
      FROM users u
      LEFT JOIN golf_league_members glm ON glm.user_id = u.id
      LEFT JOIN (SELECT user_id, 1 AS paid FROM golf_season_passes WHERE season='2026' AND paid_at IS NOT NULL) sp ON sp.user_id = u.id
      LEFT JOIN (SELECT user_id, COUNT(*) AS entries FROM golf_pool_entries WHERE paid_at IS NOT NULL GROUP BY user_id) pe ON pe.user_id = u.id
      LEFT JOIN (SELECT commissioner_id, 1 AS paid FROM golf_comm_pro WHERE paid_at IS NOT NULL) cp ON cp.commissioner_id = u.id
      WHERE u.id IN (SELECT DISTINCT user_id FROM golf_league_members)
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();

    const header = 'username,email,gender,dob,joined_at,leagues_count,season_pass_paid,total_spent';
    const lines = rows.map(r =>
      [r.username, r.email, r.gender || '', r.dob || '', r.created_at,
       r.leagues_count, r.season_pass_paid, (r.total_spent || 0).toFixed(2)]
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',')
    );
    const csv = [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="golf-users.csv"');
    res.send(csv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Profile (for onboarding) ──────────────────────────────────────────────────
const authMiddleware = require('../middleware/auth');

router.get('/profile/status', authMiddleware, (req, res) => {
  try {
    const row = db.prepare('SELECT profile_complete FROM golf_user_profiles WHERE user_id = ?').get(req.user.id);
    res.json({ profileComplete: row?.profile_complete === 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/profile/complete', authMiddleware, (req, res) => {
  try {
    const { gender, dob } = req.body;
    if (!gender || !dob) return res.status(400).json({ error: 'gender and dob required' });

    // Validate age 18+
    const age = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 18) return res.status(400).json({ error: 'You must be 18 or older to play.' });

    db.prepare('UPDATE users SET gender = ?, dob = ?, dob_verified = 1 WHERE id = ?')
      .run(gender, dob, req.user.id);
    db.prepare(`
      INSERT INTO golf_user_profiles (user_id, profile_complete, completed_at)
      VALUES (?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET profile_complete = 1, completed_at = CURRENT_TIMESTAMP
    `).run(req.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DataGolf: Sync player list ─────────────────────────────────────────────────
router.post('/admin/dev/sync-datagolf-players', superadmin, async (req, res) => {
  try {
    const { syncPlayerList } = require('../dataGolfService');
    const result = await syncPlayerList();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin] sync-datagolf-players error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DataGolf: Sync current field ───────────────────────────────────────────────
router.post('/admin/dev/sync-datagolf-field', superadmin, async (req, res) => {
  try {
    const { syncCurrentField, syncFieldForTournament } = require('../dataGolfService');
    const { tournament_id } = req.body;
    const result = tournament_id
      ? await syncFieldForTournament(tournament_id)
      : await syncCurrentField();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin] sync-datagolf-field error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DataGolf: Sync schedule ────────────────────────────────────────────────────
router.post('/admin/dev/sync-datagolf-schedule', superadmin, async (req, res) => {
  try {
    const { syncSchedule } = require('../dataGolfService');
    const season = req.body.season || new Date().getFullYear();
    const result = await syncSchedule(season);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin] sync-datagolf-schedule error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DataGolf: Sync live stats for a tournament ────────────────────────────────
router.post('/admin/dev/sync-datagolf-live', superadmin, async (req, res) => {
  try {
    const { syncLiveStats } = require('../dataGolfService');
    const { tournament_id } = req.body;
    if (!tournament_id) return res.status(400).json({ error: 'tournament_id required' });
    const result = await syncLiveStats(tournament_id);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin] sync-datagolf-live error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DataGolf: Apply betting-odds-based tier assignment ───────────────────────
// Uses /betting-tools/outrights to assign T1 (<+2000) T2 (+2000-3999) T3 (+4000-7999) T4 (+8000+)
router.post('/admin/dev/sync-datagolf-odds-tiers', superadmin, async (req, res) => {
  try {
    const { syncDgOddsTiers } = require('../dataGolfService');
    const { tournament_id } = req.body;
    if (!tournament_id) return res.status(400).json({ error: 'tournament_id required' });
    const result = await syncDgOddsTiers(tournament_id);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin] sync-datagolf-odds-tiers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/dev/datagolf-odds-test ─────────────────────────────────────────
// Diagnostic: calls DataGolf outrights endpoint live, returns first 5 players
// + specific search for Fleetwood/Morikawa/Spieth/Henley/Matsuyama.
router.get('/admin/dev/datagolf-odds-test', superadmin, async (req, res) => {
  const key = process.env.DATAGOLF_API_KEY;
  if (!key) return res.json({ ok: false, error: 'DATAGOLF_API_KEY not set in environment' });

  const https = require('https');
  const url = `https://feeds.datagolf.com/betting-tools/outrights?tour=pga&market=win&odds_format=american&key=${key}`;

  try {
    const raw = await new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { Accept: 'application/json' }, timeout: 15000 }, r => {
        let body = '';
        r.on('data', c => body += c);
        r.on('end', () => {
          try { resolve({ status: r.statusCode, body: JSON.parse(body) }); }
          catch { resolve({ status: r.statusCode, body: body.slice(0, 500) }); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });

    if (raw.status !== 200) {
      return res.json({ ok: false, http_status: raw.status, body: raw.body });
    }

    const data = raw.body;
    const players = Array.isArray(data) ? data : (data.odds || data.players || data.data || []);
    const eventName = data.event_name || data.tour_event || '(unknown)';

    // First 5 players
    const first5 = players.slice(0, 5).map(p => ({
      name: p.player_name,
      dg_id: p.dg_id,
      draftkings: p.draftkings,
      fanduel: p.fanduel,
      betmgm: p.betmgm,
    }));

    // Search for specific players
    const SEARCH = ['fleetwood', 'morikawa', 'spieth', 'henley', 'matsuyama', 'min woo', 'gotterup', 'knapp'];
    const found = players
      .filter(p => SEARCH.some(s => (p.player_name || '').toLowerCase().includes(s)))
      .map(p => ({
        name: p.player_name,
        dg_id: p.dg_id,
        draftkings: p.draftkings,
        fanduel: p.fanduel,
        betmgm: p.betmgm,
        caesars: p.caesars,
      }));

    // Sample raw keys from first player so we can see field names
    const sampleKeys = players[0] ? Object.keys(players[0]) : [];

    res.json({
      ok: true,
      http_status: raw.status,
      event_name: eventName,
      total_players: players.length,
      sample_keys: sampleKeys,
      first_5: first5,
      searched_players: found,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── POST /admin/dev/sync-wd-field ─────────────────────────────────────────────
// Manually trigger the ESPN WD field sync for a tournament. Clears false WDs
// (caused by DataGolf "Last, First" name format mismatch) and marks real ones.
router.post('/admin/dev/sync-wd-field', superadmin, async (req, res) => {
  const { tournament_id } = req.body;
  if (!tournament_id) return res.status(400).json({ error: 'tournament_id required' });
  try {
    const { syncTournamentField } = require('../golfSyncService');
    await syncTournamentField(tournament_id);
    const counts = db.prepare(
      'SELECT SUM(is_withdrawn) AS wd_count, COUNT(*) AS total FROM pool_tier_players WHERE tournament_id = ?'
    ).get(tournament_id);
    res.json({ ok: true, wd_count: counts?.wd_count || 0, total: counts?.total || 0 });
  } catch (err) {
    console.error('[admin] sync-wd-field error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/dev/mass-email-preview ─────────────────────────────────────────
// Returns the recipient list for a given audience without sending anything.
// audience: 'all_users' | tournament_id (UUID)
router.get('/admin/dev/mass-email-preview', superadmin, (req, res) => {
  try {
    const { audience } = req.query;
    if (!audience) return res.status(400).json({ error: 'audience required' });

    let recipients;
    if (audience === 'all_users') {
      recipients = db.prepare(
        "SELECT u.id, u.email, u.username FROM users u WHERE u.email IS NOT NULL AND u.email != '' ORDER BY u.created_at DESC"
      ).all();
    } else {
      // audience is a tournament_id — get all users who have pool_picks for that tournament
      recipients = db.prepare(`
        SELECT DISTINCT u.id, u.email, u.username
        FROM users u
        JOIN pool_picks pp ON pp.user_id = u.id
        WHERE pp.tournament_id = ? AND u.email IS NOT NULL AND u.email != ''
        ORDER BY u.username ASC
      `).all(audience);
    }

    res.json({
      count: recipients.length,
      sample: recipients.slice(0, 5).map(r => ({ username: r.username, email: r.email })),
    });
  } catch (err) {
    console.error('[admin] mass-email-preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /admin/dev/mass-email ─────────────────────────────────────────────────
// Sends a mass email to all_users or past tournament players.
// Body: { audience, tournament_id?, subject, body_text }
router.post('/admin/dev/mass-email', superadmin, async (req, res) => {
  const { audience, subject, body_text } = req.body;
  if (!audience || !subject || !body_text) {
    return res.status(400).json({ error: 'audience, subject, and body_text are required' });
  }

  try {
    const { sendSuperAdminBlast, sendEmailBatch } = require('../mailer');
    const { v4: uuidv4 } = require('uuid');

    let recipients;
    if (audience === 'all_users') {
      recipients = db.prepare(
        "SELECT u.id, u.email, u.username FROM users u WHERE u.email IS NOT NULL AND u.email != '' ORDER BY u.created_at DESC"
      ).all();
    } else {
      recipients = db.prepare(`
        SELECT DISTINCT u.id, u.email, u.username
        FROM users u
        JOIN pool_picks pp ON pp.user_id = u.id
        WHERE pp.tournament_id = ? AND u.email IS NOT NULL AND u.email != ''
        ORDER BY u.username ASC
      `).all(audience);
    }

    if (!recipients.length) return res.status(400).json({ error: 'No recipients found for this audience' });

    console.log(`[admin] Mass email: sending to ${recipients.length} recipients (audience: ${audience})`);

    // Build per-recipient emails and chunk into batches of 100 (Resend limit)
    const { emailShell, emailHeader, emailFooter } = {}; // use sendSuperAdminBlast directly
    let sentCount = 0;
    const CHUNK = 100;

    // Build all email payloads
    const { Resend } = require('resend');
    // We call sendSuperAdminBlast one at a time in bulk via batch
    // Build the payload array ourselves for batching efficiency
    function buildEmailHtml(firstName, bodyText) {
      const displayName = firstName
        ? firstName.charAt(0).toUpperCase() + firstName.slice(1)
        : 'there';
      const personalizedBody = bodyText.replace(/\[First Name\]/gi, displayName);
      // Convert plain text to HTML
      const linked = personalizedBody.replace(
        /(https?:\/\/[^\s<>"]+)/g,
        '<a href="$1" style="color:#22c55e;text-decoration:none;word-break:break-all;">$1</a>'
      );
      const paras = linked.split(/\n{2,}/).map(p =>
        `<p style="font-size:15px;color:#d1d5db;line-height:1.75;margin-top:0;margin-right:0;margin-bottom:18px;margin-left:0;">${p.replace(/\n/g, '<br>')}</p>`
      ).join('');
      return paras;
    }

    const mailerModule = require('../mailer');
    for (let i = 0; i < recipients.length; i += CHUNK) {
      const chunk = recipients.slice(i, i + CHUNK);
      await Promise.all(chunk.map(r => {
        const firstName = r.username ? r.username.split(/[\s_]/)[0] : r.username;
        return mailerModule.sendSuperAdminBlast(r.email, firstName, subject, body_text);
      }));
      sentCount += chunk.length;
    }

    // Log the send
    const logId = uuidv4();
    db.prepare(
      'INSERT INTO mass_email_log (id, sent_by, audience, subject, body_preview, recipient_count) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(logId, req.user.id, audience, subject, body_text.slice(0, 300), sentCount);

    console.log(`[admin] Mass email sent: ${sentCount} emails, log_id=${logId}`);
    res.json({ ok: true, sent: sentCount, log_id: logId });
  } catch (err) {
    console.error('[admin] mass-email error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/dev/mass-email-log ─────────────────────────────────────────────
router.get('/admin/dev/mass-email-log', superadmin, (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT mel.*, u.username AS sent_by_username
      FROM mass_email_log mel
      LEFT JOIN users u ON u.id = mel.sent_by
      ORDER BY mel.sent_at DESC
      LIMIT 20
    `).all();
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
