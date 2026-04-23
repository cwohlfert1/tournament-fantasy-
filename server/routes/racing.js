const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const db = require('../db/index');

// ── Public routes (no auth) ───────────────────────────────────────────────────

// Pool preview by invite code (section 06)
router.get('/pools/preview/:code', async (req, res) => {
  // TODO: section-06
  res.status(501).json({ error: 'Not implemented' });
});

// ── All routes below require auth ─────────────────────────────────────────────
router.use(authMiddleware);

// ── Event routes (superadmin only) ────────────────────────────────────────────

router.get('/events', async (req, res) => {
  try {
    const events = await db.all('SELECT * FROM racing_events ORDER BY race_date DESC');
    res.json({ events });
  } catch (err) {
    console.error('[racing] GET /events error:', err.message);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

router.post('/events', async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name, venue, race_date, post_time, default_lock_time, field_size } = req.body;
    if (!name) return res.status(400).json({ error: 'Event name is required' });
    const id = uuidv4();
    await db.run(
      `INSERT INTO racing_events (id, name, venue, race_date, post_time, default_lock_time, field_size)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, venue || null, race_date || null, post_time || null, default_lock_time || null, field_size || 20]
    );
    const event = await db.get('SELECT * FROM racing_events WHERE id = ?', [id]);
    res.status(201).json({ event });
  } catch (err) {
    console.error('[racing] POST /events error:', err.message);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

router.put('/events/:id', async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name, venue, race_date, post_time, default_lock_time, field_size, status } = req.body;
    const existing = await db.get('SELECT * FROM racing_events WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Event not found' });
    await db.run(
      `UPDATE racing_events SET name = ?, venue = ?, race_date = ?, post_time = ?, default_lock_time = ?, field_size = ?, status = ?
       WHERE id = ?`,
      [
        name || existing.name, venue !== undefined ? venue : existing.venue,
        race_date || existing.race_date, post_time || existing.post_time,
        default_lock_time || existing.default_lock_time, field_size || existing.field_size,
        status || existing.status, req.params.id
      ]
    );
    const event = await db.get('SELECT * FROM racing_events WHERE id = ?', [req.params.id]);
    res.json({ event });
  } catch (err) {
    console.error('[racing] PUT /events/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// ── Horse routes ──────────────────────────────────────────────────────────────

router.get('/events/:id/horses', async (req, res) => {
  try {
    const horses = await db.all(
      'SELECT * FROM racing_horses WHERE event_id = ? ORDER BY post_position ASC',
      [req.params.id]
    );
    res.json({ horses });
  } catch (err) {
    console.error('[racing] GET /events/:id/horses error:', err.message);
    res.status(500).json({ error: 'Failed to fetch horses' });
  }
});

router.post('/events/:id/horses', async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { horse_name, post_position, jockey_name, trainer_name, morning_line_odds, silk_colors } = req.body;
    if (!horse_name) return res.status(400).json({ error: 'Horse name is required' });
    const event = await db.get('SELECT * FROM racing_events WHERE id = ?', [req.params.id]);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (post_position) {
      const dup = await db.get(
        'SELECT id FROM racing_horses WHERE event_id = ? AND post_position = ?',
        [req.params.id, post_position]
      );
      if (dup) return res.status(409).json({ error: `Post position ${post_position} already taken` });
    }
    const id = uuidv4();
    await db.run(
      `INSERT INTO racing_horses (id, event_id, horse_name, post_position, jockey_name, trainer_name, morning_line_odds, silk_colors)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.id, horse_name, post_position || null, jockey_name || null, trainer_name || null, morning_line_odds || null, silk_colors || null]
    );
    const horse = await db.get('SELECT * FROM racing_horses WHERE id = ?', [id]);
    res.status(201).json({ horse });
  } catch (err) {
    console.error('[racing] POST /events/:id/horses error:', err.message);
    res.status(500).json({ error: 'Failed to add horse' });
  }
});

