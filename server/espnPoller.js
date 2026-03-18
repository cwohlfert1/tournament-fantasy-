const https = require('https');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { buildStandings } = require('./standingsBuilder');
const { postEliminations, checkAndPostRankChanges } = require('./wallUtils');

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
const SUMMARY_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=';

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

  let playersUpdated = 0;
  const playerGroups = summary.boxscore?.players || [];
  for (const group of playerGroups) {
    const statsBlock = group.statistics?.[0];
    if (!statsBlock) continue;
    const labels = statsBlock.names || statsBlock.labels || [];
    const ptsIdx = labels.indexOf('PTS');
    if (ptsIdx === -1) continue;

    // ESPN tells us which team this group belongs to
    const groupTeamName = group.team?.displayName || '';

    // Derive opponent: the other team in this game
    let opponent = '';
    if (game) {
      opponent = teamsMatch(groupTeamName, game.team1) ? game.team2 : game.team1;
    }

    const athletes = statsBlock.athletes || [];
    for (const entry of athletes) {
      const displayName = entry.athlete?.displayName || entry.athlete?.shortName;
      const pts = parseInt(entry.stats?.[ptsIdx]) || 0;
      if (!displayName) continue;
      const player = findMatchingPlayer(displayName);
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

function recordResult(game, winnerTeam, score1, score2) {
  if (game.is_completed) return;
  const loser = winnerTeam === game.team1 ? game.team2 : game.team1;
  db.prepare(`
    UPDATE games SET is_completed = 1, is_live = 0, winner_team = ?, team1_score = ?, team2_score = ? WHERE id = ?
  `).run(winnerTeam, score1, score2, game.id);
  db.prepare('UPDATE players SET is_eliminated = 1 WHERE team = ?').run(loser);
  console.log(`[ESPN] Game recorded: ${game.team1} vs ${game.team2} → winner: ${winnerTeam}`);
  // Will be called with io after this function returns — store loser for caller
  recordResult._lastLoser = loser;
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
  if (h.includes('first four'))            return 'First Four';
  if (h.includes('first round'))           return 'First Round';
  if (h.includes('second round'))          return 'Second Round';
  if (h.includes('sweet 16') || h.includes('sweet sixteen')) return 'Sweet 16';
  if (h.includes('elite 8') || h.includes('elite eight'))    return 'Elite 8';
  if (h.includes('final four'))            return 'Final Four';
  if (h.includes('national championship') || h.includes('championship game')) return 'Championship';
  return 'First Round';
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
        // Update metadata only — don't clobber scores already set by the poller
        db.prepare(`
          UPDATE games SET
            game_date    = COALESCE(NULLIF(game_date,  ''), ?),
            round_name   = COALESCE(NULLIF(round_name, ''), ?),
            tip_off_time = COALESCE(NULLIF(tip_off_time, ''), ?),
            tv_network   = COALESCE(NULLIF(tv_network,  ''), ?),
            location     = COALESCE(NULLIF(location,    ''), ?),
            region       = COALESCE(NULLIF(region,      ''), ?)
          WHERE espn_event_id = ?
        `).run(gameDate, roundName, tipOffTime, tvNetwork, location, region, espnEventId);
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
            round_name    = COALESCE(NULLIF(round_name, ''), ?),
            tip_off_time  = COALESCE(NULLIF(tip_off_time, ''), ?),
            tv_network    = COALESCE(NULLIF(tv_network,  ''), ?),
            location      = COALESCE(NULLIF(location,    ''), ?),
            region        = COALESCE(NULLIF(region,      ''), ?)
          WHERE id = ?
        `).run(espnEventId, gameDate, roundName, tipOffTime, tvNetwork, location, region, nameMatch.game.id);
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
          postEliminations(recordResult._lastLoser, io);
          recordResult._lastLoser = null;
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

module.exports = { pollESPN, startSmartPoller, pullSchedule };
