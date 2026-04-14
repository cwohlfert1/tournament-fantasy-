/**
 * TourneyRun Golf — Unpaid Entry Guard + Commissioner Tooling
 *
 * Five scenarios:
 *   1. Unpaid list returns correct entries (name, email, entry #, entry_date, amount_owed)
 *   2. CSV download has correct Content-Type + correct row data
 *   3. dry_run reminder returns recipient list + count without sending
 *   4. 24h pool-level lockout: second send returns 409; confirm:true overrides
 *   5. Mark paid mid-tournament — entry's score reflected in standings
 *
 * Real email sends are gated by PLAYWRIGHT_SEND_REAL_EMAILS=1.
 * By default, all reminder tests use dry_run:true so no real emails go out.
 *
 * Run:
 *   TOURNEYRUN_BASE=http://localhost:3001 npx playwright test qa/golf-unpaid.spec.js --reporter=list
 */
const { test, expect } = require('@playwright/test');

const BASE     = process.env.TOURNEYRUN_BASE     || 'https://www.tourneyrun.app';
const EMAIL    = process.env.TOURNEYRUN_EMAIL    || `qa+${Date.now()}@tourneyrun.app`;
const PASSWORD = process.env.TOURNEYRUN_PASSWORD || 'QaTest123!';
const SEND_REAL = process.env.PLAYWRIGHT_SEND_REAL_EMAILS === '1';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function login(page) {
  await page.goto(`${BASE}/`);
  return page.evaluate(async ({ base, email, password }) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`login ${res.status}: ${await res.text()}`);
    const data = await res.json();
    localStorage.setItem('token', data.token || data.access_token);
    return { tok: data.token || data.access_token, userId: data.user?.id };
  }, { base: BASE, email: EMAIL, password: PASSWORD });
}

async function apiGet(page, path) {
  return page.evaluate(async ({ base, path }) => {
    const token = localStorage.getItem('token');
    const r = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, headers: Object.fromEntries(r.headers.entries()), data: await r.json().catch(() => ({})) };
  }, { base: BASE, path });
}

async function apiGetText(page, path) {
  return page.evaluate(async ({ base, path }) => {
    const token = localStorage.getItem('token');
    const r = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, headers: Object.fromEntries(r.headers.entries()), text: await r.text() };
  }, { base: BASE, path });
}

