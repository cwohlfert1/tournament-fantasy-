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
  // TODO: section-03
  res.status(501).json({ error: 'Not implemented' });
});

router.post('/events', async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  // TODO: section-03
  res.status(501).json({ error: 'Not implemented' });
});

router.put('/events/:id', async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  // TODO: section-03
  res.status(501).json({ error: 'Not implemented' });
});

// ── Horse routes ──────────────────────────────────────────────────────────────

router.get('/events/:id/horses', async (req, res) => {
  // TODO: section-03
  res.status(501).json({ error: 'Not implemented' });
});

router.post('/events/:id/horses', async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  // TODO: section-03
  res.status(501).json({ error: 'Not implemented' });
});

router.put('/horses/:id', async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  // TODO: section-03
  res.status(501).json({ error: 'Not implemented' });
});

router.delete('/horses/:id', async (req, res) => {
  if (req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  // TODO: section-03
  res.status(501).json({ error: 'Not implemented' });
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
