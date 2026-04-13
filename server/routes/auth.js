const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { sendPasswordReset, sendWelcome } = require('../mailer');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// ── Referral code helpers ────────────────────────────────────────────────────
const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars; 256 % 32 === 0
function genReferralCode() {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += REF_CHARS[bytes[i] % REF_CHARS.length];
  return code;
}

function ensureUserReferralCode(userId) {
  const row = db.prepare('SELECT referral_code FROM users WHERE id = ?').get(userId);
  if (row?.referral_code) return row.referral_code;
  let code, attempts = 0;
  do {
    code = genReferralCode();
    attempts++;
  } while (db.prepare('SELECT 1 FROM users WHERE referral_code = ?').get(code) && attempts < 20);
  db.prepare('UPDATE users SET referral_code = ? WHERE id = ?').run(code, userId);
  return code;
}

// POST /api/auth/register
// Rate limited: 5 registrations per IP per hour (limiter applied in index.js)
router.post('/register', (req, res, next) => { const limiter = req.app.get('registerLimiter'); return limiter ? limiter(req, res, next) : next(); }, async (req, res) => {
  try {
    const { email, username, password, full_name, agreement_accepted, age_confirmed, state_eligible, ref_code } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }
    // Input validation — OWASP: validate format, length, and type
    if (typeof email !== 'string' || typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input types' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (email.length > 254) {
      return res.status(400).json({ error: 'Email too long' });
    }
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 2-30 characters (letters, numbers, hyphens, underscores)' });
    }
    if (password.length < 6 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be 6-128 characters' });
    }
    if (full_name && (typeof full_name !== 'string' || full_name.length > 100)) {
      return res.status(400).json({ error: 'Full name must be under 100 characters' });
    }
    if (!agreement_accepted || !age_confirmed || !state_eligible) {
      return res.status(400).json({ error: 'Please complete all required acknowledgments to continue.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existing) {
      return res.status(409).json({ error: 'Email or username already taken' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const id = uuidv4();
    const fullNameTrimmed = full_name ? full_name.trim() : null;
    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, full_name, agreement_accepted, age_confirmed, state_eligible)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, email, username, password_hash, fullNameTrimmed, 1, 1, 1);

    const user = { id, email, username, full_name: fullNameTrimmed };
    const token = signToken(user);
    res.status(201).json({ token, user });

    // Referral tracking — fire and forget, never blocks registration
    if (ref_code) {
      try {
        const referrer = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(ref_code.trim().toUpperCase());
        if (referrer && referrer.id !== id) {
          db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(referrer.id, id);
          db.prepare('INSERT OR IGNORE INTO referrals (id, referrer_id, referred_id) VALUES (?, ?, ?)').run(uuidv4(), referrer.id, id);
        }
      } catch (refErr) {
        console.error('[auth] referral tracking error:', refErr.message);
      }
    }

    // Send welcome email — fire and forget, don't block registration
    sendWelcome(email, username).catch(err => console.error('Welcome email failed:', err));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
// Rate limited: 10 attempts per IP per 15 min
router.post('/login', (req, res, next) => { const limiter = req.app.get('authLimiter'); return limiter ? limiter(req, res, next) : next(); }, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    // Input validation
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input' });
    }
    if (email.length > 254 || password.length > 128) {
      return res.status(400).json({ error: 'Input too long' });
    }

    // Accept email or username in the email field.
    // LOWER() on both sides handles case-insensitive email lookup (e.g. User@Example.com
    // matches user@example.com). SQLite = is case-sensitive for TEXT by default.
    const user = db.prepare(
      'SELECT id, email, username, role, password_hash, force_password_reset FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)'
    ).get(email, email);
    if (!user) {
      // Don't log full email — OWASP: avoid PII in logs
      console.warn(`[login] failed login attempt`);
      return res.status(401).json({ error: 'Email or password is incorrect. Please try again.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      console.error(`[login] bcrypt mismatch for user: "${user.email}"`);
      return res.status(401).json({ error: 'Email or password is incorrect. Please try again.' });
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, username: user.username, role: user.role || 'user', force_password_reset: user.force_password_reset === 1 } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/force-reset-password
// Used when a superadmin has set a temp password and the user must change it on first login.
// Requires a valid Bearer token (user already authenticated with the temp password).
router.post('/force-reset-password', authMiddleware, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ?, force_password_reset = 0 WHERE id = ?').run(hash, req.user.id);
    console.log(`[force-reset-password] user ${req.user.id} set new password`);
    res.json({ ok: true });
  } catch (err) {
    console.error('[force-reset-password]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/forgot-password
// Rate limited: 5 requests per IP per hour
router.post('/forgot-password', (req, res, next) => { const limiter = req.app.get('passwordResetLimiter'); return limiter ? limiter(req, res, next) : next(); }, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || email.length > 254) return res.status(400).json({ error: 'Valid email is required' });

    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
    // Always respond with success to avoid email enumeration
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    db.prepare('UPDATE users SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?')
      .run(token, expires, user.id);

    const clientUrl = process.env.CLIENT_URL
      ? process.env.CLIENT_URL.replace(/\/$/, '')
      : `https://${req.get('host')}`;
    const resetUrl = `${clientUrl}/reset-password?token=${token}`;

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Email send timed out after 8s')), 8000)
    );
    await Promise.race([sendPasswordReset(user.email, resetUrl), timeout]);
    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[forgot-password] error:', err.message);
    res.status(500).json({ error: 'Failed to send reset email. Please try again.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const user = db.prepare(
      'SELECT id FROM users WHERE password_reset_token = ? AND password_reset_expires > ?'
    ).get(token, new Date().toISOString());

    if (!user) return res.status(400).json({ error: 'Reset link is invalid or has expired' });

    const password_hash = await bcrypt.hash(password, 12);
    db.prepare(
      'UPDATE users SET password_hash = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?'
    ).run(password_hash, user.id);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/referral/my-code
router.get('/referral/my-code', authMiddleware, (req, res) => {
  try {
    const code = ensureUserReferralCode(req.user.id);
    const base = (process.env.CLIENT_URL || 'https://www.tourneyrun.app').replace(/\/$/, '');
    res.json({ code, link: `${base}/ref/${code}` });
  } catch (err) {
    console.error('[auth] referral/my-code error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Invite flow ──────────────────────────────────────────────────────────────

// GET /api/auth/invite/:token
// Returns the invited user's email + league name so the signup page can
// pre-fill and display context.  Token is single-use (cleared on activation).
router.get('/invite/:token', (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: 'Token required' });

    const user = db.prepare(
      "SELECT id, email FROM users WHERE invite_token = ? AND status = 'invited'"
    ).get(token);
    if (!user) return res.status(404).json({ error: 'Invite link is invalid or has already been used' });

    // Find the golf league this user was added to
    const membership = db.prepare(`
      SELECT gl.id AS leagueId, gl.name AS leagueName
      FROM golf_league_members glm
      JOIN golf_leagues gl ON gl.id = glm.golf_league_id
      WHERE glm.user_id = ?
      LIMIT 1
    `).get(user.id);

    res.json({
      email:      user.email,
      leagueName: membership?.leagueName || null,
      leagueId:   membership?.leagueId  || null,
    });
  } catch (err) {
    console.error('[auth] invite lookup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/activate
// Activates an invited account: sets username + password, marks status active,
// clears the invite token, then returns a JWT so the user is immediately logged in.
router.post('/activate', async (req, res) => {
  try {
    const { token, username, password } = req.body;
    if (!token || !username || !password) {
      return res.status(400).json({ error: 'Token, username, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = db.prepare(
      "SELECT id, email FROM users WHERE invite_token = ? AND status = 'invited'"
    ).get(token);
    if (!user) return res.status(400).json({ error: 'Invite link is invalid or has already been used' });

    // Check username not already taken
    const taken = db.prepare('SELECT 1 FROM users WHERE username = ? AND id != ?').get(username, user.id);
    if (taken) return res.status(409).json({ error: 'Username is already taken' });

    const password_hash = await bcrypt.hash(password, 12);
    db.prepare(`
      UPDATE users
      SET username = ?, password_hash = ?, status = 'active',
          invite_token = NULL, agreement_accepted = 1, age_confirmed = 1, state_eligible = 1
      WHERE id = ?
    `).run(username, password_hash, user.id);

    const fullUser = { id: user.id, email: user.email, username };
    const jwtToken = signToken(fullUser);
    res.json({ token: jwtToken, user: { id: user.id, email: user.email, username, role: 'user' } });
  } catch (err) {
    console.error('[auth] activate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, username, full_name, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

module.exports = router;