router.put('/horses/:id', async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const existing = await db.get('SELECT * FROM racing_horses WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Horse not found' });
    const { horse_name, post_position, jockey_name, trainer_name, morning_line_odds, silk_colors, status } = req.body;
    if (post_position && post_position !== existing.post_position) {
      const dup = await db.get(
        'SELECT id FROM racing_horses WHERE event_id = ? AND post_position = ? AND id != ?',
        [existing.event_id, post_position, req.params.id]
      );
      if (dup) return res.status(409).json({ error: `Post position ${post_position} already taken` });
    }
    await db.run(
      `UPDATE racing_horses SET horse_name = ?, post_position = ?, jockey_name = ?, trainer_name = ?,
       morning_line_odds = ?, silk_colors = ?, status = ? WHERE id = ?`,
      [
        horse_name || existing.horse_name, post_position !== undefined ? post_position : existing.post_position,
        jockey_name !== undefined ? jockey_name : existing.jockey_name,
        trainer_name !== undefined ? trainer_name : existing.trainer_name,
        morning_line_odds !== undefined ? morning_line_odds : existing.morning_line_odds,
        silk_colors !== undefined ? silk_colors : existing.silk_colors,
        status || existing.status, req.params.id
      ]
    );
    const horse = await db.get('SELECT * FROM racing_horses WHERE id = ?', [req.params.id]);
    res.json({ horse });
  } catch (err) {
    console.error('[racing] PUT /horses/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update horse' });
  }
});

router.delete('/horses/:id', async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const existing = await db.get('SELECT * FROM racing_horses WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Horse not found' });
    await db.run('DELETE FROM racing_horses WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[racing] DELETE /horses/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete horse' });
  }
});

// ── Pool routes ───────────────────────────────────────────────────────────────

router.get('/pools', async (req, res) => {
  // TODO: section-05
  res.status(501).json({ error: 'Not implemented' });
});

router.post('/pools', async (req, res) => {
  // TODO: section-05
  res.status(501).json({ error: 'Not implemented' });
});

router.get('/pools/:id', async (req, res) => {
  // TODO: section-12
  res.status(501).json({ error: 'Not implemented' });
});

router.post('/pools/join', async (req, res) => {
  // TODO: section-06
  res.status(501).json({ error: 'Not implemented' });
});

router.put('/pools/:id/settings', async (req, res) => {
  // TODO: section-05 (commissioner only)
  res.status(501).json({ error: 'Not implemented' });
});

// ── Random Draw ───────────────────────────────────────────────────────────────

router.post('/pools/:id/draw', async (req, res) => {
  // TODO: section-07 (commissioner only)
  res.status(501).json({ error: 'Not implemented' });
});

// ── Pick Win/Place/Show ───────────────────────────────────────────────────────

router.post('/pools/:id/picks', async (req, res) => {
  // TODO: section-08 (member only)
  res.status(501).json({ error: 'Not implemented' });
});

router.get('/pools/:id/picks', async (req, res) => {
  // TODO: section-08 (member only)
  res.status(501).json({ error: 'Not implemented' });
});

// ── Squares ───────────────────────────────────────────────────────────────────

router.post('/pools/:id/squares/claim', async (req, res) => {
  // TODO: section-09 (member only)
  res.status(501).json({ error: 'Not implemented' });
});

router.post('/pools/:id/squares/unclaim', async (req, res) => {
  // TODO: section-09 (member only)
  res.status(501).json({ error: 'Not implemented' });
});

router.get('/pools/:id/squares', async (req, res) => {
  // TODO: section-09 (member only)
  res.status(501).json({ error: 'Not implemented' });
});

router.post('/pools/:id/squares/assign', async (req, res) => {
  // TODO: section-09 (commissioner only)
  res.status(501).json({ error: 'Not implemented' });
});

// ── Results & Payouts ─────────────────────────────────────────────────────────

router.post('/pools/:id/results', async (req, res) => {
  // TODO: section-10 (commissioner only)
  res.status(501).json({ error: 'Not implemented' });
});

router.get('/pools/:id/results', async (req, res) => {
  // TODO: section-10 (member only)
  res.status(501).json({ error: 'Not implemented' });
});

router.post('/pools/:id/payouts/trigger', async (req, res) => {
  // TODO: section-10 (commissioner only)
  res.status(501).json({ error: 'Not implemented' });
});

router.get('/pools/:id/payouts', async (req, res) => {
  // TODO: section-10 (member only)
  res.status(501).json({ error: 'Not implemented' });
});

module.exports = router;
