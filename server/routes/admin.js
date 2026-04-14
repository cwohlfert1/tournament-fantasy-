const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/index');
const authMiddleware = require('../middleware/auth');
const { performStartDraft } = require('../draftUtils');
const { pullBracket } = require('../bracketPoller');
const { clearAutoPick } = require('../draftTimer');
const { getDraftState } = require('./draft');

const router = express.Router();

async function requireCommissioner(req, res, leagueId) {
  const league = await db.get('SELECT * FROM leagues WHERE id = ?', [leagueId]);
  if (!league) {
    res.status(404).json({ error: 'League not found' });
    return null;
  }
  if (league.commissioner_id !== req.user.id) {
    res.status(403).json({ error: 'Only the commissioner can do this' });
    return null;
  }
  return league;
}

// POST /api/admin/games — create game
router.post('/games', authMiddleware, async (req, res) => {
  try {
    const { game_date, round_name, team1, team2 } = req.body;
    if (!game_date || !round_name || !team1 || !team2) {
      return res.status(400).json({ error: 'game_date, round_name, team1, team2 are required' });
    }

    const id = uuidv4();
    await db.run(`
      INSERT INTO games (id, game_date, round_name, team1, team2) VALUES (?, ?, ?, ?, ?)
    `, [id, game_date, round_name, team1, team2]);

    const game = await db.get('SELECT * FROM games WHERE id = ?', [id]);
    res.status(201).json({ game });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/games/:gameId/stats — enter player stats
router.post('/games/:gameId/stats', authMiddleware, async (req, res) => {
  try {
    const { stats, winner_team, team1_score, team2_score } = req.body;
    // stats: [{player_id, points}]

    const game = await db.get('SELECT * FROM games WHERE id = ?', [req.params.gameId]);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    // Derive round code from game.round_name so chips display correctly
    function roundNameToCode(n) {
      const s = (n || '').toLowerCase();
      if (s.includes('first four'))   return 'First Four';
      if (s.includes('first round'))  return 'R64';
      if (s.includes('second round')) return 'R32';
      if (s.includes('sweet 16'))     return 'S16';
      if (s.includes('elite 8'))      return 'E8';
      if (s.includes('final four'))   return 'F4';
      if (s.includes('championship')) return 'NCG';
      return n || '';
    }
    const roundCode = roundNameToCode(game.round_name);

    await db.transaction(async (tx) => {
      for (const s of stats) {
        await tx.run(`
          INSERT INTO player_stats (id, game_id, player_id, points, round)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(game_id, player_id) DO UPDATE SET points = excluded.points, round = COALESCE(NULLIF(player_stats.round,''), excluded.round)
        `, [uuidv4(), req.params.gameId, s.player_id, s.points || 0, roundCode]);
      }
    });

    // Mark game completed and set winner
    if (winner_team) {
      await db.run(`
        UPDATE games SET is_completed = 1, winner_team = ?, team1_score = ?, team2_score = ? WHERE id = ?
      `, [winner_team, team1_score || 0, team2_score || 0, req.params.gameId]);

      // Mark losing team's players as eliminated
      const losingTeam = winner_team === game.team1 ? game.team2 : game.team1;
      await db.run('UPDATE players SET is_eliminated = 1 WHERE team = ?', [losingTeam]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/games — list all games
router.get('/games', authMiddleware, async (req, res) => {
  try {
    const games = await db.all('SELECT * FROM games ORDER BY game_date DESC');
    res.json({ games });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/leagues/:leagueId/start-draft', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const league = await db.get('SELECT * FROM leagues WHERE id = ?', [leagueId]);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the commissioner can do this' });
    }
    const result = await performStartDraft(leagueId, req.app.get('io'));
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json({ league: result.league, members: result.members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/leagues/:leagueId/settings
router.put('/leagues/:leagueId/settings', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const league = await requireCommissioner(req, res, leagueId);
    if (!league) return;

    const { pts_per_point } = req.body;

    await db.run(`
      UPDATE scoring_settings SET pts_per_point = COALESCE(?, pts_per_point)
      WHERE league_id = ?
    `, [pts_per_point, leagueId]);

    const settings = await db.get('SELECT * FROM scoring_settings WHERE league_id = ?', [leagueId]);
    res.json({ settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/admin/teams — list all tournament teams
router.get('/teams', authMiddleware, async (req, res) => {
  try {
    const teams = await db.all(`
      SELECT team, seed, region, MIN(is_eliminated) as is_eliminated,
        COUNT(*) as player_count
      FROM players
      GROUP BY team, seed, region
      ORDER BY seed, region
    `);
    res.json({ teams });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/players/injury — manually set or clear a player's injury designation
// Body: { playerName, team (optional), status ('OUT'|'DOUBTFUL'|'QUESTIONABLE'|''), headline }
router.put('/players/injury', authMiddleware, async (req, res) => {
  try {
    const { playerName, team, status = '', headline = '' } = req.body;
    if (!playerName) return res.status(400).json({ error: 'playerName is required' });

    let query = 'SELECT id, name, team FROM players WHERE LOWER(name) LIKE ?';
    const params = [`%${playerName.toLowerCase()}%`];
    if (team) {
      query += ' AND LOWER(team) LIKE ?';
      params.push(`%${team.toLowerCase()}%`);
    }
    const matches = await db.all(query, params);
    if (!matches.length) return res.status(404).json({ error: `No player found matching "${playerName}"${team ? ` on "${team}"` : ''}` });

    const isFlagged = status !== '' ? 1 : 0;
    const injuryHeadline = headline || (status === 'OUT' ? 'OUT — Not expected to play in the tournament' : '');

    await db.transaction(async (tx) => {
      for (const p of matches) {
        await tx.run(`
          UPDATE players
          SET injury_flagged = ?, injury_status = ?, injury_headline = ?
          WHERE id = ?
        `, [isFlagged, status.toUpperCase(), injuryHeadline, p.id]);
      }
    });

    res.json({ success: true, updated: matches.map(p => `${p.name} (${p.team})`) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/teams/:teamName/eliminate
router.put('/teams/eliminate', authMiddleware, async (req, res) => {
  try {
    const { team_name, is_eliminated } = req.body;
    await db.run('UPDATE players SET is_eliminated = ? WHERE team = ?', [is_eliminated ? 1 : 0, team_name]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/leagues/:leagueId/force-start
// Commissioner-only — marks all pending payments paid then starts the draft.
// Useful for test leagues where you don't want to go through Stripe.
// ---------------------------------------------------------------------------
router.post('/leagues/:leagueId/force-start', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM leagues WHERE id = ?', [req.params.leagueId]);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the commissioner can force-start the draft' });
    }
    if (league.status !== 'lobby') {
      return res.status(400).json({ error: `League is not in lobby (status: ${league.status})` });
    }

    // Mark all pending payments as paid so performStartDraft passes the gate
    await db.run(`
      UPDATE member_payments SET status = 'paid', paid_at = CURRENT_TIMESTAMP
      WHERE league_id = ? AND status != 'paid'
    `, [req.params.leagueId]);

    const io = req.app.get('io');
    const result = await performStartDraft(req.params.leagueId, io);
    if (!result.success) return res.status(400).json({ error: result.error });

    res.json({ success: true, leagueId: req.params.leagueId });
  } catch (err) {
    console.error('force-start error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/leagues/:leagueId/populate-test
// Dev/test only — creates up to 12 test user accounts and joins them to the
// league, with payments auto-marked as paid. Also clears any pending
// payment for the commissioner. Blocked in production.
// ---------------------------------------------------------------------------
router.post('/leagues/:leagueId/populate-test', authMiddleware, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  try {
    const { leagueId } = req.params;
    const league = await requireCommissioner(req, res, leagueId);
    if (!league) return;

    if (league.status !== 'lobby') {
      return res.status(400).json({ error: 'League must be in lobby status to populate' });
    }

    const memberCount = await db.get('SELECT COUNT(*) as cnt FROM league_members WHERE league_id = ?', [leagueId]);
    const slotsAvailable = league.max_teams - memberCount.cnt;

    if (slotsAvailable <= 0) {
      return res.status(400).json({ error: 'League is already full' });
    }

    // Hash the shared test password once — use cost 6 for speed
    const password_hash = await bcrypt.hash('testpass123', 6);

    const added = [];

    for (let i = 1; i <= 12; i++) {
      // Stop once the league is full
      const current = await db.get('SELECT COUNT(*) as cnt FROM league_members WHERE league_id = ?', [leagueId]);
      if (current.cnt >= league.max_teams) break;

      const username = `testuser${String(i).padStart(2, '0')}`;
      const email = `${username}@test.local`;
      const teamName = `Test Team ${i}`;

      // Create user if they don't exist yet
      let user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
      if (!user) {
        const userId = uuidv4();
        await db.run('INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)',
          [userId, email, username, password_hash]);
        user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
      }

      // Skip if already in this league
      const alreadyMember = await db.get(
        'SELECT id FROM league_members WHERE league_id = ? AND user_id = ?',
        [leagueId, user.id]
      );
      if (alreadyMember) continue;

      // Join league
      await db.run('INSERT INTO league_members (id, league_id, user_id, team_name) VALUES (?, ?, ?, ?)',
        [uuidv4(), leagueId, user.id, teamName]);

      // Mark payment as paid (bypass Stripe for test users)
      const existingPayment = await db.get(
        'SELECT id FROM member_payments WHERE league_id = ? AND user_id = ?',
        [leagueId, user.id]
      );

      if (existingPayment) {
        await db.run("UPDATE member_payments SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?",
          [existingPayment.id]);
      } else {
        await db.run(`
          INSERT INTO member_payments (id, league_id, user_id, amount, status, paid_at)
          VALUES (?, ?, ?, 5.00, 'paid', CURRENT_TIMESTAMP)
        `, [uuidv4(), leagueId, user.id]);
      }

      added.push({ username, team_name: teamName });
    }

    // Also mark the commissioner's own payment as paid so the draft gate clears
    await db.run(`
      UPDATE member_payments SET status = 'paid', paid_at = CURRENT_TIMESTAMP
      WHERE league_id = ? AND user_id = ? AND status = 'pending'
    `, [leagueId, req.user.id]);

    res.json({
      added,
      message: `Added ${added.length} test user${added.length !== 1 ? 's' : ''}. All payments marked paid.`,
    });
  } catch (err) {
    console.error('populate-test error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// PUT /api/admin/games/:gameId/result
// Record game result (score + winner) without requiring per-player stats.
// Auto-eliminates the losing team.
router.put('/games/:gameId/result', authMiddleware, async (req, res) => {
  try {
    const { winner_team, team1_score, team2_score } = req.body;
    const game = await db.get('SELECT * FROM games WHERE id = ?', [req.params.gameId]);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (!winner_team) return res.status(400).json({ error: 'winner_team is required' });
    if (winner_team !== game.team1 && winner_team !== game.team2) {
      return res.status(400).json({ error: 'winner_team must be one of the two teams in this game' });
    }

    await db.run(`
      UPDATE games SET is_completed = 1, winner_team = ?, team1_score = ?, team2_score = ? WHERE id = ?
    `, [winner_team, parseInt(team1_score) || 0, parseInt(team2_score) || 0, req.params.gameId]);

    const losingTeam = winner_team === game.team1 ? game.team2 : game.team1;
    await db.run('UPDATE players SET is_eliminated = 1 WHERE team = ?', [losingTeam]);

    const updatedGame = await db.get('SELECT * FROM games WHERE id = ?', [req.params.gameId]);
    res.json({ game: updatedGame, eliminated: losingTeam });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/schedule/generate
// Generate Round of 64 games from the seeded teams in the players table.
// Seeds are paired: 1v16, 2v15, 3v14, 4v13, 5v12, 6v11, 7v10, 8v9 per region.
// Skips games that already exist (safe to run multiple times).
router.post('/schedule/generate', authMiddleware, async (req, res) => {
  try {
    // Must be called by a commissioner of any league (basic auth check)
    const teams = await db.all(`
      SELECT team, seed, region
      FROM players
      WHERE is_eliminated = 0 OR is_eliminated = 0
      GROUP BY team, seed, region
      ORDER BY region, seed
    `);

    if (!teams.length) {
      return res.status(400).json({ error: 'No teams found in the database. Seed player data first.' });
    }

    // R64 dates by region (2026 NCAA Tournament)
    const regionDates = {
      'East':    '2026-03-19',
      'South':   '2026-03-19',
      'West':    '2026-03-20',
      'Midwest': '2026-03-20',
    };

    // Group teams by region
    const byRegion = {};
    for (const t of teams) {
      if (!byRegion[t.region]) byRegion[t.region] = {};
      byRegion[t.region][t.seed] = t.team;
    }

    const created = [];
    const skipped = [];

    for (const [region, seedMap] of Object.entries(byRegion)) {
      const date = regionDates[region] || '2026-03-19';
      // Pair seeds: 1v16, 2v15, 3v14, 4v13, 5v12, 6v11, 7v10, 8v9
      for (let highSeed = 1; highSeed <= 8; highSeed++) {
        const lowSeed = 17 - highSeed;
        const team1 = seedMap[highSeed];
        const team2 = seedMap[lowSeed];
        if (!team1 || !team2) continue;

        // Idempotent — skip if this matchup already exists
        const existing = await db.get(
          "SELECT id FROM games WHERE round_name = 'First Round' AND ((team1 = ? AND team2 = ?) OR (team1 = ? AND team2 = ?))",
          [team1, team2, team2, team1]
        );

        if (existing) {
          skipped.push(`${team1} vs ${team2}`);
          continue;
        }

        const id = uuidv4();
        await db.run(`
          INSERT INTO games (id, game_date, round_name, team1, team2)
          VALUES (?, ?, 'First Round', ?, ?)
        `, [id, date, team1, team2]);

        created.push({
          team1, team2,
          seed1: highSeed, seed2: lowSeed,
          region, date,
        });
      }
    }

    res.json({
      created,
      skipped: skipped.length,
      message: `Created ${created.length} First Round games${skipped.length ? `, skipped ${skipped.length} that already existed` : ''}.`,
    });
  } catch (err) {
    console.error('schedule/generate error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/admin/create-test-league
// Dev/test only — creates a new test league, adds 12 test users, marks all
// payments paid, and starts the draft. Blocked in production.
// ---------------------------------------------------------------------------
router.post('/create-test-league', authMiddleware, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  try {
    const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const leagueName = `Test League ${timestamp}`;
    const leagueId = uuidv4();
    const invite_code = Math.random().toString(36).substring(2, 10).toUpperCase();

    // Create the league
    await db.run(`
      INSERT INTO leagues (id, name, commissioner_id, invite_code, status, max_teams, total_rounds, pick_time_limit, auto_start_on_full)
      VALUES (?, ?, ?, ?, 'lobby', 12, 10, 60, 0)
    `, [leagueId, leagueName, req.user.id, invite_code]);

    await db.run('INSERT INTO scoring_settings (id, league_id) VALUES (?, ?)', [uuidv4(), leagueId]);

    // Add commissioner as member
    await db.run('INSERT INTO league_members (id, league_id, user_id, team_name) VALUES (?, ?, ?, ?)', [
      uuidv4(), leagueId, req.user.id, `${req.user.username}'s Team`
    ]);

    // Mark commissioner payment as paid
    await db.run(`
      INSERT INTO member_payments (id, league_id, user_id, amount, status, paid_at)
      VALUES (?, ?, ?, 5.00, 'paid', CURRENT_TIMESTAMP)
    `, [uuidv4(), leagueId, req.user.id]);

    // Hash test password once
    const password_hash = await bcrypt.hash('testpass123', 6);
    const added = [];

    for (let i = 1; i <= 11; i++) {
      const username = `testuser${String(i).padStart(2, '0')}`;
      const email = `${username}@test.local`;
      const teamName = `Test Team ${i}`;

      let user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
      if (!user) {
        const userId = uuidv4();
        await db.run('INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)',
          [userId, email, username, password_hash]);
        user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
      }

      const alreadyMember = await db.get('SELECT id FROM league_members WHERE league_id = ? AND user_id = ?', [leagueId, user.id]);
      if (alreadyMember) continue;

      await db.run('INSERT INTO league_members (id, league_id, user_id, team_name) VALUES (?, ?, ?, ?)',
        [uuidv4(), leagueId, user.id, teamName]);

      await db.run(`
        INSERT INTO member_payments (id, league_id, user_id, amount, status, paid_at)
        VALUES (?, ?, ?, 5.00, 'paid', CURRENT_TIMESTAMP)
      `, [uuidv4(), leagueId, user.id]);

      added.push(username);
    }

    // Start the draft (assigns random draft order, sets status = 'drafting')
    const result = await performStartDraft(leagueId, null); // pass null so no socket emit yet
    if (!result.success) {
      return res.status(400).json({ error: `League created but draft failed to start: ${result.error}`, leagueId });
    }

    // Cancel the auto-pick timer — we're filling all picks instantly below
    clearAutoPick(leagueId);

    // Immediately fill every pick for all 12 bot managers (snake draft order)
    const draftMembers = await db.all(`
      SELECT lm.*, u.username FROM league_members lm
      JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = ? ORDER BY lm.draft_order
    `, [leagueId]);

    const numTeams = draftMembers.length;
    const totalPicks = numTeams * result.league.total_rounds;

    for (let pickNum = 1; pickNum <= totalPicks; pickNum++) {
      const round = Math.ceil(pickNum / numTeams);
      const pickInRound = (pickNum - 1) % numTeams;
      const draftPos = round % 2 === 1 ? pickInRound + 1 : numTeams - pickInRound;
      const picker = draftMembers.find(m => m.draft_order === draftPos);
      if (!picker) continue;

      const available = await db.get(`
        SELECT * FROM players
        WHERE id NOT IN (SELECT player_id FROM draft_picks WHERE league_id = ?)
        ORDER BY season_ppg DESC, name ASC
        LIMIT 1
      `, [leagueId]);
      if (!available) break;

      await db.run(`
        INSERT INTO draft_picks (id, league_id, user_id, player_id, pick_number, round)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [uuidv4(), leagueId, picker.user_id, available.id, pickNum, round]);
    }

    await db.run("UPDATE leagues SET current_pick = ?, status = 'active' WHERE id = ?",
      [totalPicks + 1, leagueId]);

    // Notify any connected sockets that the draft is complete
    const io = req.app.get('io');
    if (io) {
      const finalState = await getDraftState(leagueId);
      io.to(`draft_${leagueId}`).emit('draft_completed', finalState);
    }

    res.json({
      leagueId,
      leagueName,
      membersAdded: added.length + 1,
      message: `Test league created with ${added.length + 1} members. Draft completed instantly.`,
    });
  } catch (err) {
    console.error('create-test-league error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// POST /api/admin/leagues/:leagueId/randomize-order
// Commissioner-only, one-and-done. Shuffles draft order, locks it, and broadcasts.
router.post('/leagues/:leagueId/randomize-order', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const league = await requireCommissioner(req, res, leagueId);
    if (!league) return;

    if (league.draft_order_randomized) {
      return res.status(400).json({ error: 'Draft order has already been randomized' });
    }
    if (league.status !== 'lobby') {
      return res.status(400).json({ error: 'Can only randomize draft order while league is in lobby' });
    }

    const members = await db.all(
      'SELECT id, user_id FROM league_members WHERE league_id = ? ORDER BY RANDOM()',
      [leagueId]
    );

    await db.transaction(async (tx) => {
      for (let idx = 0; idx < members.length; idx++) {
        await tx.run('UPDATE league_members SET draft_order = ? WHERE id = ?', [idx + 1, members[idx].id]);
      }
      await tx.run('UPDATE leagues SET draft_order_randomized = 1 WHERE id = ?', [leagueId]);
    });

    // Post system wall message
    const { postSystemMessage } = require('../wallUtils');
    const io = req.app.get('io');
    await postSystemMessage(leagueId, '🎲 The draft order has been randomized by the commissioner!', io);

    // Emit updated league state to the draft room
    const updatedMembers = await db.all(`
      SELECT lm.draft_order, lm.team_name, u.username
      FROM league_members lm JOIN users u ON lm.user_id = u.id
      WHERE lm.league_id = ? ORDER BY lm.draft_order
    `, [leagueId]);

    if (io) {
      io.to(`draft_${leagueId}`).emit('draft_order_randomized', { members: updatedMembers });
      io.to(`league_${leagueId}`).emit('draft_order_randomized', { members: updatedMembers });
    }

    res.json({ success: true, members: updatedMembers });
  } catch (err) {
    console.error('randomize-order error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/admin/pull-bracket — manually trigger ESPN bracket + roster pull
router.post('/pull-bracket', authMiddleware, async (req, res) => {
  try {
    const result = await pullBracket();
    res.json(result);
  } catch (err) {
    console.error('[admin] pull-bracket error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/pull-schedule — manually trigger full tournament schedule pull
router.post('/pull-schedule', authMiddleware, async (req, res) => {
  try {
    const { pullSchedule } = require('../espnPoller');
    const io = req.app.get('io');
    const result = await pullSchedule(io);
    res.json(result);
  } catch (err) {
    console.error('[admin] pull-schedule error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Draft Import ─────────────────────────────────────────────────────────────
// Maps ownerName (from import data) → DB username or email
const IMPORT_OWNER_MAP = {
  'Collin Wohlfert':  'cwohlfert',
  'Tate Small':       'Tate Small',
  'Austin Helms':     'athelms',
  'Patrick Taylor':   'Patster7',
  'Preston Trout':    'preston_trout@yahoo.com',
  'Tom Sheehan':      'SheehanT16',
  'Sean Meekins':     'Smeekins22',
  'Garrett Washenko': 'Gwashenko',
  // TBD — handled as ghost users below
};

function ghostSlug(ownerName) {
  return ownerName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

async function findOrCreateGhostUser(ownerName) {
  const slug      = ghostSlug(ownerName);
  const email     = `ghost_${slug}@tourneyrun.internal`;
  const username  = `ghost_${slug}`;
  let user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) {
    const id   = uuidv4();
    const hash = bcrypt.hashSync(`ghost_no_access_${id}`, 4);
    await db.run('INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)',
      [id, email, username, hash]);
    user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
  }
  return user;
}


module.exports = router;
