const https = require('https');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { buildStandings } = require('./standingsBuilder');
const { postEliminations, checkAndPostRankChanges } = require('./wallUtils');
const { sendLeagueStandingsEmail } = require('./mailer');

// Track which rounds we've already emailed standings for (in-memory, per process)
const _standingsEmailedRounds = new Set();

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
const SUMMARY_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=';

// Known mismatches between ESPN displayName and our DB team strings.
// ESPN uses full names; seeds may use short-form or vice versa.
// Each alias is bidirectional — add both directions.
const TEAM_ALIASES = {
  'North Carolina State': 'NC State',
  'NC State':             'North Carolina State',
  'North Carolina':       'UNC',
  'UNC':                  'North Carolina',
  'Saint Mary\'s':        'Saint Mary\'s (CA)',
  'Saint Mary\'s (CA)':   'Saint Mary\'s',
  'USC':                  'Southern California',
  'Southern California':  'USC',
  'Miami':                'Miami (FL)',
  'Miami (FL)':           'Miami',
  'Texas A&M-Corpus Christi': 'TAMU-CC',
  'TAMU-CC':              'Texas A&M-Corpus Christi',
};

// All 2026 NCAA tournament dates (First Four eve through Championship)
const TOURNAMENT_DATES = [
  '20260317',                                           // Tue  Mar 17 — First Four eve / Selection shows
  '20260318','20260319',                                // Wed–Thu Mar 18–19 — First Four
  '20260320','20260321','20260322',                     // Fri–Sun Mar 20–22 — Round of 64
  '20260326','20260327','20260328','20260329',           // Thu–Sun Mar 26–29 — Round of 32
  '20260403','20260404','20260405','20260406','20260407', // Thu–Mon Apr 3–7  — Sweet 16 / Elite 8 / Final Four / NCG
];

const SCHEDULE_URL = date =>
  `${SCOREBOARD_URL}?dates=${date}&groups=100&seasontype=3&limit=100`;

// ── Tournament window & polling interval ────────────────────────────────────
// Returns the ms delay until next poll, or null to stop entirely.
//
//  Before  Mar 17 2026 8:00 PM ET  → every 60 min  (bracket data only)
//  Mar 17 8PM → Apr 7 11:59PM ET   → active tournament:
//    8AM–midnight ET               → every 2 min
//    midnight–8AM ET               → every 30 min
//  After Apr 7 11:59 PM ET         → null (stop)
//
// All comparisons are done in America/New_York to handle EST/EDT automatically.
function getPollingInterval() {
  const now = new Date();
  const et  = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y   = et.getFullYear();
  const mo  = et.getMonth() + 1; // 1-based
  const d   = et.getDate();
  const h   = et.getHours();
  const min = et.getMinutes();

  // ── After tournament end: April 7 23:59 ET ──────────────────────────────
  if (y > 2026
    || (y === 2026 && mo > 4)
    || (y === 2026 && mo === 4 && d > 7)
    || (y === 2026 && mo === 4 && d === 7 && h === 23 && min >= 59)) {
    return null; // stop poller
  }

  // ── Before tournament start: March 17 20:00 ET ──────────────────────────
  const beforeStart =
       y  <  2026
    || mo  <  3
    || (mo === 3 && d < 17)
    || (mo === 3 && d === 17 && h < 20);

  if (beforeStart) return 60 * 60 * 1000; // 60 min — bracket data only

  // ── Active tournament window ─────────────────────────────────────────────
  if (h >= 8) return 2 * 60 * 1000;   // 8AM–midnight  → 2 min
  return 30 * 60 * 1000;              // midnight–8AM  → 30 min
}

// ── Round code helper ────────────────────────────────────────────────────────
function roundNameToCode(roundName) {
  const n = (roundName || '').toLowerCase();
  if (n.includes('first four'))   return 'First Four';
  if (n.includes('first round'))  return 'R64';
  if (n.includes('second round')) return 'R32';
  if (n.includes('sweet 16'))     return 'S16';
  if (n.includes('elite 8'))      return 'E8';
  if (n.includes('final four'))   return 'F4';
  if (n.includes('championship')) return 'NCG';
  return roundName || '';
}

