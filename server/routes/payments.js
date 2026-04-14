'use strict';

const express  = require('express');
const crypto   = require('crypto');
const db       = require('../db/index');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const ENTRY_FEE       = 5.00;
const SMART_DRAFT_FEE = 2.99;

// ── Promo codes ───────────────────────────────────────────────────────────────
const PROMO_CODES = {
  FOUNDINGMEMBER: {
    discountPct:    100,
    appliesToEntry: true,
    message:        'Promo applied — $5 fee waived!',
  },
};

// ── Square client factory ─────────────────────────────────────────────────────
function getSquare() {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  if (!accessToken) throw new Error('SQUARE_ACCESS_TOKEN not set');
  const { SquareClient, SquareEnvironment } = require('square');
  return new SquareClient({ token: accessToken, environment: SquareEnvironment.Production });
}

// ── Webhook signature verification ───────────────────────────────────────────
// Square computes: base64(HMAC-SHA256(signatureKey, notificationUrl + rawBody))
function verifySquareWebhook(rawBody, signatureHeader, signatureKey, notificationUrl) {
  try {
    const payload  = notificationUrl + rawBody;
    const expected = crypto
      .createHmac('sha256', signatureKey)
      .update(payload, 'utf8')
      .digest('base64');
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signatureHeader || '')
    );
  } catch {
    return false;
  }
}

