require('dotenv').config();

// ── Env var validation ────────────────────────────────────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'SQUARE_ACCESS_TOKEN', 'SQUARE_LOCATION_ID'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error('[startup] Missing required environment variables:', missing.join(', '));
} else {
  console.log('[startup] All required env vars present ✓');
}
// SECURITY: validate JWT secret strength — weak secrets enable token forgery
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.warn('[startup] WARNING: JWT_SECRET is less than 32 characters — consider using a stronger secret');
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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const sqliteDb = require('./db');
const db = require('./db/index');
require('./horses-db');
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
// Square webhook endpoints require the RAW request body so that HMAC-SHA256
// signature verification can run against the original bytes.
// Register the raw body parser BEFORE the global express.json() middleware,
// and ONLY for webhook paths.
// ---------------------------------------------------------------------------
// Redirect naked domain → www (must be first, before any route or static middleware)
app.use((req, res, next) => {
  const host = req.headers.host || '';
  if (host === 'tourneyrun.app') {
    return res.redirect(301, `https://www.tourneyrun.app${req.originalUrl}`);
  }
  next();
});

app.use('/api/payments/webhook',      express.raw({ type: 'application/json' }));
app.use('/api/golf/webhooks/stripe',  express.raw({ type: 'application/json' })); // URL kept for Square compatibility

// Global middleware
app.use(cors(corsOptions));

// ── Security headers (OWASP best practice) ──────────────────────────────────
// Adds X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, etc.
// CSP is relaxed for inline styles (React uses them heavily) and Google Fonts.
app.use(helmet({
  contentSecurityPolicy: false, // CSP breaks inline styles used by React components
  crossOriginEmbedderPolicy: false, // Allows loading Google Fonts + ESPN images
}));

// ── Global rate limiter (all routes) ────────────────────────────────────────
// 200 requests per minute per IP — generous for normal usage, blocks abuse.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again in a minute.' },
});
app.use('/api', globalLimiter);

// ── Strict rate limiters for auth endpoints ─────────────────────────────────
// These are the most targeted endpoints for brute force attacks.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per IP per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts — please try again in 15 minutes.' },
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,                    // 5 registrations per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many accounts created — please try again later.' },
});
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,                    // 5 reset requests per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests — please try again later.' },
});
// Expose limiters for route files to use
app.set('authLimiter', authLimiter);
app.set('registerLimiter', registerLimiter);
app.set('passwordResetLimiter', passwordResetLimiter);

app.use(express.json({ limit: '1mb' })); // Limit body size to prevent DoS

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
app.use('/api/sindarius', require('./routes/sindarius'));
app.use('/api/golf', require('./routes/golf'));
app.use('/api/golf', require('./routes/golf-waivers'));
app.use('/api/golf', require('./routes/golf-auction'));
app.use('/api/golf', require('./routes/golf-payments'));
app.use('/api/golf', require('./routes/golf-admin'));
app.use('/api/golf', require('./routes/golf-pool'));

