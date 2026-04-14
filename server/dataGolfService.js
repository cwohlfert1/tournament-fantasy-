/**
 * DataGolf Scratch Plus API integration
 * https://datagolf.com/api-access
 *
 * Rate limit: 45 req/min. We conservatively space requests 1.5s apart (~40/min).
 * All endpoints need ?key=DATAGOLF_API_KEY appended.
 */

const https   = require('https');
const db      = require('./db/index');
const { v4: uuidv4 } = require('uuid');

const BASE = 'https://feeds.datagolf.com';

// ── Country code normalization ─────────────────────────────────────────────────
// DataGolf uses a mix of ISO alpha-2, ISO alpha-3, and custom abbreviations.
// Maps anything we'll see → 2-letter ISO.
const DG_COUNTRY_MAP = {
  // UK nations → GB
  ENG: 'GB', SCO: 'GB', WAL: 'GB', NIR: 'GB',
  // Standard ISO alpha-3
  USA: 'US', CAN: 'CA', MEX: 'MX', AUS: 'AU', NZL: 'NZ',
  GBR: 'GB', IRL: 'IE', GER: 'DE', FRA: 'FR', SPA: 'ES',
  ITA: 'IT', BEL: 'BE', NED: 'NL', SWE: 'SE', NOR: 'NO',
  DEN: 'DK', FIN: 'FI', AUT: 'AT', SUI: 'CH', POR: 'PT',
  GRE: 'GR', RSA: 'ZA', ZIM: 'ZW', KEN: 'KE',
  JPN: 'JP', KOR: 'KR', CHN: 'CN', TPE: 'TW', IND: 'IN',
  THA: 'TH', PHI: 'PH', MAS: 'MY', INA: 'ID', SGP: 'SG',
  ARG: 'AR', COL: 'CO', BRA: 'BR', CHI: 'CL', PAR: 'PY',
  URU: 'UY', VEN: 'VE', PUR: 'PR', BAH: 'BS',
  FIJ: 'FJ', PNG: 'PG', SLO: 'SI', CZE: 'CZ', SVK: 'SK',
  HUN: 'HU', POL: 'PL', ROM: 'RO', TUR: 'TR',
};

function normalizeCountry(code) {
  if (!code) return null;
  const c = String(code).toUpperCase().trim();
  if (c.length === 2) return c; // already ISO-2
  return DG_COUNTRY_MAP[c] || null;
}

