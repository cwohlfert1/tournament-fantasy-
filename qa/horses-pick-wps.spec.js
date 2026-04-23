/**
 * TourneyRun Horse Racing — Pick Win/Place/Show E2E Test
 * Run: npx playwright test qa/horses-pick-wps.spec.js --reporter=list
 */
const { test, expect } = require('@playwright/test');
const { BASE, injectAuth, apiGet, apiPost } = require('./helpers');

test.describe.serial('Horse Racing — Pick W/P/S', () => {
  let poolId, horses;

  test('1. Create Pick W/P/S pool', async ({ page }) => {
    await injectAuth(page);
    const { data: evData } = await apiGet(page, '/api/horses/events');
    const event = (evData.events || [])[0];
    expect(event).toBeTruthy();

    const { status, data } = await apiPost(page, '/api/horses/pools', {
      event_id: event.id, name: `QA WPS ${Date.now()}`, format_type: 'pick_wps',
      entry_fee: 0, lock_time: new Date(Date.now() + 86400000).toISOString(),
      payout_structure: [{ place: 1, pct: 50 }, { place: 2, pct: 30 }, { place: 3, pct: 20 }],
      scoring_config: { win: 5, place: 3, show: 2 },
    });
    expect(status).toBe(201);
    poolId = data.pool.id;

    const { data: hData } = await apiGet(page, `/api/horses/events/${event.id}/horses`);
    horses = hData.horses;
    expect(horses.length).toBeGreaterThanOrEqual(3);
  });

  test('2. Submit picks', async ({ page }) => {
    await injectAuth(page);
    const { status } = await apiPost(page, `/api/horses/pools/${poolId}/picks`, {
      win_horse_id: horses[0].id, place_horse_id: horses[1].id, show_horse_id: horses[2].id,
    });
    expect(status).toBe(200);
  });

  test('3. Duplicate horse rejected', async ({ page }) => {
    await injectAuth(page);
    const { status, data } = await apiPost(page, `/api/horses/pools/${poolId}/picks`, {
      win_horse_id: horses[0].id, place_horse_id: horses[0].id, show_horse_id: horses[2].id,
    });
    expect(status).toBe(400);
    expect(data.error).toContain('different horse');
  });

  test('4. Get own picks (pre-lock)', async ({ page }) => {
    await injectAuth(page);
    const { status, data } = await apiGet(page, `/api/horses/pools/${poolId}/picks`);
    expect(status).toBe(200);
    expect(data.all_visible).toBe(false);
    expect(data.picks).toHaveLength(3);
  });

  test('5. Enter results + trigger payouts', async ({ page }) => {
    await injectAuth(page);
    const { status: resStatus } = await apiPost(page, `/api/horses/pools/${poolId}/results`, {
      results: [
        { finish_position: 1, horse_id: horses[0].id, post_position: horses[0].post_position },
        { finish_position: 2, horse_id: horses[1].id, post_position: horses[1].post_position },
        { finish_position: 3, horse_id: horses[2].id, post_position: horses[2].post_position },
      ],
    });
    expect(resStatus).toBe(200);

    const { status: payStatus, data: payData } = await apiPost(page, `/api/horses/pools/${poolId}/payouts/trigger`, {});
    expect(payStatus).toBe(200);
    expect(payData.payouts).toBeDefined();
  });

  test('6. Pool status is finalized', async ({ page }) => {
    await injectAuth(page);
    const { status, data } = await apiGet(page, `/api/horses/pools/${poolId}`);
    expect(status).toBe(200);
    const pool = data.pool || data;
    expect(pool.status).toBe('finalized');
  });
});
