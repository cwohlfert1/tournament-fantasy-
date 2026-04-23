/**
 * TourneyRun Horse Racing — Random Draw E2E Test
 * MUST PASS by April 28 EOD — HARD KILL gate for Derby 2026 launch.
 * Run: npx playwright test qa/horses-random-draw.spec.js --reporter=list
 */
const { test, expect } = require('@playwright/test');
const { BASE, injectAuth, apiGet, apiPost } = require('./helpers');

test.describe.serial('Horse Racing — Random Draw', () => {
  let poolId, inviteCode;

  test('1. Create Random Draw pool', async ({ page }) => {
    await injectAuth(page);
    const { data: evData } = await apiGet(page, '/api/horses/events');
    const event = (evData.events || [])[0];
    expect(event, 'Seed Derby event first: node qa/seed-test-data.js').toBeTruthy();

    const { status, data } = await apiPost(page, '/api/horses/pools', {
      event_id: event.id, name: `QA Draw ${Date.now()}`, format_type: 'random_draw',
      entry_fee: 5, lock_time: new Date(Date.now() + 86400000).toISOString(),
      payout_structure: [{ place: 1, pct: 50 }, { place: 2, pct: 30 }, { place: 3, pct: 20 }],
    });
    expect(status).toBe(201);
    expect(data.pool.invite_code).toHaveLength(8);
    poolId = data.pool.id;
    inviteCode = data.pool.invite_code;
  });

  test('2. Commissioner auto-added as entry', async ({ page }) => {
    await injectAuth(page);
    const { status, data } = await apiGet(page, `/api/horses/pools/${poolId}`);
    expect(status).toBe(200);
    expect(data.entries.length).toBeGreaterThanOrEqual(1);
  });

  test('3. Join pool (same user — expect 409)', async ({ page }) => {
    await injectAuth(page);
    const { status } = await apiPost(page, '/api/horses/pools/join', { invite_code: inviteCode, display_name: 'QA' });
    expect(status).toBe(409);
  });

  test('4. Trigger draw', async ({ page }) => {
    await injectAuth(page);
    const { status, data } = await apiPost(page, `/api/horses/pools/${poolId}/draw`, {});
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.entries).toBeGreaterThan(0);
  });

  test('5. Double-draw blocked', async ({ page }) => {
    await injectAuth(page);
    const { status, data } = await apiPost(page, `/api/horses/pools/${poolId}/draw`, {});
    expect(status).toBe(400);
    expect(data.error).toContain('already locked');
  });

  test('6. Enter results (top 3)', async ({ page }) => {
    await injectAuth(page);
    const { data: poolData } = await apiGet(page, `/api/horses/pools/${poolId}`);
    const eventId = poolData.pool ? poolData.pool.event_id : poolData.event_id;
    const { data: hData } = await apiGet(page, `/api/horses/events/${eventId}/horses`);
    const horses = hData.horses;
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
    await injectAuth(page);
    const { status, data } = await apiPost(page, `/api/horses/pools/${poolId}/payouts/trigger`, {});
    expect(status).toBe(200);
    expect(data.payouts).toBeDefined();
    expect(data.grossPool).toBeDefined();
  });

  test('8. Double-click payout idempotent', async ({ page }) => {
    await injectAuth(page);
    const { status, data } = await apiPost(page, `/api/horses/pools/${poolId}/payouts/trigger`, {});
    expect(status).toBe(200);
    expect(data.already_finalized).toBe(true);
  });

  test('9. Post-finalization: results locked', async ({ page }) => {
    await injectAuth(page);
    const { status, data } = await apiPost(page, `/api/horses/pools/${poolId}/results`, {
      results: [{ finish_position: 1, horse_id: 'fake', post_position: 1 }],
    });
    expect(status).toBe(400);
    expect(data.error).toContain('finalized');
  });

  test('10. Pool status is finalized', async ({ page }) => {
    await injectAuth(page);
    const { status, data } = await apiGet(page, `/api/horses/pools/${poolId}`);
    expect(status).toBe(200);
    const pool = data.pool || data;
    expect(pool.status).toBe('finalized');
    expect(pool.payouts_finalized_at).toBeTruthy();
  });
});
