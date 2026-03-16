/**
 * createDevDraft.js
 * -----------------
 * Creates a dev/test league for cwohlfert with 3 bot teammates,
 * marks all payments paid, and leaves the league in LOBBY state
 * so you can manually start the draft and verify the full draft flow.
 *
 * Usage:  node server/createDevDraft.js
 */

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('./db');

const COMMISSIONER_USERNAME = 'cwohlfert';
const NUM_BOTS = 3; // total = 4 teams including you
const LEAGUE_ROUNDS = 10;
const PICK_TIME_LIMIT = 60;

async function main() {
  // ── 1. Look up commissioner ──────────────────────────────────────────────
  const commissioner = db.prepare('SELECT * FROM users WHERE username = ?').get(COMMISSIONER_USERNAME);
  if (!commissioner) {
    console.error(`User "${COMMISSIONER_USERNAME}" not found in DB.`);
    process.exit(1);
  }

  // ── 2. Create league ─────────────────────────────────────────────────────
  const leagueId   = uuidv4();
  const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  const leagueName = `Dev Draft ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

  db.prepare(`
    INSERT INTO leagues
      (id, name, commissioner_id, invite_code, status, max_teams, total_rounds, pick_time_limit, auto_start_on_full, buy_in_amount)
    VALUES (?, ?, ?, ?, 'lobby', ?, ?, ?, 0, 0)
  `).run(leagueId, leagueName, commissioner.id, inviteCode, NUM_BOTS + 1, LEAGUE_ROUNDS, PICK_TIME_LIMIT);

  db.prepare('INSERT INTO scoring_settings (id, league_id) VALUES (?, ?)').run(uuidv4(), leagueId);

  // ── 3. Add commissioner as member + mark paid ────────────────────────────
  db.prepare('INSERT INTO league_members (id, league_id, user_id, team_name) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), leagueId, commissioner.id, `${commissioner.username}'s Team`);

  db.prepare(`
    INSERT INTO member_payments (id, league_id, user_id, amount, status, paid_at)
    VALUES (?, ?, ?, 5.00, 'paid', CURRENT_TIMESTAMP)
  `).run(uuidv4(), leagueId, commissioner.id);

  // ── 4. Create bots + add to league ──────────────────────────────────────
  const passwordHash = await bcrypt.hash('testpass123', 6);
  const bots = [];

  for (let i = 1; i <= NUM_BOTS; i++) {
    const username  = `devbot${String(i).padStart(2, '0')}`;
    const email     = `${username}@dev.local`;
    const teamName  = `Bot Team ${i}`;

    let user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      const userId = uuidv4();
      db.prepare('INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)')
        .run(userId, email, username, passwordHash);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    }

    db.prepare('INSERT INTO league_members (id, league_id, user_id, team_name) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), leagueId, user.id, teamName);

    db.prepare(`
      INSERT INTO member_payments (id, league_id, user_id, amount, status, paid_at)
      VALUES (?, ?, ?, 5.00, 'paid', CURRENT_TIMESTAMP)
    `).run(uuidv4(), leagueId, user.id);

    bots.push(username);
  }

  // ── 5. Verify player pool ────────────────────────────────────────────────
  const playerCount = db.prepare('SELECT COUNT(*) as n FROM players').get().n;
  const teamCount   = db.prepare('SELECT COUNT(DISTINCT team) as n FROM players').get().n;
  const sample      = db.prepare('SELECT name, team, seed, region, season_ppg FROM players ORDER BY season_ppg DESC LIMIT 5').all();

  // ── 6. Print summary ─────────────────────────────────────────────────────
  console.log('\n✅  Dev draft league created!\n');
  console.log(`   League:      ${leagueName}`);
  console.log(`   League ID:   ${leagueId}`);
  console.log(`   Invite code: ${inviteCode}`);
  console.log(`   Members:     ${commissioner.username} (you) + ${bots.join(', ')}`);
  console.log(`   Status:      lobby — go start the draft!\n`);
  console.log(`   Player pool: ${playerCount} players across ${teamCount} teams`);
  console.log('   Top 5 by PPG:');
  sample.forEach(p => {
    console.log(`     ${p.name.padEnd(28)} ${p.team.padEnd(26)} Seed ${String(p.seed).padEnd(3)} ${p.season_ppg} PPG`);
  });
  console.log('\n   Navigate to your league:\n');
  console.log(`   http://localhost:5173/league/${leagueId}\n`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
