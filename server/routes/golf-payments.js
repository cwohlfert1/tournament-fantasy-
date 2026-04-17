'use strict';

const express  = require('express');
const crypto   = require('crypto');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
require('../golf-db'); // ensure golf tables exist
const db = require('../db/index');

const router = express.Router();

const SEASON                 = '2026';
const REFERRAL_CREDIT_AMOUNT = 1.00;
const REFERRAL_MAX_SEASONAL  = 10.00;
const PROMO_MEMBER_THRESHOLD = 6;
const MASTERS_PROMO_END      = new Date('2026-04-10');

const AMOUNTS = {
  office_pool: 0.99,
  season_pass: 4.99,
};

// Pool creation pricing by max-teams tier
function getPriceForMaxTeams(maxTeams) {
  if (maxTeams <= 20)  return { amount: 12.99, label: 'Up to 20 teams'  };
  if (maxTeams <= 40)  return { amount: 19.99, label: 'Up to 40 teams'  };
  if (maxTeams <= 60)  return { amount: 24.99, label: 'Up to 60 teams'  };
  if (maxTeams <= 100) return { amount: 34.99, label: 'Up to 100 teams' };
  if (maxTeams <= 300) return { amount: 49.99, label: 'Up to 300 teams' };
  return                      { amount: 69.99, label: 'Enterprise 300+' };
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
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars; 256 % 32 === 0, no modulo bias
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[bytes[i] % chars.length];
  return code;
}

async function ensureReferralCode(userId) {
  let row = await db.get('SELECT code FROM golf_referral_codes WHERE user_id = ?', userId);
  if (!row) {
    let code, attempts = 0;
    do {
      code = genReferralCode();
      attempts++;
    } while (await db.get('SELECT 1 FROM golf_referral_codes WHERE code = ?', code) && attempts < 20);
    await db.run('INSERT INTO golf_referral_codes (id, user_id, code) VALUES (?, ?, ?)', uuidv4(), userId, code);
    row = { code };
  }
  return row.code;
}

