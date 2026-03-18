const express = require('express');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
require('../golf-db'); // ensure golf tables exist
const db = require('../db');

const router = express.Router();

const SEASON = '2026';
const REFERRAL_CREDIT_AMOUNT = 1.00;
const REFERRAL_MAX_SEASONAL = 10.00;
const PROMO_MEMBER_THRESHOLD = 6;

const PRICES = {
  office_pool:  process.env.GOLF_OFFICE_POOL_PRICE_ID,
  season_pass:  process.env.GOLF_SEASON_PASS_PRICE_ID,
  comm_pro:     process.env.GOLF_COMM_PRO_PRICE_ID,
};

const AMOUNTS = {
  office_pool: 0.99,
  season_pass: 4.99,
  comm_pro:    19.99,
};

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  return require('stripe')(key);
}

function getClientUrl(req) {
  if (process.env.CLIENT_URL) return process.env.CLIENT_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

// Generate a random 8-char alphanumeric referral code
function genReferralCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Ensure user has a referral code, creating one if needed
function ensureReferralCode(userId) {
  let row = db.prepare('SELECT code FROM golf_referral_codes WHERE user_id = ?').get(userId);
  if (!row) {
    let code;
    let attempts = 0;
    do {
      code = genReferralCode();
      attempts++;
    } while (db.prepare('SELECT 1 FROM golf_referral_codes WHERE code = ?').get(code) && attempts < 20);
    db.prepare(
      'INSERT INTO golf_referral_codes (id, user_id, code) VALUES (?, ?, ?)'
    ).run(uuidv4(), userId, code);
    row = { code };
  }
  return row.code;
}

// ---------------------------------------------------------------------------
// GET /api/golf/referral/my-code
// ---------------------------------------------------------------------------
router.get('/referral/my-code', authMiddleware, (req, res) => {
  try {
    const code = ensureReferralCode(req.user.id);
    const clientUrl = process.env.CLIENT_URL
      ? process.env.CLIENT_URL.replace(/\/$/, '')
      : 'https://tourneyrun.app';

    const credits = db.prepare(
      'SELECT balance FROM golf_referral_credits WHERE user_id = ? AND season = ?'
    ).get(req.user.id, SEASON);

    const earned = db.prepare(
      'SELECT COALESCE(SUM(credit_amount), 0) as total FROM golf_referral_redemptions WHERE referrer_id = ?'
    ).get(req.user.id);

    res.json({
      code,
      link: `${clientUrl}/golf?ref=${code}`,
      creditsAvailable: credits?.balance || 0,
      creditsEarned: earned?.total || 0,
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
      "SELECT league_id, promo_applied FROM golf_comm_pro WHERE commissioner_id = ? AND season = ? AND (paid_at IS NOT NULL OR promo_applied = 1)"
    ).all(userId, SEASON);

    const credits = db.prepare(
      'SELECT balance FROM golf_referral_credits WHERE user_id = ? AND season = ?'
    ).get(userId, SEASON);

    res.json({
      hasSeasonPass: !!seasonPass,
      paidTournaments,
      commProLeagues: commProLeagues.map(r => r.league_id),
      referralCredits: credits?.balance || 0,
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

    const priceId = PRICES[type];
    if (!priceId) {
      return res.status(400).json({ error: `Price ID for ${type} not configured (set env var)` });
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

    const stripe = getStripe();
    const clientUrl = getClientUrl(req);

    // Check user's referral credit balance
    const creditRow = db.prepare(
      'SELECT balance FROM golf_referral_credits WHERE user_id = ? AND season = ?'
    ).get(userId, SEASON);
    const creditBalance = creditRow?.balance || 0;
    const creditToApply = Math.min(creditBalance, AMOUNTS[type]);

    const metadata = {
      type: `golf_${type}`,
      user_id: userId,
      season: SEASON,
      ...(leagueId    && { league_id:      leagueId    }),
      ...(tournamentId && { tournament_id:  tournamentId }),
      ...(refCode      && { ref_code:        refCode      }),
      ...(creditToApply > 0 && { credit_applied: String(creditToApply) }),
    };

    const sessionParams = {
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata,
      success_url: `${clientUrl}/golf/payment/success?type=${type}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${clientUrl}/golf`,
    };

    // Apply referral credit as a Stripe coupon discount
    if (creditToApply > 0) {
      const coupon = await stripe.coupons.create({
        amount_off: Math.round(creditToApply * 100),
        currency: 'usd',
        duration: 'once',
        name: 'Referral Credit',
      });
      sessionParams.discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (err) {
    console.error('[golf-payments] checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/golf/leagues/:id/check-migration-promo
// Called when commissioner opens Commissioner Hub or when 6th member joins.
// If league reaches PROMO_MEMBER_THRESHOLD and commissioner has never used promo → auto-unlock.
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

    // Already unlocked?
    const existing = db.prepare(
      "SELECT id, promo_applied FROM golf_comm_pro WHERE league_id = ? AND season = ?"
    ).get(leagueId, SEASON);

    if (existing?.promo_applied) {
      return res.json({ unlocked: true, promoApplied: true, memberCount });
    }

    // Check if commissioner has ever used the promo
    const usedBefore = db.prepare(
      'SELECT id FROM golf_migrations WHERE commissioner_id = ?'
    ).get(userId);

    const eligible = memberCount >= PROMO_MEMBER_THRESHOLD && !usedBefore;

    if (eligible) {
      // Unlock Commissioner Pro for free
      if (existing) {
        db.prepare(
          "UPDATE golf_comm_pro SET promo_applied = 1 WHERE league_id = ? AND season = ?"
        ).run(leagueId, SEASON);
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

      // Send email
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
      unlocked: !!existing?.promo_applied || !!(existing?.paid_at),
      promoApplied: false,
      memberCount,
      membersNeeded: Math.max(0, PROMO_MEMBER_THRESHOLD - memberCount),
      alreadyUsedPromo: !!usedBefore,
    });
  } catch (err) {
    console.error('[golf-payments] check-migration-promo error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// handleGolfWebhook — called from the shared /api/payments/webhook handler
// ---------------------------------------------------------------------------
async function handleGolfWebhook(session) {
  const metadata = session.metadata || {};
  const type = metadata.type; // e.g. 'golf_season_pass'

  try {
    if (type === 'golf_season_pass') {
      db.prepare(`
        INSERT INTO golf_season_passes (id, user_id, season, paid_at, stripe_session_id)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT(user_id, season) DO UPDATE SET
          paid_at = CURRENT_TIMESTAMP,
          stripe_session_id = excluded.stripe_session_id
      `).run(uuidv4(), metadata.user_id, metadata.season || SEASON, session.id);
      console.log(`[golf webhook] season_pass fulfilled user=${metadata.user_id}`);

    } else if (type === 'golf_pool_entry') {
      db.prepare(`
        INSERT INTO golf_pool_entries (id, user_id, tournament_id, paid_at, stripe_session_id)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT(user_id, tournament_id) DO UPDATE SET
          paid_at = CURRENT_TIMESTAMP,
          stripe_session_id = excluded.stripe_session_id
      `).run(uuidv4(), metadata.user_id, metadata.tournament_id, session.id);
      console.log(`[golf webhook] pool_entry fulfilled user=${metadata.user_id} tourn=${metadata.tournament_id}`);

    } else if (type === 'golf_comm_pro') {
      db.prepare(`
        INSERT INTO golf_comm_pro (id, league_id, commissioner_id, season, paid_at, promo_applied, stripe_session_id)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 0, ?)
        ON CONFLICT(league_id, season) DO UPDATE SET
          paid_at = CURRENT_TIMESTAMP,
          stripe_session_id = excluded.stripe_session_id
      `).run(uuidv4(), metadata.league_id, metadata.user_id, metadata.season || SEASON, session.id);
      console.log(`[golf webhook] comm_pro fulfilled league=${metadata.league_id}`);
    }

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

    // Award referral credits if a ref code was used (first payment by this user)
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
        await require('../mailer').sendGolfPaymentConfirmation(user.email, user.username, type, {
          ...metadata,
          tournament_name: tournName.name,
          is_major: tournName.is_major,
        });
      }
    } catch (e) {
      console.warn('[golf webhook] email failed:', e.message);
    }
  } catch (err) {
    console.error('[golf webhook] handleGolfWebhook error:', err.message);
    throw err;
  }
}

async function applyReferralCredits(newUserId, refCode) {
  // Only apply once per referred user
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

  // Check cap
  const referrerCredit = db.prepare(
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

  // Give credit to referrer
  give.run(uuidv4(), referrerId, REFERRAL_CREDIT_AMOUNT, SEASON, REFERRAL_CREDIT_AMOUNT, REFERRAL_MAX_SEASONAL);
  // Give welcome credit to new user
  give.run(uuidv4(), newUserId, REFERRAL_CREDIT_AMOUNT, SEASON, REFERRAL_CREDIT_AMOUNT, REFERRAL_MAX_SEASONAL);

  db.prepare(`
    INSERT INTO golf_referral_redemptions (id, referrer_id, referred_id, credit_amount, redeemed_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(uuidv4(), referrerId, newUserId, REFERRAL_CREDIT_AMOUNT * 2);

  console.log(`[golf-payments] Referral credit applied: referrer=${referrerId} newUser=${newUserId}`);
}

// ── Season Pass checkout (simple direct route) ────────────────────────────────
router.post('/checkout/season-pass', authMiddleware, async (req, res) => {
  const { leagueId } = req.body;
  if (!leagueId) return res.status(400).json({ error: 'leagueId required' });

  const base = 'https://www.tourneyrun.app';
  const successUrl = `${base}/golf/league/${leagueId}?paid=true`;
  const cancelUrl  = `${base}/golf/league/${leagueId}`;

  try {
    const stripe = getStripe();

    // Build line item: prefer env price ID, fall back to inline price_data
    const lineItem = process.env.GOLF_SEASON_PASS_PRICE_ID
      ? { price: process.env.GOLF_SEASON_PASS_PRICE_ID, quantity: 1 }
      : {
          price_data: {
            currency: 'usd',
            unit_amount: 499,
            product_data: { name: 'TourneyRun Golf Season Pass' },
          },
          quantity: 1,
        };

    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [lineItem],
      success_url: successUrl,
      cancel_url:  cancelUrl,
      customer_email: user?.email || undefined,
      metadata: {
        leagueId,
        userId: req.user.id,
        product: 'golf_season_pass',
        type:    'golf_season_pass',
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[golf] season-pass checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session.' });
  }
});

// ── Golf Stripe webhook ────────────────────────────────────────────────────────
router.post('/webhooks/stripe', async (req, res) => {
  const sig     = req.headers['stripe-signature'];
  const secret  = process.env.GOLF_STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  let event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('[golf-webhook] signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      await handleGolfWebhook(session);
    } catch (err) {
      console.error('[golf-webhook] handler error:', err.message);
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
    db.prepare(`
      INSERT OR IGNORE INTO golf_waitlist (email, format) VALUES (?, ?)
    `).run(email.toLowerCase().trim(), format);
    res.json({ ok: true });
  } catch (e) {
    console.error('[golf-payments] waitlist error:', e.message);
    res.status(500).json({ error: 'Could not save. Try again.' });
  }
});

module.exports = router;
module.exports.handleGolfWebhook = handleGolfWebhook;
