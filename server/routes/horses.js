const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const db = require('../db/index');

// ── Shared helpers ───────────────────────────────────────────────────────────

function fisherYatesShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function executeRandomDraw(poolId) {
  const pool = await db.get('SELECT * FROM horses_pools WHERE id = ?', [poolId]);
  if (!pool || pool.format_type !== 'random_draw' || pool.status !== 'open') {
    throw new Error('Pool not eligible for draw');
  }

  const entries = await db.all(
    'SELECT * FROM horses_entries WHERE pool_id = ? AND is_paid = true AND refund_status IS NULL',
    [poolId]
  );
  if (entries.length === 0) throw new Error('No eligible entries');

  const horses = await db.all(
    "SELECT * FROM horses_horses WHERE event_id = ? AND status = 'active'",
    [pool.event_id]
  );
  if (horses.length === 0) throw new Error('No active horses');

  fisherYatesShuffle(entries);
  fisherYatesShuffle(horses);

  for (let i = 0; i < entries.length; i++) {
    const horse = horses[i % horses.length];
    await db.run('UPDATE horses_entries SET assigned_horse_id = ? WHERE id = ?', [horse.id, entries[i].id]);
  }

  await db.run("UPDATE horses_pools SET status = 'locked' WHERE id = ?", [poolId]);
  return { entries: entries.length, horses: horses.length };
}

// ── Public routes (no auth) ───────────────────────────────────────────────────

// Pool preview by invite code (section 06)
router.get('/pools/preview/:code', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const pool = await db.get(`
      SELECT p.name, p.format_type, p.entry_fee, p.lock_time, p.status,
             e.name AS event_name, e.race_date AS event_date,
             u.username AS commissioner_name
      FROM horses_pools p
      JOIN horses_events e ON p.event_id = e.id
      JOIN users u ON p.commissioner_id = u.id
      WHERE UPPER(p.invite_code) = ?
    `, [code]);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });
    const countRow = await db.get('SELECT COUNT(*) as cnt FROM horses_entries WHERE pool_id = (SELECT id FROM horses_pools WHERE UPPER(invite_code) = ?)', [code]);
    res.json({ pool: { ...pool, entrant_count: countRow?.cnt || 0 } });
  } catch (err) {
    console.error('[horses] GET /pools/preview/:code error:', err.message);
    res.status(500).json({ error: 'Failed to fetch pool preview' });
  }
});

// ── All routes below require auth ─────────────────────────────────────────────
router.use(authMiddleware);

// ── Event routes (superadmin only) ────────────────────────────────────────────

router.get('/events', async (req, res) => {
  try {
    const events = await db.all('SELECT * FROM horses_events ORDER BY race_date DESC');
    res.json({ events });
  } catch (err) {
    console.error('[horses] GET /events error:', err.message);
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
      `INSERT INTO horses_events (id, name, venue, race_date, post_time, default_lock_time, field_size)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, name, venue || null, race_date || null, post_time || null, default_lock_time || null, field_size || 20]
    );
    const event = await db.get('SELECT * FROM horses_events WHERE id = ?', [id]);
    res.status(201).json({ event });
  } catch (err) {
    console.error('[horses] POST /events error:', err.message);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

router.put('/events/:id', async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { name, venue, race_date, post_time, default_lock_time, field_size, status } = req.body;
    const existing = await db.get('SELECT * FROM horses_events WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Event not found' });
    await db.run(
      `UPDATE horses_events SET name = ?, venue = ?, race_date = ?, post_time = ?, default_lock_time = ?, field_size = ?, status = ?
       WHERE id = ?`,
      [
        name || existing.name, venue !== undefined ? venue : existing.venue,
        race_date || existing.race_date, post_time || existing.post_time,
        default_lock_time || existing.default_lock_time, field_size || existing.field_size,
        status || existing.status, req.params.id
      ]
    );
    const event = await db.get('SELECT * FROM horses_events WHERE id = ?', [req.params.id]);
    res.json({ event });
  } catch (err) {
    console.error('[horses] PUT /events/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// ── Horse routes ──────────────────────────────────────────────────────────────

router.get('/events/:id/horses', async (req, res) => {
  try {
    const horses = await db.all(
      'SELECT * FROM horses_horses WHERE event_id = ? ORDER BY post_position ASC',
      [req.params.id]
    );
    res.json({ horses });
  } catch (err) {
    console.error('[horses] GET /events/:id/horses error:', err.message);
    res.status(500).json({ error: 'Failed to fetch horses' });
  }
});

router.post('/events/:id/horses', async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const { horse_name, post_position, jockey_name, trainer_name, morning_line_odds, silk_colors } = req.body;
    if (!horse_name) return res.status(400).json({ error: 'Horse name is required' });
    const event = await db.get('SELECT * FROM horses_events WHERE id = ?', [req.params.id]);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (post_position) {
      const dup = await db.get(
        'SELECT id FROM horses_horses WHERE event_id = ? AND post_position = ?',
        [req.params.id, post_position]
      );
      if (dup) return res.status(409).json({ error: `Post position ${post_position} already taken` });
    }
    const id = uuidv4();
    await db.run(
      `INSERT INTO horses_horses (id, event_id, horse_name, post_position, jockey_name, trainer_name, morning_line_odds, silk_colors)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.id, horse_name, post_position || null, jockey_name || null, trainer_name || null, morning_line_odds || null, silk_colors || null]
    );
    const horse = await db.get('SELECT * FROM horses_horses WHERE id = ?', [id]);
    res.status(201).json({ horse });
  } catch (err) {
    console.error('[horses] POST /events/:id/horses error:', err.message);
    res.status(500).json({ error: 'Failed to add horse' });
  }
});

