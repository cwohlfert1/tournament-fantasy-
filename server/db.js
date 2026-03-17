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
// Explicit prize pool override — superadmin sets this to override buy_in × teams math
try { db.exec('ALTER TABLE leagues ADD COLUMN payout_pool_override REAL DEFAULT NULL'); } catch (e) {}
// Seed payout_pool_override for known leagues
try {
  db.prepare("UPDATE leagues SET payout_pool_override = 1100 WHERE id = '6ce9da4a-89b1-4d13-ad70-f21e9c0bfe93' AND (payout_pool_override IS NULL OR payout_pool_override = 0)")
    .run();
} catch (e) {}
// ESPN bracket integration
try { db.exec('ALTER TABLE players ADD COLUMN espn_team_id TEXT'); } catch (e) {}
try { db.exec("ALTER TABLE players ADD COLUMN espn_athlete_id TEXT DEFAULT ''"); } catch (e) {}
try { db.exec('ALTER TABLE players ADD COLUMN is_first_four INTEGER DEFAULT 0'); } catch (e) {}
// Draft order randomizer lock
try { db.exec('ALTER TABLE leagues ADD COLUMN draft_order_randomized INTEGER DEFAULT 0'); } catch (e) {}
// Draft import — tracks placeholder members awaiting real account assignment
try { db.exec('ALTER TABLE league_members ADD COLUMN pending_owner_name TEXT'); } catch (e) {}
// Password reset tokens
try { db.exec('ALTER TABLE users ADD COLUMN password_reset_token TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN password_reset_expires DATETIME'); } catch (e) {}
// Injury news-scraping flags
try { db.exec('ALTER TABLE players ADD COLUMN injury_flagged INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec("ALTER TABLE players ADD COLUMN injury_headline TEXT DEFAULT ''"); } catch (e) {}
// Manual injury status designations ('OUT', 'DOUBTFUL', 'QUESTIONABLE', or '')
try { db.exec("ALTER TABLE players ADD COLUMN injury_status TEXT DEFAULT ''"); } catch (e) {}
// Payment handles per league membership (captured at join time)
try { db.exec("ALTER TABLE league_members ADD COLUMN venmo_handle TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE league_members ADD COLUMN zelle_handle TEXT DEFAULT ''"); } catch (e) {}
// Per-game stats enrichment (round code + opponent derived at insert time)
try { db.exec("ALTER TABLE player_stats ADD COLUMN round TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE player_stats ADD COLUMN opponent TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE player_stats ADD COLUMN played_at DATETIME"); } catch (e) {}

// ── Injury designations (2026 tournament) ────────────────────────────────────
// Runs on every startup — survives Railway redeploys. Commissioner can clear any flag.
const INJURY_DATA = [
  // EAST REGION
  { name: 'caleb foster',     team: 'duke',          status: 'OUT',                headline: 'OUT — Foot fracture, out for season. Outside chance of returning for the Final Four.' },
  { name: 'patrick ngongba',  team: 'duke',          status: 'QUESTIONABLE',       headline: 'QUESTIONABLE — Foot injury, missed ACC Tournament. Status updated before Thursday game vs Siena.' },
  { name: 'taison chatman',   team: 'ohio state',    status: 'QUESTIONABLE',       headline: 'QUESTIONABLE — Groin injury, missed last game. Hopeful for Thursday vs TCU.' },
  { name: 'mikel brown',      team: 'louisville',    status: 'DAY-TO-DAY',         headline: "DAY-TO-DAY — Back injury, hasn't played since Feb 28. Dynamic scorer avg 18.2 PPG. Critical for Thursday vs South Florida." },
  { name: 'donovan dent',     team: 'ucla',          status: 'EXPECTED TO PLAY',   headline: 'EXPECTED TO PLAY — Calf injury, went down in Big Ten Tournament but expected ready for Friday vs UCF.' },
  { name: 'tyler bilodeau',   team: 'ucla',          status: 'EXPECTED TO PLAY',   headline: 'EXPECTED TO PLAY — Knee injury, no structural damage. Expected to play Friday vs UCF.' },
  { name: 'silas demary',     team: 'uconn',         status: 'QUESTIONABLE',       headline: 'QUESTIONABLE — Ankle sprain, went down twice in Big East Tournament Final. Massive hit for UConn if out Friday vs Furman.' },
  { name: 'jaylin stewart',   team: 'uconn',         status: 'QUESTIONABLE',       headline: "QUESTIONABLE — Knee injury, hasn't played since Feb 21. Hoping to return for the tournament." },
  // SOUTH REGION
  { name: 'carter welling',   team: 'clemson',       status: 'OUT FOR SEASON',     headline: 'OUT FOR SEASON — Torn ACL vs Wake Forest. Out for rest of season.' },
  { name: 'caleb wilson',     team: 'north carolina',status: 'OUT FOR SEASON',     headline: 'OUT FOR SEASON — Broken thumb surgery ended season. Was averaging 19.8 PPG and 9.4 RPG.' },
  { name: 'ethan roberts',    team: 'pennsylvania',  status: 'QUESTIONABLE',       headline: 'QUESTIONABLE — Concussion, missed Ivy League Tournament. Unclear for Thursday vs Illinois.' },
  // WEST REGION
  { name: 'nolan winter',     team: 'wisconsin',     status: 'QUESTIONABLE',       headline: 'QUESTIONABLE — Ankle injury, missed last 4 games. Status updated before Thursday vs High Point.' },
  { name: 'karter knox',      team: 'arkansas',      status: 'DOUBTFUL',           headline: 'DOUBTFUL — Knee surgery, missed 11 of last 12 games. Just got off crutches.' },
  { name: 'lassina traore',   team: 'texas',         status: 'QUESTIONABLE',       headline: "QUESTIONABLE — Knee injury, hasn't played since Feb 3. Questionable for First Four vs NC State." },
  { name: 'braden huff',      team: 'gonzaga',       status: 'NOT EXPECTED TO PLAY', headline: 'NOT EXPECTED TO PLAY — Knee injury, missed last 15 games. Unlikely for first weekend but could return Sweet 16 if Gonzaga advances.' },
  // MIDWEST REGION
  { name: 'christian anderson', team: 'texas tech',  status: 'WILL PLAY',          headline: 'WILL PLAY — Groin injury but confirmed ready for Friday vs Akron.' },
  { name: 'lejuan watts',     team: 'texas tech',    status: 'EXPECTED TO PLAY',   headline: 'EXPECTED TO PLAY — Lower leg injury but expected ready by Friday.' },
  { name: 'aden holloway',    team: 'alabama',       status: 'QUESTIONABLE',       headline: 'QUESTIONABLE — Arrested on marijuana charge Monday morning, status unclear for Friday vs Hofstra. Averages 16.8 PPG.' },
  { name: 'b.j. edwards',     team: 'smu',           status: 'EXPECTED TO PLAY',   headline: 'EXPECTED TO PLAY — Ankle injury, missed last 5 games but expected to play First Four vs Miami (OH).' },
  { name: 'jayden quaintance',team: 'kentucky',      status: 'DOUBTFUL',           headline: 'DOUBTFUL — Knee swelling from ACL surgery in Feb 2025. Not expected for first weekend vs Santa Clara.' },
];

const setInjury = db.prepare(`
  UPDATE players
  SET injury_flagged = 1, injury_status = ?, injury_headline = ?
  WHERE LOWER(name) LIKE ? AND LOWER(team) LIKE ?
`);
try {
  db.transaction(() => {
    for (const inj of INJURY_DATA) {
      setInjury.run(inj.status, inj.headline, `%${inj.name}%`, `%${inj.team}%`);
    }
  })();
} catch (e) { console.error('[db] injury seed error:', e.message); }

// ── Mark specific players OUT by UUID (idempotent) ───────────────────────────
try {
  const OUT_PLAYER_IDS = [
    '9295ab0f-f77e-499a-9a01-987cc7d6ecbb', // Richie Saunders
    'acab7dfa-63c0-4eee-bb91-be97c23c611d', // JT Toppin
    '3e8875cd-9848-4f8d-9f16-8d9a95bdfd14', // L.J. Cason
    'd3de0b11-441d-47b6-9495-9b4a13a8a31d', // Matt Hodge
    '7d40f7fb-1e2c-4436-8d87-5289dfd0138b', // Aden Holloway
  ];
  const setOut = db.prepare(`UPDATE players SET injury_flagged = 1, injury_status = 'OUT' WHERE id = ? AND (injury_status IS NULL OR injury_status = '')`);
  db.transaction(() => { for (const id of OUT_PLAYER_IDS) setOut.run(id); })();
} catch (e) { console.error('[db] OUT player migration error:', e.message); }

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
// Smart Draft on/off toggle (purchased users can pause without losing their upgrade)
try { db.exec("ALTER TABLE smart_draft_upgrades ADD COLUMN enabled INTEGER DEFAULT 1"); } catch (e) {}

// ── Dev/owner Smart Draft seed — survives redeploys via INSERT OR IGNORE ──────
// Ensures cwohlfert always has Smart Draft active without overwriting real data.
try {
  const cwohlfert = db.prepare("SELECT id FROM users WHERE username = 'cwohlfert'").get();
  if (cwohlfert) {
    const leagues = db.prepare(
      'SELECT id FROM leagues WHERE id IN (SELECT league_id FROM league_members WHERE user_id = ?)'
    ).all(cwohlfert.id);
    const seedSD = db.prepare(`
      INSERT OR IGNORE INTO smart_draft_upgrades
        (id, user_id, league_id, stripe_session_id, status, enabled, purchased_at)
      VALUES (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
              substr(lower(hex(randomblob(2))),2) || '-' ||
              substr('89ab',abs(random()) % 4 + 1, 1) ||
              substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))),
              ?, ?, 'dev_seed', 'active', 1, CURRENT_TIMESTAMP)
    `);
    for (const league of leagues) {
      seedSD.run(cwohlfert.id, league.id);
    }
  }
} catch (e) { console.error('[db] smart_draft dev seed error:', e.message); }

// Standalone Smart Draft credit purchases (before the user is tied to a league)
try {
  db.exec(`CREATE TABLE IF NOT EXISTS smart_draft_credits (
    id TEXT PRIMARY KEY,
    stripe_session_id TEXT UNIQUE NOT NULL,
    user_id TEXT,
    status TEXT DEFAULT 'pending',
    purchased_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (e) {}

// Live game tracking for socket push
try { db.exec('ALTER TABLE games ADD COLUMN is_live INTEGER DEFAULT 0'); } catch (e) {}
// Game schedule metadata (populated from ESPN API)
try { db.exec("ALTER TABLE games ADD COLUMN tip_off_time TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE games ADD COLUMN tv_network TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE games ADD COLUMN location TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE games ADD COLUMN current_period TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE games ADD COLUMN game_clock TEXT DEFAULT ''"); } catch (e) {}
try { db.exec("ALTER TABLE games ADD COLUMN region TEXT DEFAULT ''"); } catch (e) {}

// ── Trash talk wall ─────────────────────────────────────────────────────────
try {
  db.exec(`CREATE TABLE IF NOT EXISTS wall_posts (
    id TEXT PRIMARY KEY,
    league_id TEXT NOT NULL,
    user_id TEXT,
    text TEXT DEFAULT '',
    gif_url TEXT DEFAULT '',
    is_system INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (e) {}
try {
  db.exec(`CREATE TABLE IF NOT EXISTS wall_reactions (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    reaction_type TEXT NOT NULL,
    UNIQUE(post_id, user_id, reaction_type)
  )`);
} catch (e) {}
try {
  db.exec(`CREATE TABLE IF NOT EXISTS wall_replies (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    text TEXT DEFAULT '',
    gif_url TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (e) {}
// Persisted league chat (distinct from in-memory draft chat)
try {
  db.exec(`CREATE TABLE IF NOT EXISTS league_chat_messages (
    id TEXT PRIMARY KEY,
    league_id TEXT NOT NULL,
    user_id TEXT,
    team_name TEXT DEFAULT '',
    username TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    text TEXT DEFAULT '',
    gif_url TEXT DEFAULT '',
    is_system INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
} catch (e) {}

// Compliance acknowledgments captured at registration
try { db.exec('ALTER TABLE users ADD COLUMN agreement_accepted INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN age_confirmed INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN state_eligible INTEGER DEFAULT 0'); } catch (e) {}

// Superadmin role
try { db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'"); } catch (e) {}
// Grant superadmin to platform owner — idempotent
try {
  db.prepare("UPDATE users SET role = 'superadmin' WHERE email = 'cwohlfert@gmail.com'").run();
} catch (e) {}

// ── Fix leagues where all picks were made but draft_status was never updated ──
// Both draft.js and draftTimer.js forgot to write draft_status='completed'.
// This migration corrects any stuck league on every server start (idempotent).
try {
  const fixed = db.prepare(`
    UPDATE leagues
    SET draft_status = 'completed'
    WHERE draft_status != 'completed'
      AND current_pick > (max_teams * total_rounds)
  `).run();
  if (fixed.changes > 0) {
    console.log(`[db] Fixed ${fixed.changes} league(s) stuck with draft_status='pending' after draft completion`);
  }
} catch (e) { console.error('[db] draft_status migration error:', e.message); }

module.exports = db;