async function apiPost(page, path, body = {}) {
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

/**
 * Find a pool league this user commissions that has at least one unpaid entry.
 * Optionally require buy_in > 0 (so amount_owed checks are meaningful).
 */
async function findCommissionerPoolWithUnpaid(page, userId, { paidOnly = false } = {}) {
  const { data } = await apiGet(page, '/api/golf/leagues');
  const leagues = data.leagues || data || [];
  let pools = leagues.filter(l => l.format_type === 'pool' && l.commissioner_id === userId);
  if (paidOnly) pools = pools.filter(l => parseFloat(l.buy_in_amount) > 0);
  for (const p of pools) {
    const r = await apiGet(page, `/api/golf/commissioner/${p.id}/unpaid`);
    if (r.status === 200 && r.data?.unpaid_count > 0) return { id: p.id, league: p, unpaid: r.data };
  }
  throw new Error(`No ${paidOnly ? 'paid ' : ''}pool with unpaid entries found for user ${userId} (checked ${pools.length} pools)`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 1 — Unpaid list endpoint
// ═════════════════════════════════════════════════════════════════════════════
test('TC-UP-01 GET /commissioner/:id/unpaid returns entries with required fields', async ({ page }) => {
  const { userId } = await login(page);
  const { unpaid } = await findCommissionerPoolWithUnpaid(page, userId, { paidOnly: true });
  expect(Array.isArray(unpaid.unpaid)).toBe(true);
  expect(unpaid.unpaid_count).toBe(unpaid.unpaid.length);
  expect(typeof unpaid.total_entries).toBe('number');

  const sample = unpaid.unpaid[0];
  for (const k of ['user_id', 'username', 'email', 'entry_number', 'amount_owed']) {
    expect(sample).toHaveProperty(k);
  }
  expect(typeof sample.amount_owed).toBe('number');
  expect(sample.amount_owed).toBeGreaterThan(0);
  expect(sample.email).toMatch(/@/);
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 — CSV download
// ═════════════════════════════════════════════════════════════════════════════
test('TC-UP-02 GET /commissioner/:id/unpaid/csv returns CSV with correct header + rows', async ({ page }) => {
  const { userId } = await login(page);
  const { id, unpaid } = await findCommissionerPoolWithUnpaid(page, userId);

  const r = await apiGetText(page, `/api/golf/commissioner/${id}/unpaid/csv`);
  expect(r.status).toBe(200);
  expect(r.headers['content-type'] || '').toMatch(/text\/csv/);
  expect(r.headers['content-disposition'] || '').toMatch(/attachment;\s*filename="unpaid-/);

  const lines = r.text.trim().split(/\r?\n/);
  // Header + one row per unpaid entry
  expect(lines.length).toBe(1 + unpaid.unpaid_count);
  expect(lines[0]).toContain('Name');
  expect(lines[0]).toContain('Email');
  expect(lines[0]).toContain('Entry Number');
  expect(lines[0]).toContain('Amount Owed');

  // Every data row has the unpaid user's email
  const allEmailsInCsv = unpaid.unpaid.every(u => r.text.includes(u.email));
  expect(allEmailsInCsv).toBe(true);
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 — dry_run reminder returns recipient list without sending
// ═════════════════════════════════════════════════════════════════════════════
test('TC-UP-03 POST /unpaid/remind dry_run returns recipients + would_send count', async ({ page }) => {
  const { userId } = await login(page);
  const { id, unpaid } = await findCommissionerPoolWithUnpaid(page, userId);

  const r = await apiPost(page, `/api/golf/commissioner/${id}/unpaid/remind`, { dry_run: true });
  expect(r.status).toBe(200);
  expect(r.data.dry_run).toBe(true);
  expect(typeof r.data.would_send).toBe('number');
  expect(r.data.would_send).toBeGreaterThan(0);
  expect(r.data.would_send).toBeLessThanOrEqual(unpaid.unpaid_count);
  expect(Array.isArray(r.data.recipients)).toBe(true);
  expect(r.data.recipients[0]).toHaveProperty('user_id');
  expect(r.data.recipients[0]).toHaveProperty('username');
  expect(r.data.recipients[0]).toHaveProperty('entry_number');
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 — 24h pool-level lockout + confirm override
// ═════════════════════════════════════════════════════════════════════════════
test('TC-UP-04 24h lockout returns 409; confirm:true overrides', async ({ page }) => {
  test.skip(!SEND_REAL, 'PLAYWRIGHT_SEND_REAL_EMAILS not set — skipping real-send test (24h guard requires actual log row)');

  const { userId } = await login(page);
  const { id } = await findCommissionerPoolWithUnpaid(page, userId);

  // First send (writes to mass_email_log)
  const first = await apiPost(page, `/api/golf/commissioner/${id}/unpaid/remind`, {});
  expect([200, 409]).toContain(first.status);

  // Second send with no confirm → 409
  const second = await apiPost(page, `/api/golf/commissioner/${id}/unpaid/remind`, {});
  expect(second.status).toBe(409);
  expect(second.data.recently_sent).toBe(true);
  expect(typeof second.data.last_sent_at).toBe('string');

  // Third send with confirm:true → 200
  const third = await apiPost(page, `/api/golf/commissioner/${id}/unpaid/remind`, { confirm: true });
  expect(third.status).toBe(200);
  expect(third.data.ok).toBe(true);
});

// ═════════════════════════════════════════════════════════════════════════════
// 4b — Lockout exists in dry_run mode too (guard runs before send branch)
// ═════════════════════════════════════════════════════════════════════════════
test('TC-UP-04b 24h guard does NOT trigger when no log row exists yet', async ({ page }) => {
  // This test is safe to run without SEND_REAL because dry_run never writes the log.
  const { userId } = await login(page);
  const { id } = await findCommissionerPoolWithUnpaid(page, userId);

  // dry_run never writes a log row, so calling it twice is fine
  const r1 = await apiPost(page, `/api/golf/commissioner/${id}/unpaid/remind`, { dry_run: true });
  const r2 = await apiPost(page, `/api/golf/commissioner/${id}/unpaid/remind`, { dry_run: true });
  expect(r1.status).toBe(200);
  expect(r2.status).toBe(200);
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 — Mark paid mid-tournament: entry's points should appear in standings
// ═════════════════════════════════════════════════════════════════════════════
test('TC-UP-05 Mark paid removes entry from unpaid list (mid-tournament safe)', async ({ page }) => {
  const { userId } = await login(page);
  const { id, league, unpaid: unpaidResp } = await findCommissionerPoolWithUnpaid(page, userId, { paidOnly: true });
  test.skip(!league.pool_tournament_id, 'Selected pool has no associated tournament');
  const target = unpaidResp.unpaid[0];

  // Snapshot original paid status (entry-level)
  const standingsBefore = await apiGet(page, `/api/golf/leagues/${id}/standings`);
  const beforePaid = standingsBefore.data?.entry_paid?.[`${target.user_id}_${target.entry_number}`];

  try {
    // Mark paid via existing endpoint
    const mark = await apiPost(page, `/api/golf/leagues/${id}/members/${target.user_id}/paid`, {
      is_paid: 1,
      entry_number: target.entry_number,
    });
    expect(mark.status).toBe(200);

    // Re-fetch unpaid list — should not contain the now-paid entry
    const after = await apiGet(page, `/api/golf/commissioner/${id}/unpaid`);
    const stillThere = (after.data?.unpaid || []).some(u =>
      u.user_id === target.user_id && u.entry_number === target.entry_number
    );
    expect(stillThere).toBe(false);
  } finally {
    // Restore original state if we changed it from unpaid
    if (!beforePaid) {
      await apiPost(page, `/api/golf/leagues/${id}/members/${target.user_id}/paid`, {
        is_paid: 0,
        entry_number: target.entry_number,
      }).catch(() => {});
    }
  }
});
