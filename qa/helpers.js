/**
 * Shared test helpers for Horse Racing Playwright tests.
 * Login once, cache token to disk to avoid rate limiting across spec files.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const EMAIL = process.env.TOURNEYRUN_EMAIL || 'qa@tourneyrun.app';
const PASSWORD = process.env.TOURNEYRUN_PASSWORD || 'QaTest123!';
const TOKEN_FILE = path.join(__dirname, '.test-token');

async function getToken() {
  // Check cached token (valid for 1 hour, JWT expires in 7 days)
  if (fs.existsSync(TOKEN_FILE)) {
    const { token, ts } = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    if (Date.now() - ts < 3600000) return token; // reuse if < 1hr old
  }

  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const token = data.token || data.access_token;
  if (!token) throw new Error('No token in response');

  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token, ts: Date.now() }));
  return token;
}

async function injectAuth(page) {
  const token = await getToken();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => { localStorage.setItem('token', t); }, token);
  return token;
}

async function apiGet(page, path) {
  const token = await getToken();
  return page.evaluate(async ({ base, path, token }) => {
    const r = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }, { base: BASE, path, token });
}

async function apiPost(page, path, body) {
  const token = await getToken();
  return page.evaluate(async ({ base, path, body, token }) => {
    const r = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  }, { base: BASE, path, body, token });
}

module.exports = { BASE, getToken, injectAuth, apiGet, apiPost };
