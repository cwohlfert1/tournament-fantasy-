/**
 * TourneyRun Golf — Payout Splits + Admin Fee (Commissioner feature)
 *
 * Seven scenarios:
 *   1. Commissioner save — payout_splits + admin_fee_type/value persist
 *   2. Player view — GET /leagues/:id does NOT leak admin_fee_type/value to non-commissioners
 *   3. Split validation — splits not summing to 100 return 400
 *   4. Flat $ fee calc — net_pool = gross - flat (capped at gross)
 *   5. Percent fee calc — net_pool = gross × (1 - pct/100)
 *   6. Both types switchable — save percent, then flat; both persist correctly
 *   7. Legacy 3-place leagues still render — /pools/:id/payouts returns splits
 *
 * Run:   npx playwright test qa/golf-payouts.spec.js --reporter=list
 *
 * Env vars (from .env.test):
 *   TOURNEYRUN_BASE     — base URL (defaults to https://www.tourneyrun.app)
 *   TOURNEYRUN_EMAIL    — account that commissions at least one pool league
 *   TOURNEYRUN_PASSWORD — password
 *   TOURNEYRUN_PLAYER_EMAIL    — (optional) non-commissioner account in same league
 *   TOURNEYRUN_PLAYER_PASSWORD — (optional) non-commissioner password
 */
const { test, expect } = require('@playwright/test');

const BASE     = process.env.TOURNEYRUN_BASE     || 'https://www.tourneyrun.app';
const EMAIL    = process.env.TOURNEYRUN_EMAIL    || `qa+${Date.now()}@tourneyrun.app`;
const PASSWORD = process.env.TOURNEYRUN_PASSWORD || 'QaTest123!';
const PLAYER_EMAIL    = process.env.TOURNEYRUN_PLAYER_EMAIL;
const PLAYER_PASSWORD = process.env.TOURNEYRUN_PLAYER_PASSWORD;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function login(page, email = EMAIL, password = PASSWORD) {
  await page.goto(`${BASE}/`);
  return page.evaluate(async ({ base, email, password }) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`login ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const tok = data.token || data.access_token;
    localStorage.setItem('token', tok);
    return tok;
  }, { base: BASE, email, password });
}

async function apiGet(page, path) {
  return page.evaluate(async ({ base, path }) => {
    const token = localStorage.getItem('token');
    const r = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }, { base: BASE, path });
}

async function apiPatch(page, path, body) {
  return page.evaluate(async ({ base, path, body }) => {
    const token = localStorage.getItem('token');
    const r = await fetch(`${base}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }, { base: BASE, path, body });
}

/** Find a pool league commissioned by the current user; returns {id, buy_in, snapshot}. */
async function findCommissionerPool(page) {
  const { data } = await apiGet(page, '/api/golf/leagues');
  const leagues = data.leagues || data || [];
  const pool = leagues.find(l => l.format_type === 'pool' && l.is_commissioner);
  if (!pool) throw new Error('Test account must commission at least one pool league');
  const detail = await apiGet(page, `/api/golf/leagues/${pool.id}`);
  return {
    id: pool.id,
    buy_in: detail.data.league?.buy_in_amount || 0,
    snapshot: {
      payout_splits: detail.data.league?.payout_places || [],
      admin_fee_type: detail.data.league?.admin_fee_type ?? null,
      admin_fee_value: detail.data.league?.admin_fee_value ?? null,
    },
  };
}