// ── Derive base URL from request ──────────────────────────────────────────────
function getClientUrl(req) {
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

// ── Helper: create a Square Payment Link ──────────────────────────────────────
// Returns { url, orderId }
async function createPaymentLink({ lineItems, metadata, redirectUrl, buyerEmail, referenceId }) {
  const squareClient = getSquare();
  const response = await squareClient.checkout.paymentLinks.create({
    idempotencyKey: require('uuid').v4(),
    order: {
      locationId: process.env.SQUARE_LOCATION_ID,
      referenceId,
      lineItems: lineItems.map(item => ({
        name:     item.name,
        quantity: '1',
        basePriceMoney: {
          amount:   BigInt(Math.round(item.amount * 100)),
          currency: 'USD',
        },
        ...(item.note && { note: item.note }),
      })),
      metadata: Object.fromEntries(
        Object.entries(metadata)
          .filter(([, v]) => v !== undefined && v !== null)
          .map(([k, v]) => [k, String(v)])
      ),
    },
    checkoutOptions: {
      redirectUrl,
      askForShippingAddress: false,
    },
    ...(buyerEmail && {
      prePopulatedData: { buyerEmail },
    }),
  });
  return {
    url:     response.paymentLink.url,
    orderId: response.paymentLink.orderId,
  };
}

// ---------------------------------------------------------------------------
// POST /api/payments/validate-promo
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
// ---------------------------------------------------------------------------
router.post('/entry-checkout', authMiddleware, async (req, res) => {
  try {
    const { leagueId, includeSmartDraft, promoCode } = req.body;
    if (!leagueId) return res.status(400).json({ error: 'leagueId is required' });

    const league = await db.get('SELECT * FROM leagues WHERE id = ?', leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const payment = await db.get(
      'SELECT * FROM member_payments WHERE league_id = ? AND user_id = ?',
      leagueId, req.user.id
    );

    if (!payment) {
      return res.status(404).json({ error: 'No pending payment found. Join the league first.' });
    }
    if (payment.status === 'paid') {
      return res.status(409).json({ error: 'Already paid for this league' });
    }

    // ── Evaluate promo ───────────────────────────────────────────────────────
    let entryFeeAmount = ENTRY_FEE;
    let promoApplied   = false;
    if (promoCode) {
      const promo = PROMO_CODES[promoCode.toUpperCase().trim()];
      if (promo && promo.appliesToEntry) {
        entryFeeAmount = ENTRY_FEE * (1 - promo.discountPct / 100);
        promoApplied   = true;
        console.log(`[checkout] promo "${promoCode}" applied — entry fee: $${entryFeeAmount}`);
      }
    }

    const { v4: uuidv4 } = require('uuid');
    const clientUrl = getClientUrl(req);

    // ── Entry fee fully waived by promo ──────────────────────────────────────
    if (entryFeeAmount === 0) {
      await db.run(`
        UPDATE member_payments
        SET status = 'paid', paid_at = CURRENT_TIMESTAMP, amount = 0, stripe_session_id = 'promo_waived'
        WHERE league_id = ? AND user_id = ?
      `, leagueId, req.user.id);
      console.log(`[checkout] entry fee waived for user=${req.user.id} league=${leagueId}`);

      if (!includeSmartDraft) {
        return res.json({ free: true, message: 'Access fee waived — welcome, Founding Member! 🎉' });
      }

      // Smart Draft still needs to be charged — create a $2.99 link
      const orderId = uuidv4();
      const { url, orderId: squareOrderId } = await createPaymentLink({
        referenceId: orderId,
        lineItems:   [{ name: `Smart Draft Upgrade ⚡ – ${league.name}`, amount: SMART_DRAFT_FEE }],
        metadata:    { type: 'smart_draft', league_id: leagueId, user_id: req.user.id },
        redirectUrl: `${clientUrl}/league/${leagueId}?payment=success`,
      });

      await db.run(`
        INSERT INTO smart_draft_upgrades (id, user_id, league_id, stripe_session_id, status)
        VALUES (?, ?, ?, ?, 'pending')
        ON CONFLICT(user_id, league_id) DO UPDATE SET stripe_session_id = excluded.stripe_session_id, status = 'pending'
      `, uuidv4(), req.user.id, leagueId, squareOrderId);

      return res.json({ url });
    }

    // ── Standard checkout ────────────────────────────────────────────────────
    const refId     = uuidv4();
    const lineItems = [{
      name:   `TourneyRun League Access – ${league.name}`,
      amount: entryFeeAmount,
    }];

    if (includeSmartDraft) {
      lineItems.push({ name: `Smart Draft Upgrade ⚡ – ${league.name}`, amount: SMART_DRAFT_FEE });
    }

    const metadata = {
      type:                 'entry_fee',
      league_id:            leagueId,
      user_id:              req.user.id,
      includes_smart_draft: includeSmartDraft ? '1' : '0',
    };

    const { url, orderId: squareOrderId } = await createPaymentLink({
      referenceId: refId,
      lineItems,
      metadata,
      redirectUrl: `${clientUrl}/league/${leagueId}?payment=success`,
    });

    console.log(`[checkout] Square link created — smart_draft=${!!includeSmartDraft}`);

    const totalAmount = entryFeeAmount + (includeSmartDraft ? SMART_DRAFT_FEE : 0);
    await db.run(
      'UPDATE member_payments SET stripe_session_id = ?, amount = ? WHERE league_id = ? AND user_id = ?',
      squareOrderId, totalAmount, leagueId, req.user.id
    );

    if (includeSmartDraft) {
      await db.run(`
        INSERT INTO smart_draft_upgrades (id, user_id, league_id, stripe_session_id, status)
        VALUES (?, ?, ?, ?, 'pending')
        ON CONFLICT(user_id, league_id) DO UPDATE SET stripe_session_id = excluded.stripe_session_id, status = 'pending'
      `, uuidv4(), req.user.id, leagueId, squareOrderId);
    }

    res.json({ url });
  } catch (err) {
    console.error('entry-checkout error:', err);
    res.status(500).json({ error: 'Payment error: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/payments/smart-draft-checkout
// ---------------------------------------------------------------------------
router.post('/smart-draft-checkout', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.body;
    if (!leagueId) return res.status(400).json({ error: 'leagueId is required' });

    const league = await db.get('SELECT * FROM leagues WHERE id = ?', leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const existing = await db.get(
      "SELECT * FROM smart_draft_upgrades WHERE user_id = ? AND league_id = ? AND status = 'active'",
      req.user.id, leagueId
    );
    if (existing) return res.status(409).json({ error: 'Smart Draft already active for this league' });

    const { v4: uuidv4 } = require('uuid');
    const clientUrl = getClientUrl(req);
    const refId     = uuidv4();

    const { url, orderId: squareOrderId } = await createPaymentLink({
      referenceId: refId,
      lineItems:   [{ name: `TourneyRun Smart Draft — ${league.name}`, amount: SMART_DRAFT_FEE }],
      metadata:    { type: 'smart_draft', league_id: leagueId, user_id: req.user.id },
      redirectUrl: `${clientUrl}/league/${leagueId}?smartdraft=success`,
    });

    await db.run(`
      INSERT INTO smart_draft_upgrades (id, user_id, league_id, stripe_session_id, status)
      VALUES (?, ?, ?, ?, 'pending')
      ON CONFLICT(user_id, league_id) DO UPDATE SET stripe_session_id = excluded.stripe_session_id, status = 'pending'
    `, uuidv4(), req.user.id, leagueId, squareOrderId);

    res.json({ url });
  } catch (err) {
    console.error('smart-draft-checkout error:', err);
    res.status(500).json({ error: 'Payment error: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/payments/smart-draft/:leagueId/status
// ---------------------------------------------------------------------------
router.get('/smart-draft/:leagueId/status', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const myRecord = await db.get(
      "SELECT status, enabled FROM smart_draft_upgrades WHERE user_id = ? AND league_id = ?",
      req.user.id, leagueId
    );

    const activeRows = await db.all(
      "SELECT user_id FROM smart_draft_upgrades WHERE league_id = ? AND status = 'active' AND enabled != 0",
      leagueId
    );
    const activeUsers = activeRows.map(r => r.user_id);

    const purchased = myRecord?.status === 'active';
    const enabled   = purchased && myRecord?.enabled !== 0;

    res.json({ purchased, enabled, purchasedUsers: activeUsers });
  } catch (err) {
    console.error('smart-draft status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/payments/smart-draft/:leagueId/toggle
// ---------------------------------------------------------------------------
router.patch('/smart-draft/:leagueId/toggle', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const record = await db.get(
      "SELECT id, enabled FROM smart_draft_upgrades WHERE user_id = ? AND league_id = ? AND status = 'active'",
      req.user.id, leagueId
    );
    if (!record) return res.status(404).json({ error: 'Smart Draft not purchased' });
    const newEnabled = record.enabled === 0 ? 1 : 0;
    await db.run("UPDATE smart_draft_upgrades SET enabled = ? WHERE id = ?", newEnabled, record.id);
    res.json({ enabled: newEnabled === 1 });
  } catch (err) {
    console.error('smart-draft toggle error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/payments/smart-draft-standalone
// Public — no login required.
// Pre-generates an orderId, puts it in the redirect URL, stores a pending
// credit row so the user can claim it after registering/logging in.
// ---------------------------------------------------------------------------
router.post('/smart-draft-standalone', async (req, res) => {
  try {
    const { v4: uuidv4 } = require('uuid');
    const clientUrl = getClientUrl(req);
    // Use the orderId as both the Square referenceId AND the token in the URL
    const orderId   = uuidv4();

    const { url, orderId: squareOrderId } = await createPaymentLink({
      referenceId: orderId,
      lineItems:   [{ name: 'TourneyRun Smart Draft Upgrade ⚡', amount: SMART_DRAFT_FEE }],
      metadata:    { type: 'smart_draft_credit' },
      // Include orderId in the redirect so the client can pass it to /claim-credit
      redirectUrl: `${clientUrl}/register?smartdraft_session=${orderId}`,
    });

    // Pre-create pending credit row keyed by our orderId
    await db.run(`
      INSERT OR IGNORE INTO smart_draft_credits (id, stripe_session_id, status)
      VALUES (?, ?, 'pending')
    `, uuidv4(), squareOrderId);

    // Also index by our referenceId in case webhook arrives before claim
    await db.run(`
      INSERT OR IGNORE INTO smart_draft_credits (id, stripe_session_id, status)
      VALUES (?, ?, 'pending')
    `, uuidv4(), orderId);

    res.json({ url });
  } catch (err) {
    console.error('smart-draft-standalone error:', err);
    res.status(500).json({ error: 'Payment error: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/payments/claim-credit
// Auth required. Verifies payment via Square Orders API and associates
// the smart draft credit with the logged-in user.
// Accepts session_id = our pre-generated orderId OR the Square order_id.
// ---------------------------------------------------------------------------
router.post('/claim-credit', authMiddleware, async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id is required' });

    // Look up by our referenceId first, then by Square orderId
    let credit = await db.get(
      "SELECT * FROM smart_draft_credits WHERE stripe_session_id = ?",
      session_id
    );

    if (!credit) {
      return res.status(404).json({ error: 'Credit not found. Payment may still be processing.' });
    }
    if (credit.status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed yet.' });
    }

    const { v4: uuidv4 } = require('uuid');
    await db.run(`
      INSERT INTO smart_draft_credits (id, stripe_session_id, user_id, status, purchased_at)
      VALUES (?, ?, ?, 'paid', CURRENT_TIMESTAMP)
      ON CONFLICT(stripe_session_id) DO UPDATE
        SET user_id      = COALESCE(user_id, excluded.user_id),
            status       = 'paid',
            purchased_at = COALESCE(purchased_at, CURRENT_TIMESTAMP)
    `, uuidv4(), session_id, req.user.id);

    console.log(`[smart-draft-credit] claimed by user=${req.user.id} session=${session_id}`);
    res.json({ success: true });
  } catch (err) {
    console.error('claim-credit error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/payments/smart-draft-credits
// ---------------------------------------------------------------------------
router.get('/smart-draft-credits', authMiddleware, async (req, res) => {
  try {
    const credits = await db.get(`
      SELECT COUNT(*) as count FROM smart_draft_credits
      WHERE user_id = ? AND status = 'paid'
    `, req.user.id);
    res.json({ credits: credits.count });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/payments/webhook
// Square webhook — raw body required (configured in index.js).
// Square sends payment.updated events; we only act when payment.status === 'COMPLETED'.
// ---------------------------------------------------------------------------
router.post('/webhook', async (req, res) => {
  const signatureHeader = req.headers['x-square-hmacsha256-signature'];
  const signatureKey    = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = process.env.SQUARE_WEBHOOK_URL ||
    (() => {
      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      return `${proto}://${req.get('host')}/api/payments/webhook`;
    })();

  const rawBody = req.body.toString('utf8');

  if (signatureKey) {
    if (!verifySquareWebhook(rawBody, signatureHeader, signatureKey, notificationUrl)) {
      console.error('[square-webhook] Signature verification failed');
      return res.status(400).send('Webhook signature mismatch');
    }
  } else {
    // SECURITY: fail closed — do NOT process webhooks without signature verification
    console.error('[square-webhook] CRITICAL: No signature key set — rejecting webhook');
    return res.status(500).send('Webhook verification not configured');
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  console.log(`[square-webhook] event=${event.type}`);

  if (event.type === 'payment.updated') {
    const payment = event.data?.object?.payment;
    if (!payment?.order_id) {
      console.warn('[square-webhook] No order_id on payment event');
      return res.json({ received: true });
    }
    // Only fulfill when Square has fully captured the payment
    if (payment.status !== 'COMPLETED') {
      console.log(`[square-webhook] Ignoring payment.updated with status=${payment.status}`);
      return res.json({ received: true });
    }

    try {
      // Retrieve the full order to get metadata
      const squareClient = getSquare();
      const orderResponse = await squareClient.orders.get({ orderId: payment.order_id });
      const order    = orderResponse.order;
      const metadata = order.metadata || {};

      console.log(`[square-webhook] order=${payment.order_id} type=${metadata.type}`);

      // ── Standalone Smart Draft credit ────────────────────────────────────
      if (metadata.type === 'smart_draft_credit') {
        const { v4: uuidv4 } = require('uuid');
        // Mark paid by Square orderId and referenceId
        const markPaidSQL = `
          INSERT INTO smart_draft_credits (id, stripe_session_id, status, purchased_at)
          VALUES (?, ?, 'paid', CURRENT_TIMESTAMP)
          ON CONFLICT(stripe_session_id) DO UPDATE
            SET status = 'paid', purchased_at = COALESCE(purchased_at, CURRENT_TIMESTAMP)
        `;
        await db.run(markPaidSQL, uuidv4(), payment.order_id);
        if (order.referenceId && order.referenceId !== payment.order_id) {
          await db.run(markPaidSQL, uuidv4(), order.referenceId);
        }
        console.log(`[square-webhook] Smart Draft credit paid: order=${payment.order_id}`);

      // ── Smart Draft purchase ─────────────────────────────────────────────
      } else if (metadata.type === 'smart_draft') {
        await db.run(`
          UPDATE smart_draft_upgrades
          SET status = 'active', purchased_at = CURRENT_TIMESTAMP
          WHERE stripe_session_id = ?
        `, payment.order_id);
        console.log(`[square-webhook] Smart Draft activated: league=${metadata.league_id} user=${metadata.user_id}`);

      // ── Golf payment (season pass / pool entry / comm pro) ───────────────
      } else if (metadata.type?.startsWith('golf_')) {
        try {
          await require('./golf-payments').handleGolfWebhook({ order_id: payment.order_id, metadata });
        } catch (golfErr) {
          console.error('[square-webhook] golf handler error:', golfErr.message);
        }

      // ── League entry fee ─────────────────────────────────────────────────
      } else if (metadata.type === 'entry_fee') {
        const memberPayment = await db.get(
          'SELECT * FROM member_payments WHERE stripe_session_id = ?',
          payment.order_id
        );

        if (memberPayment) {
          await db.run(`
            UPDATE member_payments
            SET status = 'paid', paid_at = CURRENT_TIMESTAMP, stripe_payment_intent_id = ?
            WHERE stripe_session_id = ?
          `, payment.id, payment.order_id);

          console.log(`[square-webhook] League access paid: league=${memberPayment.league_id} user=${memberPayment.user_id}`);

          if (metadata.includes_smart_draft === '1') {
            await db.run(`
              UPDATE smart_draft_upgrades
              SET status = 'active', purchased_at = CURRENT_TIMESTAMP
              WHERE stripe_session_id = ?
            `, payment.order_id);
            console.log(`[square-webhook] Smart Draft activated (bundled): league=${memberPayment.league_id}`);
          }

          // Auto-start draft if applicable
          try {
            const { performStartDraft } = require('../draftUtils');
            const league = await db.get('SELECT * FROM leagues WHERE id = ?', memberPayment.league_id);
            if (league && league.status === 'lobby' && league.auto_start_on_full) {
              const memberCount = await db.get(
                'SELECT COUNT(*) as cnt FROM league_members WHERE league_id = ?',
                memberPayment.league_id
              );
              const paidCount = await db.get(
                "SELECT COUNT(*) as cnt FROM member_payments WHERE league_id = ? AND status = 'paid'",
                memberPayment.league_id
              );
              if (memberCount.cnt >= 2 && paidCount.cnt >= memberCount.cnt) {
                const result = await performStartDraft(memberPayment.league_id, null);
                if (result.success) {
                  console.log(`[square-webhook] Auto-started draft for league ${memberPayment.league_id}`);
                }
              }
            }
          } catch (autoErr) {
            console.error('[square-webhook] auto-start error:', autoErr);
          }
        } else {
          console.warn('[square-webhook] No member_payment found for order', payment.order_id);
        }
      }
    } catch (err) {
      console.error('[square-webhook] handler error:', err);
    }
  }

  res.json({ received: true });
});

// ---------------------------------------------------------------------------
// GET /api/payments/league/:leagueId/status
// ---------------------------------------------------------------------------
router.get('/league/:leagueId/status', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;

    const league = await db.get('SELECT * FROM leagues WHERE id = ?', leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });

    const payments = await db.all(`
      SELECT mp.user_id, u.username, mp.status, mp.amount, mp.paid_at
      FROM member_payments mp
      JOIN users u ON mp.user_id = u.id
      WHERE mp.league_id = ?
      ORDER BY mp.paid_at DESC, u.username ASC
    `, leagueId);

    const paidCount = payments.filter(p => p.status === 'paid').length;

    res.json({
      payments,
      paid_count:  paidCount,
      total_count: payments.length,
      entry_fee:   ENTRY_FEE,
    });
  } catch (err) {
    console.error('payment status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
