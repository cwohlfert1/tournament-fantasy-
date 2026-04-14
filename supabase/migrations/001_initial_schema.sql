-- ============================================================================
-- TourneyRun — Initial PostgreSQL Schema Migration
-- Migrated from SQLite (better-sqlite3) → Supabase/PostgreSQL
-- Created: 2026-04-13
--
-- Type conversions applied:
--   lower(hex(randomblob(16))) → gen_random_uuid()::TEXT
--   datetime('now')            → NOW()
--   TEXT storing JSON           → JSONB
--   INSERT OR IGNORE           → ON CONFLICT DO NOTHING
--   INSERT OR REPLACE          → ON CONFLICT DO UPDATE
--
-- Tables organized: Golf → Basketball → System/Email
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- CORE: USERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  stripe_account_id TEXT,
  stripe_account_status TEXT DEFAULT 'not_connected',
  avatar_url TEXT,
  venmo_handle TEXT DEFAULT '',
  default_team_name TEXT DEFAULT '',
  team_logo_url TEXT,
  notif_turn INTEGER DEFAULT 1,
  notif_draft_start INTEGER DEFAULT 1,
  notif_standings_recap INTEGER DEFAULT 1,
  referral_code TEXT,
  referred_by TEXT,
  password_reset_token TEXT,
  password_reset_expires TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  invite_token TEXT,
  agreement_accepted INTEGER DEFAULT 0,
  age_confirmed INTEGER DEFAULT 0,
  state_eligible INTEGER DEFAULT 0,
  role TEXT DEFAULT 'user',
  gender TEXT,
  dob TEXT,
  dob_verified INTEGER DEFAULT 0,
  force_password_reset INTEGER DEFAULT 0,
  full_name TEXT
);

-- Partial index for invite tokens (only index non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_invite_token
  ON users (invite_token) WHERE invite_token IS NOT NULL;

-- ============================================================================
-- GOLF TABLES
-- ============================================================================

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
  external_id TEXT,
  espn_event_id TEXT,
  last_synced_at TIMESTAMPTZ,
  par INTEGER DEFAULT 72,
  datagolf_event_id INTEGER
);

CREATE TABLE IF NOT EXISTS golf_players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT DEFAULT 'US',
  world_ranking INTEGER,
  owgr_points REAL DEFAULT 0,
  salary INTEGER DEFAULT 200,
  is_active INTEGER DEFAULT 1,
  odds_display TEXT,
  odds_decimal REAL,
  datagolf_id INTEGER
);
-- Prevents the golf_players name-dup class of corruption (e.g. 212 rows for
-- "Matt Kuchar" that appeared during RBC Heritage week 2026-04-14).
CREATE UNIQUE INDEX IF NOT EXISTS idx_golf_players_name_lower
  ON golf_players (LOWER(name));

