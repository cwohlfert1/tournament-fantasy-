const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const ENTRY_FEE       = 5.00; // Flat $5 platform fee per league
const SMART_DRAFT_FEE = 2.99; // Smart Draft upgrade per user per league

// ── Promo codes (server-side only — never sent to client bundle) ─────────────
const PROMO_CODES = {
  FOUNDINGMEMBER: {
    discountPct:    100,
    appliesToEntry: true,
    message:        'Promo applied — $5 fee waived!',
  },
};

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
// POST /api/payments/validate-promo
// Validates a promo code without creating a checkout session.
// Returns { valid, message } — never reveals the code list.
// ---------------------------------------------------------------------------
router.post('/validate-promo', authMiddleware, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ valid: false, error: 'No code provided' });
  const promo = PROMO_CODES[code.toUpperCase().trim()];
  if (!promo) return res.json({ valid: false, error: 'Invalid promo code' });
  res.json({ valid: true, discountPct: promo.discountPct, message: promo.message });
});

// ---------------------------------------------------------------------------
// POST /api/payments/entry-checkout
// Create a Stripe Checkout session for the $5 league access fee.
// Accepts optional promoCode — if valid 100% discount, entry fee is waived:
//   • No Smart Draft → marks paid immediately, returns { free: true }
//   • With Smart Draft → Stripe session for $2.99 only, entry marked paid now
// ---------------------------------------------------------------------------
router.post('/entry-checkout', authMiddleware, async (req, res) => {
  try {
    const { leagueId, includeSmartDraft, promoCode } = req.body;
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

    // ── Evaluate promo code ──────────────────────────────────────────────────
    let entryFeeAmount = ENTRY_FEE;
    let promoApplied   = false;
    if (promoCode) {
      const promo = PROMO_CODES[promoCode.toUpperCase().trim()];
      if (promo && promo.appliesToEntry) {
        entryFeeAmount = ENTRY_FEE * (1 - promo.discountPct / 100);
        promoApplied   = true;
        console.log(`[checkout] promo "${promoCode.toUpperCase().trim()}" applied — entry fee: $${entryFeeAmount}`);
      }
    }

    const { v4: uuidv4 } = require('uuid');

    // ── Entry fee fully waived ───────────────────────────────────────────────
    if (entryFeeAmount === 0) {
      // Mark entry payment as paid immediately (no Stripe needed for $0)
      db.prepare(`
        UPDATE member_payments
        SET status = 'paid', paid_at = CURRENT_TIMESTAMP, amount = 0, stripe_session_id = 'promo_waived'
        WHERE league_id = ? AND user_id = ?
      `).run(leagueId, req.user.id);
      console.log(`[checkout] entry fee waived by promo for user=${req.user.id} league=${leagueId}`);

      if (!includeSmartDraft) {
        // Nothing left to charge — return free
        return res.json({ free: true, message: 'Access fee waived — welcome, Founding Member! 🎉' });
      }

      // Smart Draft still needs to be charged — create a Stripe session for $2.99 only
      const clientUrl = getClientUrl(req);
      const stripe    = getStripe();

      const sdSession = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency:     'usd',
            product_data: { name: `Smart Draft Upgrade ⚡ – ${league.name}` },
            unit_amount:  Math.round(SMART_DRAFT_FEE * 100),
          },
          quantity: 1,
        }],
        mode:        'payment',
        success_url: `${clientUrl}/league/${leagueId}?payment=success`,
        cancel_url:  `${clientUrl}/league/${leagueId}?payment=cancelled`,
        metadata:    { type: 'smart_draft', league_id: leagueId, user_id: req.user.id },
      });

      db.prepare(`
        INSERT INTO smart_draft_upgrades (id, user_id, league_id, stripe_session_id, status)
        VALUES (?, ?, ?, ?, 'pending')
        ON CONFLICT(user_id, league_id) DO UPDATE SET stripe_session_id = excluded.stripe_session_id, status = 'pending'
      `).run(uuidv4(), req.user.id, leagueId, sdSession.id);

      return res.json({ url: sdSession.url });
    }

    // ── Standard Stripe checkout (entry fee > $0) ────────────────────────────
    const clientUrl = getClientUrl(req);
    const stripe    = getStripe();

    const lineItems = [{
      price_data: {
        currency:     'usd',
        product_data: { name: `TourneyRun League Access – ${league.name}` },
        unit_amount:  Math.round(entryFeeAmount * 100),
      },
      quantity: 1,
    }];

    if (includeSmartDraft) {
      lineItems.push({
        price_data: {
          currency:     'usd',
          product_data: { name: `Smart Draft Upgrade ⚡ – ${league.name}` },
          unit_amount:  Math.round(SMART_DRAFT_FEE * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types:  ['card'],
      line_items:            lineItems,
      mode:                  'payment',
      allow_promotion_codes: true,
      success_url: `${clientUrl}/league/${leagueId}?payment=success`,
      cancel_url:  `${clientUrl}/league/${leagueId}?payment=cancelled`,
      metadata: {
        league_id:            leagueId,
        user_id:              req.user.id,
        includes_smart_draft: includeSmartDraft ? '1' : '0',
      },
    });
    console.log(`[checkout] session created — redirect base: ${clientUrl}, smart_draft=${!!includeSmartDraft}`);

    const totalAmount = entryFeeAmount + (includeSmartDraft ? SMART_DRAFT_FEE : 0);
    db.prepare(
      'UPDATE member_payments SET stripe_session_id = ?, amount = ? WHERE league_id = ? AND user_id = ?'
    ).run(session.id, totalAmount, leagueId, req.user.id);

    if (includeSmartDraft) {
      db.prepare(`
        INSERT INTO smart_draft_upgrades (id, user_id, league_id, stripe_session_id, status)
        VALUES (?, ?, ?, ?, 'pending')
        ON CONFLICT(user_id, league_id) DO UPDATE SET stripe_session_id = excluded.stripe_session_id, status = 'pending'
      `).run(uuidv4(), req.user.id, leagueId, session.id);
    }

    res.json({ url: session.url });
  } catch (err) {
    console.error('entry-checkout error:', err);
    res.status(500).json({ error: 'Stripe error: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/payments/smart-draft-checkout
// Create a Stripe Checkout session for the $2.99 Smart Draft upgrade.
// ---------------------------------------------------------------------------
router.post('/smart-draft-checkout', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.body;
    if (!leagueId) return res.status(400).json({ error: 'leagueId is required' });

    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });

    // Check if already purchased
    const existing = db.prepare(
      "SELECT * FROM smart_draft_upgrades WHERE user_id = ? AND league_id = ? AND status = 'active'"
    ).get(req.user.id, leagueId);
    if (existing) return res.status(409).json({ error: 'Smart Draft already active for this league' });

    const { v4: uuidv4 } = require('uuid');
    const clientUrl = getClientUrl(req);
    const stripe    = getStripe();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     'usd',
          product_data: { name: `TourneyRun Smart Draft — ${league.name}` },
          unit_amount:  Math.round(SMART_DRAFT_FEE * 100),
        },
        quantity: 1,
      }],
      mode:        'payment',
      success_url: `${clientUrl}/league/${leagueId}?smartdraft=success`,
      cancel_url:  `${clientUrl}/league/${leagueId}?smartdraft=cancelled`,
      metadata:    { type: 'smart_draft', league_id: leagueId, user_id: req.user.id },
    });

    // Upsert pending record
    db.prepare(`
      INSERT INTO smart_draft_upgrades (id, user_id, league_id, stripe_session_id, status)
      VALUES (?, ?, ?, ?, 'pending')
      ON CONFLICT(user_id, league_id) DO UPDATE SET stripe_session_id = excluded.stripe_session_id, status = 'pending'
    `).run(uuidv4(), req.user.id, leagueId, session.id);

    res.json({ url: session.url });
  } catch (err) {
    console.error('smart-draft-checkout error:', err);
    res.status(500).json({ error: 'Stripe error: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/payments/smart-draft/:leagueId/status
// Returns Smart Draft purchase status for the requesting user + all league members.
// ---------------------------------------------------------------------------
router.get('/smart-draft/:leagueId/status', authMiddleware, (req, res) => {
  try {
    const { leagueId } = req.params;
    const myRecord = db.prepare(
      "SELECT status FROM smart_draft_upgrades WHERE user_id = ? AND league_id = ?"
    ).get(req.user.id, leagueId);

    const allActive = db.prepare(
      "SELECT user_id FROM smart_draft_upgrades WHERE league_id = ? AND status = 'active'"
    ).all(leagueId).map(r => r.user_id);

    res.json({
      purchased:      myRecord?.status === 'active',
      purchasedUsers: allActive,
    });
  } catch (err) {
    console.error('smart-draft status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/payments/smart-draft-standalone
// Public — no login required. Creates a $2.99 Stripe Checkout for a
// standalone Smart Draft credit (not yet tied to a specific league).
// On success Stripe redirects to /register?smartdraft_session={SESSION_ID}
// so the user can register/log-in and claim the credit.
// ---------------------------------------------------------------------------
router.post('/smart-draft-standalone', async (req, res) => {
  try {
    const { v4: uuidv4 } = require('uuid');
    const clientUrl = getClientUrl(req);
    const stripe    = getStripe();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     'usd',
          product_data: { name: 'TourneyRun Smart Draft Upgrade ⚡' },
          unit_amount:  Math.round(SMART_DRAFT_FEE * 100),
        },
        quantity: 1,
      }],
      mode:        'payment',
      // {CHECKOUT_SESSION_ID} is a Stripe template variable — replaced automatically
      success_url: `${clientUrl}/register?smartdraft_session={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${clientUrl}/?smartdraft=cancelled`,
      metadata:    { type: 'smart_draft_credit' },
    });

    // Pre-create pending credit row (user_id filled in after claim)
    db.prepare(`
      INSERT OR IGNORE INTO smart_draft_credits (id, stripe_session_id, status)
      VALUES (?, ?, 'pending')
    `).run(uuidv4(), session.id);

    res.json({ url: session.url });
  } catch (err) {
    console.error('smart-draft-standalone error:', err);
    res.status(500).json({ error: 'Stripe error: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/payments/claim-credit
// Auth required. Called after register/login when ?smartdraft_session=X is
// present. Verifies the Stripe session is paid and associates the credit
// with the logged-in user.
// ---------------------------------------------------------------------------
router.post('/claim-credit', authMiddleware, async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id is required' });

    // Verify payment directly with Stripe (don't rely on webhook timing)
    const stripe  = getStripe();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed' });
    }
    if (session.metadata?.type !== 'smart_draft_credit') {
      return res.status(400).json({ error: 'Not a Smart Draft credit session' });
    }

    // Upsert the credit — either the webhook already created it or we do it now
    const { v4: uuidv4 } = require('uuid');
    db.prepare(`
      INSERT INTO smart_draft_credits (id, stripe_session_id, user_id, status, purchased_at)
      VALUES (?, ?, ?, 'paid', CURRENT_TIMESTAMP)
      ON CONFLICT(stripe_session_id) DO UPDATE
        SET user_id      = COALESCE(user_id, excluded.user_id),
            status       = 'paid',
            purchased_at = COALESCE(purchased_at, CURRENT_TIMESTAMP)
    `).run(uuidv4(), session_id, req.user.id);

    console.log(`[smart-draft-credit] claimed by user=${req.user.id} session=${session_id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('claim-credit error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/payments/smart-draft-credits
// Auth required. Returns how many unclaimed standalone credits the user has.
// ---------------------------------------------------------------------------
router.get('/smart-draft-credits', authMiddleware, (req, res) => {
  try {
    const credits = db.prepare(`
      SELECT COUNT(*) as count FROM smart_draft_credits
      WHERE user_id = ? AND status = 'paid'
    `).get(req.user.id);
    res.json({ credits: credits.count });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
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
    const session  = event.data.object;
    const metadata = session.metadata || {};
    try {
      // ── Standalone Smart Draft credit (pre-registration purchase) ────────
      if (metadata.type === 'smart_draft_credit') {
        const { v4: uuidv4 } = require('uuid');
        db.prepare(`
          INSERT INTO smart_draft_credits (id, stripe_session_id, status, purchased_at)
          VALUES (?, ?, 'paid', CURRENT_TIMESTAMP)
          ON CONFLICT(stripe_session_id) DO UPDATE
            SET status = 'paid', purchased_at = COALESCE(purchased_at, CURRENT_TIMESTAMP)
        `).run(uuidv4(), session.id);
        console.log(`[webhook] Smart Draft credit paid: session=${session.id}`);

      // ── Smart Draft purchase ──────────────────────────────────────────────
      } else if (metadata.type === 'smart_draft') {
        db.prepare(`
          UPDATE smart_draft_upgrades
          SET status = 'active', purchased_at = CURRENT_TIMESTAMP
          WHERE stripe_session_id = ?
        `).run(session.id);
        console.log(`Smart Draft activated: league=${metadata.league_id} user=${metadata.user_id}`);

      // ── League entry fee ──────────────────────────────────────────────────
      } else {
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

          // Activate Smart Draft if it was bundled in this checkout
          if (metadata.includes_smart_draft === '1') {
            db.prepare(`
              UPDATE smart_draft_upgrades
              SET status = 'active', purchased_at = CURRENT_TIMESTAMP
              WHERE stripe_session_id = ?
            `).run(session.id);
            console.log(`Smart Draft activated (bundled): league=${payment.league_id} user=${payment.user_id}`);
          }

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
