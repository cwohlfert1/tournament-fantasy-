const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/index');
const authMiddleware = require('../middleware/auth');
const { cleanText } = require('../contentFilter');

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getPostsWithDetails(leagueId) {
  const posts = await db.all(`
    SELECT wp.*, u.username, u.avatar_url AS user_avatar,
           lm.team_name, lm.avatar_url AS team_avatar
    FROM wall_posts wp
    LEFT JOIN users u ON wp.user_id = u.id
    LEFT JOIN league_members lm ON lm.user_id = wp.user_id AND lm.league_id = wp.league_id
    WHERE wp.league_id = ?
    ORDER BY wp.created_at DESC
    LIMIT 100
  `, leagueId);

  const results = [];
  for (const post of posts) {
    const reactions = await db.all(`
      SELECT reaction_type, COUNT(*) AS count, GROUP_CONCAT(user_id) AS user_ids
      FROM wall_reactions WHERE post_id = ? GROUP BY reaction_type
    `, post.id);

    const replies = await db.all(`
      SELECT wr.*, u.username, u.avatar_url AS user_avatar,
             lm.team_name, lm.avatar_url AS team_avatar
      FROM wall_replies wr
      LEFT JOIN users u ON wr.user_id = u.id
      LEFT JOIN league_members lm ON lm.user_id = wr.user_id AND lm.league_id = ?
      WHERE wr.post_id = ?
      ORDER BY wr.created_at ASC
    `, leagueId, post.id);

    const reactionMap = {};
    for (const r of reactions) {
      reactionMap[r.reaction_type] = {
        count: r.count,
        userIds: r.user_ids ? r.user_ids.split(',') : [],
      };
    }

    results.push({ ...post, reactions: reactionMap, replies });
  }

  return results;
}

async function getChatHistory(leagueId, limit = 50) {
  const rows = await db.all(`
    SELECT * FROM league_chat_messages
    WHERE league_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `, leagueId, limit);
  return rows.reverse();
}

// ── Wall endpoints ────────────────────────────────────────────────────────────

