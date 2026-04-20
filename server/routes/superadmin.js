const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/index');
const superadmin = require('../middleware/superadmin');
const { performStartDraft } = require('../draftUtils');
const { pullBracket } = require('../bracketPoller');

const router = express.Router();

// ── Leagues ──────────────────────────────────────────────────────────────────

// GET /api/superadmin/leagues — all leagues
router.get('/leagues', superadmin, async (req, res) => {
  try {
    const leagues = await db.all(`
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
      GROUP BY l.id, u.username, u.email
      ORDER BY l.created_at DESC
    `);
    res.json({ leagues });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/superadmin/leagues/:id — league detail with members + picks
router.get('/leagues/:id', superadmin, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const members = await db.all(`
      SELECT lm.*, u.username, u.email,
             mp.status AS payment_status, mp.amount AS payment_amount,
             COUNT(dp.id) AS picks_made
      FROM league_members lm
      JOIN users u ON lm.user_id = u.id
      LEFT JOIN member_payments mp ON mp.league_id = lm.league_id AND mp.user_id = lm.user_id
      LEFT JOIN draft_picks dp ON dp.league_id = lm.league_id AND dp.user_id = lm.user_id
      WHERE lm.league_id = ?
      GROUP BY lm.id, u.username, u.email, mp.status, mp.amount
      ORDER BY lm.draft_order
    `, req.params.id);

    res.json({ league, members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/superadmin/leagues/:id/start-draft — force start (bypasses commissioner check)
router.post('/leagues/:id/start-draft', superadmin, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.status !== 'lobby') return res.status(400).json({ error: `League status is "${league.status}", not lobby` });

    // Mark all pending payments paid so the gate passes
    await db.run(`
      UPDATE member_payments SET status = 'paid', paid_at = CURRENT_TIMESTAMP
      WHERE league_id = ? AND status != 'paid'
    `, req.params.id);

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
router.post('/leagues/:id/pause-draft', superadmin, async (req, res) => {
  try {
    await db.run("UPDATE leagues SET status = 'lobby' WHERE id = ?", req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/superadmin/leagues/:id — edit league settings
router.put('/leagues/:id', superadmin, async (req, res) => {
  try {
    const { name, max_teams, total_rounds, pick_time_limit, buy_in_amount,
            payout_first, payout_second, payout_third, status,
            payout_pool_override } = req.body;

    await db.run(`
      UPDATE leagues SET
        name                 = COALESCE(?, name),
        max_teams            = COALESCE(?, max_teams),
        total_rounds         = COALESCE(?, total_rounds),
        pick_time_limit      = COALESCE(?, pick_time_limit),
        buy_in_amount        = COALESCE(?, buy_in_amount),
        payout_first         = COALESCE(?, payout_first),
        payout_second        = COALESCE(?, payout_second),
        payout_third         = COALESCE(?, payout_third),
        status               = COALESCE(?, status),
        payout_pool_override = ?
      WHERE id = ?
    `, name, max_teams, total_rounds, pick_time_limit, buy_in_amount,
       payout_first, payout_second, payout_third, status,
       payout_pool_override != null ? parseFloat(payout_pool_override) || null : null,
       req.params.id);

    const league = await db.get('SELECT * FROM leagues WHERE id = ?', req.params.id);
    res.json({ league });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/superadmin/leagues/:id — delete league and all related data
router.delete('/leagues/:id', superadmin, async (req, res) => {
  try {
    const league = await db.get('SELECT id FROM leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM draft_picks WHERE league_id = ?', req.params.id);
      await tx.run('DELETE FROM member_payments WHERE league_id = ?', req.params.id);
      await tx.run('DELETE FROM smart_draft_upgrades WHERE league_id = ?', req.params.id);
      await tx.run('DELETE FROM scoring_settings WHERE league_id = ?', req.params.id);
      await tx.run('DELETE FROM league_members WHERE league_id = ?', req.params.id);
      await tx.run('DELETE FROM payouts WHERE league_id = ?', req.params.id);
      await tx.run('DELETE FROM leagues WHERE id = ?', req.params.id);
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Users ─────────────────────────────────────────────────────────────────────

// GET /api/superadmin/users — all users
router.get('/users', superadmin, async (req, res) => {
  try {
    const users = await db.all(`
      SELECT
        u.id, u.email, u.username, u.role, u.created_at,
        u.stripe_account_status,
        COUNT(DISTINCT lm.league_id) AS league_count
      FROM users u
      LEFT JOIN league_members lm ON lm.user_id = u.id
      GROUP BY u.id, u.email, u.username, u.role, u.created_at
      ORDER BY u.created_at DESC
    `);
    res.json({ users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/superadmin/users/:id/ban — toggle ban (sets role to 'banned' or back to 'user')
router.put('/users/:id/ban', superadmin, async (req, res) => {
  try {
    const { banned } = req.body;
    const newRole = banned ? 'banned' : 'user';
    await db.run('UPDATE users SET role = ? WHERE id = ?', newRole, req.params.id);
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
    // Cost 10 (not 12) — Railway CPU is throttled and cost 12 can take 5+ seconds
    const hash = await bcrypt.hash(password, 10);
    const result = await db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
    console.log(`[superadmin] password reset for user ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[superadmin] reset-password error:', err.message);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// DELETE /api/superadmin/users/:id — hard-delete a user and all their records
router.delete('/users/:id', superadmin, async (req, res) => {
  try {
    const target = await db.get('SELECT id, role FROM users WHERE id = ?', req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'admin' || target.role === 'superadmin') {
      return res.status(403).json({ error: 'Cannot delete admin accounts' });
    }

    // Delete in FK-safe order (children before parent), wrapped in a transaction
    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM wall_replies         WHERE user_id = ?', target.id);
      await tx.run('DELETE FROM wall_reactions       WHERE user_id = ?', target.id);
      await tx.run('DELETE FROM wall_posts           WHERE user_id = ?', target.id);
      await tx.run('DELETE FROM league_chat_messages WHERE user_id = ?', target.id);
      await tx.run('DELETE FROM smart_draft_upgrades WHERE user_id = ?', target.id);
      await tx.run('DELETE FROM smart_draft_credits  WHERE user_id = ?', target.id);
      await tx.run('DELETE FROM payouts              WHERE user_id = ?', target.id);
      await tx.run('DELETE FROM member_payments      WHERE user_id = ?', target.id);
      await tx.run('DELETE FROM referrals            WHERE referrer_id = ? OR referred_id = ?', target.id, target.id);
      await tx.run('DELETE FROM draft_picks          WHERE user_id = ?', target.id);
      await tx.run('DELETE FROM league_members       WHERE user_id = ?', target.id);
      await tx.run('DELETE FROM users                WHERE id = ?', target.id);
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[superadmin] delete user error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

// ── Players ───────────────────────────────────────────────────────────────────

// GET /api/superadmin/players — all players
router.get('/players', superadmin, async (req, res) => {
  try {
    const players = await db.all(`
      SELECT * FROM players ORDER BY seed, region, name
    `);
    res.json({ players });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/superadmin/players — add a player
router.post('/players', superadmin, async (req, res) => {
  try {
    const { name, team, position, seed, region, season_ppg } = req.body;
    if (!name || !team) return res.status(400).json({ error: 'name and team are required' });
    const id = uuidv4();
    await db.run(`
      INSERT INTO players (id, name, team, position, seed, region, season_ppg)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, id, name, team, position || null, seed || null, region || null, season_ppg || 0);
    const player = await db.get('SELECT * FROM players WHERE id = ?', id);
    res.status(201).json({ player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/superadmin/players/:id — edit a player
router.put('/players/:id', superadmin, async (req, res) => {
  try {
    const { name, team, position, seed, region, season_ppg, is_eliminated } = req.body;
    await db.run(`
      UPDATE players SET
        name         = COALESCE(?, name),
        team         = COALESCE(?, team),
        position     = COALESCE(?, position),
        seed         = COALESCE(?, seed),
        region       = COALESCE(?, region),
        season_ppg   = COALESCE(?, season_ppg),
        is_eliminated = COALESCE(?, is_eliminated)
      WHERE id = ?
    `, name, team, position, seed, region, season_ppg, is_eliminated, req.params.id);
    const player = await db.get('SELECT * FROM players WHERE id = ?', req.params.id);
    res.json({ player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/superadmin/players/:id — remove a player
router.delete('/players/:id', superadmin, async (req, res) => {
  try {
    await db.run('DELETE FROM draft_picks WHERE player_id = ?', req.params.id);
    await db.run('DELETE FROM player_stats WHERE player_id = ?', req.params.id);
    await db.run('DELETE FROM players WHERE id = ?', req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/superadmin/players/:id/injury — update injury status
router.put('/players/:id/injury', superadmin, async (req, res) => {
  try {
    const { status = '', headline = '' } = req.body;
    const flagged = status !== '' ? 1 : 0;
    await db.run(`
      UPDATE players SET injury_flagged = ?, injury_status = ?, injury_headline = ? WHERE id = ?
    `, flagged, status.toUpperCase(), headline, req.params.id);
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
router.get('/financials', superadmin, async (req, res) => {
  try {
    const totals = await db.get(`
      SELECT
        COUNT(*)                                                   AS total_payments,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END), 0) AS total_revenue,
        COUNT(CASE WHEN status = 'paid' THEN 1 END)               AS paid_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END)            AS pending_count
      FROM member_payments
    `);

    const byEntryFee = await db.all(`
      SELECT
        l.buy_in_amount                                               AS entry_fee,
        COUNT(DISTINCT l.id)                                          AS league_count,
        COUNT(CASE WHEN mp.status = 'paid' THEN 1 END)               AS paid_entries,
        COALESCE(SUM(CASE WHEN mp.status = 'paid' THEN mp.amount END), 0) AS revenue
      FROM leagues l
      LEFT JOIN member_payments mp ON mp.league_id = l.id
      GROUP BY l.buy_in_amount
      ORDER BY revenue DESC
    `);

    const recentPayments = await db.all(`
      SELECT mp.*, u.username, u.email, l.name AS league_name
      FROM member_payments mp
      JOIN users u ON mp.user_id = u.id
      JOIN leagues l ON mp.league_id = l.id
      WHERE mp.status = 'paid'
      ORDER BY mp.paid_at DESC
      LIMIT 50
    `);

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
    const allLeagueIds = (await db.all('SELECT id FROM leagues')).map(r => r.id);
    await db.transaction(async (tx) => {
      for (const id of allLeagueIds) {
        await tx.run('DELETE FROM wall_replies WHERE post_id IN (SELECT id FROM wall_posts WHERE league_id = ?)', id);
        await tx.run('DELETE FROM wall_reactions WHERE post_id IN (SELECT id FROM wall_posts WHERE league_id = ?)', id);
        await tx.run('DELETE FROM wall_posts WHERE league_id = ?', id);
        await tx.run('DELETE FROM league_chat_messages WHERE league_id = ?', id);
        await tx.run('DELETE FROM draft_picks WHERE league_id = ?', id);
        await tx.run('DELETE FROM smart_draft_upgrades WHERE league_id = ?', id);
        await tx.run('DELETE FROM member_payments WHERE league_id = ?', id);
        await tx.run('DELETE FROM scoring_settings WHERE league_id = ?', id);
        await tx.run('DELETE FROM league_members WHERE league_id = ?', id);
        await tx.run('DELETE FROM payouts WHERE league_id = ?', id);
        await tx.run('DELETE FROM leagues WHERE id = ?', id);
      }
    });

    // ── 2. Create the league ───────────────────────────────────────────────
    const leagueId   = uuidv4();
    const inviteCode = 'TESTDRAFT26';

    await db.run(`
      INSERT INTO leagues (id, name, commissioner_id, invite_code, status,
        max_teams, total_rounds, pick_time_limit, draft_status,
        current_pick, auto_start_on_full, draft_order_randomized,
        entry_fee, buy_in_amount, stripe_payment_status)
      VALUES (?, 'Test Draft 2026', ?, ?, 'lobby',
        10, 10, 60, 'pending',
        1, 0, 0,
        5.00, 0, 'unpaid')
    `, leagueId, commissionerId, inviteCode);

    await db.run('INSERT INTO scoring_settings (id, league_id, pts_per_point) VALUES (?, ?, 1.0)',
      uuidv4(), leagueId);

    // ── 3. Ensure 9 bot users exist ────────────────────────────────────────
    const passwordHash = await bcrypt.hash('testpass123', 6);
    const botUsers = [];
    for (let i = 1; i <= 9; i++) {
      const username = 'testuser' + String(i).padStart(2, '0');
      const email    = `${username}@test.local`;
      let u = await db.get('SELECT * FROM users WHERE username = ?', username);
      if (!u) {
        const uid = uuidv4();
        await db.run('INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)',
          uid, email, username, passwordHash);
        u = await db.get('SELECT * FROM users WHERE id = ?', uid);
      }
      botUsers.push(u);
    }

    // ── 4. Add commissioner + bots, all payments paid ──────────────────────
    const commUser = await db.get('SELECT username FROM users WHERE id = ?', commissionerId);
    await db.transaction(async (tx) => {
      await tx.run(`INSERT INTO league_members (id, league_id, user_id, team_name) VALUES (?, ?, ?, ?)`,
        uuidv4(), leagueId, commissionerId, `${commUser?.username || 'Commissioner'}'s Team`);
      await tx.run(`INSERT INTO member_payments (id, league_id, user_id, amount, status, paid_at) VALUES (?, ?, ?, 5.00, 'paid', CURRENT_TIMESTAMP)`,
        uuidv4(), leagueId, commissionerId);

      for (const u of botUsers) {
        await tx.run(`INSERT INTO league_members (id, league_id, user_id, team_name) VALUES (?, ?, ?, ?)`,
          uuidv4(), leagueId, u.id, `Team ${u.username}`);
        await tx.run(`INSERT INTO member_payments (id, league_id, user_id, amount, status, paid_at) VALUES (?, ?, ?, 5.00, 'paid', CURRENT_TIMESTAMP)`,
          uuidv4(), leagueId, u.id);
      }
    });

    const members = await db.all(`
      SELECT lm.team_name, u.username
      FROM league_members lm JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = ? ORDER BY lm.joined_at
    `, leagueId);

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

// ── Sandbox / Dev Tools ───────────────────────────────────────────────────────

// GET /api/superadmin/sandboxes — list all sandbox leagues
router.get('/sandboxes', superadmin, async (req, res) => {
  try {
    const sandboxes = await db.all(`
      SELECT l.*, COUNT(DISTINCT lm.id) AS member_count
      FROM leagues l
      LEFT JOIN league_members lm ON lm.league_id = l.id
      WHERE l.is_sandbox = 1
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `);
    res.json({ sandboxes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/superadmin/create-sandbox — create an isolated sandbox draft league
router.post('/create-sandbox', superadmin, async (req, res) => {
  try {
    // 1. Run migration to add is_sandbox column if it doesn't exist
    try { await db.run('ALTER TABLE leagues ADD COLUMN is_sandbox INTEGER DEFAULT 0'); } catch {}

    const BOT_NAMES = [
      { username: 'bot_alpha',   teamName: 'Bot Alpha'   },
      { username: 'bot_beta',    teamName: 'Bot Beta'    },
      { username: 'bot_gamma',   teamName: 'Bot Gamma'   },
      { username: 'bot_delta',   teamName: 'Bot Delta'   },
      { username: 'bot_epsilon', teamName: 'Bot Epsilon' },
      { username: 'bot_zeta',    teamName: 'Bot Zeta'    },
      { username: 'bot_eta',     teamName: 'Bot Eta'     },
      { username: 'bot_theta',   teamName: 'Bot Theta'   },
    ];

    // 2. Create the league
    const leagueId   = uuidv4();
    const leagueName = 'Test Draft Sandbox ' + Date.now();
    const inviteCode = 'SANDBOX' + Date.now().toString().slice(-6);

    await db.run(`
      INSERT INTO leagues (id, name, commissioner_id, invite_code, status,
        is_sandbox, max_teams, total_rounds, pick_time_limit, draft_status,
        current_pick, auto_start_on_full, draft_order_randomized,
        entry_fee, buy_in_amount, stripe_payment_status)
      VALUES (?, ?, ?, ?, 'lobby',
        1, 9, 12, 30, 'pending',
        1, 0, 0,
        0, 0, 'unpaid')
    `, leagueId, leagueName, req.user.id, inviteCode);

    // 3. Insert scoring_settings row
    await db.run('INSERT INTO scoring_settings (id, league_id, pts_per_point) VALUES (?, ?, 1.0)',
      uuidv4(), leagueId);

    // 4. Ensure 8 bot users exist (upsert by username)
    const botUsers = [];
    for (const bot of BOT_NAMES) {
      let u = await db.get('SELECT * FROM users WHERE username = ?', bot.username);
      if (!u) {
        const uid = uuidv4();
        const passwordHash = await bcrypt.hash('botpass', 4);
        await db.run('INSERT INTO users (id, email, username, password_hash, role) VALUES (?, ?, ?, ?, ?)',
          uid, `${bot.username}@sandbox.local`, bot.username, passwordHash, 'bot');
        u = await db.get('SELECT * FROM users WHERE id = ?', uid);
      }
      botUsers.push(u);
    }

    // 5. Add commissioner + all 8 bots as league members (in a transaction)
    const commUser = await db.get('SELECT username FROM users WHERE id = ?', req.user.id);
    await db.transaction(async (tx) => {
      // Commissioner
      await tx.run(`INSERT INTO league_members (id, league_id, user_id, team_name, draft_order) VALUES (?, ?, ?, ?, NULL)`,
        uuidv4(), leagueId, req.user.id, `${commUser?.username || 'Commissioner'}'s Team`);
      await tx.run(`INSERT INTO member_payments (id, league_id, user_id, amount, status, paid_at) VALUES (?, ?, ?, 0, 'paid', CURRENT_TIMESTAMP)`,
        uuidv4(), leagueId, req.user.id);

      // Bots
      for (let i = 0; i < botUsers.length; i++) {
        const u = botUsers[i];
        await tx.run(`INSERT INTO league_members (id, league_id, user_id, team_name) VALUES (?, ?, ?, ?)`,
          uuidv4(), leagueId, u.id, BOT_NAMES[i].teamName);
        await tx.run(`INSERT INTO member_payments (id, league_id, user_id, amount, status, paid_at) VALUES (?, ?, ?, 0, 'paid', CURRENT_TIMESTAMP)`,
          uuidv4(), leagueId, u.id);
      }
    });

    // 6. Start the draft
    const io = req.app.get('io');
    const result = performStartDraft(leagueId, io);
    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to start draft' });
    }

    // 7. Return leagueId and leagueName
    res.json({ leagueId, leagueName });
  } catch (err) {
    console.error('create-sandbox error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// DELETE /api/superadmin/sandbox/:id — delete a sandbox league and all its data
router.delete('/sandbox/:id', superadmin, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.is_sandbox !== 1) return res.status(403).json({ error: 'Not a sandbox league' });

    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM wall_replies WHERE post_id IN (SELECT id FROM wall_posts WHERE league_id = ?)', req.params.id);
      await tx.run('DELETE FROM wall_reactions WHERE post_id IN (SELECT id FROM wall_posts WHERE league_id = ?)', req.params.id);
      await tx.run('DELETE FROM wall_posts WHERE league_id = ?', req.params.id);
      await tx.run('DELETE FROM league_chat_messages WHERE league_id = ?', req.params.id);
      await tx.run('DELETE FROM draft_picks WHERE league_id = ?', req.params.id);
      await tx.run('DELETE FROM smart_draft_upgrades WHERE league_id = ?', req.params.id);
      await tx.run('DELETE FROM member_payments WHERE league_id = ?', req.params.id);
      await tx.run('DELETE FROM scoring_settings WHERE league_id = ?', req.params.id);
      await tx.run('DELETE FROM league_members WHERE league_id = ?', req.params.id);
      await tx.run('DELETE FROM payouts WHERE league_id = ?', req.params.id);
      await tx.run('DELETE FROM leagues WHERE id = ?', req.params.id);
    });

    res.json({ success: true });
  } catch (err) {
    console.error('delete-sandbox error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Force ESPN poll — restores player_stats from live ESPN box scores ────────
// POST /api/superadmin/espn-poll
router.post('/espn-poll', superadmin, async (req, res) => {
  try {
    const { pollESPN } = require('../espnPoller');
    const io = req.app.get('io');
    const stats = await pollESPN(io);
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Re-ingest game stats ─────────────────────────────────────────────────────
// POST /api/superadmin/reingest-stats
// Body (optional): { "espn_event_id": "401856479" }
// Without body: re-ingests ALL completed games.
// With espn_event_id: re-ingests that one game synchronously and returns the
//   full per-player result in the response so you can see it without logs.
router.post('/reingest-stats', superadmin, async (req, res) => {
  try {
    const { espn_event_id } = req.body || {};
    const https = require('https');
    const { v4: uuidv4 } = require('uuid');
    const io = req.app.get('io');

    if (espn_event_id) {
      // Single-game synchronous reingest with full per-player response
      const game = await db.get('SELECT * FROM games WHERE espn_event_id = ?', String(espn_event_id));
      if (!game) return res.status(404).json({ error: `No game found with espn_event_id ${espn_event_id}` });

      const SUMMARY_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=';
      const summary = await new Promise((resolve, reject) => {
        https.get(SUMMARY_BASE + espn_event_id, { timeout: 10000 }, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
        }).on('error', reject);
      });

      const playerGroups = summary.boxscore?.players || [];
      const players = [];

      for (const group of playerGroups) {
        const statsBlock = group.statistics?.[0];
        if (!statsBlock) continue;
        const labels = statsBlock.names || statsBlock.labels || [];
        const ptsIdx = labels.indexOf('PTS');
        if (ptsIdx === -1) continue;
        const groupTeamName   = group.team?.displayName || '';
        const groupEspnTeamId = group.team?.id ? String(group.team.id) : '';

        for (const entry of (statsBlock.athletes || [])) {
          const displayName   = entry.athlete?.displayName || entry.athlete?.shortName;
          const espnAthleteId = entry.athlete?.id ? String(entry.athlete.id) : '';
          const pts = parseInt(entry.stats?.[ptsIdx]) || 0;
          if (!displayName) continue;

          let dbPlayer = espnAthleteId
            ? await db.get("SELECT id, name, team, espn_athlete_id, espn_team_id FROM players WHERE espn_athlete_id = ? LIMIT 1", espnAthleteId)
            : null;
          let matchMethod = dbPlayer ? 'athlete_id' : null;

          if (!dbPlayer) {
            const norm = displayName.toLowerCase().trim();
            dbPlayer = await db.get('SELECT id, name, team, espn_athlete_id, espn_team_id FROM players WHERE LOWER(name) = ?', norm);
            if (!dbPlayer) {
              const last = norm.split(' ').pop();
              const rows = await db.all("SELECT id, name, team, espn_athlete_id, espn_team_id FROM players WHERE LOWER(name) LIKE ?", `%${last}`);
              if (rows.length === 1) dbPlayer = rows[0];
            }
            if (dbPlayer) {
              const playerTeamId = dbPlayer.espn_team_id != null ? String(dbPlayer.espn_team_id) : '';
              if (playerTeamId && groupEspnTeamId && playerTeamId !== groupEspnTeamId) {
                players.push({ espn_name: displayName, espn_athlete_id: espnAthleteId, pts, espn_team: groupTeamName, match: 'SKIPPED_TEAM_MISMATCH', db_player: dbPlayer.name, db_team_id: playerTeamId, group_team_id: groupEspnTeamId });
                dbPlayer = null;
              } else {
                matchMethod = 'name';
              }
            }
          }

          if (!dbPlayer) {
            players.push({ espn_name: displayName, espn_athlete_id: espnAthleteId, pts, espn_team: groupTeamName, match: 'NO_MATCH' });
            continue;
          }

          // Insert/update stat row
          const statsBefore = await db.get('SELECT points FROM player_stats WHERE game_id = ? AND player_id = ?', game.id, dbPlayer.id);
          await db.run(`
            INSERT INTO player_stats (id, game_id, player_id, points, round, opponent, played_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(game_id, player_id) DO UPDATE SET points = excluded.points
          `, uuidv4(), game.id, dbPlayer.id, pts, '', '', new Date().toISOString());

          players.push({ espn_name: displayName, espn_athlete_id: espnAthleteId, pts, espn_team: groupTeamName, match: matchMethod, db_player: dbPlayer.name, db_team: dbPlayer.team, pts_before: statsBefore?.points ?? null });
        }
      }

      const matched = players.filter(p => p.match && p.match !== 'NO_MATCH' && p.match !== 'SKIPPED_TEAM_MISMATCH');
      res.json({ game: `${game.team1} vs ${game.team2}`, espn_event_id, total_espn_athletes: players.length, matched: matched.length, players });
    } else {
      // All completed games — async, check logs
      const { reingestCompletedGames } = require('../espnPoller');
      reingestCompletedGames(io).catch(e => console.error('[reingest] error:', e.message));
      res.json({ ok: true, message: 'Re-ingestion started for all completed games — check server logs' });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Roster stat diagnostic — GET /api/superadmin/roster-diag?team=Boozer+T ──
// Returns every drafted player for the matching team_name with:
//   espn_athlete_id, total_points, game_log, is_eliminated
// Makes it easy to spot which players have no stats and why.
router.get('/roster-diag', superadmin, async (req, res) => {
  try {
    const teamName = (req.query.team || '').trim();
    if (!teamName) return res.status(400).json({ error: 'team query param required' });

    // Find the league member
    const member = await db.get(`
      SELECT lm.league_id, lm.user_id, lm.team_name, u.username
      FROM league_members lm
      JOIN users u ON u.id = lm.user_id
      WHERE LOWER(lm.team_name) LIKE LOWER(?)
      LIMIT 1
    `, `%${teamName}%`);

    if (!member) return res.status(404).json({ error: `No team matching "${teamName}"` });

    const picks = await db.all(`
      SELECT dp.player_id, dp.pick_number,
             p.name, p.team, p.espn_team_id, p.espn_athlete_id,
             p.season_ppg, p.seed, p.is_eliminated
      FROM draft_picks dp
      JOIN players p ON p.id = dp.player_id
      WHERE dp.league_id = ? AND dp.user_id = ?
      ORDER BY dp.pick_number
    `, member.league_id, member.user_id);

    const result = [];
    for (const p of picks) {
      const statRows = await db.all(`
        SELECT ps.points, ps.round, ps.opponent, g.game_date, g.team1, g.team2,
               g.is_completed, g.is_live, g.espn_event_id
        FROM player_stats ps
        JOIN games g ON g.id = ps.game_id
        WHERE ps.player_id = ?
        ORDER BY g.game_date
      `, p.player_id);

      const totalPts = statRows.reduce((s, r) => s + r.points, 0);

      result.push({
        pick:            p.pick_number,
        name:            p.name,
        team:            p.team,
        espn_team_id:    p.espn_team_id,
        espn_athlete_id: p.espn_athlete_id || '(empty)',
        season_ppg:      p.season_ppg,
        seed:            p.seed,
        is_eliminated:   !!p.is_eliminated,
        total_pts:       totalPts,
        games_with_stats: statRows.length,
        game_log:        statRows,
      });
    }

    res.json({ member, picks: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Golf pool member recovery ─────────────────────────────────────────────────
// POST /api/superadmin/recover-golf-members/:leagueId
// Diagnoses missing golf_league_members and restores them from pool_picks.
router.post('/recover-golf-members/:leagueId', superadmin, async (req, res) => {
  try {
    const leagueId = req.params.leagueId;

    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', leagueId);
    if (!league) return res.status(404).json({ error: 'Golf league not found' });

    // Who currently has picks?
    const pickUsers = await db.all(`
      SELECT DISTINCT pp.user_id, u.username, u.email, u.role
      FROM pool_picks pp
      JOIN users u ON u.id = pp.user_id
      WHERE pp.league_id = ?
    `, leagueId);

    // Who is currently a member?
    const currentMembers = await db.all(`
      SELECT glm.user_id, u.username, u.email, glm.team_name, glm.joined_at
      FROM golf_league_members glm
      JOIN users u ON u.id = glm.user_id
      WHERE glm.golf_league_id = ?
    `, leagueId);
    const currentMemberIds = new Set(currentMembers.map(m => m.user_id));

    // Gap = pick users not in current members
    const missing = pickUsers.filter(u => !currentMemberIds.has(u.user_id));

    // Also search for banned users by name hints
    const nameHints = ['max', 'cady', 'drew', 'bartlett', 'jon', 'wohlfert'];
    const bannedByName = (await db.all(`
      SELECT id AS user_id, username, email, role
      FROM users
      WHERE (${nameHints.map(() => "lower(username) LIKE ?").join(' OR ')})
    `, ...nameHints.map(n => `%${n}%`)))
      .filter(u => !currentMemberIds.has(u.user_id));

    // Merge, dedupe
    const toRestoreMap = new Map();
    for (const u of [...missing, ...bannedByName]) toRestoreMap.set(u.user_id, u);

    const restored = [];
    await db.transaction(async (tx) => {
      for (const [userId, u] of toRestoreMap) {
        if (u.role === 'banned') {
          await tx.run("UPDATE users SET role = 'user' WHERE id = ?", userId);
        }
        const already = await tx.get(
          'SELECT id FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?',
          leagueId, userId);
        if (!already) {
          const { v4: uuidv4 } = require('uuid');
          await tx.run(`
            INSERT INTO golf_league_members (id, golf_league_id, user_id, team_name, joined_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          `, uuidv4(), leagueId, userId, u.username);
        }
        restored.push({ user_id: userId, username: u.username, email: u.email, was_banned: u.role === 'banned', source: missing.find(m => m.user_id === userId) ? 'picks_orphan' : 'name_match' });
      }
    });

    const allMembersAfter = await db.all(`
      SELECT glm.user_id, glm.team_name, glm.joined_at, u.username, u.email
      FROM golf_league_members glm
      JOIN users u ON u.id = glm.user_id
      WHERE glm.golf_league_id = ?
      ORDER BY glm.joined_at
    `, leagueId);

    console.log(`[recovery] league ${leagueId}: restored ${restored.length}, total members now ${allMembersAfter.length}`);
    res.json({
      league_name:   league.name,
      invite_code:   league.invite_code,
      restored,
      pick_users:    pickUsers,
      members_after: allMembersAfter,
    });
  } catch (err) {
    console.error('[recovery]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
