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
    res.set('Content-Disposition', `attachment; filename="qr-${promo.code}.png"`);
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

module.exports = router;
