'use strict';

const express  = require('express');
const crypto   = require('crypto');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
require('../golf-db'); // ensure golf tables exist
const db = require('../db');

const router = express.Router();

const SEASON                 = '2026';
const REFERRAL_CREDIT_AMOUNT = 1.00;
const REFERRAL_MAX_SEASONAL  = 10.00;
const PROMO_MEMBER_THRESHOLD = 6;

const AMOUNTS = {
  office_pool: 0.99,
  season_pass: 4.99,
};

// Pool creation pricing by max-teams tier
function getPriceForMaxTeams(maxTeams) {
  if (maxTeams <= 20)  return { amount: 9.99,  label: 'Up to 20 teams' };
  if (maxTeams <= 40)  return { amount: 14.99, label: 'Up to 40 teams' };
  if (maxTeams <= 60)  return { amount: 14.99, label: 'Up to 60 teams' };
  if (maxTeams <= 100) return { amount: 24.99, label: 'Up to 100 teams' };
  return                      { amount: 34.99, label: 'Enterprise 100+' };
}

// ── Square client factory ─────────────────────────────────────────────────────
function getSquare() {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  if (!accessToken) throw new Error('SQUARE_ACCESS_TOKEN not set');
  const { SquareClient, SquareEnvironment } = require('square');
  return new SquareClient({ token: accessToken, environment: SquareEnvironment.Production });
}

// ── Webhook signature verification ───────────────────────────────────────────
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

