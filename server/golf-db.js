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
    season_year INTEGER DEFAULT 2025,
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
    season_year INTEGER DEFAULT 2025,
    is_major INTEGER DEFAULT 0,
    status TEXT DEFAULT 'scheduled',
    purse INTEGER DEFAULT 0,
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
`);

// ── Seed golf_players ──────────────────────────────────────────────────────────
const GOLF_PLAYERS = [
  // Tier 1 ($800): World ranking 1-10
  { name: 'Scottie Scheffler',   country: 'USA', world_ranking: 1,  owgr_points: 1250.0, salary: 800 },
  { name: 'Rory McIlroy',        country: 'NIR', world_ranking: 2,  owgr_points: 890.0,  salary: 800 },
  { name: 'Xander Schauffele',   country: 'USA', world_ranking: 3,  owgr_points: 750.0,  salary: 800 },
  { name: 'Jon Rahm',            country: 'ESP', world_ranking: 4,  owgr_points: 680.0,  salary: 800 },
  { name: 'Viktor Hovland',      country: 'NOR', world_ranking: 5,  owgr_points: 620.0,  salary: 800 },
  { name: 'Patrick Cantlay',     country: 'USA', world_ranking: 6,  owgr_points: 580.0,  salary: 800 },
  { name: 'Collin Morikawa',     country: 'USA', world_ranking: 7,  owgr_points: 540.0,  salary: 800 },
  { name: 'Wyndham Clark',       country: 'USA', world_ranking: 8,  owgr_points: 500.0,  salary: 800 },
  { name: 'Brian Harman',        country: 'USA', world_ranking: 9,  owgr_points: 470.0,  salary: 800 },
  { name: 'Max Homa',            country: 'USA', world_ranking: 10, owgr_points: 440.0,  salary: 800 },
  // Tier 2 ($600): World ranking 11-25
  { name: 'Tony Finau',          country: 'USA', world_ranking: 11, owgr_points: 420.0,  salary: 600 },
  { name: 'Russell Henley',      country: 'USA', world_ranking: 12, owgr_points: 400.0,  salary: 600 },
  { name: 'Keegan Bradley',      country: 'USA', world_ranking: 13, owgr_points: 380.0,  salary: 600 },
  { name: 'Shane Lowry',         country: 'IRL', world_ranking: 14, owgr_points: 360.0,  salary: 600 },
  { name: 'Justin Thomas',       country: 'USA', world_ranking: 15, owgr_points: 340.0,  salary: 600 },
  { name: 'Jordan Spieth',       country: 'USA', world_ranking: 16, owgr_points: 320.0,  salary: 600 },
  { name: 'Hideki Matsuyama',    country: 'JPN', world_ranking: 17, owgr_points: 300.0,  salary: 600 },
  { name: 'Tommy Fleetwood',     country: 'ENG', world_ranking: 18, owgr_points: 285.0,  salary: 600 },
  { name: 'Tyrrell Hatton',      country: 'ENG', world_ranking: 19, owgr_points: 270.0,  salary: 600 },
  { name: 'Sepp Straka',         country: 'AUT', world_ranking: 20, owgr_points: 255.0,  salary: 600 },
  { name: 'Akshay Bhatia',       country: 'USA', world_ranking: 21, owgr_points: 240.0,  salary: 600 },
  { name: 'Sahith Theegala',     country: 'USA', world_ranking: 22, owgr_points: 228.0,  salary: 600 },
  { name: 'Sam Burns',           country: 'USA', world_ranking: 23, owgr_points: 216.0,  salary: 600 },
  { name: 'Nick Taylor',         country: 'CAN', world_ranking: 24, owgr_points: 205.0,  salary: 600 },
  { name: 'Tom Kim',             country: 'KOR', world_ranking: 25, owgr_points: 195.0,  salary: 600 },
  // Tier 3 ($400): World ranking 26-50
  { name: 'Corey Conners',       country: 'CAN', world_ranking: 26, owgr_points: 185.0,  salary: 400 },
  { name: 'Adam Scott',          country: 'AUS', world_ranking: 27, owgr_points: 175.0,  salary: 400 },
  { name: 'Billy Horschel',      country: 'USA', world_ranking: 28, owgr_points: 165.0,  salary: 400 },
  { name: 'Dustin Johnson',      country: 'USA', world_ranking: 29, owgr_points: 158.0,  salary: 400 },
  { name: 'Brooks Koepka',       country: 'USA', world_ranking: 30, owgr_points: 152.0,  salary: 400 },
  { name: 'Sungjae Im',          country: 'KOR', world_ranking: 31, owgr_points: 146.0,  salary: 400 },
  { name: 'Chris Kirk',          country: 'USA', world_ranking: 32, owgr_points: 140.0,  salary: 400 },
  { name: 'Jason Day',           country: 'AUS', world_ranking: 33, owgr_points: 135.0,  salary: 400 },
  { name: 'Harris English',      country: 'USA', world_ranking: 34, owgr_points: 130.0,  salary: 400 },
  { name: 'Rickie Fowler',       country: 'USA', world_ranking: 35, owgr_points: 125.0,  salary: 400 },
  { name: 'Cameron Young',       country: 'USA', world_ranking: 36, owgr_points: 120.0,  salary: 400 },
  { name: 'Denny McCarthy',      country: 'USA', world_ranking: 37, owgr_points: 115.0,  salary: 400 },
  { name: 'Davis Thompson',      country: 'USA', world_ranking: 38, owgr_points: 110.0,  salary: 400 },
  { name: 'Kurt Kitayama',       country: 'USA', world_ranking: 39, owgr_points: 106.0,  salary: 400 },
  { name: 'Taylor Pendrith',     country: 'CAN', world_ranking: 40, owgr_points: 102.0,  salary: 400 },
  { name: 'Thomas Detry',        country: 'BEL', world_ranking: 41, owgr_points: 98.0,   salary: 400 },
  { name: 'Si Woo Kim',          country: 'KOR', world_ranking: 42, owgr_points: 94.0,   salary: 400 },
  { name: 'Byeong Hun An',       country: 'KOR', world_ranking: 43, owgr_points: 90.0,   salary: 400 },
  { name: 'Ryan Fox',            country: 'NZL', world_ranking: 44, owgr_points: 87.0,   salary: 400 },
  { name: 'J.T. Poston',         country: 'USA', world_ranking: 45, owgr_points: 84.0,   salary: 400 },
  { name: 'Luke List',           country: 'USA', world_ranking: 46, owgr_points: 81.0,   salary: 400 },
  { name: 'Taylor Moore',        country: 'USA', world_ranking: 47, owgr_points: 78.0,   salary: 400 },
  { name: 'Mark Hubbard',        country: 'USA', world_ranking: 48, owgr_points: 75.0,   salary: 400 },
  { name: 'Cameron Percy',       country: 'AUS', world_ranking: 49, owgr_points: 72.0,   salary: 400 },
  { name: 'Brendan Steele',      country: 'USA', world_ranking: 50, owgr_points: 70.0,   salary: 400 },
  // Tier 4 ($300): World ranking 51-100
  { name: 'Eric Cole',           country: 'USA', world_ranking: 51, owgr_points: 68.0,   salary: 300 },
  { name: 'Austin Eckroat',      country: 'USA', world_ranking: 52, owgr_points: 66.0,   salary: 300 },
  { name: 'Stephan Jaeger',      country: 'GER', world_ranking: 53, owgr_points: 64.0,   salary: 300 },
  { name: 'Ben Griffin',         country: 'USA', world_ranking: 54, owgr_points: 62.0,   salary: 300 },
  { name: 'Emiliano Grillo',     country: 'ARG', world_ranking: 55, owgr_points: 60.0,   salary: 300 },
  { name: 'Patrick Rodgers',     country: 'USA', world_ranking: 56, owgr_points: 58.0,   salary: 300 },
  { name: 'Andrew Novak',        country: 'USA', world_ranking: 57, owgr_points: 56.0,   salary: 300 },
  { name: 'Aaron Rai',           country: 'ENG', world_ranking: 58, owgr_points: 54.0,   salary: 300 },
  { name: 'Matt Fitzpatrick',    country: 'ENG', world_ranking: 59, owgr_points: 52.0,   salary: 300 },
  { name: 'Nicolai Hojgaard',    country: 'DEN', world_ranking: 60, owgr_points: 50.0,   salary: 300 },
  // Tier 5 ($200): World ranking 101+
  { name: 'Beau Hossler',        country: 'USA', world_ranking: 101, owgr_points: 30.0,  salary: 200 },
  { name: 'David Lipsky',        country: 'USA', world_ranking: 102, owgr_points: 29.0,  salary: 200 },
  { name: 'Joe Highsmith',       country: 'USA', world_ranking: 103, owgr_points: 28.0,  salary: 200 },
  { name: 'Neal Shipley',        country: 'USA', world_ranking: 104, owgr_points: 27.0,  salary: 200 },
  { name: 'Greyson Sigg',        country: 'USA', world_ranking: 105, owgr_points: 26.0,  salary: 200 },
];

const existingCount = db.prepare('SELECT COUNT(*) as c FROM golf_players').get().c;
if (existingCount === 0) {
  const ins = db.prepare(`INSERT OR IGNORE INTO golf_players (id, name, country, world_ranking, owgr_points, salary, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)`);
  db.transaction(() => { for (const p of GOLF_PLAYERS) ins.run(uuidv4(), p.name, p.country, p.world_ranking, p.owgr_points, p.salary); })();
  console.log('[golf-db] Seeded', GOLF_PLAYERS.length, 'golf players');
}

// ── Seed golf_tournaments (2025 PGA Tour season) ──────────────────────────────
const TOURNAMENTS_2025 = [
  { name: 'The Sentry',                     course: 'Plantation Course at Kapalua',  start_date: '2025-01-02', end_date: '2025-01-05', is_major: 0, purse: 20000000 },
  { name: 'Sony Open in Hawaii',             course: 'Waialae Country Club',          start_date: '2025-01-09', end_date: '2025-01-12', is_major: 0, purse: 8300000  },
  { name: 'The American Express',            course: 'PGA West',                      start_date: '2025-01-16', end_date: '2025-01-19', is_major: 0, purse: 8200000  },
  { name: 'Farmers Insurance Open',          course: 'Torrey Pines GC',               start_date: '2025-01-23', end_date: '2025-01-26', is_major: 0, purse: 8800000  },
  { name: 'AT&T Pebble Beach Pro-Am',        course: 'Pebble Beach Golf Links',       start_date: '2025-01-30', end_date: '2025-02-02', is_major: 0, purse: 8700000  },
  { name: 'WM Phoenix Open',                 course: 'TPC Scottsdale',                start_date: '2025-02-06', end_date: '2025-02-09', is_major: 0, purse: 9100000  },
  { name: 'Genesis Invitational',            course: 'Riviera Country Club',          start_date: '2025-02-13', end_date: '2025-02-16', is_major: 0, purse: 20000000 },
  { name: 'The Honda Classic',               course: 'PGA National',                  start_date: '2025-02-20', end_date: '2025-02-23', is_major: 0, purse: 8400000  },
  { name: 'Arnold Palmer Invitational',      course: 'Bay Hill Club & Lodge',         start_date: '2025-02-27', end_date: '2025-03-02', is_major: 0, purse: 20000000 },
  { name: 'The Players Championship',        course: 'TPC Sawgrass',                  start_date: '2025-03-13', end_date: '2025-03-16', is_major: 0, purse: 25000000 },
  { name: 'Valspar Championship',            course: 'Innisbrook Resort',             start_date: '2025-03-20', end_date: '2025-03-23', is_major: 0, purse: 8700000  },
  { name: 'Texas Children\'s Houston Open',  course: 'Memorial Park GC',              start_date: '2025-03-27', end_date: '2025-03-30', is_major: 0, purse: 9200000  },
  { name: 'The Masters Tournament',          course: 'Augusta National Golf Club',    start_date: '2025-04-10', end_date: '2025-04-13', is_major: 1, purse: 20000000 },
  { name: 'RBC Heritage',                   course: 'Harbour Town Golf Links',       start_date: '2025-04-17', end_date: '2025-04-20', is_major: 0, purse: 20000000 },
  { name: 'Zurich Classic of New Orleans',   course: 'TPC Louisiana',                 start_date: '2025-04-24', end_date: '2025-04-27', is_major: 0, purse: 8900000  },
  { name: 'Wells Fargo Championship',        course: 'Quail Hollow Club',             start_date: '2025-05-01', end_date: '2025-05-04', is_major: 0, purse: 20000000 },
  { name: 'PGA Championship',               course: 'Quail Hollow Club',             start_date: '2025-05-15', end_date: '2025-05-18', is_major: 1, purse: 18500000 },
  { name: 'Charles Schwab Challenge',        course: 'Colonial Country Club',         start_date: '2025-05-22', end_date: '2025-05-25', is_major: 0, purse: 8900000  },
  { name: 'Memorial Tournament',             course: 'Muirfield Village Golf Club',   start_date: '2025-06-05', end_date: '2025-06-08', is_major: 0, purse: 20000000 },
  { name: 'US Open',                         course: 'Oakmont Country Club',          start_date: '2025-06-12', end_date: '2025-06-15', is_major: 1, purse: 21500000 },
  { name: 'Travelers Championship',          course: 'TPC River Highlands',           start_date: '2025-06-19', end_date: '2025-06-22', is_major: 0, purse: 20000000 },
  { name: 'Rocket Classic',                  course: 'Detroit Golf Club',             start_date: '2025-06-26', end_date: '2025-06-29', is_major: 0, purse: 8400000  },
  { name: 'John Deere Classic',              course: 'TPC Deere Run',                 start_date: '2025-07-03', end_date: '2025-07-06', is_major: 0, purse: 8200000  },
  { name: 'The Open Championship',           course: 'Royal Portrush Golf Club',      start_date: '2025-07-17', end_date: '2025-07-20', is_major: 1, purse: 17000000 },
  { name: '3M Open',                         course: 'TPC Twin Cities',               start_date: '2025-07-24', end_date: '2025-07-27', is_major: 0, purse: 8200000  },
  { name: 'Barracuda Championship',          course: 'Tahoe Mountain Club',           start_date: '2025-07-24', end_date: '2025-07-27', is_major: 0, purse: 4500000  },
  { name: 'Olympic Club Invitational',       course: 'The Olympic Club',              start_date: '2025-07-31', end_date: '2025-08-03', is_major: 0, purse: 20000000 },
  { name: 'Wyndham Championship',            course: 'Sedgefield Country Club',       start_date: '2025-08-07', end_date: '2025-08-10', is_major: 0, purse: 7900000  },
  { name: 'FedEx St. Jude Championship',     course: 'TPC Southwind',                 start_date: '2025-08-14', end_date: '2025-08-17', is_major: 0, purse: 20000000 },
  { name: 'BMW Championship',               course: 'Caves Valley Golf Club',        start_date: '2025-08-21', end_date: '2025-08-24', is_major: 0, purse: 20000000 },
  { name: 'TOUR Championship',              course: 'East Lake Golf Club',           start_date: '2025-08-28', end_date: '2025-08-31', is_major: 0, purse: 100000000 },
];

const existingT = db.prepare('SELECT COUNT(*) as c FROM golf_tournaments').get().c;
if (existingT === 0) {
  const insT = db.prepare(`INSERT OR IGNORE INTO golf_tournaments (id, name, course, start_date, end_date, season_year, is_major, status, purse) VALUES (?, ?, ?, ?, ?, 2025, ?, ?, ?)`);
  const now = new Date();
  db.transaction(() => {
    for (const t of TOURNAMENTS_2025) {
      const s = new Date(t.start_date), e = new Date(t.end_date);
      const status = now > e ? 'completed' : now >= s ? 'active' : 'scheduled';
      insT.run(uuidv4(), t.name, t.course, t.start_date, t.end_date, t.is_major, status, t.purse);
    }
  })();
  console.log('[golf-db] Seeded', TOURNAMENTS_2025.length, 'golf tournaments');
}

module.exports = db;
