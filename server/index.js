require('dotenv').config();

// ── Env var validation ────────────────────────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error('[startup] Missing required environment variables:', missing.join(', '));
} else {
  console.log('[startup] All required env vars present ✓');
}
console.log(`[startup] CLIENT_URL = ${process.env.CLIENT_URL || '(not set — will derive from request)'}`);
console.log(`[startup] DATABASE_PATH = ${process.env.DATABASE_PATH || '(not set — using default)'}`);
// ─────────────────────────────────────────────────────────────────────────────
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');
const { seedPlayers } = require('./seed');
const { getDraftState, getCurrentPicker } = require('./routes/draft');
const { performStartDraft } = require('./draftUtils');
const { scheduleAutoPick, clearAutoPick } = require('./draftTimer');
const { getHistory, addMessage, makeSystemMsg, filterProfanity } = require('./chatStore');
const { getChatHistory } = require('./routes/wall');
const { postDraftPick } = require('./wallUtils');

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Allow both the configured CLIENT_URL and localhost dev server so CORS
// doesn't break local dev or production when CLIENT_URL changes.
const CORS_ORIGINS = [CLIENT_URL, 'http://localhost:5173', 'http://localhost:3001'].filter(Boolean);
const corsOptions = {
  origin: (origin, cb) => cb(null, !origin || CORS_ORIGINS.some(o => origin.startsWith(o))),
  credentials: true,
};

const io = new Server(server, {
  cors: { ...corsOptions, methods: ['GET', 'POST'] },
});

app.set('io', io);

// ---------------------------------------------------------------------------
// IMPORTANT: The Stripe webhook endpoint requires the RAW request body so
// that stripe.webhooks.constructEvent() can verify the signature.
// Register the raw body parser BEFORE the global express.json() middleware,
// and ONLY for the webhook path.
// ---------------------------------------------------------------------------
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// Global middleware
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/leagues', require('./routes/leagues'));
app.use('/api/players', require('./routes/players'));
app.use('/api/draft', require('./routes/draft').router);
app.use('/api/scores', require('./routes/scores'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/giphy', require('./routes/giphy'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/news', require('./routes/news'));
app.use('/api/superadmin', require('./routes/superadmin'));
app.use('/api/wall', require('./routes/wall').router);
app.use('/api/games', require('./routes/games'));

// Serve uploaded avatars
const path = require('path');
const fs = require('fs');
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve built React client in production
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  const indexPath = path.join(clientDist, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Client build not found. Run: cd client && npm run build');
  }
});

