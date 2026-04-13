const express = require('express');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const db = require('../db/index');
const { applyDropScoring, computeDropIds } = require('../pool-utils');
const { computeLockTime } = require('../golfPoolLockService');

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

// Golf-pool tier size helper.
// For a 4-tier pool the target structure (scaled from 132-player baseline) is:
//   T1: ~10 elite favorites, T2: ~22, T3: ~38, T4: everyone else
// For other tier counts, fall back to equal split.
function golfPoolTierSizes(total, tierCount) {
  if (tierCount === 4) {
    const t1 = Math.max(5, Math.round(total * 10 / 132));
    const t2 = Math.max(t1 + 1, Math.round(total * 22 / 132));
    const t3 = Math.max(t2 + 1, Math.round(total * 38 / 132));
    const t4 = total - t1 - t2 - t3;
    if (t4 >= 1) return [t1, t2, t3, t4];
  }
  // Fallback: equal split
  const base = Math.floor(total / tierCount);
  const rem  = total % tierCount;
  return Array.from({ length: tierCount }, (_, i) => base + (i < rem ? 1 : 0));
}

// Salary derived from American betting odds, scaled to the league's weekly cap.
// Base scale assumes $50,000 cap; other caps scale proportionally.
function calculatePlayerSalary({ world_ranking, odds_decimal, recent_form = [], course_history = null, weekly_salary_cap = 50000 }) {
  return calculatePlayerSalaryFromOdds(null, weekly_salary_cap, { world_ranking, odds_decimal });
}

function calculatePlayerSalaryFromOdds(americanOdds, weeklySalaryCap = 50000, fallback = {}) {
  const cap = weeklySalaryCap || 50000;
  const scale = cap / 50000;

  let baseSalary;
  if (americanOdds === null || americanOdds === undefined) {
    // Fall back to world ranking if no odds provided
    const r = fallback.world_ranking || 9999;
    if      (r <= 10)  baseSalary = 9500;
    else if (r <= 30)  baseSalary = 8000;
    else if (r <= 75)  baseSalary = 6500;
    else               baseSalary = 5000;
  } else if (americanOdds < 2000) {
    const t = (americanOdds - 100) / 1900;
    baseSalary = Math.round(10000 - t * 1000);
  } else if (americanOdds < 4000) {
    const t = (americanOdds - 2000) / 2000;
    baseSalary = Math.round(8500 - t * 1000);
  } else if (americanOdds < 8000) {
    const t = (americanOdds - 4000) / 4000;
    baseSalary = Math.round(7000 - t * 1000);
  } else {
    const t = Math.min(1, (americanOdds - 8000) / 12000);
    baseSalary = Math.round(5500 - t * 1000);
  }

  const scaled = Math.round((baseSalary * scale) / 100) * 100;
  return Math.max(Math.round(4500 * scale / 100) * 100, scaled);
}

// Assign salaries to all pool_tier_players rows for a given salary_cap league.
async function assignSalaryCapSalaries(leagueId) {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', leagueId);
    if (!league || league.format_type !== 'salary_cap') return { updated: 0 };
    const cap = league.weekly_salary_cap || 50000;
    const tid = league.pool_tournament_id;
    if (!tid) return { updated: 0 };

    const players = await db.all(
      'SELECT ptp.id, ptp.player_id, ptp.odds_decimal, gp.world_ranking FROM pool_tier_players ptp LEFT JOIN golf_players gp ON gp.id = ptp.player_id WHERE ptp.league_id = ? AND ptp.tournament_id = ?',
      leagueId, tid
    );

    const updSql = 'UPDATE pool_tier_players SET salary = ? WHERE id = ?';
    let updated = 0;
    await db.transaction(async (tx) => {
      for (const row of players) {
        // Convert decimal odds to American for the salary function
        let american = null;
        if (row.odds_decimal && row.odds_decimal > 1) {
          american = row.odds_decimal >= 2
            ? Math.round((row.odds_decimal - 1) * 100)
            : Math.round(-100 / (row.odds_decimal - 1));
        }
        const salary = calculatePlayerSalaryFromOdds(american, cap, { world_ranking: row.world_ranking });
        await tx.run(updSql, salary, row.id);
        updated++;
      }
    });
    return { updated };
  } catch (err) {
    console.error('[golf-pool] assignSalaryCapSalaries error:', err);
    return { updated: 0, error: err.message };
  }
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

async function getRecentForm(playerId) {
  const rows = await db.all(`
    SELECT gs.finish_position FROM golf_scores gs
    JOIN golf_tournaments gt ON gs.tournament_id = gt.id
    WHERE gs.player_id = ? AND gs.finish_position IS NOT NULL
    ORDER BY gt.start_date DESC LIMIT 5
  `, playerId);
  return rows.map(s => s.finish_position);
}

async function getCourseHistory(playerId, tournName) {
  const row = await db.get(`
    SELECT MIN(gs.finish_position) as best_finish FROM golf_scores gs
    JOIN golf_tournaments gt ON gs.tournament_id = gt.id
    WHERE gs.player_id = ? AND gt.name = ? AND gs.finish_position IS NOT NULL
  `, playerId, tournName);
  return row?.best_finish || null;
}

// ── GET /tournaments/:id/field ────────────────────────────────────────────────

