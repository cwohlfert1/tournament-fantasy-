const express = require('express');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function oddsDisplayToDecimal(str) {
  if (!str) return 999;
  const parts = String(str).split(':');
  if (parts.length !== 2) return 999;
  const num = parseFloat(parts[0]);
  const den = parseFloat(parts[1]);
  if (isNaN(num) || isNaN(den) || den === 0) return 999;
  return num / den + 1;
}

function rankToOdds(rank) {
  const r = rank || 9999;
  const bands = [
    { minRank: 1,   maxRank: 5,    minOdds: 8,   maxOdds: 15   },
    { minRank: 6,   maxRank: 15,   minOdds: 18,  maxOdds: 33   },
    { minRank: 16,  maxRank: 30,   minOdds: 35,  maxOdds: 80   },
    { minRank: 31,  maxRank: 60,   minOdds: 90,  maxOdds: 150  },
    { minRank: 61,  maxRank: 100,  minOdds: 175, maxOdds: 400  },
    { minRank: 101, maxRank: 9999, minOdds: 500, maxOdds: 2000 },
  ];
  const band = bands.find(b => r >= b.minRank && r <= b.maxRank) || bands[bands.length - 1];
  const bandSize = Math.max(1, band.maxRank - band.minRank);
  const pos = Math.min(1, (r - band.minRank) / bandSize);
  const rawOdds = Math.round(band.minOdds + pos * (band.maxOdds - band.minOdds));
  // Round to nice numbers
  const nice = rawOdds < 20  ? Math.round(rawOdds / 2) * 2 :
               rawOdds < 100 ? Math.round(rawOdds / 5) * 5 :
               Math.round(rawOdds / 25) * 25;
  return { odds_display: `${nice}:1`, odds_decimal: nice + 1 };
}

function calculatePlayerSalary({ world_ranking, odds_decimal, recent_form = [], course_history = null }) {
  const r = world_ranking || 9999;
  let base;
  if      (r <= 5)   base = 11500;
  else if (r <= 10)  base = 10500;
  else if (r <= 20)  base = 9500;
  else if (r <= 35)  base = 8500;
  else if (r <= 60)  base = 7500;
  else if (r <= 100) base = 6500;
  else               base = 5500;

  let adj = 0;
  const validFinishes = (recent_form || []).filter(f => f != null && f > 0);
  if (validFinishes.length > 0) {
    const avg = validFinishes.reduce((s, f) => s + f, 0) / validFinishes.length;
    if (avg < 10)      adj += 500;
    else if (avg < 25) adj += 250;
    else if (avg > 50) adj -= 250;
  }
  if (course_history && course_history > 0) {
    if      (course_history <= 5)  adj += 500;
    else if (course_history <= 10) adj += 250;
  }
  const dec = odds_decimal || 999;
  if      (dec < 10)  adj += 500;
  else if (dec > 100) adj -= 500;

  return Math.max(4500, Math.min(12500, Math.round((base + adj) / 100) * 100));
}

function assignPlayerToTier(odds_decimal, tiersConfig) {
  const dec = odds_decimal || 999;
  for (const t of tiersConfig) {
    const minDec = oddsDisplayToDecimal(t.odds_min);
    const maxDec = oddsDisplayToDecimal(t.odds_max);
    if (dec >= minDec && dec <= maxDec) return t.tier;
  }
  return tiersConfig[tiersConfig.length - 1]?.tier || 1;
}

function getRecentForm(playerId) {
  return db.prepare(`
    SELECT gs.finish_position FROM golf_scores gs
    JOIN golf_tournaments gt ON gs.tournament_id = gt.id
    WHERE gs.player_id = ? AND gs.finish_position IS NOT NULL
    ORDER BY gt.start_date DESC LIMIT 5
  `).all(playerId).map(s => s.finish_position);
}

function getCourseHistory(playerId, tournName) {
  const row = db.prepare(`
    SELECT MIN(gs.finish_position) as best_finish FROM golf_scores gs
    JOIN golf_tournaments gt ON gs.tournament_id = gt.id
    WHERE gs.player_id = ? AND gt.name = ? AND gs.finish_position IS NOT NULL
  `).get(playerId, tournName);
  return row?.best_finish || null;
}

