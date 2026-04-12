const express = require('express');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMember(leagueId, userId) {
  return db.prepare('SELECT * FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?').get(leagueId, userId);
}

function ensureBudget(leagueId, memberId, auctionBudget, faabBudget) {
  db.prepare(`
    INSERT OR IGNORE INTO golf_auction_budgets (id, league_id, member_id, auction_credits_remaining, faab_credits_remaining)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), leagueId, memberId, auctionBudget, faabBudget);
}

function resetFaabIfNeeded(leagueId, memberId, weeklyBudget) {
  const budget = db.prepare('SELECT * FROM golf_auction_budgets WHERE league_id = ? AND member_id = ?').get(leagueId, memberId);
  if (!budget) return weeklyBudget;
  const now = new Date();
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - ((now.getUTCDay() + 6) % 7));
  thisMonday.setHours(0, 0, 0, 0);
  if (!budget.faab_last_reset || new Date(budget.faab_last_reset) < thisMonday) {
    db.prepare('UPDATE golf_auction_budgets SET faab_credits_remaining = ?, faab_last_reset = CURRENT_TIMESTAMP WHERE league_id = ? AND member_id = ?').run(weeklyBudget, leagueId, memberId);
    return weeklyBudget;
  }
  return budget.faab_credits_remaining;
}

// Finalize an expired or resolved nomination
function finalizeNomination(session, league) {
  if (!session.current_player_id) return;

  const members = db.prepare('SELECT * FROM golf_league_members WHERE golf_league_id = ? ORDER BY draft_order ASC').all(league.id);
  const nominationOrder = JSON.parse(session.nomination_order || '[]');

  // Winner = highest bidder, or nominator if no one else bid
  let winnerId = session.current_high_bidder_id || session.current_nomination_member_id;
  const winAmount = session.current_high_bid || 1;

  db.transaction(() => {
    // Deduct from winner's auction budget
    db.prepare('UPDATE golf_auction_budgets SET auction_credits_remaining = MAX(0, auction_credits_remaining - ?) WHERE league_id = ? AND member_id = ?').run(winAmount, league.id, winnerId);

    // Add to winner's roster (skip if already there)
    const alreadyOnRoster = db.prepare('SELECT id FROM golf_rosters WHERE member_id = ? AND player_id = ? AND dropped_at IS NULL').get(winnerId, session.current_player_id);
    if (!alreadyOnRoster) {
      db.prepare('INSERT INTO golf_rosters (id, member_id, player_id) VALUES (?, ?, ?)').run(uuidv4(), winnerId, session.current_player_id);
    }

    // Core player logic for TourneyRun
    if (league.format_type === 'tourneyrun') {
      const winCount = db.prepare("SELECT COUNT(*) as c FROM golf_auction_bids WHERE league_id = ? AND member_id = ? AND status = 'won' AND bid_type = 'auction'").get(league.id, winnerId).c;
      if (winCount < (league.core_spots || 4)) {
        try { db.prepare('INSERT OR IGNORE INTO golf_core_players (id, member_id, player_id) VALUES (?, ?, ?)').run(uuidv4(), winnerId, session.current_player_id); } catch (_) {}
      }
    }

    // Record the winning bid
    db.prepare("INSERT INTO golf_auction_bids (id, league_id, player_id, member_id, amount, bid_type, status) VALUES (?, ?, ?, ?, ?, 'auction', 'won')").run(uuidv4(), league.id, session.current_player_id, winnerId, winAmount);

    // Check if auction is complete: total wins == members * roster_size
    const totalWins = db.prepare("SELECT COUNT(*) as c FROM golf_auction_bids WHERE league_id = ? AND status = 'won' AND bid_type = 'auction'").get(league.id).c + 1; // +1 for this win
    const totalNeeded = members.length * (league.roster_size || 8);

    if (totalWins >= totalNeeded) {
      db.prepare("UPDATE golf_auction_sessions SET status='completed', current_player_id=NULL, current_high_bid=1, current_high_bidder_id=NULL, nomination_ends_at=NULL WHERE id=?").run(session.id);
      db.prepare("UPDATE golf_leagues SET draft_status='completed', status='active' WHERE id=?").run(league.id);
    } else {
      // Advance nomination to next member
      const nextIndex = (session.nomination_index + 1) % nominationOrder.length;
      const nextNominatorId = nominationOrder[nextIndex];
      db.prepare("UPDATE golf_auction_sessions SET current_player_id=NULL, current_high_bid=1, current_high_bidder_id=NULL, nomination_ends_at=NULL, current_nomination_member_id=?, nomination_index=? WHERE id=?").run(nextNominatorId, nextIndex, session.id);
    }
  })();
}

// ── GET /leagues/:id/auction/state ─────────────────────────────────────────────
router.get('/leagues/:id/auction/state', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    const member = getMember(req.params.id, req.user.id);
    if (!member && league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Not a member' });

    const auctionBudget = league.auction_budget || 1000;
    const faabBudget = league.faab_weekly_budget || 100;

    // Ensure budgets exist for all members
    const allMembers = db.prepare(`
      SELECT glm.*, u.username
      FROM golf_league_members glm JOIN users u ON glm.user_id = u.id
      WHERE glm.golf_league_id = ? ORDER BY glm.draft_order ASC NULLS LAST, glm.joined_at ASC
    `).all(req.params.id);
    for (const m of allMembers) ensureBudget(req.params.id, m.id, auctionBudget, faabBudget);

    // Get or create session
    let session = db.prepare('SELECT * FROM golf_auction_sessions WHERE league_id = ?').get(req.params.id);
    if (!session) {
      const sid = uuidv4();
      db.prepare('INSERT INTO golf_auction_sessions (id, league_id, status) VALUES (?, ?, ?)').run(sid, req.params.id, 'waiting');
      session = db.prepare('SELECT * FROM golf_auction_sessions WHERE id = ?').get(sid);
    }

    // Lazy timer expiry check
    if (session.status === 'active' && session.current_player_id && session.nomination_ends_at) {
      if (new Date() > new Date(session.nomination_ends_at)) {
        finalizeNomination(session, league);
        session = db.prepare('SELECT * FROM golf_auction_sessions WHERE id = ?').get(session.id);
        // Refresh league in case draft completed
      }
    }
    const freshLeague = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);

    // Won players
    const wonPlayers = db.prepare(`
      SELECT gab.*, gp.name, gp.country, gp.world_ranking, gp.salary, glm.team_name as winner_team
      FROM golf_auction_bids gab
      JOIN golf_players gp ON gab.player_id = gp.id
      JOIN golf_league_members glm ON gab.member_id = glm.id
      WHERE gab.league_id = ? AND gab.status = 'won' AND gab.bid_type = 'auction'
      ORDER BY gab.created_at DESC
    `).all(req.params.id);
    const wonIds = new Set(wonPlayers.map(p => p.player_id));

    // Available players (not yet won in this auction)
    const availablePlayers = db.prepare('SELECT * FROM golf_players WHERE is_active = 1 ORDER BY world_ranking ASC').all().filter(p => !wonIds.has(p.id));

    // Member budgets
    const budgets = db.prepare('SELECT * FROM golf_auction_budgets WHERE league_id = ?').all(req.params.id);
    const budgetMap = Object.fromEntries(budgets.map(b => [b.member_id, b]));
    const membersWithBudgets = allMembers.map(m => ({
      ...m,
      auction_credits_remaining: budgetMap[m.id]?.auction_credits_remaining ?? auctionBudget,
      faab_credits_remaining: budgetMap[m.id]?.faab_credits_remaining ?? faabBudget,
    }));

    // My roster with is_core
    const myRoster = member ? db.prepare(`
      SELECT gr.player_id, gp.name, gp.country, gp.world_ranking, gp.salary,
        CASE WHEN gcp.id IS NOT NULL THEN 1 ELSE 0 END as is_core
      FROM golf_rosters gr
      JOIN golf_players gp ON gr.player_id = gp.id
      LEFT JOIN golf_core_players gcp ON gcp.member_id = gr.member_id AND gcp.player_id = gr.player_id
      WHERE gr.member_id = ? AND gr.dropped_at IS NULL ORDER BY is_core DESC, gp.world_ranking ASC
    `).all(member.id) : [];

    // Current nominated player
    const currentPlayer = session.current_player_id
      ? db.prepare('SELECT * FROM golf_players WHERE id = ?').get(session.current_player_id)
      : null;

    // High bidder team name
    const currentHighBidderTeam = session.current_high_bidder_id
      ? allMembers.find(m => m.id === session.current_high_bidder_id)?.team_name || null
      : null;

    const isAmIHighBidder = member && session.current_high_bidder_id === member.id;

    // Seconds remaining
    const secondsRemaining = (session.nomination_ends_at && session.status === 'active')
      ? Math.max(0, Math.round((new Date(session.nomination_ends_at) - new Date()) / 1000))
      : 0;

    const myBudget = member ? (budgetMap[member.id] || { auction_credits_remaining: auctionBudget, faab_credits_remaining: faabBudget }) : null;
    const isMyNominationTurn = !!(member && session.status === 'active' && session.current_nomination_member_id === member.id && !session.current_player_id);

    res.json({
      league: freshLeague,
      session: { ...session, seconds_remaining: secondsRemaining },
      currentPlayer,
      currentHighBidderTeam,
      isAmIHighBidder,
      members: membersWithBudgets,
      wonPlayers,
      availablePlayers,
      myRoster,
      myBudget,
      isMyNominationTurn,
      isCommissioner: freshLeague.commissioner_id === req.user.id,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── POST /leagues/:id/auction/start ───────────────────────────────────────────
router.post('/leagues/:id/auction/start', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    if (league.draft_status === 'active') return res.status(400).json({ error: 'Auction already started' });

    const members = db.prepare('SELECT * FROM golf_league_members WHERE golf_league_id = ?').all(req.params.id);
    if (members.length < 2) return res.status(400).json({ error: 'Need at least 2 teams to start' });

    const shuffled = [...members].sort(() => Math.random() - 0.5);
    const auctionBudget = league.auction_budget || 1000;
    const faabBudget = league.faab_weekly_budget || 100;

    db.transaction(() => {
      shuffled.forEach((m, i) => {
        db.prepare('UPDATE golf_league_members SET draft_order = ? WHERE id = ?').run(i + 1, m.id);
        ensureBudget(req.params.id, m.id, auctionBudget, faabBudget);
      });

      const nominationOrder = JSON.stringify(shuffled.map(m => m.id));
      let session = db.prepare('SELECT * FROM golf_auction_sessions WHERE league_id = ?').get(req.params.id);
      if (session) {
        db.prepare("UPDATE golf_auction_sessions SET status='active', current_nomination_member_id=?, nomination_order=?, nomination_index=0, current_player_id=NULL, nomination_ends_at=NULL WHERE id=?").run(shuffled[0].id, nominationOrder, session.id);
      } else {
        db.prepare("INSERT INTO golf_auction_sessions (id, league_id, status, current_nomination_member_id, nomination_order, nomination_index) VALUES (?, ?, 'active', ?, ?, 0)").run(uuidv4(), req.params.id, shuffled[0].id, nominationOrder);
      }
      db.prepare("UPDATE golf_leagues SET draft_status='active', status='drafting' WHERE id=?").run(req.params.id);
    })();

    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── POST /leagues/:id/auction/nominate ─────────────────────────────────────────
router.post('/leagues/:id/auction/nominate', authMiddleware, (req, res) => {
  try {
    const { player_id } = req.body;
    if (!player_id) return res.status(400).json({ error: 'player_id required' });

    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    const member = getMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const session = db.prepare('SELECT * FROM golf_auction_sessions WHERE league_id = ?').get(req.params.id);
    if (!session || session.status !== 'active') return res.status(400).json({ error: 'Auction is not active' });
    if (session.current_nomination_member_id !== member.id) return res.status(403).json({ error: 'Not your turn to nominate' });
    if (session.current_player_id) return res.status(400).json({ error: 'A nomination is already in progress' });

    const alreadyWon = db.prepare("SELECT id FROM golf_auction_bids WHERE league_id = ? AND player_id = ? AND status = 'won' AND bid_type = 'auction'").get(req.params.id, player_id);
    if (alreadyWon) return res.status(400).json({ error: 'Player already won in this auction' });

    const player = db.prepare('SELECT * FROM golf_players WHERE id = ? AND is_active = 1').get(player_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const timerSecs = league.bid_timer_seconds || 30;
    const endsAt = new Date(Date.now() + timerSecs * 1000).toISOString();

    db.prepare('UPDATE golf_auction_sessions SET current_player_id=?, current_high_bid=1, current_high_bidder_id=NULL, nomination_ends_at=? WHERE id=?').run(player_id, endsAt, session.id);

    res.json({ ok: true, player, ends_at: endsAt });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── POST /leagues/:id/auction/bid ──────────────────────────────────────────────
router.post('/leagues/:id/auction/bid', authMiddleware, (req, res) => {
  try {
    const bid = Math.max(1, parseInt(req.body.amount) || 1);

    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    const member = getMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const session = db.prepare('SELECT * FROM golf_auction_sessions WHERE league_id = ?').get(req.params.id);
    if (!session || session.status !== 'active') return res.status(400).json({ error: 'No active auction' });
    if (!session.current_player_id) return res.status(400).json({ error: 'No active nomination' });
    if (session.nomination_ends_at && new Date() > new Date(session.nomination_ends_at)) return res.status(400).json({ error: 'Bidding window has closed' });
    if (bid <= session.current_high_bid) return res.status(400).json({ error: `Bid must be more than current high bid of $${session.current_high_bid}` });

    const budget = db.prepare('SELECT * FROM golf_auction_budgets WHERE league_id = ? AND member_id = ?').get(req.params.id, member.id);
    const remaining = budget?.auction_credits_remaining ?? (league.auction_budget || 1000);
    if (bid > remaining) return res.status(400).json({ error: `Bid $${bid} exceeds your remaining credits $${remaining}` });

    const timerSecs = league.bid_timer_seconds || 30;
    const newEndsAt = new Date(Date.now() + timerSecs * 1000).toISOString();
    db.prepare('UPDATE golf_auction_sessions SET current_high_bid=?, current_high_bidder_id=?, nomination_ends_at=? WHERE id=?').run(bid, member.id, newEndsAt, session.id);

    res.json({ ok: true, bid, ends_at: newEndsAt });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── POST /leagues/:id/faab/bid ─────────────────────────────────────────────────
router.post('/leagues/:id/faab/bid', authMiddleware, (req, res) => {
  try {
    const { player_id, drop_player_id, amount } = req.body;
    if (!player_id) return res.status(400).json({ error: 'player_id required' });
    const bid = Math.max(0, parseInt(amount) || 0);

    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    const member = getMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const auctionBudget = league.auction_budget || 1000;
    const faabBudget = league.faab_weekly_budget || 100;
    ensureBudget(req.params.id, member.id, auctionBudget, faabBudget);
    const faabRemaining = resetFaabIfNeeded(req.params.id, member.id, faabBudget);
    if (bid > faabRemaining) return res.status(400).json({ error: `Bid $${bid} exceeds FAAB remaining $${faabRemaining}` });

    const player = db.prepare('SELECT * FROM golf_players WHERE id = ? AND is_active = 1').get(player_id);
    if (!player) return res.status(404).json({ error: 'Player not found' });

    const taken = db.prepare(`
      SELECT gr.id FROM golf_rosters gr JOIN golf_league_members glm ON gr.member_id = glm.id
      WHERE glm.golf_league_id = ? AND gr.player_id = ? AND gr.dropped_at IS NULL
    `).get(req.params.id, player_id);
    if (taken) return res.status(400).json({ error: 'Player is already on a roster' });

    if (drop_player_id) {
      const isCore = db.prepare('SELECT id FROM golf_core_players WHERE member_id = ? AND player_id = ?').get(member.id, drop_player_id);
      if (isCore) return res.status(400).json({ error: 'Cannot drop a core player' });
      const onRoster = db.prepare('SELECT id FROM golf_rosters WHERE member_id = ? AND player_id = ? AND dropped_at IS NULL').get(member.id, drop_player_id);
      if (!onRoster) return res.status(400).json({ error: 'Drop player not on your roster' });
    }

    // Upsert bid
    const existing = db.prepare("SELECT id FROM golf_faab_bids WHERE member_id = ? AND player_id = ? AND status = 'pending'").get(member.id, player_id);
    if (existing) {
      db.prepare('UPDATE golf_faab_bids SET bid_amount = ?, drop_player_id = ? WHERE id = ?').run(bid, drop_player_id || null, existing.id);
      return res.json({ ok: true, updated: true, bid, faab_remaining: faabRemaining });
    }

    const activeTournament = db.prepare("SELECT id FROM golf_tournaments WHERE status = 'active' ORDER BY start_date ASC LIMIT 1").get();
    db.prepare("INSERT INTO golf_faab_bids (id, golf_league_id, member_id, player_id, drop_player_id, bid_amount, tournament_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')").run(uuidv4(), req.params.id, member.id, player_id, drop_player_id || null, bid, activeTournament?.id || null);

    res.status(201).json({ ok: true, bid, faab_remaining: faabRemaining - bid });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── GET /leagues/:id/faab/bids ─────────────────────────────────────────────────
router.get('/leagues/:id/faab/bids', authMiddleware, (req, res) => {
  try {
    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(req.params.id);
    if (!league) return res.status(404).json({ error: 'League not found' });
    const member = getMember(req.params.id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const faabBudget = league.faab_weekly_budget || 100;
    ensureBudget(req.params.id, member.id, league.auction_budget || 1000, faabBudget);
    const faabRemaining = resetFaabIfNeeded(req.params.id, member.id, faabBudget);

    const bids = db.prepare(`
      SELECT fb.*, gp.name as player_name, gp.world_ranking, dp.name as drop_player_name
      FROM golf_faab_bids fb
      JOIN golf_players gp ON fb.player_id = gp.id
      LEFT JOIN golf_players dp ON fb.drop_player_id = dp.id
      WHERE fb.member_id = ? AND fb.status = 'pending'
      ORDER BY fb.created_at DESC
    `).all(member.id);

    res.json({ bids, faab_remaining: faabRemaining, faab_budget: faabBudget });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
module.exports.finalizeNomination = finalizeNomination;
