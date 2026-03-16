/**
 * bracketPoller.js
 *
 * Pulls the real 2026 NCAA tournament bracket from ESPN's postseason scoreboard,
 * then fetches each team's roster and player season PPG.
 *
 * Bracket source:  ESPN postseason scoreboard, seasontype=3, groups=100
 * Roster source:   site.api.espn.com teams/{id}/roster
 * Stats source:    sports.core.api.espn.com athlete statistics
 *
 * SAFETY RULE: this file must NEVER touch the draft_picks table.
 * draft_picks is user data. The players table is a reference/catalog table.
 * Refreshing player data preserves all existing player UUIDs by keying on
 * espn_athlete_id, so draft_picks.player_id foreign keys remain valid.
 */

const https = require('https');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

// ── Tournament dates (First Four + First Round) ───────────────────────────────
const BRACKET_DATES = ['20260318', '20260319', '20260320', '20260321'];
const SCOREBOARD    = date =>
  `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?dates=${date}&groups=100&seasontype=3&limit=100`;
const ROSTER_URL    = id =>
  `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${id}/roster`;
const PLAYER_STATS  = athleteId =>
  `https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/seasons/2026/types/2/athletes/${athleteId}/statistics/0`;

// ── Utilities ─────────────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15000 }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error(`JSON parse error (${url.slice(-60)}): ${e.message}`)); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error(`Timeout: ${url.slice(-60)}`)));
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function extractRegion(headline) {
  // "NCAA Men's Basketball Championship - Midwest Region - 1st Round"
  const m = (headline || '').match(/[-–]\s*(\w+)\s+Region\s*[-–]/i);
  return m ? m[1] : null;
}

// ── Step 1 — Collect all 68 teams from postseason scoreboard ─────────────────

async function fetchBracketTeams() {
  const teams = new Map(); // teamId → { teamId, teamName, abbrev, logoUrl, seed, region, isFirstFour }
  const firstFourTeamIds = new Set();

  for (const date of BRACKET_DATES) {
    let data;
    try {
      data = await fetchJson(SCOREBOARD(date));
    } catch (err) {
      console.warn(`[bracket] Scoreboard fetch failed for ${date}:`, err.message);
      continue;
    }

    const isFirstFourDate = date === '20260318';

    for (const event of (data.events || [])) {
      const comp   = event.competitions?.[0];
      const note   = comp?.notes?.[0]?.headline || '';
      const region = extractRegion(note);

      for (const competitor of (comp?.competitors || [])) {
        const team = competitor.team;
        const seed = competitor.curatedRank?.current;

        // Skip TBD / placeholder slots
        if (!team?.id || !team.displayName || seed === 99 || seed == null) continue;

        if (isFirstFourDate) firstFourTeamIds.add(team.id);

        if (!teams.has(team.id)) {
          teams.set(team.id, {
            teamId:   team.id,
            teamName: team.displayName,
            abbrev:   team.abbreviation || '',
            logoUrl:  `https://a.espncdn.com/i/teamlogos/ncaa/500/${team.id}.png`,
            seed,
            region,
          });
        }
      }
    }
    console.log(`[bracket] ${date}: ${teams.size} teams collected so far`);
  }

  // Mark First Four teams
  for (const [id, team] of teams) {
    team.isFirstFour = firstFourTeamIds.has(id);
  }

  return [...teams.values()];
}

// ── Step 2 — Fetch roster player IDs for a team ───────────────────────────────

async function fetchRoster(teamId, teamName) {
  try {
    const data    = await fetchJson(ROSTER_URL(teamId));
    const athletes = data.athletes || [];
    return athletes
      .filter(p => p.id && (p.displayName || p.fullName))
      .map(p => ({
        athleteId: p.id,
        name:      p.displayName || p.fullName,
        position:  p.position?.abbreviation || p.position?.name || '',
        jersey:    p.jersey || '',
      }));
  } catch (err) {
    console.warn(`[bracket] Roster failed for ${teamName}:`, err.message);
    return [];
  }
}

// ── Step 3 — Fetch a single player's season PPG ───────────────────────────────

async function fetchPPG(athleteId) {
  try {
    const data  = await fetchJson(PLAYER_STATS(athleteId));
    const cats  = data.splits?.categories || [];
    const off   = cats.find(c => c.name === 'offensive');
    if (!off) return 0;
    const stat  = (off.stats || []).find(s => s.abbreviation === 'PPG' || s.name === 'avgPoints');
    return parseFloat(stat?.value) || 0;
  } catch {
    return 0;
  }
}

// ── Step 4 — Upsert players: preserve existing UUIDs, never touch draft_picks ─
//
// Uses espn_athlete_id as the stable natural key.
// If a player already exists (matched by espn_athlete_id):  UPDATE their stats.
// If they are new: INSERT with a fresh UUID.
// This means draft_picks.player_id foreign keys are never broken across refreshes.

