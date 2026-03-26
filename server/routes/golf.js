const express = require('express');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');

// ── ESPN PGA Live cache ─────────────────────────────────────────────────────────
const _espnCache = new Map(); // eventId → { ts, data }
const ESPN_CACHE_TTL = 60_000; // 60 seconds

// Initialize golf tables + seed on first require
require('../golf-db');
const db = require('../db');
const { applyDropScoring } = require('../pool-utils');

const router = express.Router();

// ── Scoring engine ─────────────────────────────────────────────────────────────
// Converts a round score (integer vs par) to fantasy pts using per-hole rate approximation.
// Baseline: 18 pars × 0.5 = 9 pts. Each stroke under par ≈ birdie value (+2.5).
// Each stroke over par ≈ bogey penalty (-1).
function roundToFantasyPts(scoreVsPar) {
  if (scoreVsPar === null || scoreVsPar === undefined) return 0;
  const s = Math.max(-12, Math.min(12, Number(scoreVsPar)));
  if (s <= 0) return Math.round((9 + Math.abs(s) * 2.5) * 10) / 10;
  return Math.max(-5, Math.round((9 - s * 1.0) * 10) / 10);
}

function calcFantasyPoints(score, isMajor) {
  let pts = 0;
  [score.round1, score.round2, score.round3, score.round4].forEach(r => {
    if (r !== null && r !== undefined) pts += roundToFantasyPts(r);
  });
  // Finish bonuses
  const pos = score.finish_position;
  if (pos !== null && pos !== undefined) {
    if (pos === 1)       pts += 30;
    else if (pos === 2)  pts += 20;
    else if (pos <= 5)   pts += 12;
    else if (pos <= 10)  pts += 8;
    else if (pos <= 20)  pts += 4;
  }
  if (score.made_cut === 1)  pts += 2;
  if (score.made_cut === 0 && pos !== null && pos !== undefined) pts -= 5; // missed cut
  if (isMajor) pts = Math.round(pts * 1.5 * 10) / 10;
  return Math.round(pts * 10) / 10;
}

