const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { isClean, NAME_BLOCKED_MSG } = require('../contentFilter');

const router = express.Router();

// Single source of truth for the free-access invite code.
// Referenced in BOTH the payment-handle validation check and the payment bypass —
// having two separate constants was a P0 bug waiting to cause a drift.
const FREE_ACCESS_CODE = 'G7V9XM6W';

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

    const buyIn = Math.max(0, parseFloat(buy_in_amount) || 0);
    if (buyIn > 10000) {
      return res.status(400).json({ error: 'Buy-in amount cannot exceed $10,000' });
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
    `).run(id, name, req.user.id, invite_code, max_teams, total_rounds, pick_time_limit, auto_start_on_full ? 1 : 0, draft_start_time || null, buyIn, payment_instructions || '', p1, p2, p3, Math.max(0, parseFloat(payout_bonus) || 0));

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
    const { invite_code, team_name, venmo_handle = '', zelle_handle = '' } = req.body;
    if (!invite_code || !team_name) {
      return res.status(400).json({ error: 'Invite code and team name are required' });
    }
    if (invite_code.toUpperCase() !== FREE_ACCESS_CODE && !venmo_handle.trim() && !zelle_handle.trim()) {
      return res.status(400).json({ error: 'Please provide at least one payment handle (Venmo or Zelle)' });
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
      INSERT INTO league_members (id, league_id, user_id, team_name, venmo_handle, zelle_handle)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), league.id, req.user.id, team_name, venmo_handle.trim(), zelle_handle.trim());

    // Free access code — skip payment entirely
    if (invite_code.toUpperCase() === FREE_ACCESS_CODE) {
      db.prepare(`
        INSERT OR IGNORE INTO member_payments (id, league_id, user_id, amount, status)
        VALUES (?, ?, ?, 0, 'free')
      `).run(uuidv4(), league.id, req.user.id);
      const members = db.prepare('SELECT * FROM league_members WHERE league_id = ?').all(league.id);
      return res.json({ league, members, requiresPayment: false });
    }

    // Stripe disabled — bypass payment, mark as free so user has full access
    const stripeEnabled = process.env.STRIPE_ENABLED === 'true';
    if (!stripeEnabled) {
      const existing = db.prepare('SELECT id FROM member_payments WHERE league_id = ? AND user_id = ?').get(league.id, req.user.id);
      if (!existing) {
        db.prepare(`
          INSERT INTO member_payments (id, league_id, user_id, amount, status)
          VALUES (?, ?, ?, 5.00, 'free')
        `).run(uuidv4(), league.id, req.user.id);
      }
      const members = db.prepare('SELECT * FROM league_members WHERE league_id = ?').all(league.id);
      return res.json({ league, members, requiresPayment: false });
    }

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
      SELECT lm.*, u.username, u.email,
        COALESCE(NULLIF(lm.venmo_handle, ''), u.venmo_handle, '') AS venmo_handle,
        lm.zelle_handle
      FROM league_members lm
      JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = ?
      ORDER BY COALESCE(lm.draft_order, 999), lm.joined_at
    `).all(req.params.id);

    const settings = db.prepare('SELECT * FROM scoring_settings WHERE league_id = ?').get(req.params.id);

    res.json({ league, members, settings, isCommissioner: league.commissioner_id === req.user.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/leagues/:id/settings — commissioner edits league settings (lobby only)
router.patch('/:id/settings', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the commissioner can edit settings' });
    }
    if (league.status !== 'lobby') {
      return res.status(403).json({ error: 'Settings cannot be changed after the draft has started' });
    }

    const { draft_start_time, pick_time_limit, max_teams, total_rounds, autodraft_mode } = req.body;

    const validTimers = [30, 60, 90, 120];
    const timer = parseInt(pick_time_limit);
    if (pick_time_limit !== undefined && !validTimers.includes(timer)) {
      return res.status(400).json({ error: 'Pick timer must be 30, 60, 90, or 120 seconds' });
    }

    const rounds = parseInt(total_rounds);
    if (total_rounds !== undefined && (isNaN(rounds) || rounds < 1 || rounds > 20)) {
      return res.status(400).json({ error: 'Draft rounds must be between 1 and 20' });
    }

    const maxT = parseInt(max_teams);
    if (max_teams !== undefined) {
      if (isNaN(maxT) || maxT < 2 || maxT > 20) {
        return res.status(400).json({ error: 'Max teams must be between 2 and 20' });
      }
      const { cnt } = db.prepare('SELECT COUNT(*) as cnt FROM league_members WHERE league_id = ?').get(req.params.id);
      if (maxT < cnt) {
        return res.status(400).json({ error: `Can't set max teams below current member count (${cnt})` });
      }
    }

    if (autodraft_mode !== undefined && !['best_available', 'smart_draft'].includes(autodraft_mode)) {
      return res.status(400).json({ error: 'autodraft_mode must be best_available or smart_draft' });
    }

    db.prepare(`
      UPDATE leagues SET
        draft_start_time = COALESCE(?, draft_start_time),
        pick_time_limit  = COALESCE(?, pick_time_limit),
        max_teams        = COALESCE(?, max_teams),
        total_rounds     = COALESCE(?, total_rounds),
        autodraft_mode   = COALESCE(?, autodraft_mode)
      WHERE id = ?
    `).run(
      draft_start_time !== undefined ? (draft_start_time || null) : undefined,
      pick_time_limit  !== undefined ? timer         : undefined,
      max_teams        !== undefined ? maxT          : undefined,
      total_rounds     !== undefined ? rounds        : undefined,
      autodraft_mode   !== undefined ? autodraft_mode : undefined,
      req.params.id,
    );

    const updated = db.prepare('SELECT * FROM leagues WHERE id = ?').get(req.params.id);

    // Broadcast system message to anyone currently in the draft room socket
    const io = req.app.get('io');
    if (io) {
      const { addMessage, makeSystemMsg } = require('../chatStore');
      const sysMsg = makeSystemMsg('⚙️ Commissioner updated league settings');
      addMessage(req.params.id, sysMsg);
      io.to(`draft_${req.params.id}`).emit('chat_message', sysMsg);
    }

    res.json({ league: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/leagues/:id/live-games — live game data with league players
router.get('/:id/live-games', authMiddleware, (req, res) => {
  try {
    const leagueId = req.params.id;

    const liveGames = db.prepare('SELECT * FROM games WHERE is_live = 1').all();

    if (liveGames.length === 0) {
      return res.json({ liveGames: [], hasLeaguePlayers: false });
    }

    // Match drafted players to live games via player_id → player_stats → games.
    // This avoids team-name string matching (e.g. "NC State Wolfpack" vs "NC State").
    const draftedInLiveGames = db.prepare(`
      SELECT
        dp.player_id, dp.user_id,
        p.name AS player_name, p.team, p.jersey_number,
        lm.team_name AS owner_team_name,
        u.username AS owner_username,
        COALESCE(ps.points, 0) AS points,
        ps.game_id
      FROM draft_picks dp
      JOIN players p ON p.id = dp.player_id
      JOIN league_members lm ON lm.league_id = dp.league_id AND lm.user_id = dp.user_id
      JOIN users u ON u.id = dp.user_id
      JOIN player_stats ps ON ps.player_id = dp.player_id
      JOIN games g ON g.id = ps.game_id AND g.is_live = 1
      WHERE dp.league_id = ?
    `).all(leagueId);

    console.log(`[live-games] league=${leagueId} liveGames=${liveGames.length} draftedInLive=${draftedInLiveGames.length}`);

    // Group matched players by game_id + which team they're on
    const playersByGame = {};
    for (const row of draftedInLiveGames) {
      if (!playersByGame[row.game_id]) playersByGame[row.game_id] = [];
      playersByGame[row.game_id].push(row);
    }

    let hasLeaguePlayers = false;
    const gamesWithPlayers = liveGames.map(game => {
      const gamePlayers = playersByGame[game.id] || [];
      const t1p = gamePlayers.filter(p => p.team === game.team1);
      const t2p = gamePlayers.filter(p => p.team === game.team2);
      // If team name still doesn't match (edge case), bucket by game_id only
      const allPlayers = t1p.length + t2p.length < gamePlayers.length
        ? gamePlayers  // fallback: unmatched players still appear
        : null;
      if (gamePlayers.length) hasLeaguePlayers = true;
      return {
        ...game,
        team1_players: t1p.length ? t1p : (allPlayers ? allPlayers.slice(0, Math.ceil(allPlayers.length / 2)) : []),
        team2_players: t2p.length ? t2p : (allPlayers ? allPlayers.slice(Math.ceil(allPlayers.length / 2)) : []),
      };
    });

    res.json({ liveGames: gamesWithPlayers, hasLeaguePlayers });
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
