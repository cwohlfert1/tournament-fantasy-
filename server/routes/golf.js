const express = require('express');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');

// Initialize golf tables + seed on first require
require('../golf-db');
const db = require('../db');

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
             (SELECT COUNT(*) FROM golf_league_members WHERE golf_league_id = gl.id) as member_count
      FROM golf_leagues gl
      JOIN golf_league_members glm ON glm.golf_league_id = gl.id AND glm.user_id = ?
      ORDER BY gl.created_at DESC
    `).all(req.user.id);
    res.json({ leagues });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/leagues', authMiddleware, (req, res) => {
  try {
    const { name, team_name, max_teams = 10, roster_size = 8, starters_per_week = 6, buy_in_amount = 0, payment_instructions = '', payout_first = 70, payout_second = 20, payout_third = 10, pick_time_limit = 60 } = req.body;
    if (!name || !team_name) return res.status(400).json({ error: 'League name and team name required' });
    const p1 = Math.max(0, parseInt(payout_first) || 0);
    const p2 = Math.max(0, parseInt(payout_second) || 0);
    const p3 = Math.max(0, parseInt(payout_third) || 0);
    if (p1 + p2 + p3 > 100) return res.status(400).json({ error: 'Payouts exceed 100%' });

    const id = uuidv4();
    const invite_code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const rs = Math.min(12, Math.max(4, parseInt(roster_size) || 8));

    db.prepare(`
      INSERT INTO golf_leagues (id, name, commissioner_id, invite_code, status, max_teams, buy_in_amount, payment_instructions, payout_first, payout_second, payout_third, roster_size, starters_per_week, pick_time_limit, season_year)
      VALUES (?, ?, ?, ?, 'lobby', ?, ?, ?, ?, ?, ?, ?, ?, ?, 2025)
    `).run(id, name, req.user.id, invite_code, parseInt(max_teams) || 10, parseFloat(buy_in_amount) || 0, payment_instructions, p1, p2, p3, rs, Math.min(rs, parseInt(starters_per_week) || 6), parseInt(pick_time_limit) || 60);

    db.prepare(`INSERT INTO golf_league_members (id, golf_league_id, user_id, team_name, season_budget) VALUES (?, ?, ?, ?, 2400)`).run(uuidv4(), id, req.user.id, team_name);

    res.status(201).json({ league: db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(id) });
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
    db.prepare(`INSERT INTO golf_league_members (id, golf_league_id, user_id, team_name, season_budget) VALUES (?, ?, ?, ?, 2400)`).run(uuidv4(), league.id, req.user.id, team_name);
    res.json({ league });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/leagues/:id', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    const members = db.prepare(`
      SELECT glm.*, u.username, u.avatar_url
      FROM golf_league_members glm JOIN users u ON glm.user_id = u.id
      WHERE glm.golf_league_id = ? ORDER BY glm.season_points DESC, glm.joined_at ASC
    `).all(req.params.id);
    const isCommissioner = league.commissioner_id === req.user.id;
    const myMember = members.find(m => m.user_id === req.user.id);
    if (!myMember && !isCommissioner) return res.status(403).json({ error: 'Not a member' });
    res.json({ league, members, isCommissioner, myMember });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/leagues/:id/standings', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'Not found' });
    if (!getMember(req.params.id, req.user.id) && league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Not a member' });
    const standings = db.prepare(`
      SELECT glm.*, u.username, u.avatar_url,
             (SELECT COUNT(*) FROM golf_rosters gr WHERE gr.member_id = glm.id AND gr.dropped_at IS NULL) as roster_count
      FROM golf_league_members glm JOIN users u ON glm.user_id = u.id
      WHERE glm.golf_league_id = ? ORDER BY glm.season_points DESC
    `).all(req.params.id);
    res.json({ standings });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── Roster ─────────────────────────────────────────────────────────────────────
router.get('/leagues/:id/roster', authMiddleware, (req, res) => {
  try {
    const member = getMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });
    const roster = db.prepare(`
      SELECT gr.*, gp.name, gp.country, gp.world_ranking, gp.salary
      FROM golf_rosters gr JOIN golf_players gp ON gr.player_id = gp.id
      WHERE gr.member_id = ? AND gr.dropped_at IS NULL ORDER BY gp.world_ranking ASC
    `).all(member.id);
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
    const picks = db.prepare(`SELECT gdp.*, gp.name, gp.country, gp.world_ranking, gp.salary, u.username FROM golf_draft_picks gdp JOIN golf_players gp ON gdp.player_id=gp.id JOIN users u ON gdp.user_id=u.id WHERE gdp.golf_league_id=? ORDER BY gdp.pick_number ASC`).all(req.params.id);
    const allPlayers = db.prepare('SELECT * FROM golf_players WHERE is_active=1 ORDER BY world_ranking ASC').all();
    const draftedIds = new Set(picks.map(p => p.player_id));
    const numTeams = members.length;
    const totalPicks = numTeams * league.roster_size;
    const currentPicker = league.current_pick <= totalPicks ? snakePicker(league.current_pick, numTeams, members) : null;

    res.json({
      league, members, picks,
      availablePlayers: allPlayers.filter(p => !draftedIds.has(p.id)),
      currentPicker, draftComplete: league.current_pick > totalPicks,
      myPicks: picks.filter(p => p.user_id === req.user.id),
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
    const myDraftSalary = db.prepare(`SELECT COALESCE(SUM(gp.salary),0) as s FROM golf_draft_picks gdp JOIN golf_players gp ON gdp.player_id=gp.id WHERE gdp.golf_league_id=? AND gdp.user_id=?`).get(req.params.id, req.user.id).s;
    if (myDraftSalary + player.salary > member.season_budget) return res.status(400).json({ error: `Over cap. Budget: $${member.season_budget}, Used: $${myDraftSalary}, Player: $${player.salary}` });

    const round = Math.ceil(league.current_pick / numTeams);
    const nextPick = league.current_pick + 1;
    const draftComplete = nextPick > totalPicks;

    db.transaction(() => {
      db.prepare('INSERT INTO golf_draft_picks (id, golf_league_id, user_id, player_id, pick_number, round) VALUES (?, ?, ?, ?, ?, ?)').run(uuidv4(), req.params.id, req.user.id, player_id, league.current_pick, round);
      db.prepare('INSERT INTO golf_rosters (id, member_id, player_id) VALUES (?, ?, ?)').run(uuidv4(), member.id, player_id);
      db.prepare(`UPDATE golf_leagues SET current_pick=?, draft_status=?, status=? WHERE id=?`).run(nextPick, draftComplete ? 'completed' : 'active', draftComplete ? 'active' : 'drafting', req.params.id);
    })();

    const nextPicker = draftComplete ? null : snakePicker(nextPick, numTeams, members);
    res.json({ ok: true, pick: { player_id, player_name: player.name, pick_number: league.current_pick, round }, draftComplete, nextPickUserId: nextPicker?.user_id || null });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
