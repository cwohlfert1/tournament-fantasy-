const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { isClean, NAME_BLOCKED_MSG } = require('../contentFilter');

const router = express.Router();

// POST /api/leagues — create league
router.post('/', authMiddleware, (req, res) => {
  try {
    const {
      name,
      team_name,
      max_teams = 10,
      total_rounds = 10,
      pick_time_limit = 60,
      auto_start_on_full = 0,
      draft_start_time = null,
      buy_in_amount = 0,
      payment_instructions = '',
      payout_first = 70,
      payout_second = 20,
      payout_third = 10,
      payout_bonus = 0,
    } = req.body;

    if (!name || !team_name) {
      return res.status(400).json({ error: 'League name and team name are required' });
    }
    if (!isClean(name)) return res.status(400).json({ error: NAME_BLOCKED_MSG });
    if (!isClean(team_name)) return res.status(400).json({ error: NAME_BLOCKED_MSG });

    // Verify the user from the JWT actually exists in this database.
    // On a fresh Railway deploy (before a volume is attached) the DB is empty,
    // so the FK constraint on commissioner_id would crash with a cryptic error.
    const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(req.user.id);
    if (!userExists) {
      return res.status(401).json({ error: 'Session expired — please log in again.' });
    }

    const p1 = Math.max(0, parseInt(payout_first) || 0);
    const p2 = Math.max(0, parseInt(payout_second) || 0);
    const p3 = Math.max(0, parseInt(payout_third) || 0);
    if (p1 + p2 + p3 > 100) {
      return res.status(400).json({ error: 'Payout percentages cannot exceed 100%' });
    }

    const id = uuidv4();
    const invite_code = Math.random().toString(36).substring(2, 10).toUpperCase();

    db.prepare(`
      INSERT INTO leagues (id, name, commissioner_id, invite_code, status, max_teams, total_rounds, pick_time_limit, auto_start_on_full, draft_start_time, buy_in_amount, payment_instructions, payout_first, payout_second, payout_third, payout_bonus)
      VALUES (?, ?, ?, ?, 'lobby', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, req.user.id, invite_code, max_teams, total_rounds, pick_time_limit, auto_start_on_full ? 1 : 0, draft_start_time || null, Math.max(0, parseFloat(buy_in_amount) || 0), payment_instructions || '', p1, p2, p3, Math.max(0, parseFloat(payout_bonus) || 0));

    // Create scoring settings
    db.prepare(`
      INSERT INTO scoring_settings (id, league_id) VALUES (?, ?)
    `).run(uuidv4(), id);

    // Auto-join commissioner as first member
    db.prepare(`
      INSERT INTO league_members (id, league_id, user_id, team_name) VALUES (?, ?, ?, ?)
    `).run(uuidv4(), id, req.user.id, team_name);

    // Commissioner must pay $5 like everyone else — create pending payment
    db.prepare(`
      INSERT INTO member_payments (id, league_id, user_id, amount, status)
      VALUES (?, ?, ?, 5.00, 'pending')
    `).run(uuidv4(), id, req.user.id);

    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(id);
    res.status(201).json({ league, requiresPayment: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/leagues/join — join by invite code
router.post('/join', authMiddleware, (req, res) => {
  try {
    const { invite_code, team_name } = req.body;
    if (!invite_code || !team_name) {
      return res.status(400).json({ error: 'Invite code and team name are required' });
    }
    if (!isClean(team_name)) return res.status(400).json({ error: NAME_BLOCKED_MSG });

    const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(req.user.id);
    if (!userExists) {
      return res.status(401).json({ error: 'Session expired — please log in again.' });
    }

    const league = db.prepare('SELECT * FROM leagues WHERE invite_code = ?').get(invite_code.toUpperCase());
    if (!league) return res.status(404).json({ error: 'Invalid invite code' });

    // League must be open — pending_payment status is no longer used, but
    // guard against it in case old rows exist.
    if (league.status === 'pending_payment') {
      return res.status(403).json({ error: 'League is not yet open for joining' });
    }
    if (league.status === 'drafting' || league.status === 'active') {
      return res.status(403).json({ error: 'League has already started' });
    }

    const memberCount = db.prepare('SELECT COUNT(*) as cnt FROM league_members WHERE league_id = ?').get(league.id);
    if (memberCount.cnt >= league.max_teams) {
      return res.status(403).json({ error: 'League is full' });
    }

    const alreadyMember = db.prepare('SELECT id FROM league_members WHERE league_id = ? AND user_id = ?').get(league.id, req.user.id);
    if (alreadyMember) {
      return res.status(409).json({ error: 'You are already in this league' });
    }

    // Insert league member row
    db.prepare(`
      INSERT INTO league_members (id, league_id, user_id, team_name) VALUES (?, ?, ?, ?)
    `).run(uuidv4(), league.id, req.user.id, team_name);

    // Create a $5 pending payment record
    const existing = db.prepare('SELECT id FROM member_payments WHERE league_id = ? AND user_id = ?').get(league.id, req.user.id);
    if (!existing) {
      db.prepare(`
        INSERT INTO member_payments (id, league_id, user_id, amount, status)
        VALUES (?, ?, ?, 5.00, 'pending')
      `).run(uuidv4(), league.id, req.user.id);
    }

    const members = db.prepare('SELECT * FROM league_members WHERE league_id = ?').all(league.id);

    res.json({ league, members, requiresPayment: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/leagues — get all leagues for current user
router.get('/', authMiddleware, (req, res) => {
  try {
    const leagues = db.prepare(`
      SELECT l.*, lm.team_name, lm.total_points, lm.draft_order,
        (SELECT COUNT(*) FROM league_members WHERE league_id = l.id) as member_count
      FROM leagues l
      JOIN league_members lm ON l.id = lm.league_id
      WHERE lm.user_id = ?
      ORDER BY l.created_at DESC
    `).all(req.user.id);
    res.json({ leagues });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/leagues/preview/:inviteCode — public league info for join page
router.get('/preview/:inviteCode', authMiddleware, (req, res) => {
  try {
    const league = db.prepare(`
      SELECT id, name, max_teams, status, buy_in_amount, payment_instructions,
             payout_first, payout_second, payout_third, payout_bonus
      FROM leagues WHERE invite_code = ?
    `).get(req.params.inviteCode.toUpperCase());
    if (!league) return res.status(404).json({ error: 'Invalid invite code' });
    const { cnt: member_count } = db.prepare('SELECT COUNT(*) as cnt FROM league_members WHERE league_id = ?').get(league.id);
    res.json({ league: { ...league, member_count } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/leagues/:id — get league details
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const members = db.prepare(`
      SELECT lm.*, u.username, u.email, u.venmo_handle
      FROM league_members lm
      JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = ?
      ORDER BY COALESCE(lm.draft_order, 999), lm.joined_at
    `).all(req.params.id);

    const settings = db.prepare('SELECT * FROM scoring_settings WHERE league_id = ?').get(req.params.id);

    res.json({ league, members, settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/leagues/:id/members
router.get('/:id/members', authMiddleware, (req, res) => {
  try {
    const members = db.prepare(`
      SELECT lm.*, u.username
      FROM league_members lm
      JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = ?
      ORDER BY COALESCE(lm.draft_order, 999), lm.joined_at
    `).all(req.params.id);
    res.json({ members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
