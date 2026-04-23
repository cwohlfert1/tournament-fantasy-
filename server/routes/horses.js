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
  try {
    const pool = await db.get('SELECT * FROM horses_pools WHERE id = ?', [req.params.id]);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });

    const entry = await db.get('SELECT * FROM horses_entries WHERE pool_id = ? AND user_id = ?', [pool.id, req.user.id]);
    if (!entry && pool.commissioner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not a member of this pool' });
    }

    const entries = await db.all('SELECT * FROM horses_entries WHERE pool_id = ?', [pool.id]);
    const event = await db.get('SELECT * FROM horses_events WHERE id = ?', [pool.event_id]);

    res.json({ pool, entries, event });
  } catch (err) {
    console.error('[horses] GET /pools/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch pool' });
  }
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
  try {
    const pool = await db.get('SELECT * FROM horses_pools WHERE id = ?', [req.params.id]);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });
    if (pool.format_type !== 'pick_wps') return res.status(400).json({ error: 'Not a Pick W/P/S pool' });
    if (pool.status !== 'open') return res.status(400).json({ error: 'Pool is locked — picks are frozen' });
    if (pool.lock_time && new Date() >= new Date(pool.lock_time)) {
      return res.status(400).json({ error: 'Lock time has passed' });
    }

    const entry = await db.get('SELECT * FROM horses_entries WHERE pool_id = ? AND user_id = ?', [pool.id, req.user.id]);
    if (!entry) return res.status(403).json({ error: 'You are not a member of this pool' });

    const { win_horse_id, place_horse_id, show_horse_id } = req.body;
    if (!win_horse_id || !place_horse_id || !show_horse_id) {
      return res.status(400).json({ error: 'All three picks (win, place, show) are required' });
    }
    if (new Set([win_horse_id, place_horse_id, show_horse_id]).size !== 3) {
      return res.status(400).json({ error: 'Each pick must be a different horse' });
    }

    // Validate all horses are active in this event
    for (const hid of [win_horse_id, place_horse_id, show_horse_id]) {
      const horse = await db.get("SELECT id FROM horses_horses WHERE id = ? AND event_id = ? AND status = 'active'", [hid, pool.event_id]);
      if (!horse) return res.status(400).json({ error: `Horse ${hid} is not active in this event` });
    }

    // Upsert picks (delete existing + insert)
    await db.run('DELETE FROM horses_picks WHERE entry_id = ?', [entry.id]);
    for (const [slot, horse_id] of [['win', win_horse_id], ['place', place_horse_id], ['show', show_horse_id]]) {
      await db.run('INSERT INTO horses_picks (id, entry_id, slot, horse_id) VALUES (?, ?, ?, ?)', [uuidv4(), entry.id, slot, horse_id]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[horses] POST /pools/:id/picks error:', err.message);
    res.status(500).json({ error: 'Failed to save picks' });
  }
});

router.get('/pools/:id/picks', async (req, res) => {
  try {
    const pool = await db.get('SELECT * FROM horses_pools WHERE id = ?', [req.params.id]);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });

    const entry = await db.get('SELECT * FROM horses_entries WHERE pool_id = ? AND user_id = ?', [pool.id, req.user.id]);
    if (!entry) return res.status(403).json({ error: 'You are not a member of this pool' });

    if (pool.status === 'open') {
      // Pre-lock: only return own picks
      const picks = await db.all(`
        SELECT p.slot, p.horse_id, p.points_earned, h.horse_name, h.post_position, h.jockey_name, h.morning_line_odds
        FROM horses_picks p JOIN horses_horses h ON p.horse_id = h.id
        WHERE p.entry_id = ?
      `, [entry.id]);
      res.json({ picks, all_visible: false });
    } else {
      // Post-lock: return all entrants' picks
      const allPicks = await db.all(`
        SELECT e.display_name, e.user_id, p.slot, p.horse_id, p.points_earned,
               h.horse_name, h.post_position, h.jockey_name, h.morning_line_odds
        FROM horses_picks p
        JOIN horses_entries e ON p.entry_id = e.id
        JOIN horses_horses h ON p.horse_id = h.id
        WHERE e.pool_id = ?
        ORDER BY e.display_name, p.slot
      `, [pool.id]);
      res.json({ picks: allPicks, all_visible: true });
    }
  } catch (err) {
    console.error('[horses] GET /pools/:id/picks error:', err.message);
    res.status(500).json({ error: 'Failed to fetch picks' });
  }
});

