const express = require('express');
const db = require('../db/index');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/news?tag=strategy&limit=40
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { tag, limit = 40 } = req.query;
    let query = 'SELECT * FROM news_articles';
    const params = [];
    if (tag) {
      query += ' WHERE feed_tag = ?';
      params.push(tag);
    }
    // When fetching all, show injuries first so urgent info surfaces immediately
    if (!tag) {
      query += " ORDER BY CASE WHEN feed_tag = 'injuries' THEN 0 ELSE 1 END, fetched_at DESC";
    } else {
      query += ' ORDER BY fetched_at DESC';
    }
    query += ' LIMIT ?';
    params.push(parseInt(limit) || 40);

    const raw = await db.all(query, ...params);

    // Filter out injury articles older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const articles = raw.filter(a => {
      if (a.feed_tag !== 'injuries') return true;
      const d = new Date(a.published_at);
      return isNaN(d) || d >= thirtyDaysAgo;
    });

    // Always include the latest injury article timestamp so the client can badge-detect
    const latestInjury = await db.get(
      "SELECT fetched_at FROM news_articles WHERE feed_tag = 'injuries' ORDER BY fetched_at DESC LIMIT 1"
    );

    res.json({ articles, latestInjuryAt: latestInjury?.fetched_at || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
