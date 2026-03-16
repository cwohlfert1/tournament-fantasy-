const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// In production (Railway), set DATABASE_PATH to a volume path e.g. /data/fantasy.db
// so the DB survives redeploys. Falls back to local server/data/fantasy.db for dev.
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'fantasy.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS leagues (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    commissioner_id TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'lobby',
    max_teams INTEGER DEFAULT 10,
    draft_status TEXT DEFAULT 'pending',
    current_pick INTEGER DEFAULT 1,
    total_rounds INTEGER DEFAULT 10,
    stripe_session_id TEXT,
    stripe_payment_status TEXT DEFAULT 'unpaid',
    pick_time_limit INTEGER DEFAULT 60,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (commissioner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS league_members (
    id TEXT PRIMARY KEY,
    league_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    team_name TEXT NOT NULL,
    draft_order INTEGER,
    total_points REAL DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league_id, user_id),
    FOREIGN KEY (league_id) REFERENCES leagues(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    team TEXT NOT NULL,
    position TEXT,
    jersey_number TEXT,
    seed INTEGER,
    region TEXT,
    is_eliminated INTEGER DEFAULT 0,
    season_ppg REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS draft_picks (
    id TEXT PRIMARY KEY,
    league_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    pick_number INTEGER NOT NULL,
    round INTEGER NOT NULL,
    picked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(league_id, player_id),
    FOREIGN KEY (league_id) REFERENCES leagues(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (player_id) REFERENCES players(id)
  );

  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    game_date TEXT,
    round_name TEXT,
    team1 TEXT,
    team2 TEXT,
    team1_score INTEGER,
    team2_score INTEGER,
    is_completed INTEGER DEFAULT 0,
    winner_team TEXT
  );

  CREATE TABLE IF NOT EXISTS player_stats (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    points INTEGER DEFAULT 0,
    UNIQUE(game_id, player_id),
    FOREIGN KEY (game_id) REFERENCES games(id),
    FOREIGN KEY (player_id) REFERENCES players(id)
  );

  CREATE TABLE IF NOT EXISTS scoring_settings (
    id TEXT PRIMARY KEY,
    league_id TEXT UNIQUE NOT NULL,
    pts_per_point REAL DEFAULT 1.0,
    FOREIGN KEY (league_id) REFERENCES leagues(id)
  );

  CREATE TABLE IF NOT EXISTS member_payments (
    id TEXT PRIMARY KEY,
    league_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    stripe_session_id TEXT UNIQUE,
    stripe_payment_intent_id TEXT,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    paid_at DATETIME,
    UNIQUE(league_id, user_id),
    FOREIGN KEY (league_id) REFERENCES leagues(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS payouts (
    id TEXT PRIMARY KEY,
    league_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    place INTEGER,
    payout_type TEXT DEFAULT 'place',
    stripe_transfer_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (league_id) REFERENCES leagues(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Add new columns to existing tables using ALTER TABLE.
// SQLite does not support DROP COLUMN easily, so we keep the old columns
// (stripe_session_id, stripe_payment_status) and simply add the new ones.
// These try/catch blocks are safe to run on every startup — SQLite will
// throw if a column already exists, which we silently ignore.
try { db.exec('ALTER TABLE leagues ADD COLUMN entry_fee REAL DEFAULT 10.0'); } catch (e) {}
try { db.exec('ALTER TABLE leagues ADD COLUMN is_complete INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE leagues ADD COLUMN platform_cut REAL DEFAULT 0.15'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN stripe_account_id TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN stripe_account_status TEXT DEFAULT "not_connected"'); } catch (e) {}
try { db.exec('ALTER TABLE leagues ADD COLUMN auto_start_on_full INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE leagues ADD COLUMN draft_start_time TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE games ADD COLUMN espn_event_id TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE league_members ADD COLUMN avatar_url TEXT'); } catch (e) {}
// User profile extensions
try { db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT'); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN venmo_handle TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN default_team_name TEXT DEFAULT ''"); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN team_logo_url TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN notif_turn INTEGER DEFAULT 1'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN notif_draft_start INTEGER DEFAULT 1'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN notif_standings_recap INTEGER DEFAULT 1'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN referral_code TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN referred_by TEXT'); } catch (e) {}
try {
  db.exec(`CREATE TABLE IF NOT EXISTS referrals (
    id TEXT PRIMARY KEY,
    referrer_id TEXT NOT NULL,
    referred_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (referrer_id) REFERENCES users(id),
    FOREIGN KEY (referred_id) REFERENCES users(id)
  )`);
} catch (e) {}

try { db.exec('ALTER TABLE leagues ADD COLUMN buy_in_amount REAL DEFAULT 0'); } catch (e) {}
try { db.exec("ALTER TABLE leagues ADD COLUMN payment_instructions TEXT DEFAULT ''"); } catch (e) {}
try { db.exec('ALTER TABLE leagues ADD COLUMN payout_first INTEGER DEFAULT 70'); } catch (e) {}
try { db.exec('ALTER TABLE leagues ADD COLUMN payout_second INTEGER DEFAULT 20'); } catch (e) {}
try { db.exec('ALTER TABLE leagues ADD COLUMN payout_third INTEGER DEFAULT 10'); } catch (e) {}
try { db.exec('ALTER TABLE leagues ADD COLUMN payout_bonus REAL DEFAULT 0'); } catch (e) {}
// ESPN bracket integration
try { db.exec('ALTER TABLE players ADD COLUMN espn_team_id TEXT'); } catch (e) {}
// Password reset tokens
try { db.exec('ALTER TABLE users ADD COLUMN password_reset_token TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN password_reset_expires DATETIME'); } catch (e) {}
// Injury news-scraping flags
try { db.exec('ALTER TABLE players ADD COLUMN injury_flagged INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec("ALTER TABLE players ADD COLUMN injury_headline TEXT DEFAULT ''"); } catch (e) {}
// Manual injury status designations ('OUT', 'DOUBTFUL', 'QUESTIONABLE', or '')
try { db.exec("ALTER TABLE players ADD COLUMN injury_status TEXT DEFAULT ''"); } catch (e) {}

// ── Manual OUT designations ─────────────────────────────────────────────────
// These run on every startup so they survive a Railway redeploy + fresh DB.
// A commissioner can still clear any flag in the draft room via the ✕ button.
try {
  db.prepare(`
    UPDATE players
    SET injury_flagged  = 1,
        injury_status   = 'OUT',
        injury_headline = 'OUT — Not expected to play in the tournament'
    WHERE LOWER(name) LIKE '%caleb wilson%'
      AND LOWER(team)  LIKE '%north carolina%'
  `).run();
} catch (e) {}
// Strategy Hub news cache
try {
  db.exec(`CREATE TABLE IF NOT EXISTS news_articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    source TEXT DEFAULT '',
    published_at TEXT DEFAULT '',
    feed_tag TEXT DEFAULT '',
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (e) {}

// Smart Draft upgrade purchases (per user per league)
try {
  db.exec(`CREATE TABLE IF NOT EXISTS smart_draft_upgrades (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    league_id TEXT NOT NULL,
    stripe_session_id TEXT UNIQUE,
    status TEXT DEFAULT 'pending',
    purchased_at DATETIME,
    UNIQUE(user_id, league_id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (league_id) REFERENCES leagues(id)
  )`);
} catch (e) {}
// League autodraft mode: 'best_available' (default) or 'smart_draft'
try { db.exec("ALTER TABLE leagues ADD COLUMN autodraft_mode TEXT DEFAULT 'best_available'"); } catch (e) {}

// Superadmin role
try { db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'"); } catch (e) {}
// Grant superadmin to platform owner — idempotent
try {
  db.prepare("UPDATE users SET role = 'superadmin' WHERE email = 'cwohlfert@gmail.com'").run();
} catch (e) {}

module.exports = db;
