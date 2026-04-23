-- ============================================================================
-- TourneyRun — Horse Racing Schema Migration
-- Created: 2026-04-23
--
-- Adds 8 tables for horse racing pools (Random Draw, Pick W/P/S, Squares).
-- Follows 001_initial_schema.sql conventions:
--   TEXT primary keys with gen_random_uuid()::TEXT
--   TIMESTAMPTZ for all timestamps
--   JSONB for structured data
--   CREATE TABLE IF NOT EXISTS (idempotent)
-- ============================================================================

-- 1. racing_events
CREATE TABLE IF NOT EXISTS racing_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  venue TEXT,
  race_date TIMESTAMPTZ,
  post_time TIMESTAMPTZ,
  default_lock_time TIMESTAMPTZ,
  field_size INTEGER DEFAULT 20,
  status TEXT DEFAULT 'upcoming',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. racing_horses
CREATE TABLE IF NOT EXISTS racing_horses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  event_id TEXT NOT NULL REFERENCES racing_events(id),
  horse_name TEXT NOT NULL,
  post_position INTEGER,
  jockey_name TEXT,
  trainer_name TEXT,
  morning_line_odds TEXT,
  status TEXT DEFAULT 'active',
  silk_colors TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_racing_horses_event ON racing_horses(event_id);

-- 3. racing_pools
CREATE TABLE IF NOT EXISTS racing_pools (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  event_id TEXT NOT NULL REFERENCES racing_events(id),
  commissioner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  format_type TEXT NOT NULL,
  invite_code TEXT UNIQUE,
  entry_fee NUMERIC DEFAULT 5.00,
  lock_time TIMESTAMPTZ,
  status TEXT DEFAULT 'open',
  payout_structure JSONB DEFAULT '[{"place":1,"pct":50},{"place":2,"pct":30},{"place":3,"pct":20}]',
  admin_fee_type TEXT,
  admin_fee_value NUMERIC DEFAULT 0,
  venmo TEXT,
  zelle TEXT,
  paypal TEXT,
  squares_per_person_cap INTEGER DEFAULT 10,
  scoring_config JSONB DEFAULT '{"win":5,"place":3,"show":2}',
  payouts_finalized_at TIMESTAMPTZ,
  payouts_finalized_by TEXT REFERENCES users(id),
  payout_idempotency_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_racing_pools_commissioner ON racing_pools(commissioner_id);
CREATE INDEX IF NOT EXISTS idx_racing_pools_event ON racing_pools(event_id);
CREATE INDEX IF NOT EXISTS idx_racing_pools_invite ON racing_pools(invite_code);

-- 4. racing_entries
CREATE TABLE IF NOT EXISTS racing_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  pool_id TEXT NOT NULL REFERENCES racing_pools(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  display_name TEXT,
  is_paid BOOLEAN DEFAULT FALSE,
  assigned_horse_id TEXT REFERENCES racing_horses(id),
  refund_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pool_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_racing_entries_pool ON racing_entries(pool_id);

-- 5. racing_picks
CREATE TABLE IF NOT EXISTS racing_picks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  entry_id TEXT NOT NULL REFERENCES racing_entries(id),
  slot TEXT NOT NULL,
  horse_id TEXT NOT NULL REFERENCES racing_horses(id),
  points_earned NUMERIC DEFAULT 0,
  UNIQUE(entry_id, slot)
);

-- 6. racing_squares
CREATE TABLE IF NOT EXISTS racing_squares (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  pool_id TEXT NOT NULL REFERENCES racing_pools(id),
  row_num INTEGER NOT NULL,
  col_num INTEGER NOT NULL,
  entry_id TEXT REFERENCES racing_entries(id),
  row_digit INTEGER,
  col_digit INTEGER,
  UNIQUE(pool_id, row_num, col_num)
);
CREATE INDEX IF NOT EXISTS idx_racing_squares_pool ON racing_squares(pool_id);

-- 7. racing_results
CREATE TABLE IF NOT EXISTS racing_results (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  pool_id TEXT NOT NULL REFERENCES racing_pools(id),
  finish_position INTEGER NOT NULL,
  horse_id TEXT NOT NULL REFERENCES racing_horses(id),
  post_position INTEGER,
  is_official BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. racing_payouts
CREATE TABLE IF NOT EXISTS racing_payouts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  pool_id TEXT NOT NULL REFERENCES racing_pools(id),
  entry_id TEXT NOT NULL REFERENCES racing_entries(id),
  payout_type TEXT,
  amount NUMERIC NOT NULL,
  is_split BOOLEAN DEFAULT FALSE,
  split_count INTEGER DEFAULT 1
);