/** Restore a league's payout + fee settings after a test mutates them. */
async function restore(page, leagueId, snapshot) {
  await apiPatch(page, `/api/golf/leagues/${leagueId}/settings`, {
    payout_splits: typeof snapshot.payout_splits === 'string'
      ? JSON.parse(snapshot.payout_splits || '[]')
      : snapshot.payout_splits,
    admin_fee_type:  snapshot.admin_fee_type,
    admin_fee_value: snapshot.admin_fee_value,
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 1 — Commissioner save
// ═════════════════════════════════════════════════════════════════════════════
test('TC-PAY-01 Commissioner save — splits + fee persist', async ({ page }) => {
  await login(page);
  const { id, snapshot } = await findCommissionerPool(page);
  try {
    const save = await apiPatch(page, `/api/golf/leagues/${id}/settings`, {
      payout_splits: [{ place: 1, pct: 60 }, { place: 2, pct: 30 }, { place: 3, pct: 10 }],
      admin_fee_type: 'percent',
      admin_fee_value: 10,
    });
    expect(save.status).toBe(200);

    const detail = await apiGet(page, `/api/golf/leagues/${id}`);
    expect(detail.status).toBe(200);
    const raw = detail.data.league?.payout_places;
    const splits = typeof raw === 'string' ? JSON.parse(raw) : raw;
    expect(splits).toEqual([{ place: 1, pct: 60 }, { place: 2, pct: 30 }, { place: 3, pct: 10 }]);
    expect(detail.data.league?.admin_fee_type).toBe('percent');
    expect(parseFloat(detail.data.league?.admin_fee_value)).toBe(10);
  } finally { await restore(page, id, snapshot); }
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 — Player view hides admin fee
// ═════════════════════════════════════════════════════════════════════════════
test('TC-PAY-02 Non-commissioner GET /leagues/:id omits admin_fee_type/value', async ({ page, browser }) => {
  test.skip(!PLAYER_EMAIL, 'TOURNEYRUN_PLAYER_EMAIL not set — skipping player-view test');

  await login(page);
  const { id, snapshot } = await findCommissionerPool(page);
  try {
    // Commissioner sets a fee
    await apiPatch(page, `/api/golf/leagues/${id}/settings`, {
      admin_fee_type: 'percent',
      admin_fee_value: 15,
    });

    // Log in as a non-commissioner player (must be a member of the same league)
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await login(page2, PLAYER_EMAIL, PLAYER_PASSWORD);

    const playerView = await apiGet(page2, `/api/golf/leagues/${id}`);
    expect(playerView.status).toBe(200);
    expect(playerView.data.league?.admin_fee_type).toBeUndefined();
    expect(playerView.data.league?.admin_fee_value).toBeUndefined();

    // But /pools/:id/payouts (player-safe) should return net_pool without the fee fields
    const payoutsResp = await apiGet(page2, `/api/golf/pools/${id}/payouts`);
    expect(payoutsResp.status).toBe(200);
    expect(payoutsResp.data).not.toHaveProperty('admin_fee_type');
    expect(payoutsResp.data).not.toHaveProperty('admin_fee_value');
    expect(payoutsResp.data).not.toHaveProperty('admin_fee_amount');
    expect(payoutsResp.data).not.toHaveProperty('gross_pool');
    expect(payoutsResp.data).toHaveProperty('net_pool');

    await ctx2.close();
  } finally { await restore(page, id, snapshot); }
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 — Split validation
// ═════════════════════════════════════════════════════════════════════════════
test('TC-PAY-03 Payout splits must sum to 100', async ({ page }) => {
  await login(page);
  const { id } = await findCommissionerPool(page);
  const resp = await apiPatch(page, `/api/golf/leagues/${id}/settings`, {
    payout_splits: [{ place: 1, pct: 60 }, { place: 2, pct: 30 }, { place: 3, pct: 5 }], // sums to 95
  });
  expect(resp.status).toBe(400);
  expect(resp.data?.error || '').toMatch(/100/);
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 — Flat $ fee calc
// ═════════════════════════════════════════════════════════════════════════════
test('TC-PAY-04 Flat $ admin fee reduces net_pool by the dollar amount', async ({ page }) => {
  await login(page);
  const { id, buy_in, snapshot } = await findCommissionerPool(page);
  test.skip(buy_in <= 0, 'test league has no buy-in — cannot verify fee math');
  try {
    const flatFee = 25;
    await apiPatch(page, `/api/golf/leagues/${id}/settings`, {
      admin_fee_type: 'flat',
      admin_fee_value: flatFee,
    });
    const full = await apiGet(page, `/api/golf/commissioner/${id}/payouts/full`);
    expect(full.status).toBe(200);
    expect(full.data.admin_fee_type).toBe('flat');
    expect(full.data.admin_fee_amount).toBeCloseTo(Math.min(flatFee, full.data.gross_pool), 2);
    expect(full.data.net_pool).toBeCloseTo(full.data.gross_pool - full.data.admin_fee_amount, 2);
  } finally { await restore(page, id, snapshot); }
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 — Percent fee calc
// ═════════════════════════════════════════════════════════════════════════════
test('TC-PAY-05 Percent admin fee reduces net_pool by the percentage', async ({ page }) => {
  await login(page);
  const { id, buy_in, snapshot } = await findCommissionerPool(page);
  test.skip(buy_in <= 0, 'test league has no buy-in — cannot verify fee math');
  try {
    const pct = 10;
    await apiPatch(page, `/api/golf/leagues/${id}/settings`, {
      admin_fee_type: 'percent',
      admin_fee_value: pct,
    });
    const full = await apiGet(page, `/api/golf/commissioner/${id}/payouts/full`);
    expect(full.status).toBe(200);
    expect(full.data.admin_fee_type).toBe('percent');
    expect(full.data.admin_fee_amount).toBeCloseTo(full.data.gross_pool * (pct / 100), 2);
    expect(full.data.net_pool).toBeCloseTo(full.data.gross_pool * (1 - pct / 100), 2);
  } finally { await restore(page, id, snapshot); }
});

// ═════════════════════════════════════════════════════════════════════════════
// 6 — Both fee types switchable
// ═════════════════════════════════════════════════════════════════════════════
test('TC-PAY-06 Fee type is switchable without data loss', async ({ page }) => {
  await login(page);
  const { id, snapshot } = await findCommissionerPool(page);
  try {
    // Save percent
    await apiPatch(page, `/api/golf/leagues/${id}/settings`, {
      admin_fee_type: 'percent', admin_fee_value: 12,
    });
    let full = await apiGet(page, `/api/golf/commissioner/${id}/payouts/full`);
    expect(full.data.admin_fee_type).toBe('percent');
    expect(parseFloat(full.data.admin_fee_value)).toBe(12);

    // Switch to flat
    await apiPatch(page, `/api/golf/leagues/${id}/settings`, {
      admin_fee_type: 'flat', admin_fee_value: 30,
    });
    full = await apiGet(page, `/api/golf/commissioner/${id}/payouts/full`);
    expect(full.data.admin_fee_type).toBe('flat');
    expect(parseFloat(full.data.admin_fee_value)).toBe(30);

    // Clear entirely
    await apiPatch(page, `/api/golf/leagues/${id}/settings`, {
      admin_fee_type: null, admin_fee_value: null,
    });
    full = await apiGet(page, `/api/golf/commissioner/${id}/payouts/full`);
    expect(full.data.admin_fee_type).toBeNull();
    expect(full.data.admin_fee_value).toBeNull();
    expect(full.data.admin_fee_amount).toBe(0);
  } finally { await restore(page, id, snapshot); }
});

// ═════════════════════════════════════════════════════════════════════════════
// 7 — Legacy 3-place leagues still render (migration correctness)
// ═════════════════════════════════════════════════════════════════════════════
test('TC-PAY-07 /pools/:id/payouts returns per-place amounts for a migrated league', async ({ page }) => {
  await login(page);
  const { id, snapshot } = await findCommissionerPool(page);
  try {
    // Force a known 3-place split (mirrors what the legacy migration produces)
    await apiPatch(page, `/api/golf/leagues/${id}/settings`, {
      payout_splits: [{ place: 1, pct: 70 }, { place: 2, pct: 20 }, { place: 3, pct: 10 }],
    });
    const resp = await apiGet(page, `/api/golf/pools/${id}/payouts`);
    expect(resp.status).toBe(200);
    expect(Array.isArray(resp.data.payouts)).toBe(true);
    expect(resp.data.payouts.length).toBe(3);
    expect(resp.data.payouts.map(p => p.place)).toEqual([1, 2, 3]);
    expect(resp.data.payouts.map(p => p.pct)).toEqual([70, 20, 10]);
    // net_pool × pct / 100 = amount
    for (const p of resp.data.payouts) {
      expect(p.amount).toBeCloseTo(resp.data.net_pool * (p.pct / 100), 2);
    }
  } finally { await restore(page, id, snapshot); }
});
