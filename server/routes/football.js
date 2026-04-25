const express = require('express');
const router = express.Router();
const db = require('../db/index');

// POST /api/football/notify — save email for NFL launch notification
router.post('/notify', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const existing = await db.get('SELECT id FROM football_notify WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing) {
      return res.json({ success: true, already: true });
    }

    await db.run(
      'INSERT INTO football_notify (id, email) VALUES (?, ?)',
      [require('uuid').v4(), email.toLowerCase().trim()]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[football] POST /notify error:', err.message);
    res.status(500).json({ error: 'Failed to save email' });
  }
});

// GET /api/football/notify/count — how many signups (superadmin only)
router.get('/notify/count', async (req, res) => {
  try {
    const result = await db.get('SELECT COUNT(*) as cnt FROM football_notify');
    res.json({ count: result?.cnt || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to count' });
  }
});

module.exports = router;