router.get('/tournaments/:id/field', authMiddleware, async (req, res) => {
  try {
    const tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', req.params.id);
    if (!tourn) return res.status(404).json({ error: 'Tournament not found' });

    const players = await db.all('SELECT * FROM golf_players WHERE is_active = 1 ORDER BY world_ranking ASC');

    const field = [];
    for (const p of players) {
      const gen = (!p.odds_display || !p.odds_decimal) ? rankToOdds(p.world_ranking) : null;
      const odds_display = p.odds_display || gen.odds_display;
      const odds_decimal = p.odds_decimal || gen.odds_decimal;
      const recent_form  = await getRecentForm(p.id);
      const course_history = await getCourseHistory(p.id, tourn.name);
      field.push({
        player_id: p.id, name: p.name, country: p.country,
        world_ranking: p.world_ranking, salary: p.salary,
        odds_display, odds_decimal, recent_form, course_history,
      });
    }

    res.json({ tournament: tourn, field });
  } catch (err) {
    console.error('[golf-pool] field error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /leagues/:id/assign-tiers ───────────────────────────────────────────

router.post('/leagues/:id/assign-tiers', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    if (!['pool', 'salary_cap'].includes(league.format_type)) return res.status(400).json({ error: 'Pool or salary cap leagues only' });

    const { tournament_id } = req.body;
    if (!tournament_id) return res.status(400).json({ error: 'tournament_id required' });
    const tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', tournament_id);
    if (!tourn) return res.status(404).json({ error: 'Tournament not found' });

    let tiersConfig = [];
    try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}

    // Salary cap leagues have a single flat tier seeded at creation
    if (!tiersConfig.length && league.format_type === 'salary_cap') {
      tiersConfig = [{ tier: 1, odds_min: '', odds_max: '', picks: league.starters_per_week || league.roster_size || 6 }];
    }
    if (!tiersConfig.length) return res.status(400).json({ error: 'No tier config. Configure tiers on league creation.' });

    // Save tournament selection on league and reset all per-tournament state so each
    // new event starts fresh: picks window open, drops not yet applied.
    const isSameTournament = league.pool_tournament_id === tournament_id;
    try {
      await db.run(`
        UPDATE golf_leagues
        SET pool_tournament_id = ?,
            picks_locked       = CASE WHEN ? THEN picks_locked ELSE 0 END,
            picks_lock_time    = CASE WHEN ? THEN picks_lock_time ELSE NULL END,
            pool_drops_applied = CASE WHEN ? THEN pool_drops_applied ELSE 0 END
        WHERE id = ?
      `, tournament_id, isSameTournament ? 1 : 0, isSameTournament ? 1 : 0, isSameTournament ? 1 : 0, league.id);
    } catch (_) {}

    // Clear non-manually-overridden assignments for this tournament
    await db.run('DELETE FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND manually_overridden = 0', league.id, tournament_id);

    const insSql = `
      INSERT OR REPLACE INTO pool_tier_players
        (id, league_id, tournament_id, player_id, player_name, tier_number,
         odds_display, odds_decimal, world_ranking, salary, manually_overridden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `;

    const isSalaryCap = league.format_type === 'salary_cap';
    const tierMap = {};

    const players = await db.all('SELECT * FROM golf_players WHERE is_active = 1 ORDER BY world_ranking ASC');

    await db.transaction(async (tx) => {
      for (const p of players) {
        // Respect manually overridden assignments
        const overridden = await tx.get(
          'SELECT id FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND player_id = ? AND manually_overridden = 1',
          league.id, tournament_id, p.id
        );
        if (overridden) continue;

        const gen = (!p.odds_display || !p.odds_decimal) ? rankToOdds(p.world_ranking) : null;
        const odds_display = p.odds_display || gen.odds_display;
        const odds_decimal = p.odds_decimal || gen.odds_decimal;

        const tierNum = assignPlayerToTier(odds_decimal, tiersConfig);
        let salary = 0;
        if (isSalaryCap) {
          const recent_form   = await getRecentForm(p.id);
          const course_history = await getCourseHistory(p.id, tourn.name);
          salary = calculatePlayerSalary({ world_ranking: p.world_ranking, odds_decimal, recent_form, course_history });
        }

        await tx.run(insSql, uuidv4(), league.id, tournament_id, p.id, p.name, tierNum, odds_display, odds_decimal, p.world_ranking, salary);
        if (!tierMap[tierNum]) tierMap[tierNum] = [];
        tierMap[tierNum].push({ player_id: p.id, name: p.name, tier_number: tierNum, odds_display, odds_decimal, world_ranking: p.world_ranking, salary });
      }
    });

    const tiers = tiersConfig.map(t => ({
      tier: t.tier, odds_min: t.odds_min, odds_max: t.odds_max, picks: t.picks,
      players: (tierMap[t.tier] || []).sort((a, b) => a.world_ranking - b.world_ranking),
    }));

    // For salary_cap leagues, assign salaries from odds now that players are seeded
    if (league.format_type === 'salary_cap') {
      await assignSalaryCapSalaries(league.id);
    }

    res.json({ ok: true, tournament_id, tiers });
  } catch (err) {
    console.error('[golf-pool] assign-tiers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /leagues/:id/tier-players ────────────────────────────────────────────

router.get('/leagues/:id/tier-players', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    // Allow commissioner or any league member to read tier players
    const isMember = await db.get('SELECT 1 FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?', req.params.id, req.user.id);
    if (league.commissioner_id !== req.user.id && !isMember) return res.status(403).json({ error: 'Not a member' });

    const tid = req.query.tournament_id || league.pool_tournament_id;
    if (!tid) return res.json({ tiers: [], tournament_id: null });

    const players = await db.all(`
      SELECT ptp.*, COALESCE(ptp.country, gp.country) AS country
      FROM pool_tier_players ptp
      LEFT JOIN golf_players gp ON gp.id = ptp.player_id
      WHERE ptp.league_id = ? AND ptp.tournament_id = ? AND (ptp.is_withdrawn IS NULL OR ptp.is_withdrawn = 0)
      GROUP BY ptp.player_id
      ORDER BY ptp.tier_number ASC, ptp.world_ranking ASC
    `, league.id, tid);

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

router.patch('/leagues/:id/tier-players/:playerId', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });

    const tid = req.body.tournament_id || league.pool_tournament_id;
    const row = await db.get(
      'SELECT * FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND player_id = ?',
      league.id, tid, req.params.playerId
    );
    if (!row) return res.status(404).json({ error: 'Player not in tier list' });

    if (req.body.salary !== undefined) {
      await db.run('UPDATE pool_tier_players SET salary = ?, manually_overridden = 1 WHERE id = ?',
        parseInt(req.body.salary) || 0, row.id);
    }
    if (req.body.reset_salary) {
      // Recalculate auto salary
      const p = await db.get('SELECT * FROM golf_players WHERE id = ?', req.params.playerId);
      if (p) {
        const gen = (!p.odds_display || !p.odds_decimal) ? rankToOdds(p.world_ranking) : null;
        const odds_decimal = p.odds_decimal || gen?.odds_decimal;
        const tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', tid);
        const recent_form = await getRecentForm(p.id);
        const course_history = tourn ? await getCourseHistory(p.id, tourn.name) : null;
        const salary = calculatePlayerSalary({ world_ranking: p.world_ranking, odds_decimal, recent_form, course_history });
        await db.run('UPDATE pool_tier_players SET salary = ?, manually_overridden = 0 WHERE id = ?', salary, row.id);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[golf-pool] patch tier-player error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /leagues/:id/tier-players/:playerId/move ─────────────────────────────

router.post('/leagues/:id/tier-players/:playerId/move', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });

    const { tier_number, tournament_id } = req.body;
    if (!tier_number) return res.status(400).json({ error: 'tier_number required' });
    const tid = tournament_id || league.pool_tournament_id;

    const row = await db.get(
      'SELECT * FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND player_id = ?',
      league.id, tid, req.params.playerId
    );
    if (!row) return res.status(404).json({ error: 'Player not in tier list' });

    await db.run('UPDATE pool_tier_players SET tier_number = ?, manually_overridden = 1 WHERE id = ?',
      parseInt(tier_number), row.id);

    res.json({ ok: true });
  } catch (err) {
    console.error('[golf-pool] move tier-player error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /leagues/:id/picks/my ─────────────────────────────────────────────────

router.get('/leagues/:id/picks/my', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const member = await db.get('SELECT * FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?', req.params.id, req.user.id);
    if (!member && league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Not a member' });

    const tid = req.query.tournament_id || league.pool_tournament_id;
    if (!tid) return res.json({ picks: [], submitted: false });

    const picks = await db.all(
      'SELECT * FROM pool_picks WHERE league_id = ? AND tournament_id = ? AND user_id = ? ORDER BY tier_number ASC',
      req.params.id, tid, req.user.id
    );

    // Tier config for total target
    let tiersConfig = [];
    try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}
    const totalTarget = tiersConfig.reduce((s, t) => s + (parseInt(t.picks) || 0), 0);

    const tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', tid);
    // Always derive lock time from tournament start_date — if tournament is missing,
    // default to UNLOCKED (never fall back to stale DB picks_lock_time)
    const lockTime = tourn ? computeLockTime(tourn.start_date).toISOString() : null;
    const isLocked = lockTime ? new Date() >= new Date(lockTime) : false;

    res.json({
      picks,
      submitted: picks.length > 0,
      picks_locked: isLocked,
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

router.post('/leagues/:id/picks', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const member = await db.get('SELECT * FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?', req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const { tournament_id, picks, tiebreaker_score, entry_number = 1, entry_team_name } = req.body;
    const tid = tournament_id || league.pool_tournament_id;
    if (!tid) return res.status(400).json({ error: 'tournament_id required' });
    if (!Array.isArray(picks) || picks.length === 0) return res.status(400).json({ error: 'picks array required' });

    const tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', tid);
    if (!tourn) return res.status(404).json({ error: 'Tournament not found' });

    // Always derive lock time from tournament start_date — never trust stale DB value
    const lockTime = computeLockTime(tourn.start_date).toISOString();
    if (new Date() >= new Date(lockTime)) {
      await db.run('UPDATE golf_leagues SET picks_locked = 1, picks_lock_time = ? WHERE id = ?', lockTime, req.params.id);
      return res.status(403).json({ error: 'Picks are locked — tee time has passed.' });
    }

    // Validate tiebreaker for pool format — always stroke play score to par
    if (league.format_type !== 'salary_cap') {
      if (tiebreaker_score === undefined || tiebreaker_score === null || tiebreaker_score === '') {
        return res.status(400).json({ error: 'Tiebreaker score is required — enter the predicted winning score to par.' });
      }
      const tbParsed = parseInt(tiebreaker_score);
      if (isNaN(tbParsed) || tbParsed < -30 || tbParsed > 10) {
        return res.status(400).json({ error: 'Tiebreaker must be between -30 and +10 (score to par).' });
      }
    }
    const tiebreakerScore = tiebreaker_score !== undefined && tiebreaker_score !== '' ? parseInt(tiebreaker_score) : null;

    // Validate multi-entry
    const entryNumber = Math.max(1, parseInt(entry_number) || 1);
    const maxEntries = league.pool_max_entries || 1;
    if (entryNumber > maxEntries) {
      return res.status(400).json({ error: `Maximum ${maxEntries} entr${maxEntries === 1 ? 'y' : 'ies'} allowed per player.` });
    }
    const entryTeamName = (entry_team_name || '').trim() || null;

    // Validate picks vs tier config (pool only — salary_cap uses budget check instead)
    if (league.format_type !== 'salary_cap') {
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
    }

    // Validate salary cap for salary_cap format
    if (league.format_type === 'salary_cap') {
      const cap = league.weekly_salary_cap || 50000;
      const startersCount = league.starters_per_week || league.roster_size || 6;
      if (picks.length !== startersCount) {
        return res.status(400).json({ error: `Must pick exactly ${startersCount} players, got ${picks.length}.` });
      }
      let totalSalary = 0;
      for (const p of picks) {
        const row = await db.get('SELECT salary FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND player_id = ?', req.params.id, tid, p.player_id);
        totalSalary += (row?.salary || 0);
      }
      if (totalSalary > cap) {
        return res.status(400).json({ error: `Picks exceed salary cap ($${cap.toLocaleString()}).` });
      }
    }

    // Upsert picks — entry-specific delete so other entries are not affected
    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM pool_picks WHERE league_id = ? AND tournament_id = ? AND user_id = ? AND COALESCE(entry_number, 1) = ?', req.params.id, tid, req.user.id, entryNumber);
      const insSql = `
        INSERT INTO pool_picks (id, league_id, tournament_id, user_id, player_id, player_name, tier_number, salary_used, tiebreaker_score, entry_number, entry_team_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      for (const p of picks) {
        const player = await tx.get('SELECT * FROM golf_players WHERE id = ?', p.player_id);
        const tierRow = await tx.get('SELECT salary FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND player_id = ?', req.params.id, tid, p.player_id);
        await tx.run(insSql, uuidv4(), req.params.id, tid, req.user.id, p.player_id, player?.name || p.player_name || '', p.tier_number || null, tierRow?.salary || 0, tiebreakerScore, entryNumber, entryTeamName);
      }
      // Persist lock_time on league so pick sheet can show consistent countdown
      if (!league.picks_lock_time) {
        await tx.run('UPDATE golf_leagues SET picks_lock_time = ? WHERE id = ?', lockTime, req.params.id);
      }
    });

    res.json({ ok: true, submitted_count: picks.length });
  } catch (err) {
    console.error('[golf-pool] submit picks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /leagues/:id/picks/all (commissioner) ─────────────────────────────────

router.get('/leagues/:id/picks/all', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });

    const tid = req.query.tournament_id || league.pool_tournament_id;
    const members = await db.all(`
      SELECT glm.*, u.username, u.email FROM golf_league_members glm
      JOIN users u ON glm.user_id = u.id
      WHERE glm.golf_league_id = ? ORDER BY glm.joined_at ASC
    `, req.params.id);

    const picks = tid
      ? await db.all('SELECT * FROM pool_picks WHERE league_id = ? AND tournament_id = ? ORDER BY user_id, tier_number', req.params.id, tid)
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

router.get('/leagues/:id/my-roster', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const member = await db.get('SELECT * FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?', req.params.id, req.user.id);
    if (!member && league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Not a member' });

    const tid = req.query.tournament_id || league.pool_tournament_id;
    if (!tid) return res.json({ picks: [], submitted: false, picks_locked: !!league.picks_locked });

    // Determine which entry to show (defaults to entry 1; pass ?entry_number=N to view another)
    const viewEntryNumber = parseInt(req.query.entry_number) || 1;

    // All entries submitted by this user (for multi-entry "Add Another" button)
    const submittedEntriesRows = await db.all(
      'SELECT DISTINCT COALESCE(entry_number, 1) as entry_number FROM pool_picks WHERE league_id = ? AND tournament_id = ? AND user_id = ?',
      req.params.id, tid, req.user.id
    );
    const submittedEntries = submittedEntriesRows.map(r => r.entry_number);

    // picks JOIN pool_tier_players (odds, world_ranking) JOIN golf_players (country) LEFT JOIN golf_scores
    const picks = await db.all(`
      SELECT
        pp.id, pp.tier_number, pp.player_id, pp.player_name, pp.salary_used,
        pp.is_dropped, pp.tiebreaker_score,
        ptp.odds_display, ptp.world_ranking,
        COALESCE(pp.country, gp.country) AS country,
        COALESCE(pp.is_withdrawn, ptp.is_withdrawn, 0) AS is_withdrawn,
        gs.round1, gs.round2, gs.round3, gs.round4,
        gs.made_cut, gs.finish_position, gs.fantasy_points
      FROM pool_picks pp
      LEFT JOIN pool_tier_players ptp ON ptp.league_id = pp.league_id
        AND ptp.tournament_id = pp.tournament_id
        AND ptp.player_id = pp.player_id
      LEFT JOIN golf_players gp ON gp.id = pp.player_id
      LEFT JOIN golf_scores gs ON gs.player_id = pp.player_id AND gs.tournament_id = pp.tournament_id
      WHERE pp.league_id = ? AND pp.tournament_id = ? AND pp.user_id = ?
        AND COALESCE(pp.entry_number, 1) = ?
      ORDER BY pp.tier_number ASC, COALESCE(gs.fantasy_points, 0) DESC
    `, req.params.id, tid, req.user.id, viewEntryNumber);

    if (picks.length) console.log('[my-roster] pick[0] country:', picks[0].country, '| player:', picks[0].player_name);

    const tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', tid);

    // Pre-tournament guard: zero out stale score data so MC/WD badges don't show
    if (tourn && tourn.status === 'scheduled') {
      for (const p of picks) {
        p.round1 = null; p.round2 = null; p.round3 = null; p.round4 = null;
        p.made_cut = null; p.finish_position = null; p.fantasy_points = null;
      }
    }
    const lockTime = tourn ? computeLockTime(tourn.start_date).toISOString() : null;
    const isLocked = lockTime ? new Date() >= new Date(lockTime) : false;

    // Build tiers with available players so the UI can render the pick sheet
    let tiersConfig = [];
    try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}

    const tierPlayers = await db.all(`
      SELECT ptp.id, ptp.league_id, ptp.tournament_id, ptp.player_id, ptp.player_name,
        ptp.tier_number, ptp.odds_display, ptp.odds_decimal, ptp.world_ranking,
        ptp.salary, ptp.manually_overridden, ptp.created_at,
        COALESCE(ptp.country, gp.country) AS country,
        COALESCE(ptp.is_withdrawn, 0) AS is_withdrawn
      FROM pool_tier_players ptp
      LEFT JOIN golf_players gp ON gp.id = ptp.player_id
      WHERE ptp.league_id = ? AND ptp.tournament_id = ? AND (ptp.is_withdrawn IS NULL OR ptp.is_withdrawn = 0)
      GROUP BY ptp.player_id
      ORDER BY ptp.tier_number ASC, ptp.odds_decimal ASC, ptp.world_ranking ASC
    `, league.id, tid);

    const tiers = tiersConfig.map(t => ({
      tier:     t.tier,
      tier_number: t.tier,
      odds_min: t.odds_min,
      odds_max: t.odds_max,
      picks:    t.picks,
      players:  tierPlayers.filter(p => p.tier_number === t.tier),
    }));

    const dropCount = league.pool_drop_count ?? 2;
    // All three names mean the same stroke-based logic — keep in sync with golf.js
    const isStrokeBased = ['stroke_play', 'total_score', 'total_strokes'].includes(league.scoring_style);
    // Use persisted drops when commissioner has applied them; otherwise all count (except MC).
    const dropsApplied = !!league.pool_drops_applied;

    let enrichedPicks = picks;
    let teamScore = null;
    let countingCount = null;
    let droppedCount = null;

    if (isStrokeBased && picks.length > 0) {
      let lockedDroppedIds = null;
      if (dropsApplied) {
        lockedDroppedIds = new Set(picks.filter(p => p.is_dropped).map(p => p.player_id));
      }
      // Always pass dropCount — locked mode (lockedDroppedIds set) ignores it; auto mode uses it for live worst-N.
      const dropResult = applyDropScoring(picks, dropCount, { lockedDroppedIds });
      enrichedPicks  = dropResult.picks;
      teamScore      = dropResult.team_score;
      countingCount  = dropResult.counting_count;
      droppedCount   = dropResult.dropped_count;
    }

    const tiebreakerScore = picks.length > 0 ? (picks[0].tiebreaker_score ?? null) : null;

    res.json({
      picks: enrichedPicks,
      submitted: picks.length > 0,
      submitted_entries: submittedEntries,
      picks_locked: isLocked,
      lock_time: lockTime,
      tournament: tourn,
      tiers,
      drop_count:      dropCount,
      drops_applied:   dropsApplied,
      picks_per_team:  league.picks_per_team || 8,
      team_score:      teamScore,
      counting_count:  countingCount,
      dropped_count:   droppedCount,
      tiebreaker_score: tiebreakerScore,
      pool_max_entries: league.pool_max_entries || 1,
      // Team name for inline editing
      entry_team_name: picks.length > 0 ? (picks[0].entry_team_name || null) : null,
      team_name: member?.team_name || null,
    });
  } catch (err) {
    console.error('[golf-pool] my-roster error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /tournaments/:id/suggested-tiers?count=6 ─────────────────────────────
// Returns auto-balanced tier boundaries based on the tournament's actual field.
// Divides players evenly by odds (favorites → longshots) across `count` tiers.

router.get('/tournaments/:id/suggested-tiers', authMiddleware, async (req, res) => {
  try {
    const tierCount = Math.max(1, Math.min(10, parseInt(req.query.count) || 6));
    const tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', req.params.id);
    if (!tourn) return res.status(404).json({ error: 'Tournament not found' });

    const fieldCountRow = await db.get('SELECT COUNT(*) as cnt FROM golf_tournament_fields WHERE tournament_id = ?', req.params.id);
    const fieldCount = fieldCountRow.cnt;

    const rawPlayers = fieldCount > 0
      ? await db.all(`
          SELECT gp.*, tf.odds_display AS tf_odds_display, tf.odds_decimal AS tf_odds_decimal
          FROM golf_players gp
          INNER JOIN golf_tournament_fields tf ON tf.player_id = gp.id AND tf.tournament_id = ?
        `, req.params.id)
      : await db.all('SELECT * FROM golf_players WHERE is_active = 1');

    const players = rawPlayers.map(p => {
      const od = p.tf_odds_display || p.odds_display;
      const dec = p.tf_odds_decimal || p.odds_decimal;
      const gen = (!od || !dec) ? rankToOdds(p.world_ranking) : null;
      return {
        id: p.id,
        name: p.name,
        odds_display: od || gen.odds_display,
        odds_decimal: dec || gen.odds_decimal,
      };
    }).sort((a, b) => (a.odds_decimal || 999) - (b.odds_decimal || 999));

    if (!players.length) return res.status(404).json({ error: 'No players found' });

    const total = players.length;
    // Golf-pool tier structure: T1=elite favorites (tight group of ~10), T2=next ~22, T3=next ~38, T4=rest
    // Scaled proportionally from a 132-player baseline.
    const tierSizes = golfPoolTierSizes(total, tierCount);
    const tiers = [];
    let offset = 0;

    for (let i = 0; i < tierCount; i++) {
      const size  = tierSizes[i];
      const group = players.slice(offset, offset + size);
      offset += size;
      tiers.push({
        tier:          i + 1,
        odds_min:      group[0]?.odds_display || '',
        odds_max:      i < tierCount - 1 ? (group[group.length - 1]?.odds_display || '') : '',
        picks:         1,
        approxPlayers: group.length,
        sample:        group.slice(0, 3).map(p => p.name),
      });
    }

    res.json({ tiers, field_size: total, source: fieldCount > 0 ? 'tournament_field' : 'world_rankings' });
  } catch (err) {
    console.error('[golf-pool] suggested-tiers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /tournaments/:id/field-players ───────────────────────────────────────
// Returns all players in the tournament field (or active players as fallback),
// sorted by odds ascending (favorites first). Used by the CreateLeague tier
// config editor for live player count and sample name previews.

router.get('/tournaments/:id/field-players', authMiddleware, async (req, res) => {
  try {
    // Resolve tournament ID — accept UUID or slug-style name (e.g. 'masters-2026')
    let tid = req.params.id;
    if (!(await db.get('SELECT 1 FROM golf_tournaments WHERE id = ?', tid))) {
      // Try matching by name: 'masters-2026' → search for 'Masters' in 2026
      const parts = tid.match(/^(.+?)-?(\d{4})$/);
      if (parts) {
        const nameish = parts[1].replace(/-/g, ' ');
        const year = parseInt(parts[2]);
        const match = await db.get(
          "SELECT id FROM golf_tournaments WHERE LOWER(name) LIKE ? AND season_year = ?",
          `%${nameish}%`, year
        );
        if (match) tid = match.id;
      }
    }

    const fieldCountRow = await db.get('SELECT COUNT(*) as cnt FROM golf_tournament_fields WHERE tournament_id = ?', tid);
    const fieldCount = fieldCountRow.cnt;
    const rawPlayers = fieldCount > 0
      ? await db.all(`
          SELECT gp.id, gp.name, gp.world_ranking,
                 COALESCE(tf.odds_display, gp.odds_display) as odds_display,
                 COALESCE(tf.odds_decimal, gp.odds_decimal) as odds_decimal
          FROM golf_players gp
          INNER JOIN golf_tournament_fields tf ON tf.player_id = gp.id AND tf.tournament_id = ?
        `, tid)
      : await db.all('SELECT id, name, world_ranking, odds_display, odds_decimal FROM golf_players WHERE is_active = 1');

    const players = rawPlayers.map(p => {
      const gen = (!p.odds_display || !p.odds_decimal) ? rankToOdds(p.world_ranking) : null;
      return {
        id: p.id,
        name: p.name,
        odds_display: p.odds_display || gen?.odds_display || '',
        odds_decimal: typeof p.odds_decimal === 'number' ? p.odds_decimal : (gen?.odds_decimal || 999),
      };
    }).sort((a, b) => (a.odds_decimal || 999) - (b.odds_decimal || 999));

    res.json({ players, field_size: players.length });
  } catch (err) {
    console.error('[golf-pool] field-players error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /leagues/:id/tiers/auto-balance ─────────────────────────────────────
// Rebalances pool_tier_players into equal-sized tier groups sorted by odds.
// Body: { preview: true } returns a dry-run without writing changes.

router.post('/leagues/:id/tiers/auto-balance', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    if (league.format_type !== 'pool') return res.status(400).json({ error: 'Pool leagues only' });
    if (!league.pool_tournament_id) return res.status(400).json({ error: 'No tournament linked' });

    let tiersConfig = [];
    try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}
    const tierCount = tiersConfig.length || 4;

    const rawPlayers = await db.all(`
      SELECT ptp.*, gp.odds_display AS gp_odds_display, gp.odds_decimal AS gp_odds_decimal,
             tf.odds_display AS tf_odds_display, tf.odds_decimal AS tf_odds_decimal
      FROM pool_tier_players ptp
      LEFT JOIN golf_players gp ON gp.id = ptp.player_id
      LEFT JOIN golf_tournament_fields tf ON tf.player_id = ptp.player_id AND tf.tournament_id = ptp.tournament_id
      WHERE ptp.league_id = ? AND ptp.tournament_id = ?
    `, league.id, league.pool_tournament_id);

    if (!rawPlayers.length) return res.status(400).json({ error: 'No players assigned to this league yet' });

    const players = rawPlayers.map(p => {
      const od  = p.tf_odds_display  || p.gp_odds_display  || p.odds_display;
      const dec = p.tf_odds_decimal  || p.gp_odds_decimal  || p.odds_decimal;
      const gen = (!od || !dec) ? rankToOdds(p.world_ranking || 200) : null;
      return {
        ...p,
        _od:  od  || gen.odds_display,
        _dec: dec || gen.odds_decimal,
      };
    }).sort((a, b) => (a._dec || 999) - (b._dec || 999));

    const total    = players.length;
    const tierSizes = golfPoolTierSizes(total, tierCount);
    const newTiers = [];
    let offset = 0;

    for (let i = 0; i < tierCount; i++) {
      const size  = tierSizes[i];
      const group = players.slice(offset, offset + size);
      offset += size;
      const oldTier = tiersConfig.find(t => t.tier === i + 1) || {};
      newTiers.push({
        tier:          i + 1,
        odds_min:      group[0]?._od || '',
        odds_max:      i < tierCount - 1 ? (group[group.length - 1]?._od || '') : '',
        picks:         oldTier.picks || 1,
        approxPlayers: group.length,
        players:       group,
      });
    }

    if (req.body.preview) {
      return res.json({
        preview: true,
        field_size: total,
        tiers: newTiers.map(t => ({
          tier:    t.tier,
          odds_min: t.odds_min,
          odds_max: t.odds_max,
          picks:   t.picks,
          count:   t.approxPlayers,
          sample:  t.players.slice(0, 3).map(p => p.player_name),
        })),
      });
    }

    // Persist: update league's pool_tiers config + re-tier all players
    const newTiersConfig = newTiers.map(({ tier, odds_min, odds_max, picks, approxPlayers }) =>
      ({ tier, odds_min, odds_max, picks, approxPlayers }));

    await db.run('UPDATE golf_leagues SET pool_tiers = ? WHERE id = ?',
      JSON.stringify(newTiersConfig), league.id);

    const updTPSql = 'UPDATE pool_tier_players SET tier_number = ?, odds_display = ?, odds_decimal = ? WHERE league_id = ? AND tournament_id = ? AND player_id = ?';
    await db.transaction(async (tx) => {
      for (const tier of newTiers) {
        for (const p of tier.players) {
          await tx.run(updTPSql, tier.tier, p._od, p._dec, league.id, league.pool_tournament_id, p.player_id);
        }
      }
    });

    res.json({
      ok: true,
      field_size: total,
      tiers: newTiersConfig.map(t => ({ ...t, count: t.approxPlayers })),
    });
  } catch (err) {
    console.error('[golf-pool] auto-balance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /leagues/:id/picks/remind ───────────────────────────────────────────

router.post('/leagues/:id/picks/remind', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });

    const tid = league.pool_tournament_id;
    const unpicked = await db.all(`
      SELECT u.username, u.email FROM golf_league_members glm
      JOIN users u ON glm.user_id = u.id
      WHERE glm.golf_league_id = ?
        AND glm.user_id NOT IN (SELECT user_id FROM pool_picks WHERE league_id = ? AND tournament_id = ?)
    `, req.params.id, req.params.id, tid || '');

    // Email sending is a stub — log for now, wire email service when ready
    console.log(`[golf-pool] Reminder for ${league.name}: ${unpicked.length} unpicked members`, unpicked.map(u => u.email));

    res.json({ ok: true, reminded: unpicked.length });
  } catch (err) {
    console.error('[golf-pool] remind error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /leagues/:id/commissioner/add-picks ──────────────────────────────────
// Allows the commissioner to insert picks on behalf of specified users.
// Body: { picks: [{ username, player_name, tier_number }] }
// Returns a summary of what was inserted vs skipped.

router.post('/leagues/:id/commissioner/add-picks', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    if (league.format_type !== 'pool') return res.status(400).json({ error: 'Pool leagues only' });

    const tid = league.pool_tournament_id;
    if (!tid) return res.status(400).json({ error: 'No tournament linked' });

    const { picks: picksToAdd = [] } = req.body;
    if (!Array.isArray(picksToAdd) || picksToAdd.length === 0) {
      return res.status(400).json({ error: 'picks array required' });
    }

    const results = [];

    for (const { username, player_name, tier_number } of picksToAdd) {
      if (!username || !player_name) {
        results.push({ username, player_name, status: 'skipped', reason: 'missing username or player_name' });
        continue;
      }

      // Find user
      const user = (await db.get('SELECT * FROM users WHERE username = ?', username)) ||
                   (await db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', username));
      if (!user) {
        results.push({ username, player_name, status: 'skipped', reason: 'user not found' });
        continue;
      }

      // Cap check — must come before insert to prevent any double-insertion
      const picksMax = league.picks_per_team || 8;
      const pickCountRow = await db.get(
        'SELECT COUNT(*) AS cnt FROM pool_picks WHERE league_id = ? AND tournament_id = ? AND user_id = ?',
        req.params.id, tid, user.id
      );
      if (pickCountRow.cnt >= picksMax) {
        results.push({ username, player_name, status: 'skipped', reason: 'team already at max picks' });
        continue;
      }

      // Find player in pool_tier_players
      const normN = n => (n || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
      const target = normN(player_name);
      const allPTP = await db.all(
        'SELECT ptp.*, gp.name AS gp_name FROM pool_tier_players ptp LEFT JOIN golf_players gp ON gp.id = ptp.player_id WHERE ptp.league_id = ? AND ptp.tournament_id = ?',
        req.params.id, tid
      );
      const poolPlayer = allPTP.find(p =>
        normN(p.player_name).includes(target) || normN(p.gp_name || '').includes(target)
      );
      if (!poolPlayer) {
        results.push({ username, player_name, status: 'skipped', reason: 'player not in pool tier list' });
        continue;
      }

      const actualTier = tier_number || poolPlayer.tier_number;

      // Check if already picked
      const existing = await db.get(
        'SELECT 1 FROM pool_picks WHERE league_id = ? AND tournament_id = ? AND user_id = ? AND player_id = ?',
        req.params.id, tid, user.id, poolPlayer.player_id
      );
      if (existing) {
        results.push({ username, player_name: poolPlayer.player_name, status: 'skipped', reason: 'already has this pick' });
        continue;
      }

      await db.run(`
        INSERT OR IGNORE INTO pool_picks (id, league_id, tournament_id, user_id, player_id, player_name, tier_number, salary_used)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `, uuidv4(), req.params.id, tid, user.id, poolPlayer.player_id, poolPlayer.player_name || poolPlayer.gp_name, actualTier);

      results.push({ username, player_name: poolPlayer.player_name, tier: actualTier, status: 'inserted' });
    }

    const inserted = results.filter(r => r.status === 'inserted').length;
    console.log(`[golf-pool] commissioner add-picks: ${inserted} inserted, ${results.length - inserted} skipped`);

    res.json({ ok: true, inserted, results });
  } catch (err) {
    console.error('[golf-pool] commissioner add-picks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /leagues/:id/commissioner/remove-picks ───────────────────────────────
// Allows the commissioner to delete picks on behalf of specified users.
// Body: { picks: [{ username, player_name }] }
// Idempotent — silently skips if pick doesn't exist.
// Returns { ok: true, deleted: N, results: [...] }

router.post('/leagues/:id/commissioner/remove-picks', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    if (league.format_type !== 'pool') return res.status(400).json({ error: 'Pool leagues only' });

    const tid = league.pool_tournament_id;
    if (!tid) return res.status(400).json({ error: 'No tournament linked' });

    const { picks: picksToRemove = [] } = req.body;
    if (!Array.isArray(picksToRemove) || picksToRemove.length === 0) {
      return res.status(400).json({ error: 'picks array required' });
    }

    const results = [];

    for (const { username, player_name } of picksToRemove) {
      if (!username || !player_name) {
        results.push({ username, player_name, status: 'skipped', reason: 'missing username or player_name' });
        continue;
      }

      const user = (await db.get('SELECT * FROM users WHERE username = ?', username)) ||
                   (await db.get('SELECT * FROM users WHERE LOWER(username) = LOWER(?)', username));
      if (!user) {
        results.push({ username, player_name, status: 'skipped', reason: 'user not found' });
        continue;
      }

      const normN = n => (n || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
      const target = normN(player_name);

      // Find the pick by normalized player_name match
      const allUserPicks = await db.all(
        'SELECT * FROM pool_picks WHERE league_id = ? AND tournament_id = ? AND user_id = ?',
        req.params.id, tid, user.id
      );
      const existing = allUserPicks.find(p => normN(p.player_name) === target);

      if (!existing) {
        results.push({ username, player_name, status: 'skipped', reason: 'pick not found' });
        continue;
      }

      await db.run(
        'DELETE FROM pool_picks WHERE id = ?',
        existing.id
      );

      results.push({ username, player_name: existing.player_name, tier: existing.tier_number, status: 'deleted' });
    }

    const deleted = results.filter(r => r.status === 'deleted').length;
    console.log(`[golf-pool] commissioner remove-picks: ${deleted} deleted, ${results.length - deleted} skipped`);

    res.json({ ok: true, deleted, results });
  } catch (err) {
    console.error('[golf-pool] commissioner remove-picks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /leagues/:id/apply-drops ────────────────────────────────────────────
// Commissioner button: lock worst-N drops after Round 2.
// For each team, sorts R1+R2 totals descending (worst first, R1 as tiebreaker),
// marks bottom pool_drop_count picks as is_dropped=1 in pool_picks.
// Sets pool_drops_applied=1 on the league so standings use persisted drops.
// Idempotent: re-running resets all drops then reapplies (reflects updated R2 scores).
router.post('/leagues/:id/apply-drops', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    if (league.format_type !== 'pool') return res.status(400).json({ error: 'Pool leagues only' });

    const isStrokeBased = ['stroke_play', 'total_score', 'total_strokes'].includes(league.scoring_style);
    if (!isStrokeBased) return res.status(400).json({ error: 'Drops only apply to stroke-based scoring' });

    const tid = league.pool_tournament_id;
    if (!tid) return res.status(400).json({ error: 'No active tournament linked to this league' });

    const dropCount = league.pool_drop_count ?? 2;
    if (dropCount <= 0) return res.status(400).json({ error: 'pool_drop_count is 0 — no drops configured for this league' });

    const members = await db.all(`
      SELECT glm.user_id, u.username
      FROM golf_league_members glm JOIN users u ON glm.user_id = u.id
      WHERE glm.golf_league_id = ?
    `, req.params.id);

    const picksByMemberSql = `
      SELECT pp.id, pp.player_id, pp.player_name, pp.tier_number,
             gs.round1, gs.round2, gs.made_cut
      FROM pool_picks pp
      LEFT JOIN golf_scores gs ON gs.player_id = pp.player_id AND gs.tournament_id = ?
      WHERE pp.league_id = ? AND pp.tournament_id = ? AND pp.user_id = ?
        AND (pp.is_withdrawn IS NULL OR pp.is_withdrawn = 0)
    `;

    const resetDropsSql = 'UPDATE pool_picks SET is_dropped = 0, dropped_at = NULL WHERE league_id = ? AND tournament_id = ? AND user_id = ?';
    const setDroppedSql = 'UPDATE pool_picks SET is_dropped = 1, dropped_at = CURRENT_TIMESTAMP WHERE id = ?';

    const results = [];
    let totalDropped = 0;

    await db.transaction(async (tx) => {
      for (const member of members) {
        const picks = await tx.all(picksByMemberSql, tid, req.params.id, tid, member.user_id);
        if (picks.length === 0) continue;

        // Reset all this member's drops first (idempotent re-run support)
        await tx.run(resetDropsSql, req.params.id, tid, member.user_id);

        const droppedIds = computeDropIds(picks, dropCount);

        const droppedPlayers = [];
        for (const pick of picks) {
          if (droppedIds.has(pick.player_id)) {
            await tx.run(setDroppedSql, pick.id);
            droppedPlayers.push({ player_name: pick.player_name, tier_number: pick.tier_number });
            totalDropped++;
          }
        }

        if (droppedPlayers.length > 0) {
          results.push({ username: member.username, dropped: droppedPlayers });
        }
      }

      await tx.run('UPDATE golf_leagues SET pool_drops_applied = 1 WHERE id = ?', req.params.id);
    });

    console.log(`[golf-pool] apply-drops: ${totalDropped} picks dropped across ${results.length} teams in league ${req.params.id}`);
    res.json({
      ok: true,
      teams_processed: members.length,
      picks_dropped: totalDropped,
      results,
    });
  } catch (err) {
    console.error('[golf-pool] apply-drops error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /leagues/:id/members/:userId/paid ────────────────────────────────────
// Commissioner toggles paid status for a member (or specific entry when entry_number > 1).
router.post('/leagues/:id/members/:userId/paid', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    const { is_paid, entry_number = 1 } = req.body;
    if (is_paid === undefined) return res.status(400).json({ error: 'is_paid required' });
    const entryNum = parseInt(entry_number) || 1;
    if (entryNum <= 1) {
      // Entry 1: update golf_league_members (backward-compatible)
      const result = await db.run(
        'UPDATE golf_league_members SET is_paid = ? WHERE golf_league_id = ? AND user_id = ?',
        is_paid ? 1 : 0, req.params.id, req.params.userId
      );
      if (result.changes === 0) return res.status(404).json({ error: 'Member not found' });
    } else {
      // Entry 2+: upsert into pool_entry_paid
      const tid = league.pool_tournament_id;
      await db.run(`
        INSERT INTO pool_entry_paid (id, league_id, tournament_id, user_id, entry_number, is_paid)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(league_id, tournament_id, user_id, entry_number)
        DO UPDATE SET is_paid = excluded.is_paid
      `, uuidv4(), req.params.id, tid || '', req.params.userId, entryNum, is_paid ? 1 : 0);
    }
    res.json({ ok: true, is_paid: is_paid ? 1 : 0, entry_number: entryNum });
  } catch (err) {
    console.error('[golf-pool] set-paid error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /admin/set-drop-count ────────────────────────────────────────────────
// Commissioner sets pool_drop_count for their league (fixes mis-configured leagues).
// Body: { league_id, drop_count }
router.post('/admin/set-drop-count', authMiddleware, async (req, res) => {
  try {
    const { league_id, drop_count } = req.body;
    if (!league_id) return res.status(400).json({ error: 'league_id required' });
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', league_id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    const count = parseInt(drop_count);
    if (isNaN(count) || count < 0) return res.status(400).json({ error: 'Invalid drop_count' });
    await db.run('UPDATE golf_leagues SET pool_drop_count = ? WHERE id = ?', count, league_id);
    console.log(`[golf-pool] admin set-drop-count: league ${league_id} → ${count}`);
    res.json({ ok: true, pool_drop_count: count });
  } catch (err) {
    console.error('[golf-pool] admin set-drop-count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /leagues/:id/remind-unpaid ───────────────────────────────────────────
// Commissioner sends targeted payment reminders to unpaid members only.
router.post('/leagues/:id/remind-unpaid', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });

    const tid = league.pool_tournament_id;
    if (!tid) return res.status(400).json({ error: 'No tournament linked' });

    const commissioner = await db.get('SELECT username, full_name FROM users WHERE id = ?', req.user.id);
    const commName = commissioner?.full_name || commissioner?.username || 'Your commissioner';

    // Get all entries with picks submitted
    const allEntries = await db.all(`
      SELECT DISTINCT pp.user_id, COALESCE(pp.entry_number, 1) as entry_number,
             u.email, u.username
      FROM pool_picks pp
      JOIN users u ON u.id = pp.user_id
      WHERE pp.league_id = ? AND pp.tournament_id = ?
    `, req.params.id, tid);

    // Get paid entries
    const paidEntries = new Set();
    const paidFromTable = await db.all('SELECT user_id, entry_number FROM pool_entry_paid WHERE league_id = ? AND tournament_id = ? AND is_paid = 1',
      req.params.id, tid);
    paidFromTable.forEach(r => paidEntries.add(`${r.user_id}_${r.entry_number}`));
    // Legacy: entry 1 from golf_league_members
    const paidFromLegacy = await db.all('SELECT user_id FROM golf_league_members WHERE golf_league_id = ? AND is_paid = 1',
      req.params.id);
    paidFromLegacy.forEach(r => paidEntries.add(`${r.user_id}_1`));

    const unpaid = allEntries.filter(e => !paidEntries.has(`${e.user_id}_${e.entry_number}`));
    if (unpaid.length === 0) return res.json({ ok: true, sent: 0, message: 'All entries are paid' });

    // Deduplicate by user (send one email per user, not per entry)
    const uniqueUsers = new Map();
    for (const e of unpaid) {
      if (!uniqueUsers.has(e.user_id)) uniqueUsers.set(e.user_id, e);
    }

    const { sendPayReminder } = require('../mailer');
    const tournRow = await db.get('SELECT start_date FROM golf_tournaments WHERE id = ?', tid);
    const lockTime = league.picks_lock_time || (computeLockTime(tournRow?.start_date || '').toISOString());

    let sent = 0;
    for (const [, member] of uniqueUsers) {
      try {
        await sendPayReminder(member.email, {
          username: member.username,
          leagueName: league.name,
          buyIn: league.buy_in_amount || 0,
          commissionerName: commName,
          paymentMethods: league.payment_methods,
          lockTime,
        });
        sent++;
      } catch (err) {
        console.error(`[remind-unpaid] Failed for ${member.email}:`, err.message);
      }
    }

    res.json({ ok: true, sent, total_unpaid: unpaid.length });
  } catch (err) {
    console.error('[remind-unpaid]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /leagues/:id/unpaid-summary ──────────────────────────────────────────
// Returns unpaid count + paid prize pool for the commissioner banner.
router.get('/leagues/:id/unpaid-summary', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });

    const tid = league.pool_tournament_id;
    if (!tid) return res.json({ unpaid: 0, paid: 0, total: 0, prizePool: 0 });

    // Count all entries
    const totalEntriesRow = await db.get(
      'SELECT COUNT(DISTINCT user_id || \'_\' || COALESCE(entry_number, 1)) as cnt FROM pool_picks WHERE league_id = ? AND tournament_id = ?',
      req.params.id, tid
    );
    const totalEntries = totalEntriesRow.cnt;

    // Count paid entries
    const paidFromTableRow = await db.get(
      'SELECT COUNT(*) as cnt FROM pool_entry_paid WHERE league_id = ? AND tournament_id = ? AND is_paid = 1',
      req.params.id, tid
    );
    const paidFromTable = paidFromTableRow.cnt;
    const paidFromLegacyRow = await db.get(
      'SELECT COUNT(*) as cnt FROM golf_league_members WHERE golf_league_id = ? AND is_paid = 1',
      req.params.id
    );
    const paidFromLegacy = paidFromLegacyRow.cnt;
    // Avoid double-counting: entries in pool_entry_paid for entry 1 were migrated from legacy
    const paidEntry1InTableRow = await db.get(
      'SELECT COUNT(*) as cnt FROM pool_entry_paid WHERE league_id = ? AND tournament_id = ? AND entry_number = 1 AND is_paid = 1',
      req.params.id, tid
    );
    const paidEntry1InTable = paidEntry1InTableRow.cnt;
    const paidCount = paidFromTable + Math.max(0, paidFromLegacy - paidEntry1InTable);

    // If no paid tracking rows exist, assume all paid (legacy)
    const hasAnyPaidTrackingRow1 = await db.get('SELECT COUNT(*) as cnt FROM pool_entry_paid WHERE league_id = ?', req.params.id);
    const hasAnyPaidTrackingRow2 = await db.get('SELECT COUNT(*) as cnt FROM golf_league_members WHERE golf_league_id = ? AND is_paid = 1', req.params.id);
    const hasAnyPaidTracking = (hasAnyPaidTrackingRow1.cnt > 0) || (hasAnyPaidTrackingRow2.cnt > 0);
    const effectivePaid = hasAnyPaidTracking ? paidCount : totalEntries;

    const buyIn = league.buy_in_amount || 0;
    const adminFee = league.admin_fee_pct || 0;
    const grossPool = effectivePaid * buyIn;
    const prizePool = Math.round(grossPool * (1 - adminFee / 100) * 100) / 100;

    res.json({
      unpaid: totalEntries - effectivePaid,
      paid: effectivePaid,
      total: totalEntries,
      prizePool,
      expectedPool: Math.round(totalEntries * buyIn * (1 - adminFee / 100) * 100) / 100,
      buy_in: buyIn,
    });
  } catch (err) {
    console.error('[unpaid-summary]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PATCH /leagues/:id/team-name ───────────────────────────────────────────────
// User renames their entry's team name (pre-lock only).
router.patch('/leagues/:id/team-name', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const member = await db.get('SELECT * FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?', req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    // Check lock
    const tid = league.pool_tournament_id;
    const tourn = tid ? await db.get('SELECT * FROM golf_tournaments WHERE id = ?', tid) : null;
    if (tourn) {
      const lockTime = computeLockTime(tourn.start_date);
      if (new Date() >= lockTime) return res.status(403).json({ error: 'Picks are locked — team names cannot be changed.' });
    }

    const { entry_number = 1, team_name } = req.body;
    if (!team_name || !team_name.trim()) return res.status(400).json({ error: 'Team name cannot be empty' });

    const cleaned = team_name.trim().replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 20);
    if (!cleaned) return res.status(400).json({ error: 'Team name must contain letters or numbers' });

    const entryNum = parseInt(entry_number) || 1;

    if (entryNum === 1) {
      // Entry 1: update golf_league_members.team_name
      const r = await db.run('UPDATE golf_league_members SET team_name = ? WHERE golf_league_id = ? AND user_id = ?',
        cleaned, req.params.id, req.user.id);
      if (r.changes === 0) return res.status(404).json({ error: 'Member not found', rows_affected: 0 });
      // Also update pool_picks.entry_team_name for entry 1 consistency
      await db.run('UPDATE pool_picks SET entry_team_name = ? WHERE league_id = ? AND user_id = ? AND COALESCE(entry_number, 1) = 1',
        cleaned, req.params.id, req.user.id);
    } else {
      // Entry 2+: update pool_picks.entry_team_name
      const r = await db.run('UPDATE pool_picks SET entry_team_name = ? WHERE league_id = ? AND user_id = ? AND COALESCE(entry_number, 1) = ?',
        cleaned, req.params.id, req.user.id, entryNum);
      if (r.changes === 0) return res.status(404).json({ error: 'Entry not found', rows_affected: 0 });
    }

    res.json({ ok: true, team_name: cleaned, entry_number: entryNum });
  } catch (err) {
    console.error('[team-name]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Audit table for commissioner actions ──────────────────────────────────────
(async () => {
  try {
    await db.exec(`CREATE TABLE IF NOT EXISTS commissioner_actions (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      commissioner_id TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  } catch (_) {}
})();

async function logAction(leagueId, commId, action, details) {
  await db.run('INSERT INTO commissioner_actions (id, league_id, commissioner_id, action, details) VALUES (?, ?, ?, ?, ?)',
    uuidv4(), leagueId, commId, action, typeof details === 'string' ? details : JSON.stringify(details));
}

// ── PATCH /leagues/:id/admin/swap-pick ────────────────────────────────────────
// Commissioner replaces one player with another in a member's entry.
router.patch('/leagues/:id/admin/swap-pick', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });

    const { user_id, entry_number = 1, old_player_id, new_player_id } = req.body;
    if (!user_id || !old_player_id || !new_player_id) {
      return res.status(400).json({ error: 'user_id, old_player_id, and new_player_id required' });
    }
    const tid = league.pool_tournament_id;
    if (!tid) return res.status(400).json({ error: 'No tournament linked' });
    const entryNum = parseInt(entry_number) || 1;

    // 1. Verify old pick exists
    const oldPick = await db.get(
      'SELECT * FROM pool_picks WHERE league_id = ? AND tournament_id = ? AND user_id = ? AND COALESCE(entry_number, 1) = ? AND player_id = ?',
      req.params.id, tid, user_id, entryNum, old_player_id
    );
    if (!oldPick) return res.status(404).json({ error: 'Original pick not found for this user/entry' });

    // 2. Verify new player is in same tier
    const newTierPlayer = await db.get(
      'SELECT * FROM pool_tier_players WHERE league_id = ? AND player_id = ?',
      req.params.id, new_player_id
    );
    if (!newTierPlayer) return res.status(404).json({ error: 'Replacement player not in tier list' });
    if (newTierPlayer.tier_number !== oldPick.tier_number) {
      return res.status(400).json({ error: `Replacement must be in same tier (T${oldPick.tier_number}). ${newTierPlayer.player_name} is in T${newTierPlayer.tier_number}.` });
    }

    // 3. Verify new player not already picked by this entry
    const dupe = await db.get(
      'SELECT 1 FROM pool_picks WHERE league_id = ? AND tournament_id = ? AND user_id = ? AND COALESCE(entry_number, 1) = ? AND player_id = ?',
      req.params.id, tid, user_id, entryNum, new_player_id
    );
    if (dupe) return res.status(409).json({ error: `${newTierPlayer.player_name} is already picked in this entry` });

    // 4. Perform the swap
    const result = await db.run(
      'UPDATE pool_picks SET player_id = ?, player_name = ? WHERE id = ?',
      new_player_id, newTierPlayer.player_name, oldPick.id
    );

    if (result.changes === 0) return res.status(500).json({ error: 'Swap failed — no rows updated' });

    // 5. Audit log
    await logAction(req.params.id, req.user.id, 'swap_pick', {
      user_id, entry_number: entryNum,
      old_player: { id: old_player_id, name: oldPick.player_name },
      new_player: { id: new_player_id, name: newTierPlayer.player_name },
      tier: oldPick.tier_number,
    });

    const user = await db.get('SELECT username FROM users WHERE id = ?', user_id);
    res.json({
      ok: true,
      rows_affected: result.changes,
      swap: { old: oldPick.player_name, new: newTierPlayer.player_name, tier: oldPick.tier_number },
      user: user?.username,
    });
  } catch (err) {
    console.error('[swap-pick]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /leagues/:id/admin/delete-entry ─────────────────────────────────────
// Commissioner deletes an entire entry (all picks for a user's entry_number).
router.delete('/leagues/:id/admin/delete-entry', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });

    const { user_id, entry_number = 1 } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    const tid = league.pool_tournament_id;
    if (!tid) return res.status(400).json({ error: 'No tournament linked' });
    const entryNum = parseInt(entry_number) || 1;

    // Get picks before deleting (for audit log)
    const picks = await db.all(
      'SELECT player_name, tier_number FROM pool_picks WHERE league_id = ? AND tournament_id = ? AND user_id = ? AND COALESCE(entry_number, 1) = ?',
      req.params.id, tid, user_id, entryNum
    );

    if (picks.length === 0) return res.status(404).json({ error: 'No picks found for this entry', rows_affected: 0 });

    // Delete the picks
    const result = await db.run(
      'DELETE FROM pool_picks WHERE league_id = ? AND tournament_id = ? AND user_id = ? AND COALESCE(entry_number, 1) = ?',
      req.params.id, tid, user_id, entryNum
    );

    // Also clean pool_entry_paid if exists
    try {
      await db.run(
        'DELETE FROM pool_entry_paid WHERE league_id = ? AND tournament_id = ? AND user_id = ? AND entry_number = ?',
        req.params.id, tid, user_id, entryNum
      );
    } catch (_) {}

    // Audit log
    const user = await db.get('SELECT username FROM users WHERE id = ?', user_id);
    await logAction(req.params.id, req.user.id, 'delete_entry', {
      user_id, username: user?.username, entry_number: entryNum,
      picks_deleted: picks.map(p => p.player_name),
    });

    res.json({ deleted: true, rows_affected: result.changes, username: user?.username, entry_number: entryNum });
  } catch (err) {
    console.error('[delete-entry]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /leagues/:id/admin/entry-picks ────────────────────────────────────────
// Returns all picks for a specific user/entry (for the roster editor modal).
router.get('/leagues/:id/admin/entry-picks', authMiddleware, async (req, res) => {
  try {
    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });

    const tid = league.pool_tournament_id;
    const userId = req.query.user_id;
    const entryNum = parseInt(req.query.entry_number) || 1;
    if (!userId || !tid) return res.json({ picks: [] });

    const picks = await db.all(`
      SELECT pp.player_id, pp.player_name, pp.tier_number,
             ptp.odds_display, ptp.odds_decimal, gp.country
      FROM pool_picks pp
      LEFT JOIN pool_tier_players ptp ON ptp.league_id = pp.league_id AND ptp.player_id = pp.player_id
      LEFT JOIN golf_players gp ON gp.id = pp.player_id
      WHERE pp.league_id = ? AND pp.tournament_id = ? AND pp.user_id = ? AND COALESCE(pp.entry_number, 1) = ?
      ORDER BY pp.tier_number ASC
    `, req.params.id, tid, userId, entryNum);

    // Available replacements per tier — only exclude players picked by THIS entry
    const pickedIds = new Set(picks.map(p => p.player_id));
    const tiers = {};
    for (const pick of picks) {
      if (!tiers[pick.tier_number]) {
        // Get ALL players in this tier (not filtered by any picks from other entries/users)
        const allInTier = await db.all(`
          SELECT ptp.player_id, ptp.player_name, ptp.odds_display, ptp.odds_decimal,
                 COALESCE(ptp.country, gp.country) AS country
          FROM pool_tier_players ptp
          LEFT JOIN golf_players gp ON gp.id = ptp.player_id
          WHERE ptp.league_id = ? AND ptp.tier_number = ?
            AND (ptp.is_withdrawn IS NULL OR ptp.is_withdrawn = 0)
          ORDER BY ptp.odds_decimal ASC
        `, req.params.id, pick.tier_number);
        // Only exclude players already picked by THIS specific entry
        tiers[pick.tier_number] = allInTier.filter(p => !pickedIds.has(p.player_id));
      }
    }

    res.json({ picks, available_by_tier: tiers, _debug: { picked_count: pickedIds.size, tiers_queried: Object.keys(tiers).map(t => ({ tier: t, total: tiers[t].length })) } });
  } catch (err) {
    console.error('[entry-picks]', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.assignSalaryCapSalaries = assignSalaryCapSalaries;
