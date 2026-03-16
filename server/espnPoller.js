const https = require('https');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { buildStandings } = require('./standingsBuilder');
const { postEliminations, checkAndPostRankChanges } = require('./wallUtils');

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
const SUMMARY_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=';

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

function findMatchingGame(espnTeam1, espnTeam2) {
  const games = db.prepare('SELECT * FROM games WHERE is_completed = 0').all();
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

      if (!isInProgress && !isCompleted) continue;

      const espnTeam1 = comp.competitors?.[0]?.team?.displayName;
      const espnTeam2 = comp.competitors?.[1]?.team?.displayName;
      const score1 = parseInt(comp.competitors?.[0]?.score) || 0;
      const score2 = parseInt(comp.competitors?.[1]?.score) || 0;

      const match = findMatchingGame(espnTeam1, espnTeam2);
      if (!match) continue;

      const { game, flipped } = match;

      if (isInProgress) {
        nowLiveGameIds.add(game.id);
        // Mark game as live
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
        db.prepare('UPDATE games SET is_live = 0 WHERE id = ?').run(id);
      }
    }

    if (processed > 0) {
      // Push updated standings to all leaderboard clients
      pushStandingsToLeagues(io);
      console.log(`[ESPN] Updated stats for ${processed} game(s), standings pushed.`);
    } else {
      console.log('[ESPN] No matching in-progress/completed games found.');
    }
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

module.exports = { pollESPN, startSmartPoller };
