const db = require('./db');
const { v4: uuidv4 } = require('uuid');

// ── Golf Tables ────────────────────────────────────────────────────────────────
db.exec(`
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
`);

// ── Auction tables ─────────────────────────────────────────────────────────────
db.exec(`
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
`);

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
  `ALTER TABLE golf_leagues ADD COLUMN payout_pool_override REAL`,
  `ALTER TABLE golf_leagues ADD COLUMN pool_drop_count INTEGER DEFAULT 2`,
];
for (const sql of _golfColMigrations) { try { db.exec(sql); } catch (_) {} }

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

// ── Delete Valspar test league (pending_payment, never used) ─────────────────
try {
  db.prepare("DELETE FROM golf_leagues WHERE id LIKE 'c209f6ee%' AND status = 'pending_payment'").run();
} catch (e) { console.error('[golf-db] Valspar test league cleanup error:', e.message); }

// ── Houston Open 2026 — seed tournament row if not present ────────────────────
try {
  const _houston = db.prepare("SELECT id FROM golf_tournaments WHERE name LIKE '%Houston Open%'").get();
  if (!_houston) {
    db.prepare(`
      INSERT INTO golf_tournaments (id, name, course, start_date, end_date, season_year, is_major, status, espn_event_id)
      VALUES (?, 'Texas Children''s Houston Open', 'Memorial Park Golf Course, Houston, TX',
              '2026-03-27', '2026-03-30', 2026, 0, 'scheduled', '401811939')
    `).run(uuidv4());
  } else {
    // Ensure espn_event_id is set even if row already existed
    db.prepare("UPDATE golf_tournaments SET espn_event_id = '401811939' WHERE name LIKE '%Houston Open%' AND (espn_event_id IS NULL OR espn_event_id = '')").run();
  }
} catch (e) { console.error('[golf-db] Houston Open seed error:', e.message); }

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
];

// Force-replace players whenever the list changes (check count + sentinel player)
const existingCount = db.prepare('SELECT COUNT(*) as c FROM golf_players').get().c;
const hasGotterup = db.prepare("SELECT COUNT(*) as c FROM golf_players WHERE name = 'Chris Gotterup'").get().c;
if (existingCount !== GOLF_PLAYERS.length || hasGotterup === 0) {
  db.transaction(() => {
    // Remove roster/lineup/draft/core refs before dropping players
    db.prepare('DELETE FROM golf_weekly_lineups').run();
    db.prepare('DELETE FROM golf_rosters').run();
    db.prepare('DELETE FROM golf_draft_picks').run();
    db.prepare('DELETE FROM golf_core_players').run();
    db.prepare('DELETE FROM golf_auction_bids').run();
    db.prepare('DELETE FROM golf_faab_bids').run();
    db.prepare('DELETE FROM golf_players').run();
    const ins = db.prepare(`INSERT INTO golf_players (id, name, country, world_ranking, owgr_points, salary, is_active) VALUES (?, ?, ?, ?, 0, ?, 1)`);
    for (const p of GOLF_PLAYERS) ins.run(uuidv4(), p.name, p.country, p.world_ranking, p.salary);
  })();
  console.log('[golf-db] Reseeded', GOLF_PLAYERS.length, 'golf players (5-tier system)');
}

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

module.exports = db;