// GET /api/wall/league/:leagueId/posts
router.get('/league/:leagueId/posts', authMiddleware, async (req, res) => {
  try {
    const member = await db.get('SELECT id FROM league_members WHERE league_id = ? AND user_id = ?',
      req.params.leagueId, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    res.json({ posts: await getPostsWithDetails(req.params.leagueId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/wall/league/:leagueId/posts
router.post('/league/:leagueId/posts', authMiddleware, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { text, gif_url } = req.body;
    const cleanedText = text ? cleanText(text.trim().slice(0, 500)) : '';
    if (!cleanedText && !gif_url) return res.status(400).json({ error: 'Post needs text or a GIF' });

    const member = await db.get('SELECT team_name, avatar_url FROM league_members WHERE league_id = ? AND user_id = ?',
      leagueId, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const id = uuidv4();
    await db.run('INSERT INTO wall_posts (id, league_id, user_id, text, gif_url, is_system) VALUES (?, ?, ?, ?, ?, 0)',
      id, leagueId, req.user.id, cleanedText, gif_url || '');

    const post = await db.get(`
      SELECT wp.*, u.username, u.avatar_url AS user_avatar,
             lm.team_name, lm.avatar_url AS team_avatar
      FROM wall_posts wp
      LEFT JOIN users u ON wp.user_id = u.id
      LEFT JOIN league_members lm ON lm.user_id = wp.user_id AND lm.league_id = wp.league_id
      WHERE wp.id = ?
    `, id);

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
router.delete('/posts/:postId', authMiddleware, async (req, res) => {
  try {
    const post = await db.get('SELECT * FROM wall_posts WHERE id = ?', req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const league = await db.get('SELECT commissioner_id FROM leagues WHERE id = ?', post.league_id);
    if (post.user_id !== req.user.id && league?.commissioner_id !== req.user.id && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Cannot delete this post' });
    }

    await db.run('DELETE FROM wall_reactions WHERE post_id = ?', req.params.postId);
    await db.run('DELETE FROM wall_replies WHERE post_id = ?', req.params.postId);
    await db.run('DELETE FROM wall_posts WHERE id = ?', req.params.postId);

    const io = req.app.get('io');
    if (io) io.to(`league_${post.league_id}`).emit('wall_post_deleted', { postId: req.params.postId });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/wall/posts/:postId/react
router.post('/posts/:postId/react', authMiddleware, async (req, res) => {
  try {
    const { reaction_type } = req.body;
    if (!['respect', 'fire'].includes(reaction_type)) return res.status(400).json({ error: 'Invalid reaction' });

    const post = await db.get('SELECT league_id FROM wall_posts WHERE id = ?', req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const existing = await db.get('SELECT id FROM wall_reactions WHERE post_id = ? AND user_id = ? AND reaction_type = ?',
      req.params.postId, req.user.id, reaction_type);

    if (existing) {
      await db.run('DELETE FROM wall_reactions WHERE id = ?', existing.id);
    } else {
      await db.run('INSERT INTO wall_reactions (id, post_id, user_id, reaction_type) VALUES (?, ?, ?, ?)',
        uuidv4(), req.params.postId, req.user.id, reaction_type);
    }

    const reactions = await db.all(`
      SELECT reaction_type, COUNT(*) AS count, GROUP_CONCAT(user_id) AS user_ids
      FROM wall_reactions WHERE post_id = ? GROUP BY reaction_type
    `, req.params.postId);

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
router.post('/posts/:postId/replies', authMiddleware, async (req, res) => {
  try {
    const post = await db.get('SELECT league_id FROM wall_posts WHERE id = ?', req.params.postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const { text, gif_url } = req.body;
    const cleanedText = text ? cleanText(text.trim().slice(0, 500)) : '';
    if (!cleanedText && !gif_url) return res.status(400).json({ error: 'Reply needs text or a GIF' });

    const member = await db.get('SELECT team_name FROM league_members WHERE league_id = ? AND user_id = ?',
      post.league_id, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const id = uuidv4();
    await db.run('INSERT INTO wall_replies (id, post_id, user_id, text, gif_url) VALUES (?, ?, ?, ?, ?)',
      id, req.params.postId, req.user.id, cleanedText, gif_url || '');

    const reply = await db.get(`
      SELECT wr.*, u.username, u.avatar_url AS user_avatar,
             lm.team_name, lm.avatar_url AS team_avatar
      FROM wall_replies wr
      LEFT JOIN users u ON wr.user_id = u.id
      LEFT JOIN league_members lm ON lm.user_id = wr.user_id AND lm.league_id = ?
      WHERE wr.id = ?
    `, post.league_id, id);

    const io = req.app.get('io');
    if (io) io.to(`league_${post.league_id}`).emit('wall_new_reply', { postId: req.params.postId, reply });

    res.status(201).json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/wall/replies/:replyId
router.delete('/replies/:replyId', authMiddleware, async (req, res) => {
  try {
    const reply = await db.get(`
      SELECT wr.*, wp.league_id FROM wall_replies wr
      JOIN wall_posts wp ON wr.post_id = wp.id WHERE wr.id = ?
    `, req.params.replyId);
    if (!reply) return res.status(404).json({ error: 'Reply not found' });

    const league = await db.get('SELECT commissioner_id FROM leagues WHERE id = ?', reply.league_id);
    if (reply.user_id !== req.user.id && league?.commissioner_id !== req.user.id && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Cannot delete this reply' });
    }

    await db.run('DELETE FROM wall_replies WHERE id = ?', req.params.replyId);

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
router.get('/league/:leagueId/chat', authMiddleware, async (req, res) => {
  try {
    const member = await db.get('SELECT id FROM league_members WHERE league_id = ? AND user_id = ?',
      req.params.leagueId, req.user.id);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    res.json({ messages: await getChatHistory(req.params.leagueId) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { router, getChatHistory };