// ── Horses routes ─────────────────────────────────────────────────────────────
app.use('/api/horses', require('./routes/horses'));
app.use('/api/horses', require('./routes/horses-payments'));

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

  // Join golf pool room for live standings updates
  socket.on('join_golf_pool', ({ leagueId, token }) => {
    try {
      if (!token) return;
      jwt.verify(token, process.env.JWT_SECRET);
      socket.join(`golf_pool_${leagueId}`);
    } catch (_) {}
  });

  // Join draft room
  socket.on('join_draft_room', async ({ leagueId, token }) => {
    try {
      if (!token) return socket.emit('error', { message: 'No token' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      socket.join(`draft_${leagueId}`);
      console.log(`User ${decoded.username} joined draft_${leagueId}`);

      // Send current state
      const state = await getDraftState(leagueId);
      if (!state) return socket.emit('error', { message: 'League not found' });
      socket.emit('draft_state', state);
    } catch (err) {
      socket.emit('error', { message: 'Auth failed' });
    }
  });

  // Start draft (commissioner only)
  socket.on('start_draft', async ({ leagueId, token }) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const league = await db.get('SELECT * FROM leagues WHERE id = ?', leagueId);
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
  socket.on('make_pick', async ({ leagueId, playerId, token }) => {
    try {
      if (!token) return socket.emit('error', { message: 'No token' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const league = await db.get('SELECT * FROM leagues WHERE id = ?', leagueId);
      if (!league) return socket.emit('error', { message: 'League not found' });
      if (league.status !== 'drafting') {
        return socket.emit('error', { message: 'Draft is not active' });
      }

      const members = await db.all(`
        SELECT lm.*, u.username FROM league_members lm
        JOIN users u ON lm.user_id = u.id
        WHERE lm.league_id = ? ORDER BY lm.draft_order
      `, leagueId);

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

      const player = await db.get('SELECT * FROM players WHERE id = ?', playerId);
      if (!player) return socket.emit('error', { message: 'Player not found' });

      const alreadyPicked = await db.get('SELECT id FROM draft_picks WHERE league_id = ? AND player_id = ?', leagueId, playerId);
      if (alreadyPicked) return socket.emit('error', { message: 'Player already drafted' });

      const round = Math.ceil(currentPick / numTeams);
      const pickId = uuidv4();

      await db.run(`
        INSERT INTO draft_picks (id, league_id, user_id, player_id, pick_number, round)
        VALUES (?, ?, ?, ?, ?, ?)
      `, pickId, leagueId, decoded.id, playerId, currentPick, round);

      const nextPick = currentPick + 1;
      const draftComplete = nextPick > totalPicks;

      if (draftComplete) {
        await db.run("UPDATE leagues SET current_pick = ?, status = 'active' WHERE id = ?", nextPick, leagueId);
      } else {
        await db.run('UPDATE leagues SET current_pick = ? WHERE id = ?', nextPick, leagueId);
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
        const finalState = await getDraftState(leagueId);
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
  socket.on('chat_send', async ({ leagueId, token, text, gifUrl }) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const rawText = (text || '').trim().slice(0, 200);
      if (!rawText && !gifUrl) return;

      const member = await db.get(
        'SELECT team_name FROM league_members WHERE league_id = ? AND user_id = ?',
        leagueId, decoded.id
      );

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

  socket.on('league_chat_join', async ({ leagueId, token }) => {
    try {
      if (!token) return;
      jwt.verify(token, process.env.JWT_SECRET);
      socket.join(`league_${leagueId}`);
      // Send last 50 persisted messages
      const history = await getChatHistory(leagueId);
      socket.emit('league_chat_history', history);
    } catch (err) {
      socket.emit('error', { message: 'Auth failed' });
    }
  });

  socket.on('league_chat_send', async ({ leagueId, token, text, gifUrl }) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const rawText = (text || '').trim().slice(0, 500);
      if (!rawText && !gifUrl) return;

      const member = await db.get(
        'SELECT team_name, avatar_url FROM league_members WHERE league_id = ? AND user_id = ?',
        leagueId, decoded.id
      );
      if (!member) return;

      const user = await db.get('SELECT avatar_url FROM users WHERE id = ?', decoded.id);

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

      await db.run(`
        INSERT INTO league_chat_messages (id, league_id, user_id, team_name, username, avatar_url, text, gif_url, is_system)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `, msg.id, leagueId, decoded.id, msg.team_name, msg.username, msg.avatar_url, msg.text, msg.gif_url);

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
      await seedPlayers();
    }
  } catch (err) {
    console.error('[startup] Bracket pull threw:', err.message, '— falling back to seed.js');
    await seedPlayers();
  }
}, 5000);

// Re-pull bracket every 24 hours to catch roster updates before the tournament
setInterval(pullBracket, 24 * 60 * 60 * 1000);

// Scheduled draft poller — checks every 30 seconds for leagues whose start time has passed
const { postSystemMessage: postSystemMsg } = require('./wallUtils');
setInterval(async () => {
  try {
    // Auto-randomize draft order 1hr before scheduled start (one-and-done)
    const toRandomize = await db.all(`
      SELECT id FROM leagues
      WHERE status = 'lobby'
        AND draft_order_randomized = 0
        AND draft_start_time IS NOT NULL
        AND draft_start_time <= datetime('now', '+60 minutes')
    `);
    for (const { id } of toRandomize) {
      try {
        const members = await db.all(
          'SELECT id FROM league_members WHERE league_id = ? ORDER BY RANDOM()',
          id
        );
        await db.transaction(async (tx) => {
          for (let idx = 0; idx < members.length; idx++) {
            await tx.run('UPDATE league_members SET draft_order = ? WHERE id = ?', idx + 1, members[idx].id);
          }
          await tx.run('UPDATE leagues SET draft_order_randomized = 1 WHERE id = ?', id);
        });
        postSystemMsg(id, '🎲 Draft order has been automatically randomized — 1 hour until draft time!', io);
        const updatedMembers = await db.all(`
          SELECT lm.draft_order, lm.team_name, u.username
          FROM league_members lm JOIN users u ON lm.user_id = u.id
          WHERE lm.league_id = ? ORDER BY lm.draft_order
        `, id);
        io.to(`draft_${id}`).emit('draft_order_randomized', { members: updatedMembers });
        io.to(`league_${id}`).emit('draft_order_randomized', { members: updatedMembers });
        console.log(`[scheduled] Draft order auto-randomized for league ${id}`);
      } catch (err) {
        console.error(`[scheduled] Auto-randomize failed for league ${id}:`, err.message);
      }
    }

    // Auto-start drafts whose scheduled time has arrived
    const due = await db.all(`
      SELECT id FROM leagues
      WHERE status = 'lobby'
        AND draft_start_time IS NOT NULL
        AND draft_start_time <= datetime('now')
    `);
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
          await db.run('UPDATE leagues SET draft_start_time = NULL WHERE id = ?', id);
        }
      }
    }
  } catch (err) {
    console.error('[scheduled poller] error:', err);
  }
}, 30000);

// Golf pool lock scheduler — checks pick deadlines every 5 minutes
const { startPoolLockScheduler } = require('./golfPoolLockService');
startPoolLockScheduler();

// Golf score auto-sync — 10 min intervals Thu–Sun during active tournaments
const { scheduleAutoSync, backfillCompleted, setIo: setGolfSyncIo } = require('./golfSyncService');
setGolfSyncIo(io);
scheduleAutoSync();
setTimeout(backfillCompleted, 15 * 1000); // backfill after server is up

// DataGolf integration — player list + field + schedule auto-sync
const { scheduleDataGolfSync } = require('./dataGolfService');
scheduleDataGolfSync();

// Self-heal: correct any tournament marked 'completed' while still within its date window
// (guards against sync bugs that prematurely complete a live tournament)
try {
  const healed = sqliteDb.prepare(`
    UPDATE golf_tournaments SET status = 'active'
    WHERE status = 'completed'
      AND date('now') BETWEEN date(start_date, '-1 day') AND date(end_date, '+1 day')
  `).run();
  if (healed.changes > 0) console.log(`[startup] Corrected ${healed.changes} tournament(s) incorrectly marked completed during active window`);
} catch (e) {
  console.error('[startup] Golf status self-heal error:', e.message);
}

// ── DISABLED: the team-name string mismatch DELETE was too broad and wiped
//    valid player_stats rows where ESPN displayName != our DB team string
//    (e.g. "Ohio State Buckeyes" vs "Ohio State"). DELETE removed until a
//    safer espn_athlete_id-based check is implemented.
//
// try {
//   ... DELETE FROM player_stats WHERE team name mismatch ...
// } catch (err) { ... }

// ── One-time fix: NC State players were seeded before the bracket pull ran,
//    leaving them with team='NC State', espn_team_id=null, espn_athlete_id=''.
//    ESPN uses "North Carolina State" as the display name so elimination and
//    stat-matching never fired. This block fixes all three fields at startup.
try {
  // 1. Mark eliminated (NC State lost in First Round 2026)
  const elimFix = sqliteDb.prepare(
    "UPDATE players SET is_eliminated = 1 WHERE team = 'NC State' AND is_eliminated != 1"
  ).run();
  console.log(`[cleanup] NC State: ${elimFix.changes} player(s) marked eliminated`);

  // 2. Set correct ESPN team ID
  const teamIdFix = sqliteDb.prepare(
    "UPDATE players SET espn_team_id = '152' WHERE team = 'NC State' AND (espn_team_id IS NULL OR espn_team_id = '')"
  ).run();
  console.log(`[cleanup] NC State: ${teamIdFix.changes} player(s) espn_team_id → 152`);

  // 3. Set espn_athlete_id for the four drafted players by name
  const NC_STATE_ATHLETES = [
    { name: 'Quadir Copeland',  id: '4683860' },
    { name: 'Paul McNeil Jr.',  id: '4873151' },
    { name: 'Ven-Allen Lubin',  id: '4684799' },
    { name: 'Darrion Williams', id: '4937074' },
  ];
  const athleteStmt = sqliteDb.prepare(
    "UPDATE players SET espn_athlete_id = ? WHERE team = 'NC State' AND LOWER(name) = LOWER(?) AND (espn_athlete_id IS NULL OR espn_athlete_id = '')"
  );
  for (const { name, id } of NC_STATE_ATHLETES) {
    const r = athleteStmt.run(id, name);
    if (r.changes > 0) console.log(`[cleanup] NC State: espn_athlete_id set for ${name} → ${id}`);
  }
} catch (err) {
  console.error('[cleanup] NC State fix error:', err.message);
}

// ── Deduplicate players that were inserted twice (once from seed, once from bracket pull).
//    Keep the row with a valid espn_athlete_id; re-point any draft_picks / player_stats
//    that reference the orphaned row, then delete the orphan.
try {
  const dupes = sqliteDb.prepare(`
    SELECT name, COUNT(*) as cnt
    FROM players
    GROUP BY LOWER(name)
    HAVING cnt > 1
  `).all();

  if (dupes.length > 0) {
    console.log(`[dedup] found ${dupes.length} duplicate player name(s):`, dupes.map(d => d.name));

    const deduped = sqliteDb.transaction(() => {
      let deleted = 0;
      for (const { name } of dupes) {
        const rows = sqliteDb.prepare(
          "SELECT * FROM players WHERE LOWER(name) = LOWER(?) ORDER BY (espn_athlete_id IS NULL OR espn_athlete_id = '') ASC"
        ).all(name);
        // rows[0] = has espn_athlete_id (good), rows[1+] = orphans
        const keeper = rows[0];
        const orphans = rows.slice(1);
        for (const orphan of orphans) {
          // Re-point draft_picks
          const dpFix = sqliteDb.prepare(
            'UPDATE draft_picks SET player_id = ? WHERE player_id = ?'
          ).run(keeper.id, orphan.id);
          // Re-point player_stats rows that don't conflict with a keeper row for the same game
          const psFix = sqliteDb.prepare(
            'UPDATE player_stats SET player_id = ? WHERE player_id = ? AND game_id NOT IN (SELECT game_id FROM player_stats WHERE player_id = ?)'
          ).run(keeper.id, orphan.id, keeper.id);
          // Delete any remaining orphan player_stats (duped game rows)
          sqliteDb.prepare('DELETE FROM player_stats WHERE player_id = ?').run(orphan.id);
          // Delete orphan player
          sqliteDb.prepare('DELETE FROM players WHERE id = ?').run(orphan.id);
          console.log(`[dedup] merged "${orphan.name}" (${orphan.id}) → keeper (${keeper.id}) | dp=${dpFix.changes} ps=${psFix.changes}`);
          deleted++;
        }
      }
      return deleted;
    })();
    console.log(`[dedup] removed ${deduped} orphan player row(s)`);
  } else {
    console.log('[dedup] no duplicate players found');
  }
} catch (err) {
  console.error('[dedup] error:', err.message);
}

// ESPN live scoring poller — smart polling (2 min live window, 30 min otherwise)
const { startSmartPoller, pullSchedule, pollESPN, reingestCompletedGames } = require('./espnPoller');
startSmartPoller(io);

// Immediate ESPN poll at startup to restore any stats that were incorrectly
// deleted — ON CONFLICT DO UPDATE means this is a safe re-ingest, not a dupe.
setTimeout(() => pollESPN(io).catch(e => console.error('[startup] immediate ESPN poll failed:', e.message)), 3000);

// Re-ingest all completed games by espn_event_id — restores historical stats
// that the live poller can't recover (completed games no longer on scoreboard).
// Uses athlete-ID-first matching so NC State and other mis-seeded players are found.
setTimeout(() => reingestCompletedGames(io).catch(e => console.error('[startup] reingest failed:', e.message)), 8000);

// Retry reingest every 30 min — catches players whose espn_athlete_id wasn't
// set on first ingest (e.g. NC State fix runs at startup, IDs now populated).
setInterval(() => reingestCompletedGames(io).catch(e => console.error('[reingest] periodic error:', e.message)), 30 * 60 * 1000);

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

  // Auto-sync ESPN field for any tournament that has an espn_event_id
  // but no players yet in golf_tournament_fields. Fires once at startup.
  const { syncEspnFieldForTournament } = require('./golfSyncService');
  const golfDb = require('./golf-db');
  setTimeout(async () => {
    try {
      const needsField = golfDb.prepare(`
        SELECT t.id, t.name FROM golf_tournaments t
        WHERE t.espn_event_id IS NOT NULL
          AND t.status = 'active'
          AND (SELECT COUNT(*) FROM golf_tournament_fields f WHERE f.tournament_id = t.id) = 0
        ORDER BY t.start_date ASC
      `).all();
      if (!needsField.length) {
        console.log('[startup] Field sync: all active tournaments already have field data');
        return;
      }
      for (const t of needsField) {
        console.log(`[startup] Field sync: populating field for ${t.name}...`);
        try {
          const result = await syncEspnFieldForTournament(t.id);
          console.log(`[startup] Field sync complete: ${t.name} — ${result.fieldCount} players, ${result.leaguesRebuilt} leagues rebuilt`);
        } catch (e) {
          console.error(`[startup] Field sync failed for ${t.name}:`, e.message);
        }
      }
    } catch (e) {
      console.error('[startup] Field sync startup error:', e.message);
    }
  }, 5000); // 5s delay to let DB migrations settle
});