// ── GET /tournaments/:id/field ────────────────────────────────────────────────

router.get('/tournaments/:id/field', authMiddleware, (req, res) => {
  try {
    const tourn = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(req.params.id);
    if (!tourn) return res.status(404).json({ error: 'Tournament not found' });

    const players = db.prepare('SELECT * FROM golf_players WHERE is_active = 1 ORDER BY world_ranking ASC').all();

    const field = players.map(p => {
      const gen = (!p.odds_display || !p.odds_decimal) ? rankToOdds(p.world_ranking) : null;
      const odds_display = p.odds_display || gen.odds_display;
      const odds_decimal = p.odds_decimal || gen.odds_decimal;
      const recent_form  = getRecentForm(p.id);
      const course_history = getCourseHistory(p.id, tourn.name);
      return {
        player_id: p.id, name: p.name, country: p.country,
        world_ranking: p.world_ranking, salary: p.salary,
        odds_display, odds_decimal, recent_form, course_history,
      };
    });

    res.json({ tournament: tourn, field });
  } catch (err) {
    console.error('[golf-pool] field error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /leagues/:id/assign-tiers ───────────────────────────────────────────

router.post('/leagues/:id/assign-tiers', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    if (league.format_type !== 'pool') return res.status(400).json({ error: 'Pool leagues only' });

    const { tournament_id } = req.body;
    if (!tournament_id) return res.status(400).json({ error: 'tournament_id required' });
    const tourn = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tournament_id);
    if (!tourn) return res.status(404).json({ error: 'Tournament not found' });

    let tiersConfig = [];
    try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}
    if (!tiersConfig.length) return res.status(400).json({ error: 'No tier config. Configure tiers on league creation.' });

    // Save tournament selection on league
    try { db.prepare('UPDATE golf_leagues SET pool_tournament_id = ? WHERE id = ?').run(tournament_id, league.id); } catch (_) {}

    // Clear non-manually-overridden assignments for this tournament
    db.prepare('DELETE FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND manually_overridden = 0').run(league.id, tournament_id);

    const ins = db.prepare(`
      INSERT OR REPLACE INTO pool_tier_players
        (id, league_id, tournament_id, player_id, player_name, tier_number,
         odds_display, odds_decimal, world_ranking, salary, manually_overridden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const isSalaryCap = league.pick_sheet_format === 'salary_cap';
    const tierMap = {};

    const players = db.prepare('SELECT * FROM golf_players WHERE is_active = 1 ORDER BY world_ranking ASC').all();

    db.transaction(() => {
      for (const p of players) {
        // Respect manually overridden assignments
        const overridden = db.prepare(
          'SELECT id FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND player_id = ? AND manually_overridden = 1'
        ).get(league.id, tournament_id, p.id);
        if (overridden) continue;

        const gen = (!p.odds_display || !p.odds_decimal) ? rankToOdds(p.world_ranking) : null;
        const odds_display = p.odds_display || gen.odds_display;
        const odds_decimal = p.odds_decimal || gen.odds_decimal;

        const tierNum = assignPlayerToTier(odds_decimal, tiersConfig);
        let salary = 0;
        if (isSalaryCap) {
          const recent_form   = getRecentForm(p.id);
          const course_history = getCourseHistory(p.id, tourn.name);
          salary = calculatePlayerSalary({ world_ranking: p.world_ranking, odds_decimal, recent_form, course_history });
        }

        ins.run(uuidv4(), league.id, tournament_id, p.id, p.name, tierNum, odds_display, odds_decimal, p.world_ranking, salary);
        if (!tierMap[tierNum]) tierMap[tierNum] = [];
        tierMap[tierNum].push({ player_id: p.id, name: p.name, tier_number: tierNum, odds_display, odds_decimal, world_ranking: p.world_ranking, salary });
      }
    })();

    const tiers = tiersConfig.map(t => ({
      tier: t.tier, odds_min: t.odds_min, odds_max: t.odds_max, picks: t.picks,
      players: (tierMap[t.tier] || []).sort((a, b) => a.world_ranking - b.world_ranking),
    }));

    res.json({ ok: true, tournament_id, tiers });
  } catch (err) {
    console.error('[golf-pool] assign-tiers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /leagues/:id/tier-players ────────────────────────────────────────────

router.get('/leagues/:id/tier-players', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    // Allow commissioner or any league member to read tier players
    const isMember = db.prepare('SELECT 1 FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (league.commissioner_id !== req.user.id && !isMember) return res.status(403).json({ error: 'Not a member' });

    const tid = req.query.tournament_id || league.pool_tournament_id;
    if (!tid) return res.json({ tiers: [], tournament_id: null });

    const players = db.prepare(
      'SELECT * FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? ORDER BY tier_number ASC, world_ranking ASC'
    ).all(league.id, tid);

    let tiersConfig = [];
    try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}

    const tiers = tiersConfig.map(t => ({
      tier: t.tier, odds_min: t.odds_min, odds_max: t.odds_max, picks: t.picks,
      players: players.filter(p => p.tier_number === t.tier),
    }));

    res.json({ tiers, tournament_id: tid });
  } catch (err) {
    console.error('[golf-pool] get tier-players error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /leagues/:id/tier-players/:playerId ─────────────────────────────────
// Update salary override

router.patch('/leagues/:id/tier-players/:playerId', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });

    const tid = req.body.tournament_id || league.pool_tournament_id;
    const row = db.prepare(
      'SELECT * FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND player_id = ?'
    ).get(league.id, tid, req.params.playerId);
    if (!row) return res.status(404).json({ error: 'Player not in tier list' });

    if (req.body.salary !== undefined) {
      db.prepare('UPDATE pool_tier_players SET salary = ?, manually_overridden = 1 WHERE id = ?')
        .run(parseInt(req.body.salary) || 0, row.id);
    }
    if (req.body.reset_salary) {
      // Recalculate auto salary
      const p = db.prepare('SELECT * FROM golf_players WHERE id = ?').get(req.params.playerId);
      if (p) {
        const gen = (!p.odds_display || !p.odds_decimal) ? rankToOdds(p.world_ranking) : null;
        const odds_decimal = p.odds_decimal || gen?.odds_decimal;
        const tourn = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tid);
        const recent_form = getRecentForm(p.id);
        const course_history = tourn ? getCourseHistory(p.id, tourn.name) : null;
        const salary = calculatePlayerSalary({ world_ranking: p.world_ranking, odds_decimal, recent_form, course_history });
        db.prepare('UPDATE pool_tier_players SET salary = ?, manually_overridden = 0 WHERE id = ?').run(salary, row.id);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[golf-pool] patch tier-player error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /leagues/:id/tier-players/:playerId/move ─────────────────────────────

router.post('/leagues/:id/tier-players/:playerId/move', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });

    const { tier_number, tournament_id } = req.body;
    if (!tier_number) return res.status(400).json({ error: 'tier_number required' });
    const tid = tournament_id || league.pool_tournament_id;

    const row = db.prepare(
      'SELECT * FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND player_id = ?'
    ).get(league.id, tid, req.params.playerId);
    if (!row) return res.status(404).json({ error: 'Player not in tier list' });

    db.prepare('UPDATE pool_tier_players SET tier_number = ?, manually_overridden = 1 WHERE id = ?')
      .run(parseInt(tier_number), row.id);

    res.json({ ok: true });
  } catch (err) {
    console.error('[golf-pool] move tier-player error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Lock-time helper (Thursday 12:00 UTC of tournament week) ─────────────────

function computeLockTime(startDate) {
  const d = new Date(startDate);
  const dow = d.getDay();
  const daysBack = (dow + 3) % 7;
  d.setDate(d.getDate() - daysBack);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

// ── GET /leagues/:id/picks/my ─────────────────────────────────────────────────

router.get('/leagues/:id/picks/my', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const member = db.prepare('SELECT * FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!member && league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Not a member' });

    const tid = req.query.tournament_id || league.pool_tournament_id;
    if (!tid) return res.json({ picks: [], submitted: false });

    const picks = db.prepare(
      'SELECT * FROM pool_picks WHERE league_id = ? AND tournament_id = ? AND user_id = ? ORDER BY tier_number ASC'
    ).all(req.params.id, tid, req.user.id);

    // Tier config for total target
    let tiersConfig = [];
    try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}
    const totalTarget = tiersConfig.reduce((s, t) => s + (parseInt(t.picks) || 0), 0);

    const tourn = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tid);
    const lockTime = (tourn && league.picks_lock_time) ? league.picks_lock_time : (tourn ? computeLockTime(tourn.start_date) : null);

    res.json({
      picks,
      submitted: picks.length > 0,
      picks_locked: !!league.picks_locked,
      lock_time: lockTime,
      tournament: tourn,
      total_target: totalTarget,
    });
  } catch (err) {
    console.error('[golf-pool] get my picks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /leagues/:id/picks ───────────────────────────────────────────────────

router.post('/leagues/:id/picks', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const member = db.prepare('SELECT * FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    if (league.picks_locked) return res.status(403).json({ error: 'Picks are locked for this tournament.' });

    const { tournament_id, picks } = req.body;
    const tid = tournament_id || league.pool_tournament_id;
    if (!tid) return res.status(400).json({ error: 'tournament_id required' });
    if (!Array.isArray(picks) || picks.length === 0) return res.status(400).json({ error: 'picks array required' });

    const tourn = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tid);
    if (!tourn) return res.status(404).json({ error: 'Tournament not found' });

    // Check lock time
    const lockTime = league.picks_lock_time || computeLockTime(tourn.start_date);
    if (new Date() >= new Date(lockTime)) {
      db.prepare('UPDATE golf_leagues SET picks_locked = 1 WHERE id = ?').run(req.params.id);
      return res.status(403).json({ error: 'Picks are locked — tee time has passed.' });
    }

    // Validate picks vs tier config
    let tiersConfig = [];
    try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}

    if (tiersConfig.length > 0) {
      for (const t of tiersConfig) {
        const tierPicks = picks.filter(p => p.tier_number === t.tier);
        if (tierPicks.length !== t.picks) {
          return res.status(400).json({ error: `Tier ${t.tier} requires exactly ${t.picks} pick(s), got ${tierPicks.length}.` });
        }
      }
    }

    // Validate salary cap if applicable
    if (league.pick_sheet_format === 'salary_cap' && league.pool_salary_cap) {
      const totalSalary = picks.reduce((s, p) => {
        const row = db.prepare('SELECT salary FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND player_id = ?').get(req.params.id, tid, p.player_id);
        return s + (row?.salary || 0);
      }, 0);
      if (totalSalary > league.pool_salary_cap) {
        return res.status(400).json({ error: `Picks exceed salary cap ($${league.pool_salary_cap.toLocaleString()}).` });
      }
    }

    // Upsert picks (replace if already submitted)
    db.transaction(() => {
      db.prepare('DELETE FROM pool_picks WHERE league_id = ? AND tournament_id = ? AND user_id = ?').run(req.params.id, tid, req.user.id);
      const ins = db.prepare(`
        INSERT INTO pool_picks (id, league_id, tournament_id, user_id, player_id, player_name, tier_number, salary_used)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of picks) {
        const player = db.prepare('SELECT * FROM golf_players WHERE id = ?').get(p.player_id);
        const tierRow = db.prepare('SELECT salary FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND player_id = ?').get(req.params.id, tid, p.player_id);
        ins.run(uuidv4(), req.params.id, tid, req.user.id, p.player_id, player?.name || p.player_name || '', p.tier_number || null, tierRow?.salary || 0);
      }
      // Persist lock_time on league so pick sheet can show consistent countdown
      if (!league.picks_lock_time) {
        db.prepare('UPDATE golf_leagues SET picks_lock_time = ? WHERE id = ?').run(lockTime, req.params.id);
      }
    })();

    res.json({ ok: true, submitted_count: picks.length });
  } catch (err) {
    console.error('[golf-pool] submit picks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /leagues/:id/picks/all (commissioner) ─────────────────────────────────

router.get('/leagues/:id/picks/all', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });

    const tid = req.query.tournament_id || league.pool_tournament_id;
    const members = db.prepare(`
      SELECT glm.*, u.username, u.email FROM golf_league_members glm
      JOIN users u ON glm.user_id = u.id
      WHERE glm.golf_league_id = ? ORDER BY glm.joined_at ASC
    `).all(req.params.id);

    const picks = tid
      ? db.prepare('SELECT * FROM pool_picks WHERE league_id = ? AND tournament_id = ? ORDER BY user_id, tier_number').all(req.params.id, tid)
      : [];

    const memberStatus = members.map(m => {
      const myPicks = picks.filter(p => p.user_id === m.user_id);
      return {
        user_id: m.user_id, username: m.username, email: m.email,
        team_name: m.team_name,
        submitted: myPicks.length > 0,
        submitted_at: myPicks[0]?.submitted_at || null,
        picks_count: myPicks.length,
      };
    });

    res.json({ members: memberStatus, picks, tournament_id: tid });
  } catch (err) {
    console.error('[golf-pool] get all picks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /leagues/:id/my-roster ────────────────────────────────────────────────

router.get('/leagues/:id/my-roster', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const member = db.prepare('SELECT * FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!member && league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Not a member' });

    const tid = req.query.tournament_id || league.pool_tournament_id;
    if (!tid) return res.json({ picks: [], submitted: false, picks_locked: !!league.picks_locked });

    // picks JOIN pool_tier_players (odds, world_ranking) JOIN golf_players (country) LEFT JOIN golf_scores
    const picks = db.prepare(`
      SELECT
        pp.id, pp.tier_number, pp.player_id, pp.player_name, pp.salary_used,
        ptp.odds_display, ptp.world_ranking,
        gp.country,
        gs.round1, gs.round2, gs.round3, gs.round4,
        gs.made_cut, gs.finish_position, gs.fantasy_points
      FROM pool_picks pp
      LEFT JOIN pool_tier_players ptp ON ptp.league_id = pp.league_id
        AND ptp.tournament_id = pp.tournament_id
        AND ptp.player_id = pp.player_id
      LEFT JOIN golf_players gp ON gp.id = pp.player_id
      LEFT JOIN golf_scores gs ON gs.player_id = pp.player_id AND gs.tournament_id = pp.tournament_id
      WHERE pp.league_id = ? AND pp.tournament_id = ? AND pp.user_id = ?
      ORDER BY pp.tier_number ASC, COALESCE(gs.fantasy_points, 0) DESC
    `).all(req.params.id, tid, req.user.id);

    const tourn = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tid);
    const lockTime = league.picks_lock_time || (tourn ? computeLockTime(tourn.start_date) : null);

    // Build tiers with available players so the UI can render the pick sheet
    let tiersConfig = [];
    try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}

    const tierPlayers = db.prepare(
      'SELECT * FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? ORDER BY tier_number ASC, world_ranking ASC'
    ).all(league.id, tid);

    const tiers = tiersConfig.map(t => ({
      tier:     t.tier,
      tier_number: t.tier,
      odds_min: t.odds_min,
      odds_max: t.odds_max,
      picks:    t.picks,
      players:  tierPlayers.filter(p => p.tier_number === t.tier),
    }));

    res.json({
      picks,
      submitted: picks.length > 0,
      picks_locked: !!league.picks_locked,
      lock_time: lockTime,
      tournament: tourn,
      tiers,
    });
  } catch (err) {
    console.error('[golf-pool] my-roster error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /leagues/:id/picks/remind ───────────────────────────────────────────

router.post('/leagues/:id/picks/remind', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });

    const tid = league.pool_tournament_id;
    const unpicked = db.prepare(`
      SELECT u.username, u.email FROM golf_league_members glm
      JOIN users u ON glm.user_id = u.id
      WHERE glm.golf_league_id = ?
        AND glm.user_id NOT IN (SELECT user_id FROM pool_picks WHERE league_id = ? AND tournament_id = ?)
    `).all(req.params.id, req.params.id, tid || '');

    // Email sending is a stub — log for now, wire email service when ready
    console.log(`[golf-pool] Reminder for ${league.name}: ${unpicked.length} unpicked members`, unpicked.map(u => u.email));

    res.json({ ok: true, reminded: unpicked.length });
  } catch (err) {
    console.error('[golf-pool] remind error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
