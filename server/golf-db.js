const db = require('./db');
const { v4: uuidv4 } = require('uuid');

// ── Golf Tables ────────────────────────────────────────────────────────────────
try { db.exec(`
  CREATE TABLE IF NOT EXISTS golf_leagues (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    commissioner_id TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'lobby',
    max_teams INTEGER DEFAULT 10,
    buy_in_amount REAL DEFAULT 0,
    payment_instructions TEXT DEFAULT '',
    payout_first INTEGER DEFAULT 70,
    payout_second INTEGER DEFAULT 20,
    payout_third INTEGER DEFAULT 10,
    season_year INTEGER DEFAULT 2026,
    week_lock_day TEXT DEFAULT 'thursday',
    roster_size INTEGER DEFAULT 8,
    starters_per_week INTEGER DEFAULT 6,
    draft_status TEXT DEFAULT 'pending',
    current_pick INTEGER DEFAULT 1,
    pick_time_limit INTEGER DEFAULT 60,
    autodraft_mode TEXT DEFAULT 'best_available',
    draft_order_randomized INTEGER DEFAULT 0,
    draft_start_time TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (commissioner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS golf_league_members (
    id TEXT PRIMARY KEY,
    golf_league_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    team_name TEXT NOT NULL,
    draft_order INTEGER,
    season_points REAL DEFAULT 0,
    season_budget INTEGER DEFAULT 2400,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(golf_league_id, user_id),
    FOREIGN KEY (golf_league_id) REFERENCES golf_leagues(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS golf_players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    country TEXT DEFAULT 'USA',
    world_ranking INTEGER,
    owgr_points REAL DEFAULT 0,
    salary INTEGER DEFAULT 200,
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS golf_rosters (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    dropped_at DATETIME,
    FOREIGN KEY (member_id) REFERENCES golf_league_members(id),
    FOREIGN KEY (player_id) REFERENCES golf_players(id)
  );

  CREATE TABLE IF NOT EXISTS golf_tournaments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    course TEXT DEFAULT '',
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    season_year INTEGER DEFAULT 2026,
    is_major INTEGER DEFAULT 0,
    is_signature INTEGER DEFAULT 0,
    status TEXT DEFAULT 'scheduled',
    purse INTEGER DEFAULT 0,
    prize_money INTEGER DEFAULT 0,
    external_id TEXT
  );

  CREATE TABLE IF NOT EXISTS golf_weekly_lineups (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    tournament_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    is_started INTEGER DEFAULT 0,
    locked INTEGER DEFAULT 0,
    UNIQUE(member_id, tournament_id, player_id),
    FOREIGN KEY (member_id) REFERENCES golf_league_members(id),
    FOREIGN KEY (tournament_id) REFERENCES golf_tournaments(id),
    FOREIGN KEY (player_id) REFERENCES golf_players(id)
  );

  CREATE TABLE IF NOT EXISTS golf_scores (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    round1 INTEGER,
    round2 INTEGER,
    round3 INTEGER,
    round4 INTEGER,
    made_cut INTEGER DEFAULT 0,
    finish_position INTEGER,
    fantasy_points REAL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_id, player_id),
    FOREIGN KEY (tournament_id) REFERENCES golf_tournaments(id),
    FOREIGN KEY (player_id) REFERENCES golf_players(id)
  );

  CREATE TABLE IF NOT EXISTS golf_draft_picks (
    id TEXT PRIMARY KEY,
    golf_league_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    pick_number INTEGER NOT NULL,
    round INTEGER NOT NULL,
    picked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(golf_league_id, player_id),
    FOREIGN KEY (golf_league_id) REFERENCES golf_leagues(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (player_id) REFERENCES golf_players(id)
  );

  CREATE TABLE IF NOT EXISTS golf_faab_bids (
    id TEXT PRIMARY KEY,
    golf_league_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    drop_player_id TEXT,
    bid_amount INTEGER NOT NULL DEFAULT 0,
    tournament_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (golf_league_id) REFERENCES golf_leagues(id),
    FOREIGN KEY (member_id) REFERENCES golf_league_members(id),
    FOREIGN KEY (player_id) REFERENCES golf_players(id)
  );

  CREATE TABLE IF NOT EXISTS golf_core_players (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    locked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(member_id, player_id),
    FOREIGN KEY (member_id) REFERENCES golf_league_members(id),
    FOREIGN KEY (player_id) REFERENCES golf_players(id)
  );
`); } catch (e) { console.log('[golf-db] startup task skipped:', e.message); }

// ── Auction tables ─────────────────────────────────────────────────────────────
try { db.exec(`
  CREATE TABLE IF NOT EXISTS golf_auction_sessions (
    id TEXT PRIMARY KEY,
    league_id TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'waiting',
    current_nomination_member_id TEXT,
    current_player_id TEXT,
    current_high_bid INTEGER DEFAULT 1,
    current_high_bidder_id TEXT,
    nomination_ends_at TEXT,
    nomination_order TEXT DEFAULT '[]',
    nomination_index INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (league_id) REFERENCES golf_leagues(id)
  );

  CREATE TABLE IF NOT EXISTS golf_auction_bids (
    id TEXT PRIMARY KEY,
    league_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    bid_type TEXT DEFAULT 'auction',
    tournament_id TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (league_id) REFERENCES golf_leagues(id),
    FOREIGN KEY (member_id) REFERENCES golf_league_members(id),
    FOREIGN KEY (player_id) REFERENCES golf_players(id)
  );

  CREATE TABLE IF NOT EXISTS golf_auction_budgets (
    id TEXT PRIMARY KEY,
    league_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    auction_credits_remaining INTEGER DEFAULT 1000,
    faab_credits_remaining INTEGER DEFAULT 100,
    faab_last_reset TEXT,
    UNIQUE(league_id, member_id),
    FOREIGN KEY (league_id) REFERENCES golf_leagues(id),
    FOREIGN KEY (member_id) REFERENCES golf_league_members(id)
  );
`); } catch (e) { console.log('[golf-db] startup task skipped:', e.message); }

// ── Schema migrations (idempotent ALTER TABLE) ─────────────────────────────────
const _golfColMigrations = [
  `ALTER TABLE golf_leagues ADD COLUMN format_type TEXT DEFAULT 'tourneyrun'`,
  `ALTER TABLE golf_leagues ADD COLUMN salary_cap INTEGER DEFAULT 2400`,
  `ALTER TABLE golf_leagues ADD COLUMN weekly_salary_cap INTEGER DEFAULT 50000`,
  `ALTER TABLE golf_leagues ADD COLUMN core_spots INTEGER DEFAULT 4`,
  `ALTER TABLE golf_leagues ADD COLUMN flex_spots INTEGER DEFAULT 4`,
  `ALTER TABLE golf_leagues ADD COLUMN faab_budget INTEGER DEFAULT 500`,
  `ALTER TABLE golf_leagues ADD COLUMN use_faab INTEGER DEFAULT 1`,
  `ALTER TABLE golf_leagues ADD COLUMN picks_per_team INTEGER DEFAULT 8`,
  `ALTER TABLE golf_leagues ADD COLUMN auction_budget INTEGER DEFAULT 1000`,
  `ALTER TABLE golf_leagues ADD COLUMN faab_weekly_budget INTEGER DEFAULT 100`,
  `ALTER TABLE golf_leagues ADD COLUMN draft_type TEXT DEFAULT 'snake'`,
  `ALTER TABLE golf_leagues ADD COLUMN bid_timer_seconds INTEGER DEFAULT 30`,
  `ALTER TABLE golf_leagues ADD COLUMN is_sandbox INTEGER DEFAULT 0`,
  `ALTER TABLE golf_leagues ADD COLUMN scoring_style TEXT DEFAULT 'tourneyrun'`,
  `ALTER TABLE golf_leagues ADD COLUMN pool_tier TEXT DEFAULT 'standard'`,
  `ALTER TABLE golf_leagues ADD COLUMN comm_pro_price REAL DEFAULT 19.99`,
  `ALTER TABLE golf_leagues ADD COLUMN payment_methods TEXT DEFAULT '[]'`,
  `ALTER TABLE golf_leagues ADD COLUMN payout_places TEXT DEFAULT '[]'`,
  `ALTER TABLE golf_leagues ADD COLUMN pick_sheet_format TEXT DEFAULT 'tiered'`,
  `ALTER TABLE golf_leagues ADD COLUMN pool_tiers TEXT DEFAULT '[]'`,
  `ALTER TABLE golf_leagues ADD COLUMN pool_salary_cap INTEGER DEFAULT 50000`,
  `ALTER TABLE golf_leagues ADD COLUMN pool_cap_unit INTEGER DEFAULT 50000`,
  `ALTER TABLE golf_leagues ADD COLUMN pool_tournament_id TEXT`,
  `ALTER TABLE golf_leagues ADD COLUMN picks_locked INTEGER DEFAULT 0`,
  `ALTER TABLE golf_leagues ADD COLUMN picks_lock_time TEXT`,
  `ALTER TABLE golf_players ADD COLUMN odds_display TEXT`,
  `ALTER TABLE golf_players ADD COLUMN odds_decimal REAL`,
  `ALTER TABLE golf_tournaments ADD COLUMN is_signature INTEGER DEFAULT 0`,
  `ALTER TABLE golf_tournaments ADD COLUMN prize_money INTEGER DEFAULT 0`,
  `ALTER TABLE golf_tournaments ADD COLUMN espn_event_id TEXT`,
  `ALTER TABLE golf_tournaments ADD COLUMN last_synced_at DATETIME`,
  `ALTER TABLE golf_tournaments ADD COLUMN par INTEGER DEFAULT 72`,
  `ALTER TABLE golf_leagues ADD COLUMN payout_pool_override REAL`,
  `ALTER TABLE golf_leagues ADD COLUMN pool_drop_count INTEGER DEFAULT 2`,
  `ALTER TABLE golf_leagues ADD COLUMN venmo TEXT`,
  `ALTER TABLE golf_leagues ADD COLUMN zelle TEXT`,
  `ALTER TABLE golf_leagues ADD COLUMN paypal TEXT`,
  // Drop-worst-players feature: persisted drop state for pool leagues
  `ALTER TABLE golf_leagues ADD COLUMN pool_drops_applied INTEGER DEFAULT 0`,
  `ALTER TABLE pool_picks ADD COLUMN is_dropped INTEGER DEFAULT 0`,
  `ALTER TABLE pool_picks ADD COLUMN dropped_at DATETIME`,
  // Commissioner payment tracking
  `ALTER TABLE golf_league_members ADD COLUMN is_paid INTEGER DEFAULT 0`,
  // DataGolf integration
  `ALTER TABLE golf_players ADD COLUMN datagolf_id INTEGER`,
  `ALTER TABLE golf_tournaments ADD COLUMN datagolf_event_id INTEGER`,
];
for (const sql of _golfColMigrations) { try { db.exec(sql); } catch (_) {} }

// ── player_master — persistent country lookup that survives tournament resets ──
// This table is the source of truth for player → country mapping.
// It is populated once and updated additively; it never gets wiped when
// pool_tier_players or golf_players are rebuilt for a new tournament.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS player_master (
      player_name TEXT PRIMARY KEY,
      country     TEXT NOT NULL,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
} catch (_) {}

// ── golf_espn_players — persistent ESPN name → canonical mapping ─────────────
// Maps every ESPN display name seen during sync to the canonical DB name and
// country.  Survives tournament resets (never wiped).  Upserted on every sync
// so new players are captured automatically.
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS golf_espn_players (
      espn_name       TEXT PRIMARY KEY,
      display_name    TEXT,
      country_code    TEXT,
      normalized_name TEXT,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
} catch (_) {}

// Populate player_master from the authoritative COUNTRY_MAP (defined below).
// This runs after COUNTRY_MAP is defined — see the try/catch block near line 1107.

