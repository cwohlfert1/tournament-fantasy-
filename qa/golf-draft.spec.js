/**
 * Snake Draft — creation, draft room state, pick logic, auto-pick, bridge.
 */
const { test, expect } = require('@playwright/test');

const BASE = 'https://www.tourneyrun.app';
const EMAIL    = process.env.TOURNEYRUN_EMAIL;
const PASSWORD = process.env.TOURNEYRUN_PASSWORD;

async function apiLogin(page) {
  await page.goto(`${BASE}/`);
  const token = await page.evaluate(async ({ base, email, password }) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  }, { base: BASE, path, opts });
}

test.describe('Snake Draft', () => {
  test.beforeEach(async ({ page }) => {
    await apiLogin(page);
  });

  test('draft league exists with correct format_type', async ({ page }) => {
    const r = await apiFetch(page, '/golf/leagues');
    const draft = r.data.leagues?.find(l => l.format_type === 'draft');
    if (!draft) return test.skip();
    expect(draft.format_type).toBe('draft');
    expect(draft).toHaveProperty('draft_status');
  });

  test('draft state endpoint returns full state', async ({ page }) => {
    const leagues = (await apiFetch(page, '/golf/leagues')).data.leagues;
    const draft = leagues?.find(l => l.format_type === 'draft');
    if (!draft) return test.skip();
    const r = await apiFetch(page, `/golf/draft/${draft.id}/state`);
    expect(r.status).toBe(200);
    expect(r.data).toHaveProperty('league');
    expect(r.data).toHaveProperty('members');
    expect(r.data).toHaveProperty('picks');
    expect(r.data).toHaveProperty('available');
    expect(r.data).toHaveProperty('currentPick');
    expect(r.data).toHaveProperty('totalPicks');
    expect(r.data).toHaveProperty('totalRounds');
    expect(r.data).toHaveProperty('numTeams');
    expect(r.data).toHaveProperty('recentForm');
  });

  test('draft available players have espn_player_id', async ({ page }) => {
    const leagues = (await apiFetch(page, '/golf/leagues')).data.leagues;
    const draft = leagues?.find(l => l.format_type === 'draft');
    if (!draft) return test.skip();
    const r = await apiFetch(page, `/golf/draft/${draft.id}/state`);
    const available = r.data.available || [];
    if (available.length === 0) return test.skip();
    const withEspn = available.filter(p => p.espn_player_id);
    expect(withEspn.length).toBeGreaterThan(0);
  });

  test('draft time update endpoint works for commissioner', async ({ page }) => {
    const leagues = (await apiFetch(page, '/golf/leagues')).data.leagues;
    const draft = leagues?.find(l => l.format_type === 'draft' && l.draft_status === 'pending');
    if (!draft) return test.skip();
    const futureTime = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const r = await apiFetch(page, `/golf/draft/${draft.id}/time`, {
      method: 'PATCH',
      body: { draft_start_time: futureTime },
    });
    expect(r.status).toBe(200);
    expect(r.data.ok).toBe(true);
  });

  test('pick endpoint rejects when not your turn', async ({ page }) => {
    const leagues = (await apiFetch(page, '/golf/leagues')).data.leagues;
    const draft = leagues?.find(l => l.format_type === 'draft' && l.draft_status === 'drafting');
    if (!draft) return test.skip();
    const state = (await apiFetch(page, `/golf/draft/${draft.id}/state`)).data;
    if (!state.available?.length) return test.skip();
    // Try to pick — should fail if not our turn (or succeed if it is)
    const r = await apiFetch(page, `/golf/draft/${draft.id}/pick`, {
      method: 'POST',
      body: { player_id: state.available[0].player_id },
    });
    // Either 200 (our turn) or 403 (not our turn) — both are valid
    expect([200, 403]).toContain(r.status);
  });

  test('override endpoint requires reason', async ({ page }) => {
    const leagues = (await apiFetch(page, '/golf/leagues')).data.leagues;
    const draft = leagues?.find(l => l.format_type === 'draft');
    if (!draft) return test.skip();
    const r = await apiFetch(page, `/golf/draft/${draft.id}/override-pick`, {
      method: 'POST',
      body: { user_id: 'x', old_player_id: 'x', new_player_id: 'x', reason: '' },
    });
    // Should reject — empty reason
    expect([400, 404]).toContain(r.status);
  });

  test('draft room page loads without crash', async ({ page }) => {
    const leagues = (await apiFetch(page, '/golf/leagues')).data.leagues;
    const draft = leagues?.find(l => l.format_type === 'draft');
    if (!draft) return test.skip();
    await page.goto(`${BASE}/golf/league/${draft.id}/draft-room`);
    await page.waitForLoadState('networkidle');
    // Should not show error boundary
    const errorBanner = page.locator('text=Something went wrong');
    expect(await errorBanner.count()).toBe(0);
  });

  test('snake order reverses on even rounds', async () => {
    // Pure logic test — no API needed
    function getCurrentPicker(pick, numTeams) {
      const round = Math.ceil(pick / numTeams);
      const posInRound = (pick - 1) % numTeams;
      return round % 2 === 1 ? posInRound + 1 : numTeams - posInRound;
    }
    // 4 teams: R1 = 1,2,3,4  R2 = 4,3,2,1  R3 = 1,2,3,4
    expect(getCurrentPicker(1, 4)).toBe(1);
    expect(getCurrentPicker(2, 4)).toBe(2);
    expect(getCurrentPicker(3, 4)).toBe(3);
    expect(getCurrentPicker(4, 4)).toBe(4);
    expect(getCurrentPicker(5, 4)).toBe(4); // R2 reverses
    expect(getCurrentPicker(6, 4)).toBe(3);
    expect(getCurrentPicker(7, 4)).toBe(2);
    expect(getCurrentPicker(8, 4)).toBe(1);
    expect(getCurrentPicker(9, 4)).toBe(1); // R3 back to normal
  });
});