// Socket.io draft logic
io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Join draft room
  socket.on('join_draft_room', ({ leagueId, token }) => {
    try {
      if (!token) return socket.emit('error', { message: 'No token' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      socket.join(`draft_${leagueId}`);
      console.log(`User ${decoded.username} joined draft_${leagueId}`);

      // Send current state
      const state = getDraftState(leagueId);
      socket.emit('draft_state', state);
    } catch (err) {
      socket.emit('error', { message: 'Auth failed' });
    }
  });

  // Start draft (commissioner only)
  socket.on('start_draft', ({ leagueId, token }) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
      if (!league) return socket.emit('error', { message: 'League not found' });
      if (league.commissioner_id !== decoded.id) {
        return socket.emit('error', { message: 'Only commissioner can start draft' });
      }
      const result = performStartDraft(leagueId, io);
      if (!result.success) return socket.emit('error', { message: result.error });
    } catch (err) {
      console.error('start_draft error:', err);
      socket.emit('error', { message: 'Server error: ' + err.message });
    }
  });

  // Make a pick
  socket.on('make_pick', ({ leagueId, playerId, token }) => {
    try {
      if (!token) return socket.emit('error', { message: 'No token' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId);
      if (!league) return socket.emit('error', { message: 'League not found' });
      if (league.status !== 'drafting') {
        return socket.emit('error', { message: 'Draft is not active' });
      }

      const members = db.prepare(`
        SELECT lm.*, u.username FROM league_members lm
        JOIN users u ON lm.user_id = u.id
        WHERE lm.league_id = ? ORDER BY lm.draft_order
      `).all(leagueId);

      const numTeams = members.length;
      const totalPicks = numTeams * league.total_rounds;
      const currentPick = league.current_pick;

      if (currentPick > totalPicks) {
        return socket.emit('error', { message: 'Draft is complete' });
      }

      const currentPicker = getCurrentPicker(currentPick, numTeams, members);
      if (!currentPicker || currentPicker.user_id !== decoded.id) {
        return socket.emit('error', { message: "It is not your turn to pick" });
      }

      const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId);
      if (!player) return socket.emit('error', { message: 'Player not found' });

      const alreadyPicked = db.prepare('SELECT id FROM draft_picks WHERE league_id = ? AND player_id = ?').get(leagueId, playerId);
      if (alreadyPicked) return socket.emit('error', { message: 'Player already drafted' });

      const round = Math.ceil(currentPick / numTeams);
      const pickId = uuidv4();

      db.prepare(`
        INSERT INTO draft_picks (id, league_id, user_id, player_id, pick_number, round)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(pickId, leagueId, decoded.id, playerId, currentPick, round);

      const nextPick = currentPick + 1;
      const draftComplete = nextPick > totalPicks;

      if (draftComplete) {
        db.prepare("UPDATE leagues SET current_pick = ?, status = 'active' WHERE id = ?").run(nextPick, leagueId);
      } else {
        db.prepare('UPDATE leagues SET current_pick = ? WHERE id = ?').run(nextPick, leagueId);
      }

      const nextPicker = draftComplete ? null : getCurrentPicker(nextPick, numTeams, members);

      const pick = {
        id: pickId,
        league_id: leagueId,
        user_id: decoded.id,
        player_id: playerId,
        pick_number: currentPick,
        round,
        player_name: player.name,
        team: player.team,
        position: player.position,
        seed: player.seed,
        username: decoded.username,
      };

      io.to(`draft_${leagueId}`).emit('pick_made', {
        pick,
        nextPickUserId: nextPicker?.user_id || null,
        nextPickUsername: nextPicker?.username || null,
        draftComplete,
        currentPick: nextPick,
      });

      // System chat message for the pick
      const pickerMember = members.find(m => m.user_id === decoded.id);
      const sysMsg = makeSystemMsg(
        `${pickerMember?.team_name || decoded.username} selected ${player.name} with pick #${currentPick}`
      );
      addMessage(leagueId, sysMsg);
      io.to(`draft_${leagueId}`).emit('chat_message', sysMsg);

      // Auto trash-talk: post draft pick to wall
      postDraftPick(leagueId, pickerMember?.team_name || decoded.username, player.name, io);

      if (draftComplete) {
        clearAutoPick(leagueId);
        const finalState = getDraftState(leagueId);
        io.to(`draft_${leagueId}`).emit('draft_completed', finalState);
      } else {
        // Restart server-side auto-pick timer for the next picker
        scheduleAutoPick(leagueId, io);
      }
    } catch (err) {
      console.error('make_pick error:', err);
      socket.emit('error', { message: 'Server error: ' + err.message });
    }
  });

  // ── Chat ──────────────────────────────────────────────────────────────────

  // Send history to a joining user
  socket.on('chat_join', ({ leagueId, token }) => {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      socket.emit('chat_history', getHistory(leagueId));
    } catch (err) {
      socket.emit('error', { message: 'Auth failed' });
    }
  });

  // Receive and broadcast a chat message
  socket.on('chat_send', ({ leagueId, token, text, gifUrl }) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const rawText = (text || '').trim().slice(0, 200);
      if (!rawText && !gifUrl) return;

      const member = db.prepare(
        'SELECT team_name FROM league_members WHERE league_id = ? AND user_id = ?'
      ).get(leagueId, decoded.id);

      const msg = {
        id: uuidv4(),
        userId: decoded.id,
        username: decoded.username,
        teamName: member?.team_name || decoded.username,
        text: rawText ? filterProfanity(rawText) : '',
        gifUrl: gifUrl || null,
        timestamp: new Date().toISOString(),
        isSystem: false,
      };

      addMessage(leagueId, msg);
      io.to(`draft_${leagueId}`).emit('chat_message', msg);

      // Clear typing indicator when message is sent
      socket.to(`draft_${leagueId}`).emit('chat_stop_typing', { userId: decoded.id });
    } catch (err) {
      console.error('chat_send error:', err);
    }
  });

  // Typing indicator
  socket.on('chat_typing', ({ leagueId, token }) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.to(`draft_${leagueId}`).emit('chat_typing', {
        userId: decoded.id,
        username: decoded.username,
      });
    } catch (err) {}
  });

  socket.on('chat_stop_typing', ({ leagueId, token }) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.to(`draft_${leagueId}`).emit('chat_stop_typing', { userId: decoded.id });
    } catch (err) {}
  });

  // ── League wall / chat room ──────────────────────────────────────────────

  socket.on('join_league_room', ({ leagueId, token }) => {
    try {
      if (!token) return;
      jwt.verify(token, process.env.JWT_SECRET);
      socket.join(`league_${leagueId}`);
    } catch (err) {}
  });

  socket.on('league_chat_join', ({ leagueId, token }) => {
    try {
      if (!token) return;
      jwt.verify(token, process.env.JWT_SECRET);
      socket.join(`league_${leagueId}`);
      // Send last 50 persisted messages
      const history = getChatHistory(leagueId);
      socket.emit('league_chat_history', history);
    } catch (err) {
      socket.emit('error', { message: 'Auth failed' });
    }
  });

  socket.on('league_chat_send', ({ leagueId, token, text, gifUrl }) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const rawText = (text || '').trim().slice(0, 500);
      if (!rawText && !gifUrl) return;

      const member = db.prepare(
        'SELECT team_name, avatar_url FROM league_members WHERE league_id = ? AND user_id = ?'
      ).get(leagueId, decoded.id);
      if (!member) return;

      const user = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(decoded.id);

      const { cleanText } = require('./contentFilter');
      const msg = {
        id: uuidv4(),
        league_id: leagueId,
        user_id: decoded.id,
        team_name: member.team_name,
        username: decoded.username,
        avatar_url: member.avatar_url || user?.avatar_url || '',
        text: rawText ? cleanText(rawText) : '',
        gif_url: gifUrl || '',
        is_system: 0,
        created_at: new Date().toISOString(),
      };

      db.prepare(`
        INSERT INTO league_chat_messages (id, league_id, user_id, team_name, username, avatar_url, text, gif_url, is_system)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `).run(msg.id, leagueId, decoded.id, msg.team_name, msg.username, msg.avatar_url, msg.text, msg.gif_url);

      io.to(`league_${leagueId}`).emit('league_chat_message', msg);
    } catch (err) {
      console.error('league_chat_send error:', err);
    }
  });

  // Join global games feed for live score updates
  socket.on('join_games_feed', () => {
    socket.join('games_feed');
  });

  // Join leaderboard room for live standings updates
  socket.on('join_leaderboard', ({ leagueId }) => {
    if (!leagueId) return;
    socket.join(`leaderboard_${leagueId}`);
    console.log(`Socket ${socket.id} joined leaderboard_${leagueId}`);
  });

  socket.on('leave_leaderboard', ({ leagueId }) => {
    if (!leagueId) return;
    socket.leave(`leaderboard_${leagueId}`);
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// Initialize DB: ESPN bracket pull is the source of truth.
// seedPlayers() only runs as a fallback when the DB is completely empty
// AND the ESPN pull fails (e.g. offline dev environment).
const { pullBracket } = require('./bracketPoller');
setTimeout(async () => {
  try {
    const result = await pullBracket();
    if (!result.success) {
      console.warn('[startup] ESPN bracket pull failed — falling back to seed.js');
      seedPlayers();
    }
  } catch (err) {
    console.error('[startup] Bracket pull threw:', err.message, '— falling back to seed.js');
    seedPlayers();
  }
}, 5000);

// Re-pull bracket every 24 hours to catch roster updates before the tournament
setInterval(pullBracket, 24 * 60 * 60 * 1000);

// Scheduled draft poller — checks every 30 seconds for leagues whose start time has passed
const { postSystemMessage: postSystemMsg } = require('./wallUtils');
setInterval(() => {
  try {
    // Auto-randomize draft order 1hr before scheduled start (one-and-done)
    const toRandomize = db.prepare(`
      SELECT id FROM leagues
      WHERE status = 'lobby'
        AND draft_order_randomized = 0
        AND draft_start_time IS NOT NULL
        AND draft_start_time <= datetime('now', '+60 minutes')
    `).all();
    for (const { id } of toRandomize) {
      try {
        const members = db.prepare(
          'SELECT id FROM league_members WHERE league_id = ? ORDER BY RANDOM()'
        ).all(id);
        db.transaction(() => {
          members.forEach((m, idx) => {
            db.prepare('UPDATE league_members SET draft_order = ? WHERE id = ?').run(idx + 1, m.id);
          });
          db.prepare('UPDATE leagues SET draft_order_randomized = 1 WHERE id = ?').run(id);
        })();
        postSystemMsg(id, '🎲 Draft order has been automatically randomized — 1 hour until draft time!', io);
        const updatedMembers = db.prepare(`
          SELECT lm.draft_order, lm.team_name, u.username
          FROM league_members lm JOIN users u ON lm.user_id = u.id
          WHERE lm.league_id = ? ORDER BY lm.draft_order
        `).all(id);
        io.to(`draft_${id}`).emit('draft_order_randomized', { members: updatedMembers });
        io.to(`league_${id}`).emit('draft_order_randomized', { members: updatedMembers });
        console.log(`[scheduled] Draft order auto-randomized for league ${id}`);
      } catch (err) {
        console.error(`[scheduled] Auto-randomize failed for league ${id}:`, err.message);
      }
    }

    // Auto-start drafts whose scheduled time has arrived
    const due = db.prepare(`
      SELECT id FROM leagues
      WHERE status = 'lobby'
        AND draft_start_time IS NOT NULL
        AND draft_start_time <= datetime('now')
    `).all();
    for (const { id } of due) {
      const result = performStartDraft(id, io);
      if (result.success) {
        console.log(`[scheduled] Draft auto-started for league ${id}`);
      } else {
        console.log(`[scheduled] Could not start draft for league ${id}: ${result.error}`);
        // Clear the start time so we don't retry every 30s on a permanent error
        if (result.error.includes('haven\'t paid')) {
          // Leave it — will retry next interval
        } else {
          db.prepare('UPDATE leagues SET draft_start_time = NULL WHERE id = ?').run(id);
        }
      }
    }
  } catch (err) {
    console.error('[scheduled poller] error:', err);
  }
}, 30000);

// ESPN live scoring poller — smart polling (2 min live window, 30 min otherwise)
const { startSmartPoller, pullSchedule } = require('./espnPoller');
startSmartPoller(io);

// Pull full tournament schedule at startup (after bracket pull finishes) + every 6h
// This populates the games table with all scheduled games including future ones.
setTimeout(() => pullSchedule(io), 12 * 1000);
setInterval(() => pullSchedule(io), 6 * 60 * 60 * 1000);

// Injury news poller — scans NCAA basketball news feeds every 2 hours
const { pollInjuries } = require('./injuryPoller');
setInterval(pollInjuries, 2 * 60 * 60 * 1000);
setTimeout(pollInjuries, 45 * 1000); // initial poll 45s after startup

// Strategy Hub news poller — caches articles every 2 hours
const { pollNews } = require('./newsPoller');
setInterval(pollNews, 2 * 60 * 60 * 1000);
setTimeout(pollNews, 60 * 1000); // initial poll 60s after startup

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
