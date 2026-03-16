const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { cleanText } = require('../contentFilter');

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPostsWithDetails(leagueId) {
  const posts = db.prepare(`
    SELECT wp.*, u.username, u.avatar_url AS user_avatar,
           lm.team_name, lm.avatar_url AS team_avatar
    FROM wall_posts wp
    LEFT JOIN users u ON wp.user_id = u.id
    LEFT JOIN league_members lm ON lm.user_id = wp.user_id AND lm.league_id = wp.league_id
    WHERE wp.league_id = ?
    ORDER BY wp.created_at DESC
    LIMIT 100
  `).all(leagueId);

  return posts.map(post => {
    const reactions = db.prepare(`
      SELECT reaction_type, COUNT(*) AS count, GROUP_CONCAT(user_id) AS user_ids
      FROM wall_reactions WHERE post_id = ? GROUP BY reaction_type
    `).all(post.id);

    const replies = db.prepare(`
      SELECT wr.*, u.username, u.avatar_url AS user_avatar,
             lm.team_name, lm.avatar_url AS team_avatar
      FROM wall_replies wr
      LEFT JOIN users u ON wr.user_id = u.id
      LEFT JOIN league_members lm ON lm.user_id = wr.user_id AND lm.league_id = ?
      WHERE wr.post_id = ?
      ORDER BY wr.created_at ASC
    `).all(leagueId, post.id);

    const reactionMap = {};
    for (const r of reactions) {
      reactionMap[r.reaction_type] = {
        count: r.count,
        userIds: r.user_ids ? r.user_ids.split(',') : [],
      };
    }

    return { ...post, reactions: reactionMap, replies };
  });
}

