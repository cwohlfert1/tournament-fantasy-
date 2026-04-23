'use strict';

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const db = require('../db/index');

router.use(authMiddleware);

// Reuse Square client factory from golf-payments
function getSquare() {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  if (!accessToken) throw new Error('SQUARE_ACCESS_TOKEN not set');
  const { SquareClient, SquareEnvironment } = require('square');
  return new SquareClient({ token: accessToken, environment: SquareEnvironment.Production });
}

// Create Square checkout link for pool entry fee (section 06)
router.post('/payments/entry', async (req, res) => {
  // TODO: section-06
  res.status(501).json({ error: 'Not implemented' });
});

// Create Square checkout link for squares batch claim (section 09)
router.post('/payments/squares', async (req, res) => {
  // TODO: section-09
  res.status(501).json({ error: 'Not implemented' });
});

module.exports = router;