// ── 1-hour in-memory cache ─────────────────────────────────────────────────────
const _dgCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
function _cacheGet(key) {
  const e = _dgCache.get(key);
  return (e && Date.now() < e.expiresAt) ? e.data : null;
}
function _cacheSet(key, data) {
  _dgCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

// ── Rate limiter ───────────────────────────────────────────────────────────────
let _lastReq = 0;
async function throttle() {
  const gap = 1500; // 1.5s between requests ≈ 40 req/min (under 45 limit)
  const wait = Math.max(0, _lastReq + gap - Date.now());
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastReq = Date.now();
}

// ── HTTP fetch ─────────────────────────────────────────────────────────────────
function fetchJson(path) {
  return new Promise(async (resolve, reject) => {
    await throttle();
    const key = process.env.DATAGOLF_API_KEY;
    if (!key) { reject(new Error('DATAGOLF_API_KEY not set')); return; }
    const sep = path.includes('?') ? '&' : '?';
    const url = `${BASE}${path}${sep}key=${key}`;
    const req = https.get(url, {
      headers: { 'User-Agent': 'TourneyRun/1.0', Accept: 'application/json' },
      timeout: 20000,
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error(`DataGolf JSON parse error: ${path}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`DataGolf timeout: ${path}`)); });
  });
}

// ── Date parser ───────────────────────────────────────────────────────────────
// Parses DataGolf date strings like "Apr 02-05" or "Apr 30-May 03"
const MONTHS = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 };
function parseDGDate(str, year) {
  if (!str || !year) return null;
  const pad = n => String(n).padStart(2, '0');
  // Split on " - " or plain "-" but be careful about "Apr 30-May 03"
  // Strategy: split on last dash that's preceded by a digit
  const match = str.match(/^([A-Za-z]+)\s+(\d+)[-–]([A-Za-z]+\s+)?(\d+)$/);
  if (!match) return null;
  const [, startMonStr, startDayStr, endMonStr, endDayStr] = match;
  const startMon = MONTHS[startMonStr];
  const endMon   = endMonStr ? MONTHS[endMonStr.trim()] : startMon;
  const startDay = parseInt(startDayStr);
  const endDay   = parseInt(endDayStr);
  if (!startMon || !endMon || isNaN(startDay) || isNaN(endDay)) return null;
  return {
    start_date: `${year}-${pad(startMon)}-${pad(startDay)}`,
    end_date:   `${year}-${pad(endMon)}-${pad(endDay)}`,
  };
}

// ── Known majors (for is_major flag on schedule sync) ─────────────────────────
const MAJOR_NAMES = [
  'masters tournament', 'pga championship', 'u.s. open', 'us open',
  'the open championship', 'open championship', 'players championship',
];
function isMajorEvent(name) {
  const lower = (name || '').toLowerCase();
  return MAJOR_NAMES.some(m => lower.includes(m));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PLAYER LIST SYNC
// Endpoint: GET /get-player-list?file_format=json
//
// Fetches all DataGolf players, matches to our golf_players by name,
// stores datagolf_id, and fixes 3-letter country codes.
// ─────────────────────────────────────────────────────────────────────────────
async function syncPlayerList() {
  const key = process.env.DATAGOLF_API_KEY;
  if (!key) {
    console.warn('[datagolf] DATAGOLF_API_KEY not set — skipping player list sync');
    return { skipped: true, reason: 'no_key' };
  }

  console.log('[datagolf] Fetching player list...');
  const raw = await fetchJson('/get-player-list?file_format=json');

  // Response is either a flat array or { players: [...] }
  const players = Array.isArray(raw) ? raw : (raw.players || raw.Player_list || []);
  if (!players.length) throw new Error('DataGolf returned empty player list');

  // Build name lookup map: normalized lowercase name → { dgId, country }
  const byName  = new Map(); // lowercase full name → dgData
  const byDgId  = new Map(); // dg_id → dgData
  for (const p of players) {
    const name    = (p.player_name || p.name || '').trim();
    const dgId    = p.dg_id;
    const country = normalizeCountry(p.country);
    if (!name || !dgId) continue;
    const entry = { dgId, name, country };
    byName.set(name.toLowerCase(), entry);
    byDgId.set(dgId, entry);
  }

  // Match against our existing golf_players records
  const ourPlayers = await db.all('SELECT id, name, country, datagolf_id FROM golf_players');
  const updDgSql      = 'UPDATE golf_players SET datagolf_id = ? WHERE id = ?';
  const updCountrySql = "UPDATE golf_players SET country = ? WHERE id = ? AND (country IS NULL OR length(country) != 2)";

  let matched = 0, countryFixed = 0;
  await db.transaction(async (tx) => {
    for (const p of ourPlayers) {
      // Try exact name first, then lowercase trim
      const key = p.name.toLowerCase().trim();
      let dgData = byName.get(key);

      // If not found by exact name, try without suffixes (Jr., III, etc.)
      if (!dgData) {
        const stripped = key.replace(/\s+(jr\.?|sr\.?|ii+|iii+|iv)$/i, '').trim();
        if (stripped !== key) dgData = byName.get(stripped);
      }

      if (!dgData) continue;
      matched++;

      // Only update datagolf_id if not already set or set to a different value
      if (p.datagolf_id !== dgData.dgId) await tx.run(updDgSql, dgData.dgId, p.id);

      // Fix country code if it's missing or 3-letter
      if (dgData.country && (!p.country || p.country.length !== 2)) {
        await tx.run(updCountrySql, dgData.country, p.id);
        countryFixed++;
      }
    }
  });

  console.log(`[datagolf] Player list: ${players.length} DG, ${ourPlayers.length} ours, ${matched} matched, ${countryFixed} countries fixed`);
  return { dg_total: players.length, our_total: ourPlayers.length, matched, country_fixed: countryFixed };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. FIELD SYNC
// Endpoint: GET /field-updates?tour=pga&file_format=json
//
// Returns the current PGA Tour week's field. We match it to an active/upcoming
// tournament in our DB by name, populate golf_tournament_fields, and rebuild
// pool_tier_players for any pool leagues using that tournament.
//
// WD handling: players in our DB who were previously in the field but not in
// the DataGolf response are marked as WD (made_cut = 0, WD flag).
// ─────────────────────────────────────────────────────────────────────────────
async function syncCurrentField() {
  const key = process.env.DATAGOLF_API_KEY;
  if (!key) {
    console.warn('[datagolf] DATAGOLF_API_KEY not set — skipping field sync');
    return { skipped: true, reason: 'no_key' };
  }

  console.log('[datagolf] Fetching current field...');
  const raw = await fetchJson('/field-updates?tour=pga&file_format=json');

  const eventName = raw.event_name || raw.tournament_name || '';
  const dgEventId = raw.event_id || null;
  const field     = raw.field || raw.players || [];

  if (!field.length) {
    console.warn('[datagolf] Field response has no players — possibly off-season or API issue');
    return { error: 'empty_field', event_name: eventName };
  }

  // Find our matching tournament
  const year = new Date().getFullYear();
  let tourn = null;

  // Try by datagolf_event_id first
  if (dgEventId) {
    tourn = await db.get(
      'SELECT * FROM golf_tournaments WHERE datagolf_event_id = ? AND season_year = ?',
      dgEventId, year
    );
  }

  // Fall back to name match
  if (!tourn && eventName) {
    const eventWords = eventName.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/).filter(w => w.length > 3);
    const candidates = await db.all(
      "SELECT * FROM golf_tournaments WHERE season_year = ? AND status IN ('active','scheduled') ORDER BY start_date ASC",
      year
    );
    for (const t of candidates) {
      const tName = t.name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
      const hits = eventWords.filter(w => tName.includes(w)).length;
      if (hits >= Math.min(2, eventWords.length)) { tourn = t; break; }
    }
  }

  if (!tourn) {
    console.warn(`[datagolf] No tournament matched "${eventName}" — storing event_id ${dgEventId} for manual association`);
    return { error: 'tournament_not_found', event_name: eventName, dg_event_id: dgEventId };
  }

  // Persist datagolf_event_id if we learned it
  if (dgEventId && !tourn.datagolf_event_id) {
    await db.run('UPDATE golf_tournaments SET datagolf_event_id = ? WHERE id = ?', dgEventId, tourn.id);
    tourn.datagolf_event_id = dgEventId;
  }

  const result = await _applyFieldToTournament(tourn, field);
  // Auto-assign betting-odds-based tiers after field is populated (non-blocking)
  syncDgOddsTiers(tourn.id).then(t => {
    if (!t.skipped) console.log(`[datagolf] Auto odds-tiers: ${t.updated} assigned, ${t.no_odds} defaulted to T4`);
  }).catch(e => console.warn('[datagolf] Odds tier auto-sync skipped:', e.message));
  return result;
}

async function syncFieldForTournament(tournamentId) {
  const key = process.env.DATAGOLF_API_KEY;
  if (!key) return { skipped: true, reason: 'no_key' };

  const tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', tournamentId);
  if (!tourn) throw new Error(`Tournament ${tournamentId} not found`);

  const raw   = await fetchJson('/field-updates?tour=pga&file_format=json');
  const field = raw.field || raw.players || [];

  if (!field.length) return { error: 'empty_field' };

  // Persist datagolf_event_id if returned
  const dgEventId = raw.event_id || null;
  if (dgEventId && !tourn.datagolf_event_id) {
    await db.run('UPDATE golf_tournaments SET datagolf_event_id = ? WHERE id = ?', dgEventId, tourn.id);
  }

  const result = await _applyFieldToTournament(tourn, field);
  syncDgOddsTiers(tourn.id).then(t => {
    if (!t.skipped) console.log(`[datagolf] Auto odds-tiers: ${t.updated} assigned, ${t.no_odds} defaulted to T4`);
  }).catch(e => console.warn('[datagolf] Odds tier auto-sync skipped:', e.message));
  return result;
}

// Internal: write field data for a specific tournament
async function _applyFieldToTournament(tourn, field) {
  console.log(`[datagolf] Applying field of ${field.length} players to ${tourn.name}`);

  // The previous "nuclear guard" early-exited the entire tier rebuild if ANY
  // league had locked odds. That over-corrected — it preserved stale lock data
  // (e.g. RBC Beta carrying 781 wrong-source players the lock was protecting).
  // The per-league loop below now checks each league's lock for STALENESS:
  // if the locked rows mostly aren't in the current field, the lock is stale
  // and we clear it before rebuilding. This preserves genuine commissioner
  // edits (where the lock IS protecting current-field data) while letting
  // wrong-source data get corrected automatically.
  const _skipTierRebuild = false;

  const _getGPSql  = 'SELECT * FROM golf_players WHERE datagolf_id = ? LIMIT 1';
  const _getGPNSql = 'SELECT * FROM golf_players WHERE name = ? LIMIT 1';
  const _insGPSql  = 'INSERT OR IGNORE INTO golf_players (id, name, country, is_active, world_ranking, datagolf_id) VALUES (?, ?, ?, 1, ?, ?)';
  const _updGPCoSql= "UPDATE golf_players SET country = ? WHERE id = ? AND (country IS NULL OR length(country) != 2)";
  const _updDgIdSql= "UPDATE golf_players SET datagolf_id = ? WHERE id = ? AND datagolf_id IS NULL";
  const _insTFSql  = `
    INSERT OR REPLACE INTO golf_tournament_fields
      (id, tournament_id, player_name, player_id, espn_player_id, world_ranking, odds_display, odds_decimal)
    VALUES (?, ?, ?, ?, NULL, ?, NULL, NULL)
  `;

  // Track which player IDs are in the new field (for WD detection)
  const fieldPlayerIds = new Set();

  await db.run('DELETE FROM golf_tournament_fields WHERE tournament_id = ?', tourn.id);

  let inserted = 0, created = 0;
  await db.transaction(async (tx) => {
    for (const f of field) {
      const name    = (f.player_name || f.name || '').trim();
      const dgId    = f.dg_id;
      const country = normalizeCountry(f.country);
      const ranking = f.dg_id ? null : null; // DG field doesn't include ranking; will get from player record
      if (!name) continue;

      // Find or create player record, preferring datagolf_id match
      let gp = dgId ? await tx.get(_getGPSql, dgId) : null;
      if (!gp) gp = await tx.get(_getGPNSql, name);
      if (!gp) {
        await tx.run(_insGPSql, uuidv4(), name, country, null, dgId || null);
        gp = dgId ? await tx.get(_getGPSql, dgId) : await tx.get(_getGPNSql, name);
        if (gp) created++;
      }
      if (!gp) continue;

      // Update country and datagolf_id on player record
      if (country)  await tx.run(_updGPCoSql, country, gp.id);
      if (dgId)     await tx.run(_updDgIdSql, dgId, gp.id);

      fieldPlayerIds.add(gp.id);
      await tx.run(_insTFSql, uuidv4(), tourn.id, name, gp.id, gp.world_ranking || null);
      inserted++;
    }
  });

  // ── Detect WDs: pool_picks for this tournament that aren't in new field ───
  let wdCount = 0;
  const pickLeagues = await db.all(
    "SELECT DISTINCT league_id FROM pool_picks WHERE tournament_id = ? AND is_dropped = 0",
    tourn.id
  );
  for (const { league_id } of pickLeagues) {
    const picks = await db.all(
      'SELECT pp.player_id FROM pool_picks pp WHERE pp.league_id = ? AND pp.tournament_id = ?',
      league_id, tourn.id
    );
    for (const pick of picks) {
      if (!fieldPlayerIds.has(pick.player_id)) {
        // Player no longer in field — ensure a golf_scores row exists with made_cut=0
        // INSERT OR IGNORE creates the row if it doesn't exist; UPDATE handles the case
        // where a row exists but made_cut is still NULL (e.g. was in R1 then WD'd).
        await db.run(`
          INSERT OR IGNORE INTO golf_scores (id, tournament_id, player_id, made_cut, updated_at)
          VALUES (?, ?, ?, 0, datetime('now'))
        `, uuidv4(), tourn.id, pick.player_id);
        await db.run(`
          UPDATE golf_scores SET made_cut = 0
          WHERE player_id = ? AND tournament_id = ? AND made_cut IS NULL
        `, pick.player_id, tourn.id);
        wdCount++;
      }
    }
  }

  // ── Rebuild pool_tier_players for affected leagues ────────────────────────
  if (_skipTierRebuild) {
    console.log(`[datagolf] SKIPPING tier rebuild for "${tourn.name}" — locked odds detected`);
    return { inserted, created, wdCount, leagueResults: [{ skipped: 'odds_locked_global' }] };
  }

  const { _oddsToDecimal, _rankToOdds } = _getTierHelpers();
  const affectedLeagues = await db.all(
    "SELECT * FROM golf_leagues WHERE format_type IN ('pool', 'salary_cap') AND pool_tournament_id = ? AND status != 'archived'",
    tourn.id
  );

  const leagueResults = [];
  for (const league of affectedLeagues) {
    // Stale-lock check: if the locked tier_players don't actually represent
    // the current field (>20% mismatch), the lock is protecting wrong data.
    // Clear it so the rebuild can replace it with the right field.
    const hasLockedOdds = await db.get(
      'SELECT 1 FROM pool_tier_players WHERE league_id = ? AND odds_locked_at IS NOT NULL LIMIT 1',
      league.id
    );
    if (hasLockedOdds) {
      const all = await db.all(
        'SELECT player_id FROM pool_tier_players WHERE league_id = ? AND tournament_id = ?',
        league.id, tourn.id
      );
      const inField = all.filter(r => fieldPlayerIds.has(r.player_id)).length;
      const matchPct = all.length > 0 ? inField / all.length : 0;
      if (matchPct >= 0.80) {
        // Lock is genuine — preserves commissioner's manual odds edits
        leagueResults.push({ league: league.name, skipped: 'odds_locked', match_pct: Math.round(matchPct * 100) });
        continue;
      }
      console.log(`[datagolf] STALE LOCK on "${league.name}" — only ${inField}/${all.length} (${Math.round(matchPct * 100)}%) match new field, clearing locks and rebuilding`);
      await db.run(
        'UPDATE pool_tier_players SET odds_locked_at = NULL WHERE league_id = ? AND tournament_id = ?',
        league.id, tourn.id
      );
      // fall through to rebuild
    }

    let tiersConfig = [];
    try { tiersConfig = JSON.parse(league.pool_tiers || '[]'); } catch (_) {}
    if (!tiersConfig.length) { leagueResults.push({ league: league.name, skipped: 'no_tier_config' }); continue; }

    // Delete non-overridden tier players EXCEPT those who have been picked —
    // picked players must keep their tier row visible (mark WD instead of deleting).
    await db.run(`
      DELETE FROM pool_tier_players
      WHERE league_id = ? AND tournament_id = ? AND manually_overridden = 0
        AND player_id NOT IN (
          SELECT DISTINCT player_id FROM pool_picks
          WHERE league_id = ? AND tournament_id = ?
        )
    `, league.id, tourn.id, league.id, tourn.id);

    // Use odds from golf_players + golf_tournament_fields; field was just updated.
    // GROUP BY gp.id deduplicates players who have multiple name-variant rows in
    // golf_tournament_fields (UNIQUE on player_name, not player_id), which would
    // otherwise produce N rows per player and N duplicate pool_tier_players inserts.
    const allTF = await db.all(`
      SELECT gp.*, tf.odds_display AS tf_od, tf.odds_decimal AS tf_dec
      FROM golf_players gp
      INNER JOIN golf_tournament_fields tf ON tf.player_id = gp.id AND tf.tournament_id = ?
      GROUP BY gp.id
      ORDER BY COALESCE(tf.odds_decimal, gp.odds_decimal, 999) ASC
    `, tourn.id);

    // NOTE: is_withdrawn is intentionally NOT in the INSERT column list here.
    // Deleting and re-inserting resets is_withdrawn to 0 (the column default).
    // syncTournamentField() in golfSyncService.js is the SOLE owner of is_withdrawn.
    // DO NOT set is_withdrawn here.
    const insTPSql = `
      INSERT OR REPLACE INTO pool_tier_players
        (id, league_id, tournament_id, player_id, player_name, tier_number,
         odds_display, odds_decimal, world_ranking, salary, manually_overridden)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `;

    let count = 0;
    await db.transaction(async (tx) => {
      for (const p of allTF) {
        const gen = (!p.tf_od && !p.odds_display) ? _rankToOdds(p.world_ranking || 200) : null;
        const odds_display = p.tf_od || p.odds_display || gen.odds_display;
        const odds_decimal = p.tf_dec || p.odds_decimal || gen.odds_decimal;
        let tierNum = tiersConfig[tiersConfig.length - 1]?.tier || 1;
        for (const t of tiersConfig) {
          if (odds_decimal >= _oddsToDecimal(t.odds_min) && odds_decimal <= _oddsToDecimal(t.odds_max)) {
            tierNum = t.tier; break;
          }
        }
        await tx.run(insTPSql, uuidv4(), league.id, tourn.id, p.id, p.name, tierNum, odds_display, odds_decimal, p.world_ranking || null);
        count++;
      }
    });

    // Mark picked players as withdrawn if they're no longer in the field
    const fieldPlayerIdsLocal = new Set(allTF.map(p => p.id));
    const stalePickedPlayers = await db.all(`
      SELECT DISTINCT ptp.player_id FROM pool_tier_players ptp
      WHERE ptp.league_id = ? AND ptp.tournament_id = ?
        AND ptp.player_id NOT IN (${allTF.map(() => '?').join(',') || "''"})
    `, league.id, tourn.id, ...allTF.map(p => p.id));

    if (stalePickedPlayers.length > 0) {
      const markWDSql = 'UPDATE pool_tier_players SET is_withdrawn = 1 WHERE league_id = ? AND tournament_id = ? AND player_id = ?';
      for (const { player_id } of stalePickedPlayers) {
        await db.run(markWDSql, league.id, tourn.id, player_id);
      }
      console.log(`[datagolf] ${tourn.name}: marked ${stalePickedPlayers.length} picked player(s) as WD in league ${league.name}`);
    }

    leagueResults.push({ league: league.name, players_assigned: count });
  }

  if (wdCount > 0) console.log(`[datagolf] ${tourn.name}: ${wdCount} WD(s) detected and marked`);
  console.log(`[datagolf] ${tourn.name}: ${inserted} field players (${created} new), ${leagueResults.length} leagues rebuilt`);

  // Update salaries for any salary_cap leagues after odds sync
  try {
    const { assignSalaryCapSalaries } = require('./routes/golf-pool');
    const scLeagues = await db.all(
      "SELECT id FROM golf_leagues WHERE format_type = 'salary_cap' AND pool_tournament_id = ? AND status != 'archived'",
      tourn.id
    );
    for (const l of scLeagues) assignSalaryCapSalaries(l.id);
    if (scLeagues.length) console.log(`[datagolf] assigned salaries to ${scLeagues.length} salary_cap league(s)`);
  } catch (e) { console.error('[datagolf] salary assignment error:', e); }

  return {
    tournament: tourn.name,
    field_size: inserted,
    new_players: created,
    wds_detected: wdCount,
    leagues_rebuilt: leagueResults,
  };
}

// Shared tier helpers (mirrors golf-admin.js — kept in sync manually)
function _getTierHelpers() {
  function _oddsToDecimal(str) {
    if (!str) return 999;
    const [a, b] = String(str).split(':').map(parseFloat);
    if (isNaN(a) || isNaN(b) || b === 0) return 999;
    return a / b + 1;
  }
  function _rankToOdds(rank) {
    const r = rank || 9999;
    const bands = [
      { minRank:1,   maxRank:5,    min:8,   max:15   },
      { minRank:6,   maxRank:15,   min:15,  max:30   },
      { minRank:16,  maxRank:30,   min:30,  max:60   },
      { minRank:31,  maxRank:50,   min:60,  max:100  },
      { minRank:51,  maxRank:100,  min:100, max:200  },
      { minRank:101, maxRank:200,  min:200, max:500  },
    ];
    const band = bands.find(b => r >= b.minRank && r <= b.maxRank) || { min:500, max:1000 };
    const dec = (band.min + band.max) / 2 + 1;
    return { odds_display: `${Math.round(dec - 1)}:1`, odds_decimal: dec };
  }
  return { _oddsToDecimal, _rankToOdds };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SCHEDULE SYNC
// Endpoint: GET /get-schedule?tour=pga&season=YYYY&file_format=json
//
// Auto-populates golf_tournaments from the DataGolf schedule.
// Safe to run repeatedly — uses INSERT OR IGNORE + update for known fields.
// ─────────────────────────────────────────────────────────────────────────────
async function syncSchedule(season) {
  const key = process.env.DATAGOLF_API_KEY;
  if (!key) {
    console.warn('[datagolf] DATAGOLF_API_KEY not set — skipping schedule sync');
    return { skipped: true, reason: 'no_key' };
  }

  const yr = season || new Date().getFullYear();
  console.log(`[datagolf] Fetching ${yr} schedule...`);
  const raw = await fetchJson(`/get-schedule?tour=pga&season=${yr}&file_format=json`);

  // Response: { schedule: [...] } or flat array
  const events = Array.isArray(raw) ? raw : (raw.schedule || raw.events || []);
  if (!events.length) {
    console.warn('[datagolf] Schedule returned no events');
    return { error: 'empty_schedule', season: yr };
  }

  const insTSql = `
    INSERT OR IGNORE INTO golf_tournaments
      (id, name, course, start_date, end_date, season_year, is_major, is_signature, status, purse, prize_money, datagolf_event_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)
  `;
  const updTSql = `
    UPDATE golf_tournaments
    SET course = COALESCE(NULLIF(course,''), ?),
        start_date = ?,
        end_date = ?,
        purse = COALESCE(NULLIF(purse,0), ?),
        prize_money = COALESCE(NULLIF(prize_money,0), ?),
        datagolf_event_id = COALESCE(datagolf_event_id, ?)
    WHERE name = ? AND season_year = ?
  `;

  let inserted = 0, updated = 0;
  await db.transaction(async (tx) => {
    for (const ev of events) {
      const name   = (ev.event_name || ev.name || '').trim();
      const dgId   = ev.event_id || ev.dg_event_id || null;
      const course = (ev.course || ev.course_name || '').trim();
      const purse  = ev.purse || ev.prize_money || 0;
      const dates  = parseDGDate(ev.date || ev.dates || '', yr);
      if (!name || !dates) continue;

      const is_major     = isMajorEvent(name) ? 1 : 0;
      const is_signature = (purse >= 15000000 || ev.signature === true || ev.is_signature === 1) ? 1 : 0;

      const res = await tx.run(insTSql, uuidv4(), name, course, dates.start_date, dates.end_date, yr, is_major, is_signature, purse, purse, dgId);
      if (res.changes > 0) {
        inserted++;
      } else {
        // Tournament exists — update mutable fields
        await tx.run(updTSql, course, dates.start_date, dates.end_date, purse, purse, dgId, name, yr);
        updated++;
      }
    }
  });

  console.log(`[datagolf] Schedule sync ${yr}: ${inserted} inserted, ${updated} updated (${events.length} total events)`);
  return { season: yr, total: events.length, inserted, updated };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. LIVE SCORING SCAFFOLD
// Endpoint: GET /preds/live-tournament-stats?stats=sg_total,sg_putt,sg_app,sg_ott,sg_t2g,scrambling&round=event_cumulative&file_format=json
//
// Updates every 5 minutes during rounds. Currently stores SG data alongside
// existing ESPN round scores. Full replacement of ESPN scoring is future work.
// ─────────────────────────────────────────────────────────────────────────────
async function syncLiveStats(tournamentId) {
  const key = process.env.DATAGOLF_API_KEY;
  if (!key) return { skipped: true, reason: 'no_key' };

  const tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', tournamentId);
  if (!tourn) throw new Error(`Tournament ${tournamentId} not found`);

  console.log(`[datagolf] Fetching live stats for ${tourn.name}...`);
  const raw = await fetchJson(
    '/preds/live-tournament-stats?stats=sg_total,sg_putt,sg_app,sg_ott,sg_t2g,scrambling&round=event_cumulative&file_format=json'
  );

  const liveStats = raw.live_stats || raw.data || [];
  if (!liveStats.length) return { synced: 0, reason: 'no_live_stats' };

  // Ensure sg_total column exists (migration guard)
  try { await db.exec('ALTER TABLE golf_scores ADD COLUMN sg_total REAL'); } catch (_) {}

  const updSGSql = 'UPDATE golf_scores SET sg_total = ? WHERE player_id = ? AND tournament_id = ?';
  const _getGPSql = 'SELECT id FROM golf_players WHERE datagolf_id = ? LIMIT 1';
  const _getGPNSql = 'SELECT id FROM golf_players WHERE name = ? LIMIT 1';

  let synced = 0;
  for (const s of liveStats) {
    const dgId   = s.dg_id;
    const name   = s.player_name || s.name || '';
    const sgTotal = s.sg_total ?? null;
    if (sgTotal === null) continue;

    let gp = dgId ? await db.get(_getGPSql, dgId) : null;
    if (!gp && name) gp = await db.get(_getGPNSql, name);
    if (!gp) continue;

    const res = await db.run(updSGSql, sgTotal, gp.id, tourn.id);
    if (res.changes > 0) synced++;
  }

  console.log(`[datagolf] Live stats ${tourn.name}: ${synced}/${liveStats.length} players updated`);
  return { tournament: tourn.name, synced, total: liveStats.length, round_info: raw.info || {} };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SKILL RATINGS — form badges (🔥 hot / ❄️ cold)
// Endpoint: GET /preds/skill-ratings?display=value&file_format=json
// Returns recent SG data per player. Cached 1 hour.
// ─────────────────────────────────────────────────────────────────────────────
async function fetchSkillRatings() {
  const cached = _cacheGet('skill_ratings');
  if (cached) return cached;
  if (!process.env.DATAGOLF_API_KEY) return null;

  const raw     = await fetchJson('/preds/skill-ratings?display=value&file_format=json');
  const players = Array.isArray(raw) ? raw : (raw.players || raw.data || []);

  // Build lookup maps keyed by DG id and normalized player name
  const byDgId = {};
  const byName = {};
  for (const p of players) {
    const sg = (p.sg_total != null && !isNaN(p.sg_total)) ? p.sg_total : null;
    if (p.dg_id != null) byDgId[p.dg_id] = { sg_total: sg, player_name: p.player_name };
    if (p.player_name)   byName[p.player_name.toLowerCase().trim()] = { sg_total: sg, dg_id: p.dg_id };
  }
  const result = { byDgId, byName, fetchedAt: Date.now() };
  _cacheSet('skill_ratings', result);
  console.log(`[datagolf] Skill ratings fetched: ${players.length} players`);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. WIN PROBABILITIES — pre-tournament predictions
// Endpoint: GET /preds/pre-tournament?tour=pga&file_format=json
// Returns win%, top-5%, make-cut% per player. Cached 1 hour.
// ─────────────────────────────────────────────────────────────────────────────
async function fetchWinProbs() {
  const cached = _cacheGet('win_probs');
  if (cached) return cached;
  if (!process.env.DATAGOLF_API_KEY) return null;

  const raw     = await fetchJson('/preds/pre-tournament?tour=pga&file_format=json');
  const players = Array.isArray(raw) ? raw : (raw.players || raw.data || []);

  const byDgId = {};
  const byName = {};
  for (const p of players) {
    const entry = { win: p.win ?? null, top5: p.top_5 ?? null, make_cut: p.make_cut ?? null };
    if (p.dg_id != null) byDgId[p.dg_id] = { ...entry, player_name: p.player_name };
    if (p.player_name)   byName[p.player_name.toLowerCase().trim()] = { ...entry, dg_id: p.dg_id };
  }
  const result = { byDgId, byName, event_name: raw.event_name || '', fetchedAt: Date.now() };
  _cacheSet('win_probs', result);
  console.log(`[datagolf] Win probs fetched: ${players.length} players for "${result.event_name}"`);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. ODDS-BASED TIER ASSIGNMENT
// Endpoint: GET /betting-tools/outrights?tour=pga&market=win&odds_format=american
//
// Assigns pool_tier_players.tier_number based on DataGolf win odds (American format):
//   american < +2000   → Tier 1  (top favorites)
//   +2000 to +3999     → Tier 2  (strong contenders)
//   +4000 to +7999     → Tier 3  (longshots with a chance)
//   +8000 or longer    → Tier 4  (true lottery tickets)
//
// Also updates odds_display and odds_decimal on pool_tier_players.
// Runs automatically after every field sync. Respects manually_overridden flag.
// Super Admin can trigger manually: POST /admin/dev/sync-datagolf-odds-tiers
// ─────────────────────────────────────────────────────────────────────────────

// Convert American odds → display string ("15:1") + decimal (16.0)
function _americanToDisplay(american) {
  if (american == null || american < -5000) return { display: null, decimal: null };
  const ratio = american > 0 ? american / 100 : 100 / Math.abs(american);
  const nice = ratio < 5   ? Math.round(ratio * 4) / 4 :
               ratio < 20  ? Math.round(ratio * 2) / 2 :
               ratio < 100 ? Math.round(ratio / 5) * 5 :
                             Math.round(ratio / 25) * 25;
  return { display: `${nice}:1`, decimal: nice + 1 };
}

const DG_BOOK_PREFS = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'pointsbetus', 'betrivers', 'unibet'];

async function syncDgOddsTiers(tournamentId) {
  if (!process.env.DATAGOLF_API_KEY) return { skipped: true, reason: 'no_key' };

  const tourn = await db.get('SELECT * FROM golf_tournaments WHERE id = ?', tournamentId);
  if (!tourn) return { error: 'tournament_not_found' };

  // Guard: NEVER re-tier if ANY active pool exists for this tournament.
  // Once a league is created and members can see tiers, odds must be frozen.
  // Re-tiering causes duplicates, tier disappearances, and corrupted picks.
  const activePool = await db.get(`
    SELECT gl.id, gl.name FROM golf_leagues gl
    WHERE gl.pool_tournament_id = ? AND gl.status != 'archived'
    LIMIT 1
  `, tournamentId);
  if (activePool) {
    console.log(`[datagolf] Odds tiers SKIPPED for "${tourn.name}" — active pool "${activePool.name}" exists`);
    return { skipped: true, reason: 'active_pool_exists', league: activePool.name };
  }

  // Fetch DG betting odds (1hr cache keyed per tournament)
  const cacheKey = `dg_odds_${tournamentId}`;
  let oddsData = _cacheGet(cacheKey);
  if (!oddsData) {
    const raw  = await fetchJson('/betting-tools/outrights?tour=pga&market=win&odds_format=american');
    const odds = Array.isArray(raw) ? raw : (raw.odds || raw.players || raw.data || []);
    oddsData = { odds, event_name: raw.event_name || '' };
    _cacheSet(cacheKey, oddsData);
  }

  // Build player odds lookup: dg_id → { american, display, decimal }, name → same
  const byDgId = new Map();
  const byName = new Map();
  for (const p of oddsData.odds) {
    let american = null;
    for (const bk of DG_BOOK_PREFS) {
      if (p[bk] != null) { american = p[bk]; break; }
    }
    if (american == null) {
      for (const [k, v] of Object.entries(p)) {
        if (!['player_name', 'dg_id'].includes(k) && typeof v === 'number') { american = v; break; }
      }
    }
    if (american == null) continue;
    const entry = { american, ..._americanToDisplay(american) };
    if (p.dg_id != null)   byDgId.set(Number(p.dg_id), entry);
    if (p.player_name) {
      const norm = p.player_name.toLowerCase().trim();
      byName.set(norm, entry);
      // Also index "Last, First" → "first last" and strip accents for fuzzy matching
      const noAccent = norm.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (noAccent !== norm) byName.set(noAccent, entry);
      // "Last, First" format
      if (norm.includes(',')) {
        const [last, first] = norm.split(',').map(s => s.trim());
        byName.set(`${first} ${last}`, entry);
      }
    }
  }

  if (!byDgId.size && !byName.size) {
    console.warn(`[datagolf] Odds tiers: no odds data returned for "${oddsData.event_name}"`);
    return { skipped: true, reason: 'no_odds_data', event_name: oddsData.event_name };
  }

  // T1: < +2000 (elite favorites, ≤ 19/1)
  // T2: +2000–+3999  T3: +4000–+7999  T4: +8000+
  const tierForAmerican = american =>
    american <= 2000 ? 1 : american < 4000 ? 2 : american < 8000 ? 3 : 4;

  // GROUP BY player_id: prevents processing the same player multiple times when
  // golf_tournament_fields has duplicate name-variant rows for the same player_id.
  const fieldRows = await db.all(`
    SELECT tf.player_id, gp.datagolf_id, gp.name
    FROM golf_tournament_fields tf
    JOIN golf_players gp ON gp.id = tf.player_id
    WHERE tf.tournament_id = ?
    GROUP BY tf.player_id
  `, tournamentId);

  const leagues = await db.all(
    "SELECT id FROM golf_leagues WHERE format_type IN ('pool', 'salary_cap') AND pool_tournament_id = ? AND status != 'archived'",
    tournamentId
  );

  let updated = 0, noOdds = 0, noMatch = 0;

  // Bulk UPDATE by player_id — updates ALL duplicate pool_tier_players rows for a player at once.
  // Previous approach used sel.get() + UPDATE WHERE id=? which only fixed ONE of N duplicate rows.
  const updWithOddsSql = 'UPDATE pool_tier_players SET tier_number = ?, odds_display = ?, odds_decimal = ? WHERE league_id = ? AND tournament_id = ? AND player_id = ? AND (manually_overridden IS NULL OR manually_overridden = 0) AND odds_locked_at IS NULL';
  const updNoOddsSql = 'UPDATE pool_tier_players SET tier_number = 4, odds_display = NULL, odds_decimal = NULL WHERE league_id = ? AND tournament_id = ? AND player_id = ? AND (manually_overridden IS NULL OR manually_overridden = 0) AND odds_locked_at IS NULL';

  // One-time dedup: remove stale duplicate pool_tier_players rows, keeping the MAX id per player.
  // This cleans up rows created by the JOIN multiplication bug before GROUP BY was added.
  const dedupSql = `
    DELETE FROM pool_tier_players
    WHERE tournament_id = ?
      AND id NOT IN (
        SELECT MAX(id) FROM pool_tier_players WHERE tournament_id = ? GROUP BY league_id, player_id
      )
  `;

  for (const { id: leagueId } of leagues) {
    await db.transaction(async (tx) => {
      await tx.run(dedupSql, tournamentId, tournamentId);

      for (const f of fieldRows) {
        const odds = (f.datagolf_id ? byDgId.get(Number(f.datagolf_id)) : null)
                   || byName.get((f.name || '').toLowerCase().trim());
        if (!odds) {
          await tx.run(updNoOddsSql, leagueId, tournamentId, f.player_id);
          noOdds++;
        } else {
          await tx.run(updWithOddsSql, tierForAmerican(odds.american), odds.display, odds.decimal, leagueId, tournamentId, f.player_id);
          updated++;
        }
      }
    });
  }

  if (noOdds > 0) console.log(`[datagolf] Odds tiers: ${noOdds} players had no DG odds match — defaulted to T4`);
  console.log(`[datagolf] Odds tiers ${tourn.name}: ${updated} assigned by odds, ${noOdds} defaulted to T4, across ${leagues.length} leagues`);
  return { tournament: tourn.name, event_name: oddsData.event_name, odds_players: byDgId.size || byName.size, leagues: leagues.length, updated, no_odds: noOdds };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. SCHEDULER
// - Player list: once at startup (after 30s) + every Sunday at midnight UTC
// - Field sync: every Monday at 8am UTC + every 12h Mon–Wed (WD updates)
// - Schedule sync: once at startup (after 60s) + every Sunday at midnight UTC
// ─────────────────────────────────────────────────────────────────────────────
let _dgScheduleInterval = null;

function scheduleDataGolfSync() {
  if (!process.env.DATAGOLF_API_KEY) {
    console.warn('[datagolf] DATAGOLF_API_KEY not set — DataGolf sync disabled');
    return;
  }

  // Check every 10 minutes for scheduled tasks
  if (_dgScheduleInterval) clearInterval(_dgScheduleInterval);
  _dgScheduleInterval = setInterval(() => {
    const now = new Date();
    const dayUTC  = now.getUTCDay();   // 0=Sun, 1=Mon, 2=Tue, 3=Wed
    const hourUTC = now.getUTCHours();
    const minUTC  = now.getUTCMinutes();

    // Monday 8am UTC: field sync (new tournament week starts)
    if (dayUTC === 1 && hourUTC === 8 && minUTC < 10) {
      console.log('[datagolf] Monday field sync triggered');
      syncCurrentField().catch(e => console.error('[datagolf] Monday field sync error:', e.message));
    }

    // Mon–Wed 8pm UTC: afternoon WD/qualifier update
    if ([1,2,3].includes(dayUTC) && hourUTC === 20 && minUTC < 10) {
      console.log('[datagolf] Afternoon field update (WD check) triggered');
      syncCurrentField().catch(e => console.error('[datagolf] Afternoon field sync error:', e.message));
    }

    // Sunday midnight UTC: player list + schedule refresh
    if (dayUTC === 0 && hourUTC === 0 && minUTC < 10) {
      console.log('[datagolf] Sunday maintenance: player list + schedule refresh');
      syncPlayerList().catch(e => console.error('[datagolf] Sunday player list error:', e.message));
      syncSchedule().catch(e => console.error('[datagolf] Sunday schedule error:', e.message));
    }
  }, 10 * 60 * 1000); // check every 10 min

  // Startup tasks (staggered to avoid hammering API at boot)
  setTimeout(() => syncPlayerList().catch(e => console.error('[datagolf] Startup player list error:', e.message)), 30 * 1000);
  setTimeout(() => syncSchedule().catch(e => console.error('[datagolf] Startup schedule error:', e.message)), 75 * 1000);

  console.log('[datagolf] Sync scheduled: field Mon 8am UTC + Mon/Tue/Wed 8pm UTC, player list + schedule Sunday midnight UTC');
}

module.exports = {
  syncPlayerList,
  syncCurrentField,
  syncFieldForTournament,
  syncSchedule,
  syncLiveStats,
  scheduleDataGolfSync,
  normalizeCountry,
  fetchSkillRatings,
  fetchWinProbs,
  syncDgOddsTiers,
};