// ── HTTP helper ─────────────────────────────────────────────────────────────
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse failed: ' + e.message)); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Request timed out')));
  });
}

// ── Team name normalisation ─────────────────────────────────────────────────
function normalizeTeam(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/\s+(blue devils|tar heels|wildcats|bulldogs|jayhawks|hoosiers|spartans|wolverines|longhorns|gators|tigers|bears|eagles|hawks|wolves|cardinals|hornets|knights|rams|rebels|patriots|crimson tide|golden eagles|aggies|seminoles|sun devils|mountaineers|razorbacks|hurricanes|demon deacons|orange|boilermakers|buckeyes|hawkeyes|huskers|badgers|illini|gophers|terrapins|nittany lions|big red|commodores|black bears|red storm|friars|flyers|musketeers|blue hose|chanticleers|peacocks|retrievers|grizzlies|rainbow warriors|wolf pack|running rebels|mean green|roadrunners|owls|colonials|phoenix|flames|monarchs|seawolves|zips|penguins|express|minutemen|mastodons|falcons|bison|beavers|ducks|utes|aztecs|lobos|trojans|bruins|anteaters|highlanders|aggies|mustangs|cowboys|horned frogs|raiders|red raiders|bears|cougars|mountaineers|panthers|thunderbirds|lumberjacks|eagles|pirates|hawks|dragons|bears|tigers|lions|eagles|knights|warriors|vikings|vols|volunteers|cavaliers|hokies|yellow jackets|golden tornado|golden flashes|golden griffins|golden panthers|golden rams|golden eagles|golden bears|rainbow warriors|rainbow)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function teamsMatch(ourTeam, espnName) {
  if (!ourTeam || !espnName) return false;
  const a = normalizeTeam(ourTeam);
  const b = normalizeTeam(espnName);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

function findMatchingGame(espnTeam1, espnTeam2, includeCompleted = false) {
  const games = includeCompleted
    ? db.prepare('SELECT * FROM games').all()
    : db.prepare('SELECT * FROM games WHERE is_completed = 0').all();
  for (const game of games) {
    const fwd = teamsMatch(game.team1, espnTeam1) && teamsMatch(game.team2, espnTeam2);
    const rev = teamsMatch(game.team1, espnTeam2) && teamsMatch(game.team2, espnTeam1);
    if (fwd || rev) return { game, flipped: rev };
  }
  return null;
}

function findMatchingPlayer(espnDisplayName) {
  if (!espnDisplayName) return null;
  const norm = espnDisplayName.toLowerCase().trim();
  let p = db.prepare('SELECT * FROM players WHERE LOWER(name) = ?').get(norm);
  if (p) return p;
  const parts = norm.split(' ');
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const rows = db.prepare("SELECT * FROM players WHERE LOWER(name) LIKE ?").all(`%${last}`);
    if (rows.length === 1) return rows[0];
  }
  return null;
}

async function processBoxScore(gameId, summary) {
  // Look up game metadata once — needed for round code and opponent derivation
  const game = db.prepare('SELECT team1, team2, round_name FROM games WHERE id = ?').get(gameId);
  const roundCode = game ? roundNameToCode(game.round_name) : '';
  const playedAt  = new Date().toISOString();

  const byAthleteId = db.prepare("SELECT * FROM players WHERE espn_athlete_id = ? LIMIT 1");

  let playersUpdated = 0;
  const playerGroups = summary.boxscore?.players || [];
  for (const group of playerGroups) {
    const statsBlock = group.statistics?.[0];
    if (!statsBlock) continue;
    const labels = statsBlock.names || statsBlock.labels || [];
    const ptsIdx = labels.indexOf('PTS');
    if (ptsIdx === -1) continue;

    // ESPN tells us which team this group belongs to
    const groupTeamName   = group.team?.displayName || '';
    const groupEspnTeamId = group.team?.id ? String(group.team.id) : '';

    // Derive opponent: the other team in this game
    let opponent = '';
    if (game) {
      opponent = teamsMatch(groupTeamName, game.team1) ? game.team2 : game.team1;
    }

    const athletes = statsBlock.athletes || [];
    for (const entry of athletes) {
      const displayName   = entry.athlete?.displayName || entry.athlete?.shortName;
      const espnAthleteId = entry.athlete?.id ? String(entry.athlete.id) : '';
      const pts = parseInt(entry.stats?.[ptsIdx]) || 0;
      if (!displayName) continue;

      // Match by espn_athlete_id first — most reliable, no team ambiguity.
      // Falls back to name matching with team-ID guard to prevent cross-team
      // contamination (name match only; ID-matched players are always correct).
      let player = espnAthleteId ? byAthleteId.get(espnAthleteId) : null;

      if (!player) {
        player = findMatchingPlayer(displayName);
        if (player && groupEspnTeamId) {
          // String() on both sides: SQLite may store espn_team_id as integer
          const playerTeamId = player.espn_team_id != null ? String(player.espn_team_id) : '';
          if (playerTeamId && playerTeamId !== groupEspnTeamId) {
            console.log(`[stats] skipped "${displayName}" (name-match) — player team=${playerTeamId} ≠ group team=${groupEspnTeamId}`);
            player = null;
          }
        }
      }

      if (!player) continue;

      db.prepare(`
        INSERT INTO player_stats (id, game_id, player_id, points, round, opponent, played_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(game_id, player_id) DO UPDATE SET
          points    = excluded.points,
          round     = COALESCE(NULLIF(player_stats.round,    ''), excluded.round),
          opponent  = COALESCE(NULLIF(player_stats.opponent, ''), excluded.opponent),
          played_at = COALESCE(player_stats.played_at, excluded.played_at)
      `).run(uuidv4(), gameId, player.id, pts, roundCode, opponent, playedAt);
      playersUpdated++;
    }
  }
  return playersUpdated;
}

// ── Re-ingest player_stats for all completed games ───────────────────────────
// Fetches ESPN boxscores by espn_event_id and re-inserts via ON CONFLICT DO
// UPDATE. Safe to run repeatedly — idempotent. Restores stats lost to any
// prior bad DELETE.
//
// Logs per-game: ESPN athlete count, how many matched to DB, how many inserted.
// Called at startup AND on a 30-min interval so games that fail the first time
// are retried automatically.
async function reingestCompletedGames(io) {
  const completedGames = db.prepare(`
    SELECT g.id, g.espn_event_id, g.team1, g.team2, g.game_date,
           (SELECT COUNT(*) FROM player_stats ps WHERE ps.game_id = g.id) AS existing_stat_count
    FROM games g
    WHERE g.is_completed = 1
      AND g.espn_event_id IS NOT NULL AND g.espn_event_id != ''
    ORDER BY g.game_date ASC
  `).all();

  if (!completedGames.length) {
    console.log('[reingest] No completed games with espn_event_id found.');
    return 0;
  }

  console.log(`[reingest] Checking ${completedGames.length} completed game(s)...`);
  let totalInserted = 0;

  for (const game of completedGames) {
    try {
      const summary = await fetchJson(SUMMARY_BASE + game.espn_event_id);

      // Count total ESPN athletes in the boxscore for diagnostics
      let espnAthleteCount = 0;
      let espnIdMatchCount = 0;
      let espnNameMatchCount = 0;
      let espnSkippedCount = 0;

      const playerGroups = summary.boxscore?.players || [];
      for (const group of playerGroups) {
        const statsBlock = group.statistics?.[0];
        if (!statsBlock) continue;
        const labels = statsBlock.names || statsBlock.labels || [];
        if (labels.indexOf('PTS') === -1) continue;
        const groupEspnTeamId = group.team?.id ? String(group.team.id) : '';

        for (const entry of (statsBlock.athletes || [])) {
          if (!entry.athlete?.displayName && !entry.athlete?.shortName) continue;
          espnAthleteCount++;
          const espnAthleteId = entry.athlete?.id ? String(entry.athlete.id) : '';
          const displayName   = entry.athlete?.displayName || entry.athlete?.shortName;

          const byId = espnAthleteId
            ? db.prepare("SELECT id, name, espn_team_id FROM players WHERE espn_athlete_id = ? LIMIT 1").get(espnAthleteId)
            : null;

          if (byId) {
            espnIdMatchCount++;
          } else {
            // Try name match
            const byName = findMatchingPlayer(displayName);
            if (byName) {
              const playerTeamId = byName.espn_team_id != null ? String(byName.espn_team_id) : '';
              if (playerTeamId && groupEspnTeamId && playerTeamId !== groupEspnTeamId) {
                espnSkippedCount++;
                console.log(`[reingest]   SKIP name-match "${displayName}" athlete_id=${espnAthleteId || 'none'} — player team=${playerTeamId} ≠ group team=${groupEspnTeamId}`);
              } else {
                espnNameMatchCount++;
              }
            } else {
              // Log unmatched athletes that ARE in our drafted players (useful for debugging)
              const isDrafted = espnAthleteId
                ? db.prepare("SELECT 1 FROM draft_picks dp JOIN players p ON p.id = dp.player_id WHERE p.espn_athlete_id = ? LIMIT 1").get(espnAthleteId)
                : null;
              if (isDrafted || (!espnAthleteId && db.prepare("SELECT 1 FROM players WHERE LOWER(name) LIKE ? LIMIT 1").get(`%${(displayName || '').split(' ').pop()?.toLowerCase()}%`))) {
                console.log(`[reingest]   NOMATCH "${displayName}" athlete_id=${espnAthleteId || 'none'} team_id=${groupEspnTeamId}`);
              }
            }
          }
        }
      }

      const inserted = await processBoxScore(game.id, summary);
      const afterCount = db.prepare('SELECT COUNT(*) as c FROM player_stats WHERE game_id = ?').get(game.id)?.c ?? 0;

      console.log(`[reingest] ${game.espn_event_id} ${game.team1} vs ${game.team2} (${game.game_date}) — ESPN athletes: ${espnAthleteCount}, id-match: ${espnIdMatchCount}, name-match: ${espnNameMatchCount}, skipped: ${espnSkippedCount}, inserted/updated: ${inserted}, total stats in DB: ${afterCount}`);

      totalInserted += inserted;
      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      console.warn(`[reingest] FAILED event ${game.espn_event_id} (${game.team1} vs ${game.team2}): ${err.message}`);
    }
  }

  console.log(`[reingest] Complete — ${totalInserted} total stat rows inserted/updated across ${completedGames.length} game(s)`);
  if (totalInserted > 0) pushStandingsToLeagues(io);
  return totalInserted;
}

function recordResult(game, winnerTeam, score1, score2) {
  if (game.is_completed) return;
  const loser = winnerTeam === game.team1 ? game.team2 : game.team1;
  db.prepare(`
    UPDATE games SET is_completed = 1, is_live = 0, winner_team = ?, team1_score = ?, team2_score = ? WHERE id = ?
  `).run(winnerTeam, score1, score2, game.id);

  // Eliminate players — try both the ESPN display name and any known alias
  // (e.g. ESPN says "North Carolina State" but DB stores "NC State")
  const loserAlias = TEAM_ALIASES[loser] || null;
  const elimStmt = db.prepare('UPDATE players SET is_eliminated = 1 WHERE team = ?');
  const directChanges = elimStmt.run(loser).changes;
  const aliasChanges  = loserAlias ? elimStmt.run(loserAlias).changes : 0;
  console.log(`[ESPN] Game recorded: ${game.team1} vs ${game.team2} → winner: ${winnerTeam} | eliminated ${directChanges + aliasChanges} player(s)${loserAlias && aliasChanges > 0 ? ` (${aliasChanges} via alias "${loserAlias}")` : ''}`);

  // Will be called with io after this function returns — store loser + alias for caller
  recordResult._lastLoser = loser;
  recordResult._lastLoserAlias = loserAlias;
}

// ── Game metadata from ESPN ──────────────────────────────────────────────────
function parsePeriod(statusType, period) {
  const name = statusType?.name || '';
  if (name === 'STATUS_HALFTIME') return 'Halftime';
  if (name === 'STATUS_FINAL' || statusType?.completed) return 'Final';
  if (name === 'STATUS_IN_PROGRESS') {
    if (period === 1) return '1st Half';
    if (period === 2) return '2nd Half';
    if (period > 2) return `OT${period - 2 > 1 ? period - 2 : ''}`;
  }
  return '';
}

function updateGameMetadata(gameId, event, comp) {
  try {
    const statusType = comp.status?.type;
    const period = comp.status?.period || 0;
    const currentPeriod = parsePeriod(statusType, period);
    const gameClock = (statusType?.name === 'STATUS_IN_PROGRESS')
      ? (comp.status?.displayClock || '')
      : '';

    // Broadcast info
    const broadcasts = comp.broadcasts || [];
    const tvNetwork = broadcasts.flatMap(b => b.names || []).join(', ') || '';

    // Venue
    const venue = comp.venue || {};
    const city = venue.address?.city || '';
    const state = venue.address?.state || '';
    const locationStr = [venue.fullName, city && state ? `${city}, ${state}` : (city || state)]
      .filter(Boolean).join(' — ');

    // Tip-off time (store raw UTC ISO)
    const tipOffTime = event.date || comp.startDate || '';

    db.prepare(`
      UPDATE games SET
        tip_off_time = CASE WHEN tip_off_time = '' OR tip_off_time IS NULL THEN ? ELSE tip_off_time END,
        tv_network   = CASE WHEN tv_network   = '' OR tv_network   IS NULL THEN ? ELSE tv_network   END,
        location     = CASE WHEN location     = '' OR location     IS NULL THEN ? ELSE location     END,
        current_period = ?,
        game_clock     = ?
      WHERE id = ?
    `).run(tipOffTime, tvNetwork, locationStr, currentPeriod, gameClock, gameId);
  } catch (err) {
    console.error('[ESPN] updateGameMetadata error:', err.message);
  }
}

// ── Socket.io push (games feed) ──────────────────────────────────────────────
function pushGamesUpdate(io) {
  if (!io) return;
  try {
    const games = db.prepare(`
      SELECT g.*,
             t1.seed AS team1_seed, t2.seed AS team2_seed
      FROM games g
      LEFT JOIN (SELECT team, MIN(seed) AS seed FROM players GROUP BY team) t1 ON t1.team = g.team1
      LEFT JOIN (SELECT team, MIN(seed) AS seed FROM players GROUP BY team) t2 ON t2.team = g.team2
      ORDER BY g.game_date ASC, g.tip_off_time ASC
    `).all();
    io.to('games_feed').emit('games_update', { games, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[ESPN] pushGamesUpdate error:', err.message);
  }
}

// ── Round-complete standings emails ──────────────────────────────────────────
// Called after each poll. Checks if any round just became fully complete (all
// games in that round are_completed=1, none are is_live). If so, emails every
// active league member their league's standings — once per round per process.
async function maybeEmailRoundStandings() {
  try {
    // Find all distinct round names that have at least one game
    const roundNames = db.prepare(`
      SELECT DISTINCT round_name FROM games
      WHERE round_name IS NOT NULL AND round_name <> ''
    `).all().map(r => r.round_name);

    for (const roundName of roundNames) {
      if (_standingsEmailedRounds.has(roundName)) continue;

      const total = db.prepare(
        'SELECT COUNT(*) AS c FROM games WHERE round_name = ?'
      ).get(roundName)?.c ?? 0;
      const completed = db.prepare(
        'SELECT COUNT(*) AS c FROM games WHERE round_name = ? AND is_completed = 1'
      ).get(roundName)?.c ?? 0;
      const live = db.prepare(
        'SELECT COUNT(*) AS c FROM games WHERE round_name = ? AND is_live = 1'
      ).get(roundName)?.c ?? 0;

      if (total === 0 || completed < total || live > 0) continue;

      // Round is fully complete — mark it and send emails
      _standingsEmailedRounds.add(roundName);
      console.log(`[email] ${roundName} complete — sending standings emails`);

      const leagues = db.prepare("SELECT id, name FROM leagues WHERE status IN ('drafting', 'active')").all();
      for (const league of leagues) {
        try {
          const payload = buildStandings(league.id);
          if (!payload?.standings?.length) continue;

          const members = db.prepare(`
            SELECT lm.user_id, u.email, u.username
            FROM league_members lm
            JOIN users u ON u.id = lm.user_id
            WHERE lm.league_id = ?
          `).all(league.id);

          const standingsList = payload.standings.map(s => ({
            username:     s.username,
            team_name:    s.team_name,
            total_points: s.total_points,
            aliveCount:   s.aliveCount,
            totalPlayers: s.totalPlayers,
          }));

          for (const member of members) {
            if (!member.email) continue;
            sendLeagueStandingsEmail(member.email, {
              username:   member.username,
              leagueName: league.name,
              roundName,
              standings:  standingsList,
              leagueId:   league.id,
            }).catch(err => console.error(`[email] Standings email failed for ${member.email}:`, err.message));
          }
        } catch (err) {
          console.error(`[email] Standings email error for league ${league.id}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[email] maybeEmailRoundStandings error:', err.message);
  }
}

// ── Socket.io push ───────────────────────────────────────────────────────────
function pushStandingsToLeagues(io) {
  if (!io) return;
  const leagues = db.prepare("SELECT id FROM leagues WHERE status IN ('drafting', 'active')").all();
  for (const { id } of leagues) {
    try {
      const payload = buildStandings(id);
      if (payload) {
        checkAndPostRankChanges(id, payload.standings, io);
        io.to(`leaderboard_${id}`).emit('standings_update', {
          ...payload,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`[ESPN] Push failed for league ${id}:`, err.message);
    }
  }
}

// ── Schedule seeder ──────────────────────────────────────────────────────────
// Fetches all tournament dates from ESPN scoreboard and upserts game rows
// including scheduled (future) games. Safe to run repeatedly — idempotent.
function parseRoundName(headline) {
  const h = (headline || '').toLowerCase();
  if (h.includes('first four'))                               return 'First Four';
  if (h.includes('first round')  || h.includes('round of 64')) return 'First Round';
  if (h.includes('second round') || h.includes('round of 32')) return 'Second Round';
  if (h.includes('sweet 16') || h.includes('sweet sixteen') || h.includes('round of 16')) return 'Sweet 16';
  if (h.includes('elite 8')  || h.includes('elite eight')   || h.includes('round of 8'))  return 'Elite 8';
  if (h.includes('final four') || h.includes('round of 4'))  return 'Final Four';
  if (h.includes('national championship') || h.includes('championship game') || h.includes('round of 2')) return 'Championship';
  return '';  // empty = unknown; don't overwrite an existing value with a wrong guess
}

function parseRegion(headline) {
  const m = (headline || '').match(/[-–]\s*(\w+)\s+Region/i);
  return m ? m[1] : '';
}

async function pullSchedule(io) {
  console.log('[schedule] Pulling full tournament schedule from ESPN...');
  let inserted = 0, updated = 0;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  for (const date of TOURNAMENT_DATES) {
    let data;
    try {
      data = await fetchJson(SCHEDULE_URL(date));
    } catch (err) {
      console.warn(`[schedule] Failed to fetch date ${date}:`, err.message);
      continue;
    }
    await sleep(150);

    for (const event of (data.events || [])) {
      const comp = event.competitions?.[0];
      if (!comp) continue;

      const c0 = comp.competitors?.[0];
      const c1 = comp.competitors?.[1];
      if (!c0?.team || !c1?.team) continue;

      const team1Name = c0.team.displayName;
      const team2Name = c1.team.displayName;
      if (!team1Name || !team2Name) continue;
      if (team1Name.toLowerCase().includes('tbd') || team2Name.toLowerCase().includes('tbd')) continue;

      const espnEventId = event.id;
      const gameDate    = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`;
      const tipOffTime  = event.date || '';

      const note        = comp.notes?.[0]?.headline || '';
      const roundName   = parseRoundName(note);
      const region      = parseRegion(note);

      const broadcasts  = comp.broadcasts || [];
      const tvNetwork   = broadcasts.flatMap(b => b.names || []).join(', ');

      const venue   = comp.venue || {};
      const city    = venue.address?.city || '';
      const state   = venue.address?.state || '';
      const location = [venue.fullName, city && state ? `${city}, ${state}` : (city || state)]
        .filter(Boolean).join(' — ');

      const statusType  = comp.status?.type;
      const isCompleted = statusType?.completed === true;
      const score1      = isCompleted ? (parseInt(c0.score) || 0) : 0;
      const score2      = isCompleted ? (parseInt(c1.score) || 0) : 0;
      const winnerName  = isCompleted ? (score1 >= score2 ? team1Name : team2Name) : '';

      // Try to find an existing game by espn_event_id first, then by name matching
      const byId = db.prepare('SELECT * FROM games WHERE espn_event_id = ?').get(espnEventId);
      if (byId) {
        // Update metadata only — don't clobber scores already set by the poller.
        // round_name: use ESPN value when it's non-empty AND more specific than 'First Round'
        // (generate-bracket hardcodes 'First Round' for all games; ESPN is authoritative here).
        db.prepare(`
          UPDATE games SET
            game_date    = COALESCE(NULLIF(game_date,  ''), ?),
            round_name   = CASE WHEN ? <> '' AND ? <> 'First Round' THEN ? ELSE COALESCE(NULLIF(round_name, ''), ?) END,
            tip_off_time = COALESCE(NULLIF(tip_off_time, ''), ?),
            tv_network   = COALESCE(NULLIF(tv_network,  ''), ?),
            location     = COALESCE(NULLIF(location,    ''), ?),
            region       = COALESCE(NULLIF(region,      ''), ?)
          WHERE espn_event_id = ?
        `).run(gameDate, roundName, roundName, roundName, roundName, tipOffTime, tvNetwork, location, region, espnEventId);
        updated++;
        continue;
      }

      // Try name-matching against existing rows (e.g. ones created by schedule/generate)
      const nameMatch = findMatchingGame(team1Name, team2Name, true);
      if (nameMatch) {
        db.prepare(`
          UPDATE games SET
            espn_event_id = COALESCE(NULLIF(espn_event_id, ''), ?),
            game_date     = COALESCE(NULLIF(game_date,  ''), ?),
            round_name    = CASE WHEN ? <> '' AND ? <> 'First Round' THEN ? ELSE COALESCE(NULLIF(round_name, ''), ?) END,
            tip_off_time  = COALESCE(NULLIF(tip_off_time, ''), ?),
            tv_network    = COALESCE(NULLIF(tv_network,  ''), ?),
            location      = COALESCE(NULLIF(location,    ''), ?),
            region        = COALESCE(NULLIF(region,      ''), ?)
          WHERE id = ?
        `).run(espnEventId, gameDate, roundName, roundName, roundName, roundName, tipOffTime, tvNetwork, location, region, nameMatch.game.id);
        updated++;
        continue;
      }

      // New game — insert it
      db.prepare(`
        INSERT INTO games
          (id, espn_event_id, game_date, round_name, team1, team2,
           tip_off_time, tv_network, location, region,
           is_completed, winner_team, team1_score, team2_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(), espnEventId, gameDate, roundName, team1Name, team2Name,
        tipOffTime, tvNetwork, location, region,
        isCompleted ? 1 : 0, winnerName, score1, score2
      );
      inserted++;
    }
  }

  console.log(`[schedule] Done — ${inserted} inserted, ${updated} updated`);
  if (io) pushGamesUpdate(io);
  return { inserted, updated };
}

// ── Main poll ────────────────────────────────────────────────────────────────
async function pollESPN(io) {
  const ts = new Date().toISOString();
  const stats = { gamesChecked: 0, scoresUpdated: 0, eliminationsRecorded: 0 };

  // Throws on fatal error so startSmartPoller can apply the back-off delay
  const data = await fetchJson(SCOREBOARD_URL);
  const events = data.events || [];

  // Track which game IDs are currently in-progress
  const nowLiveGameIds = new Set();

  for (const event of events) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    stats.gamesChecked++;

    const statusType  = comp.status?.type;
    const isCompleted = statusType?.completed === true;
    const statusName  = statusType?.name || '';
    const isInProgress = statusName === 'STATUS_IN_PROGRESS' || statusName === 'STATUS_HALFTIME';

    const espnTeam1 = comp.competitors?.[0]?.team?.displayName;
    const espnTeam2 = comp.competitors?.[1]?.team?.displayName;
    const score1 = parseInt(comp.competitors?.[0]?.score) || 0;
    const score2 = parseInt(comp.competitors?.[1]?.score) || 0;

    // Prefer espn_event_id lookup (exact, no string matching) over name fuzzy matching.
    // The schedule sync stores espn_event_id once it links an ESPN event to a DB game,
    // so this covers the majority of cases reliably.
    const byEspnId = db.prepare('SELECT * FROM games WHERE espn_event_id = ?').get(event.id);
    const nameMatch = byEspnId ? null : findMatchingGame(espnTeam1, espnTeam2, true);
    const metaGame = byEspnId || nameMatch?.game || null;

    // Always update game metadata (tip-off time, TV, location, period, clock)
    if (metaGame) updateGameMetadata(metaGame.id, event, comp);

    // Skip box score fetch for games not yet active
    if (!isInProgress && !isCompleted) continue;

    // Resolve game + flipped for scoring
    let game, flipped;
    if (byEspnId) {
      game = byEspnId;
      // Determine if ESPN's competitor order is reversed relative to our DB
      flipped = !teamsMatch(game.team1, espnTeam1);
    } else {
      const liveMatch = findMatchingGame(espnTeam1, espnTeam2);
      if (!liveMatch) {
        console.log(`[ESPN ${ts}] No DB match for "${espnTeam1}" vs "${espnTeam2}" (espn_id=${event.id}) — is_live will NOT be set`);
        continue;
      }
      game = liveMatch.game;
      flipped = liveMatch.flipped;
    }

    if (isInProgress) {
      nowLiveGameIds.add(game.id);
      const s1 = flipped ? score2 : score1;
      const s2 = flipped ? score1 : score2;
      db.prepare('UPDATE games SET is_live = 1, team1_score = ?, team2_score = ? WHERE id = ?').run(s1, s2, game.id);
    }

    try {
      const summary = await fetchJson(SUMMARY_BASE + event.id);
      const updated = await processBoxScore(game.id, summary);
      stats.scoresUpdated += updated;

      if (isCompleted) {
        const winnerTeam = flipped
          ? (score2 > score1 ? game.team1 : game.team2)
          : (score1 > score2 ? game.team1 : game.team2);
        recordResult(game, winnerTeam, flipped ? score2 : score1, flipped ? score1 : score2);
        if (recordResult._lastLoser) {
          const loserNames = [recordResult._lastLoser, recordResult._lastLoserAlias].filter(Boolean);
          postEliminations(loserNames, io);
          recordResult._lastLoser = null;
          recordResult._lastLoserAlias = null;
          stats.eliminationsRecorded++;
        }
      }
    } catch (err) {
      console.error(`[ESPN ${ts}] Error processing event ${event.id}: ${err.message}`);
    }
  }

  // Clear is_live for games no longer in-progress
  for (const { id } of db.prepare('SELECT id FROM games WHERE is_live = 1').all()) {
    if (!nowLiveGameIds.has(id)) {
      db.prepare("UPDATE games SET is_live = 0, current_period = 'Final', game_clock = '' WHERE id = ?").run(id);
    }
  }

  if (stats.scoresUpdated > 0) pushStandingsToLeagues(io);
  pushGamesUpdate(io);
  if (stats.eliminationsRecorded > 0) maybeEmailRoundStandings();

  console.log(
    `[ESPN ${ts}] games=${stats.gamesChecked} scores=${stats.scoresUpdated} elims=${stats.eliminationsRecorded}`
  );
  return stats;
}

// ── Smart poller ─────────────────────────────────────────────────────────────
let _pollerTimeout = null;

function startSmartPoller(io) {
  async function tick() {
    let delay;
    try {
      await pollESPN(io);
      delay = getPollingInterval();
    } catch (err) {
      // ESPN returned an error or rate-limited — back off 5 min before retrying
      console.error(`[ESPN] Poll failed, backing off 5 min: ${err.message}`);
      delay = 5 * 60 * 1000;
    }

    if (delay === null) {
      console.log('[ESPN] Tournament over (Apr 7 11:59 PM ET passed) — poller stopped.');
      return;
    }

    const mins = (delay / 60000).toFixed(0);
    console.log(`[ESPN] Next poll in ${mins} min`);
    _pollerTimeout = setTimeout(tick, delay);
  }

  // Initial poll after 15s (let bracket pull finish first)
  _pollerTimeout = setTimeout(tick, 15 * 1000);
}

module.exports = { pollESPN, startSmartPoller, pullSchedule, reingestCompletedGames };
