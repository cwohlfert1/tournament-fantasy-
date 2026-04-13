const express = require('express');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const superadmin = require('../middleware/superadmin');
require('../golf-db');
const db = require('../db/index');

const router = express.Router();

// ── Sandbox bot runner ─────────────────────────────────────────────────────────

const activeBotRunners = new Map(); // leagueId → intervalId

function botMaxBid(salary) {
  if (salary >= 800) return 400;
  if (salary >= 700) return 300;
  if (salary >= 500) return 200;
  return 150;
}

async function botAutoNominate(leagueId, session, league) {
  const wonIds = new Set(
    (await db.all("SELECT player_id FROM golf_auction_bids WHERE league_id = ? AND status='won' AND bid_type='auction'", leagueId)).map(r => r.player_id)
  );
  const player = (await db.all('SELECT * FROM golf_players WHERE is_active = 1 ORDER BY world_ranking ASC NULLS LAST'))
    .find(p => !wonIds.has(p.id));
  if (!player) return;
  const timerSecs = league.bid_timer_seconds || 10;
  const endsAt = new Date(Date.now() + timerSecs * 1000).toISOString();
  await db.run('UPDATE golf_auction_sessions SET current_player_id=?, current_high_bid=1, current_high_bidder_id=NULL, nomination_ends_at=? WHERE id=?',
    player.id, endsAt, session.id);
}

async function sandboxBotTick(leagueId, botMemberIds) {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', leagueId);
    if (!league || league.draft_status === 'completed') {
      const iv = activeBotRunners.get(leagueId);
      if (iv) { clearInterval(iv); activeBotRunners.delete(leagueId); }
      return;
    }
    const session = await db.get('SELECT * FROM golf_auction_sessions WHERE league_id = ?', leagueId);
    if (!session || session.status !== 'active') return;
    const now = new Date();

    // Timer expired → finalize
    if (session.current_player_id && session.nomination_ends_at && now > new Date(session.nomination_ends_at)) {
      try {
        require('./golf-auction').finalizeNomination(session, league);
      } catch (e) { console.error('[golf-bot] finalize error:', e.message); return; }
      const freshLeague = await db.get('SELECT * FROM golf_leagues WHERE id = ?', leagueId);
      if (!freshLeague || freshLeague.draft_status === 'completed') return;
      const freshSession = await db.get('SELECT * FROM golf_auction_sessions WHERE league_id = ?', leagueId);
      if (!freshSession) return;
      if (!freshSession.current_player_id && botMemberIds.has(freshSession.current_nomination_member_id)) {
        await botAutoNominate(leagueId, freshSession, freshLeague);
      }
      return;
    }

    // Active nomination: eligible bots may bid
    if (session.current_player_id) {
      const player = await db.get('SELECT salary FROM golf_players WHERE id = ?', session.current_player_id);
      if (!player) return;
      const maxBid = botMaxBid(player.salary);
      const currentBid = session.current_high_bid || 1;
      if (currentBid < maxBid && Math.random() < 0.5) {
        const candidates = [...botMemberIds].filter(id => id !== session.current_high_bidder_id);
        if (!candidates.length) return;
        const botId = candidates[Math.floor(Math.random() * candidates.length)];
        const budget = await db.get('SELECT auction_credits_remaining FROM golf_auction_budgets WHERE league_id = ? AND member_id = ?', leagueId, botId);
        const remaining = budget?.auction_credits_remaining ?? (league.auction_budget || 1000);
        const raise = Math.floor(Math.random() * 21) + 5; // $5–$25
        const newBid = Math.min(currentBid + raise, maxBid, remaining);
        if (newBid > currentBid) {
          const timerSecs = league.bid_timer_seconds || 10;
          const newEndsAt = new Date(Date.now() + timerSecs * 1000).toISOString();
          await db.run('UPDATE golf_auction_sessions SET current_high_bid=?, current_high_bidder_id=?, nomination_ends_at=? WHERE id=?',
            newBid, botId, newEndsAt, session.id);
        }
      }
      return;
    }

    // No active nomination: bot auto-nominates if it's their turn
    if (!session.current_player_id && session.current_nomination_member_id && botMemberIds.has(session.current_nomination_member_id)) {
      await botAutoNominate(leagueId, session, league);
    }
  } catch (e) { console.error('[golf-bot] tick error:', e.message); }
}

const BOT_NAMES = ['Bot Birdie', 'Bot Eagle', 'Bot Par', 'Bot Bogey', 'Bot Albatross', 'Bot Condor', 'Bot Ace'];

// All routes require superadmin (auth + role check bundled in middleware)

// ── Leagues ───────────────────────────────────────────────────────────────────