// ── Squares ───────────────────────────────────────────────────────────────────

router.post('/pools/:id/squares/claim', async (req, res) => {
  try {
    const pool = await db.get('SELECT * FROM horses_pools WHERE id = ?', [req.params.id]);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });
    if (pool.format_type !== 'squares') return res.status(400).json({ error: 'Not a squares pool' });
    if (pool.status !== 'open') return res.status(400).json({ error: 'Pool is locked' });
    if (pool.lock_time && new Date() >= new Date(pool.lock_time)) return res.status(400).json({ error: 'Lock time has passed' });

    const entry = await db.get('SELECT * FROM horses_entries WHERE pool_id = ? AND user_id = ?', [pool.id, req.user.id]);
    if (!entry) return res.status(403).json({ error: 'Not a member of this pool' });

    const { squares } = req.body; // [{row: 3, col: 7}, ...]
    if (!squares || !squares.length) return res.status(400).json({ error: 'No squares specified' });

    // Check per-person cap
    const owned = await db.get('SELECT COUNT(*) as cnt FROM horses_squares WHERE pool_id = ? AND entry_id = ?', [pool.id, entry.id]);
    const cap = pool.squares_per_person_cap || 10;
    if ((owned?.cnt || 0) + squares.length > cap) {
      return res.status(400).json({ error: `Exceeds per-person cap of ${cap} squares` });
    }

    // Claim each square
    for (const sq of squares) {
      const existing = await db.get('SELECT entry_id FROM horses_squares WHERE pool_id = ? AND row_num = ? AND col_num = ?', [pool.id, sq.row, sq.col]);
      if (!existing) return res.status(400).json({ error: `Square (${sq.row},${sq.col}) does not exist` });
      if (existing.entry_id) return res.status(409).json({ error: `Square (${sq.row},${sq.col}) is already claimed` });
      await db.run('UPDATE horses_squares SET entry_id = ? WHERE pool_id = ? AND row_num = ? AND col_num = ?', [entry.id, pool.id, sq.row, sq.col]);
    }

    res.json({ success: true, claimed: squares.length });
  } catch (err) {
    console.error('[horses] POST /pools/:id/squares/claim error:', err.message);
    res.status(500).json({ error: 'Failed to claim squares' });
  }
});