// ── Seed known ESPN event IDs for 2026 completed tournaments ──────────────────
// These allow the sync service to skip name-matching and hit the dated scoreboard
// directly. IDs verified via ESPN core API on 2026-03-17.
const _espnIdSeeds = [
  { pattern: '%Pebble Beach%',   id: '401811932' },
  { pattern: '%Genesis Invit%',  id: '401811933' },
  { pattern: '%Arnold Palmer%',  id: '401811935' },
  { pattern: '%PLAYERS%',        id: '401811937' },
  // Valspar Championship 2026 (Mar 20-23, Innisbrook).
  // ID 401811938 confirmed via live scoreboard fetch (135 competitors returned).
  { pattern: '%Valspar%',        id: '401811938' },
  // Texas Children's Houston Open 2026 (Mar 26-29, Memorial Park).
  // ID 401811939 confirmed via ESPN scoreboard API on 2026-03-23.
  { pattern: '%Houston Open%',   id: '401811939' },
];
for (const { pattern, id } of _espnIdSeeds) {
  try {
    db.prepare('UPDATE golf_tournaments SET espn_event_id = ? WHERE name LIKE ? AND (espn_event_id IS NULL OR espn_event_id = \'\')').run(id, pattern);
  } catch (_) {}
}

// ── One-time fix: Beta Group 1.0 league — set draft_type to 'tiered' ──────────
// League 68b1e250 was created as an auction draft but is configured as a tiered
// pool (pick_sheet_format='tiered', format_type='pool'). Align draft_type to match.
try {
  db.prepare(`
    UPDATE golf_leagues
    SET draft_type = 'tiered'
    WHERE id = '68b1e250-6afc-4e80-ad7b-d8a22ae3ad7d'
      AND draft_type != 'tiered'
  `).run();
} catch (e) { console.error('[golf-db] Beta Group 1.0 draft_type fix error:', e.message); }

// ── Valspar 2026 — keep active until tournament actually ends Sunday Mar 22 ───
// ESPN returns STATUS_FINAL after each round, not just at tournament end.
// Force status=active and correct end_date so the sync can't prematurely complete it.
try {
  db.prepare(`
    UPDATE golf_tournaments
    SET status   = 'active',
        end_date = '2026-03-22'
    WHERE espn_event_id = '401811938'
      AND status = 'completed'
  `).run();
} catch (e) { console.error('[golf-db] Valspar status fix error:', e.message); }


// ── Houston Open 2026 — seed tournament row if not present ────────────────────
try {
  const _houston = db.prepare("SELECT id FROM golf_tournaments WHERE name LIKE '%Houston Open%'").get();
  if (!_houston) {
    db.prepare(`
      INSERT INTO golf_tournaments (id, name, course, start_date, end_date, season_year, is_major, status, espn_event_id)
      VALUES (?, 'Texas Children''s Houston Open', 'Memorial Park Golf Course, Houston, TX',
              '2026-03-26', '2026-03-30', 2026, 0, 'scheduled', '401811939')
    `).run(uuidv4());
  } else {
    // Ensure espn_event_id is set even if row already existed
    db.prepare("UPDATE golf_tournaments SET espn_event_id = '401811939' WHERE name LIKE '%Houston Open%' AND (espn_event_id IS NULL OR espn_event_id = '')").run();
  }
} catch (e) { console.error('[golf-db] Houston Open seed error:', e.message); }

// ── Houston Open 2026 — correct start_date to Thursday 3/26 ──────────────────
try {
  db.prepare("UPDATE golf_tournaments SET start_date = '2026-03-26' WHERE name LIKE '%Houston Open%' AND season_year = 2026 AND start_date != '2026-03-26'").run();
} catch (e) { console.error('[golf-db] Houston Open date fix error:', e.message); }

// ── COLLIN promo code — owner free code for personal use / testing ─────────────
try {
  const _existingCollin = db.prepare("SELECT id FROM promo_codes WHERE code = 'COLLIN'").get();
  if (!_existingCollin) {
    db.prepare(`
      INSERT INTO promo_codes (id, code, ambassador_name, ambassador_email, discount_type, discount_value, active)
      VALUES (?, 'COLLIN', 'Collin Wohlfert', 'cwohl@tourneyrun.app', 'free', 100, 1)
    `).run(uuidv4());
  }
} catch (e) { console.error('[golf-db] COLLIN promo code seed error:', e.message); }

// ── Fix league ff568722: point to Houston Open, unlock picks ─────────────────
// League was created pointing to Valspar (wrong tournament). Picks were
// auto-locked when Valspar's lock_time passed. Reassign to Houston Open and
// reset picks_locked + picks_lock_time so the countdown recomputes correctly.
try {
  const _hou = db.prepare("SELECT id FROM golf_tournaments WHERE name LIKE '%Houston Open%'").get();
  if (_hou) {
    db.prepare(`
      UPDATE golf_leagues
      SET pool_tournament_id = ?,
          picks_locked       = 0,
          picks_lock_time    = NULL
      WHERE id = 'ff568722-fbe9-4695-86a8-a31287c22841'
        AND (pool_tournament_id != ? OR picks_locked = 1)
    `).run(_hou.id, _hou.id);
  }
} catch (e) { console.error('[golf-db] League ff568722 tournament fix error:', e.message); }

// ── Beta Group 1.0 — ensure pool_tournament_id points to Valspar ──────────────
try {
  const _valspar = db.prepare("SELECT id FROM golf_tournaments WHERE espn_event_id = '401811938'").get();
  if (_valspar) {
    db.prepare(`
      UPDATE golf_leagues
      SET pool_tournament_id = ?
      WHERE id = '68b1e250-6afc-4e80-ad7b-d8a22ae3ad7d'
        AND (pool_tournament_id IS NULL OR pool_tournament_id = '')
    `).run(_valspar.id);
  }
} catch (e) { console.error('[golf-db] Beta Group 1.0 tournament fix error:', e.message); }

// ── Beta Group 1.0 — status, scoring_style, and test prize pool ───────────────
try {
  db.prepare(`
    UPDATE golf_leagues
    SET status               = 'active',
        scoring_style        = 'total_strokes',
        payout_pool_override = 1000,
        payout_first         = 70,
        payout_second        = 20,
        payout_third         = 10
    WHERE id = '68b1e250-6afc-4e80-ad7b-d8a22ae3ad7d'
  `).run();
} catch (e) { console.error('[golf-db] Beta Group 1.0 config fix error:', e.message); }