// Commissioner score entry formula:
// Each round: (score - par) * -1.5  (negative round = good)
// Finish bonuses: 1st +30, top5 +12, top10 +8, top25 +3, cut +2, missed -5
// Major: × 1.5
function calcCommissionerPts(score, par, isMajor) {
  let pts = 0;
  [score.r1, score.r2, score.r3, score.r4].forEach(r => {
    if (r !== null && r !== undefined && r !== '') pts += (Number(r) - par) * -1.5;
  });
  const pos = (score.finish_position !== null && score.finish_position !== undefined && score.finish_position !== '')
    ? parseInt(score.finish_position) : null;
  if (pos !== null) {
    if (pos === 1)      pts += 30;
    else if (pos <= 5)  pts += 12;
    else if (pos <= 10) pts += 8;
    else if (pos <= 25) pts += 3;
  }
  if (score.made_cut) pts += 2;
  else pts -= 5;
  if (isMajor) pts *= 1.5;
  return Math.round(pts * 10) / 10;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function getMember(leagueId, userId) {
  return db.prepare('SELECT * FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?').get(leagueId, userId);
}

function snakePicker(pick, numTeams, members) {
  const round = Math.ceil(pick / numTeams);
  const posInRound = (pick - 1) % numTeams;
  const idx = round % 2 === 0 ? numTeams - 1 - posInRound : posInRound;
  return members[idx] || null;
}

function lockTime(startDate) {
  // Lineup locks Thursday 12:00 UTC (7am ET) of tournament week
  const d = new Date(startDate);
  // Find the Thursday on or before start_date
  const dow = d.getDay(); // 0=Sun,4=Thu
  const daysBack = (dow + 3) % 7; // how many days back to Thursday
  d.setDate(d.getDate() - daysBack);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

function recalcMemberPoints(memberId) {
  const total = db.prepare(`
    SELECT COALESCE(SUM(gs.fantasy_points), 0) as pts
    FROM golf_weekly_lineups wl
    JOIN golf_scores gs ON wl.player_id = gs.player_id AND wl.tournament_id = gs.tournament_id
    WHERE wl.member_id = ? AND wl.is_started = 1
  `).get(memberId);
  db.prepare('UPDATE golf_league_members SET season_points = ? WHERE id = ?').run(total.pts, memberId);
}

// ── Players ────────────────────────────────────────────────────────────────────
router.get('/players', authMiddleware, (req, res) => {
  try {
    const players = db.prepare('SELECT * FROM golf_players WHERE is_active = 1 ORDER BY world_ranking ASC').all();
    res.json({ players });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/players/:id/gamelog', authMiddleware, (req, res) => {
  try {
    const recent = db.prepare(`
      SELECT gs.round1, gs.round2, gs.round3, gs.round4,
             gs.made_cut, gs.finish_position, gs.fantasy_points,
             gt.name as tournament_name, gt.is_major, gt.start_date
      FROM golf_scores gs
      JOIN golf_tournaments gt ON gs.tournament_id = gt.id
      WHERE gs.player_id = ?
      ORDER BY gt.start_date DESC LIMIT 5
    `).all(req.params.id);

    const all = db.prepare(`
      SELECT gs.fantasy_points, gs.made_cut, gs.finish_position
      FROM golf_scores gs WHERE gs.player_id = ?
    `).all(req.params.id);

    const eventsPlayed = all.length;
    const cutsMade = all.filter(s => s.made_cut === 1).length;
    const seasonAvg = eventsPlayed > 0
      ? Math.round((all.reduce((s, r) => s + r.fantasy_points, 0) / eventsPlayed) * 10) / 10
      : 0;
    const finishes = all.map(s => s.finish_position).filter(f => f !== null && f > 0);
    const best = finishes.length > 0 ? Math.min(...finishes) : null;
    const ordinal = n => n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;

    res.json({
      gamelog: recent.map(s => ({
        tournament_name: s.tournament_name,
        is_major: !!s.is_major,
        r1: s.round1, r2: s.round2, r3: s.round3, r4: s.round4,
        made_cut: s.made_cut === 1,
        finish_position: s.finish_position,
        fantasy_points: s.fantasy_points,
      })),
      season_avg: seasonAvg,
      events_played: eventsPlayed,
      cuts_made: cutsMade,
      best_finish: best ? ordinal(best) : null,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Tournaments ────────────────────────────────────────────────────────────────
router.get('/tournaments', authMiddleware, (req, res) => {
  try {
    const tournaments = db.prepare('SELECT * FROM golf_tournaments ORDER BY start_date ASC').all();
    res.json({ tournaments });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/tournaments/:id/scores', authMiddleware, (req, res) => {
  try {
    const t = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Tournament not found' });
    const scores = db.prepare(`
      SELECT gs.*, gp.name, gp.country, gp.world_ranking, gp.salary
      FROM golf_scores gs JOIN golf_players gp ON gs.player_id = gp.id
      WHERE gs.tournament_id = ?
      ORDER BY COALESCE(gs.finish_position, 999) ASC, gs.fantasy_points DESC
    `).all(req.params.id);
    res.json({ tournament: t, scores });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/tournaments/:id/scores', authMiddleware, (req, res) => {
  try {
    if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Admin only' });
    const t = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Tournament not found' });
    const { scores } = req.body;
    if (!Array.isArray(scores)) return res.status(400).json({ error: 'scores array required' });

    const upsert = db.prepare(`
      INSERT INTO golf_scores (id, tournament_id, player_id, round1, round2, round3, round4, made_cut, finish_position, fantasy_points, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tournament_id, player_id) DO UPDATE SET
        round1=excluded.round1, round2=excluded.round2, round3=excluded.round3, round4=excluded.round4,
        made_cut=excluded.made_cut, finish_position=excluded.finish_position,
        fantasy_points=excluded.fantasy_points, updated_at=CURRENT_TIMESTAMP
    `);

    db.transaction(() => {
      for (const s of scores) {
        const fp = calcFantasyPoints(s, !!t.is_major);
        upsert.run(uuidv4(), t.id, s.player_id, s.round1 ?? null, s.round2 ?? null, s.round3 ?? null, s.round4 ?? null, s.made_cut ?? 0, s.finish_position ?? null, fp);
      }
    })();

    // Recalc season points for all affected members
    const affected = db.prepare(`
      SELECT DISTINCT wl.member_id FROM golf_weekly_lineups wl
      WHERE wl.tournament_id = ? AND wl.is_started = 1
    `).all(t.id);
    for (const { member_id } of affected) recalcMemberPoints(member_id);

    res.json({ ok: true, updated: scores.length });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Leagues ────────────────────────────────────────────────────────────────────
router.get('/leagues', authMiddleware, (req, res) => {
  try {
    const leagues = db.prepare(`
      SELECT gl.*, glm.team_name, glm.season_points, glm.season_budget, glm.id as member_id,
             (SELECT COUNT(*) FROM golf_league_members WHERE golf_league_id = gl.id) as member_count,
             gt.name as pool_tournament_name,
             gt.start_date as pool_tournament_start,
             gt.end_date as pool_tournament_end,
             gt.status as pool_tournament_status
      FROM golf_leagues gl
      JOIN golf_league_members glm ON glm.golf_league_id = gl.id AND glm.user_id = ?
      LEFT JOIN golf_tournaments gt ON gt.id = gl.pool_tournament_id
      WHERE (gl.is_sandbox = 0 OR gl.is_sandbox IS NULL)
      ORDER BY gl.created_at DESC
    `).all(req.user.id);
    res.json({ leagues });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/leagues', authMiddleware, (req, res) => {
  try {
    const {
      name, team_name, max_teams = 8, buy_in_amount = 0, payment_instructions = '',
      payout_first = 70, payout_second = 20, payout_third = 10, pick_time_limit = 60,
      format_type = 'tourneyrun',
      // TourneyRun
      salary_cap = 2400, core_spots = 4, flex_spots = 4, faab_budget = 500, use_faab = 1,
      auction_budget = 1000, faab_weekly_budget = 100, draft_type = 'snake', bid_timer_seconds = 30,
      // Pool
      picks_per_team = 8,
      scoring_style = 'tourneyrun',
      pool_tier = 'standard',
      comm_pro_price = 19.99,
      pool_tournament_id = null,
      // Buy-in
      payment_methods = '[]',
      payout_places = '[]',
      // Pool pick sheet
      pick_sheet_format = 'tiered',
      pool_tiers = '[]',
      pool_salary_cap = 50000,
      pool_cap_unit = 50000,
      // DK
      weekly_salary_cap = 50000, starters_count = 6,
    } = req.body;

    if (!name || !team_name) return res.status(400).json({ error: 'League name and team name required' });
    const p1 = Math.max(0, parseInt(payout_first) || 0);
    const p2 = Math.max(0, parseInt(payout_second) || 0);
    const p3 = Math.max(0, parseInt(payout_third) || 0);
    if (p1 + p2 + p3 > 100) return res.status(400).json({ error: 'Payouts exceed 100%' });

    const fmt = ['pool', 'dk', 'tourneyrun'].includes(format_type) ? format_type : 'tourneyrun';

    // Derive roster_size and starters_per_week from format
    let roster_size, starters_per_week;
    if (fmt === 'pool') {
      roster_size = Math.min(16, Math.max(4, parseInt(picks_per_team) || 8));
      starters_per_week = roster_size;
    } else if (fmt === 'dk') {
      roster_size = Math.min(10, Math.max(4, parseInt(starters_count) || 6));
      starters_per_week = roster_size;
    } else {
      const cs = Math.max(1, parseInt(core_spots) || 4);
      const fs = Math.max(0, parseInt(flex_spots) || 4);
      roster_size = cs + fs;
      starters_per_week = Math.min(roster_size, parseInt(starters_count) || 6);
    }

    const id = uuidv4();
    const invite_code = Math.random().toString(36).substring(2, 10).toUpperCase();

    const dtFinal = ['snake', 'auction'].includes(draft_type) ? draft_type : 'snake';

    const validScoringStyles = ['tourneyrun', 'total_score', 'stroke_play'];
    const scoringStyleFinal = validScoringStyles.includes(scoring_style) ? scoring_style : 'tourneyrun';
    const validPoolTiers = ['standard', 'large_100', 'enterprise'];
    const poolTierFinal = validPoolTiers.includes(pool_tier) ? pool_tier : 'standard';
    const commProPriceFinal = parseFloat(comm_pro_price) || 19.99;

    const paymentMethodsFinal = typeof payment_methods === 'string' ? payment_methods : JSON.stringify(payment_methods);
    const payoutPlacesFinal   = typeof payout_places   === 'string' ? payout_places   : JSON.stringify(payout_places);
    const poolTiersJson       = typeof pool_tiers      === 'string' ? pool_tiers      : JSON.stringify(pool_tiers);
    const pickSheetFmt        = ['tiered', 'salary_cap'].includes(pick_sheet_format) ? pick_sheet_format : 'tiered';

    const poolTournamentIdFinal = pool_tournament_id || null;

    const poolDropCount = parseInt(req.body.pool_drop_count);
    const poolDropFinal = isNaN(poolDropCount) ? 2 : Math.max(0, poolDropCount);

    db.prepare(`
      INSERT INTO golf_leagues (
        id, name, commissioner_id, invite_code, status, max_teams,
        buy_in_amount, payment_instructions, payout_first, payout_second, payout_third,
        roster_size, starters_per_week, pick_time_limit, season_year,
        format_type, salary_cap, weekly_salary_cap, core_spots, flex_spots,
        faab_budget, use_faab, picks_per_team, scoring_style,
        pool_tier, comm_pro_price,
        payment_methods, payout_places,
        pick_sheet_format, pool_tiers, pool_salary_cap, pool_cap_unit,
        auction_budget, faab_weekly_budget, draft_type, bid_timer_seconds,
        pool_tournament_id, pool_drop_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2026, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name, req.user.id, invite_code, 'pending_payment', parseInt(max_teams) || 8,
      parseFloat(buy_in_amount) || 0, payment_instructions, p1, p2, p3,
      roster_size, starters_per_week, parseInt(pick_time_limit) || 60,
      fmt, parseInt(salary_cap) || 2400, parseInt(weekly_salary_cap) || 50000,
      parseInt(core_spots) || 4, parseInt(flex_spots) || 4,
      parseInt(faab_budget) || 500, use_faab ? 1 : 0,
      parseInt(picks_per_team) || 8, scoringStyleFinal,
      poolTierFinal, commProPriceFinal,
      paymentMethodsFinal, payoutPlacesFinal,
      pickSheetFmt, poolTiersJson, parseInt(pool_salary_cap) || 50000, parseInt(pool_cap_unit) || 50000,
      parseInt(auction_budget) || 1000, parseInt(faab_weekly_budget) || 100,
      dtFinal, parseInt(bid_timer_seconds) || 30,
      poolTournamentIdFinal, poolDropFinal
    );

    // Persist pool_tiers to normalized table when Pool format
    if (fmt === 'pool' && pickSheetFmt === 'tiered') {
      try {
        const tiersArr = typeof pool_tiers === 'string' ? JSON.parse(pool_tiers) : (pool_tiers || []);
        const insTier = db.prepare(`INSERT INTO pool_tiers (id, league_id, tier_number, odds_min, odds_max, picks_allowed) VALUES (?, ?, ?, ?, ?, ?)`);
        db.transaction(() => {
          for (const t of tiersArr) {
            insTier.run(uuidv4(), id, t.tier, t.odds_min || '', t.odds_max || '', Math.max(1, parseInt(t.picks) || 1));
          }
        })();
      } catch (_) {}
    }

    const memberId = uuidv4();
    db.prepare(`INSERT INTO golf_league_members (id, golf_league_id, user_id, team_name, season_budget) VALUES (?, ?, ?, ?, ?)`).run(memberId, id, req.user.id, team_name, parseInt(salary_cap) || 2400);

    // Initialize auction budget for commissioner if TourneyRun
    if (fmt === 'tourneyrun') {
      try {
        db.prepare(`INSERT OR IGNORE INTO golf_auction_budgets (id, league_id, member_id, auction_credits_remaining, faab_credits_remaining) VALUES (?, ?, ?, ?, ?)`).run(uuidv4(), id, memberId, parseInt(auction_budget) || 1000, parseInt(faab_weekly_budget) || 100);
      } catch (_) {}
    }

    res.status(201).json({ league: db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(id) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Public league preview — no auth required (used by invite link landing page)
router.get('/leagues/preview/:code', (req, res) => {
  try {
    const league = db.prepare(`
      SELECT gl.id, gl.name, gl.format_type, gl.max_teams, gl.buy_in_amount,
             gl.payout_first, gl.payout_second, gl.payout_third, gl.picks_per_team,
             gl.pool_tournament_id,
             gt.name AS pool_tournament_name,
             gt.start_date AS pool_tournament_start,
             gt.end_date AS pool_tournament_end,
             gt.course AS pool_tournament_course,
             (SELECT COUNT(*) FROM golf_league_members WHERE golf_league_id = gl.id) AS member_count
      FROM golf_leagues gl
      LEFT JOIN golf_tournaments gt ON gt.id = gl.pool_tournament_id
      WHERE gl.invite_code = ?
    `).get(req.params.code.toUpperCase());
    if (!league) return res.status(404).json({ error: 'Invalid invite code' });
    res.json({ league });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/leagues/join', authMiddleware, (req, res) => {
  try {
    const { invite_code, team_name } = req.body;
    if (!invite_code || !team_name) return res.status(400).json({ error: 'Invite code and team name required' });
    const league = db.prepare('SELECT * FROM golf_leagues WHERE invite_code = ?').get(invite_code.toUpperCase());
    if (!league) return res.status(404).json({ error: 'Invalid invite code' });
    const count = db.prepare('SELECT COUNT(*) as c FROM golf_league_members WHERE golf_league_id = ?').get(league.id).c;
    if (count >= league.max_teams) return res.status(400).json({ error: 'League is full' });
    if (getMember(league.id, req.user.id)) return res.status(400).json({ error: 'Already in this league' });
    const newMemberId = uuidv4();
    db.prepare(`INSERT INTO golf_league_members (id, golf_league_id, user_id, team_name, season_budget) VALUES (?, ?, ?, ?, ?)`).run(newMemberId, league.id, req.user.id, team_name, league.salary_cap || 2400);

    // Initialize auction budget if TourneyRun
    if (league.format_type === 'tourneyrun') {
      try {
        db.prepare(`INSERT OR IGNORE INTO golf_auction_budgets (id, league_id, member_id, auction_credits_remaining, faab_credits_remaining) VALUES (?, ?, ?, ?, ?)`).run(uuidv4(), league.id, newMemberId, league.auction_budget || 1000, league.faab_weekly_budget || 100);
      } catch (_) {}
    }

    res.json({ league_id: league.id, league });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Must be before /leagues/:id to prevent route shadowing
router.get('/leagues/my-rosters', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT gl.id, gl.picks_locked,
        CASE WHEN pp.user_id IS NOT NULL THEN 1 ELSE 0 END AS submitted
      FROM golf_leagues gl
      JOIN golf_league_members glm ON glm.golf_league_id = gl.id AND glm.user_id = ?
      LEFT JOIN pool_picks pp ON pp.league_id = gl.id AND pp.user_id = ?
        AND pp.tournament_id = gl.pool_tournament_id
      WHERE gl.format_type = 'pool' AND gl.pool_tournament_id IS NOT NULL
      GROUP BY gl.id
    `).all(req.user.id, req.user.id);
    const result = {};
    for (const r of rows) result[r.id] = { submitted: !!r.submitted, picks_locked: !!r.picks_locked };
    res.json(result);
  } catch (err) {
    console.error('[golf] my-rosters error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/leagues/:id', authMiddleware, (req, res) => {
  try {
    const league = db.prepare(`
      SELECT gl.*, gt.status as pool_tournament_status,
        gt.start_date as pool_tournament_start, gt.end_date as pool_tournament_end,
        gt.name as pool_tournament_name
      FROM golf_leagues gl
      LEFT JOIN golf_tournaments gt ON gt.id = gl.pool_tournament_id
      WHERE gl.id = ?
    `).get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    const members = db.prepare(`
      SELECT glm.*, u.username, u.avatar_url
      FROM golf_league_members glm JOIN users u ON glm.user_id = u.id
      WHERE glm.golf_league_id = ? ORDER BY glm.season_points DESC, glm.joined_at ASC
    `).all(req.params.id);
    const isCommissioner = league.commissioner_id === req.user.id;
    const myMember = members.find(m => m.user_id === req.user.id);
    if (!myMember && !isCommissioner) return res.status(403).json({ error: 'Not a member' });
    try { league.pool_tiers = JSON.parse(league.pool_tiers || '[]'); } catch (_) { league.pool_tiers = []; }
    res.json({ league, members, isCommissioner, myMember });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/leagues/:id/standings', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'Not found' });
    if (!getMember(req.params.id, req.user.id) && league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Not a member' });

    // ── Pool format: rank by pool_picks × golf_scores ─────────────────────────
    if (league.format_type === 'pool') {
      const tid = league.pool_tournament_id || null;
      const tourn = tid ? db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tid) : null;
      const members = db.prepare(`
        SELECT glm.*, u.username, u.avatar_url
        FROM golf_league_members glm JOIN users u ON glm.user_id = u.id
        WHERE glm.golf_league_id = ? ORDER BY glm.joined_at ASC
      `).all(req.params.id);

      const standings = members.map(m => {
        // Join via player_name → golf_players.id → golf_scores to survive
        // any golf_players ID rebuild that would leave stale IDs in pool_picks.
        const picks = tid ? db.prepare(`
          SELECT pp.player_id, pp.player_name, pp.tier_number, pp.country,
                 gs.fantasy_points, gs.round1, gs.round2, gs.round3, gs.round4,
                 gs.finish_position, gs.made_cut
          FROM pool_picks pp
          LEFT JOIN golf_players gp ON gp.name = pp.player_name
          LEFT JOIN golf_scores gs ON gs.player_id = gp.id AND gs.tournament_id = ?
          WHERE pp.league_id = ? AND pp.tournament_id = ? AND pp.user_id = ?
          ORDER BY pp.tier_number ASC
        `).all(tid, req.params.id, tid, m.user_id) : [];

        // All three names mean the same thing: sum of to-par round scores, lowest wins.
        //   'stroke_play'  — current UI creation name
        //   'total_score'  — second UI option (also stroke-based, same logic)
        //   'total_strokes'— Beta migration legacy name
        // If a new name is ever added to CreateGolfLeague.jsx, add it here too.
        const isStrokeBased = ['stroke_play', 'total_score', 'total_strokes'].includes(league.scoring_style);
        const dropCount = league.pool_drop_count ?? 2;

        let total_points;
        let enrichedPicks;

        if (isStrokeBased) {
          // STROKE PLAY — lower team score wins.
          // Score = sum of round1-4 to-par values across counting players (drop worst N).
          // fantasy_points per player = player_total (r1+r2+r3+r4), NOT the TourneyRun
          // DB value. Even par = 0. -4 means 4 under par. No bonuses, no cut penalties.
          const dropResult = applyDropScoring(picks, dropCount);
          total_points = dropResult.team_score;
          enrichedPicks = dropResult.picks.map(p => ({
            player_name: p.player_name, tier_number: p.tier_number, country: p.country,
            // Use player_total (sum of rounds) as the per-player score for stroke play.
            // p.fantasy_points from the DB holds the TourneyRun calculation — ignore it here.
            fantasy_points: p.player_total,
            round1: p.round1, round2: p.round2, round3: p.round3, round4: p.round4,
            finish_position: p.finish_position, made_cut: p.made_cut,
            player_total: p.player_total,
            is_dropped: p.is_dropped,
            is_pending: p.is_pending,
            is_mc: p.is_mc,
          }));
        } else {
          // TOURNEYRUN / DK STYLE — higher fantasy_points wins.
          // fantasy_points per player is pre-computed by calcFantasyPts() in golfSyncService
          // and stored in golf_scores.fantasy_points. Formula: -1.5 pts per stroke-to-par,
          // plus finish position bonuses (+30/+12/+8/+3), +2 made cut, -5 missed cut.
          // Majors multiply total by 1.5×. Team total = sum of all picks' fantasy_points.
          total_points = Math.round(picks.reduce((s, p) => s + (p.fantasy_points || 0), 0) * 10) / 10;
          enrichedPicks = picks.map(p => ({
            player_name: p.player_name, tier_number: p.tier_number, country: p.country,
            fantasy_points: p.fantasy_points || 0,
            round1: p.round1, round2: p.round2, round3: p.round3, round4: p.round4,
            finish_position: p.finish_position, made_cut: p.made_cut,
          }));
        }

        return {
          user_id: m.user_id, username: m.username, team_name: m.team_name,
          avatar_url: m.avatar_url,
          season_points: total_points,
          submitted: picks.length > 0,
          scoring_style: league.scoring_style || 'fantasy_points',
          picks: enrichedPicks,
        };
      });

      // Stroke-based scoring: sort ascending (lowest score wins).
      const scoringStyle = league.scoring_style || 'fantasy_points';
      const isStrokeSort = ['stroke_play', 'total_score', 'total_strokes'].includes(scoringStyle);
      if (isStrokeSort) {
        const withScores    = standings.filter(s => s.submitted);
        const withoutScores = standings.filter(s => !s.submitted);
        withScores.sort((a, b) => a.season_points - b.season_points);
        standings.splice(0, standings.length, ...withScores, ...withoutScores);
      } else {
        standings.sort((a, b) => b.season_points - a.season_points);
      }
      standings.forEach((s, i) => { s.rank = i + 1; });

      const hasScores = isStrokeSort
        ? standings.some(s => s.picks?.some(p => p.round1 != null || p.round2 != null || p.round3 != null || p.round4 != null))
        : standings.some(s => s.season_points !== 0);
      return res.json({
        standings, format: 'pool',
        scoring_style: scoringStyle,
        drop_count: league.pool_drop_count ?? 2,
        picks_per_team: league.picks_per_team || 8,
        active_tournament_id: tid,
        tournament: tourn,
        has_scores: hasScores,
      });
    }

    // ── TourneyRun / DK: rank by golf_weekly_lineups × golf_scores ────────────
    const activeTournament = db.prepare("SELECT id FROM golf_tournaments WHERE status = 'active' ORDER BY start_date ASC LIMIT 1").get();
    const activeTournId = activeTournament?.id || '';
    const standings = db.prepare(`
      SELECT glm.*, u.username, u.avatar_url,
        (SELECT COALESCE(SUM(gs.fantasy_points), 0)
         FROM golf_weekly_lineups wl
         JOIN golf_scores gs ON wl.player_id = gs.player_id AND wl.tournament_id = gs.tournament_id
         WHERE wl.member_id = glm.id AND wl.is_started = 1 AND gs.tournament_id = ?
        ) as points_this_week,
        (SELECT COUNT(DISTINCT gs.tournament_id)
         FROM golf_weekly_lineups wl
         JOIN golf_scores gs ON wl.player_id = gs.player_id AND wl.tournament_id = gs.tournament_id
         WHERE wl.member_id = glm.id AND wl.is_started = 1
        ) as tournaments_played
      FROM golf_league_members glm JOIN users u ON glm.user_id = u.id
      WHERE glm.golf_league_id = ? ORDER BY glm.season_points DESC
    `).all(activeTournId, req.params.id);
    res.json({ standings, active_tournament_id: activeTournId || null });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── PGA Live leaderboard ────────────────────────────────────────────────────────
router.get('/leagues/:id/pga-live', authMiddleware, async (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'Not found' });
    if (!getMember(req.params.id, req.user.id) && league.commissioner_id !== req.user.id)
      return res.status(403).json({ error: 'Not a member' });

    // Determine tournament: pool uses pool_tournament_id, others use active tournament
    const tid = league.pool_tournament_id ||
      db.prepare("SELECT id FROM golf_tournaments WHERE status='active' ORDER BY start_date ASC LIMIT 1").get()?.id;
    const tourn = tid ? db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tid) : null;

    // Picks for the current user (pool format)
    let myPickNames = [];
    if (league.format_type === 'pool' && tid) {
      myPickNames = db.prepare(`
        SELECT pl.name as player_name
        FROM pool_picks pp JOIN golf_players pl ON pl.id = pp.player_id
        WHERE pp.league_id = ? AND pp.user_id = ?
      `).all(req.params.id, req.user.id).map(r => r.player_name);
    }

    // Pre-tournament: skip ESPN fetch only for tournaments that haven't started yet.
    // Once the start date has arrived, always try to fetch live data from ESPN even if
    // our DB status hasn't been updated by the sync job yet.
    const _tournStarted = tourn && new Date() >= new Date(tourn.start_date);
    if (tourn && tourn.status === 'scheduled' && !_tournStarted) {
      return res.json({ competitors: [], tournament: tourn, my_pick_names: myPickNames, isScheduled: true });
    }

    const eventId = tourn?.espn_event_id;
    if (!eventId) {
      return res.json({ competitors: [], tournament: tourn, my_pick_names: myPickNames, no_event: true });
    }

    // Serve from cache if fresh
    const cached = _espnCache.get(eventId);
    if (cached && Date.now() - cached.ts < ESPN_CACHE_TTL) {
      return res.json({ ...cached.data, my_pick_names: myPickNames });
    }

    // Fetch from ESPN scoreboard
    let espnData;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?event=${eventId}`,
        { headers: { Accept: 'application/json' }, signal: controller.signal }
      );
      clearTimeout(timeout);
      if (!r.ok) throw new Error(`ESPN HTTP ${r.status}`);
      espnData = await r.json();
    } catch (fetchErr) {
      console.error('[pga-live] ESPN fetch error:', fetchErr.message);
      return res.json({ competitors: [], tournament: tourn, my_pick_names: myPickNames, fetch_error: true });
    }

    const rawComps = espnData?.events?.[0]?.competitions?.[0]?.competitors || [];

    // If we got live competitors but DB still shows 'scheduled', flip to active.
    // This ensures the sync job and standings query pick it up immediately.
    if (rawComps.length > 0 && tourn && tourn.status === 'scheduled') {
      try {
        db.prepare("UPDATE golf_tournaments SET status = 'active' WHERE id = ?").run(tourn.id);
        tourn.status = 'active';
        console.log(`[pga-live] Flipped "${tourn.name}" → active (${rawComps.length} competitors from ESPN)`);
      } catch (e) { /* non-fatal */ }
    }

    const competitors = rawComps.map((comp, idx) => {
      const name = comp.athlete?.displayName || comp.athlete?.fullName || '';

      // Status — field only present for cut/WD players; absent for active competitors
      const statusName = (comp.status?.type?.name || '').toUpperCase();
      const statusDesc = (comp.status?.type?.description || '').toLowerCase();
      const isScheduled = statusName === 'STATUS_SCHEDULED' || statusDesc.includes('scheduled');
      const isCut = statusDesc.includes('cut');
      const isWD  = statusDesc.includes('withdrawn');
      const isMDF = statusDesc.includes('did not finish');

      // Tee time (pre-tournament)
      const teeTimeRaw = comp.teeTime || null;
      const startHole  = comp.status?.startHole ?? null;

      // Sort order — ESPN scoreboard uses 'order', not 'sortOrder'
      const order = comp.order ?? comp.sortOrder ?? (idx + 1);

      // Position text — derive from order (1st=1, tied players share same order)
      const posText = comp.status?.position?.displayValue || String(order);

      // Total score string (e.g. "-7", "E", "+2") + numeric
      const totalStr = comp.score != null ? String(comp.score) : null;
      const parsePar = s => {
        if (s == null) return null;
        if (s === 'E' || s === 'Even') return 0;
        const n = parseInt(s, 10);
        return isNaN(n) ? null : n;
      };
      const totalNum = parsePar(totalStr);

      // Round scores — linescores[n] covers round n+1.
      // linescore.value = stroke count (e.g. 64); displayValue = to-par (e.g. "-7")
      const ls = comp.linescores || [];
      const getRound = n => parsePar((ls[n - 1]?.displayValue) ?? null);

      const r1 = getRound(1), r2 = getRound(2), r3 = getRound(3), r4 = getRound(4);
      const completedRounds = [r1, r2, r3, r4].filter(r => r !== null);
      const currentRound = completedRounds.length;
      const today = completedRounds[currentRound - 1] ?? null;
      const thru = comp.status?.thruHole ?? null;

      // Hole-by-hole scores for all rounds that have hole data
      const rounds = ls
        .filter(roundLs => roundLs?.linescores?.length > 0)
        .map(roundLs => ({
          round:   roundLs.period,
          topar:   roundLs.displayValue,
          strokes: roundLs.value != null ? Number(roundLs.value) : null,
          holes:   roundLs.linescores
            .map(h => ({
              hole:    h.period,
              strokes: h.value   != null ? Number(h.value) : null,
              topar:   h.scoreType?.displayValue ?? null,
            }))
            .filter(h => h.hole != null)
            .sort((a, b) => a.hole - b.hole),
        }));

      // Flag / country
      const flagHref = comp.athlete?.flag?.href || '';
      const countryAlt = comp.athlete?.flag?.alt || comp.athlete?.country || '';

      return {
        name,
        sortOrder: order,
        posText,
        total: totalNum,
        totalStr,
        r1, r2, r3, r4, today, thru,
        flagHref, countryAlt, currentRound,
        status: isWD ? 'wd' : isCut ? 'cut' : isMDF ? 'mdf' : isScheduled ? 'scheduled' : 'active',
        isCut, isWD, isMDF, isScheduled,
        teeTimeRaw, startHole,
        rounds,
      };
    });

    competitors.sort((a, b) => a.sortOrder - b.sortOrder);

    const payload = { competitors, tournament: tourn, event_id: eventId };
    _espnCache.set(eventId, { ts: Date.now(), data: payload });
    res.json({ ...payload, my_pick_names: myPickNames });
  } catch (err) {
    console.error('[pga-live]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/leagues/:id/scores', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'Not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    const { tournament_id, par = 72, scores } = req.body;
    if (!tournament_id || !Array.isArray(scores)) return res.status(400).json({ error: 'tournament_id and scores required' });
    const t = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tournament_id);
    if (!t) return res.status(404).json({ error: 'Tournament not found' });
    const parInt = parseInt(par) || 72;
    const upsert = db.prepare(`
      INSERT INTO golf_scores (id, tournament_id, player_id, round1, round2, round3, round4, made_cut, finish_position, fantasy_points, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tournament_id, player_id) DO UPDATE SET
        round1=excluded.round1, round2=excluded.round2, round3=excluded.round3, round4=excluded.round4,
        made_cut=excluded.made_cut, finish_position=excluded.finish_position,
        fantasy_points=excluded.fantasy_points, updated_at=CURRENT_TIMESTAMP
    `);
    db.transaction(() => {
      for (const s of scores) {
        const fp = calcCommissionerPts(s, parInt, !!t.is_major);
        upsert.run(uuidv4(), t.id, s.player_id, s.r1 ?? null, s.r2 ?? null, s.r3 ?? null, s.r4 ?? null, s.made_cut ? 1 : 0, s.finish_position ?? null, fp);
      }
    })();
    const affected = db.prepare('SELECT DISTINCT wl.member_id FROM golf_weekly_lineups wl WHERE wl.tournament_id = ? AND wl.is_started = 1').all(t.id);
    for (const { member_id } of affected) recalcMemberPoints(member_id);
    res.json({ ok: true, updated: scores.length });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Roster ─────────────────────────────────────────────────────────────────────
router.get('/leagues/:id/roster', authMiddleware, (req, res) => {
  try {
    const member = getMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });
    const coreIds = new Set(
      db.prepare('SELECT player_id FROM golf_core_players WHERE member_id = ?').all(member.id).map(r => r.player_id)
    );
    const roster = db.prepare(`
      SELECT gr.*, gp.name, gp.country, gp.world_ranking, gp.salary
      FROM golf_rosters gr JOIN golf_players gp ON gr.player_id = gp.id
      WHERE gr.member_id = ? AND gr.dropped_at IS NULL ORDER BY gp.world_ranking ASC
    `).all(member.id).map(p => ({ ...p, is_core: coreIds.has(p.player_id) ? 1 : 0 }));
    const totalSalary = roster.reduce((s, p) => s + p.salary, 0);
    res.json({ roster, totalSalary, budget: member.season_budget, remaining: member.season_budget - totalSalary });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/leagues/:id/roster/add', authMiddleware, (req, res) => {
  try {
    const { player_id } = req.body;
    if (!player_id) return res.status(400).json({ error: 'player_id required' });
    const member = getMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });
    const player = db.prepare('SELECT * FROM golf_players WHERE id = ? AND is_active = 1').get(player_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);

    const rosterCount = db.prepare('SELECT COUNT(*) as c FROM golf_rosters WHERE member_id = ? AND dropped_at IS NULL').get(member.id).c;
    if (rosterCount >= league.roster_size) return res.status(400).json({ error: `Roster full (max ${league.roster_size})` });

    const usedSalary = db.prepare(`SELECT COALESCE(SUM(gp.salary),0) as s FROM golf_rosters gr JOIN golf_players gp ON gr.player_id=gp.id WHERE gr.member_id=? AND gr.dropped_at IS NULL`).get(member.id).s;
    if (usedSalary + player.salary > member.season_budget) return res.status(400).json({ error: `Over cap. Remaining: $${member.season_budget - usedSalary}, Player: $${player.salary}` });

    if (db.prepare('SELECT id FROM golf_rosters WHERE member_id=? AND player_id=? AND dropped_at IS NULL').get(member.id, player_id)) return res.status(400).json({ error: 'Already on your roster' });

    const takenElsewhere = db.prepare(`SELECT gr.id FROM golf_rosters gr JOIN golf_league_members glm ON gr.member_id=glm.id WHERE glm.golf_league_id=? AND gr.player_id=? AND gr.dropped_at IS NULL AND glm.user_id!=?`).get(req.params.id, player_id, req.user.id);
    if (takenElsewhere) return res.status(400).json({ error: 'Player is on another team' });

    db.prepare('INSERT INTO golf_rosters (id, member_id, player_id) VALUES (?, ?, ?)').run(uuidv4(), member.id, player_id);
    res.json({ ok: true, player });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/leagues/:id/roster/drop', authMiddleware, (req, res) => {
  try {
    const { player_id } = req.body;
    if (!player_id) return res.status(400).json({ error: 'player_id required' });
    const member = getMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    // Core players cannot be dropped in TourneyRun mode
    if (league.format_type === 'tourneyrun') {
      const isCore = db.prepare('SELECT id FROM golf_core_players WHERE member_id=? AND player_id=?').get(member.id, player_id);
      if (isCore) return res.status(400).json({ error: 'Core players cannot be dropped. Core spots are locked for the season.' });
    }
    const entry = db.prepare('SELECT * FROM golf_rosters WHERE member_id=? AND player_id=? AND dropped_at IS NULL').get(member.id, player_id);
    if (!entry) return res.status(404).json({ error: 'Not on your roster' });
    db.prepare('UPDATE golf_rosters SET dropped_at=CURRENT_TIMESTAMP WHERE id=?').run(entry.id);
    db.prepare('UPDATE golf_weekly_lineups SET is_started=0 WHERE member_id=? AND player_id=? AND locked=0').run(member.id, player_id);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Lineup ─────────────────────────────────────────────────────────────────────
router.get('/leagues/:id/lineup/:tournament_id', authMiddleware, (req, res) => {
  try {
    const { id, tournament_id } = req.params;
    const member = getMember(id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });
    const tournament = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tournament_id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(id);
    const lock = lockTime(tournament.start_date);
    const isLocked = new Date() >= lock;

    const lineup = db.prepare(`
      SELECT wl.*, gp.name, gp.country, gp.world_ranking, gp.salary
      FROM golf_weekly_lineups wl JOIN golf_players gp ON wl.player_id = gp.id
      WHERE wl.member_id = ? AND wl.tournament_id = ?
    `).all(member.id, tournament_id);

    const roster = db.prepare(`
      SELECT gr.*, gp.name, gp.country, gp.world_ranking, gp.salary
      FROM golf_rosters gr JOIN golf_players gp ON gr.player_id = gp.id
      WHERE gr.member_id = ? AND gr.dropped_at IS NULL ORDER BY gp.world_ranking ASC
    `).all(member.id);

    res.json({ lineup, roster, isLocked, lockTime: lock.toISOString(), starters_per_week: league.starters_per_week });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/leagues/:id/lineup/:tournament_id', authMiddleware, (req, res) => {
  try {
    const { id, tournament_id } = req.params;
    const { starter_ids } = req.body;
    if (!Array.isArray(starter_ids)) return res.status(400).json({ error: 'starter_ids required' });
    const member = getMember(id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(id);
    const tournament = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tournament_id);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    if (new Date() >= lockTime(tournament.start_date)) return res.status(400).json({ error: 'Lineup is locked' });
    if (starter_ids.length > league.starters_per_week) return res.status(400).json({ error: `Max ${league.starters_per_week} starters` });

    const rosterIds = db.prepare('SELECT player_id FROM golf_rosters WHERE member_id=? AND dropped_at IS NULL').all(member.id).map(r => r.player_id);
    for (const pid of starter_ids) {
      if (!rosterIds.includes(pid)) return res.status(400).json({ error: 'Player not on your roster' });
    }

    db.transaction(() => {
      db.prepare('UPDATE golf_weekly_lineups SET is_started=0 WHERE member_id=? AND tournament_id=?').run(member.id, tournament_id);
      for (const pid of starter_ids) {
        const ex = db.prepare('SELECT id FROM golf_weekly_lineups WHERE member_id=? AND tournament_id=? AND player_id=?').get(member.id, tournament_id, pid);
        if (ex) db.prepare('UPDATE golf_weekly_lineups SET is_started=1 WHERE id=?').run(ex.id);
        else db.prepare('INSERT INTO golf_weekly_lineups (id, member_id, tournament_id, player_id, is_started) VALUES (?, ?, ?, ?, 1)').run(uuidv4(), member.id, tournament_id, pid);
      }
    })();

    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Draft ──────────────────────────────────────────────────────────────────────
router.get('/leagues/:id/draft', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'Not found' });
    const member = getMember(req.params.id, req.user.id);
    if (!member && league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Not a member' });

    const members = db.prepare(`SELECT glm.*, u.username FROM golf_league_members glm JOIN users u ON glm.user_id=u.id WHERE glm.golf_league_id=? ORDER BY glm.draft_order ASC`).all(req.params.id);
    const picks = db.prepare(`SELECT gdp.*, gp.name as player_name, gp.country, gp.world_ranking, gp.salary, u.username, glm.team_name FROM golf_draft_picks gdp JOIN golf_players gp ON gdp.player_id=gp.id JOIN users u ON gdp.user_id=u.id JOIN golf_league_members glm ON glm.golf_league_id=gdp.golf_league_id AND glm.user_id=gdp.user_id WHERE gdp.golf_league_id=? ORDER BY gdp.pick_number ASC`).all(req.params.id);
    const allPlayers = db.prepare('SELECT * FROM golf_players WHERE is_active=1 ORDER BY world_ranking ASC').all();
    const draftedIds = new Set(picks.map(p => p.player_id));
    const numTeams = members.length;
    const totalPicks = numTeams * league.roster_size;
    const currentPicker = league.current_pick <= totalPicks ? snakePicker(league.current_pick, numTeams, members) : null;
    const draftComplete = league.current_pick > totalPicks;

    // My current roster (drafted players)
    const myRoster = member ? db.prepare(`
      SELECT gr.player_id, gp.name, gp.country, gp.world_ranking, gp.salary
      FROM golf_rosters gr JOIN golf_players gp ON gr.player_id = gp.id
      WHERE gr.member_id = ? AND gr.dropped_at IS NULL ORDER BY gp.world_ranking ASC
    `).all(member.id) : [];

    // Core player IDs for TourneyRun mode
    const corePlayerIds = (league.format_type === 'tourneyrun' && member)
      ? db.prepare('SELECT player_id FROM golf_core_players WHERE member_id = ?').all(member.id).map(r => r.player_id)
      : [];

    res.json({
      league, members, picks,
      available: allPlayers.filter(p => !draftedIds.has(p.id)),
      myRoster, currentPick: league.current_pick,
      currentPicker, draftComplete,
      corePlayerIds,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/leagues/:id/draft/start', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'Not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    if (league.draft_status === 'active') return res.status(400).json({ error: 'Draft already active' });
    const members = db.prepare('SELECT * FROM golf_league_members WHERE golf_league_id=?').all(req.params.id);
    if (members.length < 2) return res.status(400).json({ error: 'Need at least 2 teams' });
    const shuffled = [...members].sort(() => Math.random() - 0.5);
    db.transaction(() => {
      shuffled.forEach((m, i) => db.prepare('UPDATE golf_league_members SET draft_order=? WHERE id=?').run(i + 1, m.id));
      db.prepare("UPDATE golf_leagues SET draft_status='active', status='drafting', current_pick=1 WHERE id=?").run(req.params.id);
    })();
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/leagues/:id/draft/pick', authMiddleware, (req, res) => {
  try {
    const { player_id } = req.body;
    if (!player_id) return res.status(400).json({ error: 'player_id required' });
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'Not found' });
    if (league.draft_status !== 'active') return res.status(400).json({ error: 'Draft not active' });

    const members = db.prepare(`SELECT glm.*, u.username FROM golf_league_members glm JOIN users u ON glm.user_id=u.id WHERE glm.golf_league_id=? ORDER BY glm.draft_order ASC`).all(req.params.id);
    const numTeams = members.length;
    const totalPicks = numTeams * league.roster_size;
    if (league.current_pick > totalPicks) return res.status(400).json({ error: 'Draft complete' });

    const picker = snakePicker(league.current_pick, numTeams, members);
    if (!picker || picker.user_id !== req.user.id) return res.status(400).json({ error: 'Not your turn' });

    const player = db.prepare('SELECT * FROM golf_players WHERE id=? AND is_active=1').get(player_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    if (db.prepare('SELECT id FROM golf_draft_picks WHERE golf_league_id=? AND player_id=?').get(req.params.id, player_id)) return res.status(400).json({ error: 'Already drafted' });

    const member = getMember(req.params.id, req.user.id);

    // Salary cap enforcement — skip for Pool mode (no salary in pool drafts)
    if (league.format_type !== 'pool') {
      const myDraftSalary = db.prepare(`SELECT COALESCE(SUM(gp.salary),0) as s FROM golf_draft_picks gdp JOIN golf_players gp ON gdp.player_id=gp.id WHERE gdp.golf_league_id=? AND gdp.user_id=?`).get(req.params.id, req.user.id).s;
      if (myDraftSalary + player.salary > member.season_budget) return res.status(400).json({ error: `Over cap. Budget: $${member.season_budget}, Used: $${myDraftSalary}, Player: $${player.salary}` });
    }

    const round = Math.ceil(league.current_pick / numTeams);
    const nextPick = league.current_pick + 1;
    const draftComplete = nextPick > totalPicks;

    db.transaction(() => {
      db.prepare('INSERT INTO golf_draft_picks (id, golf_league_id, user_id, player_id, pick_number, round) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), req.params.id, req.user.id, player_id, league.current_pick, round);
      db.prepare('INSERT INTO golf_rosters (id, member_id, player_id) VALUES (?, ?, ?)').run(uuidv4(), member.id, player_id);
      db.prepare(`UPDATE golf_leagues SET current_pick=?, draft_status=?, status=? WHERE id=?`).run(nextPick, draftComplete ? 'completed' : 'active', draftComplete ? 'active' : 'drafting', req.params.id);
    })();

    // Flag as core player for TourneyRun (first core_spots picks per manager)
    if (league.format_type === 'tourneyrun') {
      const myPickCount = db.prepare('SELECT COUNT(*) as c FROM golf_draft_picks WHERE golf_league_id=? AND user_id=?').get(req.params.id, req.user.id).c;
      if (myPickCount <= (league.core_spots || 4)) {
        try { db.prepare('INSERT OR IGNORE INTO golf_core_players (id, member_id, player_id) VALUES (?, ?, ?)').run(uuidv4(), member.id, player_id); } catch (_) {}
      }
    }

    const nextPicker = draftComplete ? null : snakePicker(nextPick, numTeams, members);
    res.json({ ok: true, pick: { player_id, player_name: player.name, pick_number: league.current_pick, round }, draftComplete, nextPickUserId: nextPicker?.user_id || null });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── ESPN Auto-Sync routes ───────────────────────────────────────────────────────
const { syncTournamentScores, getSyncStatus } = require('../golfSyncService');

// POST /admin/sync/:tournamentId — manual sync trigger (commissioner or superadmin)
router.post('/admin/sync/:tournamentId', authMiddleware, async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const tourn = db.prepare('SELECT * FROM golf_tournaments WHERE id = ?').get(tournamentId);
    if (!tourn) return res.status(404).json({ error: 'Tournament not found' });

    // Must be superadmin OR commissioner of a league using this tournament
    if (req.user.role !== 'superadmin') {
      const league = db.prepare(`
        SELECT gl.id FROM golf_leagues gl
        WHERE gl.commissioner_id = ?
        LIMIT 1
      `).get(req.user.id);
      if (!league) return res.status(403).json({ error: 'Commissioner access required' });
    }

    const par = parseInt(req.body.par) || 72;
    const result = await syncTournamentScores(tournamentId, { par, silent: false });
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[golf-sync] Manual sync error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /admin/sync/status
router.get('/admin/sync/status', authMiddleware, (req, res) => {
  try {
    res.json(getSyncStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/golf/leagues/:id/blast — commissioner sends mass email to all members
// ---------------------------------------------------------------------------
router.post('/leagues/:id/blast', authMiddleware, async (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Not commissioner' });

    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

    const members = db.prepare(
      'SELECT u.email, u.username FROM golf_league_members glm JOIN users u ON glm.user_id = u.id WHERE glm.golf_league_id = ?'
    ).all(req.params.id);

    console.log('[golf] Blast: fetched', members.length, 'emails for league', req.params.id);

    const { sendEmailBatch } = require('../mailer');
    const leagueUrl = `https://www.tourneyrun.app/golf/league/${req.params.id}`;
    const safeMessage = message.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const emailBody = () => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#050f08;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050f08;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="background:linear-gradient(90deg,transparent,#22c55e,transparent);height:2px;border-radius:2px;"></td></tr>
        <tr><td style="background:#0a1a0f;border:1px solid #14532d55;border-top:none;border-radius:0 0 16px 16px;padding:36px 36px 32px;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:20px;font-weight:300;color:#86efac;">tourney</span><span style="font-size:20px;font-weight:800;color:#22c55e;">run</span>
            <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#166534;margin-top:3px;">Golf Fantasy</div>
          </div>
          <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.15em;color:#4ade80;">Message from your commissioner</p>
          <h1 style="margin:0 0 16px;font-size:18px;font-weight:800;color:#ffffff;">${league.name}</h1>
          <div style="background:#071510;border:1px solid #14532d55;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <p style="margin:0;font-size:15px;color:#d1d5db;line-height:1.7;white-space:pre-wrap;">${safeMessage}</p>
          </div>
          <div style="text-align:center;margin-bottom:24px;">
            <a href="${leagueUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:10px;">
              View League →
            </a>
          </div>
          <p style="margin:0;font-size:11px;color:#166534;text-align:center;">TourneyRun · tourneyrun.app</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await sendEmailBatch(members.map(m => ({
      from: 'TourneyRun Golf <noreply@tourneyrun.app>',
      to:   m.email,
      subject: `📣 Message from your ${league.name} commissioner`,
      html: emailBody(),
    })));

    console.log('[golf] Blast: sent to', members.length, 'members');
    res.json({ ok: true, sent: members.length });
  } catch (err) {
    console.error('[golf] blast error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/golf/leagues/:id/settings — commissioner edits buy-in + payouts
// ---------------------------------------------------------------------------
router.patch('/leagues/:id/settings', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Not commissioner' });

    const { buy_in_amount, payout_1st, payout_2nd, payout_3rd, venmo, zelle, paypal } = req.body;

    // Payout settings — only if provided
    if (payout_1st !== undefined) {
      const p1 = Math.round((parseFloat(payout_1st) || 0) * 100) / 100;
      const p2 = Math.round((parseFloat(payout_2nd) || 0) * 100) / 100;
      const p3 = Math.round((parseFloat(payout_3rd) || 0) * 100) / 100;
      if (Math.abs(p1 + p2 + p3 - 100) > 0.5) {
        return res.status(400).json({ error: 'Payouts must sum to 100%' });
      }
      db.prepare(
        'UPDATE golf_leagues SET buy_in_amount = ?, payout_first = ?, payout_second = ?, payout_third = ? WHERE id = ?'
      ).run(parseFloat(buy_in_amount) || 0, p1, p2, p3, req.params.id);
    }

    // Payment methods — saved independently, no payout validation needed
    if (venmo !== undefined || zelle !== undefined || paypal !== undefined) {
      const fields = [];
      const vals = [];
      if (venmo  !== undefined) { fields.push('venmo = ?');  vals.push(venmo  || null); }
      if (zelle  !== undefined) { fields.push('zelle = ?');  vals.push(zelle  || null); }
      if (paypal !== undefined) { fields.push('paypal = ?'); vals.push(paypal || null); }
      vals.push(req.params.id);
      db.prepare(`UPDATE golf_leagues SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[golf] settings patch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
