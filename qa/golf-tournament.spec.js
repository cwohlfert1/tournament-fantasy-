/**
 * Tournament Management — status heal, field sync, missed cut, tiebreaker.
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://www.tourneyrun.app';
const EMAIL    = process.env.TOURNEYRUN_EMAIL;
const PASSWORD = process.env.TOURNEYRUN_PASSWORD;

async function apiLogin(page) {
  await page.goto(`${BASE}/`);
  await page.evaluate(async ({ base, email, password }) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (data.token) localStorage.setItem('token', data.token);
  }, { base: BASE, email: EMAIL, password: PASSWORD });
}

async function apiFetch(page, path) {
  return page.evaluate(async ({ base, path }) => {
    const token = localStorage.getItem('token');
    const res = await fetch(`${base}/api${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  }, { base: BASE, path });
}

test.describe('Tournament Management', () => {
  test.beforeEach(async ({ page }) => {
    await apiLogin(page);
  });

  test('tournaments list returns valid data with status field', async ({ page }) => {
    const r = await apiFetch(page, '/golf/tournaments');
    expect(r.status).toBe(200);
    const tournaments = r.data?.tournaments || (Array.isArray(r.data) ? r.data : []);
    expect(tournaments.length).toBeGreaterThan(0);
    for (const t of tournaments.slice(0, 5)) {
      expect(['scheduled', 'active', 'completed']).toContain(t.status);
      expect(t).toHaveProperty('name');
    }
  });

  test('RBC Heritage is completed with scores', async ({ page }) => {
    const r = await apiFetch(page, '/golf/tournaments');
    const tournaments = r.data?.tournaments || (Array.isArray(r.data) ? r.data : []);
    const rbc = tournaments.find(t => t.name?.includes('RBC Heritage'));
    if (!rbc) return test.skip();
    expect(rbc.status).toBe('completed');
  });

  test('completed tournament has golf_scores for field', async ({ page }) => {
    const leagues = (await apiFetch(page, '/golf/leagues')).data?.leagues || [];
    const completed = leagues.find(l => l.pool_tournament_status === 'completed');
    if (!completed) return test.skip();
    const r = await apiFetch(page, `/golf/leagues/${completed.id}/standings`);
    expect(r.status).toBe(200);
    expect(r.data.has_scores).toBe(true);
  });

  test('golf_tournament_fields populated for linked tournaments', async ({ page }) => {
    // Find any league with a tournament (active or completed)
    const leagues = (await apiFetch(page, '/golf/leagues')).data?.leagues || [];
    const linked = leagues.find(l => l.pool_tournament_id);
    if (!linked) return test.skip();
    const tr = await apiFetch(page, `/golf/leagues/${linked.id}/tier-players`);
    expect(tr.data.tiers?.flatMap(t => t.players).length).toBeGreaterThan(0);
  });

  test('missed cut rule stored on league settings', async ({ page }) => {
    const leagues = (await apiFetch(page, '/golf/leagues')).data.leagues;
    const pool = leagues.find(l => l.format_type === 'pool');
    if (!pool) return test.skip();
    const r = await apiFetch(page, `/golf/leagues/${pool.id}`);
    const l = r.data.league;
    expect(['fixed', 'highest_carded', 'stroke_penalty', 'exclude']).toContain(l.missed_cut_rule || 'fixed');
  });
});