// ---------------------------------------------------------------------------
// GET /api/golf/referral/my-code
// ---------------------------------------------------------------------------
router.get('/referral/my-code', authMiddleware, async (req, res) => {
  try {
    const code      = await ensureReferralCode(req.user.id);
    const clientUrl = process.env.CLIENT_URL
      ? process.env.CLIENT_URL.replace(/\/$/, '')
      : 'https://www.tourneyrun.app';

    const credits = await db.get(
      'SELECT balance FROM golf_referral_credits WHERE user_id = ? AND season = ?',
      req.user.id, SEASON
    );

    const earned = await db.get(
      'SELECT COALESCE(SUM(credit_amount), 0) as total FROM golf_referral_redemptions WHERE referrer_id = ?',
      req.user.id
    );

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
router.get('/payments/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const seasonPass = await db.get(
      "SELECT id FROM golf_season_passes WHERE user_id = ? AND season = ? AND paid_at IS NOT NULL",
      userId, SEASON
    );

    const paidTournamentRows = await db.all(
      "SELECT tournament_id FROM golf_pool_entries WHERE user_id = ? AND paid_at IS NOT NULL",
      userId
    );
    const paidTournaments = paidTournamentRows.map(r => r.tournament_id);

    const commProLeagues = await db.all(
      "SELECT league_id FROM golf_comm_pro WHERE commissioner_id = ? AND season = ? AND (paid_at IS NOT NULL OR promo_applied = 1)",
      userId, SEASON
    );

    const credits = await db.get(
      'SELECT balance FROM golf_referral_credits WHERE user_id = ? AND season = ?',
      userId, SEASON
    );

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
// ---------------------------------------------------------------------------
// POST /api/golf/payments/validate-promo
// ---------------------------------------------------------------------------
router.post('/payments/validate-promo', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code required' });
    const promo = await db.get(
      "SELECT * FROM promo_codes WHERE UPPER(code) = UPPER(?) AND active = 1",
      code.trim()
    );
    if (!promo) return res.status(404).json({ valid: false, error: 'Invalid or inactive promo code' });
    const label = promo.discount_type === 'free'
      ? 'First pool free!'
      : `${promo.discount_value}% off`;
    res.json({ valid: true, code: promo.code, discountType: promo.discount_type, discountValue: promo.discount_value, label });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payments/create-checkout-session', authMiddleware, async (req, res) => {
  try {
    const { type, leagueId, tournamentId, refCode, promoCode } = req.body;
    const userId = req.user.id;

    if (!['season_pass', 'office_pool', 'comm_pro'].includes(type)) {
      return res.status(400).json({ error: 'Invalid payment type' });
    }

    // Guard: already paid?
    if (type === 'season_pass') {
      const existing = await db.get(
        "SELECT id FROM golf_season_passes WHERE user_id = ? AND season = ? AND paid_at IS NOT NULL",
        userId, SEASON
      );
      if (existing) return res.json({ alreadyPaid: true });
    } else if (type === 'office_pool' && tournamentId) {
      const existing = await db.get(
        "SELECT id FROM golf_pool_entries WHERE user_id = ? AND tournament_id = ? AND paid_at IS NOT NULL",
        userId, tournamentId
      );
      if (existing) return res.json({ alreadyPaid: true });
    } else if (type === 'comm_pro' && leagueId) {
      const existing = await db.get(
        "SELECT id FROM golf_comm_pro WHERE league_id = ? AND season = ? AND (paid_at IS NOT NULL OR promo_applied = 1)",
        leagueId, SEASON
      );
      if (existing) return res.json({ alreadyPaid: true });
    }

    const clientUrl = getClientUrl(req);

    // Determine base price — comm_pro uses tier pricing from league's max_teams
    let baseAmount, lineItemName;
    if (type === 'comm_pro') {
      if (!leagueId) return res.status(400).json({ error: 'leagueId required for pool creation' });
      const league = await db.get('SELECT name, max_teams, format_type FROM golf_leagues WHERE id = ?', leagueId);
      if (!league) return res.status(404).json({ error: 'League not found' });

      // Snake draft: flat $19.99 regardless of team count or tournament
      if (league.format_type === 'draft') {
        baseAmount   = 19.99;
        lineItemName = `TourneyRun Snake Draft — ${league.name}`;
      } else {
        const { amount, label } = getPriceForMaxTeams(league.max_teams || 20);
        baseAmount   = amount;
        lineItemName = `TourneyRun Pool · ${label} — ${league.name}`;
        // Masters launch promo: 25% off pools created before April 10 2026
        if (new Date() < MASTERS_PROMO_END) {
          baseAmount   = Math.round(baseAmount * 0.75 * 100) / 100;
          lineItemName += ' (Masters Launch Price)';
        }
      }
    } else {
      baseAmount   = AMOUNTS[type];
      const tournRow = tournamentId
        ? await db.get('SELECT name FROM golf_tournaments WHERE id = ?', tournamentId)
        : null;
      lineItemName = type === 'season_pass'
        ? 'TourneyRun Golf Season Pass — 2026'
        : tournamentId
          ? `Golf Pool Entry — ${tournRow?.name || 'Tournament'}`
          : 'Golf Pool Entry';
    }

    // Check promo code
    let promoRecord = null;
    let promoDiscount = 0;
    if (promoCode && type === 'comm_pro') {
      promoRecord = await db.get(
        "SELECT * FROM promo_codes WHERE UPPER(code) = UPPER(?) AND active = 1",
        promoCode.trim()
      );
      if (promoRecord) {
        if (promoRecord.discount_type === 'free') {
          promoDiscount = baseAmount;
        } else if (promoRecord.discount_type === 'percent') {
          promoDiscount = Math.min(baseAmount, baseAmount * (promoRecord.discount_value / 100));
        }
      }
    }

    // Check referral credit balance
    const creditRow = await db.get(
      'SELECT balance FROM golf_referral_credits WHERE user_id = ? AND season = ?',
      userId, SEASON
    );
    const creditBalance  = creditRow?.balance || 0;
    const afterPromo     = Math.max(0, baseAmount - promoDiscount);
    const creditToApply  = Math.min(creditBalance, afterPromo);
    const finalAmount    = Math.max(0, afterPromo - creditToApply);

    const metadata = {
      type:         `golf_${type}`,
      user_id:      userId,
      season:       SEASON,
      ...(leagueId      && { league_id:      leagueId      }),
      ...(tournamentId  && { tournament_id:  tournamentId  }),
      ...(refCode       && { ref_code:        refCode       }),
      ...(creditToApply > 0 && { credit_applied: String(creditToApply) }),
      ...(promoRecord   && {
        promo_code_id:   promoRecord.id,
        // Carry actual pricing so the webhook handler can write a correct audit record
        original_price:  String(baseAmount),
        discount_amount: String(promoDiscount),
        final_price:     String(finalAmount),
      }),
    };

    // Record promo use and fulfill directly if fully discounted
    async function recordPromoUse() {
      if (!promoRecord) return;
      const useId = uuidv4();
      await db.run(`
        INSERT INTO promo_code_uses (id, promo_code_id, league_id, user_id, original_price, discount_amount, final_price)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, useId, promoRecord.id, leagueId || null, userId, baseAmount, promoDiscount, finalAmount);
      await db.run('UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = ?', promoRecord.id);
    }

    // If credit + promo covers the full amount, fulfill directly without a payment
    if (finalAmount === 0) {
      await recordPromoUse();
      await fulfillGolfPayment(metadata);
      return res.json({ free: true });
    }

    const user = await db.get('SELECT email FROM users WHERE id = ?', userId);

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

    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== userId) return res.status(403).json({ error: 'Not commissioner' });

    const memberCountRow = await db.get(
      'SELECT COUNT(*) as n FROM golf_league_members WHERE golf_league_id = ?',
      leagueId
    );
    const memberCount = memberCountRow.n;

    const existing = await db.get(
      "SELECT id, promo_applied FROM golf_comm_pro WHERE league_id = ? AND season = ?",
      leagueId, SEASON
    );

    if (existing?.promo_applied) {
      return res.json({ unlocked: true, promoApplied: true, memberCount });
    }

    const usedBefore = await db.get('SELECT id FROM golf_migrations WHERE commissioner_id = ?', userId);
    const eligible   = memberCount >= PROMO_MEMBER_THRESHOLD && !usedBefore;

    if (eligible) {
      if (existing) {
        await db.run("UPDATE golf_comm_pro SET promo_applied = 1 WHERE league_id = ? AND season = ?", leagueId, SEASON);
      } else {
        await db.run(`
          INSERT INTO golf_comm_pro (id, league_id, commissioner_id, season, promo_applied)
          VALUES (?, ?, ?, ?, 1)
        `, uuidv4(), leagueId, userId, SEASON);
      }

      await db.run(`
        INSERT INTO golf_migrations (id, league_id, commissioner_id, member_count_at_promo, promo_applied)
        VALUES (?, ?, ?, ?, 1)
      `, uuidv4(), leagueId, userId, memberCount);

      try {
        const user = await db.get('SELECT email, username FROM users WHERE id = ?', userId);
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
  const user       = await db.get('SELECT email FROM users WHERE id = ?', userId);

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
  const type    = metadata.type;
  const orderId = metadata._order_id || 'credit_applied';

  // All DB writes run in a single transaction so a partial failure
  // (e.g. league activation succeeds but season_pass insert fails)
  // cannot leave data in an inconsistent state.
  await db.transaction(async (tx) => {
    if (type === 'golf_season_pass') {
      tx.run(`
        INSERT INTO golf_season_passes (id, user_id, season, paid_at, stripe_session_id)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT(user_id, season) DO UPDATE SET
          paid_at = CURRENT_TIMESTAMP,
          stripe_session_id = excluded.stripe_session_id
      `, uuidv4(), metadata.user_id, metadata.season || SEASON, orderId);

    } else if (type === 'golf_pool_entry' || type === 'golf_office_pool') {
      tx.run(`
        INSERT INTO golf_pool_entries (id, user_id, tournament_id, paid_at, stripe_session_id)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
        ON CONFLICT(user_id, tournament_id) DO UPDATE SET
          paid_at = CURRENT_TIMESTAMP,
          stripe_session_id = excluded.stripe_session_id
      `, uuidv4(), metadata.user_id, metadata.tournament_id, orderId);

    } else if (type === 'golf_comm_pro') {
      tx.run(`
        INSERT INTO golf_comm_pro (id, league_id, commissioner_id, season, paid_at, promo_applied, stripe_session_id)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 0, ?)
        ON CONFLICT(league_id, season) DO UPDATE SET
          paid_at = CURRENT_TIMESTAMP,
          stripe_session_id = excluded.stripe_session_id
      `, uuidv4(), metadata.league_id, metadata.user_id, metadata.season || SEASON, orderId);

      if (metadata.league_id) {
        tx.run(`UPDATE golf_leagues SET status = 'lobby' WHERE id = ? AND status = 'pending_payment'`,
          metadata.league_id);
      }
    }
  });

  console.log(`[golf] fulfillGolfPayment type=${type} user=${metadata.user_id}`);

  // Email fires after the transaction commits — a failed email never rolls back fulfillment
  if (type === 'golf_comm_pro' && metadata.league_id) {
    try {
      const league = await db.get(
        'SELECT name, max_teams, pool_tournament_id FROM golf_leagues WHERE id = ?',
        metadata.league_id
      );
      const user = await db.get('SELECT email, username FROM users WHERE id = ?', metadata.user_id);
      if (league && user) {
        const memberCountRow = await db.get(
          'SELECT COUNT(*) as n FROM golf_league_members WHERE golf_league_id = ?',
          metadata.league_id
        );
        const memberCount = memberCountRow.n;
        const spotsOpen = Math.max(0, (league.max_teams || 20) - memberCount);
        const tourn = league.pool_tournament_id
          ? await db.get('SELECT name FROM golf_tournaments WHERE id = ?', league.pool_tournament_id)
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
}

async function handleGolfWebhook({ order_id, metadata }) {
  // ── Idempotency guard ─────────────────────────────────────────────────────
  // Square retries webhooks. Check whether we've already fully processed this
  // order before doing anything. The processed_webhook_orders row is written
  // inside the same DB transaction as the credit deduction, so it is impossible
  // for the guard to pass while the side-effects are missing (or vice versa).
  const alreadyProcessed = await db.get(
    'SELECT 1 FROM processed_webhook_orders WHERE order_id = ?',
    order_id
  );
  if (alreadyProcessed) {
    console.log(`[golf-webhook] duplicate delivery for order ${order_id} — skipped`);
    return;
  }

  try {
    // Fulfill + deduct credits + mark processed — all in one atomic transaction
    await db.transaction(async (tx) => {
      const type    = metadata.type;
      const orderId = order_id;

      if (type === 'golf_season_pass') {
        tx.run(`
          INSERT INTO golf_season_passes (id, user_id, season, paid_at, stripe_session_id)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
          ON CONFLICT(user_id, season) DO UPDATE SET
            paid_at = CURRENT_TIMESTAMP, stripe_session_id = excluded.stripe_session_id
        `, uuidv4(), metadata.user_id, metadata.season || SEASON, orderId);

      } else if (type === 'golf_pool_entry' || type === 'golf_office_pool') {
        tx.run(`
          INSERT INTO golf_pool_entries (id, user_id, tournament_id, paid_at, stripe_session_id)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
          ON CONFLICT(user_id, tournament_id) DO UPDATE SET
            paid_at = CURRENT_TIMESTAMP, stripe_session_id = excluded.stripe_session_id
        `, uuidv4(), metadata.user_id, metadata.tournament_id, orderId);

      } else if (type === 'golf_comm_pro') {
        tx.run(`
          INSERT INTO golf_comm_pro (id, league_id, commissioner_id, season, paid_at, promo_applied, stripe_session_id)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 0, ?)
          ON CONFLICT(league_id, season) DO UPDATE SET
            paid_at = CURRENT_TIMESTAMP, stripe_session_id = excluded.stripe_session_id
        `, uuidv4(), metadata.league_id, metadata.user_id, metadata.season || SEASON, orderId);

        if (metadata.league_id) {
          tx.run(`UPDATE golf_leagues SET status = 'lobby' WHERE id = ? AND status = 'pending_payment'`,
            metadata.league_id);
        }
      } else if (type === 'golf_tier_upgrade') {
        if (metadata.league_id && metadata.new_max_teams && metadata.new_tier_key) {
          tx.run('UPDATE golf_leagues SET max_teams = ?, pool_tier = ? WHERE id = ?',
            parseInt(metadata.new_max_teams), metadata.new_tier_key, metadata.league_id);
        }
      }

      // Deduct referral credit — runs exactly once per order
      if (metadata.credit_applied && metadata.user_id) {
        const creditApplied = parseFloat(metadata.credit_applied);
        if (creditApplied > 0) {
          tx.run(`
            UPDATE golf_referral_credits
            SET balance = MAX(0, balance - ?)
            WHERE user_id = ? AND season = ?
          `, creditApplied, metadata.user_id, metadata.season || SEASON);
        }
      }

      // Mark this order as fully processed — prevents any future duplicate
      tx.run('INSERT INTO processed_webhook_orders (order_id) VALUES (?)', order_id);
    });

    console.log(`[golf-webhook] fulfilled order=${order_id} type=${metadata.type}`);

    // ── Post-commit async work (emails, referral credits) ─────────────────
    // These run outside the transaction. If they fail, the fulfillment is
    // already committed and the order marked processed — no double-charge risk.

    // Record promo code use (P0-3 fix: use actual prices, not 0/0/0)
    if (metadata.promo_code_id && metadata.user_id) {
      try {
        const promo = await db.get('SELECT * FROM promo_codes WHERE id = ?', metadata.promo_code_id);
        if (promo) {
          const alreadyRecorded = await db.get(
            'SELECT id FROM promo_code_uses WHERE promo_code_id = ? AND league_id = ?',
            metadata.promo_code_id, metadata.league_id || null
          );
          if (!alreadyRecorded) {
            // Reconstruct actual pricing from metadata (set at checkout time)
            const originalPrice  = parseFloat(metadata.original_price  || 0);
            const discountAmount = parseFloat(metadata.discount_amount  || 0);
            const finalPrice     = parseFloat(metadata.final_price      || 0);
            await db.run(`
              INSERT INTO promo_code_uses (id, promo_code_id, league_id, user_id, original_price, discount_amount, final_price)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `, uuidv4(), promo.id, metadata.league_id || null, metadata.user_id,
                   originalPrice, discountAmount, finalPrice);
            await db.run('UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = ?', promo.id);
          }
        }
      } catch (e) {
        console.warn('[golf-payments] promo use record error:', e.message);
      }
    }

    if (metadata.ref_code && metadata.user_id) {
      await applyReferralCredits(metadata.user_id, metadata.ref_code);
    }

    // Send "pool is live" email for comm_pro (was previously inside fulfillGolfPayment)
    if (metadata.type === 'golf_comm_pro' && metadata.league_id) {
      try {
        const league = await db.get(
          'SELECT name, max_teams, pool_tournament_id FROM golf_leagues WHERE id = ?',
          metadata.league_id
        );
        const user = await db.get('SELECT email, username FROM users WHERE id = ?', metadata.user_id);
        if (league && user) {
          const memberCountRow = await db.get(
            'SELECT COUNT(*) as n FROM golf_league_members WHERE golf_league_id = ?',
            metadata.league_id
          );
          const memberCount = memberCountRow.n;
          const spotsOpen = Math.max(0, (league.max_teams || 20) - memberCount);
          const tourn = league.pool_tournament_id
            ? await db.get('SELECT name FROM golf_tournaments WHERE id = ?', league.pool_tournament_id)
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

    // Send payment confirmation email
    try {
      const user = await db.get('SELECT email, username FROM users WHERE id = ?', metadata.user_id);
      if (user) {
        const tournName = metadata.tournament_id
          ? (await db.get('SELECT name, is_major FROM golf_tournaments WHERE id = ?', metadata.tournament_id) || {})
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
  const alreadyRedeemed = await db.get(
    'SELECT id FROM golf_referral_redemptions WHERE referred_id = ?',
    newUserId
  );
  if (alreadyRedeemed) return;

  const referrerCode = await db.get(
    'SELECT user_id FROM golf_referral_codes WHERE code = ?',
    refCode
  );
  if (!referrerCode) return;

  const referrerId = referrerCode.user_id;
  if (referrerId === newUserId) return;

  const referrerCredit = await db.get(
    'SELECT balance FROM golf_referral_credits WHERE user_id = ? AND season = ?',
    referrerId, SEASON
  );
  const currentBalance = referrerCredit?.balance || 0;
  if (currentBalance >= REFERRAL_MAX_SEASONAL) return;

  const giveSql = `
    INSERT INTO golf_referral_credits (id, user_id, balance, season, expires_at)
    VALUES (?, ?, ?, ?, datetime('now', '+1 year'))
    ON CONFLICT(user_id, season) DO UPDATE SET
      balance = MIN(balance + ?, ?)
  `;

  await db.run(giveSql, uuidv4(), referrerId, REFERRAL_CREDIT_AMOUNT, SEASON, REFERRAL_CREDIT_AMOUNT, REFERRAL_MAX_SEASONAL);
  await db.run(giveSql, uuidv4(), newUserId,  REFERRAL_CREDIT_AMOUNT, SEASON, REFERRAL_CREDIT_AMOUNT, REFERRAL_MAX_SEASONAL);

  await db.run(`
    INSERT INTO golf_referral_redemptions (id, referrer_id, referred_id, credit_amount, redeemed_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, uuidv4(), referrerId, newUserId, REFERRAL_CREDIT_AMOUNT * 2);

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
    // SECURITY: fail closed — do NOT process webhooks without signature verification
    console.error('[golf-square-webhook] CRITICAL: No signature key set — rejecting webhook');
    return res.status(500).send('Webhook verification not configured');
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

// ---------------------------------------------------------------------------
// POST /api/golf/leagues/:id/upgrade-tier — charge the price diff, bump capacity
// ---------------------------------------------------------------------------
const TIER_PRICING = [
  { maxTeams: 20,  tierKey: 'standard',   price: 12.99 },
  { maxTeams: 40,  tierKey: 'standard',   price: 19.99 },
  { maxTeams: 60,  tierKey: 'standard',   price: 24.99 },
  { maxTeams: 100, tierKey: 'large_100',  price: 34.99 },
  { maxTeams: 300, tierKey: 'large_300',  price: 49.99 },
  { maxTeams: 999, tierKey: 'enterprise', price: 69.99 },
];

router.post('/leagues/:id/upgrade-tier', authMiddleware, async (req, res) => {
  try {
    const leagueId = req.params.id;
    const userId   = req.user.id;

    const league = await db.get('SELECT * FROM golf_leagues WHERE id = ?', leagueId);
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.commissioner_id !== userId) return res.status(403).json({ error: 'Not commissioner' });

    const currentIdx = TIER_PRICING.findIndex(t => t.maxTeams === (league.max_teams || 20));
    if (currentIdx < 0 || currentIdx >= TIER_PRICING.length - 1) {
      return res.status(400).json({ error: 'Already at highest tier or tier not found' });
    }

    const current  = TIER_PRICING[currentIdx];
    const next     = TIER_PRICING[currentIdx + 1];
    let   diff     = Math.round((next.price - current.price) * 100) / 100;
    let   itemName = `Pool Capacity Upgrade — up to ${next.maxTeams === 999 ? '300+' : next.maxTeams} teams`;

    if (new Date() < MASTERS_PROMO_END) {
      diff     = Math.round(diff * 0.75 * 100) / 100;
      itemName += ' (Masters Launch Price)';
    }

    const base = process.env.CLIENT_URL?.replace(/\/$/, '') || 'https://www.tourneyrun.app';
    const user = await db.get('SELECT email FROM users WHERE id = ?', userId);

    const { url } = await createPaymentLink({
      name:        itemName,
      amount:      diff,
      metadata: {
        type:          'golf_tier_upgrade',
        user_id:       userId,
        league_id:     leagueId,
        new_max_teams: String(next.maxTeams),
        new_tier_key:  next.tierKey,
      },
      redirectUrl: `${base}/golf/league/${leagueId}?tab=commissioner&upgraded=true`,
      buyerEmail:  user?.email,
    });

    res.json({ url });
  } catch (err) {
    console.error('[golf-payments] upgrade-tier error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout.' });
  }
});

// ── Waitlist ───────────────────────────────────────────────────────────────────
router.post('/waitlist', async (req, res) => {
  const { email, format = 'golf_pool' } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required.' });
  }
  try {
    await db.run('INSERT OR IGNORE INTO golf_waitlist (email, format) VALUES (?, ?)',
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
