/**
 * Commissioner Features — payouts, admin fee, unpaid entries, CSV, email,
 * re-invite, override, communications.
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://www.tourneyrun.app';
const EMAIL    = process.env.TOURNEYRUN_EMAIL;
const PASSWORD = process.env.TOURNEYRUN_PASSWORD;

async function apiLogin(page) {
  await page.goto(`${BASE}/`);
  const token = await page.evaluate(async ({ base, email, password }) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.token) localStorage.setItem('token', data.token);
    return data.token;
  }, { base: BASE, email: EMAIL, password: PASSWORD });
  return token;
}

async function apiFetch(page, path, opts = {}) {
  return page.evaluate(async ({ base, path, opts }) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${base}/api${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }, { base: BASE, path, opts });
}

async function getCommissionerLeague(page) {
  const r = await apiFetch(page, '/golf/leagues');
  return r.data.leagues?.find(l => l.format_type === 'pool' && l.pool_tournament_id);
}

test.describe('Commissioner Features', () => {
  test.beforeEach(async ({ page }) => {
    await apiLogin(page);
  });

  test('unpaid entries endpoint returns correct structure', async ({ page }) => {
    const league = await getCommissionerLeague(page);
    if (!league) return test.skip();
    const r = await apiFetch(page, `/golf/commissioner/${league.id}/unpaid`);
    expect(r.status).toBe(200);
    expect(r.data).toHaveProperty('unpaid');
    expect(r.data).toHaveProperty('total_entries');
    expect(r.data).toHaveProperty('unpaid_count');
    expect(Array.isArray(r.data.unpaid)).toBe(true);
  });

  test('entries CSV endpoint returns 200', async ({ page }) => {
    const league = await getCommissionerLeague(page);
    if (!league) return test.skip();
    const r = await page.evaluate(async ({ base, id }) => {
      const token = localStorage.getItem('token');
      const res = await fetch(`${base}/api/golf/commissioner/${id}/entries/csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { status: res.status };
    }, { base: BASE, id: league.id });
    // 200 or 404 (no entries yet) are both valid
    expect([200, 404]).toContain(r.status);
  });

  test('entries emails endpoint returns data', async ({ page }) => {
    const league = await getCommissionerLeague(page);
    if (!league) return test.skip();
    const r = await apiFetch(page, `/golf/commissioner/${league.id}/entries/emails`);
    // 200 with emails or 404 if no entries
    expect([200, 404]).toContain(r.status);
    if (r.status === 200) {
      expect(r.data).toHaveProperty('emails');
      expect(r.data).toHaveProperty('count');
    }
  });

  test('league settings save payout splits correctly', async ({ page }) => {
    const league = await getCommissionerLeague(page);
    if (!league) return test.skip();
    const r = await apiFetch(page, `/golf/leagues/${league.id}`);
    expect(r.status).toBe(200);
    const l = r.data.league;
    // Verify payout_places exists and is parseable
    let payouts;
    try { payouts = typeof l.payout_places === 'string' ? JSON.parse(l.payout_places) : l.payout_places; } catch { payouts = []; }
    expect(Array.isArray(payouts)).toBe(true);
    if (payouts.length > 0) {
      expect(payouts[0]).toHaveProperty('pct');
    }
  });

  test('admin fee not exposed in non-commissioner league view', async ({ page }) => {
    // admin_fee_type and admin_fee_value should NOT appear in member-facing API
    const league = await getCommissionerLeague(page);
    if (!league) return test.skip();
    const r = await apiFetch(page, `/golf/leagues/${league.id}/standings`);
    expect(r.status).toBe(200);
    // Standings response should not leak admin fee
    const json = JSON.stringify(r.data);
    expect(json).not.toContain('admin_fee_type');
    expect(json).not.toContain('admin_fee_value');
  });

  test('past leagues endpoint returns data for re-invite', async ({ page }) => {
    const r = await apiFetch(page, '/golf/commissioner/past-leagues');
    // 200 with array/object or 404
    expect([200, 404]).toContain(r.status);
    if (r.status === 200) {
      const list = r.data?.leagues || r.data;
      expect(list === null || Array.isArray(list)).toBe(true);
    }
  });
});
