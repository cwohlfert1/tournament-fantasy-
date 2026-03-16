const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const superadmin = require('../middleware/superadmin');
const { performStartDraft } = require('../draftUtils');
const { pullBracket } = require('../bracketPoller');

const router = express.Router();

// ── Leagues ──────────────────────────────────────────────────────────────────

// GET /api/superadmin/leagues — all leagues
router.get('/leagues', superadmin, (req, res) => {
  try {
    const leagues = db.prepare(`
      SELECT
        l.*,
        u.username AS commissioner_username,
        u.email    AS commissioner_email,
        COUNT(DISTINCT lm.id) AS member_count,
        COALESCE(SUM(CASE WHEN mp.status = 'paid' THEN mp.amount ELSE 0 END), 0) AS total_paid
      FROM leagues l
      LEFT JOIN users u ON l.commissioner_id = u.id
      LEFT JOIN league_members lm ON lm.league_id = l.id
      LEFT JOIN member_payments mp ON mp.league_id = l.id
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `).all();
    res.json({ leagues });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/superadmin/leagues/:id — league detail with members + picks
router.get('/leagues/:id', superadmin, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const members = db.prepare(`
      SELECT lm.*, u.username, u.email,
             mp.status AS payment_status, mp.amount AS payment_amount,
             COUNT(dp.id) AS picks_made
      FROM league_members lm
      JOIN users u ON lm.user_id = u.id
      LEFT JOIN member_payments mp ON mp.league_id = lm.league_id AND mp.user_id = lm.user_id
      LEFT JOIN draft_picks dp ON dp.league_id = lm.league_id AND dp.user_id = lm.user_id
      WHERE lm.league_id = ?
      GROUP BY lm.id
      ORDER BY lm.draft_order
    `).all(req.params.id);

    res.json({ league, members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/superadmin/leagues/:id/start-draft — force start (bypasses commissioner check)
router.post('/leagues/:id/start-draft', superadmin, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.status !== 'lobby') return res.status(400).json({ error: `League status is "${league.status}", not lobby` });

    // Mark all pending payments paid so the gate passes
    db.prepare(`
      UPDATE member_payments SET status = 'paid', paid_at = CURRENT_TIMESTAMP
      WHERE league_id = ? AND status != 'paid'
    `).run(req.params.id);

    const io = req.app.get('io');
    const result = performStartDraft(req.params.id, io);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/superadmin/leagues/:id/pause-draft — pause by resetting to lobby
router.post('/leagues/:id/pause-draft', superadmin, (req, res) => {
  try {
    db.prepare("UPDATE leagues SET status = 'lobby' WHERE id = ?").run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/superadmin/leagues/:id — edit league settings
router.put('/leagues/:id', superadmin, (req, res) => {
  try {
    const { name, max_teams, total_rounds, pick_time_limit, buy_in_amount,
            payout_first, payout_second, payout_third, status } = req.body;

    db.prepare(`
      UPDATE leagues SET
        name             = COALESCE(?, name),
        max_teams        = COALESCE(?, max_teams),
        total_rounds     = COALESCE(?, total_rounds),
        pick_time_limit  = COALESCE(?, pick_time_limit),
        buy_in_amount    = COALESCE(?, buy_in_amount),
        payout_first     = COALESCE(?, payout_first),
        payout_second    = COALESCE(?, payout_second),
        payout_third     = COALESCE(?, payout_third),
        status           = COALESCE(?, status)
      WHERE id = ?
    `).run(name, max_teams, total_rounds, pick_time_limit, buy_in_amount,
           payout_first, payout_second, payout_third, status, req.params.id);

    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(req.params.id);
    res.json({ league });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/superadmin/leagues/:id — delete league and all related data
router.delete('/leagues/:id', superadmin, (req, res) => {
  try {
    const league = db.prepare('SELECT id FROM leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    db.transaction(() => {
      db.prepare('DELETE FROM draft_picks WHERE league_id = ?').run(req.params.id);
      db.prepare('DELETE FROM member_payments WHERE league_id = ?').run(req.params.id);
      db.prepare('DELETE FROM smart_draft_upgrades WHERE league_id = ?').run(req.params.id);
      db.prepare('DELETE FROM scoring_settings WHERE league_id = ?').run(req.params.id);
      db.prepare('DELETE FROM league_members WHERE league_id = ?').run(req.params.id);
      db.prepare('DELETE FROM payouts WHERE league_id = ?').run(req.params.id);
      db.prepare('DELETE FROM leagues WHERE id = ?').run(req.params.id);
    })();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Users ─────────────────────────────────────────────────────────────────────

// GET /api/superadmin/users — all users
router.get('/users', superadmin, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT
        u.id, u.email, u.username, u.role, u.created_at,
        u.stripe_account_status,
        COUNT(DISTINCT lm.league_id) AS league_count
      FROM users u
      LEFT JOIN league_members lm ON lm.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `).all();
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/superadmin/users/:id/ban — toggle ban (sets role to 'banned' or back to 'user')
router.put('/users/:id/ban', superadmin, (req, res) => {
  try {
    const { banned } = req.body;
    const newRole = banned ? 'banned' : 'user';
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(newRole, req.params.id);
    res.json({ success: true, role: newRole });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/superadmin/users/:id/reset-password — set a new password
router.put('/users/:id/reset-password', superadmin, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const hash = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Players ───────────────────────────────────────────────────────────────────

// GET /api/superadmin/players — all players
router.get('/players', superadmin, (req, res) => {
  try {
    const players = db.prepare(`
      SELECT * FROM players ORDER BY seed, region, name
    `).all();
    res.json({ players });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/superadmin/players — add a player
router.post('/players', superadmin, (req, res) => {
  try {
    const { name, team, position, seed, region, season_ppg } = req.body;
    if (!name || !team) return res.status(400).json({ error: 'name and team are required' });
    const id = uuidv4();
    db.prepare(`
      INSERT INTO players (id, name, team, position, seed, region, season_ppg)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, team, position || null, seed || null, region || null, season_ppg || 0);
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
    res.status(201).json({ player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/superadmin/players/:id — edit a player
router.put('/players/:id', superadmin, (req, res) => {
  try {
    const { name, team, position, seed, region, season_ppg, is_eliminated } = req.body;
    db.prepare(`
      UPDATE players SET
        name         = COALESCE(?, name),
        team         = COALESCE(?, team),
        position     = COALESCE(?, position),
        seed         = COALESCE(?, seed),
        region       = COALESCE(?, region),
        season_ppg   = COALESCE(?, season_ppg),
        is_eliminated = COALESCE(?, is_eliminated)
      WHERE id = ?
    `).run(name, team, position, seed, region, season_ppg, is_eliminated, req.params.id);
    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(req.params.id);
    res.json({ player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/superadmin/players/:id — remove a player
router.delete('/players/:id', superadmin, (req, res) => {
  try {
    db.prepare('DELETE FROM draft_picks WHERE player_id = ?').run(req.params.id);
    db.prepare('DELETE FROM player_stats WHERE player_id = ?').run(req.params.id);
    db.prepare('DELETE FROM players WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/superadmin/players/:id/injury — update injury status
router.put('/players/:id/injury', superadmin, (req, res) => {
  try {
    const { status = '', headline = '' } = req.body;
    const flagged = status !== '' ? 1 : 0;
    db.prepare(`
      UPDATE players SET injury_flagged = ?, injury_status = ?, injury_headline = ? WHERE id = ?
    `).run(flagged, status.toUpperCase(), headline, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/superadmin/pull-bracket — trigger ESPN bracket pull
router.post('/pull-bracket', superadmin, async (req, res) => {
  try {
    const result = await pullBracket();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/superadmin/pull-schedule — trigger full tournament schedule pull
router.post('/pull-schedule', superadmin, async (req, res) => {
  try {
    const { pullSchedule } = require('../espnPoller');
    const io = req.app.get('io');
    const result = await pullSchedule(io);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Financials ────────────────────────────────────────────────────────────────

// GET /api/superadmin/financials — payment overview
router.get('/financials', superadmin, (req, res) => {
  try {
    const totals = db.prepare(`
      SELECT
        COUNT(*)                                                   AS total_payments,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END), 0) AS total_revenue,
        COUNT(CASE WHEN status = 'paid' THEN 1 END)               AS paid_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END)            AS pending_count
      FROM member_payments
    `).get();

    const byEntryFee = db.prepare(`
      SELECT
        l.buy_in_amount                                               AS entry_fee,
        COUNT(DISTINCT l.id)                                          AS league_count,
        COUNT(CASE WHEN mp.status = 'paid' THEN 1 END)               AS paid_entries,
        COALESCE(SUM(CASE WHEN mp.status = 'paid' THEN mp.amount END), 0) AS revenue
      FROM leagues l
      LEFT JOIN member_payments mp ON mp.league_id = l.id
      GROUP BY l.buy_in_amount
      ORDER BY revenue DESC
    `).all();

    const recentPayments = db.prepare(`
      SELECT mp.*, u.username, u.email, l.name AS league_name
      FROM member_payments mp
      JOIN users u ON mp.user_id = u.id
      JOIN leagues l ON mp.league_id = l.id
      WHERE mp.status = 'paid'
      ORDER BY mp.paid_at DESC
      LIMIT 50
    `).all();

    res.json({ totals, byEntryFee, recentPayments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/superadmin/setup-test-league
// Deletes ALL existing leagues and their data, then creates "Test Draft 2026"
// with the requesting superadmin as commissioner + 9 bot users.
// All 10 payments are pre-marked paid. Draft is NOT started.
// ---------------------------------------------------------------------------
router.post('/setup-test-league', superadmin, async (req, res) => {
  try {
    const commissionerId = req.user.id;

    // ── 1. Wipe all existing leagues and related rows ──────────────────────
    const allLeagueIds = db.prepare('SELECT id FROM leagues').all().map(r => r.id);
    db.transaction(() => {
      for (const id of allLeagueIds) {
        db.prepare('DELETE FROM wall_replies WHERE post_id IN (SELECT id FROM wall_posts WHERE league_id = ?)').run(id);
        db.prepare('DELETE FROM wall_reactions WHERE post_id IN (SELECT id FROM wall_posts WHERE league_id = ?)').run(id);
        db.prepare('DELETE FROM wall_posts WHERE league_id = ?').run(id);
        db.prepare('DELETE FROM league_chat_messages WHERE league_id = ?').run(id);
        db.prepare('DELETE FROM draft_picks WHERE league_id = ?').run(id);
        db.prepare('DELETE FROM smart_draft_upgrades WHERE league_id = ?').run(id);
        db.prepare('DELETE FROM member_payments WHERE league_id = ?').run(id);
        db.prepare('DELETE FROM scoring_settings WHERE league_id = ?').run(id);
        db.prepare('DELETE FROM league_members WHERE league_id = ?').run(id);
        db.prepare('DELETE FROM payouts WHERE league_id = ?').run(id);
        db.prepare('DELETE FROM leagues WHERE id = ?').run(id);
      }
    })();

    // ── 2. Create the league ───────────────────────────────────────────────
    const leagueId   = uuidv4();
    const inviteCode = 'TESTDRAFT26';

    db.prepare(`
      INSERT INTO leagues (id, name, commissioner_id, invite_code, status,
        max_teams, total_rounds, pick_time_limit, draft_status,
        current_pick, auto_start_on_full, draft_order_randomized,
        entry_fee, buy_in_amount, stripe_payment_status)
      VALUES (?, 'Test Draft 2026', ?, ?, 'lobby',
        10, 10, 60, 'pending',
        1, 0, 0,
        5.00, 0, 'unpaid')
    `).run(leagueId, commissionerId, inviteCode);

    db.prepare('INSERT INTO scoring_settings (id, league_id, pts_per_point) VALUES (?, ?, 1.0)')
      .run(uuidv4(), leagueId);

    // ── 3. Ensure 9 bot users exist ────────────────────────────────────────
    const passwordHash = await bcrypt.hash('testpass123', 6);
    const botUsers = [];
    for (let i = 1; i <= 9; i++) {
      const username = 'testuser' + String(i).padStart(2, '0');
      const email    = `${username}@test.local`;
      let u = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!u) {
        const uid = uuidv4();
        db.prepare('INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)')
          .run(uid, email, username, passwordHash);
        u = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
      }
      botUsers.push(u);
    }

    // ── 4. Add commissioner + bots, all payments paid ──────────────────────
    const commUser = db.prepare('SELECT username FROM users WHERE id = ?').get(commissionerId);
    db.transaction(() => {
      db.prepare(`INSERT INTO league_members (id, league_id, user_id, team_name) VALUES (?, ?, ?, ?)`)
        .run(uuidv4(), leagueId, commissionerId, `${commUser?.username || 'Commissioner'}'s Team`);
      db.prepare(`INSERT INTO member_payments (id, league_id, user_id, amount, status, paid_at) VALUES (?, ?, ?, 5.00, 'paid', CURRENT_TIMESTAMP)`)
        .run(uuidv4(), leagueId, commissionerId);

      for (const u of botUsers) {
        db.prepare(`INSERT INTO league_members (id, league_id, user_id, team_name) VALUES (?, ?, ?, ?)`)
          .run(uuidv4(), leagueId, u.id, `Team ${u.username}`);
        db.prepare(`INSERT INTO member_payments (id, league_id, user_id, amount, status, paid_at) VALUES (?, ?, ?, 5.00, 'paid', CURRENT_TIMESTAMP)`)
          .run(uuidv4(), leagueId, u.id);
      }
    })();

    const members = db.prepare(`
      SELECT lm.team_name, u.username
      FROM league_members lm JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = ? ORDER BY lm.joined_at
    `).all(leagueId);

    console.log(`[superadmin] setup-test-league: created ${leagueId} with ${members.length} members`);
    res.json({
      leagueId,
      leagueName: 'Test Draft 2026',
      inviteCode,
      members,
      deletedLeagues: allLeagueIds.length,
      message: `Deleted ${allLeagueIds.length} old league(s). Created "Test Draft 2026" with ${members.length} teams — all paid, draft NOT started.`,
    });
  } catch (err) {
    console.error('setup-test-league error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

module.exports = router;