router.put('/horses/:id', async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const existing = await db.get('SELECT * FROM horses_horses WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Horse not found' });
    const { horse_name, post_position, jockey_name, trainer_name, morning_line_odds, silk_colors, status } = req.body;
    if (post_position && post_position !== existing.post_position) {
      const dup = await db.get(
        'SELECT id FROM horses_horses WHERE event_id = ? AND post_position = ? AND id != ?',
        [existing.event_id, post_position, req.params.id]
      );
      if (dup) return res.status(409).json({ error: `Post position ${post_position} already taken` });
    }
    await db.run(
      `UPDATE horses_horses SET horse_name = ?, post_position = ?, jockey_name = ?, trainer_name = ?,
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
    // Scratch-refund: mark assigned entries in locked random_draw pools
    if (status === 'scratched') {
      await db.run(`
        UPDATE horses_entries SET refund_status = 'scratched_refund'
        WHERE assigned_horse_id = ?
        AND pool_id IN (SELECT id FROM horses_pools WHERE format_type = 'random_draw' AND status = 'locked')
      `, [req.params.id]);
    }

    const horse = await db.get('SELECT * FROM horses_horses WHERE id = ?', [req.params.id]);
    res.json({ horse });
  } catch (err) {
    console.error('[horses] PUT /horses/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update horse' });
  }
});

router.delete('/horses/:id', async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  try {
    const existing = await db.get('SELECT * FROM horses_horses WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Horse not found' });
    await db.run('DELETE FROM horses_horses WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[horses] DELETE /horses/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete horse' });
  }
});

// ── Pool routes ───────────────────────────────────────────────────────────────

router.get('/pools', async (req, res) => {
  try {
    const pools = await db.all(`
      SELECT p.*, e.name AS event_name,
             (SELECT COUNT(*) FROM horses_entries WHERE pool_id = p.id) AS entrant_count
      FROM horses_pools p
      JOIN horses_events e ON p.event_id = e.id
      WHERE p.id IN (SELECT pool_id FROM horses_entries WHERE user_id = ?)
      ORDER BY p.created_at DESC
    `, [req.user.id]);
    res.json({ pools });
  } catch (err) {
    console.error('[horses] GET /pools error:', err.message);
    res.status(500).json({ error: 'Failed to fetch pools' });
  }
});

function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

router.post('/pools', async (req, res) => {
  try {
    const { event_id, name, format_type, entry_fee, lock_time, payout_structure,
            admin_fee_type, admin_fee_value, venmo, paypal, zelle,
            squares_per_person_cap, scoring_config } = req.body;

    // Validate format
    if (!['random_draw', 'pick_wps', 'squares'].includes(format_type)) {
      return res.status(400).json({ error: 'Invalid format_type. Must be random_draw, pick_wps, or squares' });
    }

    // Validate event
    const event = await db.get('SELECT * FROM horses_events WHERE id = ?', [event_id]);
    if (!event) return res.status(400).json({ error: 'Event not found' });

    // Validate payout structure
    if (payout_structure) {
      const total = payout_structure.reduce((sum, p) => sum + (p.pct || 0), 0);
      if (Math.abs(total - 100) > 0.01) {
        return res.status(400).json({ error: `Payout percentages must sum to 100 (got ${total})` });
      }
    }

    // Validate lock time
    if (lock_time) {
      const lockDate = new Date(lock_time);
      if (lockDate <= new Date()) return res.status(400).json({ error: 'Lock time must be in the future' });
      if (event.post_time && lockDate > new Date(event.post_time)) {
        return res.status(400).json({ error: 'Lock time cannot be after post time' });
      }
    }

    // Generate unique invite code
    let invite_code;
    for (let attempt = 0; attempt < 10; attempt++) {
      invite_code = generateInviteCode();
      const existing = await db.get('SELECT id FROM horses_pools WHERE invite_code = ?', [invite_code]);
      if (!existing) break;
      if (attempt === 9) return res.status(500).json({ error: 'Failed to generate unique invite code' });
    }

    const id = uuidv4();
    const defaultPayout = format_type === 'squares'
      ? [{ place: 1, pct: 60 }, { place: 2, pct: 25 }, { place: 3, pct: 15 }]
      : [{ place: 1, pct: 50 }, { place: 2, pct: 30 }, { place: 3, pct: 20 }];

    await db.run(`
      INSERT INTO horses_pools (id, event_id, commissioner_id, name, format_type, invite_code,
        entry_fee, lock_time, payout_structure, admin_fee_type, admin_fee_value,
        venmo, zelle, paypal, squares_per_person_cap, scoring_config)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, event_id, req.user.id, name || 'My Racing Pool', format_type, invite_code,
      entry_fee || 5.00, lock_time || event.default_lock_time,
      JSON.stringify(payout_structure || defaultPayout),
      admin_fee_type || null, admin_fee_value || 0,
      venmo || null, zelle || null, paypal || null,
      squares_per_person_cap || 10,
      JSON.stringify(scoring_config || { win: 5, place: 3, show: 2 })
    ]);

    // Auto-add commissioner as first entry (paid, no fee)
    await db.run(`
      INSERT INTO horses_entries (id, pool_id, user_id, display_name, is_paid)
      VALUES (?, ?, ?, ?, true)
    `, [uuidv4(), id, req.user.id, req.user.username || req.user.email]);

    // Initialize squares grid if squares format
    if (format_type === 'squares') {
      const values = [];
      const placeholders = [];
      for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
          const sqId = uuidv4();
          values.push(sqId, id, r, c);
          placeholders.push('(?, ?, ?, ?)');
        }
      }
      await db.run(`INSERT INTO horses_squares (id, pool_id, row_num, col_num) VALUES ${placeholders.join(', ')}`, values);
    }

    const pool = await db.get('SELECT * FROM horses_pools WHERE id = ?', [id]);
    res.status(201).json({ pool });
  } catch (err) {
    console.error('[horses] POST /pools error:', err.message);
    res.status(500).json({ error: 'Failed to create pool' });
  }
});

