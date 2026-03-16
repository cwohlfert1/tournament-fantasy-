const https = require('https');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { buildStandings } = require('./standingsBuilder');
const { postEliminations, checkAndPostRankChanges } = require('./wallUtils');

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
const SUMMARY_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=';

// All 2026 NCAA tournament dates (First Four through Championship)
const TOURNAMENT_DATES = [
  '20260318','20260319','20260320','20260321','20260322',
  '20260326','20260327','20260328','20260329',
  '20260404','20260406',
];

const SCHEDULE_URL = date =>
  `${SCOREBOARD_URL}?dates=${date}&groups=100&seasontype=3&limit=100`;

// ── Live-window detection ────────────────────────────────────────────────────
// Active game windows: Thu–Sun, 12:00 PM – 11:00 PM Eastern
function isLiveWindow() {
  const now = new Date();
  // Get current ET time
  const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etString);
  const day = et.getDay(); // 0=Sun,1=Mon,...,4=Thu,5=Fri,6=Sat
  const hour = et.getHours();
  const isWeekend = day === 0 || day === 4 || day === 5 || day === 6; // Thu-Sun
  return isWeekend && hour >= 12 && hour < 23;
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
  const playerGroups = summary.boxscore?.players || [];
  for (const group of playerGroups) {
    const statsBlock = group.statistics?.[0];
    if (!statsBlock) continue;
    const labels = statsBlock.names || statsBlock.labels || [];
    const ptsIdx = labels.indexOf('PTS');
    if (ptsIdx === -1) continue;
    const athletes = statsBlock.athletes || [];
    for (const entry of athletes) {
      const displayName = entry.athlete?.displayName || entry.athlete?.shortName;
      const pts = parseInt(entry.stats?.[ptsIdx]) || 0;
      if (!displayName) continue;
      const player = findMatchingPlayer(displayName);
      if (!player) continue;
      db.prepare(`
        INSERT INTO player_stats (id, game_id, player_id, points)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(game_id, player_id) DO UPDATE SET points = excluded.points
      `).run(uuidv4(), gameId, player.id, pts);
    }
  }
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
  try {
    console.log('[ESPN] Polling scoreboard...');
    const data = await fetchJson(SCOREBOARD_URL);
    const events = data.events || [];

    // Track which game IDs are currently in-progress
    const nowLiveGameIds = new Set();

    let processed = 0;
    for (const event of events) {
      const comp = event.competitions?.[0];
      if (!comp) continue;

      const statusType = comp.status?.type;
      const isCompleted = statusType?.completed === true;
      const statusName = statusType?.name || '';
      const isInProgress = statusName === 'STATUS_IN_PROGRESS' || statusName === 'STATUS_HALFTIME';
      const isScheduled = statusName === 'STATUS_SCHEDULED';

      const espnTeam1 = comp.competitors?.[0]?.team?.displayName;
      const espnTeam2 = comp.competitors?.[1]?.team?.displayName;
      const score1 = parseInt(comp.competitors?.[0]?.score) || 0;
      const score2 = parseInt(comp.competitors?.[1]?.score) || 0;

      // Match against all games (including completed) for metadata updates
      const metaMatch = findMatchingGame(espnTeam1, espnTeam2, true);
      if (metaMatch) {
        updateGameMetadata(metaMatch.game.id, event, comp);
      }

      // Skip score processing for games not in-progress or completed
      if (!isInProgress && !isCompleted) continue;

      const match = findMatchingGame(espnTeam1, espnTeam2);
      if (!match) continue;

      const { game, flipped } = match;

      if (isInProgress) {
        nowLiveGameIds.add(game.id);
        db.prepare('UPDATE games SET is_live = 1 WHERE id = ?').run(game.id);
      }

      try {
        const summary = await fetchJson(SUMMARY_BASE + event.id);
        await processBoxScore(game.id, summary);
        processed++;

        if (isCompleted) {
          let winnerTeam;
          if (flipped) {
            winnerTeam = score2 > score1 ? game.team1 : game.team2;
          } else {
            winnerTeam = score1 > score2 ? game.team1 : game.team2;
          }
          recordResult(game, winnerTeam, flipped ? score2 : score1, flipped ? score1 : score2);
          if (recordResult._lastLoser) {
            postEliminations(recordResult._lastLoser, io);
            recordResult._lastLoser = null;
          }
        }
      } catch (err) {
        console.error(`[ESPN] Error processing event ${event.id}:`, err.message);
      }
    }

    // Clear is_live for any games that are no longer in-progress
    const allLiveGames = db.prepare('SELECT id FROM games WHERE is_live = 1').all();
    for (const { id } of allLiveGames) {
      if (!nowLiveGameIds.has(id)) {
        db.prepare('UPDATE games SET is_live = 0, current_period = \'Final\', game_clock = \'\' WHERE id = ?').run(id);
      }
    }

    if (processed > 0) {
      pushStandingsToLeagues(io);
      console.log(`[ESPN] Updated stats for ${processed} game(s), standings pushed.`);
    } else {
      console.log('[ESPN] No matching in-progress/completed games found.');
    }

    // Always push games update so the Games page reflects metadata + live status
    pushGamesUpdate(io);
  } catch (err) {
    console.error('[ESPN poller] Fatal error:', err.message);
  }
}

// ── Smart poller ─────────────────────────────────────────────────────────────
// 2-min intervals during live window (Thu-Sun 12PM-11PM ET), 30-min otherwise.
let _pollerTimeout = null;

function startSmartPoller(io) {
  async function tick() {
    await pollESPN(io);
    const delay = isLiveWindow() ? 2 * 60 * 1000 : 30 * 60 * 1000;
    console.log(`[ESPN] Next poll in ${delay / 60000} min (live window: ${isLiveWindow()})`);
    _pollerTimeout = setTimeout(tick, delay);
  }

  // Initial poll after 15s (let bracket pull finish first)
  _pollerTimeout = setTimeout(tick, 15 * 1000);
}

module.exports = { pollESPN, startSmartPoller, pullSchedule };
