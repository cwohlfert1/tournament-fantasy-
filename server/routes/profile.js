const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ── Upload helpers ─────────────────────────────────────────────────────────

const AVATAR_DIR = path.join(__dirname, '../../uploads/avatars');
const LOGO_DIR   = path.join(__dirname, '../../uploads/logos');
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });
if (!fs.existsSync(LOGO_DIR))   fs.mkdirSync(LOGO_DIR,   { recursive: true });

const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

function makeUploader(dir) {
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uuidv4()}${ext}`);
      },
    }),
    limits: { fileSize: 3 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ALLOWED_EXTS.has(ext)) cb(null, true);
      else cb(new Error('Only JPG, PNG, GIF, and WebP files are allowed'));
    },
  });
}

function deleteFile(urlPath) {
  if (!urlPath) return;
  try {
    const p = path.join(__dirname, '../../', urlPath.replace(/^\//, ''));
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
}

const avatarUploader = makeUploader(AVATAR_DIR);
const logoUploader   = makeUploader(LOGO_DIR);

// ── GET /api/profile ────────────────────────────────────────────────────────
router.get('/', authMiddleware, (req, res) => {
  const user = db.prepare(`
    SELECT id, email, username, full_name, avatar_url, default_team_name, team_logo_url,
           venmo_handle, notif_turn, notif_draft_start, notif_standings_recap,
           referral_code, created_at
    FROM users WHERE id = ?
  `).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Auto-generate referral code on first load
  if (!user.referral_code) {
    const code = Math.random().toString(36).substring(2, 9).toUpperCase();
    db.prepare('UPDATE users SET referral_code = ? WHERE id = ?').run(code, req.user.id);
    user.referral_code = code;
  }

  const { cnt: referral_count } = db.prepare(
    'SELECT COUNT(*) as cnt FROM referrals WHERE referrer_id = ?'
  ).get(req.user.id);

  res.json({ user: { ...user, referral_count } });
});

// ── PUT /api/profile ────────────────────────────────────────────────────────
router.put('/', authMiddleware, (req, res) => {
  try {
    const {
      username, email, full_name, venmo_handle, default_team_name,
      notif_turn, notif_draft_start, notif_standings_recap,
    } = req.body;

    // Input validation — OWASP: type checks + length limits
    if (username !== undefined) {
      if (typeof username !== 'string' || !username.trim()) return res.status(400).json({ error: 'Username cannot be blank' });
      if (!/^[a-zA-Z0-9_-]{2,30}$/.test(username.trim())) return res.status(400).json({ error: 'Username must be 2-30 characters (letters, numbers, hyphens, underscores)' });
      const taken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.trim(), req.user.id);
      if (taken) return res.status(409).json({ error: 'Username already taken' });
    }
    if (email !== undefined) {
      if (typeof email !== 'string' || !email.trim()) return res.status(400).json({ error: 'Email cannot be blank' });
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: 'Invalid email format' });
      const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email.trim(), req.user.id);
      if (taken) return res.status(409).json({ error: 'Email already in use' });
    }
    if (full_name !== undefined && typeof full_name === 'string' && full_name.length > 100) {
      return res.status(400).json({ error: 'Full name must be under 100 characters' });
    }
    if (venmo_handle !== undefined && typeof venmo_handle === 'string' && venmo_handle.length > 50) {
      return res.status(400).json({ error: 'Venmo handle too long' });
    }
    if (default_team_name !== undefined && typeof default_team_name === 'string' && default_team_name.length > 50) {
      return res.status(400).json({ error: 'Team name too long' });
    }

    const fields = [];
    const values = [];

    if (username !== undefined)           { fields.push('username = ?');              values.push(username.trim()); }
    if (email !== undefined)              { fields.push('email = ?');                 values.push(email.trim()); }
    if (full_name !== undefined)          { fields.push('full_name = ?');             values.push((full_name || '').trim() || null); }
    if (venmo_handle !== undefined)       { fields.push('venmo_handle = ?');          values.push(venmo_handle); }
    if (default_team_name !== undefined)  { fields.push('default_team_name = ?');     values.push(default_team_name); }
    if (notif_turn !== undefined)         { fields.push('notif_turn = ?');            values.push(notif_turn ? 1 : 0); }
    if (notif_draft_start !== undefined)  { fields.push('notif_draft_start = ?');     values.push(notif_draft_start ? 1 : 0); }
    if (notif_standings_recap !== undefined) { fields.push('notif_standings_recap = ?'); values.push(notif_standings_recap ? 1 : 0); }

    if (fields.length) {
      values.push(req.user.id);
      db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    const updated = db.prepare(`
      SELECT id, email, username, full_name, avatar_url, default_team_name, team_logo_url,
             venmo_handle, notif_turn, notif_draft_start, notif_standings_recap, referral_code
      FROM users WHERE id = ?
    `).get(req.user.id);
    res.json({ user: updated });
  } catch (err) {
    console.error('profile update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUT /api/profile/password ────────────────────────────────────────────────
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    const hash = await bcrypt.hash(newPassword, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/profile/avatar ─────────────────────────────────────────────────
router.post('/avatar', authMiddleware, (req, res) => {
  avatarUploader.single('avatar')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum 3 MB.' });
    }
    if (err) return res.status(400).json({ error: err.message });
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const user = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(req.user.id);
      deleteFile(user?.avatar_url);
      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.user.id);
      res.json({ avatarUrl });
    } catch (err) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      res.status(500).json({ error: 'Server error' });
    }
  });
});

// ── DELETE /api/profile/avatar ───────────────────────────────────────────────
router.delete('/avatar', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(req.user.id);
    deleteFile(user?.avatar_url);
    db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/profile/team-logo ──────────────────────────────────────────────
router.post('/team-logo', authMiddleware, (req, res) => {
  logoUploader.single('logo')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum 3 MB.' });
    }
    if (err) return res.status(400).json({ error: err.message });
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const user = db.prepare('SELECT team_logo_url FROM users WHERE id = ?').get(req.user.id);
      deleteFile(user?.team_logo_url);
      const logoUrl = `/uploads/logos/${req.file.filename}`;
      db.prepare('UPDATE users SET team_logo_url = ? WHERE id = ?').run(logoUrl, req.user.id);
      res.json({ logoUrl });
    } catch (err) {
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      res.status(500).json({ error: 'Server error' });
    }
  });
});

// ── DELETE /api/profile/team-logo ────────────────────────────────────────────
router.delete('/team-logo', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT team_logo_url FROM users WHERE id = ?').get(req.user.id);
    deleteFile(user?.team_logo_url);
    db.prepare('UPDATE users SET team_logo_url = NULL WHERE id = ?').run(req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/profile/stats ───────────────────────────────────────────────────
router.get('/stats', authMiddleware, (req, res) => {
  const userId = req.user.id;

  const { total_leagues } = db.prepare(
    'SELECT COUNT(*) as total_leagues FROM league_members WHERE user_id = ?'
  ).get(userId);

  // Leagues that have at least started (have picks or are active/completed)
  const activeLeagues = db.prepare(`
    SELECT DISTINCT l.id
    FROM leagues l
    JOIN league_members lm ON lm.league_id = l.id AND lm.user_id = ?
    WHERE l.status IN ('active', 'completed') OR l.draft_status = 'completed'
  `).all(userId);

  let best_finish = null;
  let wins = 0;
  let podiums = 0;
  let completed_leagues = 0;

  for (const { id: leagueId } of activeLeagues) {
    const standings = db.prepare(`
      SELECT user_id FROM league_members
      WHERE league_id = ? ORDER BY total_points DESC, joined_at ASC
    `).all(leagueId);
    const pos = standings.findIndex(m => m.user_id === userId) + 1;
    if (pos > 0) {
      completed_leagues++;
      if (best_finish === null || pos < best_finish) best_finish = pos;
      if (pos === 1) wins++;
      if (pos <= 3) podiums++;
    }
  }

  res.json({ stats: { total_leagues, completed_leagues, best_finish, wins, podiums } });
});

// ── DELETE /api/profile ──────────────────────────────────────────────────────
router.delete('/', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required to delete account' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });

    const activeLeague = db.prepare(`
      SELECT id FROM leagues WHERE commissioner_id = ? AND status NOT IN ('completed', 'active')
    `).get(req.user.id);
    if (activeLeague) {
      return res.status(403).json({
        error: 'You are the commissioner of an active league. The league must be completed first.',
      });
    }

    // Delete uploaded files
    deleteFile(user.avatar_url);
    deleteFile(user.team_logo_url);

    // Remove user data
    db.prepare('DELETE FROM draft_picks WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM member_payments WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM league_members WHERE user_id = ?').run(req.user.id);
    db.prepare('DELETE FROM referrals WHERE referrer_id = ? OR referred_id = ?').run(req.user.id, req.user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);

    res.json({ success: true });
  } catch (err) {
    console.error('delete account error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