const findByAthleteId = db.prepare(
  'SELECT id FROM players WHERE espn_athlete_id = ? LIMIT 1'
);
const insertPlayer = db.prepare(`
  INSERT INTO players
    (id, name, team, position, jersey_number, seed, region, season_ppg, espn_team_id, espn_athlete_id, is_first_four)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const updatePlayer = db.prepare(`
  UPDATE players
  SET name=?, team=?, position=?, jersey_number=?, seed=?, region=?,
      season_ppg=?, espn_team_id=?, is_first_four=?
  WHERE espn_athlete_id=?
`);

function upsertPlayers(players) {
  let upserted = 0;
  db.transaction(() => {
    for (const p of players) {
      const athleteId = p.athleteId || '';
      const existing  = athleteId ? findByAthleteId.get(athleteId) : null;
      if (existing) {
        updatePlayer.run(
          p.name, p.team, p.position, p.jersey,
          p.seed, p.region, p.ppg, p.teamId,
          p.isFirstFour ? 1 : 0,
          athleteId
        );
      } else {
        insertPlayer.run(
          uuidv4(), p.name, p.team, p.position, p.jersey,
          p.seed, p.region, p.ppg, p.teamId,
          athleteId, p.isFirstFour ? 1 : 0
        );
      }
      upserted++;
    }
  })();
  return upserted;
}

// ── Main export ───────────────────────────────────────────────────────────────

async function pullBracket() {
  console.log('[bracket] ── Starting ESPN bracket + roster pull ──');
  const startTime = Date.now();

  // 1. Get all 68 teams
  const teams = await fetchBracketTeams();
  if (!teams.length) {
    console.error('[bracket] No teams found — aborting');
    return { success: false, error: 'No teams found in ESPN bracket' };
  }

  // Log bracket summary
  const byRegion = {};
  for (const t of teams) {
    const r = t.region || 'Unknown';
    if (!byRegion[r]) byRegion[r] = [];
    byRegion[r].push(`${t.seed}-${t.abbrev || t.teamName}`);
  }
  for (const [r, list] of Object.entries(byRegion)) {
    list.sort((a, b) => parseInt(a) - parseInt(b));
    console.log(`[bracket]   ${r} (${list.length}): ${list.join(', ')}`);
  }

  // 2. NOTE: we do NOT clear any tables here.
  //    Players are upserted by espn_athlete_id (see upsertPlayers).
  //    draft_picks is NEVER touched — it contains user data.
  const picksBefore = db.prepare('SELECT COUNT(*) as cnt FROM draft_picks').get().cnt;
  console.log(`[bracket] Players reference table refresh starting (draft_picks preserved: ${picksBefore} picks)`);

  let totalUpserted = 0, teamsProcessed = 0;
  const seenAthleteIds = new Set(); // track all athlete IDs in this pull

  // 3. For each team: fetch roster → fetch PPG per player → upsert top 8
  for (const team of teams) {
    const { teamId, teamName, seed, region } = team;

    await sleep(200); // polite delay between teams
    const rosterPlayers = await fetchRoster(teamId, teamName);

    if (!rosterPlayers.length) {
      console.warn(`[bracket]   ${teamName}: empty roster, skipping`);
      continue;
    }

    // Fetch PPG for each player sequentially
    const enriched = [];
    for (const player of rosterPlayers) {
      await sleep(80);
      const ppg = await fetchPPG(player.athleteId);
      enriched.push({ ...player, ppg, team: teamName, seed, region, teamId, isFirstFour: team.isFirstFour });
    }

    // Sort by PPG descending, keep top 8 with at least some scoring
    enriched.sort((a, b) => b.ppg - a.ppg);
    const top8 = enriched.filter(p => p.ppg > 0).slice(0, 8);

    if (!top8.length) {
      console.warn(`[bracket]   ${teamName}: no players with PPG data, skipping`);
      continue;
    }

    top8.forEach(p => p.athleteId && seenAthleteIds.add(p.athleteId));
    const upserted = upsertPlayers(top8);
    totalUpserted += upserted;
    teamsProcessed++;

    const ppgLine = top8.map(p => `${p.name} (${p.ppg})`).join(', ');
    console.log(`[bracket]   ✓ ${teamName} [${region || '?'} ${seed}]: ${ppgLine}`);
  }

  // 4. Remove players that were NOT in this pull AND have no draft picks.
  //    Players with picks are kept even if ESPN no longer lists them.
  if (seenAthleteIds.size > 0) {
    const placeholders = [...seenAthleteIds].map(() => '?').join(',');
    const removed = db.prepare(`
      DELETE FROM players
      WHERE espn_athlete_id NOT IN (${placeholders})
        AND id NOT IN (SELECT DISTINCT player_id FROM draft_picks)
    `).run(...seenAthleteIds);
    if (removed.changes > 0) {
      console.log(`[bracket] Removed ${removed.changes} stale player(s) not in current bracket (none had draft picks)`);
    }
  }

  const picksAfter  = db.prepare('SELECT COUNT(*) as cnt FROM draft_picks').get().cnt;
  const finalCount  = db.prepare('SELECT COUNT(*) as c FROM players').get().c;
  const finalTeams  = db.prepare('SELECT COUNT(DISTINCT team) as c FROM players').get().c;
  const elapsed     = ((Date.now() - startTime) / 1000).toFixed(1);

  // Guard: draft_picks must never change during a bracket pull
  if (picksAfter !== picksBefore) {
    console.error(`[bracket] CRITICAL: draft_picks count changed from ${picksBefore} to ${picksAfter} — this should never happen!`);
  } else {
    console.log(`[bracket] Players reference table updated (draft picks preserved: ${picksAfter} picks)`);
  }

  console.log(`[bracket] ── Pull complete in ${elapsed}s ──`);
  console.log(`[bracket]   Teams in bracket: ${teams.length} | Teams with data: ${finalTeams} | Players upserted: ${finalCount}`);

  return {
    success:         true,
    teamsFound:      teams.length,
    teamsProcessed,
    playersUpserted: totalUpserted,
    elapsed:         `${elapsed}s`,
  };
}

module.exports = { pullBracket };
