/**
 * createMobileTest.js
 * -------------------
 * Creates an 8-team test league for mobile draft room testing.
 * Usage: node server/createMobileTest.js
 */

const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const db = require('./db');

async function main() {
  const commissioner = db.prepare('SELECT * FROM users WHERE username = ?').get('cwohlfert');
  if (!commissioner) {
    console.error('User "cwohlfert" not found. Make sure you are logged in / registered first.');
    process.exit(1);
  }

  const NUM_BOTS = 7;
  const leagueId   = uuidv4();
  const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  const leagueName = 'Mobile Test League (8 Teams)';

  db.prepare(`
    INSERT INTO leagues
      (id, name, commissioner_id, invite_code, status, max_teams, total_rounds,
       pick_time_limit, auto_start_on_full, buy_in_amount,
       payout_first, payout_second, payout_third)
    VALUES (?, ?, ?, ?, 'lobby', ?, 10, 30, 0, 20, 70, 20, 10)
  `).run(leagueId, leagueName, commissioner.id, inviteCode, NUM_BOTS + 1);

  db.prepare('INSERT INTO scoring_settings (id, league_id) VALUES (?, ?)').run(uuidv4(), leagueId);

  // Commissioner
  db.prepare('INSERT INTO league_members (id, league_id, user_id, team_name) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), leagueId, commissioner.id, 'Wohlfert FC');
  db.prepare("INSERT INTO member_payments (id, league_id, user_id, amount, status, paid_at) VALUES (?, ?, ?, 20.00, 'paid', CURRENT_TIMESTAMP)")
    .run(uuidv4(), leagueId, commissioner.id);

  // Realistic bot names
  const bots = [
    ['mikecooper88', 'Hoops Ninjas'],
    ['drakeballin',  'The Chalks'],
    ['jess_tourney', 'Cinderella Story'],
    ['bracket_god',  'Lock City'],
    ['ncaa_fanatic', 'Upset Special'],
    ['treyway23',    'Deep Runs'],
    ['marchking99',  'Mid Major Magic'],
  ];

  const passwordHash = await bcrypt.hash('testpass123', 6);

  for (const [username, teamName] of bots) {
    let user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      const uid = uuidv4();
      db.prepare('INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)')
        .run(uid, `${username}@dev.local`, username, passwordHash);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
    }
    db.prepare('INSERT INTO league_members (id, league_id, user_id, team_name) VALUES (?, ?, ?, ?)')
      .run(uuidv4(), leagueId, user.id, teamName);
    db.prepare("INSERT INTO member_payments (id, league_id, user_id, amount, status, paid_at) VALUES (?, ?, ?, 20.00, 'paid', CURRENT_TIMESTAMP)")
      .run(uuidv4(), leagueId, user.id);
  }

  const playerCount = db.prepare('SELECT COUNT(*) as n FROM players').get().n;

  console.log('\n✅  Mobile test league created!\n');
  console.log(`   League:      ${leagueName}`);
  console.log(`   League ID:   ${leagueId}`);
  console.log(`   Invite code: ${inviteCode}`);
  console.log(`   Teams:       Wohlfert FC + ${bots.map(b => b[1]).join(', ')}`);
  console.log(`   Pick timer:  30s (fast for testing)`);
  console.log(`   Buy-in:      $20 (70/20/10 payout split)`);
  console.log(`   Players:     ${playerCount} in pool\n`);
  console.log('   → Start the draft from the commissioner controls on the league page');
  console.log(`   → http://localhost:5173/league/${leagueId}\n`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
