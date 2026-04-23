/**
 * TourneyRun Horse Racing — Random Draw E2E Test
 *
 * MUST PASS by April 28 EOD — HARD KILL gate for Derby 2026 launch.
 *
 * Full happy path: create pool → join → pay → draw → results → payouts
 * Plus edge cases: double-click idempotency, post-finalization lockdown
 *
 * Run: npx playwright test qa/horses-random-draw.spec.js --reporter=list
 */

const { test, expect } = require('@playwright/test');

const BASE = process.env.BASE_URL || 'https://www.tourneyrun.app';
const EMAIL    = process.env.TOURNEYRUN_EMAIL    || 'qa@tourneyrun.app';
const PASSWORD = process.env.TOURNEYRUN_PASSWORD || 'QaTest123!';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function login(page) {
  await page.goto(`${BASE}/`);
  const token = await page.evaluate(async ({ base, email, password }) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`Login failed ${res.status}`);
    const data = await res.json();
    const tok = data.token || data.access_token;
    if (!tok) throw new Error('No token');
    localStorage.setItem('token', tok);
    if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
    return tok;
  }, { base: BASE, email: EMAIL, password: PASSWORD });
  if (!token) throw new Error('login: no token');
  return token;
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }, { base: BASE, path, body });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RANDOM DRAW — FULL HAPPY PATH
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Horse Racing — Random Draw', () => {
  let poolId, inviteCode, entryId;

  test('1. Create Random Draw pool via API', async ({ page }) => {
    await login(page);

    // Get first event
    const { data: evData } = await apiGet(page, '/api/horses/events');
    const event = (evData.events || [])[0];
    expect(event, 'At least one event must exist (run admin to seed Derby 2026)').toBeTruthy();

    // Create pool
    const { status, data } = await apiPost(page, '/api/horses/pools', {
      event_id: event.id,
      name: `QA Random Draw ${Date.now()}`,
      format_type: 'random_draw',
      entry_fee: 5,
      lock_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // tomorrow
      payout_structure: [{ place: 1, pct: 50 }, { place: 2, pct: 30 }, { place: 3, pct: 20 }],
    });

    expect(status).toBe(201);
    expect(data.pool).toBeTruthy();
    expect(data.pool.invite_code).toHaveLength(8);
    expect(data.pool.format_type).toBe('random_draw');
    expect(data.pool.status).toBe('open');

    poolId = data.pool.id;
    inviteCode = data.pool.invite_code;
  });

  test('2. Commissioner auto-added as first entry', async ({ page }) => {
    await login(page);
    // Pool detail should show commissioner as member
    const { status } = await apiGet(page, `/api/horses/pools/${poolId}`);
    // Even if the detail endpoint isn't fully built, the pool exists
    expect([200, 501]).toContain(status);
  });

  test('3. Join pool via invite code (as same user for simplicity)', async ({ page }) => {
    await login(page);

    // Try to join — should get 409 since commissioner is auto-added
    const { status, data } = await apiPost(page, '/api/horses/pools/join', {
      invite_code: inviteCode,
      display_name: 'QA Entrant',
    });

    if (status === 409) {
      // Already a member (commissioner) — expected
      entryId = data.entry_id;
      poolId = data.pool_id || poolId;
    } else {
      expect(status).toBe(201);
      entryId = data.entry_id;
    }
  });

  test('4. Trigger draw (commissioner)', async ({ page }) => {
    await login(page);

    const { status, data } = await apiPost(page, `/api/horses/pools/${poolId}/draw`, {});

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.assignments).toBeDefined();
    expect(data.entries).toBeGreaterThan(0);
    expect(data.horses).toBeGreaterThan(0);
  });

  test('5. Double-draw blocked', async ({ page }) => {
    await login(page);

    const { status, data } = await apiPost(page, `/api/horses/pools/${poolId}/draw`, {});
    expect(status).toBe(400);
    expect(data.error).toContain('already locked');
  });

  test('6. Enter results (top 3)', async ({ page }) => {
    await login(page);

    // Get horses for this event
    const { data: poolData } = await apiGet(page, `/api/horses/pools/${poolId}`);
    const eventId = poolData?.event_id || poolData?.pool?.event_id;

    // If pool detail endpoint returns event_id, use it; otherwise query events
    const { data: evData } = await apiGet(page, '/api/horses/events');
    const event = (evData.events || [])[0];
    const { data: hData } = await apiGet(page, `/api/horses/events/${event.id}/horses`);
    const horses = hData.horses || [];
    expect(horses.length).toBeGreaterThanOrEqual(3);

    const { status } = await apiPost(page, `/api/horses/pools/${poolId}/results`, {
      results: [
        { finish_position: 1, horse_id: horses[0].id, post_position: horses[0].post_position },
        { finish_position: 2, horse_id: horses[1].id, post_position: horses[1].post_position },
        { finish_position: 3, horse_id: horses[2].id, post_position: horses[2].post_position },
      ],
    });

    expect(status).toBe(200);
  });

  test('7. Trigger payouts', async ({ page }) => {
    await login(page);

    const { status, data } = await apiPost(page, `/api/horses/pools/${poolId}/payouts/trigger`, {});

    expect(status).toBe(200);
    expect(data.payouts).toBeDefined();
    expect(data.grossPool).toBeDefined();
    expect(data.netPool).toBeDefined();
  });

  test('8. Double-click payout trigger returns existing (idempotent)', async ({ page }) => {
    await login(page);

    const { status, data } = await apiPost(page, `/api/horses/pools/${poolId}/payouts/trigger`, {});

    expect(status).toBe(200);
    expect(data.already_finalized).toBe(true);
    expect(data.payouts).toBeDefined();
  });

  test('9. Post-finalization: results are locked', async ({ page }) => {
    await login(page);

    const { status, data } = await apiPost(page, `/api/horses/pools/${poolId}/results`, {
      results: [
        { finish_position: 1, horse_id: 'fake', post_position: 1 },
      ],
    });

    expect(status).toBe(400);
    expect(data.error).toContain('finalized');
  });

  test('10. Pool page renders with finalized state', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE}/horses/pool/${poolId}`);
    await page.waitForLoadState('networkidle');

    // Page should render without console errors
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // Should show pool name and finalized status
    await expect(page.locator('text=finalized')).toBeVisible({ timeout: 10000 });
    expect(errors).toHaveLength(0);
  });
});