// ── Seed golf_players (March 2026 OWGR) ───────────────────────────────────────
const GOLF_PLAYERS = [
  // Elite $800 (rank 1-10)
  { name: 'Scottie Scheffler',              country: 'USA', world_ranking: 1,   salary: 800 },
  { name: 'Rory McIlroy',                   country: 'NIR', world_ranking: 2,   salary: 800 },
  { name: 'Justin Rose',                    country: 'ENG', world_ranking: 3,   salary: 800 },
  { name: 'Tommy Fleetwood',                country: 'ENG', world_ranking: 4,   salary: 800 },
  { name: 'Chris Gotterup',                 country: 'USA', world_ranking: 5,   salary: 800 },
  { name: 'Russell Henley',                 country: 'USA', world_ranking: 6,   salary: 800 },
  { name: 'J.J. Spaun',                     country: 'USA', world_ranking: 7,   salary: 800 },
  { name: 'Robert MacIntyre',               country: 'SCO', world_ranking: 8,   salary: 800 },
  { name: 'Ben Griffin',                    country: 'USA', world_ranking: 9,   salary: 800 },
  { name: 'Xander Schauffele',              country: 'USA', world_ranking: 10,  salary: 800 },
  // Premium $700 (rank 11-30)
  { name: 'Hideki Matsuyama',               country: 'JPN', world_ranking: 11,  salary: 700 },
  { name: 'Justin Thomas',                  country: 'USA', world_ranking: 12,  salary: 700 },
  { name: 'Harris English',                 country: 'USA', world_ranking: 13,  salary: 700 },
  { name: 'Sepp Straka',                    country: 'AUT', world_ranking: 14,  salary: 700 },
  { name: 'Viktor Hovland',                 country: 'NOR', world_ranking: 15,  salary: 700 },
  { name: 'Alex Noren',                     country: 'SWE', world_ranking: 16,  salary: 700 },
  { name: 'Patrick Reed',                   country: 'USA', world_ranking: 17,  salary: 700 },
  { name: 'Keegan Bradley',                 country: 'USA', world_ranking: 18,  salary: 700 },
  { name: 'Collin Morikawa',                country: 'USA', world_ranking: 19,  salary: 700 },
  { name: 'Ludvig Åberg',                   country: 'SWE', world_ranking: 20,  salary: 700 },
  { name: 'Cameron Young',                  country: 'USA', world_ranking: 21,  salary: 700 },
  { name: 'Maverick McNealy',               country: 'USA', world_ranking: 22,  salary: 700 },
  { name: 'Matt Fitzpatrick',               country: 'ENG', world_ranking: 23,  salary: 700 },
  { name: 'Ryan Gerard',                    country: 'USA', world_ranking: 24,  salary: 700 },
  { name: 'Tyrrell Hatton',                 country: 'ENG', world_ranking: 25,  salary: 700 },
  { name: 'Si Woo Kim',                     country: 'KOR', world_ranking: 26,  salary: 700 },
  { name: 'Aaron Rai',                      country: 'ENG', world_ranking: 27,  salary: 700 },
  { name: 'Sam Burns',                      country: 'USA', world_ranking: 28,  salary: 700 },
  { name: 'Shane Lowry',                    country: 'IRL', world_ranking: 29,  salary: 700 },
  { name: 'Patrick Cantlay',                country: 'USA', world_ranking: 30,  salary: 700 },
  // Mid $550 (rank 31-70)
  { name: 'Marco Penge',                    country: 'ENG', world_ranking: 31,  salary: 550 },
  { name: 'Corey Conners',                  country: 'CAN', world_ranking: 32,  salary: 550 },
  { name: 'Bryson DeChambeau',              country: 'USA', world_ranking: 33,  salary: 550 },
  { name: 'Jason Day',                      country: 'AUS', world_ranking: 34,  salary: 550 },
  { name: 'Andrew Novak',                   country: 'USA', world_ranking: 35,  salary: 550 },
  { name: 'Matt McCarty',                   country: 'USA', world_ranking: 36,  salary: 550 },
  { name: 'Michael Brennan',                country: 'USA', world_ranking: 37,  salary: 550 },
  { name: 'Kristoffer Reitan',              country: 'NOR', world_ranking: 38,  salary: 550 },
  { name: 'Sam Stevens',                    country: 'USA', world_ranking: 39,  salary: 550 },
  { name: 'Rasmus Hojgaard',                country: 'DEN', world_ranking: 40,  salary: 550 },
  { name: 'Michael Kim',                    country: 'USA', world_ranking: 41,  salary: 550 },
  { name: 'Kurt Kitayama',                  country: 'USA', world_ranking: 42,  salary: 550 },
  { name: 'Michael Thorbjornsen',           country: 'USA', world_ranking: 43,  salary: 550 },
  { name: 'Pierceson Coody',                country: 'USA', world_ranking: 44,  salary: 550 },
  { name: 'Sami Valimaki',                  country: 'FIN', world_ranking: 45,  salary: 550 },
  { name: 'Brian Harman',                   country: 'USA', world_ranking: 46,  salary: 550 },
  { name: 'Max Greyserman',                 country: 'USA', world_ranking: 47,  salary: 550 },
  { name: 'Akshay Bhatia',                  country: 'USA', world_ranking: 48,  salary: 550 },
  { name: 'Ryan Fox',                       country: 'NZL', world_ranking: 49,  salary: 550 },
  { name: 'Nicolai Hojgaard',               country: 'DEN', world_ranking: 50,  salary: 550 },
  { name: 'Jayden Schaper',                 country: 'RSA', world_ranking: 51,  salary: 550 },
  { name: 'Min Woo Lee',                    country: 'AUS', world_ranking: 52,  salary: 550 },
  { name: 'Daniel Berger',                  country: 'USA', world_ranking: 53,  salary: 550 },
  { name: 'Rasmus Neergaard-Petersen',      country: 'DEN', world_ranking: 54,  salary: 550 },
  { name: 'Jacob Bridgeman',                country: 'USA', world_ranking: 55,  salary: 550 },
  { name: 'Wyndham Clark',                  country: 'USA', world_ranking: 56,  salary: 550 },
  { name: 'Johnny Keefer',                  country: 'USA', world_ranking: 57,  salary: 550 },
  { name: 'Nick Taylor',                    country: 'CAN', world_ranking: 58,  salary: 550 },
  { name: 'Harry Hall',                     country: 'ENG', world_ranking: 59,  salary: 550 },
  { name: 'Taylor Pendrith',                country: 'CAN', world_ranking: 60,  salary: 550 },
  { name: 'J.T. Poston',                    country: 'USA', world_ranking: 61,  salary: 550 },
  { name: 'Jake Knapp',                     country: 'USA', world_ranking: 62,  salary: 550 },
  { name: 'Thomas Detry',                   country: 'BEL', world_ranking: 63,  salary: 550 },
  { name: 'Sungjae Im',                     country: 'KOR', world_ranking: 64,  salary: 550 },
  { name: 'Nico Echavarria',                country: 'COL', world_ranking: 65,  salary: 550 },
  { name: 'Max McGreevy',                   country: 'USA', world_ranking: 66,  salary: 550 },
  { name: 'Jon Rahm',                       country: 'ESP', world_ranking: 67,  salary: 550 },
  { name: 'Haotong Li',                     country: 'CHN', world_ranking: 68,  salary: 550 },
  { name: 'Garrick Higgo',                  country: 'RSA', world_ranking: 69,  salary: 550 },
  { name: 'Adam Scott',                     country: 'AUS', world_ranking: 70,  salary: 550 },
  // Value $400 (rank 71-110)
  { name: 'Billy Horschel',                 country: 'USA', world_ranking: 71,  salary: 400 },
  { name: 'Lucas Glover',                   country: 'USA', world_ranking: 72,  salary: 400 },
  { name: 'Rico Hoey',                      country: 'USA', world_ranking: 73,  salary: 400 },
  { name: 'Laurie Canter',                  country: 'ENG', world_ranking: 74,  salary: 400 },
  { name: 'Rickie Fowler',                  country: 'USA', world_ranking: 75,  salary: 400 },
  { name: 'Dan Brown',                      country: 'ENG', world_ranking: 76,  salary: 400 },
  { name: 'Elvis Smylie',                   country: 'AUS', world_ranking: 77,  salary: 400 },
  { name: 'Bud Cauley',                     country: 'USA', world_ranking: 78,  salary: 400 },
  { name: 'Ryo Hisatsune',                  country: 'JPN', world_ranking: 79,  salary: 400 },
  { name: 'Thriston Lawrence',              country: 'RSA', world_ranking: 80,  salary: 400 },
  { name: 'Brian Campbell',                 country: 'USA', world_ranking: 81,  salary: 400 },
  { name: 'Tom McKibbin',                   country: 'NIR', world_ranking: 82,  salary: 400 },
  { name: 'Denny McCarthy',                 country: 'USA', world_ranking: 83,  salary: 400 },
  { name: 'John Parry',                     country: 'ENG', world_ranking: 84,  salary: 400 },
  { name: 'Adrien Saddier',                 country: 'FRA', world_ranking: 85,  salary: 400 },
  { name: 'Patrick Rodgers',                country: 'USA', world_ranking: 86,  salary: 400 },
  { name: 'David Puig',                     country: 'ESP', world_ranking: 87,  salary: 400 },
  { name: 'Christiaan Bezuidenhout',        country: 'RSA', world_ranking: 88,  salary: 400 },
  { name: 'Jordan Spieth',                  country: 'USA', world_ranking: 89,  salary: 400 },
  { name: 'Matt Wallace',                   country: 'ENG', world_ranking: 90,  salary: 400 },
  { name: 'Jordan Smith',                   country: 'ENG', world_ranking: 91,  salary: 400 },
  { name: 'Sahith Theegala',                country: 'USA', world_ranking: 92,  salary: 400 },
  { name: 'Chris Kirk',                     country: 'USA', world_ranking: 93,  salary: 400 },
  { name: 'Aldrich Potgieter',              country: 'RSA', world_ranking: 94,  salary: 400 },
  { name: 'Jhonattan Vegas',                country: 'VEN', world_ranking: 95,  salary: 400 },
  { name: 'Tom Hoge',                       country: 'USA', world_ranking: 96,  salary: 400 },
  { name: 'Thorbjorn Olesen',               country: 'DEN', world_ranking: 97,  salary: 400 },
  { name: 'Davis Riley',                    country: 'USA', world_ranking: 98,  salary: 400 },
  { name: 'Matti Schmid',                   country: 'GER', world_ranking: 99,  salary: 400 },
  { name: 'Daniel Hillier',                 country: 'NZL', world_ranking: 100, salary: 400 },
  { name: 'Stephan Jaeger',                 country: 'GER', world_ranking: 101, salary: 400 },
  { name: 'Kevin Yu',                       country: 'TPE', world_ranking: 102, salary: 400 },
  { name: 'Mac Meissner',                   country: 'USA', world_ranking: 103, salary: 400 },
  { name: 'Mackenzie Hughes',               country: 'CAN', world_ranking: 104, salary: 400 },
  { name: 'Tony Finau',                     country: 'USA', world_ranking: 105, salary: 400 },
  { name: 'Andy Sullivan',                  country: 'ENG', world_ranking: 106, salary: 400 },
  { name: 'Byeong Hun An',                  country: 'KOR', world_ranking: 107, salary: 400 },
  { name: 'Ian Holt',                       country: 'USA', world_ranking: 108, salary: 400 },
  { name: 'Shaun Norris',                   country: 'RSA', world_ranking: 109, salary: 400 },
  { name: 'Emiliano Grillo',                country: 'ARG', world_ranking: 110, salary: 400 },
  // Sleeper $250 (rank 111-150)
  { name: 'Keita Nakajima',                 country: 'JPN', world_ranking: 111, salary: 250 },
  { name: 'Davis Thompson',                 country: 'USA', world_ranking: 112, salary: 250 },
  { name: 'Angel Ayora',                    country: 'ESP', world_ranking: 113, salary: 250 },
  { name: 'Jorge Campillo',                 country: 'ESP', world_ranking: 114, salary: 250 },
  { name: 'Adri Arnaus',                    country: 'ESP', world_ranking: 115, salary: 250 },
  { name: 'Fabrizio Zanotti',               country: 'PAR', world_ranking: 116, salary: 250 },
  { name: 'Sam Bairstow',                   country: 'ENG', world_ranking: 117, salary: 250 },
  { name: 'Cam Davis',                      country: 'AUS', world_ranking: 118, salary: 250 },
  { name: 'Justin Suh',                     country: 'USA', world_ranking: 119, salary: 250 },
  { name: 'Mark Hubbard',                   country: 'USA', world_ranking: 120, salary: 250 },
  { name: 'Scott Stallings',                country: 'USA', world_ranking: 121, salary: 250 },
  { name: 'Eric Cole',                      country: 'USA', world_ranking: 122, salary: 250 },
  { name: 'Beau Hossler',                   country: 'USA', world_ranking: 123, salary: 250 },
  { name: 'Harris Barr',                    country: 'USA', world_ranking: 124, salary: 250 },
  { name: 'Joe Highsmith',                  country: 'USA', world_ranking: 125, salary: 250 },
  { name: 'Austin Eckroat',                 country: 'USA', world_ranking: 126, salary: 250 },
  { name: 'Tom Kim',                        country: 'KOR', world_ranking: 127, salary: 250 },
  { name: 'Greyson Sigg',                   country: 'USA', world_ranking: 128, salary: 250 },
  { name: 'Luke List',                      country: 'USA', world_ranking: 129, salary: 250 },
  { name: 'Adam Hadwin',                    country: 'CAN', world_ranking: 130, salary: 250 },
  { name: 'Joel Dahmen',                    country: 'USA', world_ranking: 131, salary: 250 },
  { name: 'Kevin Streelman',                country: 'USA', world_ranking: 132, salary: 250 },
  { name: 'Harold Varner III',              country: 'USA', world_ranking: 133, salary: 250 },
  { name: 'Patrick Fishburn',               country: 'USA', world_ranking: 134, salary: 250 },
  { name: 'Neal Shipley',                   country: 'USA', world_ranking: 135, salary: 250 },
  { name: 'Taylor Moore',                   country: 'USA', world_ranking: 136, salary: 250 },
  { name: 'Ben Silverman',                  country: 'CAN', world_ranking: 137, salary: 250 },
  { name: 'Nate Lashley',                   country: 'USA', world_ranking: 138, salary: 250 },
  { name: 'Chesson Hadley',                 country: 'USA', world_ranking: 139, salary: 250 },
  { name: 'David Lipsky',                   country: 'USA', world_ranking: 140, salary: 250 },
  { name: 'Stewart Cink',                   country: 'USA', world_ranking: 141, salary: 250 },
  { name: 'Charles Howell III',             country: 'USA', world_ranking: 142, salary: 250 },
  { name: 'Mito Pereira',                   country: 'CHI', world_ranking: 143, salary: 250 },
  { name: 'Vincent Norrman',                country: 'SWE', world_ranking: 144, salary: 250 },
  { name: 'Lee Hodges',                     country: 'USA', world_ranking: 145, salary: 250 },
  { name: 'Turk Pettit',                    country: 'USA', world_ranking: 146, salary: 250 },
  { name: 'Paul Barjon',                    country: 'FRA', world_ranking: 147, salary: 250 },
  { name: 'Alejandro Tosti',                country: 'ARG', world_ranking: 148, salary: 250 },
  { name: 'Carl Yuan',                      country: 'CHN', world_ranking: 149, salary: 250 },
  { name: 'Tiger Woods',                    country: 'USA', world_ranking: 150, salary: 250 },
  // Houston Open field players not in OWGR top 150 — added here so they survive reseeds
  // and the sync can always match their ESPN names without relying on the field-seed code.
  { name: 'Sudarshan Yellamaraju',          country: 'CAN', world_ranking: 200, salary: 200 },
  { name: 'Brooks Koepka',                  country: 'USA', world_ranking: 201, salary: 200 },
  { name: 'Karl Vilips',                    country: 'AUS', world_ranking: 202, salary: 200 },
  { name: 'Gary Woodland',                  country: 'USA', world_ranking: 203, salary: 200 },
];

