/**
 * Seed test data for Horse Racing Playwright tests.
 *
 * Creates:
 *   - 1 Kentucky Derby 2026 test event
 *   - 20 horses with realistic names, post positions, jockeys, trainers, odds
 *
 * Also creates a test user if one doesn't exist (uses .env.test credentials).
 *
 * Usage: node qa/seed-test-data.js
 * Teardown: node qa/seed-test-data.js --teardown
 */

require('dotenv').config({ path: '.env.test' });
require('dotenv').config({ path: 'server/.env' });

const path = require('path');
const serverDir = path.join(__dirname, '..', 'server');
const { Pool } = require(path.join(serverDir, 'node_modules', 'pg'));
const { v4: uuidv4 } = require(path.join(serverDir, 'node_modules', 'uuid'));
const bcrypt = require(path.join(serverDir, 'node_modules', 'bcryptjs'));

const connString = process.env.DATABASE_URL;
if (!connString) { console.error('DATABASE_URL not set'); process.exit(1); }

const pool = new Pool({ connectionString: connString });

const TEST_EVENT_NAME = 'QA_Kentucky Derby 2026';

const HORSES = [
  { horse_name: 'Sovereignty', post_position: 1, jockey_name: 'I. Ortiz Jr.', trainer_name: 'C. Brown', morning_line_odds: '3-1', silk_colors: 'Royal blue, gold cross' },
  { horse_name: 'Journalism', post_position: 2, jockey_name: 'J. Velazquez', trainer_name: 'B. Baffert', morning_line_odds: '5-1', silk_colors: 'White, red star' },
  { horse_name: 'Burnham Square', post_position: 3, jockey_name: 'F. Prat', trainer_name: 'S. Asmussen', morning_line_odds: '8-1', silk_colors: 'Green, white chevrons' },
  { horse_name: 'Iron Resolve', post_position: 4, jockey_name: 'L. Saez', trainer_name: 'T. Pletcher', morning_line_odds: '10-1', silk_colors: 'Black, gold trim' },
  { horse_name: 'Coastal Breeze', post_position: 5, jockey_name: 'J. Rosario', trainer_name: 'M. Maker', morning_line_odds: '12-1', silk_colors: 'Light blue, white sleeves' },
  { horse_name: 'Thunder Road', post_position: 6, jockey_name: 'T. Gaffalione', trainer_name: 'B. Cox', morning_line_odds: '15-1', silk_colors: 'Purple, lightning bolt' },
  { horse_name: 'Golden Summit', post_position: 7, jockey_name: 'R. Moore', trainer_name: 'A. O\'Brien', morning_line_odds: '6-1', silk_colors: 'Yellow, green cap' },
  { horse_name: 'Fast Company', post_position: 8, jockey_name: 'M. Smith', trainer_name: 'D. O\'Neill', morning_line_odds: '20-1', silk_colors: 'Red, white diamonds' },
  { horse_name: 'Dark Harbor', post_position: 9, jockey_name: 'J. Castellano', trainer_name: 'W. Mott', morning_line_odds: '25-1', silk_colors: 'Navy, silver band' },
  { horse_name: 'Prairie Wind', post_position: 10, jockey_name: 'C. Landeros', trainer_name: 'K. McPeek', morning_line_odds: '30-1', silk_colors: 'Tan, brown stripes' },
  { horse_name: 'Steel Curtain', post_position: 11, jockey_name: 'B. Hernandez', trainer_name: 'D. Romans', morning_line_odds: '15-1', silk_colors: 'Silver, black hoops' },
  { horse_name: 'Night Watch', post_position: 12, jockey_name: 'D. Davis', trainer_name: 'L. Rice', morning_line_odds: '40-1', silk_colors: 'Dark blue, stars' },
  { horse_name: 'River King', post_position: 13, jockey_name: 'P. Lopez', trainer_name: 'H. Motion', morning_line_odds: '50-1', silk_colors: 'Teal, white crown' },
  { horse_name: 'Bold Action', post_position: 14, jockey_name: 'A. Beschizza', trainer_name: 'G. Weaver', morning_line_odds: '20-1', silk_colors: 'Orange, black cap' },
  { horse_name: 'Mountain Echo', post_position: 15, jockey_name: 'K. Carmouche', trainer_name: 'R. Dutrow', morning_line_odds: '35-1', silk_colors: 'Brown, green sash' },
  { horse_name: 'City Lights', post_position: 16, jockey_name: 'E. Jaramillo', trainer_name: 'J. Sadler', morning_line_odds: '45-1', silk_colors: 'White, neon trim' },
  { horse_name: 'Desert Storm', post_position: 17, jockey_name: 'C. DeCarlo', trainer_name: 'P. Ward', morning_line_odds: '50-1', silk_colors: 'Sand, red chevron' },
  { horse_name: 'Blue Ridge', post_position: 18, jockey_name: 'S. Bridgmohan', trainer_name: 'I. Wilkes', morning_line_odds: '60-1', silk_colors: 'Blue, white dots' },
  { horse_name: 'Falcon Crest', post_position: 19, jockey_name: 'R. Santana', trainer_name: 'S. Hough', morning_line_odds: '30-1', silk_colors: 'Maroon, gold eagle' },
  { horse_name: 'Northern Star', post_position: 20, jockey_name: 'J. Leparoux', trainer_name: 'M. Casse', morning_line_odds: '18-1', silk_colors: 'White, blue star' },
];

