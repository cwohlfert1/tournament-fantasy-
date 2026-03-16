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

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
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
app.use(cors({ origin: CLIENT_URL, credentials: true }));
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

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// Initialize DB and seed
seedPlayers();

// Scheduled draft poller — checks every 30 seconds for leagues whose start time has passed
setInterval(() => {
  try {
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

// ESPN live scoring poller — updates player stats every 5 minutes during tournament
const { pollESPN } = require('./espnPoller');
setInterval(pollESPN, 5 * 60 * 1000);
setTimeout(pollESPN, 15 * 1000); // initial poll 15s after startup

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