// Force-replace players when base set is incomplete.
// Use < (not !==) so field-seed code adding extra players beyond the base list doesn't
// trigger a spurious reseed on every deploy (which wipes golf_scores).
// Sentinel checks ensure key players from recent array additions are present.
try {
  const existingCount = db.prepare('SELECT COUNT(*) as c FROM golf_players').get().c;
  const hasGotterup = db.prepare("SELECT COUNT(*) as c FROM golf_players WHERE name = 'Chris Gotterup'").get().c;
  const hasYellamaraju = db.prepare("SELECT COUNT(*) as c FROM golf_players WHERE name = 'Sudarshan Yellamaraju'").get().c;
  if (existingCount < GOLF_PLAYERS.length || hasGotterup === 0 || hasYellamaraju === 0) {
    db.transaction(() => {
      // Remove roster/lineup/draft/core refs before dropping players
      db.prepare('DELETE FROM golf_weekly_lineups').run();
      db.prepare('DELETE FROM golf_rosters').run();
      db.prepare('DELETE FROM golf_draft_picks').run();
      db.prepare('DELETE FROM golf_core_players').run();
      db.prepare('DELETE FROM golf_auction_bids').run();
      db.prepare('DELETE FROM golf_faab_bids').run();
      db.prepare('DELETE FROM golf_scores').run();
      db.prepare('DELETE FROM golf_players').run();
      const ins = db.prepare(`INSERT INTO golf_players (id, name, country, world_ranking, owgr_points, salary, is_active) VALUES (?, ?, ?, ?, 0, ?, 1)`);
      for (const p of GOLF_PLAYERS) ins.run(uuidv4(), p.name, p.country, p.world_ranking, p.salary);
    })();
    console.log('[golf-db] Reseeded', GOLF_PLAYERS.length, 'golf players (5-tier system)');

    // After a rebuild, re-anchor pool_picks player_id to new golf_players IDs by name.
    // Without this, any existing pool_picks would have stale IDs that don't match the
    // newly-reseeded golf_players rows, causing the standings JOIN to return null scores.
    try {
      const updPicks = db.prepare(`
        UPDATE pool_picks
        SET player_id = (SELECT id FROM golf_players WHERE name = pool_picks.player_name LIMIT 1)
        WHERE player_name IN (SELECT name FROM golf_players)
      `);
      const { changes } = updPicks.run();
      if (changes > 0) console.log(`[golf-db] Re-anchored ${changes} pool_picks to new player IDs`);

      const updTierPicks = db.prepare(`
        UPDATE pool_tier_players
        SET player_id = (SELECT id FROM golf_players WHERE name = pool_tier_players.player_name LIMIT 1)
        WHERE player_name IN (SELECT name FROM golf_players)
      `);
      const tierChanges = updTierPicks.run().changes;
      if (tierChanges > 0) console.log(`[golf-db] Re-anchored ${tierChanges} pool_tier_players to new player IDs`);
    } catch (e) { console.error('[golf-db] pool_picks re-anchor error:', e.message); }
  }
} catch (e) { console.log('[golf-db] startup task skipped:', e.message); }

// ── Seed golf_tournaments (2026 Signature / Major schedule) ───────────────────
const TOURNAMENTS_2026 = [
  { name: 'AT&T Pebble Beach Pro-Am',  course: 'Pebble Beach Golf Links, CA',    start_date: '2026-02-12', end_date: '2026-02-15', is_major: 0, is_signature: 1, prize_money: 20000000, forceStatus: 'completed' },
  { name: 'Genesis Invitational',      course: 'Riviera Country Club, CA',       start_date: '2026-02-19', end_date: '2026-02-22', is_major: 0, is_signature: 1, prize_money: 20000000, forceStatus: 'completed' },
  { name: 'Arnold Palmer Invitational',course: 'Bay Hill Club & Lodge, FL',      start_date: '2026-03-05', end_date: '2026-03-08', is_major: 0, is_signature: 1, prize_money: 20000000, forceStatus: 'completed' },
  { name: 'The Players Championship',  course: 'TPC Sawgrass, FL',              start_date: '2026-03-12', end_date: '2026-03-15', is_major: 0, is_signature: 0, prize_money: 25000000, forceStatus: 'completed' },
  { name: 'Masters Tournament',        course: 'Augusta National Golf Club, GA', start_date: '2026-04-06', end_date: '2026-04-12', is_major: 1, is_signature: 1, prize_money: 21000000, forceStatus: 'scheduled' },
  { name: 'RBC Heritage',              course: 'Harbour Town Golf Links, SC',   start_date: '2026-04-16', end_date: '2026-04-19', is_major: 0, is_signature: 1, prize_money: 20000000, forceStatus: 'scheduled' },
  { name: 'Cadillac Championship',     course: 'Trump National Doral, FL',      start_date: '2026-04-30', end_date: '2026-05-03', is_major: 0, is_signature: 1, prize_money: 20000000, forceStatus: 'scheduled' },
  { name: 'Truist Championship',       course: 'Quail Hollow Club, NC',         start_date: '2026-05-07', end_date: '2026-05-10', is_major: 0, is_signature: 1, prize_money: 20000000, forceStatus: 'scheduled' },
  { name: 'PGA Championship',          course: 'Aronimink Golf Club, PA',       start_date: '2026-05-11', end_date: '2026-05-17', is_major: 1, is_signature: 1, prize_money: 21000000, forceStatus: 'scheduled' },
  { name: 'The Memorial Tournament',   course: 'Muirfield Village Golf Club, OH',start_date: '2026-06-04', end_date: '2026-06-07', is_major: 0, is_signature: 1, prize_money: 20000000, forceStatus: 'scheduled' },
  { name: 'US Open',                   course: 'Shinnecock Hills Golf Club, NY', start_date: '2026-06-15', end_date: '2026-06-21', is_major: 1, is_signature: 1, prize_money: 21000000, forceStatus: 'scheduled' },
  { name: 'Travelers Championship',    course: 'TPC River Highlands, CT',       start_date: '2026-06-25', end_date: '2026-06-28', is_major: 0, is_signature: 1, prize_money: 20000000, forceStatus: 'scheduled' },
  { name: 'The Open Championship',     course: 'Royal Birkdale, England',       start_date: '2026-07-13', end_date: '2026-07-19', is_major: 1, is_signature: 1, prize_money: 21000000, forceStatus: 'scheduled' },
];

// Force-replace tournaments if the new schedule isn't seeded yet
try {
  const hasPebble = db.prepare("SELECT COUNT(*) as c FROM golf_tournaments WHERE name = 'AT&T Pebble Beach Pro-Am'").get().c;
  if (hasPebble === 0) {
    db.prepare("DELETE FROM golf_tournaments WHERE season_year = 2026").run();
    db.prepare("DELETE FROM golf_tournaments WHERE season_year = 2025").run();
    const insT = db.prepare(`
      INSERT OR IGNORE INTO golf_tournaments
        (id, name, course, start_date, end_date, season_year, is_major, is_signature, status, purse, prize_money)
      VALUES (?, ?, ?, ?, ?, 2026, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const t of TOURNAMENTS_2026) {
        insT.run(uuidv4(), t.name, t.course, t.start_date, t.end_date, t.is_major, t.is_signature, t.forceStatus, t.prize_money, t.prize_money);
      }
    })();
    console.log('[golf-db] Seeded', TOURNAMENTS_2026.length, '2026 signature/major tournaments');
  }
} catch (e) { console.log('[golf-db] startup task skipped:', e.message); }

// ── Golf user profile fields ───────────────────────────────────────────────────
try { db.exec("ALTER TABLE users ADD COLUMN gender TEXT DEFAULT NULL"); }         catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN dob TEXT DEFAULT NULL"); }            catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN dob_verified INTEGER DEFAULT 0"); }   catch (e) {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS golf_user_profiles (
      user_id TEXT PRIMARY KEY,
      profile_complete INTEGER DEFAULT 0,
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
} catch (e) { console.error('[golf-db] golf_user_profiles error:', e.message); }

// ── Golf Payment Tables ────────────────────────────────────────────────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS golf_season_passes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      season TEXT NOT NULL DEFAULT '2026',
      paid_at TEXT,
      stripe_session_id TEXT,
      UNIQUE(user_id, season)
    );

    CREATE TABLE IF NOT EXISTS golf_pool_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tournament_id TEXT NOT NULL,
      paid_at TEXT,
      stripe_session_id TEXT,
      UNIQUE(user_id, tournament_id)
    );

    CREATE TABLE IF NOT EXISTS golf_comm_pro (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      commissioner_id TEXT NOT NULL,
      season TEXT NOT NULL DEFAULT '2026',
      paid_at TEXT,
      promo_applied INTEGER DEFAULT 0,
      stripe_session_id TEXT,
      UNIQUE(league_id, season)
    );

    CREATE TABLE IF NOT EXISTS golf_referral_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS golf_referral_credits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      balance REAL DEFAULT 0,
      season TEXT NOT NULL DEFAULT '2026',
      expires_at TEXT,
      UNIQUE(user_id, season)
    );

    CREATE TABLE IF NOT EXISTS golf_referral_redemptions (
      id TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL,
      referred_id TEXT NOT NULL,
      credit_amount REAL NOT NULL,
      redeemed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS golf_migrations (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      commissioner_id TEXT NOT NULL,
      member_count_at_promo INTEGER,
      promo_applied INTEGER DEFAULT 0,
      source_platform TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
} catch (e) {
  console.error('[golf-db] Payment tables migration error:', e.message);
}

// ── Promo / Ambassador Code Tables ─────────────────────────────────────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS promo_codes (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      ambassador_name TEXT NOT NULL DEFAULT '',
      ambassador_email TEXT NOT NULL DEFAULT '',
      discount_type TEXT NOT NULL DEFAULT 'percent',
      discount_value REAL NOT NULL DEFAULT 100,
      uses_count INTEGER NOT NULL DEFAULT 0,
      revenue_attributed REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS promo_code_uses (
      id TEXT PRIMARY KEY,
      promo_code_id TEXT NOT NULL,
      league_id TEXT,
      user_id TEXT NOT NULL,
      original_price REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0,
      final_price REAL NOT NULL DEFAULT 0,
      used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id)
    );
  `);
} catch (e) {
  console.error('[golf-db] Promo codes migration error:', e.message);
}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pool_picks (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      tournament_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      tier_number INTEGER,
      salary_used INTEGER DEFAULT 0,
      submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (league_id) REFERENCES golf_leagues(id)
    );
  `);
} catch (e) { console.error('[golf-db] pool_picks table error:', e.message); }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pool_tier_players (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      tournament_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      tier_number INTEGER NOT NULL,
      odds_display TEXT,
      odds_decimal REAL,
      world_ranking INTEGER,
      salary INTEGER DEFAULT 0,
      manually_overridden INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (league_id) REFERENCES golf_leagues(id)
    );
  `);
} catch (e) { console.error('[golf-db] pool_tier_players table error:', e.message); }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pool_tiers (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      tier_number INTEGER NOT NULL,
      odds_min TEXT DEFAULT '',
      odds_max TEXT DEFAULT '',
      picks_allowed INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (league_id) REFERENCES golf_leagues(id)
    );
  `);
} catch (e) { console.error('[golf-db] pool_tiers table error:', e.message); }

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS golf_tournament_fields (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      player_id TEXT,
      espn_player_id TEXT,
      world_ranking INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tournament_id, player_name)
    );
  `);
} catch (e) { console.error('[golf-db] golf_tournament_fields table error:', e.message); }