router.get('/admin/leagues', superadmin, async (req, res) => {
  try {
    const leagues = await db.all(`
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
    `);

    const withMembers = [];
    for (const l of leagues) {
      const members = await db.all(`
        SELECT glm.user_id, glm.team_name, glm.season_points, glm.joined_at,
               u.username, u.email
        FROM golf_league_members glm
        JOIN users u ON u.id = glm.user_id
        WHERE glm.golf_league_id = ?
        ORDER BY glm.season_points DESC
      `, l.id);
      withMembers.push({
        ...l,
        members,
        season_pass_rev:  (l.season_pass_count * 4.99).toFixed(2),
        comm_pro_rev:     (l.comm_pro_paid * 19.99).toFixed(2),
      });
    }

    res.json({ leagues: withMembers });
  } catch (err) {
    console.error('[golf-admin] leagues:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/leagues/:id/archive', superadmin, async (req, res) => {
  try {
    await db.run("UPDATE golf_leagues SET status = 'archived' WHERE id = ?", req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/leagues/:id', superadmin, async (req, res) => {
  try {
    const id = req.params.id;
    await db.transaction(async (tx) => {
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
        try { await tx.run(sql, id); } catch (_) {} // skip missing tables
      }
    });
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
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    const members = await db.all(`
      SELECT glm.team_name, u.email, u.username, glm.season_points
      FROM golf_league_members glm JOIN users u ON u.id = glm.user_id
      WHERE glm.golf_league_id = ?
    `, req.params.id);
    const { sendGolfPaymentConfirmation } = require('../mailer');
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // Throttle: ~3/sec sequential to stay under Resend's 5 req/s limit
    let sent = 0;
    for (const m of members) {
      try {
        await sendGolfPaymentConfirmation(m.email, m.username, 'standings_update', { league_name: league.name });
        sent++;
      } catch {}
      await sleep(350);
    }
    res.json({ success: true, sent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Users ─────────────────────────────────────────────────────────────────────

router.get('/admin/users', superadmin, async (req, res) => {
  try {
    const users = await db.all(`
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
    `);
    res.json({ users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/users/:id/ban', superadmin, async (req, res) => {
  try {
    const user = await db.get('SELECT role FROM users WHERE id = ?', req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    const newRole = user.role === 'banned' ? 'user' : 'banned';
    await db.run('UPDATE users SET role = ? WHERE id = ?', newRole, req.params.id);
    res.json({ success: true, role: newRole });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/users/:id/reset-password', superadmin, async (req, res) => {
  try {
    const tempPw = Math.random().toString(36).slice(2, 10);
    const hash = await bcrypt.hash(tempPw, 10);
    await db.run('UPDATE users SET password_hash = ?, force_password_reset = 1 WHERE id = ?', hash, req.params.id);
    res.json({ success: true, tempPassword: tempPw });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/users/:id', superadmin, async (req, res) => {
  try {
    await db.run('DELETE FROM golf_user_profiles WHERE user_id = ?', req.params.id);
    await db.run('DELETE FROM golf_referral_credits WHERE user_id = ?', req.params.id);
    await db.run('DELETE FROM golf_season_passes WHERE user_id = ?', req.params.id);
    await db.run('DELETE FROM golf_league_members WHERE user_id = ?', req.params.id);
    // Do NOT delete the users row — it may be shared with basketball leagues
    // Just ban them instead
    await db.run("UPDATE users SET role = 'banned' WHERE id = ?", req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Recovery: restore deleted golf league members ────────────────────────────
// POST /api/golf-admin/admin/leagues/:id/recover-members
// Finds users who:
//   (a) have pool_picks for this league but are NOT in golf_league_members, OR
//   (b) are banned and have a username/email matching known missing names
// Re-adds them to golf_league_members and unbans them.
router.post('/admin/leagues/:id/recover-members', superadmin, async (req, res) => {
  try {
    const leagueId = req.params.id;

    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const currentMemberIds = new Set(
      (await db.all('SELECT user_id FROM golf_league_members WHERE golf_league_id = ?', leagueId)).map(r => r.user_id)
    );

    // Strategy 1: users who have pool_picks for this league but aren't members
    const pickOrphans = (await db.all(`
      SELECT DISTINCT pp.user_id, u.username, u.email, u.role
      FROM pool_picks pp
      JOIN users u ON u.id = pp.user_id
      WHERE pp.league_id = ?
    `, leagueId)).filter(u => !currentMemberIds.has(u.user_id));

    // Strategy 2: recently banned users matching known missing names
    const nameHints = ['max', 'cady', 'drew', 'bartlett', 'jon', 'wohlfert'];
    const bannedCandidates = (await db.all(`
      SELECT id AS user_id, username, email, role
      FROM users
      WHERE role = 'banned'
      AND (${nameHints.map(() => "lower(username) LIKE ?").join(' OR ')})
    `, ...nameHints.map(n => `%${n}%`)))
      .filter(u => !currentMemberIds.has(u.user_id));

    // Deduplicate
    const toRestore = new Map();
    for (const u of [...pickOrphans, ...bannedCandidates]) {
      toRestore.set(u.user_id, u);
    }

    const restored = [];
    await db.transaction(async (tx) => {
      for (const [userId, u] of toRestore) {
        // Unban if banned
        if (u.role === 'banned') {
          await tx.run("UPDATE users SET role = 'user' WHERE id = ?", userId);
        }
        // Re-add to golf_league_members
        const existingMember = await tx.get(
          'SELECT id FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?',
          leagueId, userId
        );
        if (!existingMember) {
          await tx.run(`
            INSERT INTO golf_league_members (id, golf_league_id, user_id, team_name, joined_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          `, uuidv4(), leagueId, userId, u.username);
        }
        restored.push({ user_id: userId, username: u.username, email: u.email, was_banned: u.role === 'banned' });
      }
    });

    // Also list all current members + diagnostic info for the response
    const allMembers = await db.all(`
      SELECT glm.user_id, glm.team_name, glm.joined_at, u.username, u.email, u.role
      FROM golf_league_members glm
      JOIN users u ON u.id = glm.user_id
      WHERE glm.golf_league_id = ?
      ORDER BY glm.joined_at
    `, leagueId);

    // All users with pool_picks for forensics
    const allPickUsers = await db.all(`
      SELECT DISTINCT pp.user_id, u.username, u.email, COUNT(*) as picks
      FROM pool_picks pp
      LEFT JOIN users u ON u.id = pp.user_id
      WHERE pp.league_id = ?
      GROUP BY pp.user_id
    `, leagueId);

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

router.get('/admin/players', superadmin, async (req, res) => {
  try {
    const players = await db.all(`
      SELECT gp.*,
        COALESCE(SUM(gs.fantasy_points), 0) AS season_pts
      FROM golf_players gp
      LEFT JOIN golf_scores gs ON gs.player_id = gp.id
      GROUP BY gp.id
      ORDER BY gp.world_ranking ASC NULLS LAST
    `);
    res.json({ players });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/admin/players/:id', superadmin, async (req, res) => {
  try {
    const { name, salary, world_ranking, is_active, status, country } = req.body;
    await db.run(`
      UPDATE golf_players SET
        name = COALESCE(?, name),
        salary = COALESCE(?, salary),
        world_ranking = COALESCE(?, world_ranking),
        is_active = COALESCE(?, is_active),
        country = COALESCE(?, country)
      WHERE id = ?
    `, name ?? null, salary ?? null, world_ranking ?? null,
       is_active ?? null, country ?? null, req.params.id);
    const updated = await db.get('SELECT * FROM golf_players WHERE id = ?', req.params.id);
    res.json({ player: updated });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/players', superadmin, async (req, res) => {
  try {
    const { name, country = 'USA', world_ranking, salary = 200, is_active = 1 } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const id = uuidv4();
    await db.run(`
      INSERT INTO golf_players (id, name, country, world_ranking, salary, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `, id, name, country, world_ranking || null, salary, is_active);
    res.json({ player: await db.get('SELECT * FROM golf_players WHERE id = ?', id) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/players/:id', superadmin, async (req, res) => {
  try {
    await db.run("UPDATE golf_players SET is_active = 0 WHERE id = ?", req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Financials ────────────────────────────────────────────────────────────────

router.get('/admin/financials', superadmin, async (req, res) => {
  try {
    const seasonPassCount = await db.get(
      "SELECT COUNT(*) as n, COUNT(*) * 4.99 as rev FROM golf_season_passes WHERE paid_at IS NOT NULL"
    );
    const poolEntryCount = await db.get(
      "SELECT COUNT(*) as n, COUNT(*) * 0.99 as rev FROM golf_pool_entries WHERE paid_at IS NOT NULL"
    );
    const commProCount = await db.get(
      "SELECT COUNT(*) as n, SUM(CASE WHEN paid_at IS NOT NULL THEN 19.99 ELSE 0 END) as rev FROM golf_comm_pro WHERE paid_at IS NOT NULL OR promo_applied = 1"
    );
    const promoCount = await db.get(
      "SELECT COUNT(*) as n FROM golf_comm_pro WHERE promo_applied = 1"
    );

    const totalRev = (seasonPassCount.rev || 0) + (poolEntryCount.rev || 0) + (commProCount.rev || 0);

    const activeLeagues = (await db.get(
      "SELECT COUNT(*) as n FROM golf_leagues WHERE status != 'archived'"
    )).n;
    const totalUsers = (await db.get(
      "SELECT COUNT(DISTINCT user_id) as n FROM golf_league_members"
    )).n;

    const referralCredits = (await db.get(
      "SELECT COALESCE(SUM(credit_amount), 0) as total FROM golf_referral_redemptions"
    )).total;

    // Revenue by format
    const revenueByFormat = await db.all(`
      SELECT
        COALESCE(gl.format_type, 'tourneyrun') AS format,
        COUNT(DISTINCT gl.id) AS leagues,
        COUNT(DISTINCT glm.user_id) AS players
      FROM golf_leagues gl
      LEFT JOIN golf_league_members glm ON glm.golf_league_id = gl.id
      GROUP BY gl.format_type
    `);

    // Recent payments
    const recentPayments = [
      ...(await db.all(`
        SELECT u.username, 'Season Pass' AS product, 4.99 AS amount,
               NULL AS league_name, gsp.paid_at
        FROM golf_season_passes gsp JOIN users u ON u.id = gsp.user_id
        WHERE gsp.paid_at IS NOT NULL ORDER BY gsp.paid_at DESC LIMIT 20
      `)),
      ...(await db.all(`
        SELECT u.username, 'Office Pool Entry' AS product, 0.99 AS amount,
               gt.name AS league_name, gpe.paid_at
        FROM golf_pool_entries gpe
        JOIN users u ON u.id = gpe.user_id
        LEFT JOIN golf_tournaments gt ON gt.id = gpe.tournament_id
        WHERE gpe.paid_at IS NOT NULL ORDER BY gpe.paid_at DESC LIMIT 20
      `)),
      ...(await db.all(`
        SELECT u.username, 'Commissioner Pro' AS product, 19.99 AS amount,
               gl.name AS league_name, gcp.paid_at
        FROM golf_comm_pro gcp
        JOIN users u ON u.id = gcp.commissioner_id
        JOIN golf_leagues gl ON gl.id = gcp.league_id
        WHERE gcp.paid_at IS NOT NULL ORDER BY gcp.paid_at DESC LIMIT 20
      `)),
    ].sort((a, b) => new Date(b.paid_at) - new Date(a.paid_at)).slice(0, 30);

    // Top referrers
    const topReferrers = await db.all(`
      SELECT u.username,
             COUNT(*) AS referral_count,
             SUM(grd.credit_amount) AS credits_earned
      FROM golf_referral_redemptions grd
      JOIN users u ON u.id = grd.referrer_id
      GROUP BY grd.referrer_id
      ORDER BY referral_count DESC
      LIMIT 10
    `);

    const referralCodesIssued = (await db.get('SELECT COUNT(*) as n FROM golf_referral_codes')).n;
    const referralRedemptions = (await db.get('SELECT COUNT(*) as n FROM golf_referral_redemptions')).n;
    const creditsUsed = (await db.get(
      "SELECT COALESCE(SUM(CASE WHEN balance < 1 THEN 1 ELSE 0 END), 0) as n FROM golf_referral_credits"
    )).n;

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

router.get('/admin/promo-codes', superadmin, async (req, res) => {
  try {
    const codes = await db.all(`
      SELECT pc.*,
        (SELECT COUNT(*) FROM promo_code_uses WHERE promo_code_id = pc.id) AS uses_count_live,
        (SELECT COUNT(*) FROM promo_code_uses
         WHERE promo_code_id = pc.id
           AND strftime('%Y-%m', used_at) = strftime('%Y-%m', 'now')) AS uses_this_month
      FROM promo_codes pc
      ORDER BY pc.created_at DESC
    `);
    const now = new Date();
    const monthStats = {
      activeCodes: codes.filter(c => c.active).length,
      usesThisMonth: codes.reduce((s, c) => s + (c.uses_this_month || 0), 0),
      discountsGiven: (await db.get(
        "SELECT COALESCE(SUM(discount_amount),0) as n FROM promo_code_uses"
      )).n,
    };
    res.json({ codes, monthStats });
  } catch (err) {
    console.error('[golf-admin] promo-codes list:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/promo-codes', superadmin, async (req, res) => {
  try {
    const { code, ambassador_name, ambassador_email, discount_type, discount_value, active } = req.body;
    if (!code || !discount_type) return res.status(400).json({ error: 'code and discount_type required' });
    const validTypes = ['percent', 'free'];
    if (!validTypes.includes(discount_type)) return res.status(400).json({ error: 'Invalid discount_type' });
    const id = uuidv4();
    await db.run(`
      INSERT INTO promo_codes (id, code, ambassador_name, ambassador_email, discount_type, discount_value, active)
      VALUES (?, UPPER(?), ?, ?, ?, ?, ?)
    `, id, code.trim(), ambassador_name || '', ambassador_email || '',
      discount_type, parseFloat(discount_value) || 100, active !== false ? 1 : 0);
    res.status(201).json({ code: await db.get('SELECT * FROM promo_codes WHERE id = ?', id) });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Code already exists' });
    console.error('[golf-admin] promo-codes create:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/admin/promo-codes/:id', superadmin, async (req, res) => {
  try {
    const { ambassador_name, ambassador_email, discount_type, discount_value, active } = req.body;
    const promo = await db.get('SELECT id FROM promo_codes WHERE id = ?', req.params.id);
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
    await db.run(`UPDATE promo_codes SET ${fields.join(', ')} WHERE id = ?`, ...vals);
    res.json({ code: await db.get('SELECT * FROM promo_codes WHERE id = ?', req.params.id) });
  } catch (err) {
    console.error('[golf-admin] promo-codes patch:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/promo-codes/:id', superadmin, async (req, res) => {
  try {
    await db.run('DELETE FROM promo_code_uses WHERE promo_code_id = ?', req.params.id);
    await db.run('DELETE FROM promo_codes WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[golf-admin] promo-codes delete:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/promo-codes/:id/uses', superadmin, async (req, res) => {
  try {
    const uses = await db.all(`
      SELECT pcu.*, u.username, u.email,
             gl.name AS league_name
      FROM promo_code_uses pcu
      LEFT JOIN users u ON u.id = pcu.user_id
      LEFT JOIN golf_leagues gl ON gl.id = pcu.league_id
      WHERE pcu.promo_code_id = ?
      ORDER BY pcu.used_at DESC
    `, req.params.id);
    res.json({ uses });
  } catch (err) {
    console.error('[golf-admin] promo-codes uses:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/promo-codes/:id/qr', superadmin, async (req, res) => {
  try {
    const promo = await db.get('SELECT code FROM promo_codes WHERE id = ?', req.params.id);
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

router.get('/admin/analytics', superadmin, async (req, res) => {
  try {
    // Gender breakdown
    const genderData = await db.all(`
      SELECT
        COALESCE(u.gender, 'not_provided') AS gender,
        COUNT(*) AS count
      FROM users u
      WHERE u.id IN (SELECT DISTINCT user_id FROM golf_league_members)
      GROUP BY u.gender
    `);

    // Age distribution (from dob)
    const ageRaw = await db.all(`
      SELECT u.dob FROM users u
      WHERE u.dob IS NOT NULL
        AND u.id IN (SELECT DISTINCT user_id FROM golf_league_members)
    `);

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
    const signupsPerWeek = await db.all(`
      SELECT
        strftime('%Y-W%W', u.created_at) AS week,
        COUNT(*) AS count
      FROM users u
      WHERE u.id IN (SELECT DISTINCT user_id FROM golf_league_members)
        AND u.created_at >= date('now', '-84 days')
      GROUP BY week
      ORDER BY week ASC
    `);

    // Office pool entries per tournament
    const poolByTournament = await db.all(`
      SELECT gt.name, COUNT(*) AS entries
      FROM golf_pool_entries gpe
      LEFT JOIN golf_tournaments gt ON gt.id = gpe.tournament_id
      WHERE gpe.paid_at IS NOT NULL
      GROUP BY gpe.tournament_id
      ORDER BY entries DESC
      LIMIT 10
    `);

    // Average league size
    const avgLeagueSize = (await db.get(`
      SELECT AVG(cnt) AS avg FROM (
        SELECT COUNT(*) AS cnt FROM golf_league_members GROUP BY golf_league_id
      )
    `)).avg;

    // Average FAAB spend
    const avgFaab = (await db.get(`
      SELECT AVG(2400 - COALESCE(season_budget, 2400)) AS avg
      FROM golf_league_members
      WHERE season_budget < 2400
    `)).avg;

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
    const tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', tournId);
    if (!tourn) return res.status(404).json({ error: 'Tournament not found' });
    // Attempt to call existing sync module
    try {
      const sync = require('../golf-score-sync');
      if (sync?.syncTournament) await sync.syncTournament(tournId);
    } catch {}
    await db.run("UPDATE golf_tournaments SET status = 'active' WHERE id = ?", tournId);
    res.json({ success: true, tournament: tourn.name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/dev/test-email', superadmin, async (req, res) => {
  try {
    const user = await db.get('SELECT email, username FROM users WHERE id = ?', req.user.id);
    const { sendGolfPaymentConfirmation } = require('../mailer');
    await sendGolfPaymentConfirmation(user.email, user.username, 'golf_season_pass', {
      season: '2026',
    });
    res.json({ success: true, sentTo: user.email });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/dev/db-health', superadmin, async (req, res) => {
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
        counts[t] = (await db.get(`SELECT COUNT(*) as n FROM ${t}`)).n;
      } catch {
        counts[t] = 'N/A';
      }
    }
    const lastSync = (await db.get(
      "SELECT MAX(updated_at) as t FROM golf_scores"
    ))?.t || null;
    res.json({ counts, lastSync, uptime: process.uptime() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── POST /admin/dev/sync-pool-tiers ──────────────────────────────────────────
// Re-assign pool_tier_players for one or all pool leagues.
// Accepts optional body.league_id; if omitted, runs for all pool leagues
// that have pool_tournament_id set.

router.post('/admin/dev/sync-pool-tiers', superadmin, async (req, res) => {
  try {
    const filter = req.body.league_id
      ? 'AND id = ?'
      : '';
    const args = req.body.league_id ? [req.body.league_id] : [];
    const leagues = await db.all(
      `SELECT * FROM golf_leagues WHERE format_type IN ('pool', 'salary_cap') AND pool_tournament_id IS NOT NULL AND status != 'archived' ${filter}`,
      ...args
    );

    if (!leagues.length) return res.status(404).json({ error: 'No matching pool leagues with tournament assigned' });

    const insPlayerSql = `
      INSERT OR REPLACE INTO pool_tier_players
        (id, league_id, tournament_id, player_id, player_name, tier_number,
         odds_display, odds_decimal, world_ranking, salary, manually_overridden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `;

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
      await db.run('DELETE FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND manually_overridden = 0',
        league.id, tid);

      // Use tournament-specific field if available, otherwise all active players
      const fieldCount = (await db.get('SELECT COUNT(*) as cnt FROM golf_tournament_fields WHERE tournament_id = ?', tid)).cnt;
      const players = fieldCount > 0
        ? await db.all(`
            SELECT gp.* FROM golf_players gp
            INNER JOIN golf_tournament_fields tf ON tf.player_id = gp.id AND tf.tournament_id = ?
            ORDER BY gp.world_ranking ASC
          `, tid)
        : await db.all('SELECT * FROM golf_players WHERE is_active = 1 ORDER BY world_ranking ASC');
      let count = 0;

      await db.transaction(async (tx) => {
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
          await tx.run(insPlayerSql, uuidv4(), league.id, tid, p.id, p.name, tierNum, odds_display, odds_decimal, p.world_ranking);
          count++;
        }
      });

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

    const tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', tournament_id);
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
    const getGPSql = 'SELECT * FROM golf_players WHERE name = ? LIMIT 1';
    const insGPSql = 'INSERT OR IGNORE INTO golf_players (id, name, country, is_active, world_ranking) VALUES (?, ?, ?, 1, ?)';
    const insTFSql = `
      INSERT OR REPLACE INTO golf_tournament_fields
        (id, tournament_id, player_name, player_id, espn_player_id, world_ranking, odds_display, odds_decimal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const updGPSql = 'UPDATE golf_players SET odds_display = ?, odds_decimal = ? WHERE id = ?';
    const updGPCountrySql = 'UPDATE golf_players SET country = ? WHERE id = ? AND (country IS NULL OR length(country) != 2)';

    await db.run('DELETE FROM golf_tournament_fields WHERE tournament_id = ?', tournament_id);

    const fieldPlayers = [];
    await db.transaction(async (tx) => {
      for (const c of competitors) {
        const name    = c.athlete?.displayName || c.athlete?.fullName;
        const espnId  = String(c.athlete?.id || '');
        const ranking = c.athlete?.ranking ? parseInt(c.athlete.ranking) : null;
        const country = c.athlete?.flag?.alt || c.athlete?.country || null;
        if (!name) continue;

        let gp = await tx.get(getGPSql, name);
        if (!gp) {
          await tx.run(insGPSql, uuidv4(), name, country, 1, ranking || 200);
          gp = await tx.get(getGPSql, name);
        }
        if (!gp) continue;

        // Update country if we have it and the stored value isn't already a 2-letter code
        if (country) await tx.run(updGPCountrySql, country, gp.id);

        // Try ESPN ID, then full name, then unique last name
        const nameLower = name.toLowerCase();
        const lastName  = nameLower.split(' ').pop();
        const playerOdds = oddsMap[espnId]
          || nameOddsMap[nameLower]
          || lastNameOddsMap[lastName]   // null if last name is ambiguous
          || null;
        await tx.run(insTFSql,
          uuidv4(), tournament_id, name, gp.id, espnId,
          ranking || gp.world_ranking || 200,
          playerOdds?.odds_display || null,
          playerOdds?.odds_decimal || null
        );
        // Update global player record with current-week odds if available
        if (playerOdds) await tx.run(updGPSql, playerOdds.odds_display, playerOdds.odds_decimal, gp.id);

        fieldPlayers.push({ name, espnId, world_ranking: ranking || gp.world_ranking, ...playerOdds });
      }
    });

    // ── Step 4: Rebuild pool_tier_players (now with updated odds) ─────────────
    const affectedLeagues = await db.all(
      "SELECT * FROM golf_leagues WHERE format_type IN ('pool', 'salary_cap') AND pool_tournament_id = ? AND status != 'archived'",
      tournament_id
    );

    const rebuildResults = [];
    for (const league of affectedLeagues) {
      let tiersConfig = [];
      try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}
      if (!tiersConfig.length) { rebuildResults.push({ league: league.name, skipped: 'no tier config' }); continue; }

      const insTPSql = `
        INSERT OR REPLACE INTO pool_tier_players
          (id, league_id, tournament_id, player_id, player_name, tier_number,
           odds_display, odds_decimal, world_ranking, salary, manually_overridden)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
      `;

      await db.run('DELETE FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND manually_overridden = 0',
        league.id, tournament_id);

      const allTF = await db.all(`
        SELECT gp.*, tf.odds_display AS tf_od, tf.odds_decimal AS tf_dec
        FROM golf_players gp
        INNER JOIN golf_tournament_fields tf ON tf.player_id = gp.id AND tf.tournament_id = ?
        ORDER BY COALESCE(tf.odds_decimal, gp.odds_decimal, 999) ASC
      `, tournament_id);

      let count = 0;
      await db.transaction(async (tx) => {
        for (const p of allTF) {
          const gen = (!p.tf_od && !p.odds_display) ? _rankToOdds(p.world_ranking || 200) : null;
          const odds_display = p.tf_od  || p.odds_display  || gen.odds_display;
          const odds_decimal = p.tf_dec || p.odds_decimal  || gen.odds_decimal;
          let tierNum = tiersConfig[tiersConfig.length - 1]?.tier || 1;
          for (const t of tiersConfig) {
            if (odds_decimal >= _oddsToDecimal(t.odds_min) && odds_decimal <= _oddsToDecimal(t.odds_max)) { tierNum = t.tier; break; }
          }
          await tx.run(insTPSql, uuidv4(), league.id, tournament_id, p.id, p.name, tierNum, odds_display, odds_decimal, p.world_ranking || null);
          count++;
        }
      });

      rebuildResults.push({ league: league.name, players_assigned: count });
    }

    const oddsCount = Object.keys(oddsMap).length;
    res.json({ ok: true, tournament: tourn.name, espn_event_id: eid, field_size: fieldPlayers.length, odds_fetched: oddsCount, leagues_rebuilt: rebuildResults });
  } catch (err) {
    console.error('[admin] sync-espn-field error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/sandbox/auction-draft', superadmin, async (req, res) => {
  try {
    const admin = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);

    // Ensure bot users exist
    const BOT_HASH = bcrypt.hashSync('botpass_sandbox', 4);
    const botUserIds = [];
    for (const botName of BOT_NAMES) {
      let row = await db.get('SELECT id FROM users WHERE username = ?', botName);
      if (!row) {
        const botId = uuidv4();
        const botEmail = botName.toLowerCase().replace(/\s+/g, '.') + '@sandbox.internal';
        await db.run('INSERT OR IGNORE INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)', botId, botName, botEmail, BOT_HASH, 'user');
        row = { id: botId };
      }
      botUserIds.push(row.id);
    }

    const leagueId = uuidv4();
    const inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    const leagueName = `[SANDBOX] Auction ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

    await db.run(`
      INSERT INTO golf_leagues
        (id, name, commissioner_id, invite_code, status, format_type, draft_status, is_sandbox, bid_timer_seconds, auction_budget, roster_size, core_spots)
      VALUES (?, ?, ?, ?, 'lobby', 'tourneyrun', 'pending', 1, 10, 1000, 8, 4)
    `, leagueId, leagueName, admin.id, inviteCode);

    // Add admin + 7 bots as members
    await db.run('INSERT INTO golf_league_members (id, golf_league_id, user_id, team_name, season_budget) VALUES (?, ?, ?, ?, 2400)',
      uuidv4(), leagueId, admin.id, admin.username || 'Admin');

    for (let i = 0; i < BOT_NAMES.length; i++) {
      await db.run('INSERT OR IGNORE INTO golf_league_members (id, golf_league_id, user_id, team_name, season_budget) VALUES (?, ?, ?, ?, 2400)',
        uuidv4(), leagueId, botUserIds[i], BOT_NAMES[i]);
    }

    // Start the auction immediately
    const allMembers = await db.all('SELECT * FROM golf_league_members WHERE golf_league_id = ?', leagueId);
    const shuffled = [...allMembers].sort(() => Math.random() - 0.5);

    await db.transaction(async (tx) => {
      for (let i = 0; i < shuffled.length; i++) {
        const m = shuffled[i];
        await tx.run('UPDATE golf_league_members SET draft_order = ? WHERE id = ?', i + 1, m.id);
        await tx.run('INSERT OR IGNORE INTO golf_auction_budgets (id, league_id, member_id, auction_credits_remaining, faab_credits_remaining) VALUES (?, ?, ?, 1000, 100)',
          uuidv4(), leagueId, m.id);
      }
      const nominationOrder = JSON.stringify(shuffled.map(m => m.id));
      await tx.run("INSERT INTO golf_auction_sessions (id, league_id, status, current_nomination_member_id, nomination_order, nomination_index) VALUES (?, ?, 'active', ?, ?, 0)",
        uuidv4(), leagueId, shuffled[0].id, nominationOrder);
      await tx.run("UPDATE golf_leagues SET draft_status='active', status='drafting' WHERE id=?", leagueId);
    });

    // Identify bot member IDs and start bot runner
    const botUserIdSet = new Set(botUserIds);
    const botMemberIds = new Set(allMembers.filter(m => botUserIdSet.has(m.user_id)).map(m => m.id));

    // Start the bot runner
    if (!activeBotRunners.has(leagueId)) {
      const iv = setInterval(() => sandboxBotTick(leagueId, botMemberIds), 3000);
      activeBotRunners.set(leagueId, iv);
    }

    // If the first nominator is a bot, nominate immediately
    const firstSession = await db.get('SELECT * FROM golf_auction_sessions WHERE league_id = ?', leagueId);
    const firstLeague  = await db.get('SELECT * FROM golf_leagues WHERE id = ?', leagueId);
    if (firstSession && botMemberIds.has(firstSession.current_nomination_member_id)) {
      await botAutoNominate(leagueId, firstSession, firstLeague);
    }

    res.json({ success: true, leagueId, url: `/golf/league/${leagueId}/auction` });
  } catch (err) {
    console.error('[golf-admin] sandbox auction-draft error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/dev/sandbox', superadmin, async (req, res) => {
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', req.user.id);
    const leagueId = uuidv4();
    const inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
    await db.run(`
      INSERT INTO golf_leagues (id, name, commissioner_id, invite_code, status, format_type, draft_status)
      VALUES (?, ?, ?, ?, 'lobby', 'tourneyrun', 'pending')
    `, leagueId, `[SANDBOX] ${user.username} Auction Test`, user.id, inviteCode);
    const memberId = uuidv4();
    await db.run(`
      INSERT INTO golf_league_members (id, golf_league_id, user_id, team_name, season_budget)
      VALUES (?, ?, ?, ?, 2400)
    `, memberId, leagueId, user.id, user.username);
    // Add bot members
    const bots = ['Bot Alpha', 'Bot Beta', 'Bot Gamma', 'Bot Delta', 'Bot Epsilon', 'Bot Zeta', 'Bot Theta'];
    for (const botName of bots) {
      const botUserId = (await db.get('SELECT id FROM users WHERE username = ?', botName))?.id;
      if (botUserId) {
        await db.run(`
          INSERT OR IGNORE INTO golf_league_members (id, golf_league_id, user_id, team_name, season_budget)
          VALUES (?, ?, ?, ?, 2400)
        `, uuidv4(), leagueId, botUserId, botName);
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

router.post('/admin/dev/create-valspar-test-pool', superadmin, async (req, res) => {
  try {
    // ── STEP 1: Find or create Valspar tournament ──────────────────────────────
    let tourn = await db.get("SELECT * FROM golf_tournaments WHERE name LIKE '%Valspar%'");
    if (!tourn) {
      const tid = uuidv4();
      await db.run(`
        INSERT INTO golf_tournaments (id, name, course, start_date, end_date, season_year, is_major, status)
        VALUES (?, 'Valspar Championship', 'Innisbrook Resort (Copperhead), FL',
                '2026-03-19', '2026-03-23', 2026, 0, 'upcoming')
      `, tid);
      tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', tid);
    }
    const tournId = tourn.id;

    // ── STEP 2: Update Beta Group 1.0 ─────────────────────────────────────────
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', VALSPAR_LEAGUE_ID);
    if (!league) return res.status(404).json({ error: `League ${VALSPAR_LEAGUE_ID} not found` });

    await db.run(`
      UPDATE golf_leagues SET
        format_type       = 'pool',
        pick_sheet_format = 'tiered',
        status            = 'lobby',
        max_teams         = 60,
        pool_tournament_id = ?,
        pool_tiers         = ?
      WHERE id = ?
    `, tournId, JSON.stringify(VALSPAR_TIERS), VALSPAR_LEAGUE_ID);

    // ── STEP 3: Save tier config to pool_tiers table ───────────────────────────
    await db.run('DELETE FROM pool_tiers WHERE league_id = ?', VALSPAR_LEAGUE_ID);
    const insTierSql = 'INSERT INTO pool_tiers (id, league_id, tier_number, odds_min, odds_max, picks_allowed) VALUES (?, ?, ?, ?, ?, ?)';
    for (const t of VALSPAR_TIERS) {
      await db.run(insTierSql, uuidv4(), VALSPAR_LEAGUE_ID, t.tier, t.odds_min, t.odds_max, t.picks);
    }

    // ── STEP 4: Assign players to tiers ───────────────────────────────────────
    await db.run(
      'DELETE FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND manually_overridden = 0',
      VALSPAR_LEAGUE_ID, tournId
    );

    const insPlayerSql = `
      INSERT OR REPLACE INTO pool_tier_players
        (id, league_id, tournament_id, player_id, player_name, tier_number,
         odds_display, odds_decimal, world_ranking, salary, manually_overridden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `;

    const tierMap = {}; // tier_number → [{player_id, player_name, world_ranking}]
    const players = await db.all('SELECT * FROM golf_players WHERE is_active = 1 ORDER BY world_ranking ASC');

    await db.transaction(async (tx) => {
      for (const p of players) {
        const gen = (!p.odds_display || !p.odds_decimal) ? _rankToOdds(p.world_ranking) : null;
        const odds_display = p.odds_display || gen.odds_display;
        const odds_decimal = p.odds_decimal || gen.odds_decimal;
        const tierNum = _pickTier(odds_decimal);
        await tx.run(insPlayerSql, uuidv4(), VALSPAR_LEAGUE_ID, tournId, p.id, p.name, tierNum,
                      odds_display, odds_decimal, p.world_ranking, 0);
        if (!tierMap[tierNum]) tierMap[tierNum] = [];
        tierMap[tierNum].push({ player_id: p.id, player_name: p.name, world_ranking: p.world_ranking || 9999 });
      }
    });

    for (const t of VALSPAR_TIERS) {
      (tierMap[t.tier] || []).sort((a, b) => a.world_ranking - b.world_ranking);
    }
    const totalAssigned = Object.values(tierMap).reduce((s, a) => s + a.length, 0);

    // ── STEP 5: Add 50 bots with auto-picks ───────────────────────────────────
    const BOT_HASH = bcrypt.hashSync('botpass_pool', 4);

    // Wipe previous bot picks for this tournament (safe — dev tool only)
    await db.run('DELETE FROM pool_picks WHERE league_id = ? AND tournament_id = ?', VALSPAR_LEAGUE_ID, tournId);

    const insPickSql = `
      INSERT OR IGNORE INTO pool_picks
        (id, league_id, tournament_id, user_id, player_id, player_name, tier_number, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    await db.transaction(async (tx) => {
      for (let i = 0; i < VALSPAR_BOT_NAMES.length; i++) {
        const botName = VALSPAR_BOT_NAMES[i];
        const botEmail = `${botName.toLowerCase()}@pool.bot`;

        // Find or create bot user
        let botRow = await tx.get('SELECT id FROM users WHERE username = ?', botName);
        if (!botRow) {
          const botId = uuidv4();
          await tx.run(
            'INSERT OR IGNORE INTO users (id, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
            botId, botName, botEmail, BOT_HASH, 'user'
          );
          botRow = { id: botId };
        }

        // Add as league member (idempotent)
        await tx.run(
          'INSERT OR IGNORE INTO golf_league_members (id, golf_league_id, user_id, team_name) VALUES (?, ?, ?, ?)',
          uuidv4(), VALSPAR_LEAGUE_ID, botRow.id, botName
        );

        // Auto-pick: stagger through tier players so bots have varied selections
        for (const t of VALSPAR_TIERS) {
          const pool = tierMap[t.tier] || [];
          if (!pool.length) continue;
          for (let j = 0; j < t.picks && j < pool.length; j++) {
            const pick = pool[(i + j) % pool.length];
            await tx.run(insPickSql, uuidv4(), VALSPAR_LEAGUE_ID, tournId, botRow.id, pick.player_id, pick.player_name, t.tier);
          }
        }
      }
    });

    // ── STEP 6: Response ───────────────────────────────────────────────────────
    const fresh = await db.get('SELECT * FROM golf_leagues WHERE id = ?', VALSPAR_LEAGUE_ID);
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

router.get('/admin/export/users', superadmin, async (req, res) => {
  try {
    const rows = await db.all(`
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
    `);

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

router.get('/profile/status', authMiddleware, async (req, res) => {
  try {
    const row = await db.get('SELECT profile_complete FROM golf_user_profiles WHERE user_id = ?', req.user.id);
    res.json({ profileComplete: row?.profile_complete === 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/profile/complete', authMiddleware, async (req, res) => {
  try {
    const { gender, dob } = req.body;
    if (!gender || !dob) return res.status(400).json({ error: 'gender and dob required' });

    // Validate age 18+
    const age = Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 18) return res.status(400).json({ error: 'You must be 18 or older to play.' });

    await db.run('UPDATE users SET gender = ?, dob = ?, dob_verified = 1 WHERE id = ?',
      gender, dob, req.user.id);
    await db.run(`
      INSERT INTO golf_user_profiles (user_id, profile_complete, completed_at)
      VALUES (?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET profile_complete = 1, completed_at = CURRENT_TIMESTAMP
    `, req.user.id);
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

// ── POST /admin/dev/assign-salary-cap-salaries ────────────────────────────────
// Manual trigger: assign odds-based salaries to pool_tier_players for all (or one)
// salary_cap leagues that have a tournament linked.
router.post('/admin/dev/assign-salary-cap-salaries', superadmin, async (req, res) => {
  try {
    const { assignSalaryCapSalaries } = require('./golf-pool');
    const filter = req.body.league_id ? 'AND id = ?' : '';
    const args   = req.body.league_id ? [req.body.league_id] : [];
    const leagues = await db.all(
      `SELECT id FROM golf_leagues WHERE format_type = 'salary_cap' AND pool_tournament_id IS NOT NULL AND status != 'archived' ${filter}`,
      ...args
    );
    const results = leagues.map(l => ({ league_id: l.id, ...assignSalaryCapSalaries(l.id) }));
    res.json({ ok: true, results });
  } catch (err) {
    console.error('[admin] assign-salary-cap-salaries error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/dev/standings-join-diag?league_id=&tournament_id= ─────────────
// Diagnoses TBD scores in standings: traces pool_picks→golf_scores player_id join.
router.get('/admin/dev/standings-join-diag', superadmin, async (req, res) => {
  const { league_id, tournament_id } = req.query;
  if (!league_id || !tournament_id) return res.status(400).json({ error: 'league_id and tournament_id required' });

  // 1. Tournament record + score count
  const tourn = await db.get('SELECT id, name, status, espn_event_id FROM golf_tournaments WHERE id = ?', tournament_id);
  const scoreCount = await db.get('SELECT COUNT(*) as c FROM golf_scores WHERE tournament_id = ?', tournament_id);
  const scoreSample = await db.all(`
    SELECT gp.name as player_name, gs.player_id, gs.round1, gs.finish_position
    FROM golf_scores gs JOIN golf_players gp ON gp.id = gs.player_id
    WHERE gs.tournament_id = ? ORDER BY gs.finish_position ASC LIMIT 5
  `, tournament_id);

  // 2. pool_picks player_ids for this league (first 8)
  const picks = await db.all(`
    SELECT pp.player_id as pp_player_id, pp.player_name,
           gp.name as gp_name, gp.id as gp_id
    FROM pool_picks pp
    LEFT JOIN golf_players gp ON gp.id = pp.player_id
    WHERE pp.league_id = ? AND pp.tournament_id = ? LIMIT 8
  `, league_id, tournament_id);

  // 3. Direct player_id join — the key test
  const joinResult = await db.all(`
    SELECT pp.player_name, pp.player_id as pp_pid,
           gs.player_id as gs_pid, gs.round1, gs.finish_position,
           CASE WHEN gs.player_id IS NULL THEN 'NO_MATCH' ELSE 'MATCHED' END as status
    FROM pool_picks pp
    LEFT JOIN golf_scores gs ON gs.player_id = pp.player_id AND gs.tournament_id = ?
    WHERE pp.league_id = ? AND pp.tournament_id = ?
  `, tournament_id, league_id, tournament_id);

  // 4. UUID mismatch check: pick player_id exists in golf_players?
  //    If not, the pick references a stale/deleted player record.
  const stalePicks = await db.all(`
    SELECT pp.player_name, pp.player_id
    FROM pool_picks pp
    LEFT JOIN golf_players gp ON gp.id = pp.player_id
    WHERE pp.league_id = ? AND pp.tournament_id = ? AND gp.id IS NULL
  `, league_id, tournament_id);

  // 5. Does golf_players contain Fleetwood? Check by name.
  const fleetwoodInGP = await db.all("SELECT id, name FROM golf_players WHERE name LIKE '%Fleetwood%' OR name LIKE '%fleetwood%'");
  const fleetwoodInGS = await db.all(`
    SELECT gs.player_id, gs.round1 FROM golf_scores gs
    JOIN golf_players gp ON gp.id = gs.player_id
    WHERE gs.tournament_id = ? AND gp.name LIKE '%Fleetwood%'
  `, tournament_id);
  const fleetwoodInPP = await db.all("SELECT player_id, player_name FROM pool_picks WHERE player_name LIKE '%Fleetwood%' OR player_name LIKE '%fleetwood%'");

  res.json({
    tournament: tourn,
    score_count: scoreCount.c,
    score_sample: scoreSample,
    picks_sample: picks,
    join_result: joinResult,
    stale_picks: stalePicks,
    fleetwood: { in_golf_players: fleetwoodInGP, in_golf_scores: fleetwoodInGS, in_pool_picks: fleetwoodInPP },
  });
});

// ── POST /admin/dev/fix-pool-picks-player-ids ────────────────────────────────
// Re-links pool_picks.player_id to current golf_players.id via name match.
// Fixes NULL player_ids AND UUID mismatches from golf_players rebuilds/dedup.
router.post('/admin/dev/fix-pool-picks-player-ids', superadmin, async (req, res) => {
  try {
    const before = (await db.get('SELECT COUNT(*) as c FROM pool_picks')).c;
    const nullBefore = (await db.get('SELECT COUNT(*) as c FROM pool_picks WHERE player_id IS NULL')).c;

    // Helper: normalize "Last, First" → "first last" for matching
    const normSql = (col) => `LOWER(
      CASE WHEN INSTR(${col}, ', ') > 0
      THEN TRIM(SUBSTR(${col}, INSTR(${col}, ', ') + 2))
           || ' ' ||
           TRIM(SUBSTR(${col}, 1, INSTR(${col}, ', ') - 1))
      ELSE ${col}
      END
    )`;

    // Fix 1: NULL player_ids — match by normalized name
    const fixNull = await db.run(`
      UPDATE pool_picks
      SET player_id = (
        SELECT gp.id FROM golf_players gp
        WHERE ${normSql('pool_picks.player_name')} = LOWER(gp.name)
        LIMIT 1
      )
      WHERE player_id IS NULL
        AND EXISTS (
          SELECT 1 FROM golf_players gp
          WHERE ${normSql('pool_picks.player_name')} = LOWER(gp.name)
        )
    `);

    // Fix 2: Wrong player_ids — player_id exists but doesn't match any golf_players record
    const fixOrphan = await db.run(`
      UPDATE pool_picks
      SET player_id = (
        SELECT gp.id FROM golf_players gp
        WHERE ${normSql('pool_picks.player_name')} = LOWER(gp.name)
        LIMIT 1
      )
      WHERE player_id IS NOT NULL
        AND player_id NOT IN (SELECT id FROM golf_players)
        AND EXISTS (
          SELECT 1 FROM golf_players gp
          WHERE ${normSql('pool_picks.player_name')} = LOWER(gp.name)
        )
    `);

    // Fix 3: Mismatched player_ids — player_id points to wrong player
    const fixMismatch = await db.run(`
      UPDATE pool_picks
      SET player_id = (
        SELECT gp.id FROM golf_players gp
        WHERE ${normSql('pool_picks.player_name')} = LOWER(gp.name)
        LIMIT 1
      )
      WHERE EXISTS (
        SELECT 1 FROM golf_players gp
        WHERE ${normSql('pool_picks.player_name')} = LOWER(gp.name)
          AND gp.id != COALESCE(pool_picks.player_id, '')
      )
    `);

    const nullAfter = (await db.get('SELECT COUNT(*) as c FROM pool_picks WHERE player_id IS NULL')).c;
    const orphanAfter = (await db.get('SELECT COUNT(*) as c FROM pool_picks WHERE player_id NOT IN (SELECT id FROM golf_players)')).c;

    // Diagnostic: show remaining unresolved picks
    const unresolved = (await db.all(`
      SELECT DISTINCT player_name FROM pool_picks
      WHERE player_id IS NULL OR player_id NOT IN (SELECT id FROM golf_players)
    `)).map(r => r.player_name);

    console.log(`[admin] fix-pool-picks-player-ids: null ${nullBefore}→${nullAfter}, orphan→${orphanAfter}, fixes: null=${fixNull.changes} orphan=${fixOrphan.changes} mismatch=${fixMismatch.changes}`);
    res.json({
      ok: true,
      total_picks: before,
      null_before: nullBefore,
      null_after: nullAfter,
      orphan_after: orphanAfter,
      fixed_null: fixNull.changes,
      fixed_orphan: fixOrphan.changes,
      fixed_mismatch: fixMismatch.changes,
      unresolved_names: unresolved,
    });
  } catch (e) {
    console.error('[admin] fix-pool-picks-player-ids error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── POST /admin/dev/fix-pool-picks-unicode ────────────────────────────────────
// JS-side fix: re-links pool_picks.player_id for NO_MATCH picks using the same
// normalizePlayerName() algorithm used by the sync. Handles diacritics (å, ö, etc.)
// that SQLite LOWER() cannot match. Pass ?tournament_id= to scope to one tournament.
router.post('/admin/dev/fix-pool-picks-unicode', superadmin, async (req, res) => {
  const { normalizePlayerName } = require('../utils/playerNameNorm');
  const { tournament_id } = req.query;

  // Helper: convert "Lastname, Firstname" → "Firstname Lastname"
  function toFirstLast(name) {
    if (!name) return name;
    const commaIdx = name.indexOf(', ');
    if (commaIdx === -1) return name;
    return `${name.slice(commaIdx + 2)} ${name.slice(0, commaIdx)}`;
  }

  // Get all NO_MATCH picks (pool_picks where no golf_scores row exists for the player_id)
  const noMatchQuery = tournament_id
    ? await db.all(`
        SELECT DISTINCT pp.player_id, pp.player_name, pp.tournament_id
        FROM pool_picks pp
        LEFT JOIN golf_scores gs ON gs.player_id = pp.player_id AND gs.tournament_id = pp.tournament_id
        WHERE pp.tournament_id = ? AND gs.player_id IS NULL
      `, tournament_id)
    : await db.all(`
        SELECT DISTINCT pp.player_id, pp.player_name, pp.tournament_id
        FROM pool_picks pp
        LEFT JOIN golf_scores gs ON gs.player_id = pp.player_id AND gs.tournament_id = pp.tournament_id
        JOIN golf_tournaments gt ON gt.id = pp.tournament_id AND gt.status IN ('active', 'completed')
        WHERE gs.player_id IS NULL
      `);

  // Get all golf_scores players for relevant tournaments (for matching)
  const gsPlayers = tournament_id
    ? await db.all(`
        SELECT gs.player_id, gs.tournament_id, gp.name
        FROM golf_scores gs JOIN golf_players gp ON gp.id = gs.player_id
        WHERE gs.tournament_id = ?
      `, tournament_id)
    : await db.all(`
        SELECT gs.player_id, gs.tournament_id, gp.name
        FROM golf_scores gs JOIN golf_players gp ON gp.id = gs.player_id
        JOIN golf_tournaments gt ON gt.id = gs.tournament_id AND gt.status IN ('active', 'completed')
      `);

  // Build lookup: tournament_id → Map(normalizedName → player_id)
  const gsByTournament = {};
  for (const row of gsPlayers) {
    if (!gsByTournament[row.tournament_id]) gsByTournament[row.tournament_id] = new Map();
    const norm = normalizePlayerName(toFirstLast(row.name));
    gsByTournament[row.tournament_id].set(norm, row.player_id);
  }

  const results = [];
  const updateSql = 'UPDATE pool_picks SET player_id = ? WHERE player_id = ? AND tournament_id = ?';

  for (const pick of noMatchQuery) {
    const gsMap = gsByTournament[pick.tournament_id];
    if (!gsMap) { results.push({ player_name: pick.player_name, status: 'no_scores_for_tournament' }); continue; }

    const searchName = toFirstLast(pick.player_name);
    const normSearch = normalizePlayerName(searchName);
    const newId = gsMap.get(normSearch);

    if (!newId) {
      results.push({ player_name: pick.player_name, normalized: normSearch, status: 'no_match_in_scores' });
      continue;
    }
    if (newId === pick.player_id) {
      results.push({ player_name: pick.player_name, status: 'already_correct' });
      continue;
    }

    const info = await db.run(updateSql, newId, pick.player_id, pick.tournament_id);
    results.push({ player_name: pick.player_name, old_id: pick.player_id, new_id: newId, updated: info.changes, status: 'fixed' });
  }

  const fixed = results.filter(r => r.status === 'fixed').reduce((sum, r) => sum + (r.updated || 0), 0);
  console.log(`[admin] fix-pool-picks-unicode: ${fixed} picks updated for ${results.length} distinct players`);
  res.json({ ok: true, fixed, details: results });
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
    const counts = await db.get(
      'SELECT SUM(is_withdrawn) AS wd_count, COUNT(*) AS total FROM pool_tier_players WHERE tournament_id = ?',
      tournament_id
    );
    res.json({ ok: true, wd_count: counts?.wd_count || 0, total: counts?.total || 0 });
  } catch (err) {
    console.error('[admin] sync-wd-field error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/dev/mass-email-preview ─────────────────────────────────────────
// Returns the recipient list for a given audience without sending anything.
// audience: 'all_users' | tournament_id (UUID)
router.get('/admin/dev/mass-email-preview', superadmin, async (req, res) => {
  try {
    const { audience } = req.query;
    if (!audience) return res.status(400).json({ error: 'audience required' });

    let recipients;
    if (audience === 'all_users') {
      recipients = await db.all(
        "SELECT u.id, u.email, u.username FROM users u WHERE u.email IS NOT NULL AND u.email != '' ORDER BY u.created_at DESC"
      );
    } else {
      // audience is a tournament_id — get all users who have pool_picks for that tournament
      recipients = await db.all(`
        SELECT DISTINCT u.id, u.email, u.username
        FROM users u
        JOIN pool_picks pp ON pp.user_id = u.id
        WHERE pp.tournament_id = ? AND u.email IS NOT NULL AND u.email != ''
        ORDER BY u.username ASC
      `, audience);
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
      recipients = await db.all(
        "SELECT u.id, u.email, u.username FROM users u WHERE u.email IS NOT NULL AND u.email != '' ORDER BY u.created_at DESC"
      );
    } else {
      recipients = await db.all(`
        SELECT DISTINCT u.id, u.email, u.username
        FROM users u
        JOIN pool_picks pp ON pp.user_id = u.id
        WHERE pp.tournament_id = ? AND u.email IS NOT NULL AND u.email != ''
        ORDER BY u.username ASC
      `, audience);
    }

    if (!recipients.length) return res.status(400).json({ error: 'No recipients found for this audience' });

    console.log(`[admin] Mass email: sending to ${recipients.length} recipients (audience: ${audience})`);

    const mailerModule = require('../mailer');
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    // Send in batches of 10, 1 second pause between batches.
    // Within each batch send sequentially with 300ms delay to stay under
    // Resend's 5 req/s limit (3 req/s = safe margin).
    const BATCH_SIZE = 10;
    const DELAY_BETWEEN_EMAILS_MS = 300;
    const DELAY_BETWEEN_BATCHES_MS = 1000;

    let sentCount = 0;
    const failed = [];

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      for (const r of batch) {
        const firstName = r.username ? r.username.split(/[\s_]/)[0] : r.username;
        try {
          await mailerModule.sendSuperAdminBlast(r.email, firstName, subject, body_text);
          sentCount++;
        } catch (emailErr) {
          console.error(`[admin] Mass email FAILED for ${r.email}:`, emailErr.message);
          failed.push({ email: r.email, error: emailErr.message });
        }
        // Throttle: 300ms between each individual send
        await sleep(DELAY_BETWEEN_EMAILS_MS);
      }

      // Progress log after each batch
      console.log(`[admin] Mass email progress: Sent ${sentCount}/${recipients.length}${failed.length ? `, ${failed.length} failed` : ''}`);

      // Pause 1 second between batches (skip after the last batch)
      if (i + BATCH_SIZE < recipients.length) {
        await sleep(DELAY_BETWEEN_BATCHES_MS);
      }
    }

    // Log the send
    const logId = uuidv4();
    await db.run(
      'INSERT INTO mass_email_log (id, sent_by, audience, subject, body_preview, recipient_count) VALUES (?, ?, ?, ?, ?, ?)',
      logId, req.user.id, audience, subject, body_text.slice(0, 300), sentCount
    );

    console.log(`[admin] Mass email complete: ${sentCount} sent, ${failed.length} failed. log_id=${logId}`);
    res.json({
      ok: true,
      sent: sentCount,
      failed: failed.length,
      failed_addresses: failed.map(f => f.email),
      log_id: logId,
    });
  } catch (err) {
    console.error('[admin] mass-email error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /admin/dev/mass-email-log ─────────────────────────────────────────────
router.get('/admin/dev/mass-email-log', superadmin, async (req, res) => {
  try {
    const logs = await db.all(`
      SELECT mel.*, u.username AS sent_by_username
      FROM mass_email_log mel
      LEFT JOIN users u ON u.id = mel.sent_by
      ORDER BY mel.sent_at DESC
      LIMIT 20
    `);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Temporary tier diagnostic endpoint ────────────────────────────────────────
router.post('/admin/dev/tier-diag', superadmin, async (req, res) => {
  try {
    const leagues = await db.all(`
      SELECT id, name, pool_tiers FROM golf_leagues
      WHERE name LIKE '%dhaul%' OR name LIKE '%Dhaul%'
        OR name LIKE '%masters%' OR name LIKE '%Masters%'
      LIMIT 5
    `);

    const leagueId = (await db.get(
      "SELECT id FROM golf_leagues WHERE name LIKE '%dhaul%' LIMIT 1"
    ))?.id;

    let tier_distribution = [];
    let null_odds_count = 0;
    let sample_players = [];

    if (leagueId) {
      tier_distribution = await db.all(`
        SELECT tier_number, COUNT(*) as cnt,
          MIN(odds_decimal) as min_odds, MAX(odds_decimal) as max_odds
        FROM pool_tier_players
        WHERE league_id = ?
        GROUP BY tier_number ORDER BY tier_number
      `, leagueId);

      null_odds_count = (await db.get(`
        SELECT COUNT(*) as cnt FROM pool_tier_players
        WHERE league_id = ? AND (odds_decimal IS NULL OR odds_decimal = 0)
      `, leagueId))?.cnt || 0;

      sample_players = await db.all(`
        SELECT player_name, tier_number, odds_display, odds_decimal
        FROM pool_tier_players WHERE league_id = ?
        ORDER BY tier_number ASC, odds_decimal ASC LIMIT 20
      `, leagueId);
    }

    // Flag tier imbalance warnings
    const warnings = [];
    for (const t of tier_distribution) {
      if (t.cnt > 30) warnings.push(`T${t.tier_number} has ${t.cnt} players — consider narrowing the odds range`);
      if (t.cnt === 0) warnings.push(`T${t.tier_number} is empty — no players match the odds range`);
    }

    // Check pick/tier mismatches
    let pick_tier_mismatches = [];
    if (leagueId) {
      pick_tier_mismatches = await db.all(`
        SELECT pp.player_name, pp.tier_number as pick_tier, ptp.tier_number as current_tier
        FROM pool_picks pp
        JOIN pool_tier_players ptp ON pp.player_id = ptp.player_id AND pp.league_id = ptp.league_id
        WHERE pp.league_id = ? AND pp.tier_number != ptp.tier_number
      `, leagueId);
      if (pick_tier_mismatches.length > 0) {
        warnings.push(`${pick_tier_mismatches.length} picks have tier mismatches — players moved tiers since picks were submitted`);
      }
    }

    res.json({ leagues, tier_distribution, null_odds_count, sample_players, league_id: leagueId, warnings, pick_tier_mismatches });
  } catch (err) {
    console.error('[tier-diag]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Rebuild tiers for a specific league from its pool_tiers config ────────────
router.post('/admin/dev/rebuild-league-tiers', superadmin, async (req, res) => {
  try {
    const { league_id } = req.body;
    if (!league_id) return res.status(400).json({ error: 'league_id required' });

    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', league_id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (!league.pool_tournament_id) return res.status(400).json({ error: 'No tournament linked' });

    const tid = league.pool_tournament_id;
    let tiersConfig = [];
    try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}
    if (!tiersConfig.length) return res.status(400).json({ error: 'No tier config on league' });
    tiersConfig.sort((a, b) => a.tier - b.tier);

    function oddsToDecimal(str) {
      if (!str) return Infinity;
      const parts = String(str).split(':').map(Number);
      if (parts.length !== 2 || isNaN(parts[0]) || !parts[1]) return Infinity;
      return parts[0] / parts[1] + 1;
    }

    // Get all field players with odds
    const fieldPlayers = await db.all(`
      SELECT tf.player_id, tf.player_name, tf.odds_display, tf.odds_decimal, tf.world_ranking,
             gp.country
      FROM golf_tournament_fields tf
      LEFT JOIN golf_players gp ON gp.id = tf.player_id
      WHERE tf.tournament_id = ?
      ORDER BY tf.odds_decimal ASC
    `, tid);

    // Also include picked players not in field (WDs)
    const pickedNotInField = await db.all(`
      SELECT DISTINCT pp.player_id, pp.player_name, gp.country,
        ptp.odds_display, ptp.odds_decimal, ptp.world_ranking, ptp.tier_number
      FROM pool_picks pp
      LEFT JOIN golf_players gp ON gp.id = pp.player_id
      LEFT JOIN pool_tier_players ptp ON ptp.league_id = pp.league_id AND ptp.player_id = pp.player_id
      WHERE pp.league_id = ? AND pp.tournament_id = ?
        AND pp.player_id NOT IN (SELECT player_id FROM golf_tournament_fields WHERE tournament_id = ?)
    `, league_id, tid, tid);

    // Preserve manual overrides
    const overridden = new Map();
    (await db.all('SELECT player_id, tier_number, salary FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND manually_overridden = 1',
      league_id, tid))
      .forEach(r => overridden.set(r.player_id, r));

    // Clear and rebuild
    await db.run('DELETE FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND manually_overridden = 0',
      league_id, tid);

    const TIER_SALARY = { 1: 900, 2: 700, 3: 500, 4: 300, 5: 150, 6: 100 };

    const insSql = `
      INSERT OR REPLACE INTO pool_tier_players
        (id, league_id, tournament_id, player_id, player_name, tier_number,
         odds_display, odds_decimal, world_ranking, salary, country, is_withdrawn)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    let assigned = 0;
    await db.transaction(async (tx) => {
      for (const p of fieldPlayers) {
        if (overridden.has(p.player_id)) continue;
        const od = p.odds_decimal || 999;

        // Match to league's tier config
        let tierNum = tiersConfig[tiersConfig.length - 1]?.tier || 1;
        for (const t of tiersConfig) {
          const min = oddsToDecimal(t.odds_min) || 0;
          const max = oddsToDecimal(t.odds_max) || Infinity;
          if (od >= min && od <= max) { tierNum = t.tier; break; }
        }

        const salary = TIER_SALARY[tierNum] || 150;
        await tx.run(insSql, league_id, tid, p.player_id, p.player_name, tierNum,
          p.odds_display, od, p.world_ranking, salary, p.country, 0);
        assigned++;
      }

      // Re-add WD players (picked but not in field)
      for (const p of pickedNotInField) {
        if (overridden.has(p.player_id)) continue;
        const tierNum = p.tier_number || tiersConfig[tiersConfig.length - 1]?.tier || 1;
        const salary = TIER_SALARY[tierNum] || 150;
        await tx.run(insSql, league_id, tid, p.player_id, p.player_name, tierNum,
          p.odds_display, p.odds_decimal, p.world_ranking, salary, p.country, 1);
        assigned++;
      }
    });

    // Get final distribution
    const dist = await db.all('SELECT tier_number, COUNT(*) as cnt FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? GROUP BY tier_number ORDER BY tier_number',
      league_id, tid);

    const warnings = [];
    for (const t of dist) {
      if (t.cnt > 30) warnings.push(`T${t.tier_number} has ${t.cnt} players — odds range may be too wide`);
      if (t.cnt === 0) warnings.push(`T${t.tier_number} is empty — no players match the odds range`);
    }

    res.json({
      ok: true,
      league: league.name,
      assigned,
      wd_players: pickedNotInField.length,
      overridden: overridden.size,
      tier_distribution: dist,
      tiers_config: tiersConfig,
      warnings,
    });
  } catch (err) {
    console.error('[rebuild-tiers]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Pre-tournament player integrity check + fix ──────────────────────────────
// Finds tier players with no golf_players record or null country, and fixes them.
router.post('/admin/dev/preflight-players', superadmin, async (req, res) => {
  try {
    const mastersId = (await db.get(
      "SELECT id FROM golf_tournaments WHERE name = 'Masters Tournament' AND season_year = 2026"
    ))?.id;
    if (!mastersId) return res.json({ error: 'Masters not found' });

    // 1. Find tier players with missing golf_players record or null country
    const problems = await db.all(`
      SELECT DISTINCT ptp.player_name, ptp.player_id, ptp.country AS ptp_country,
        gp.id AS gp_id, gp.name AS gp_name, gp.country AS gp_country
      FROM pool_tier_players ptp
      LEFT JOIN golf_players gp ON gp.id = ptp.player_id
      WHERE ptp.tournament_id = ?
        AND (gp.id IS NULL OR gp.country IS NULL OR gp.country = '' OR ptp.country IS NULL OR ptp.country = '')
    `, mastersId);

    // 2. Also check golf_tournament_fields for unlinked players
    const fieldOrphans = await db.all(`
      SELECT tf.player_name, tf.player_id, gp.id AS gp_id
      FROM golf_tournament_fields tf
      LEFT JOIN golf_players gp ON gp.id = tf.player_id
      WHERE tf.tournament_id = ? AND gp.id IS NULL
    `, mastersId);

    // 3. Try to fix: fetch ESPN field for country data
    let espnCountries = {};
    try {
      const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=401811941');
      const d = await r.json();
      const comps = d?.events?.[0]?.competitions?.[0]?.competitors || [];
      const COUNTRY_MAP = {
        'United States': 'US', 'England': 'GB', 'Scotland': 'GB', 'Wales': 'GB',
        'Northern Ireland': 'GB', 'Ireland': 'IE', 'Canada': 'CA', 'Australia': 'AU',
        'South Korea': 'KR', 'Korea': 'KR', 'Japan': 'JP', 'South Africa': 'ZA',
        'Sweden': 'SE', 'Norway': 'NO', 'Denmark': 'DK', 'Germany': 'DE', 'France': 'FR',
        'Spain': 'ES', 'Italy': 'IT', 'Colombia': 'CO', 'Argentina': 'AR', 'Mexico': 'MX',
        'China': 'CN', 'Thailand': 'TH', 'New Zealand': 'NZ', 'Belgium': 'BE',
        'Finland': 'FI', 'Austria': 'AT', 'Fiji': 'FJ', 'Netherlands': 'NL',
      };
      for (const c of comps) {
        const name = c.athlete?.displayName || '';
        const countryAlt = c.athlete?.flag?.alt || '';
        if (name && countryAlt) espnCountries[name] = COUNTRY_MAP[countryAlt] || null;
      }
    } catch (e) { /* non-fatal */ }

    // 4. Fix missing golf_players records and null countries
    const insPlayerSql = "INSERT OR IGNORE INTO golf_players (id, name, country, is_active, world_ranking) VALUES (lower(hex(randomblob(16))), ?, ?, 1, 999)";
    const updCountrySql = 'UPDATE golf_players SET country = ? WHERE id = ? AND (country IS NULL OR country = \'\')';
    const updPtpCountrySql = 'UPDATE pool_tier_players SET country = ? WHERE player_name = ? AND (country IS NULL OR country = \'\')';

    let created = 0, countriesFixed = 0;

    // Create missing golf_players
    for (const p of [...problems, ...fieldOrphans]) {
      if (!p.gp_id && p.player_name) {
        const country = espnCountries[p.player_name] || null;
        await db.run(insPlayerSql, p.player_name, country);
        created++;
        // Re-link pool_tier_players and tournament_fields
        const newGp = await db.get('SELECT id FROM golf_players WHERE name = ?', p.player_name);
        if (newGp) {
          await db.run('UPDATE pool_tier_players SET player_id = ? WHERE player_name = ? AND player_id = ?',
            newGp.id, p.player_name, p.player_id);
          await db.run('UPDATE golf_tournament_fields SET player_id = ? WHERE player_name = ? AND player_id = ?',
            newGp.id, p.player_name, p.player_id);
        }
      }
    }

    // Fix null countries from ESPN data
    const allPlayers = await db.all("SELECT id, name FROM golf_players WHERE country IS NULL OR country = ''");
    for (const gp of allPlayers) {
      const country = espnCountries[gp.name];
      if (country) {
        await db.run(updCountrySql, country, gp.id);
        await db.run(updPtpCountrySql, country, gp.name);
        countriesFixed++;
      }
    }

    // Re-check after fixes
    const remaining = await db.all(`
      SELECT DISTINCT ptp.player_name, gp.id AS gp_id, gp.country
      FROM pool_tier_players ptp
      LEFT JOIN golf_players gp ON gp.id = ptp.player_id
      WHERE ptp.tournament_id = ?
        AND (gp.id IS NULL OR gp.country IS NULL OR gp.country = '')
    `, mastersId);

    res.json({
      problems_found: problems.length,
      field_orphans: fieldOrphans.length,
      players_created: created,
      countries_fixed: countriesFixed,
      espn_countries_available: Object.keys(espnCountries).length,
      still_missing: remaining.map(r => ({ name: r.player_name, has_gp: !!r.gp_id, country: r.country })),
    });
  } catch (err) {
    console.error('[preflight-players]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Force DataGolf odds re-sync for a specific league (bypasses tier lock) ────
// Use ONLY to restore corrupted tier data from DataGolf source of truth.
router.post('/admin/dev/restore-league-from-datagolf', superadmin, async (req, res) => {
  try {
    const { league_id } = req.body;
    if (!league_id) return res.status(400).json({ error: 'league_id required' });

    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', league_id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (!league.pool_tournament_id) return res.status(400).json({ error: 'No tournament linked' });

    // Step 1: trigger DataGolf field sync to refresh golf_tournament_fields with real odds
    try {
      const { syncCurrentField } = require('../dataGolfService');
      await syncCurrentField();
      console.log('[restore] DataGolf field sync complete');
    } catch (e) {
      console.error('[restore] DataGolf field sync error:', e.message);
    }

    // Step 2: trigger DataGolf odds sync — temporarily remove the guard
    try {
      const { syncDgOddsTiers } = require('../dataGolfService');
      // The guard blocks when leagues exist, so we call the internal rebuild directly
      const tid = league.pool_tournament_id;
      const tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', tid);

      // Fetch fresh odds from DataGolf
      const https = require('https');
      const key = process.env.DATAGOLF_API_KEY;
      if (!key) return res.status(400).json({ error: 'DATAGOLF_API_KEY not set' });

      const oddsData = await new Promise((resolve, reject) => {
        https.get(
          `https://feeds.datagolf.com/betting-tools/outrights?tour=pga&market=win&odds_format=american&key=${key}`,
          { headers: { 'User-Agent': 'TourneyRun/1.0', Accept: 'application/json' }, timeout: 20000 },
          r => {
            let body = '';
            r.on('data', c => body += c);
            r.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('JSON parse error')); } });
          }
        ).on('error', reject);
      });

      const odds = Array.isArray(oddsData) ? oddsData : (oddsData.odds || oddsData.players || oddsData.data || []);

      // Build player odds lookup
      const DG_BOOK_PREFS = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'pointsbetus', 'betrivers'];
      const byName = new Map();
      for (const p of odds) {
        let american = null;
        for (const bk of DG_BOOK_PREFS) {
          if (p[bk] != null) { american = p[bk]; break; }
        }
        if (american == null) continue;
        const ratio = american > 0 ? american / 100 : 100 / Math.abs(american);
        const nice = ratio < 5 ? Math.round(ratio * 4) / 4 :
                     ratio < 20 ? Math.round(ratio * 2) / 2 :
                     ratio < 100 ? Math.round(ratio / 5) * 5 :
                     Math.round(ratio / 25) * 25;
        const display = `${nice}:1`;
        const decimal = nice + 1;
        const norm = (p.player_name || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        byName.set(norm, { display, decimal, american });
        if (p.player_name?.includes(',')) {
          const [last, first] = p.player_name.split(',').map(s => s.trim().toLowerCase());
          if (first) byName.set(`${first} ${last}`.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), { display, decimal, american });
        }
      }

      // Parse league tier config
      let tiersConfig = [];
      try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}
      tiersConfig.sort((a, b) => a.tier - b.tier);

      function oddsStrToDecimal(str) {
        if (!str) return Infinity;
        const parts = String(str).split(':').map(Number);
        if (parts.length !== 2 || isNaN(parts[0]) || !parts[1]) return Infinity;
        return parts[0] / parts[1] + 1;
      }

      // Get all field players
      const fieldPlayers = await db.all(`
        SELECT tf.player_id, tf.player_name, gp.country, gp.name as gp_name
        FROM golf_tournament_fields tf
        LEFT JOIN golf_players gp ON gp.id = tf.player_id
        WHERE tf.tournament_id = ?
      `, tid);

      // Rebuild pool_tier_players — skip rows where odds are already locked
      const force = !!req.body.force; // pass force:true to overwrite locked odds
      const insPtpSql = `
        INSERT OR IGNORE INTO pool_tier_players
          (id, league_id, tournament_id, player_id, player_name, tier_number,
           odds_display, odds_decimal, world_ranking, salary, country, odds_locked_at)
        VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `;
      const updPtpSql = `
        UPDATE pool_tier_players SET tier_number = ?, odds_display = ?, odds_decimal = ?,
          world_ranking = ?, salary = ?, country = ?, odds_locked_at = datetime('now')
        WHERE league_id = ? AND player_id = ? AND (odds_locked_at IS NULL OR ? = 1)
      `;
      const TIER_SALARY = { 1: 900, 2: 700, 3: 500, 4: 300, 5: 150, 6: 100, 7: 50 };

      let assigned = 0, noOdds = 0, skippedLocked = 0;
      await db.transaction(async (tx) => {
        for (const p of fieldPlayers) {
          const norm = (p.gp_name || p.player_name || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const o = byName.get(norm);

          let display, decimal;
          if (o) {
            display = o.display;
            decimal = o.decimal;
          } else {
            display = '200:1';
            decimal = 201;
            noOdds++;
          }

          // Assign tier from league config
          let tierNum = tiersConfig.length ? tiersConfig[tiersConfig.length - 1].tier : 1;
          for (const t of tiersConfig) {
            const min = oddsStrToDecimal(t.odds_min) || 0;
            const max = oddsStrToDecimal(t.odds_max) || Infinity;
            if (decimal >= min && decimal <= max) { tierNum = t.tier; break; }
          }

          const salary = TIER_SALARY[tierNum] || 100;
          const gp = await tx.get('SELECT world_ranking FROM golf_players WHERE id = ?', p.player_id);

          // Try INSERT first (new player), then UPDATE (existing — respects lock)
          const insResult = await tx.run(insPtpSql, league_id, tid, p.player_id, p.player_name, tierNum, display, decimal, gp?.world_ranking, salary, p.country);
          if (insResult.changes === 0) {
            // Row exists — update only if not locked (or force=true)
            const updResult = await tx.run(updPtpSql, tierNum, display, decimal, gp?.world_ranking, salary, p.country, league_id, p.player_id, force ? 1 : 0);
            if (updResult.changes === 0) skippedLocked++;
            else assigned++;
          } else {
            assigned++;
          }
        }
      });

      const dist = await db.all('SELECT tier_number, COUNT(*) as cnt, MIN(odds_decimal) as min_odds, MAX(odds_decimal) as max_odds FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? GROUP BY tier_number ORDER BY tier_number',
        league_id, tid);

      // Check pick/tier mismatches
      const mismatches = await db.all(`
        SELECT pp.player_name, pp.tier_number as pick_tier, ptp.tier_number as current_tier
        FROM pool_picks pp
        JOIN pool_tier_players ptp ON pp.player_id = ptp.player_id AND pp.league_id = ptp.league_id
        WHERE pp.league_id = ? AND pp.tier_number != ptp.tier_number
      `, league_id);

      res.json({
        ok: true,
        league: league.name,
        dg_odds_count: byName.size,
        assigned,
        no_odds: noOdds,
        skipped_locked: skippedLocked,
        tier_distribution: dist,
        event_name: oddsData.event_name || '',
        pick_tier_mismatches: mismatches,
      });
    } catch (e) {
      console.error('[restore] odds rebuild error:', e.message);
      res.status(500).json({ error: e.message });
    }
  } catch (err) {
    console.error('[restore]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── EMERGENCY: reset league to pre-tournament state ──────────────────────────
router.post('/admin/dev/emergency-reset-league', superadmin, async (req, res) => {
  try {
    const { league_id } = req.body;
    if (!league_id) return res.status(400).json({ error: 'league_id required' });

    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', league_id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    // Snapshot current state before reset
    const before = {
      status: league.status,
      picks_locked: league.picks_locked,
      picks_lock_time: league.picks_lock_time,
      pool_tournament_id: league.pool_tournament_id,
      format_type: league.format_type,
      pick_sheet_format: league.pick_sheet_format,
    };

    // Reset to lobby + unlocked
    await db.run(`
      UPDATE golf_leagues
      SET status = 'lobby', picks_locked = 0
      WHERE id = ?
    `, league_id);

    // Also ensure tournament is scheduled (not accidentally flipped)
    if (league.pool_tournament_id) {
      const tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', league.pool_tournament_id);
      if (tourn && tourn.status !== 'completed') {
        // Only reset if tournament hasn't actually started
        const started = new Date() >= new Date(tourn.start_date + 'T12:00:00Z');
        if (!started) {
          await db.run("UPDATE golf_tournaments SET status = 'scheduled' WHERE id = ?", tourn.id);
        }
      }
    }

    const after = await db.get('SELECT status, picks_locked, picks_lock_time FROM golf_leagues WHERE id = ?', league_id);

    // Full diagnostic
    let poolTiers = [];
    try { poolTiers = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}

    const tid = league.pool_tournament_id;
    const tierPlayerCount = tid ? (await db.get('SELECT COUNT(*) as cnt FROM pool_tier_players WHERE league_id = ? AND tournament_id = ?', league_id, tid))?.cnt : 0;
    const tierDist = tid ? await db.all('SELECT tier_number, COUNT(*) as cnt FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? GROUP BY tier_number ORDER BY tier_number', league_id, tid) : [];
    const tourn = tid ? await db.get('SELECT id, name, status, espn_event_id, start_date FROM golf_tournaments WHERE id = ?', tid) : null;

    res.json({
      ok: true, league: league.name, before, after,
      diagnostic: {
        pool_tournament_id: tid,
        tournament: tourn,
        pool_tiers_config_count: poolTiers.length,
        pool_tiers_config: poolTiers,
        tier_player_count: tierPlayerCount,
        tier_distribution: tierDist,
      },
    });
  } catch (err) {
    console.error('[emergency-reset]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Test lock confirmation email ──────────────────────────────────────────────
router.post('/admin/dev/test-lock-email', superadmin, async (req, res) => {
  try {
    const { sendPicksLockConfirmation } = require('../mailer');
    const to = req.body.email || 'wohlbuiltventures@gmail.com';

    await sendPicksLockConfirmation(to, {
      username: 'TestUser',
      leagueName: "Dhaul's Masters Golf Pool",
      tournamentName: 'Masters Tournament',
      entries: [
        {
          entryNumber: 1, teamName: 'Dhaul42',
          tiebreaker: -14,
          picks: [
            { playerName: 'Scottie Scheffler', tierNumber: 1, odds: '5:1' },
            { playerName: 'Rory McIlroy', tierNumber: 2, odds: '12:1' },
            { playerName: 'Tommy Fleetwood', tierNumber: 2, odds: '20:1' },
            { playerName: 'Russell Henley', tierNumber: 3, odds: '50:1' },
            { playerName: 'Sepp Straka', tierNumber: 3, odds: '60:1' },
            { playerName: 'Jake Knapp', tierNumber: 4, odds: '70:1' },
            { playerName: 'Sam Stevens', tierNumber: 5, odds: '100:1' },
          ],
        },
        {
          entryNumber: 2, teamName: 'The Backup Plan',
          tiebreaker: -16,
          picks: [
            { playerName: 'Jon Rahm', tierNumber: 1, odds: '9.5:1' },
            { playerName: 'Xander Schauffele', tierNumber: 2, odds: '16:1' },
            { playerName: 'Collin Morikawa', tierNumber: 2, odds: '30:1' },
            { playerName: 'Brooks Koepka', tierNumber: 3, odds: '50:1' },
            { playerName: 'Justin Thomas', tierNumber: 3, odds: '65:1' },
            { playerName: 'Adam Scott', tierNumber: 4, odds: '70:1' },
            { playerName: 'Gary Woodland', tierNumber: 5, odds: '100:1' },
          ],
        },
      ],
      leagueUrl: 'https://www.tourneyrun.app/golf/league/test?tab=standings',
    });

    res.json({ ok: true, sent_to: to });
  } catch (err) {
    console.error('[test-lock-email]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Test round standings email ───────────────────────────────────────────────
router.post('/admin/dev/test-round-email', superadmin, async (req, res) => {
  try {
    const { sendRoundStandings } = require('../mailer');
    const to = req.body.email || 'wohlbuiltventures@gmail.com';
    const isFinal = !!req.body.final;

    await sendRoundStandings(to, {
      username: 'TestUser',
      leagueName: "Dhaul's Masters Golf Pool",
      tournamentName: 'Masters Tournament',
      roundNumber: isFinal ? 4 : 1,
      isFinal,
      winnerName: isFinal ? 'BirdieMachine (won tiebreaker)' : null,
      totalEntries: 34,
      scoringStyle: 'stroke_play',
      top5: [
        { rank: 1, teamName: 'BirdieMachine', score: -22 },
        { rank: 2, teamName: 'GolfDegen420', score: -20 },
        { rank: 3, teamName: 'Dhaul42', score: -18 },
        { rank: 4, teamName: 'AcesHigh', score: -16 },
        { rank: 5, teamName: 'FairwayFinder', score: -15 },
      ],
      userEntries: [
        { entryNumber: 1, teamName: 'TestUser', rank: 12, score: -9 },
        { entryNumber: 2, teamName: 'The Backup Plan', rank: 21, score: -6 },
      ],
      leagueUrl: 'https://www.tourneyrun.app/golf/league/test?tab=standings',
    });

    res.json({ ok: true, sent_to: to, final: isFinal });
  } catch (err) {
    console.error('[test-round-email]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── EMERGENCY: flip Last,First → First Last in pool_picks + re-anchor IDs ────
router.post('/admin/dev/fix-pick-names', superadmin, async (req, res) => {
  try {
    const tid = req.body.tournament_id || null;

    // Step 1: count before
    const whereTid = tid ? 'AND tournament_id = ?' : '';
    const args = tid ? [tid] : [];
    const before = (await db.get(`SELECT COUNT(*) as c FROM pool_picks WHERE player_name LIKE '%, %' ${whereTid}`, ...args)).c;

    // Step 2: flip all "Last, First" → "First Last"
    const flip = await db.run(`
      UPDATE pool_picks
      SET player_name =
        TRIM(SUBSTR(player_name, INSTR(player_name, ', ') + 2))
        || ' ' ||
        TRIM(SUBSTR(player_name, 1, INSTR(player_name, ', ') - 1))
      WHERE player_name LIKE '%, %' ${whereTid}
    `, ...args);

    const after = (await db.get(`SELECT COUNT(*) as c FROM pool_picks WHERE player_name LIKE '%, %' ${whereTid}`, ...args)).c;

    // Step 3: re-anchor player_ids by name
    const reanchor = await db.run(`
      UPDATE pool_picks SET player_id = (
        SELECT gp.id FROM golf_players gp WHERE LOWER(gp.name) = LOWER(pool_picks.player_name) LIMIT 1
      )
      WHERE EXISTS (
        SELECT 1 FROM golf_players gp WHERE LOWER(gp.name) = LOWER(pool_picks.player_name) AND gp.id != COALESCE(pool_picks.player_id, '')
      )
    `);

    // Step 4: JS-level fuzzy match — diacritics + nicknames + last-name fallback
    const norm = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const ALIASES = { sam: 'samuel', mike: 'michael', will: 'william', bob: 'robert', bill: 'william', jim: 'james', jimmy: 'james', johnny: 'john', nico: 'nicolas', nick: 'nicholas', matt: 'matthew', dan: 'daniel', ben: 'benjamin', chris: 'christopher', tom: 'thomas', tony: 'anthony', fred: 'frederick' };

    const allPlayers = await db.all('SELECT id, name FROM golf_players');
    const playerByNorm = new Map(allPlayers.map(p => [norm(p.name), p.id]));
    // Also index by last name for fallback
    const playerByLast = new Map();
    for (const p of allPlayers) {
      const parts = norm(p.name).split(' ');
      const last = parts[parts.length - 1];
      if (!playerByLast.has(last)) playerByLast.set(last, []);
      playerByLast.get(last).push(p);
    }

    const broken = await db.all(`
      SELECT id, player_name, player_id FROM pool_picks
      WHERE (player_id IS NULL OR player_id NOT IN (SELECT id FROM golf_players)) ${whereTid}
    `, ...args);

    let fuzzyFixed = 0;
    const updPickSql = 'UPDATE pool_picks SET player_id = ? WHERE id = ?';
    for (const pick of broken) {
      const n = norm(pick.player_name);
      // Try exact normalized match
      let match = playerByNorm.get(n);
      // Try alias expansion (Sam → Samuel)
      if (!match) {
        const parts = n.split(' ');
        const expanded = ALIASES[parts[0]];
        if (expanded) match = playerByNorm.get(expanded + ' ' + parts.slice(1).join(' '));
      }
      // Try last-name + first-initial match
      if (!match) {
        const parts = n.split(' ');
        const last = parts[parts.length - 1];
        const firstInit = parts[0]?.[0];
        const candidates = playerByLast.get(last) || [];
        if (candidates.length === 1) {
          match = candidates[0].id;
        } else if (firstInit) {
          const byInit = candidates.find(c => norm(c.name).split(' ')[0][0] === firstInit);
          if (byInit) match = byInit.id;
        }
      }
      if (match) {
        await db.run(updPickSql, typeof match === 'string' ? match : match, pick.id);
        fuzzyFixed++;
      }
    }

    // Step 5: final check
    const nullIds = (await db.get(`SELECT COUNT(*) as c FROM pool_picks WHERE player_id IS NULL ${whereTid}`, ...args)).c;
    const orphanIds = (await db.get(`SELECT COUNT(*) as c FROM pool_picks WHERE player_id NOT IN (SELECT id FROM golf_players) ${whereTid}`, ...args)).c;

    const unresolved = (await db.all(`
      SELECT DISTINCT player_name FROM pool_picks
      WHERE (player_id IS NULL OR player_id NOT IN (SELECT id FROM golf_players)) ${whereTid}
    `, ...args)).map(r => r.player_name);

    res.json({
      ok: true,
      last_first_before: before,
      last_first_after: after,
      flipped: flip.changes,
      reanchored: reanchor.changes,
      fuzzy_fixed: fuzzyFixed,
      null_player_ids: nullIds,
      orphan_player_ids: orphanIds,
      unresolved: unresolved,
    });
  } catch (err) {
    console.error('[fix-pick-names]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Manually send lock emails for an already-locked league ───────────────────
router.post('/admin/dev/send-lock-emails', superadmin, async (req, res) => {
  try {
    const { league_id } = req.body;
    if (!league_id) return res.status(400).json({ error: 'league_id required' });

    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', league_id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const tourn = league.pool_tournament_id
      ? await db.get('SELECT * FROM golf_tournaments WHERE id = ?', league.pool_tournament_id)
      : null;
    if (!tourn) return res.status(400).json({ error: 'No tournament linked' });

    // Clear previous send tracking so emails re-send
    await db.run('DELETE FROM lock_emails_sent WHERE league_id = ?', league_id);

    // Use the sendLockEmails function from golfPoolLockService
    const { sendLockEmails } = require('../golfPoolLockService');
    await sendLockEmails(league, tourn);

    const sent = (await db.get('SELECT COUNT(*) as c FROM lock_emails_sent WHERE league_id = ?', league_id)).c;
    res.json({ ok: true, league: league.name, emails_sent: sent });
  } catch (err) {
    console.error('[send-lock-emails]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
