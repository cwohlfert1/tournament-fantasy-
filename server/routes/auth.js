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
router.post('/register', async (req, res) => {
  try {
    const { email, username, password, agreement_accepted, age_confirmed, state_eligible, ref_code } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!agreement_accepted || !age_confirmed || !state_eligible) {
      return res.status(400).json({ error: 'Please complete all required acknowledgments to continue.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existing) {
      return res.status(409).json({ error: 'Email or username already taken' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, agreement_accepted, age_confirmed, state_eligible)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, email, username, password_hash, 1, 1, 1);

    const user = { id, email, username };
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
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Accept email or username in the email field.
    // Select only the fields needed for auth — never pull password_hash into
    // a variable that could accidentally be serialised into a response.
    const user = db.prepare(
      'SELECT id, email, username, role, password_hash FROM users WHERE email = ? OR username = ?'
    ).get(email, email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, username: user.username, role: user.role || 'user' } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

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

    const password_hash = await bcrypt.hash(password, 10);
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
  const user = db.prepare('SELECT id, email, username, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

module.exports = router;