router.get('/pools/:id', async (req, res) => {
  // TODO: section-12
  res.status(501).json({ error: 'Not implemented' });
});

router.post('/pools/join', async (req, res) => {
  try {
    const { invite_code, display_name } = req.body;
    if (!invite_code) return res.status(400).json({ error: 'Invite code is required' });

    const pool = await db.get('SELECT * FROM horses_pools WHERE UPPER(invite_code) = ?', [invite_code.toUpperCase()]);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });
    if (pool.status !== 'open') return res.status(400).json({ error: 'Pool is no longer accepting entries' });

    const existing = await db.get('SELECT id FROM horses_entries WHERE pool_id = ? AND user_id = ?', [pool.id, req.user.id]);
    if (existing) return res.status(409).json({ error: 'You have already joined this pool', entry_id: existing.id, pool_id: pool.id });

    const entry_id = uuidv4();
    await db.run(`
      INSERT INTO horses_entries (id, pool_id, user_id, display_name, is_paid)
      VALUES (?, ?, ?, ?, false)
    `, [entry_id, pool.id, req.user.id, display_name || req.user.username || 'Anonymous']);

    res.status(201).json({ entry_id, pool_id: pool.id });
  } catch (err) {
    console.error('[horses] POST /pools/join error:', err.message);
    res.status(500).json({ error: 'Failed to join pool' });
  }
});

router.put('/pools/:id/settings', async (req, res) => {
  // TODO: section-05 (commissioner only)
  res.status(501).json({ error: 'Not implemented' });
});

// ── Random Draw ───────────────────────────────────────────────────────────────

router.post('/pools/:id/draw', async (req, res) => {
  try {
    const pool = await db.get('SELECT * FROM horses_pools WHERE id = ?', [req.params.id]);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });
    if (pool.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    if (pool.format_type !== 'random_draw') return res.status(400).json({ error: 'Not a random draw pool' });
    if (pool.status !== 'open') return res.status(400).json({ error: 'Pool already locked' });

    const result = await executeRandomDraw(pool.id);

    const assignments = await db.all(`
      SELECT e.id AS entry_id, e.user_id, e.display_name, e.assigned_horse_id,
             h.horse_name, h.post_position, h.jockey_name, h.morning_line_odds
      FROM horses_entries e
      JOIN horses_horses h ON e.assigned_horse_id = h.id
      WHERE e.pool_id = ? AND e.assigned_horse_id IS NOT NULL
    `, [pool.id]);

    res.json({ success: true, assignments, ...result });
  } catch (err) {
    console.error('[horses] POST /pools/:id/draw error:', err.message);
    res.status(500).json({ error: err.message });
  }
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
module.exports.executeRandomDraw = executeRandomDraw;
