const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/players — get all players with optional filters
router.get('/', (req, res) => {
  try {
    const { team, position, search } = req.query;
    let query = 'SELECT * FROM players WHERE 1=1';
    const params = [];

    if (team) {
      query += ' AND team = ?';
      params.push(team);
    }
    if (position) {
      query += ' AND position = ?';
      params.push(position);
    }
    if (search) {
      query += ' AND name LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY season_ppg DESC';
    const players = db.prepare(query).all(...params);
    res.json({ players });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/players/available/:leagueId — players not yet drafted
router.get('/available/:leagueId', authMiddleware, (req, res) => {
  try {
    const { team, position, search } = req.query;
    let query = `
      SELECT p.* FROM players p
      WHERE p.id NOT IN (
        SELECT player_id FROM draft_picks WHERE league_id = ?
      )
    `;
    const params = [req.params.leagueId];

    if (team) {
      query += ' AND p.team = ?';
      params.push(team);
    }
    if (position) {
      query += ' AND p.position = ?';
      params.push(position);
    }
    if (search) {
      query += ' AND p.name LIKE ?';
      params.push(`%${search}%`);
    }

    query += ' ORDER BY p.season_ppg DESC';
    const players = db.prepare(query).all(...params);
    res.json({ players });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/players/:id/injury-flag — commissioner clears an injury flag
router.delete('/:id/injury-flag', authMiddleware, (req, res) => {
  try {
    // Must be commissioner of at least one active league
    const league = db.prepare(`
      SELECT id FROM leagues
      WHERE commissioner_id = ? AND status NOT IN ('completed')
    `).get(req.user.id);
    if (!league) return res.status(403).json({ error: 'Only a league commissioner can clear injury flags' });

    db.prepare("UPDATE players SET injury_flagged = 0, injury_status = '', injury_headline = '' WHERE id = ?").run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