router.post('/pools/:id/squares/unclaim', async (req, res) => {
  try {
    const pool = await db.get('SELECT * FROM horses_pools WHERE id = ?', [req.params.id]);
    if (!pool || pool.status !== 'open') return res.status(400).json({ error: 'Pool is locked or not found' });

    const entry = await db.get('SELECT * FROM horses_entries WHERE pool_id = ? AND user_id = ?', [pool.id, req.user.id]);
    if (!entry) return res.status(403).json({ error: 'Not a member' });

    const { squares } = req.body;
    for (const sq of squares) {
      await db.run('UPDATE horses_squares SET entry_id = NULL WHERE pool_id = ? AND row_num = ? AND col_num = ? AND entry_id = ?',
        [pool.id, sq.row, sq.col, entry.id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[horses] POST /pools/:id/squares/unclaim error:', err.message);
    res.status(500).json({ error: 'Failed to unclaim squares' });
  }
});

router.get('/pools/:id/squares', async (req, res) => {
  try {
    const pool = await db.get('SELECT * FROM horses_pools WHERE id = ?', [req.params.id]);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });

    const entry = await db.get('SELECT * FROM horses_entries WHERE pool_id = ? AND user_id = ?', [pool.id, req.user.id]);
    if (!entry) return res.status(403).json({ error: 'Not a member' });

    const squares = await db.all(`
      SELECT s.row_num, s.col_num, s.entry_id, s.row_digit, s.col_digit, e.display_name
      FROM horses_squares s
      LEFT JOIN horses_entries e ON s.entry_id = e.id
      WHERE s.pool_id = ?
      ORDER BY s.row_num, s.col_num
    `, [pool.id]);

    res.json({ squares });
  } catch (err) {
    console.error('[horses] GET /pools/:id/squares error:', err.message);
    res.status(500).json({ error: 'Failed to fetch squares' });
  }
});

async function assignSquareNumbers(poolId) {
  const rows = fisherYatesShuffle([0,1,2,3,4,5,6,7,8,9]);
  const cols = fisherYatesShuffle([0,1,2,3,4,5,6,7,8,9]);
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 10; c++) {
      await db.run('UPDATE horses_squares SET row_digit = ?, col_digit = ? WHERE pool_id = ? AND row_num = ? AND col_num = ?',
        [rows[r], cols[c], poolId, r, c]);
    }
  }
}

router.post('/pools/:id/squares/assign', async (req, res) => {
  try {
    const pool = await db.get('SELECT * FROM horses_pools WHERE id = ?', [req.params.id]);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });
    if (pool.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    if (pool.format_type !== 'squares') return res.status(400).json({ error: 'Not a squares pool' });

    await assignSquareNumbers(pool.id);
    if (pool.status === 'open') {
      await db.run("UPDATE horses_pools SET status = 'locked' WHERE id = ?", [pool.id]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[horses] POST /pools/:id/squares/assign error:', err.message);
    res.status(500).json({ error: 'Failed to assign numbers' });
  }
});

// ── Results & Payouts ─────────────────────────────────────────────────────────

router.post('/pools/:id/results', async (req, res) => {
  try {
    const pool = await db.get('SELECT * FROM horses_pools WHERE id = ?', [req.params.id]);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });
    if (pool.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });
    if (pool.payouts_finalized_at) return res.status(400).json({ error: 'Payouts already finalized. Contact admin to modify results.' });

    const { results } = req.body; // [{finish_position, horse_id, post_position}, ...]
    if (!results || !results.length) return res.status(400).json({ error: 'Results are required' });

    const minResults = pool.format_type === 'squares' ? 4 : 3;
    if (results.length < minResults) return res.status(400).json({ error: `At least ${minResults} finish positions required` });

    // Validate horses exist in event
    for (const r of results) {
      const horse = await db.get('SELECT id FROM horses_horses WHERE id = ? AND event_id = ?', [r.horse_id, pool.event_id]);
      if (!horse) return res.status(400).json({ error: `Horse ${r.horse_id} not in this event` });
    }

    // Upsert: delete existing results for this pool + insert new
    await db.run('DELETE FROM horses_results WHERE pool_id = ?', [pool.id]);
    for (const r of results) {
      await db.run(
        'INSERT INTO horses_results (id, pool_id, finish_position, horse_id, post_position) VALUES (?, ?, ?, ?, ?)',
        [uuidv4(), pool.id, r.finish_position, r.horse_id, r.post_position || null]
      );
    }

    if (pool.status === 'locked') {
      await db.run("UPDATE horses_pools SET status = 'results_entered' WHERE id = ?", [pool.id]);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[horses] POST /pools/:id/results error:', err.message);
    res.status(500).json({ error: 'Failed to save results' });
  }
});