function getClientUrl(req) {
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

// ── Create Square Payment Link ────────────────────────────────────────────────
async function createPaymentLink({ name, amount, metadata, redirectUrl, buyerEmail }) {
  const squareClient = getSquare();
  const response = await squareClient.checkout.paymentLinks.create({
    idempotencyKey: uuidv4(),
    order: {
      locationId: process.env.SQUARE_LOCATION_ID,
      referenceId: uuidv4(),
      lineItems: [{
        name,
        quantity: '1',
        basePriceMoney: {
          amount:   BigInt(Math.round(amount * 100)),
          currency: 'USD',
        },
      }],
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
    ...(buyerEmail && { prePopulatedData: { buyerEmail } }),
  });
  return {
    url:     response.paymentLink.url,
    orderId: response.paymentLink.orderId,
  };
}

// ── Referral code helpers ─────────────────────────────────────────────────────
function genReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function ensureReferralCode(userId) {
  let row = db.prepare('SELECT code FROM golf_referral_codes WHERE user_id = ?').get(userId);
  if (!row) {
    let code, attempts = 0;
    do {
      code = genReferralCode();
      attempts++;
    } while (db.prepare('SELECT 1 FROM golf_referral_codes WHERE code = ?').get(code) && attempts < 20);
    db.prepare('INSERT INTO golf_referral_codes (id, user_id, code) VALUES (?, ?, ?)').run(uuidv4(), userId, code);
    row = { code };
  }
  return row.code;
}

// ---------------------------------------------------------------------------
// GET /api/golf/referral/my-code
// ---------------------------------------------------------------------------
router.get('/referral/my-code', authMiddleware, (req, res) => {
  try {
    const code      = ensureReferralCode(req.user.id);
    const clientUrl = process.env.CLIENT_URL
      ? process.env.CLIENT_URL.replace(/\/$/, '')
      : 'https://www.tourneyrun.app';

    const credits = db.prepare(
      'SELECT balance FROM golf_referral_credits WHERE user_id = ? AND season = ?'
    ).get(req.user.id, SEASON);

    const earned = db.prepare(
      'SELECT COALESCE(SUM(credit_amount), 0) as total FROM golf_referral_redemptions WHERE referrer_id = ?'
    ).get(req.user.id);

    res.json({
      code,
      link:             `${clientUrl}/golf/join?ref=${code}`,
      creditsAvailable: credits?.balance || 0,
      creditsEarned:    earned?.total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/golf/payments/status
// ---------------------------------------------------------------------------
router.get('/payments/status', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    const seasonPass = db.prepare(
      "SELECT id FROM golf_season_passes WHERE user_id = ? AND season = ? AND paid_at IS NOT NULL"
    ).get(userId, SEASON);

    const paidTournaments = db.prepare(
      "SELECT tournament_id FROM golf_pool_entries WHERE user_id = ? AND paid_at IS NOT NULL"
    ).all(userId).map(r => r.tournament_id);

    const commProLeagues = db.prepare(
      "SELECT league_id FROM golf_comm_pro WHERE commissioner_id = ? AND season = ? AND (paid_at IS NOT NULL OR promo_applied = 1)"
    ).all(userId, SEASON);

    const credits = db.prepare(
      'SELECT balance FROM golf_referral_credits WHERE user_id = ? AND season = ?'
    ).get(userId, SEASON);

    res.json({
      hasSeasonPass:    !!seasonPass,
      paidTournaments,
      commProLeagues:   commProLeagues.map(r => r.league_id),
      referralCredits:  credits?.balance || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/golf/payments/create-checkout-session
// body: { type, leagueId?, tournamentId?, refCode? }
// ---------------------------------------------------------------------------
router.post('/payments/create-checkout-session', authMiddleware, async (req, res) => {
  try {
    const { type, leagueId, tournamentId, refCode } = req.body;
    const userId = req.user.id;

    if (!['season_pass', 'office_pool', 'comm_pro'].includes(type)) {
      return res.status(400).json({ error: 'Invalid payment type' });
    }

    // Guard: already paid?
    if (type === 'season_pass') {
      const existing = db.prepare(
        "SELECT id FROM golf_season_passes WHERE user_id = ? AND season = ? AND paid_at IS NOT NULL"
      ).get(userId, SEASON);
      if (existing) return res.json({ alreadyPaid: true });
    } else if (type === 'office_pool' && tournamentId) {
      const existing = db.prepare(
        "SELECT id FROM golf_pool_entries WHERE user_id = ? AND tournament_id = ? AND paid_at IS NOT NULL"
      ).get(userId, tournamentId);
      if (existing) return res.json({ alreadyPaid: true });
    } else if (type === 'comm_pro' && leagueId) {
      const existing = db.prepare(
        "SELECT id FROM golf_comm_pro WHERE league_id = ? AND season = ? AND (paid_at IS NOT NULL OR promo_applied = 1)"
      ).get(leagueId, SEASON);
      if (existing) return res.json({ alreadyPaid: true });
    }

    const clientUrl = getClientUrl(req);

    // Determine base price — comm_pro uses tier pricing from league's max_teams
    let baseAmount, lineItemName;
    if (type === 'comm_pro') {
      if (!leagueId) return res.status(400).json({ error: 'leagueId required for pool creation' });
      const league = db.prepare('SELECT name, max_teams FROM golf_leagues WHERE id = ?').get(leagueId);
      if (!league) return res.status(404).json({ error: 'League not found' });
      const { amount, label } = getPriceForMaxTeams(league.max_teams || 20);
      baseAmount   = amount;
      lineItemName = `TourneyRun Pool · ${label} — ${league.name}`;
    } else {
      baseAmount   = AMOUNTS[type];
      lineItemName = type === 'season_pass'
        ? 'TourneyRun Golf Season Pass — 2026'
        : tournamentId
          ? `Golf Pool Entry — ${db.prepare('SELECT name FROM golf_tournaments WHERE id = ?').get(tournamentId)?.name || 'Tournament'}`
          : 'Golf Pool Entry';
    }

    // Check referral credit balance
    const creditRow = db.prepare(
      'SELECT balance FROM golf_referral_credits WHERE user_id = ? AND season = ?'
    ).get(userId, SEASON);
    const creditBalance  = creditRow?.balance || 0;
    const creditToApply  = Math.min(creditBalance, baseAmount);
    const finalAmount    = Math.max(0, baseAmount - creditToApply);

    const metadata = {
      type:         `golf_${type}`,
      user_id:      userId,
      season:       SEASON,
      ...(leagueId      && { league_id:      leagueId      }),
      ...(tournamentId  && { tournament_id:  tournamentId  }),
      ...(refCode       && { ref_code:        refCode       }),
      ...(creditToApply > 0 && { credit_applied: String(creditToApply) }),
    };

    // If credit covers the full amount, fulfill directly without a payment
    if (finalAmount === 0) {
      await fulfillGolfPayment(metadata);
      return res.json({ free: true });
    }

    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);

    const redirectUrl = (type === 'comm_pro' && leagueId)
      ? `${clientUrl}/golf/league/${leagueId}?paid=true`
      : `${clientUrl}/golf/payment/success?type=${type}`;

    const { url, orderId: squareOrderId } = await createPaymentLink({
      name:       lineItemName + (creditToApply > 0 ? ` (−$${creditToApply.toFixed(2)} credit)` : ''),
      amount:     finalAmount,
      metadata,
      redirectUrl,
      buyerEmail:  user?.email,
    });

    res.json({ url });
  } catch (err) {
    console.error('[golf-payments] checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/golf/leagues/:id/check-migration-promo
// ---------------------------------------------------------------------------
router.post('/leagues/:id/check-migration-promo', authMiddleware, async (req, res) => {
  try {
    const leagueId = req.params.id;
    const userId   = req.user.id;

    const league = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== userId) return res.status(403).json({ error: 'Not commissioner' });

    const memberCount = db.prepare(
      'SELECT COUNT(*) as n FROM golf_league_members WHERE golf_league_id = ?'
    ).get(leagueId).n;

    const existing = db.prepare(
      "SELECT id, promo_applied FROM golf_comm_pro WHERE league_id = ? AND season = ?"
    ).get(leagueId, SEASON);

    if (existing?.promo_applied) {
      return res.json({ unlocked: true, promoApplied: true, memberCount });
    }

    const usedBefore = db.prepare('SELECT id FROM golf_migrations WHERE commissioner_id = ?').get(userId);
    const eligible   = memberCount >= PROMO_MEMBER_THRESHOLD && !usedBefore;

    if (eligible) {
      if (existing) {
        db.prepare("UPDATE golf_comm_pro SET promo_applied = 1 WHERE league_id = ? AND season = ?").run(leagueId, SEASON);
      } else {
        db.prepare(`
          INSERT INTO golf_comm_pro (id, league_id, commissioner_id, season, promo_applied)
          VALUES (?, ?, ?, ?, 1)
        `).run(uuidv4(), leagueId, userId, SEASON);
      }

      db.prepare(`
        INSERT INTO golf_migrations (id, league_id, commissioner_id, member_count_at_promo, promo_applied)
        VALUES (?, ?, ?, ?, 1)
      `).run(uuidv4(), leagueId, userId, memberCount);

      try {
        const user = db.prepare('SELECT email, username FROM users WHERE id = ?').get(userId);
        if (user) {
          await require('../mailer').sendCommProUnlocked(user.email, user.username, league.name);
        }
      } catch (e) {
        console.warn('[golf-payments] promo email failed:', e.message);
      }

      console.log(`[golf-payments] CommPro promo unlocked for league ${leagueId}`);
      return res.json({ unlocked: true, promoApplied: true, memberCount });
    }

    res.json({
      unlocked:        !!existing?.promo_applied || !!(existing?.paid_at),
      promoApplied:    false,
      memberCount,
      membersNeeded:   Math.max(0, PROMO_MEMBER_THRESHOLD - memberCount),
      alreadyUsedPromo: !!usedBefore,
    });
  } catch (err) {
    console.error('[golf-payments] check-migration-promo error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Season Pass direct checkout ───────────────────────────────────────────────
router.post('/checkout/season-pass', authMiddleware, async (req, res) => {
  const { leagueId } = req.body;
  if (!leagueId) return res.status(400).json({ error: 'leagueId required' });

  const base       = process.env.CLIENT_URL?.replace(/\/$/, '') || 'https://www.tourneyrun.app';
  const userId     = req.user.id;
  const user       = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);

  try {
    const { url, orderId: squareOrderId } = await createPaymentLink({
      name:       'TourneyRun Golf Season Pass',
      amount:     AMOUNTS.season_pass,
      metadata:   { type: 'golf_season_pass', user_id: userId, season: SEASON, league_id: leagueId },
      redirectUrl: `${base}/golf/league/${leagueId}?paid=true`,
      buyerEmail:  user?.email,
    });

    res.json({ url });
  } catch (err) {
    console.error('[golf] season-pass checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout.' });
  }
});

// ---------------------------------------------------------------------------
// handleGolfWebhook — called from the shared /api/payments/webhook handler
// and from the golf-specific webhook below.
// Accepts: { order_id, metadata } — metadata already parsed from Square order.
// ---------------------------------------------------------------------------
async function fulfillGolfPayment(metadata) {
  const type     = metadata.type;
  const orderId  = metadata._order_id || 'credit_applied';

  if (type === 'golf_season_pass') {
    db.prepare(`
      INSERT INTO golf_season_passes (id, user_id, season, paid_at, stripe_session_id)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(user_id, season) DO UPDATE SET
        paid_at = CURRENT_TIMESTAMP,
        stripe_session_id = excluded.stripe_session_id
    `).run(uuidv4(), metadata.user_id, metadata.season || SEASON, orderId);
    console.log(`[golf] season_pass fulfilled user=${metadata.user_id}`);

  } else if (type === 'golf_pool_entry' || type === 'golf_office_pool') {
    db.prepare(`
      INSERT INTO golf_pool_entries (id, user_id, tournament_id, paid_at, stripe_session_id)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(user_id, tournament_id) DO UPDATE SET
        paid_at = CURRENT_TIMESTAMP,
        stripe_session_id = excluded.stripe_session_id
    `).run(uuidv4(), metadata.user_id, metadata.tournament_id, orderId);
    console.log(`[golf] pool_entry fulfilled user=${metadata.user_id} tourn=${metadata.tournament_id}`);

  } else if (type === 'golf_comm_pro') {
    db.prepare(`
      INSERT INTO golf_comm_pro (id, league_id, commissioner_id, season, paid_at, promo_applied, stripe_session_id)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 0, ?)
      ON CONFLICT(league_id, season) DO UPDATE SET
        paid_at = CURRENT_TIMESTAMP,
        stripe_session_id = excluded.stripe_session_id
    `).run(uuidv4(), metadata.league_id, metadata.user_id, metadata.season || SEASON, orderId);
    // Activate the league (was created with pending_payment status)
    if (metadata.league_id) {
      db.prepare(`UPDATE golf_leagues SET status = 'lobby' WHERE id = ? AND status = 'pending_payment'`)
        .run(metadata.league_id);

      // Send "pool is live" confirmation email to the commissioner
      try {
        const league = db.prepare(
          'SELECT name, max_teams, pool_tournament_id FROM golf_leagues WHERE id = ?'
        ).get(metadata.league_id);
        const user = db.prepare('SELECT email, username FROM users WHERE id = ?').get(metadata.user_id);
        if (league && user) {
          const memberCount = db.prepare(
            'SELECT COUNT(*) as n FROM golf_league_members WHERE golf_league_id = ?'
          ).get(metadata.league_id).n;
          const spotsOpen = Math.max(0, (league.max_teams || 20) - memberCount);
          const tourn = league.pool_tournament_id
            ? db.prepare('SELECT name FROM golf_tournaments WHERE id = ?').get(league.pool_tournament_id)
            : null;
          await require('../mailer').sendGolfPoolLive(user.email, {
            username:       user.username,
            leagueName:     league.name,
            leagueId:       metadata.league_id,
            spotsOpen,
            tournamentName: tourn?.name || null,
          });
        }
      } catch (emailErr) {
        console.warn('[golf] pool-live email failed:', emailErr.message);
      }
    }
    console.log(`[golf] comm_pro fulfilled league=${metadata.league_id}`);
  }
}

async function handleGolfWebhook({ order_id, metadata }) {
  try {
    await fulfillGolfPayment({ ...metadata, _order_id: order_id });

    // Deduct referral credit that was applied at checkout
    if (metadata.credit_applied && metadata.user_id) {
      const creditApplied = parseFloat(metadata.credit_applied);
      if (creditApplied > 0) {
        db.prepare(`
          UPDATE golf_referral_credits
          SET balance = MAX(0, balance - ?)
          WHERE user_id = ? AND season = ?
        `).run(creditApplied, metadata.user_id, metadata.season || SEASON);
      }
    }

    // Award referral credits if a ref_code was used (first payment by this user)
    if (metadata.ref_code && metadata.user_id) {
      await applyReferralCredits(metadata.user_id, metadata.ref_code);
    }

    // Send confirmation email
    try {
      const user = db.prepare('SELECT email, username FROM users WHERE id = ?').get(metadata.user_id);
      if (user) {
        const tournName = metadata.tournament_id
          ? (db.prepare('SELECT name, is_major FROM golf_tournaments WHERE id = ?').get(metadata.tournament_id) || {})
          : {};
        await require('../mailer').sendGolfPaymentConfirmation(user.email, user.username, metadata.type, {
          ...metadata,
          tournament_name: tournName.name,
          is_major:        tournName.is_major,
        });
      }
    } catch (e) {
      console.warn('[golf-webhook] email failed:', e.message);
    }
  } catch (err) {
    console.error('[golf-webhook] handleGolfWebhook error:', err.message);
    throw err;
  }
}

async function applyReferralCredits(newUserId, refCode) {
  const alreadyRedeemed = db.prepare(
    'SELECT id FROM golf_referral_redemptions WHERE referred_id = ?'
  ).get(newUserId);
  if (alreadyRedeemed) return;

  const referrerCode = db.prepare(
    'SELECT user_id FROM golf_referral_codes WHERE code = ?'
  ).get(refCode);
  if (!referrerCode) return;

  const referrerId = referrerCode.user_id;
  if (referrerId === newUserId) return;

  const referrerCredit  = db.prepare(
    'SELECT balance FROM golf_referral_credits WHERE user_id = ? AND season = ?'
  ).get(referrerId, SEASON);
  const currentBalance = referrerCredit?.balance || 0;
  if (currentBalance >= REFERRAL_MAX_SEASONAL) return;

  const give = db.prepare(`
    INSERT INTO golf_referral_credits (id, user_id, balance, season, expires_at)
    VALUES (?, ?, ?, ?, datetime('now', '+1 year'))
    ON CONFLICT(user_id, season) DO UPDATE SET
      balance = MIN(balance + ?, ?)
  `);

  give.run(uuidv4(), referrerId, REFERRAL_CREDIT_AMOUNT, SEASON, REFERRAL_CREDIT_AMOUNT, REFERRAL_MAX_SEASONAL);
  give.run(uuidv4(), newUserId,  REFERRAL_CREDIT_AMOUNT, SEASON, REFERRAL_CREDIT_AMOUNT, REFERRAL_MAX_SEASONAL);

  db.prepare(`
    INSERT INTO golf_referral_redemptions (id, referrer_id, referred_id, credit_amount, redeemed_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(uuidv4(), referrerId, newUserId, REFERRAL_CREDIT_AMOUNT * 2);

  console.log(`[golf-payments] Referral credit: referrer=${referrerId} newUser=${newUserId}`);
}

// ---------------------------------------------------------------------------
// POST /api/golf/webhooks/stripe  → (now Square webhook, same URL kept for compatibility)
// ---------------------------------------------------------------------------
router.post('/webhooks/stripe', async (req, res) => {
  const signatureHeader = req.headers['x-square-hmacsha256-signature'];
  const signatureKey    = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || process.env.GOLF_STRIPE_WEBHOOK_SECRET;
  const notificationUrl = process.env.SQUARE_GOLF_WEBHOOK_URL || process.env.SQUARE_WEBHOOK_URL ||
    (() => {
      const proto = req.headers['x-forwarded-proto'] || req.protocol;
      return `${proto}://${req.get('host')}/api/golf/webhooks/stripe`;
    })();

  const rawBody = req.body.toString('utf8');

  if (signatureKey) {
    if (!verifySquareWebhook(rawBody, signatureHeader, signatureKey, notificationUrl)) {
      console.error('[golf-square-webhook] Signature verification failed');
      return res.status(400).send('Webhook signature mismatch');
    }
  } else {
    console.warn('[golf-square-webhook] No signature key set — skipping verification');
  }

  let event;
  try { event = JSON.parse(rawBody); } catch { return res.status(400).send('Invalid JSON'); }

  if (event.type === 'payment.updated') {
    const payment = event.data?.object?.payment;
    if (!payment?.order_id) return res.json({ received: true });
    // Only fulfill when Square has fully captured the payment
    if (payment.status !== 'COMPLETED') {
      console.log(`[golf-square-webhook] Ignoring payment.updated with status=${payment.status}`);
      return res.json({ received: true });
    }

    try {
      const squareClient = getSquare();
      const orderResponse = await squareClient.orders.get({ orderId: payment.order_id });
      const metadata = orderResponse.order?.metadata || {};
      if (metadata.type?.startsWith('golf_')) {
        await handleGolfWebhook({ order_id: payment.order_id, metadata });
      }
    } catch (err) {
      console.error('[golf-square-webhook] handler error:', err.message);
    }
  }

  res.json({ received: true });
});

// ── Waitlist ───────────────────────────────────────────────────────────────────
router.post('/waitlist', async (req, res) => {
  const { email, format = 'golf_pool' } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required.' });
  }
  try {
    db.prepare('INSERT OR IGNORE INTO golf_waitlist (email, format) VALUES (?, ?)').run(
      email.toLowerCase().trim(), format
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[golf-payments] waitlist error:', e.message);
    res.status(500).json({ error: 'Could not save. Try again.' });
  }
});

module.exports = router;
module.exports.handleGolfWebhook = handleGolfWebhook;