CREATE TABLE IF NOT EXISTS golf_leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  commissioner_id TEXT NOT NULL REFERENCES users(id),
  invite_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'lobby',
  max_teams INTEGER DEFAULT 10,
  buy_in_amount REAL DEFAULT 0,
  payment_instructions TEXT DEFAULT '',
  admin_fee_type TEXT,
  admin_fee_value REAL,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  format_type TEXT DEFAULT 'tourneyrun',
  salary_cap INTEGER DEFAULT 2400,
  weekly_salary_cap INTEGER DEFAULT 50000,
  core_spots INTEGER DEFAULT 4,
  flex_spots INTEGER DEFAULT 4,
  faab_budget INTEGER DEFAULT 500,
  use_faab INTEGER DEFAULT 1,
  picks_per_team INTEGER DEFAULT 8,
  auction_budget INTEGER DEFAULT 1000,
  faab_weekly_budget INTEGER DEFAULT 100,
  draft_type TEXT DEFAULT 'snake',
  bid_timer_seconds INTEGER DEFAULT 30,
  is_sandbox INTEGER DEFAULT 0,
  scoring_style TEXT DEFAULT 'tourneyrun',
  pool_tier TEXT DEFAULT 'standard',
  comm_pro_price REAL DEFAULT 19.99,
  payment_methods JSONB DEFAULT '[]'::JSONB,
  payout_places JSONB DEFAULT '[]'::JSONB,
  pick_sheet_format TEXT DEFAULT 'tiered',
  pool_tiers JSONB DEFAULT '[]'::JSONB,
  pool_salary_cap INTEGER DEFAULT 50000,
  pool_cap_unit INTEGER DEFAULT 50000,
  pool_tournament_id TEXT,
  picks_locked INTEGER DEFAULT 0,
  picks_lock_time TEXT,
  payout_pool_override REAL,
  pool_drop_count INTEGER DEFAULT 2,
  venmo TEXT,
  zelle TEXT,
  paypal TEXT,
  pool_drops_applied INTEGER DEFAULT 0,
  pool_max_entries INTEGER DEFAULT 1,
  lock_unpaid_dismissed INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS golf_league_members (
  id TEXT PRIMARY KEY,
  golf_league_id TEXT NOT NULL REFERENCES golf_leagues(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  team_name TEXT NOT NULL,
  draft_order INTEGER,
  season_points REAL DEFAULT 0,
  season_budget INTEGER DEFAULT 2400,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  is_paid INTEGER DEFAULT 0,
  UNIQUE(golf_league_id, user_id)
);

CREATE TABLE IF NOT EXISTS golf_rosters (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES golf_league_members(id),
  player_id TEXT NOT NULL REFERENCES golf_players(id),
  acquired_at TIMESTAMPTZ DEFAULT NOW(),
  dropped_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS golf_weekly_lineups (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES golf_league_members(id),
  tournament_id TEXT NOT NULL REFERENCES golf_tournaments(id),
  player_id TEXT NOT NULL REFERENCES golf_players(id),
  is_started INTEGER DEFAULT 0,
  locked INTEGER DEFAULT 0,
  UNIQUE(member_id, tournament_id, player_id)
);

CREATE TABLE IF NOT EXISTS golf_scores (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES golf_tournaments(id),
  player_id TEXT NOT NULL REFERENCES golf_players(id),
  round1 INTEGER,
  round2 INTEGER,
  round3 INTEGER,
  round4 INTEGER,
  made_cut INTEGER DEFAULT 0,
  finish_position INTEGER,
  fantasy_points REAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sg_total REAL,
  UNIQUE(tournament_id, player_id)
);

CREATE TABLE IF NOT EXISTS golf_draft_picks (
  id TEXT PRIMARY KEY,
  golf_league_id TEXT NOT NULL REFERENCES golf_leagues(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  player_id TEXT NOT NULL REFERENCES golf_players(id),
  pick_number INTEGER NOT NULL,
  round INTEGER NOT NULL,
  picked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(golf_league_id, player_id)
);

CREATE TABLE IF NOT EXISTS golf_faab_bids (
  id TEXT PRIMARY KEY,
  golf_league_id TEXT NOT NULL REFERENCES golf_leagues(id),
  member_id TEXT NOT NULL REFERENCES golf_league_members(id),
  player_id TEXT NOT NULL REFERENCES golf_players(id),
  drop_player_id TEXT,
  bid_amount INTEGER NOT NULL DEFAULT 0,
  tournament_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS golf_core_players (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES golf_league_members(id),
  player_id TEXT NOT NULL REFERENCES golf_players(id),
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id, player_id)
);

CREATE TABLE IF NOT EXISTS golf_auction_sessions (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL UNIQUE REFERENCES golf_leagues(id),
  status TEXT DEFAULT 'waiting',
  current_nomination_member_id TEXT,
  current_player_id TEXT,
  current_high_bid INTEGER DEFAULT 1,
  current_high_bidder_id TEXT,
  nomination_ends_at TEXT,
  nomination_order JSONB DEFAULT '[]'::JSONB,
  nomination_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS golf_auction_bids (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES golf_leagues(id),
  player_id TEXT NOT NULL REFERENCES golf_players(id),
  member_id TEXT NOT NULL REFERENCES golf_league_members(id),
  amount INTEGER NOT NULL,
  bid_type TEXT DEFAULT 'auction',
  tournament_id TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS golf_auction_budgets (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES golf_leagues(id),
  member_id TEXT NOT NULL REFERENCES golf_league_members(id),
  auction_credits_remaining INTEGER DEFAULT 1000,
  faab_credits_remaining INTEGER DEFAULT 100,
  faab_last_reset TEXT,
  UNIQUE(league_id, member_id)
);

CREATE TABLE IF NOT EXISTS pool_picks (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES golf_leagues(id),
  tournament_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  tier_number INTEGER,
  salary_used INTEGER DEFAULT 0,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  tiebreaker_score INTEGER,
  entry_number INTEGER DEFAULT 1,
  entry_team_name TEXT,
  is_dropped INTEGER DEFAULT 0,
  dropped_at TIMESTAMPTZ,
  is_withdrawn INTEGER DEFAULT 0,
  country TEXT
);

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
  salary INTEGER,
  manually_overridden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_withdrawn INTEGER DEFAULT 0,
  country TEXT,
  odds_locked_at TIMESTAMPTZ
);

-- Unique indexes on pool_tier_players
CREATE UNIQUE INDEX IF NOT EXISTS idx_ptp_league_tourn_player
  ON pool_tier_players (league_id, tournament_id, player_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ptp_league_player
  ON pool_tier_players (league_id, player_id);

CREATE TABLE IF NOT EXISTS pool_tiers (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  tier_number INTEGER NOT NULL,
  odds_min TEXT,
  odds_max TEXT,
  picks_allowed INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS golf_tournament_fields (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES golf_tournaments(id),
  player_name TEXT NOT NULL,
  player_id TEXT,
  espn_player_id TEXT,
  world_ranking INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  odds_display TEXT,
  odds_decimal REAL,
  UNIQUE(tournament_id, player_name)
);

CREATE TABLE IF NOT EXISTS pool_entry_paid (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  tournament_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  entry_number INTEGER NOT NULL DEFAULT 1,
  is_paid INTEGER DEFAULT 0,
  UNIQUE(league_id, tournament_id, user_id, entry_number)
);

CREATE TABLE IF NOT EXISTS golf_season_passes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  season_year INTEGER NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, season_year)
);

CREATE TABLE IF NOT EXISTS golf_pool_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  league_id TEXT NOT NULL,
  tournament_id TEXT,
  entry_number INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS golf_comm_pro (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS golf_referral_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS golf_referral_credits (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL,
  referred_id TEXT NOT NULL,
  credit_amount REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS golf_referral_redemptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credit_amount REAL NOT NULL,
  redeemed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS golf_espn_players (
  espn_name TEXT PRIMARY KEY,
  display_name TEXT,
  country_code TEXT,
  normalized_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS golf_user_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  bio TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS golf_waitlist (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  format TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_golf_waitlist_email_format
  ON golf_waitlist (email, format);

CREATE TABLE IF NOT EXISTS golf_migrations (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS player_master (
  player_name TEXT PRIMARY KEY,
  country TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- BASKETBALL TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS leagues (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  commissioner_id TEXT NOT NULL REFERENCES users(id),
  invite_code TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'lobby',
  max_teams INTEGER DEFAULT 10,
  draft_status TEXT DEFAULT 'pending',
  current_pick INTEGER DEFAULT 1,
  total_rounds INTEGER DEFAULT 10,
  stripe_session_id TEXT,
  stripe_payment_status TEXT DEFAULT 'unpaid',
  pick_time_limit INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  entry_fee REAL DEFAULT 10.0,
  is_complete INTEGER DEFAULT 0,
  platform_cut REAL DEFAULT 0.15,
  auto_start_on_full INTEGER DEFAULT 0,
  draft_start_time TEXT,
  buy_in_amount REAL DEFAULT 0,
  payment_instructions TEXT DEFAULT '',
  payout_first INTEGER DEFAULT 70,
  payout_second INTEGER DEFAULT 20,
  payout_third INTEGER DEFAULT 10,
  payout_bonus REAL DEFAULT 0,
  payout_pool_override REAL,
  draft_order_randomized INTEGER DEFAULT 0,
  autodraft_mode TEXT DEFAULT 'best_available'
);

CREATE TABLE IF NOT EXISTS league_members (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  team_name TEXT NOT NULL,
  draft_order INTEGER,
  total_points REAL DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  avatar_url TEXT,
  pending_owner_name TEXT,
  venmo_handle TEXT DEFAULT '',
  zelle_handle TEXT DEFAULT '',
  UNIQUE(league_id, user_id)
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
  season_ppg REAL DEFAULT 0,
  espn_team_id TEXT,
  espn_athlete_id TEXT DEFAULT '',
  is_first_four INTEGER DEFAULT 0,
  injury_flagged INTEGER DEFAULT 0,
  injury_headline TEXT DEFAULT '',
  injury_status TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS draft_picks (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  pick_number INTEGER NOT NULL,
  round INTEGER NOT NULL,
  picked_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, player_id)
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
  winner_team TEXT,
  espn_event_id TEXT,
  is_live INTEGER DEFAULT 0,
  tip_off_time TEXT DEFAULT '',
  tv_network TEXT DEFAULT '',
  location TEXT DEFAULT '',
  current_period TEXT DEFAULT '',
  game_clock TEXT DEFAULT '',
  region TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS player_stats (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  points INTEGER DEFAULT 0,
  round TEXT DEFAULT '',
  opponent TEXT DEFAULT '',
  played_at TIMESTAMPTZ,
  UNIQUE(game_id, player_id)
);

CREATE TABLE IF NOT EXISTS scoring_settings (
  id TEXT PRIMARY KEY,
  league_id TEXT UNIQUE NOT NULL REFERENCES leagues(id),
  pts_per_point REAL DEFAULT 1.0
);

CREATE TABLE IF NOT EXISTS member_payments (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  UNIQUE(league_id, user_id)
);

CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  place INTEGER,
  payout_type TEXT DEFAULT 'place',
  stripe_transfer_id TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES users(id),
  referred_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT UNIQUE NOT NULL,
  source TEXT DEFAULT '',
  published_at TEXT DEFAULT '',
  feed_tag TEXT DEFAULT '',
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS smart_draft_upgrades (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  league_id TEXT NOT NULL REFERENCES leagues(id),
  stripe_session_id TEXT UNIQUE,
  status TEXT DEFAULT 'pending',
  purchased_at TIMESTAMPTZ,
  enabled INTEGER DEFAULT 1,
  UNIQUE(user_id, league_id)
);

CREATE TABLE IF NOT EXISTS smart_draft_credits (
  id TEXT PRIMARY KEY,
  stripe_session_id TEXT UNIQUE NOT NULL,
  user_id TEXT,
  status TEXT DEFAULT 'pending',
  purchased_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wall_posts (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  user_id TEXT,
  text TEXT DEFAULT '',
  gif_url TEXT DEFAULT '',
  is_system INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wall_reactions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL,
  UNIQUE(post_id, user_id, reaction_type)
);

CREATE TABLE IF NOT EXISTS wall_replies (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT DEFAULT '',
  gif_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS league_chat_messages (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  user_id TEXT,
  team_name TEXT DEFAULT '',
  username TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  text TEXT DEFAULT '',
  gif_url TEXT DEFAULT '',
  is_system INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SYSTEM / EMAIL / TRACKING TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS migration_log (
  name TEXT PRIMARY KEY,
  ran_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processed_webhook_orders (
  order_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT,
  discount_value REAL,
  max_uses INTEGER,
  uses_remaining INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS promo_code_uses (
  id TEXT PRIMARY KEY,
  promo_code_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mass_email_log (
  id TEXT PRIMARY KEY,
  sent_by TEXT,
  audience TEXT,
  subject TEXT,
  body_preview TEXT,
  recipient_count INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  email_type TEXT,
  league_id TEXT,
  tournament_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_mass_email_log_league_type_sent
  ON mass_email_log (league_id, email_type, sent_at);

CREATE TABLE IF NOT EXISTS commissioner_actions (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  commissioner_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lock_emails_sent (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, user_id)
);

CREATE TABLE IF NOT EXISTS round_emails_sent (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, round_number)
);

CREATE TABLE IF NOT EXISTS reminder_emails_sent (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, user_id, type)
);

-- ============================================================================
-- END OF INITIAL SCHEMA
-- Total: 55 tables
-- ============================================================================
