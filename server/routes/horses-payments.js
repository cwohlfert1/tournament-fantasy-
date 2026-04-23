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
  try {
    const { pool_id, entry_id } = req.body;
    const entry = await db.get('SELECT * FROM horses_entries WHERE id = ? AND pool_id = ?', [entry_id, pool_id]);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    if (entry.user_id !== req.user.id) return res.status(403).json({ error: 'Not your entry' });
    if (entry.is_paid) return res.json({ alreadyPaid: true });

    const pool = await db.get('SELECT * FROM horses_pools WHERE id = ?', [pool_id]);
    if (!pool) return res.status(404).json({ error: 'Pool not found' });

    // Free entry
    if (!pool.entry_fee || Number(pool.entry_fee) === 0) {
      await db.run('UPDATE horses_entries SET is_paid = true WHERE id = ?', [entry_id]);
      return res.json({ free: true });
    }

    const square = getSquare();
    const amountCents = Math.round(Number(pool.entry_fee) * 100);
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    const { result } = await square.checkout.paymentLinks.create({
      idempotencyKey: uuidv4(),
      order: {
        locationId: process.env.SQUARE_LOCATION_ID,
        lineItems: [{
          name: `Racing Pool Entry — ${pool.name}`,
          quantity: '1',
          basePriceMoney: { amount: BigInt(amountCents), currency: 'USD' }
        }],
        metadata: {
          type: 'horses_entry',
          pool_id: pool_id,
          entry_id: entry_id,
          user_id: req.user.id
        }
      },
      checkoutOptions: {
        redirectUrl: `${clientUrl}/horses/pool/${pool_id}?paid=true`
      }
    });

    res.json({ url: result.paymentLink.url });
  } catch (err) {
    console.error('[horses] POST /payments/entry error:', err.message);
    res.status(500).json({ error: 'Failed to create payment link' });
  }
});

// Create Square checkout link for squares batch claim (section 09)
router.post('/payments/squares', async (req, res) => {
  // TODO: section-09
  res.status(501).json({ error: 'Not implemented' });
});

module.exports = router;
