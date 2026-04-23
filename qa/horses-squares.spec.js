/**
 * TourneyRun Horse Racing — Squares E2E Test
 * Run: npx playwright test qa/horses-squares.spec.js --reporter=list
 */
const { test, expect } = require('@playwright/test');
const { BASE, injectAuth, apiGet, apiPost } = require('./helpers');

test.describe.serial('Horse Racing — Squares', () => {
  let poolId, horses;

  test('1. Create Squares pool', async ({ page }) => {
    await injectAuth(page);
    const { data: evData } = await apiGet(page, '/api/horses/events');
    const event = (evData.events || [])[0];
    expect(event).toBeTruthy();

    const { status, data } = await apiPost(page, '/api/horses/pools', {
      event_id: event.id, name: `QA Squares ${Date.now()}`, format_type: 'squares',
      entry_fee: 0, lock_time: new Date(Date.now() + 86400000).toISOString(),
      payout_structure: [{ place: 1, pct: 60 }, { place: 2, pct: 25 }, { place: 3, pct: 15 }],
      squares_per_person_cap: 10,
    });
    expect(status).toBe(201);
    poolId = data.pool.id;

    const { data: hData } = await apiGet(page, `/api/horses/events/${event.id}/horses`);
    horses = hData.horses;
    expect(horses.length).toBeGreaterThanOrEqual(4);
  });

  test('2. Grid initialized (100 squares)', async ({ page }) => {
    await injectAuth(page);
    const { status, data } = await apiGet(page, `/api/horses/pools/${poolId}/squares`);
    expect(status).toBe(200);
    expect(data.squares).toHaveLength(100);
  });

  test('3. Claim squares (batch)', async ({ page }) => {
    await injectAuth(page);
    const { status, data } = await apiPost(page, `/api/horses/pools/${poolId}/squares/claim`, {
      squares: [{ row: 0, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 2 }],
    });
    expect(status).toBe(200);
    expect(data.claimed).toBe(3);
  });

  test('4. Per-person cap enforced', async ({ page }) => {
    await injectAuth(page);
    const bigClaim = Array.from({ length: 8 }, (_, i) => ({ row: 3, col: i }));
    const { status } = await apiPost(page, `/api/horses/pools/${poolId}/squares/claim`, { squares: bigClaim });
    expect(status).toBe(400);
  });

  test('5. Assign numbers', async ({ page }) => {
    await injectAuth(page);
    const { status } = await apiPost(page, `/api/horses/pools/${poolId}/squares/assign`, {});
    expect(status).toBe(200);

    const { data } = await apiGet(page, `/api/horses/pools/${poolId}/squares`);
    const rowDigits = [...new Set(data.squares.map(s => s.row_digit))].sort((a, b) => a - b);
    expect(rowDigits).toEqual([0,1,2,3,4,5,6,7,8,9]);
  });

  test('6. Enter results (top 4)', async ({ page }) => {
    await injectAuth(page);
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
    await injectAuth(page);
    const { status, data } = await apiPost(page, `/api/horses/pools/${poolId}/payouts/trigger`, {});
    expect(status).toBe(200);
    expect(data.payouts).toBeDefined();
  });

  test('8. Pool status is finalized', async ({ page }) => {
    await injectAuth(page);
    const { status, data } = await apiGet(page, `/api/horses/pools/${poolId}`);
    expect(status).toBe(200);
    const pool = data.pool || data;
    expect(pool.status).toBe('finalized');
  });
});
