const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const ENTRY_FEE = 5.00; // Flat $5 platform fee per league

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY environment variable is not set');
  return require('stripe')(key);
}

// Derive the base URL from the request if CLIENT_URL env var isn't set.
// This ensures Stripe redirects back to the correct domain in production
// even if CLIENT_URL is missing from Railway env vars.
function getClientUrl(req) {
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

// ---------------------------------------------------------------------------
// POST /api/payments/entry-checkout
// Create a Stripe Checkout session for the $5 league access fee.
// ---------------------------------------------------------------------------
router.post('/entry-checkout', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.body;
    if (!leagueId) return res.status(400).json({ error: 'leagueId is required' });

    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const payment = db.prepare(
      'SELECT * FROM member_payments WHERE league_id = ? AND user_id = ?'
    ).get(leagueId, req.user.id);

    if (!payment) {
      return res.status(404).json({ error: 'No pending payment found. Join the league first.' });
    }
    if (payment.status === 'paid') {
      return res.status(409).json({ error: 'Already paid for this league' });
    }

    const clientUrl = getClientUrl(req);
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `TourneyRun League Access – ${league.name}` },
          unit_amount: Math.round(ENTRY_FEE * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${clientUrl}/league/${leagueId}?payment=success`,
      cancel_url: `${clientUrl}/league/${leagueId}?payment=cancelled`,
      metadata: { league_id: leagueId, user_id: req.user.id },
    });
    console.log(`[checkout] session created — redirect base: ${clientUrl}`);

    db.prepare(
      'UPDATE member_payments SET stripe_session_id = ? WHERE league_id = ? AND user_id = ?'
    ).run(session.id, leagueId, req.user.id);

    res.json({ url: session.url });
  } catch (err) {
    console.error('entry-checkout error:', err);
    res.status(500).json({ error: 'Stripe error: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/payments/webhook
// Stripe webhook — raw body required (configured in index.js).
// ---------------------------------------------------------------------------
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      const payment = db.prepare(
        'SELECT * FROM member_payments WHERE stripe_session_id = ?'
      ).get(session.id);

      if (payment) {
        db.prepare(`
          UPDATE member_payments
          SET status = 'paid',
              paid_at = CURRENT_TIMESTAMP,
              stripe_payment_intent_id = ?
          WHERE stripe_session_id = ?
        `).run(session.payment_intent, session.id);

        console.log(`League access paid: league=${payment.league_id} user=${payment.user_id}`);

        // Auto-start: if the league has auto_start_on_full set and this was the last payment
        try {
          const { performStartDraft } = require('../draftUtils');
          const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(payment.league_id);
          if (league && league.status === 'lobby' && league.auto_start_on_full) {
            const memberCount = db.prepare(
              'SELECT COUNT(*) as cnt FROM league_members WHERE league_id = ?'
            ).get(payment.league_id);
            const paidCount = db.prepare(
              "SELECT COUNT(*) as cnt FROM member_payments WHERE league_id = ? AND status = 'paid'"
            ).get(payment.league_id);
            if (memberCount.cnt >= 2 && paidCount.cnt >= memberCount.cnt) {
              const result = performStartDraft(payment.league_id, req.app.get('io'));
              if (result.success) {
                console.log(`[auto-start] All paid — draft auto-started for league ${payment.league_id}`);
              }
            }
          }
        } catch (autoErr) {
          console.error('[auto-start] error in webhook:', autoErr);
        }
      } else {
        console.warn('Webhook: no member_payment found for session', session.id);
      }
    } catch (err) {
      console.error('Webhook DB error:', err);
    }
  }

  res.json({ received: true });
});

// ---------------------------------------------------------------------------
// GET /api/payments/league/:leagueId/status
// Return payment status for all members of a league.
// ---------------------------------------------------------------------------
router.get('/league/:leagueId/status', authMiddleware, (req, res) => {
  try {
    const { leagueId } = req.params;

    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const payments = db.prepare(`
      SELECT mp.user_id, u.username, mp.status, mp.amount, mp.paid_at
      FROM member_payments mp
      JOIN users u ON mp.user_id = u.id
      WHERE mp.league_id = ?
      ORDER BY mp.paid_at DESC, u.username ASC
    `).all(leagueId);

    const paidCount = payments.filter(p => p.status === 'paid').length;

    res.json({
      payments,
      paid_count: paidCount,
      total_count: payments.length,
      entry_fee: ENTRY_FEE,
    });
  } catch (err) {
    console.error('payment status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
