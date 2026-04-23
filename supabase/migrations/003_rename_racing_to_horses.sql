-- ============================================================================
-- TourneyRun — Rename racing_* tables to horses_*
-- Created: 2026-04-23
--
-- Drops empty racing_* tables (Phase 1 schema-only, no data) and recreates
-- as horses_* with identical schema. Idempotent via IF EXISTS / IF NOT EXISTS.
-- ============================================================================

-- Drop in reverse dependency order (children first)
DROP TABLE IF EXISTS racing_payouts;
DROP TABLE IF EXISTS racing_picks;
DROP TABLE IF EXISTS racing_squares;
DROP TABLE IF EXISTS racing_results;
DROP TABLE IF EXISTS racing_entries;
DROP TABLE IF EXISTS racing_pools;
DROP TABLE IF EXISTS racing_horses;
DROP TABLE IF EXISTS racing_events;

-- Drop old indexes (cascade with tables, but be explicit)
DROP INDEX IF EXISTS idx_racing_horses_event;
DROP INDEX IF EXISTS idx_racing_pools_commissioner;
DROP INDEX IF EXISTS idx_racing_pools_event;
DROP INDEX IF EXISTS idx_racing_pools_invite;
DROP INDEX IF EXISTS idx_racing_entries_pool;
DROP INDEX IF EXISTS idx_racing_squares_pool;

-- 1. horses_events
CREATE TABLE IF NOT EXISTS horses_events (
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

-- 2. horses_horses
CREATE TABLE IF NOT EXISTS horses_horses (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  event_id TEXT NOT NULL REFERENCES horses_events(id),
  horse_name TEXT NOT NULL,
  post_position INTEGER,
  jockey_name TEXT,
  trainer_name TEXT,
  morning_line_odds TEXT,
  status TEXT DEFAULT 'active',
  silk_colors TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_horses_horses_event ON horses_horses(event_id);

-- 3. horses_pools
CREATE TABLE IF NOT EXISTS horses_pools (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  event_id TEXT NOT NULL REFERENCES horses_events(id),
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
CREATE INDEX IF NOT EXISTS idx_horses_pools_commissioner ON horses_pools(commissioner_id);
CREATE INDEX IF NOT EXISTS idx_horses_pools_event ON horses_pools(event_id);
CREATE INDEX IF NOT EXISTS idx_horses_pools_invite ON horses_pools(invite_code);

-- 4. horses_entries
CREATE TABLE IF NOT EXISTS horses_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  pool_id TEXT NOT NULL REFERENCES horses_pools(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  display_name TEXT,
  is_paid BOOLEAN DEFAULT FALSE,
  assigned_horse_id TEXT REFERENCES horses_horses(id),
  refund_status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pool_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_horses_entries_pool ON horses_entries(pool_id);

-- 5. horses_picks
CREATE TABLE IF NOT EXISTS horses_picks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  entry_id TEXT NOT NULL REFERENCES horses_entries(id),
  slot TEXT NOT NULL,
  horse_id TEXT NOT NULL REFERENCES horses_horses(id),
  points_earned NUMERIC DEFAULT 0,
  UNIQUE(entry_id, slot)
);

-- 6. horses_squares
CREATE TABLE IF NOT EXISTS horses_squares (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  pool_id TEXT NOT NULL REFERENCES horses_pools(id),
  row_num INTEGER NOT NULL,
  col_num INTEGER NOT NULL,
  entry_id TEXT REFERENCES horses_entries(id),
  row_digit INTEGER,
  col_digit INTEGER,
  UNIQUE(pool_id, row_num, col_num)
);
CREATE INDEX IF NOT EXISTS idx_horses_squares_pool ON horses_squares(pool_id);

-- 7. horses_results
CREATE TABLE IF NOT EXISTS horses_results (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  pool_id TEXT NOT NULL REFERENCES horses_pools(id),
  finish_position INTEGER NOT NULL,
  horse_id TEXT NOT NULL REFERENCES horses_horses(id),
  post_position INTEGER,
  is_official BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. horses_payouts
CREATE TABLE IF NOT EXISTS horses_payouts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  pool_id TEXT NOT NULL REFERENCES horses_pools(id),
  entry_id TEXT NOT NULL REFERENCES horses_entries(id),
  payout_type TEXT,
  amount NUMERIC NOT NULL,
  is_split BOOLEAN DEFAULT FALSE,
  split_count INTEGER DEFAULT 1
);