router.get('/pools/:id/results', async (req, res) => {
  try {
    const pool = await db.get('SELECT * FROM horses_pools WHERE id = ?', [req.params.id]);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });

    const entry = await db.get('SELECT id FROM horses_entries WHERE pool_id = ? AND user_id = ?', [pool.id, req.user.id]);
    if (!entry) return res.status(403).json({ error: 'Not a member' });

    const results = await db.all(`
      SELECT r.finish_position, r.horse_id, r.post_position,
             h.horse_name, h.jockey_name, h.morning_line_odds
      FROM horses_results r
      JOIN horses_horses h ON r.horse_id = h.id
      WHERE r.pool_id = ?
      ORDER BY r.finish_position ASC
    `, [pool.id]);

    res.json({ results });
  } catch (err) {
    console.error('[horses] GET /pools/:id/results error:', err.message);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

router.post('/pools/:id/payouts/trigger', async (req, res) => {
  try {
    const pool = await db.get('SELECT * FROM horses_pools WHERE id = ?', [req.params.id]);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });
    if (pool.commissioner_id !== req.user.id) return res.status(403).json({ error: 'Commissioner only' });

    // Idempotency: already finalized → return existing payouts
    if (pool.payouts_finalized_at) {
      const existing = await db.all('SELECT * FROM horses_payouts WHERE pool_id = ?', [pool.id]);
      return res.json({ payouts: existing, already_finalized: true });
    }

    // Check results exist
    const results = await db.all('SELECT * FROM horses_results WHERE pool_id = ? ORDER BY finish_position', [pool.id]);
    if (!results.length) return res.status(400).json({ error: 'Enter results before triggering payouts' });

    // Get entries and calculate pool
    const entries = await db.all('SELECT * FROM horses_entries WHERE pool_id = ?', [pool.id]);
    const paidEntries = entries.filter(e => e.is_paid && e.refund_status !== 'scratched_refund');

    const payoutStructure = typeof pool.payout_structure === 'string' ? JSON.parse(pool.payout_structure) : pool.payout_structure;

    let grossPool;
    if (pool.format_type === 'squares') {
      const claimedCount = await db.get('SELECT COUNT(*) as cnt FROM horses_squares WHERE pool_id = ? AND entry_id IS NOT NULL', [pool.id]);
      grossPool = (claimedCount?.cnt || 0) * Number(pool.entry_fee);
    } else {
      grossPool = paidEntries.length * Number(pool.entry_fee);
    }

    const adminFee = pool.admin_fee_type === 'flat'
      ? Number(pool.admin_fee_value || 0)
      : (Number(pool.admin_fee_value || 0) / 100) * grossPool;
    const netPool = grossPool - adminFee;

    // Calculate payouts per format
    const payouts = [];

    for (const pos of payoutStructure) {
      const amount = netPool * (pos.pct / 100);
      let winners = [];

      if (pool.format_type === 'random_draw') {
        const resultHorse = results.find(r => r.finish_position === pos.place);
        if (resultHorse) {
          winners = paidEntries.filter(e => e.assigned_horse_id === resultHorse.horse_id);
        }
      } else if (pool.format_type === 'pick_wps') {
        // Score all entries
        const scoringConfig = typeof pool.scoring_config === 'string' ? JSON.parse(pool.scoring_config) : pool.scoring_config;
        const topN = {};
        results.forEach(r => { topN[r.horse_id] = r.finish_position; });

        const scores = [];
        for (const e of paidEntries) {
          const picks = await db.all('SELECT * FROM horses_picks WHERE entry_id = ?', [e.id]);
          let total = 0;
          for (const p of picks) {
            const fp = topN[p.horse_id];
            if (p.slot === 'win' && fp === 1) total += (scoringConfig.win || 5);
            if (p.slot === 'place' && fp && fp <= 2) total += (scoringConfig.place || 3);
            if (p.slot === 'show' && fp && fp <= 3) total += (scoringConfig.show || 2);
            await db.run('UPDATE horses_picks SET points_earned = ? WHERE id = ?',
              [p.slot === 'win' && fp === 1 ? scoringConfig.win || 5 : p.slot === 'place' && fp && fp <= 2 ? scoringConfig.place || 3 : p.slot === 'show' && fp && fp <= 3 ? scoringConfig.show || 2 : 0, p.id]);
          }
          scores.push({ entry: e, total });
        }
        scores.sort((a, b) => b.total - a.total);

        // Find entries at this payout position
        if (pos.place <= scores.length) {
          const targetScore = scores[pos.place - 1].total;
          winners = scores.filter(s => s.total === targetScore).map(s => s.entry);
        }
      } else if (pool.format_type === 'squares') {
        // Winning square lookup
        const r1 = results.find(r => r.finish_position === pos.place);
        const r2 = results.find(r => r.finish_position === pos.place + 1);
        if (r1 && r2 && r1.post_position != null && r2.post_position != null) {
          const rowDigit = r1.post_position % 10;
          const colDigit = r2.post_position % 10;
          const winningSq = await db.get(
            'SELECT * FROM horses_squares WHERE pool_id = ? AND row_digit = ? AND col_digit = ?',
            [pool.id, rowDigit, colDigit]
          );
          if (winningSq && winningSq.entry_id) {
            winners = [paidEntries.find(e => e.id === winningSq.entry_id)].filter(Boolean);
          }
          // Rolldown: if unclaimed, try next position (simplified — skip for now)
        }
      }

      if (winners.length > 0) {
        const perWinner = amount / winners.length;
        for (const w of winners) {
          payouts.push({
            id: uuidv4(), pool_id: pool.id, entry_id: w.id,
            payout_type: pos.place === 1 ? 'win' : pos.place === 2 ? 'place' : 'show',
            amount: Math.round(perWinner * 100) / 100,
            is_split: winners.length > 1,
            split_count: winners.length,
          });
        }
      }
    }

    // Transactional write: insert all payouts + finalize
    const idemKey = uuidv4();
    for (const p of payouts) {
      await db.run(
        'INSERT INTO horses_payouts (id, pool_id, entry_id, payout_type, amount, is_split, split_count) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [p.id, p.pool_id, p.entry_id, p.payout_type, p.amount, p.is_split, p.split_count]
      );
    }
    await db.run(
      "UPDATE horses_pools SET payouts_finalized_at = NOW(), payouts_finalized_by = ?, payout_idempotency_key = ?, status = 'finalized' WHERE id = ?",
      [req.user.id, idemKey, pool.id]
    );

    res.json({ payouts, grossPool, adminFee, netPool });
  } catch (err) {
    console.error('[horses] POST /pools/:id/payouts/trigger error:', err.message);
    res.status(500).json({ error: 'Failed to calculate payouts' });
  }
});

router.get('/pools/:id/payouts', async (req, res) => {
  try {
    const pool = await db.get('SELECT * FROM horses_pools WHERE id = ?', [req.params.id]);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });

    const entry = await db.get('SELECT id FROM horses_entries WHERE pool_id = ? AND user_id = ?', [pool.id, req.user.id]);
    if (!entry) return res.status(403).json({ error: 'Not a member' });

    const payouts = await db.all(`
      SELECT p.*, e.display_name
      FROM horses_payouts p
      JOIN horses_entries e ON p.entry_id = e.id
      WHERE p.pool_id = ?
      ORDER BY p.amount DESC
    `, [pool.id]);

    res.json({
      payouts,
      finalized: !!pool.payouts_finalized_at,
      venmo: pool.venmo, paypal: pool.paypal, zelle: pool.zelle,
    });
  } catch (err) {
    console.error('[horses] GET /pools/:id/payouts error:', err.message);
    res.status(500).json({ error: 'Failed to fetch payouts' });
  }
});

module.exports = router;
module.exports.executeRandomDraw = executeRandomDraw;
module.exports.assignSquareNumbers = assignSquareNumbers;