async function seed() {
  console.log('[seed] Seeding test data...');

  // Clean any previous test data
  await teardown();

  // Create event
  const eventId = uuidv4();
  await pool.query(`
    INSERT INTO horses_events (id, name, venue, race_date, post_time, default_lock_time, field_size, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    eventId, TEST_EVENT_NAME, 'Churchill Downs',
    '2026-05-02T00:00:00-04:00', '2026-05-02T18:57:00-04:00',
    '2026-05-02T18:47:00-04:00', 20, 'upcoming'
  ]);
  console.log(`[seed] Event created: ${eventId}`);

  // Create 20 horses
  for (const h of HORSES) {
    await pool.query(`
      INSERT INTO horses_horses (id, event_id, horse_name, post_position, jockey_name, trainer_name, morning_line_odds, silk_colors)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [uuidv4(), eventId, h.horse_name, h.post_position, h.jockey_name, h.trainer_name, h.morning_line_odds, h.silk_colors]);
  }
  console.log(`[seed] ${HORSES.length} horses created`);

  // Ensure test user exists
  const email = process.env.TOURNEYRUN_EMAIL;
  const password = process.env.TOURNEYRUN_PASSWORD;
  if (email && password) {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!existing.rows.length) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(`
        INSERT INTO users (id, email, username, password_hash, role, agreement_accepted, age_confirmed, state_eligible)
        VALUES ($1, $2, $3, $4, $5, 1, 1, 1)
      `, [uuidv4(), email, email.split('@')[0], hash, 'superadmin']);
      console.log(`[seed] Test user created: ${email} (superadmin)`);
    } else {
      // Ensure superadmin for test
      await pool.query("UPDATE users SET role = 'superadmin' WHERE email = $1", [email]);
      console.log(`[seed] Test user exists: ${email} (ensured superadmin)`);
    }
  }

  console.log('[seed] Done.');
}

async function teardown() {
  console.log('[teardown] Cleaning horses_* test data...');

  // Delete in reverse dependency order
  // Only delete data associated with QA test events
  const events = await pool.query("SELECT id FROM horses_events WHERE name = $1", [TEST_EVENT_NAME]);
  const eventIds = events.rows.map(r => r.id);

  if (eventIds.length === 0) {
    console.log('[teardown] No test data found.');
    return;
  }

  // Get pool IDs for these events
  const pools = await pool.query("SELECT id FROM horses_pools WHERE event_id = ANY($1)", [eventIds]);
  const poolIds = pools.rows.map(r => r.id);

  if (poolIds.length) {
    // Get entry IDs
    const entries = await pool.query("SELECT id FROM horses_entries WHERE pool_id = ANY($1)", [poolIds]);
    const entryIds = entries.rows.map(r => r.id);

    if (entryIds.length) {
      await pool.query("DELETE FROM horses_picks WHERE entry_id = ANY($1)", [entryIds]);
      await pool.query("DELETE FROM horses_payouts WHERE entry_id = ANY($1)", [entryIds]);
    }
    await pool.query("DELETE FROM horses_squares WHERE pool_id = ANY($1)", [poolIds]);
    await pool.query("DELETE FROM horses_results WHERE pool_id = ANY($1)", [poolIds]);
    await pool.query("DELETE FROM horses_entries WHERE pool_id = ANY($1)", [poolIds]);
    await pool.query("DELETE FROM horses_pools WHERE id = ANY($1)", [poolIds]);
  }

  await pool.query("DELETE FROM horses_horses WHERE event_id = ANY($1)", [eventIds]);
  await pool.query("DELETE FROM horses_events WHERE id = ANY($1)", [eventIds]);

  console.log(`[teardown] Cleaned ${eventIds.length} events, ${poolIds.length} pools.`);
}

async function main() {
  try {
    if (process.argv.includes('--teardown')) {
      await teardown();
    } else {
      await seed();
    }
  } catch (err) {
    console.error('[seed] Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
