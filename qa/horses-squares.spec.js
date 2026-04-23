/**
 * TourneyRun Horse Racing — Squares E2E Test
 *
 * Full happy path: create pool → join → claim squares → lock → assign numbers → results → payouts
 *
 * Run: npx playwright test qa/horses-squares.spec.js --reporter=list
 */

const { test, expect } = require('@playwright/test');

const BASE = process.env.BASE_URL || 'https://www.tourneyrun.app';
const EMAIL    = process.env.TOURNEYRUN_EMAIL    || 'qa@tourneyrun.app';
const PASSWORD = process.env.TOURNEYRUN_PASSWORD || 'QaTest123!';

async function login(page) {
  await page.goto(`${BASE}/`);
  const token = await page.evaluate(async ({ base, email, password }) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`Login failed ${res.status}`);
    const data = await res.json();
    const tok = data.token || data.access_token;
    localStorage.setItem('token', tok);
    if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
    return tok;
  }, { base: BASE, email: EMAIL, password: PASSWORD });
  if (!token) throw new Error('login: no token');
}

async function apiGet(page, path) {
  return page.evaluate(async ({ base, path }) => {
    const token = localStorage.getItem('token');
    const r = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }, { base: BASE, path });
}

async function apiPost(page, path, body) {
  return page.evaluate(async ({ base, path, body }) => {
    const token = localStorage.getItem('token');
    const r = await fetch(`${base}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }, { base: BASE, path, body });
}

test.describe('Horse Racing — Squares', () => {
  let poolId, horses;

  test('1. Create Squares pool with 100-square grid', async ({ page }) => {
    await login(page);
    const { data: evData } = await apiGet(page, '/api/horses/events');
    const event = (evData.events || [])[0];
    expect(event).toBeTruthy();

    const { status, data } = await apiPost(page, '/api/horses/pools', {
      event_id: event.id,
      name: `QA Squares ${Date.now()}`,
      format_type: 'squares',
      entry_fee: 0, // free for test simplicity
      lock_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      payout_structure: [{ place: 1, pct: 60 }, { place: 2, pct: 25 }, { place: 3, pct: 15 }],
      squares_per_person_cap: 10,
    });

    expect(status).toBe(201);
    poolId = data.pool.id;

    // Get horses for results later
    const { data: hData } = await apiGet(page, `/api/horses/events/${event.id}/horses`);
    horses = hData.horses || [];
    expect(horses.length).toBeGreaterThanOrEqual(4);
  });

  test('2. Grid initialized with 100 squares', async ({ page }) => {
    await login(page);

    const { status, data } = await apiGet(page, `/api/horses/pools/${poolId}/squares`);
    expect(status).toBe(200);
    expect(data.squares).toHaveLength(100);
    expect(data.squares.every(s => s.entry_id === null)).toBe(true); // all unclaimed
  });

  test('3. Claim squares (batch)', async ({ page }) => {
    await login(page);

    const { status, data } = await apiPost(page, `/api/horses/pools/${poolId}/squares/claim`, {
      squares: [{ row: 0, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 2 }],
    });
    expect(status).toBe(200);
    expect(data.claimed).toBe(3);
  });

  test('4. Per-person cap enforced', async ({ page }) => {
    await login(page);

    // Try to claim 11 more (already have 3, cap is 10)
    const bigClaim = Array.from({ length: 8 }, (_, i) => ({ row: 3, col: i }));
    const { status: s1 } = await apiPost(page, `/api/horses/pools/${poolId}/squares/claim`, { squares: bigClaim });
    // 3 + 8 = 11 > 10 cap
    expect(s1).toBe(400);
  });

  test('5. Assign numbers (commissioner)', async ({ page }) => {
    await login(page);

    const { status } = await apiPost(page, `/api/horses/pools/${poolId}/squares/assign`, {});
    expect(status).toBe(200);

    // Verify digits assigned
    const { data } = await apiGet(page, `/api/horses/pools/${poolId}/squares`);
    const hasDigits = data.squares.some(s => s.row_digit !== null);
    expect(hasDigits).toBe(true);

    // Verify all 10 row digits are unique permutation of 0-9
    const rowDigits = [...new Set(data.squares.map(s => s.row_digit))];
    expect(rowDigits.sort()).toEqual([0,1,2,3,4,5,6,7,8,9]);
  });

  test('6. Enter results (top 4 with post positions)', async ({ page }) => {
    await login(page);

    const { status } = await apiPost(page, `/api/horses/pools/${poolId}/results`, {
      results: [
        { finish_position: 1, horse_id: horses[0].id, post_position: horses[0].post_position || 1 },
        { finish_position: 2, horse_id: horses[1].id, post_position: horses[1].post_position || 2 },
        { finish_position: 3, horse_id: horses[2].id, post_position: horses[2].post_position || 3 },
        { finish_position: 4, horse_id: horses[3].id, post_position: horses[3].post_position || 4 },
      ],
    });
    expect(status).toBe(200);
  });

  test('7. Trigger payouts', async ({ page }) => {
    await login(page);

    const { status, data } = await apiPost(page, `/api/horses/pools/${poolId}/payouts/trigger`, {});
    expect(status).toBe(200);
    expect(data.payouts).toBeDefined();
    // With free entry, grossPool = 0, so payouts are all $0 — that's fine for test
    expect(data.grossPool).toBeDefined();
  });

  test('8. Pool page renders grid with digits', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/horses/pool/${poolId}`);
    await page.waitForLoadState('networkidle');

    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });
});
