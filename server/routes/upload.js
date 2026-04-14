const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/index');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// Ensure upload directory exists
const UPLOAD_DIR = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif']);

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTS.has(ext)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and GIF files are allowed'));
  },
});

// POST /api/upload/avatar
// Body: multipart/form-data with fields: avatar (file), leagueId (text)
router.post('/avatar', authMiddleware, (req, res) => {
  upload.single('avatar')(req, res, async (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 2MB.' });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const { leagueId } = req.body;
      if (!leagueId) return res.status(400).json({ error: 'leagueId is required' });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const member = await db.get(
        'SELECT * FROM league_members WHERE league_id = ? AND user_id = ?',
        leagueId, req.user.id
      );

      if (!member) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ error: 'You are not a member of this league' });
      }

      // Delete old avatar file if one exists
      if (member.avatar_url) {
        const oldPath = path.join(__dirname, '../../', member.avatar_url.replace(/^\//, ''));
        if (fs.existsSync(oldPath)) {
          try { fs.unlinkSync(oldPath); } catch {}
        }
      }

      const avatarUrl = `/uploads/avatars/${req.file.filename}`;
      await db.run('UPDATE league_members SET avatar_url = ? WHERE league_id = ? AND user_id = ?',
        avatarUrl, leagueId, req.user.id);

      res.json({ avatarUrl });
    } catch (err) {
      console.error('avatar upload error:', err);
      if (req.file) try { fs.unlinkSync(req.file.path); } catch {}
      res.status(500).json({ error: 'Server error: ' + err.message });
    }
  });
});

// DELETE /api/upload/avatar
router.delete('/avatar', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.body;
    if (!leagueId) return res.status(400).json({ error: 'leagueId is required' });

    const member = await db.get(
      'SELECT * FROM league_members WHERE league_id = ? AND user_id = ?',
      leagueId, req.user.id
    );

    if (!member) return res.status(403).json({ error: 'Not a member' });

    if (member.avatar_url) {
      const filePath = path.join(__dirname, '../../', member.avatar_url.replace(/^\//, ''));
      if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch {}
      await db.run('UPDATE league_members SET avatar_url = NULL WHERE league_id = ? AND user_id = ?',
        leagueId, req.user.id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