function getChatHistory(leagueId, limit = 50) {
  return db.prepare(`
    SELECT * FROM league_chat_messages
    WHERE league_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(leagueId, limit).reverse();
}

// ── Wall endpoints ────────────────────────────────────────────────────────────

// GET /api/wall/league/:leagueId/posts
router.get('/league/:leagueId/posts', authMiddleware, (req, res) => {
  try {
    const member = db.prepare('SELECT id FROM league_members WHERE league_id = ? AND user_id = ?')
      .get(req.params.leagueId, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    res.json({ posts: getPostsWithDetails(req.params.leagueId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/wall/league/:leagueId/posts
router.post('/league/:leagueId/posts', authMiddleware, (req, res) => {
  try {
    const { leagueId } = req.params;
    const { text, gif_url } = req.body;
    const cleanedText = text ? cleanText(text.trim().slice(0, 500)) : '';
    if (!cleanedText && !gif_url) return res.status(400).json({ error: 'Post needs text or a GIF' });

    const member = db.prepare('SELECT team_name, avatar_url FROM league_members WHERE league_id = ? AND user_id = ?')
      .get(leagueId, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const id = uuidv4();
    db.prepare('INSERT INTO wall_posts (id, league_id, user_id, text, gif_url, is_system) VALUES (?, ?, ?, ?, ?, 0)')
      .run(id, leagueId, req.user.id, cleanedText, gif_url || '');

    const post = db.prepare(`
      SELECT wp.*, u.username, u.avatar_url AS user_avatar,
             lm.team_name, lm.avatar_url AS team_avatar
      FROM wall_posts wp
      LEFT JOIN users u ON wp.user_id = u.id
      LEFT JOIN league_members lm ON lm.user_id = wp.user_id AND lm.league_id = wp.league_id
      WHERE wp.id = ?
    `).get(id);

    const fullPost = { ...post, reactions: {}, replies: [] };
    const io = req.app.get('io');
    if (io) io.to(`league_${leagueId}`).emit('wall_new_post', fullPost);

    res.status(201).json({ post: fullPost });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/wall/posts/:postId
router.delete('/posts/:postId', authMiddleware, (req, res) => {
  try {
    const post = db.prepare('SELECT * FROM wall_posts WHERE id = ?').get(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const league = db.prepare('SELECT commissioner_id FROM leagues WHERE id = ?').get(post.league_id);
    if (post.user_id !== req.user.id && league?.commissioner_id !== req.user.id && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Cannot delete this post' });
    }

    db.prepare('DELETE FROM wall_reactions WHERE post_id = ?').run(req.params.postId);
    db.prepare('DELETE FROM wall_replies WHERE post_id = ?').run(req.params.postId);
    db.prepare('DELETE FROM wall_posts WHERE id = ?').run(req.params.postId);

    const io = req.app.get('io');
    if (io) io.to(`league_${post.league_id}`).emit('wall_post_deleted', { postId: req.params.postId });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/wall/posts/:postId/react
router.post('/posts/:postId/react', authMiddleware, (req, res) => {
  try {
    const { reaction_type } = req.body;
    if (!['respect', 'fire'].includes(reaction_type)) return res.status(400).json({ error: 'Invalid reaction' });

    const post = db.prepare('SELECT league_id FROM wall_posts WHERE id = ?').get(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const existing = db.prepare('SELECT id FROM wall_reactions WHERE post_id = ? AND user_id = ? AND reaction_type = ?')
      .get(req.params.postId, req.user.id, reaction_type);

    if (existing) {
      db.prepare('DELETE FROM wall_reactions WHERE id = ?').run(existing.id);
    } else {
      db.prepare('INSERT INTO wall_reactions (id, post_id, user_id, reaction_type) VALUES (?, ?, ?, ?)')
        .run(uuidv4(), req.params.postId, req.user.id, reaction_type);
    }

    const reactions = db.prepare(`
      SELECT reaction_type, COUNT(*) AS count, GROUP_CONCAT(user_id) AS user_ids
      FROM wall_reactions WHERE post_id = ? GROUP BY reaction_type
    `).all(req.params.postId);

    const reactionMap = {};
    for (const r of reactions) {
      reactionMap[r.reaction_type] = { count: r.count, userIds: r.user_ids ? r.user_ids.split(',') : [] };
    }

    const io = req.app.get('io');
    if (io) io.to(`league_${post.league_id}`).emit('wall_reaction_update', { postId: req.params.postId, reactions: reactionMap });

    res.json({ reactions: reactionMap });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/wall/posts/:postId/replies
router.post('/posts/:postId/replies', authMiddleware, (req, res) => {
  try {
    const post = db.prepare('SELECT league_id FROM wall_posts WHERE id = ?').get(req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const { text, gif_url } = req.body;
    const cleanedText = text ? cleanText(text.trim().slice(0, 500)) : '';
    if (!cleanedText && !gif_url) return res.status(400).json({ error: 'Reply needs text or a GIF' });

    const member = db.prepare('SELECT team_name FROM league_members WHERE league_id = ? AND user_id = ?')
      .get(post.league_id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const id = uuidv4();
    db.prepare('INSERT INTO wall_replies (id, post_id, user_id, text, gif_url) VALUES (?, ?, ?, ?, ?)')
      .run(id, req.params.postId, req.user.id, cleanedText, gif_url || '');

    const reply = db.prepare(`
      SELECT wr.*, u.username, u.avatar_url AS user_avatar,
             lm.team_name, lm.avatar_url AS team_avatar
      FROM wall_replies wr
      LEFT JOIN users u ON wr.user_id = u.id
      LEFT JOIN league_members lm ON lm.user_id = wr.user_id AND lm.league_id = ?
      WHERE wr.id = ?
    `).get(post.league_id, id);

    const io = req.app.get('io');
    if (io) io.to(`league_${post.league_id}`).emit('wall_new_reply', { postId: req.params.postId, reply });

    res.status(201).json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/wall/replies/:replyId
router.delete('/replies/:replyId', authMiddleware, (req, res) => {
  try {
    const reply = db.prepare(`
      SELECT wr.*, wp.league_id FROM wall_replies wr
      JOIN wall_posts wp ON wr.post_id = wp.id WHERE wr.id = ?
    `).get(req.params.replyId);
    if (!reply) return res.status(404).json({ error: 'Reply not found' });

    const league = db.prepare('SELECT commissioner_id FROM leagues WHERE id = ?').get(reply.league_id);
    if (reply.user_id !== req.user.id && league?.commissioner_id !== req.user.id && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Cannot delete this reply' });
    }

    db.prepare('DELETE FROM wall_replies WHERE id = ?').run(req.params.replyId);

    const io = req.app.get('io');
    if (io) io.to(`league_${reply.league_id}`).emit('wall_reply_deleted', { replyId: req.params.replyId, postId: reply.post_id });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── League chat (persisted) ───────────────────────────────────────────────────

// GET /api/wall/league/:leagueId/chat
router.get('/league/:leagueId/chat', authMiddleware, (req, res) => {
  try {
    const member = db.prepare('SELECT id FROM league_members WHERE league_id = ? AND user_id = ?')
      .get(req.params.leagueId, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    res.json({ messages: getChatHistory(req.params.leagueId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { router, getChatHistory };