// Add odds columns to golf_tournament_fields if they were added after initial deploy
try { db.exec(`ALTER TABLE golf_tournament_fields ADD COLUMN odds_display TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE golf_tournament_fields ADD COLUMN odds_decimal REAL`); } catch (_) {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS golf_waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'golf_pool',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_golf_waitlist_email_format ON golf_waitlist(email, format);
  `);
} catch (e) {
  console.error('[golf-db] Waitlist table migration error:', e.message);
}

// ── Auto-assign tier players for pool leagues missing them ────────────────────
// Runs at startup for any pool league that has pool_tournament_id set but no
// pool_tier_players rows yet (e.g. newly-pointed leagues or fresh deploys).
try {
  function _oddsToDecimal(str) {
    if (!str) return 999;
    const parts = String(str).split(':');
    if (parts.length !== 2) return 999;
    const n = parseFloat(parts[0]), d = parseFloat(parts[1]);
    if (isNaN(n) || isNaN(d) || d === 0) return 999;
    return n / d + 1;
  }
  function _rankToOddsLocal(rank) {
    const r = rank || 9999;
    const bands = [
      { minRank: 1,   maxRank: 5,    minOdds: 8,   maxOdds: 15   },
      { minRank: 6,   maxRank: 15,   minOdds: 18,  maxOdds: 33   },
      { minRank: 16,  maxRank: 30,   minOdds: 35,  maxOdds: 80   },
      { minRank: 31,  maxRank: 60,   minOdds: 90,  maxOdds: 150  },
      { minRank: 61,  maxRank: 100,  minOdds: 175, maxOdds: 400  },
      { minRank: 101, maxRank: 9999, minOdds: 500, maxOdds: 2000 },
    ];
    const band = bands.find(b => r >= b.minRank && r <= b.maxRank) || bands[bands.length - 1];
    const bandSize = Math.max(1, band.maxRank - band.minRank);
    const pos = Math.min(1, (r - band.minRank) / bandSize);
    const rawOdds = Math.round(band.minOdds + pos * (band.maxOdds - band.minOdds));
    const nice = rawOdds < 20 ? Math.round(rawOdds / 2) * 2 :
                 rawOdds < 100 ? Math.round(rawOdds / 5) * 5 :
                 Math.round(rawOdds / 25) * 25;
    return { odds_display: `${nice}:1`, odds_decimal: nice + 1 };
  }
  function _pickTier(odds_decimal, tiersConfig) {
    const dec = odds_decimal || 999;
    for (const t of tiersConfig) {
      if (dec >= _oddsToDecimal(t.odds_min) && dec <= _oddsToDecimal(t.odds_max)) return t.tier;
    }
    return tiersConfig[tiersConfig.length - 1]?.tier || 1;
  }

  const _poolLeagues = db.prepare(
    "SELECT * FROM golf_leagues WHERE format_type = 'pool' AND pool_tournament_id IS NOT NULL AND status != 'archived'"
  ).all();

  const _insTP = db.prepare(`
    INSERT OR REPLACE INTO pool_tier_players
      (id, league_id, tournament_id, player_id, player_name, tier_number,
       odds_display, odds_decimal, world_ranking, salary, manually_overridden)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
  `);

  for (const _league of _poolLeagues) {
    const _existing = db.prepare(
      'SELECT COUNT(*) as cnt FROM pool_tier_players WHERE league_id = ? AND tournament_id = ?'
    ).get(_league.id, _league.pool_tournament_id);
    if (_existing.cnt > 0) continue;

    let _tiersConfig = [];
    try { _tiersConfig = JSON.parse(_league.pool_tiers || '[]'); } catch (_) {}
    if (!_tiersConfig.length) continue;

    const _players = db.prepare('SELECT * FROM golf_players WHERE is_active = 1 ORDER BY world_ranking ASC').all();
    db.transaction(() => {
      for (const _p of _players) {
        const _gen = (!_p.odds_display || !_p.odds_decimal) ? _rankToOddsLocal(_p.world_ranking) : null;
        const _od = _p.odds_display || _gen.odds_display;
        const _dec = _p.odds_decimal || _gen.odds_decimal;
        const _tier = _pickTier(_dec, _tiersConfig);
        _insTP.run(uuidv4(), _league.id, _league.pool_tournament_id, _p.id, _p.name, _tier, _od, _dec, _p.world_ranking);
      }
    })();
    console.log(`[golf-db] Auto-assigned tier players for league ${_league.id} (${_league.name})`);
  }

  // ── Houston Open field correction (one-time fix) ────────────────────────────
  // If McIlroy (not in field) is present OR Zalatoris (in field) is absent,
  // the pool_tier_players were built from global OWGR, not the actual entry list.
  // Rebuild from the official 133-player field.
  const _HOU_LEAGUE_ID = 'ff568722-fbe9-4695-86a8-a31287c22841';
  const _houLeague = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(_HOU_LEAGUE_ID);
  if (_houLeague && _houLeague.pool_tournament_id) {
    const _tid = _houLeague.pool_tournament_id;
    const _mcIlroy = db.prepare(
      "SELECT 1 FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND player_name = 'Rory McIlroy'"
    ).get(_HOU_LEAGUE_ID, _tid);
    const _zalatoris = db.prepare(
      "SELECT 1 FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND player_name = 'Will Zalatoris'"
    ).get(_HOU_LEAGUE_ID, _tid);

    if (_mcIlroy || !_zalatoris) {
      console.log('[golf-db] Houston Open: wrong field detected — rebuilding from official 133-player list...');

      const _officialField = [
        'Zach Bauchou', 'Christiaan Bezuidenhout', 'Chandler Blanchet', 'Michael Brennan',
        'Dan Brown', 'Bronson Burgoon', 'Sam Burns', 'Brian Campbell', 'Rafael Campos',
        'Ricky Castillo', 'Bud Cauley', 'Davis Chatfield', 'Luke Clanton', 'Wyndham Clark',
        'Eric Cole', 'Pierceson Coody', 'Jason Day', 'Zecheng Dou',
        'Adrien Dumont de Chassart', 'Nick Dunlap', 'Nico Echavarria', 'Austin Eckroat',
        'Harris English', 'A.J. Ewart', 'Tony Finau', 'Patrick Fishburn', 'Steven Fisk',
        'David Ford', 'Rickie Fowler', 'Ryan Fox', 'Brice Garnett', 'Ryan Gerard',
        'Doug Ghim', 'Lucas Glover', 'Chris Gotterup', 'Max Greyserman', 'Ben Griffin',
        'Emiliano Grillo', 'Nicolai Hojgaard', 'Rasmus Hojgaard', 'Harry Hall',
        'Cole Hammer', 'Garrick Higgo', 'Joe Highsmith', 'Kensei Hirata', 'Lee Hodges',
        'Rico Hoey', 'Charley Hoffman', 'Tom Hoge', 'Billy Horschel', 'Beau Hossler',
        'Mason Howell', 'Mark Hubbard', 'Mackenzie Hughes', 'Sungjae Im', 'Stephan Jaeger',
        'Takumi Kanaya', 'Jeffrey Kang', 'Johnny Keefer', 'Si Woo Kim', 'Tom Kim',
        'Chris Kirk', 'Kurt Kitayama', 'Patton Kizzire', 'Jake Knapp', 'Brooks Koepka',
        'Christo Lamprecht', 'Hank Lebioda', 'K.H. Lee', 'Min Woo Lee', 'Haotong Li',
        'David Lipsky', 'Shane Lowry', 'Peter Malnati', 'Denny McCarthy', 'Max McGreevy',
        'Mac Meissner', 'Keith Mitchell', 'William Mouw', 'Trey Mullinax',
        'Rasmus Neergaard-Petersen', 'Pontus Nyholm', 'Thorbjorn Olesen', 'John Parry',
        'Matthieu Pavon', 'Taylor Pendrith', 'Marco Penge', 'Chandler Phillips',
        'J.T. Poston', 'Aldrich Potgieter', 'Andrew Putnam', 'Aaron Rai', 'Chad Ramey',
        'Kristoffer Reitan', 'Davis Riley', 'Patrick Rodgers', 'Kevin Roy', 'Marcelo Rozo',
        'Casey Russell', 'Adrien Saddier', 'Isaiah Salinda', 'Gordon Sargent',
        'Scottie Scheffler', 'Adam Schenk', 'Matti Schmid', 'Adam Scott', 'Neal Shipley',
        'Alex Smalley', 'Jordan Smith', 'Jimmy Stanger', 'Sam Stevens', 'Jesper Svensson',
        'Adam Svensson', 'Sahith Theegala', 'Davis Thompson', 'Michael Thorbjornsen',
        'Alejandro Tosti', 'Erik van Rooyen', 'John VanDerLaan', 'Jhonattan Vegas',
        'Kris Ventura', 'Karl Vilips', 'Danny Walker', 'Matt Wallace', 'Paul Waring',
        'Vince Whaley', 'Danny Willett', 'Aaron Wise', 'Gary Woodland', 'Dylan Wu',
        'Sudarshan Yellamaraju', 'Kevin Yu', 'Will Zalatoris',
      ];

      const _getGP = db.prepare('SELECT * FROM golf_players WHERE name = ? LIMIT 1');
      const _insGP = db.prepare(
        'INSERT OR IGNORE INTO golf_players (id, name, is_active, world_ranking) VALUES (?, ?, 1, ?)'
      );
      const _insTF = db.prepare(`
        INSERT OR REPLACE INTO golf_tournament_fields
          (id, tournament_id, player_name, player_id, world_ranking)
        VALUES (?, ?, ?, ?, ?)
      `);

      let _houTiersConfig = [];
      try { _houTiersConfig = JSON.parse(_houLeague.pool_tiers || '[]'); } catch (_e) {}

      db.prepare('DELETE FROM pool_tier_players WHERE league_id = ? AND tournament_id = ?').run(_HOU_LEAGUE_ID, _tid);
      db.prepare('DELETE FROM golf_tournament_fields WHERE tournament_id = ?').run(_tid);

      db.transaction(() => {
        for (const _pname of _officialField) {
          let _p = _getGP.get(_pname);
          if (!_p) {
            _insGP.run(uuidv4(), _pname, 200);
            _p = _getGP.get(_pname);
          }
          if (!_p) continue;

          _insTF.run(uuidv4(), _tid, _pname, _p.id, _p.world_ranking || 200);

          const _gen2 = (!_p.odds_display || !_p.odds_decimal) ? _rankToOddsLocal(_p.world_ranking || 200) : null;
          const _od2 = _p.odds_display || _gen2.odds_display;
          const _dec2 = _p.odds_decimal || _gen2.odds_decimal;
          const _tier2 = _houTiersConfig.length ? _pickTier(_dec2, _houTiersConfig) : 6;

          _insTP.run(uuidv4(), _HOU_LEAGUE_ID, _tid, _p.id, _p.name, _tier2, _od2, _dec2, _p.world_ranking || 200);
        }
      })();

      console.log(`[golf-db] Houston Open field rebuilt: ${_officialField.length} players assigned to tiers`);
    }
  }
} catch (e) { console.error('[golf-db] Auto-assign tier players error:', e.message); }

// ── Auto-balance Houston Open league tiers (one-time fix) ─────────────────────
// If T1 has ≤ 3 players the tier distribution is skewed (odds-range based, not
// even). Rebalance: sort all pool_tier_players by odds_decimal ASC, divide
// into 6 equal buckets, update tier_number + pool_tiers JSON config.
try {
  const _BAL_LEAGUE_ID = 'ff568722-fbe9-4695-86a8-a31287c22841';
  const _balLeague = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(_BAL_LEAGUE_ID);
  if (_balLeague && _balLeague.pool_tournament_id) {
    const _t1count = db.prepare(
      'SELECT COUNT(*) as c FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? AND tier_number = 1'
    ).get(_BAL_LEAGUE_ID, _balLeague.pool_tournament_id).c;

    if (_t1count <= 3) {
      console.log('[golf-db] Houston Open tiers skewed — auto-balancing...');
      const _allPlayers = db.prepare(
        'SELECT * FROM pool_tier_players WHERE league_id = ? AND tournament_id = ? ORDER BY COALESCE(odds_decimal, 999) ASC'
      ).all(_BAL_LEAGUE_ID, _balLeague.pool_tournament_id);

      let _balTiersConfig = [];
      try { _balTiersConfig = JSON.parse(_balLeague.pool_tiers || '[]'); } catch (_e) {}
      const _tierCount = _balTiersConfig.length || 6;
      const _total = _allPlayers.length;
      const _baseSize = Math.floor(_total / _tierCount);
      const _rem = _total % _tierCount;

      const _newTiers = [];
      let _off = 0;
      for (let i = 0; i < _tierCount; i++) {
        const _size = _baseSize + (i < _rem ? 1 : 0);
        const _group = _allPlayers.slice(_off, _off + _size);
        _off += _size;
        const _oldT = _balTiersConfig.find(t => t.tier === i + 1) || {};
        _newTiers.push({
          tier:          i + 1,
          odds_min:      _group[0]?.odds_display || '',
          odds_max:      i < _tierCount - 1 ? (_group[_group.length - 1]?.odds_display || '') : '',
          picks:         _oldT.picks || 1,
          approxPlayers: _group.length,
          players:       _group,
        });
      }

      const _updTP = db.prepare(
        'UPDATE pool_tier_players SET tier_number = ? WHERE league_id = ? AND tournament_id = ? AND player_id = ?'
      );
      db.transaction(() => {
        for (const _nt of _newTiers) {
          for (const _p of _nt.players) {
            _updTP.run(_nt.tier, _BAL_LEAGUE_ID, _balLeague.pool_tournament_id, _p.player_id);
          }
        }
      })();

      const _newConfig = _newTiers.map(({ tier, odds_min, odds_max, picks, approxPlayers }) =>
        ({ tier, odds_min, odds_max, picks, approxPlayers }));
      db.prepare('UPDATE golf_leagues SET pool_tiers = ? WHERE id = ?')
        .run(JSON.stringify(_newConfig), _BAL_LEAGUE_ID);

      console.log(`[golf-db] Houston Open tiers balanced: ${_tierCount} tiers × ~${_baseSize} players each`);
    }
  }
} catch (e) { console.log('[golf-db] startup task skipped:', e.message); }

// ── Houston Open: 4-tier restructure with explicit player assignments ─────────
// T1 Elite (8)      picks=1  — Scheffler through Burns
// T2 Contenders (14) picks=2 — Lowry through Min Woo Lee
// T3 Longshots (18)  picks=2 — Clark through Dan Brown
// T4 The Field (93)  picks=2 — everyone else
// picks_per_team=7, pool_drop_count=2
// Guard: re-runs whenever sum(tier picks) ≠ 7
try {
  const _HOU4_ID = 'ff568722-fbe9-4695-86a8-a31287c22841';
  const _hou4L   = db.prepare('SELECT * FROM golf_leagues WHERE id = ?').get(_HOU4_ID);
  if (_hou4L && _hou4L.pool_tournament_id) {
    let _hou4Cfg = [];
    try { _hou4Cfg = JSON.parse(_hou4L.pool_tiers || '[]'); } catch (_) {}
    const _hou4Picks = _hou4Cfg.reduce((s, t) => s + (t.picks || 0), 0);

    if (_hou4Picks !== 7 || _hou4L.pool_drop_count !== 2) {
      console.log('[golf-db] Houston Open: applying 4-tier structure (T1×1 T2×2 T3×2 T4×2)...');
      const _tid = _hou4L.pool_tournament_id;

      const _T1 = new Set(['Scottie Scheffler','Chris Gotterup','Ben Griffin','Harris English',
        'Ryan Gerard','Si Woo Kim','Aaron Rai','Sam Burns']);
      const _T2 = new Set(['Shane Lowry','Marco Penge','Jason Day','Michael Brennan',
        'Kristoffer Reitan','Sam Stevens','Rasmus Hojgaard','Kurt Kitayama',
        'Michael Thorbjornsen','Pierceson Coody','Max Greyserman','Ryan Fox',
        'Nicolai Hojgaard','Min Woo Lee']);
      const _T3 = new Set(['Wyndham Clark','Rasmus Neergaard-Petersen','Johnny Keefer',
        'Harry Hall','Taylor Pendrith','J.T. Poston','Jake Knapp','Sungjae Im',
        'Nico Echavarria','Max McGreevy','Haotong Li','Garrick Higgo','Adam Scott',
        'Billy Horschel','Lucas Glover','Rico Hoey','Rickie Fowler','Dan Brown']);

      function _htier(name) {
        if (_T1.has(name)) return 1;
        if (_T2.has(name)) return 2;
        if (_T3.has(name)) return 3;
        return 4;
      }

      const _hPlayers = db.prepare(
        'SELECT * FROM pool_tier_players WHERE league_id = ? AND tournament_id = ?'
      ).all(_HOU4_ID, _tid);

      let _hc = [0, 0, 0, 0];
      const _hUpd = db.prepare(
        'UPDATE pool_tier_players SET tier_number = ? WHERE league_id = ? AND tournament_id = ? AND player_id = ?'
      );
      db.transaction(() => {
        for (const _p of _hPlayers) {
          const _t = _htier(_p.player_name);
          _hUpd.run(_t, _HOU4_ID, _tid, _p.player_id);
          _hc[_t - 1]++;
        }
      })();

      // Rebuild pool_tiers table rows
      db.prepare('DELETE FROM pool_tiers WHERE league_id = ?').run(_HOU4_ID);
      const _insPT = db.prepare(`INSERT INTO pool_tiers (id, league_id, tier_number, odds_min, odds_max, picks_allowed) VALUES (?, ?, ?, ?, ?, ?)`);
      db.transaction(() => {
        _insPT.run(uuidv4(), _HOU4_ID, 1, '8:1',   '75:1',  1);
        _insPT.run(uuidv4(), _HOU4_ID, 2, '75:1',  '125:1', 2);
        _insPT.run(uuidv4(), _HOU4_ID, 3, '150:1', '250:1', 2);
        _insPT.run(uuidv4(), _HOU4_ID, 4, '275:1', '',      2);
      })();

      const _hCfg = [
        { tier: 1, odds_min: '8:1',   odds_max: '75:1',  picks: 1, approxPlayers: _hc[0] },
        { tier: 2, odds_min: '75:1',  odds_max: '125:1', picks: 2, approxPlayers: _hc[1] },
        { tier: 3, odds_min: '150:1', odds_max: '250:1', picks: 2, approxPlayers: _hc[2] },
        { tier: 4, odds_min: '275:1', odds_max: '',       picks: 2, approxPlayers: _hc[3] },
      ];
      db.prepare('UPDATE golf_leagues SET pool_tiers = ?, picks_per_team = 7, pool_drop_count = 2 WHERE id = ?')
        .run(JSON.stringify(_hCfg), _HOU4_ID);

      console.log(`[golf-db] Houston Open tiers set: T1=${_hc[0]} T2=${_hc[1]} T3=${_hc[2]} T4=${_hc[3]}, picks=1/2/2/2`);
    }
  }
} catch (e) { console.log('[golf-db] startup task skipped:', e.message); }

// ── Populate 2-letter ISO country codes for golf players ──────────────────────
// Sets country on golf_players every boot (idempotent) so reseed can't wipe it.
try {
  const COUNTRY_MAP = [
    ['US', ['Scottie Scheffler','Sam Burns','Ryan Gerard','Harris English','Michael Brennan','Pierceson Coody','Wyndham Clark','Cole Hammer','Nick Dunlap','Austin Eckroat','Tony Finau','Patrick Fishburn','Steven Fisk','David Ford','Rickie Fowler','Brice Garnett','Lucas Glover','Chris Gotterup','Max Greyserman','Ben Griffin','Harry Hall','Joe Highsmith','Lee Hodges','Charley Hoffman','Tom Hoge','Billy Horschel','Beau Hossler','Mason Howell','Mark Hubbard','Jeffrey Kang','Johnny Keefer','Michael Kim','Chris Kirk','Kurt Kitayama','Patton Kizzire','Jake Knapp','Brooks Koepka','Hank Lebioda','Peter Malnati','Denny McCarthy','Matt McCarty','Max McGreevy','Mac Meissner','Keith Mitchell','William Mouw','Trey Mullinax','Andrew Putnam','Chad Ramey','Davis Riley','Patrick Rodgers','Casey Russell','Isaiah Salinda','Gordon Sargent','Adam Schenk','Neal Shipley','Alex Smalley','Austin Smotherman','Sam Stevens','Sahith Theegala','Davis Thompson','Michael Thorbjornsen','John VanDerLaan','Vince Whaley','Aaron Wise','Gary Woodland','Dylan Wu','Zach Bauchou','Chandler Blanchet','Bronson Burgoon','Brian Campbell','Ricky Castillo','Bud Cauley','Davis Chatfield','Luke Clanton','Eric Cole','Kevin Roy','Danny Walker','Jimmy Stanger','Rico Hoey','Aaron Rai','Doug Ghim','J.J. Spaun','J.T. Poston','A.J. Ewart','David Lipsky']],
    ['ZA', ['Christiaan Bezuidenhout','Garrick Higgo','Christo Lamprecht','Aldrich Potgieter','Erik van Rooyen']],
    ['GB', ['Dan Brown','Marco Penge','Jordan Smith','Matt Wallace','Paul Waring','Danny Willett','John Parry','Harry Hall']],
    ['AU', ['Jason Day','Min Woo Lee','Adam Scott','Karl Vilips']],
    ['DK', ['Nicolai Hojgaard','Rasmus Hojgaard','Thorbjorn Olesen','Rasmus Neergaard-Petersen']],
    ['KR', ['Sungjae Im','S.H. Kim','Si Woo Kim','Tom Kim','K.H. Lee']],
    ['CA', ['Mackenzie Hughes','Taylor Pendrith','Adam Svensson','Sudarshan Yellamaraju','A.J. Ewart']],
    ['CO', ['Nico Echavarria','Marcelo Rozo','Rafael Campos']],
    ['IE', ['Shane Lowry']],
    ['NZ', ['Ryan Fox']],
    ['BE', ['Adrien Dumont de Chassart']],
    ['AR', ['Emiliano Grillo','Alejandro Tosti']],
    ['DE', ['Stephan Jaeger','Matti Schmid']],
    ['FR', ['Matthieu Pavon','Adrien Saddier']],
    ['SE', ['Pontus Nyholm','Jesper Svensson']],
    ['NO', ['Kristoffer Reitan','Kris Ventura']],
    ['CN', ['Zecheng Dou','Haotong Li']],
    ['JP', ['Kensei Hirata','Takumi Kanaya']],
    ['TW', ['Kevin Yu']],
    ['VE', ['Jhonattan Vegas']],
    ['PH', ['Rico Hoey']],
  ];

  const _updCountry = db.prepare('UPDATE golf_players SET country = ? WHERE name = ?');
  db.transaction(() => {
    for (const [code, names] of COUNTRY_MAP) {
      for (const name of names) _updCountry.run(code, name);
    }
  })();
  console.log('[golf-db] Country codes set on golf_players');

  // Diagnostic: verify the UPDATE actually matched rows
  const _chkScheff = db.prepare("SELECT name, country FROM golf_players WHERE name = 'Scottie Scheffler'").get();
  console.log('[golf-db] Scheffler country check:', _chkScheff);
  const _chkGotterup = db.prepare("SELECT name, country FROM golf_players WHERE name = 'Chris Gotterup'").get();
  console.log('[golf-db] Gotterup country check:', _chkGotterup);
  const _cntUs = db.prepare("SELECT COUNT(*) as n FROM golf_players WHERE country = 'US'").get();
  console.log('[golf-db] US players in golf_players:', _cntUs.n);
  const _anyGp = db.prepare("SELECT name, country FROM golf_players ORDER BY rowid DESC LIMIT 3").all();
  console.log('[golf-db] Last 3 golf_players rows:', JSON.stringify(_anyGp));
  // Populate player_master from COUNTRY_MAP so it persists across tournament resets
  try {
    const _pmUpsert = db.prepare(`
      INSERT INTO player_master (player_name, country, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(player_name) DO UPDATE SET country = excluded.country, updated_at = CURRENT_TIMESTAMP
    `);
    db.transaction(() => {
      for (const [code, names] of COUNTRY_MAP) {
        for (const name of names) _pmUpsert.run(name, code);
      }
    })();
    console.log('[golf-db] player_master populated from COUNTRY_MAP');
  } catch (_pmE) { console.log('[golf-db] player_master upsert skipped:', _pmE.message); }

  // Seed golf_espn_players from golf_players + COUNTRY_MAP (runs every boot, idempotent)
  try {
    const { normalizePlayerName: _normPN } = require('./utils/playerNameNorm');
    const _espnUpsert = db.prepare(`
      INSERT INTO golf_espn_players (espn_name, display_name, country_code, normalized_name, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(espn_name) DO UPDATE SET
        display_name    = excluded.display_name,
        country_code    = excluded.country_code,
        normalized_name = excluded.normalized_name,
        updated_at      = CURRENT_TIMESTAMP
    `);
    const _allGP = db.prepare('SELECT name, country FROM golf_players WHERE is_active = 1').all();
    db.transaction(() => {
      for (const p of _allGP) {
        _espnUpsert.run(p.name, p.name, p.country, _normPN(p.name));
      }
    })();
    console.log(`[golf-db] golf_espn_players seeded: ${_allGP.length} players`);
  } catch (_epE) { console.log('[golf-db] golf_espn_players seed skipped:', _epE.message); }

  // Global 3-letter → 2-letter ISO country code normalization.
  // Runs every boot — safe no-op if already correct.
  // Covers every 3-letter code in common use on PGA Tour rosters.
  const _ISO3TO2 = {
    USA: 'US', AUS: 'AU', ENG: 'GB', NIR: 'GB', SCO: 'GB', WAL: 'GB',
    RSA: 'ZA', CHN: 'CN', COL: 'CO', GER: 'DE', SWE: 'SE', NOR: 'NO',
    KOR: 'KR', JPN: 'JP', IRL: 'IE', NZL: 'NZ', ARG: 'AR', BEL: 'BE',
    FRA: 'FR', TWN: 'TW', VEN: 'VE', PHI: 'PH', FIN: 'FI', AUT: 'AT',
    CAN: 'CA', DEN: 'DK', ESP: 'ES', ITA: 'IT', POR: 'PT', THA: 'TH',
    ZIM: 'ZW', NAM: 'NA', PAR: 'PY', CHI: 'CL', MEX: 'MX',
  };
  const _normCountry = db.prepare('UPDATE golf_players SET country = ? WHERE country = ?');
  const _normCtryPtp = db.prepare('UPDATE pool_tier_players SET country = ? WHERE country = ?');
  const _normCtryPp  = db.prepare('UPDATE pool_picks SET country = ? WHERE country = ?');
  db.transaction(() => {
    for (const [old, neo] of Object.entries(_ISO3TO2)) {
      _normCountry.run(neo, old);
      _normCtryPtp.run(neo, old);
      _normCtryPp.run(neo, old);
    }
  })();
  console.log('[golf-db] 3-letter → 2-letter country normalization applied globally');
} catch (e) { console.log('[golf-db] country migration skipped:', e.message); }

// ── Manual odds / tier corrections (Houston Open) ─────────────────────────────
// ESPN odds weren't available at sync time — apply known betting lines manually.
// Guard: re-runs only if Scheffler still has wrong odds in pool_tier_players.
try {
  const _HOU_LEAGUE = 'ff568722-fbe9-4695-86a8-a31287c22841';
  const _scheff = db.prepare("SELECT odds_display FROM pool_tier_players WHERE player_name = 'Scottie Scheffler' AND league_id = ?").get(_HOU_LEAGUE);
  if (_scheff && _scheff.odds_display !== '8:1') {
    const MANUAL = [
      { name: 'Scottie Scheffler', tier: 1, odds_display: '8:1',  odds_decimal: 9,  world_ranking: 1  },
      { name: 'Sam Burns',         tier: 1, odds_display: '18:1', odds_decimal: 19, world_ranking: 19 },
      { name: 'Jake Knapp',        tier: 1, odds_display: '22:1', odds_decimal: 23, world_ranking: 37 },
      { name: 'Brooks Koepka',     tier: 2, odds_display: '28:1', odds_decimal: 29, world_ranking: 26 },
      { name: 'Rickie Fowler',     tier: 2, odds_display: '30:1', odds_decimal: 31, world_ranking: 50 },
      { name: 'Wyndham Clark',     tier: 3, odds_display: '35:1', odds_decimal: 36, world_ranking: 16 },
      { name: 'Tony Finau',        tier: 3, odds_display: '40:1', odds_decimal: 41, world_ranking: 55 },
      { name: 'Adam Scott',        tier: 3, odds_display: '40:1', odds_decimal: 41, world_ranking: 64 },
    ];
    const _updTP  = db.prepare('UPDATE pool_tier_players SET tier_number = ?, odds_display = ?, odds_decimal = ? WHERE player_name = ? AND league_id = ?');
    const _updGP  = db.prepare('UPDATE golf_players SET odds_display = ?, odds_decimal = ?, world_ranking = ? WHERE name = ?');
    db.transaction(() => {
      for (const m of MANUAL) {
        _updTP.run(m.tier, m.odds_display, m.odds_decimal, m.name, _HOU_LEAGUE);
        _updGP.run(m.odds_display, m.odds_decimal, m.world_ranking, m.name);
      }
    })();
    console.log('[golf-db] Houston Open manual odds applied for', MANUAL.length, 'players');
  }
} catch (e) { console.log('[golf-db] manual odds migration skipped:', e.message); }

// ── Houston Open additional DraftKings odds corrections ───────────────────────
try {
  const _HOU_LEAGUE = 'ff568722-fbe9-4695-86a8-a31287c22841';
  const _mwl = db.prepare("SELECT odds_display FROM pool_tier_players WHERE player_name = 'Min Woo Lee' AND league_id = ?").get(_HOU_LEAGUE);
  if (_mwl && _mwl.odds_display !== '15:1') {
    const MANUAL2 = [
      { name: 'Min Woo Lee',      tier: 1, odds_display: '15:1',  odds_decimal: 16  },
      { name: 'Chris Gotterup',   tier: 1, odds_display: '20:1',  odds_decimal: 21  },
      { name: 'Nicolai Hojgaard', tier: 2, odds_display: '33:1',  odds_decimal: 34  },
      { name: 'Harry Hall',       tier: 2, odds_display: '35:1',  odds_decimal: 36  },
      { name: 'Sungjae Im',       tier: 3, odds_display: '57:1',  odds_decimal: 58  },
      { name: 'Ryan Fox',         tier: 3, odds_display: '72:1',  odds_decimal: 73  },
      { name: 'J.T. Poston',      tier: 3, odds_display: '88:1',  odds_decimal: 89  },
      { name: 'Gary Woodland',    tier: 4, odds_display: '115:1', odds_decimal: 116 },
      { name: 'S.H. Kim',         tier: 4, odds_display: '135:1', odds_decimal: 136 },
    ];
    const _updTP = db.prepare('UPDATE pool_tier_players SET tier_number = ?, odds_display = ?, odds_decimal = ? WHERE player_name = ? AND league_id = ?');
    const _updGP = db.prepare('UPDATE golf_players SET odds_display = ?, odds_decimal = ? WHERE name = ?');
    db.transaction(() => {
      for (const m of MANUAL2) {
        _updTP.run(m.tier, m.odds_display, m.odds_decimal, m.name, _HOU_LEAGUE);
        _updGP.run(m.odds_display, m.odds_decimal, m.name);
      }
    })();
    console.log('[golf-db] Houston Open DK odds batch 2 applied for', MANUAL2.length, 'players');
  }
} catch (e) { console.log('[golf-db] DK odds batch 2 skipped:', e.message); }

// NOTE: bot user cleanup migration was here and was REMOVED.
// It ran on every boot and accidentally deleted real user accounts (Max, Drew, Jon)
// whose picks could not be recovered. Any future test-data cleanup must be a
// one-time manual SQL script — never an automated boot migration.

// ── Houston Open odds fixups — run every boot (unguarded/idempotent) ─────────────
// Previous guarded blocks only ran once; this ensures corrections survive Odds API overwrites.
try {
  const _HOU_LEAGUE = 'ff568722-fbe9-4695-86a8-a31287c22841';
  const oddsFixups = [
    { name: 'Brooks Koepka',  odds: '27:1',  decimal: 28, tier: 2 },
    { name: 'Jake Knapp',     odds: '22:1',  decimal: 23, tier: 2 },
    { name: 'Sam Burns',      odds: '27:1',  decimal: 28, tier: 1 },
    { name: 'Min Woo Lee',    odds: '15:1',  decimal: 16, tier: 1 },
    { name: 'Chris Gotterup', odds: '20:1',  decimal: 21, tier: 1 },
    { name: 'Gary Woodland',  odds: '115:1', decimal: 116, tier: 2 },
    { name: 'Sungjae Im',     odds: '57:1',  decimal: 58,  tier: 2 },
    { name: 'Ryan Fox',       odds: '72:1',  decimal: 73,  tier: 2 },
  ];
  const _fixTP = db.prepare('UPDATE pool_tier_players SET odds_display = ?, odds_decimal = ?, tier_number = ? WHERE player_name = ? AND league_id = ?');
  const _fixGP = db.prepare('UPDATE golf_players SET odds_display = ?, odds_decimal = ? WHERE name = ?');
  db.transaction(() => {
    for (const f of oddsFixups) {
      _fixTP.run(f.odds, f.decimal, f.tier, f.name, _HOU_LEAGUE);
      _fixGP.run(f.odds, f.decimal, f.name);
    }
  })();
  console.log('[golf-db] Houston Open odds fixups applied for', oddsFixups.length, 'players');
} catch (e) { console.log('[golf-db] odds fixups skipped:', e.message); }

// ── is_withdrawn column (WD support) ─────────────────────────────────────────
try { db.exec('ALTER TABLE pool_tier_players ADD COLUMN is_withdrawn INTEGER DEFAULT 0'); } catch (e) {}
try { db.exec('ALTER TABLE pool_picks ADD COLUMN is_withdrawn INTEGER DEFAULT 0'); } catch (e) {}

// ── Fix: reset spurious WDs caused by field-sync running before ESPN had data ─
// Resets all is_withdrawn=1 for HOU league EXCEPT the two real WDs
try {
  const _HOU_RESET = 'ff568722-fbe9-4695-86a8-a31287c22841';
  db.prepare(
    "UPDATE pool_tier_players SET is_withdrawn=0 WHERE league_id=? AND player_name NOT IN ('Scottie Scheffler','Bud Cauley','Si Woo Kim')"
  ).run(_HOU_RESET);
  db.prepare(
    "UPDATE pool_picks SET is_withdrawn=0 WHERE league_id=? AND player_name NOT IN ('Scottie Scheffler','Bud Cauley','Si Woo Kim')"
  ).run(_HOU_RESET);
  console.log('[golf-db] HOU WD reset: cleared spurious is_withdrawn flags (kept Scheffler + Cauley)');
} catch (e) { console.log('[golf-db] HOU WD reset skipped:', e.message); }

// ── Houston Open WD field update (Scheffler, Cauley → Power, Kuchar) ──────────
try {
  const _HOU = 'ff568722-fbe9-4695-86a8-a31287c22841';
  const _WDTID = db.prepare("SELECT pool_tournament_id FROM golf_leagues WHERE id = ?").get(_HOU)?.pool_tournament_id;

  // Flag withdrawn players in pool_tier_players and pool_picks
  if (_WDTID) {
    db.prepare("UPDATE pool_tier_players SET is_withdrawn=1 WHERE player_name IN ('Scottie Scheffler','Bud Cauley','Si Woo Kim') AND league_id=? AND tournament_id=?").run(_HOU, _WDTID);
    db.prepare("UPDATE pool_picks SET is_withdrawn=1 WHERE player_name IN ('Scottie Scheffler','Bud Cauley','Si Woo Kim') AND league_id=? AND tournament_id=?").run(_HOU, _WDTID);

    // Add replacement players to golf_players if not present
    const _gpInsert = db.prepare('INSERT OR IGNORE INTO golf_players (id, name, country, world_ranking) VALUES (?, ?, ?, ?)');
    _gpInsert.run(uuidv4(), 'Seamus Power', 'IE', 120);
    _gpInsert.run(uuidv4(), 'Matt Kuchar',  'US', 200);

    // Add to pool_tier_players
    const _ptpInsert = db.prepare(
      'INSERT OR IGNORE INTO pool_tier_players (id, league_id, tournament_id, player_id, player_name, tier_number, odds_display, odds_decimal, country, is_withdrawn) ' +
      "SELECT ?, ?, ?, gp.id, gp.name, 4, '500:1', 501, gp.country, 0 FROM golf_players gp WHERE gp.name = ?"
    );
    _ptpInsert.run(uuidv4(), _HOU, _WDTID, uuidv4(), 'Seamus Power');
    _ptpInsert.run(uuidv4(), _HOU, _WDTID, uuidv4(), 'Matt Kuchar');

    // Verify duplicates don't exist (use player_name as uniqueness check)
    const _dupeCheck = db.prepare(
      "SELECT COUNT(*) as n FROM pool_tier_players WHERE league_id=? AND tournament_id=? AND player_name=? AND is_withdrawn=0"
    );
    ['Seamus Power','Matt Kuchar'].forEach(name => {
      const cnt = _dupeCheck.get(_HOU, _WDTID, name)?.n || 0;
      if (cnt > 1) {
        // Keep only the most recently inserted one
        db.prepare(
          "DELETE FROM pool_tier_players WHERE league_id=? AND tournament_id=? AND player_name=? AND id NOT IN (SELECT id FROM pool_tier_players WHERE league_id=? AND tournament_id=? AND player_name=? ORDER BY created_at DESC LIMIT 1)"
        ).run(_HOU, _WDTID, name, _HOU, _WDTID, name);
      }
    });

    console.log('[golf-db] HOU WD update: Scheffler/Cauley flagged WD, Power/Kuchar added T4');
  }
} catch (e) { console.log('[golf-db] HOU WD update skipped:', e.message); }

// Always propagate country from golf_players → pool tables on every boot
// Joins on player_name (not id) since pool tables store names, not golf_players.id refs
try { db.exec('ALTER TABLE pool_tier_players ADD COLUMN country TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE pool_picks ADD COLUMN country TEXT'); } catch (e) {}
try {
  const _HOU_LEAGUE = 'ff568722-fbe9-4695-86a8-a31287c22841';

  // Diagnostic: verify the join works before propagation
  const _ptpSample = db.prepare('SELECT player_id, player_name FROM pool_tier_players WHERE league_id = ? LIMIT 3').all(_HOU_LEAGUE);
  console.log('[golf-db] ptp sample:', JSON.stringify(_ptpSample));
  const _gpScheff = db.prepare("SELECT id, name FROM golf_players WHERE name = 'Scottie Scheffler'").get();
  console.log('[golf-db] golf_players Scheffler:', JSON.stringify(_gpScheff));

  // Step 1: propagate from golf_players → pool_tier_players (by name, period-insensitive for initials like J.T., J.J.)
  const r1 = db.prepare(`
    UPDATE pool_tier_players SET country = (
      SELECT country FROM golf_players
        WHERE REPLACE(golf_players.name, '.', '') = REPLACE(pool_tier_players.player_name, '.', '')
        AND golf_players.country IS NOT NULL
    ) WHERE country IS NULL AND league_id = ?
  `).run(_HOU_LEAGUE);

  // Step 2: propagate from pool_tier_players → pool_picks (by player_name within same league)
  // More reliable than golf_players join since ptp.country is already populated via fixups
  const r2 = db.prepare(`
    UPDATE pool_picks SET country = (
      SELECT ptp.country FROM pool_tier_players ptp
      WHERE ptp.player_name = pool_picks.player_name
        AND ptp.league_id = pool_picks.league_id
        AND ptp.country IS NOT NULL
      LIMIT 1
    ) WHERE country IS NULL AND league_id = ?
  `).run(_HOU_LEAGUE);

  // Step 3: fallback — propagate from golf_players → pool_picks for any still-null rows (period-insensitive)
  const r3 = db.prepare(`
    UPDATE pool_picks SET country = (
      SELECT country FROM golf_players
        WHERE REPLACE(golf_players.name, '.', '') = REPLACE(pool_picks.player_name, '.', '')
        AND golf_players.country IS NOT NULL
    ) WHERE country IS NULL AND league_id = ?
  `).run(_HOU_LEAGUE);

  console.log(`[golf-db] Country propagated — ptp: ${r1.changes}, picks-via-ptp: ${r2.changes}, picks-via-gp: ${r3.changes}`);
} catch (e) { console.log('[golf-db] country propagation skipped:', e.message); }

// ── Direct country fallback for players that don't match via golf_players.name ──
// Runs every boot; safe no-op for players already populated.
try {
  const _HOU_LEAGUE = 'ff568722-fbe9-4695-86a8-a31287c22841';
  const COUNTRY_FIXUPS = [
    // Players whose country isn't propagating via golf_players name join,
    // or were stored with wrong/3-letter codes. Applied unconditionally.
    { name: 'Brooks Koepka',              country: 'US' },
    { name: 'Chris Gotterup',             country: 'US' },
    { name: 'Jake Knapp',                 country: 'US' },
    { name: 'Rickie Fowler',              country: 'US' },
    { name: 'Wyndham Clark',              country: 'US' },
    { name: 'Sahith Theegala',            country: 'US' },
    { name: 'Mackenzie Hughes',           country: 'CA' },
    { name: 'Seamus Power',               country: 'IE' },
    { name: 'Matt Kuchar',                country: 'US' },
    { name: 'J.T. Poston',                country: 'US' },
    { name: 'David Lipsky',               country: 'US' },
    { name: 'Andrew Putnam',              country: 'US' },
    { name: 'Gary Woodland',              country: 'US' },
    { name: 'Sudarshan Yellamaraju',      country: 'CA' },
    { name: 'Karl Vilips',                country: 'AU' },
    { name: 'Aldrich Potgieter',          country: 'ZA' },
    { name: 'Christiaan Bezuidenhout',    country: 'ZA' },
    { name: 'Marco Penge',                country: 'GB' },
    { name: 'Haotong Li',                 country: 'CN' },
    { name: 'Nico Echavarria',            country: 'CO' },
  ];
  // Unconditional UPDATE — fixes wrong values (USA, ENG, RSA, etc.), not just NULLs.
  const _fixCtryTP = db.prepare('UPDATE pool_tier_players SET country = ? WHERE player_name = ? AND league_id = ?');
  const _fixCtryPP = db.prepare('UPDATE pool_picks SET country = ? WHERE player_name = ? AND league_id = ?');
  db.transaction(() => {
    for (const f of COUNTRY_FIXUPS) {
      _fixCtryTP.run(f.country, f.name, _HOU_LEAGUE);
      _fixCtryPP.run(f.country, f.name, _HOU_LEAGUE);
    }
  })();

  // Normalise any remaining 3-letter "USA" codes → "US" in both tables globally
  db.prepare("UPDATE golf_players SET country = 'US' WHERE country = 'USA'").run();
  db.prepare("UPDATE pool_tier_players SET country = 'US' WHERE country = 'USA'").run();
  db.prepare("UPDATE pool_picks SET country = 'US' WHERE country = 'USA'").run();
  console.log('[golf-db] Country fixups applied (incl. USA→US normalization)');
} catch (e) { console.log('[golf-db] country fallback fixups skipped:', e.message); }

// ── One-time: restore Jon Wohlfert to Houston Open pool league ────────────────
const { runOnce } = require('./db');
runOnce('restore-jon-wohlfert-houston-open-2026', () => {
  const HOU_LEAGUE = 'ff568722-fbe9-4695-86a8-a31287c22841';

  // Find Jon's account by username or email
  const jon = db.prepare(`
    SELECT id, username, email, role
    FROM users
    WHERE lower(username) LIKE '%jon%'
       OR lower(username) LIKE '%wohlfert%'
       OR lower(email)    LIKE '%wohlfert%'
    LIMIT 1
  `).get();

  if (!jon) {
    console.log('[migration] restore-jon-wohlfert: no matching user found — skipping');
    return;
  }

  if (jon.role === 'banned') {
    db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(jon.id);
  }
  const alreadyMember = db.prepare(
    'SELECT id FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?'
  ).get(HOU_LEAGUE, jon.id);
  if (!alreadyMember) {
    db.prepare(`
      INSERT INTO golf_league_members (id, golf_league_id, user_id, team_name, joined_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, datetime('now'))
    `).run(HOU_LEAGUE, jon.id, jon.username);
    console.log(`[migration] restore-jon-wohlfert: added ${jon.username}`);
  }
});

// username confirmed as 'thefounder' — previous migration matched nothing
runOnce('restore-thefounder-houston-open-2026', () => {
  const HOU_LEAGUE = 'ff568722-fbe9-4695-86a8-a31287c22841';

  const jon = db.prepare(`
    SELECT id, username, email, role FROM users WHERE username = 'thefounder'
  `).get();

  if (!jon) {
    console.log('[migration] restore-jon-wohlfert: no matching user found — skipping');
    // Don't throw — let runOnce record it as done so it doesn't retry forever
    return;
  }

  // Unban if banned
  if (jon.role === 'banned') {
    db.prepare("UPDATE users SET role = 'user' WHERE id = ?").run(jon.id);
    console.log(`[migration] restore-jon-wohlfert: unbanned ${jon.username}`);
  }

  // Add to league (no-op if already a member)
  const alreadyMember = db.prepare(
    'SELECT id FROM golf_league_members WHERE golf_league_id = ? AND user_id = ?'
  ).get(HOU_LEAGUE, jon.id);

  if (!alreadyMember) {
    db.prepare(`
      INSERT INTO golf_league_members (id, golf_league_id, user_id, team_name, joined_at)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, datetime('now'))
    `).run(HOU_LEAGUE, jon.id, jon.username);
    console.log(`[migration] restore-jon-wohlfert: added ${jon.username} (${jon.email}) to league ${HOU_LEAGUE}`);
  } else {
    console.log(`[migration] restore-jon-wohlfert: ${jon.username} already a member`);
  }
});

// One-shot: reset Houston Open R2 drops so commissioner can re-apply
// after the computeDropIds null-round bug fix.
const HOU_POOL_LEAGUE = 'ff568722-fbe9-4695-86a8-a31287c22841';
runOnce('reset-houston-open-r2-drops-null-fix', () => {
  try {
    const r = db.prepare(
      "UPDATE pool_picks SET is_dropped=0, dropped_at=NULL WHERE league_id=?"
    ).run(HOU_POOL_LEAGUE);
    const l = db.prepare(
      "UPDATE golf_leagues SET pool_drops_applied=0 WHERE id=?"
    ).run(HOU_POOL_LEAGUE);
    console.log(`[migration] reset-houston-open-r2-drops: picks=${r.changes} league=${l.changes}`);
  } catch (e) {
    console.error('[migration] reset-houston-open-r2-drops error:', e.message);
  }
});

// ── One-time: set Valero Texas Open ESPN event ID + activate ──────────────────
runOnce('set-valero-espn-event-id-2026', () => {
  try {
    const r = db.prepare(
      "UPDATE golf_tournaments SET espn_event_id = '401811940', status = 'active' WHERE name = 'Valero Texas Open' AND season_year = 2026"
    ).run();
    console.log(`[migration] set-valero-espn-event-id: ${r.changes} row(s) updated`);
  } catch (e) {
    console.error('[migration] set-valero-espn-event-id error:', e.message);
  }
});

// ── One-time: add Valero Texas Open 2026 ──────────────────────────────────────
runOnce('add-valero-texas-open-2026', () => {
  try {
    const exists = db.prepare("SELECT COUNT(*) as c FROM golf_tournaments WHERE name = 'Valero Texas Open'").get().c;
    if (exists > 0) { console.log('[migration] add-valero-texas-open: already exists'); return; }
    db.prepare(`
      INSERT INTO golf_tournaments (id, name, course, start_date, end_date, season_year, is_major, is_signature, status, purse, prize_money)
      VALUES (?, ?, ?, ?, ?, 2026, 0, 0, 'scheduled', ?, ?)
    `).run(uuidv4(), 'Valero Texas Open', 'TPC San Antonio (Oaks Course), TX', '2026-04-02', '2026-04-05', 8700000, 8700000);
    console.log('[migration] add-valero-texas-open: inserted');
  } catch (e) {
    console.error('[migration] add-valero-texas-open error:', e.message);
  }
});

// ── One-time: fix Valero Texas Open dates (Thu Apr 2 – Sun Apr 5) ─────────────
runOnce('fix-valero-texas-open-dates-2026', () => {
  try {
    const r = db.prepare(
      "UPDATE golf_tournaments SET start_date='2026-04-02', end_date='2026-04-05' WHERE name='Valero Texas Open' AND season_year=2026"
    ).run();
    console.log(`[migration] fix-valero-dates: ${r.changes} row(s) updated`);
  } catch (e) {
    console.error('[migration] fix-valero-dates error:', e.message);
  }
});

module.exports = db;
