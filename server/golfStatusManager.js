/**
 * golfStatusManager.js — Tournament status auto-management.
 *
 * Single source of truth for "is this tournament scheduled / active / completed".
 * Combines two signals:
 *   1. Date-based (primary): start_date / end_date in golf_tournaments
 *   2. ESPN live status (secondary): event_status from ESPN scoreboard
 *
 * Runs:
 *   - On every server boot (called from server/index.js after listen)
 *   - Daily at 6am via setInterval scheduled in server/index.js
 *
 * Every status change is logged to migration_log so we can audit when the
 * heal fired and what it changed.
 */
'use strict';

const db = require('./db'); // raw SQLite — synchronous, used for both reads and writes
const https = require('https');

const ESPN_LEADERBOARD =
  'https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard';

// ── helpers ─────────────────────────────────────────────────────────────────

function todayIso() {
  // Use UTC-stable YYYY-MM-DD so SQLite date() comparisons match
  return new Date().toISOString().slice(0, 10);
}

function logChange(name, details = '') {
  // migration_log has (name PK, ran_at). We squeeze a structured detail line
  // into name so the log row is self-describing.
  const tag = `[status-heal ${todayIso()}] ${name}` + (details ? ` — ${details}` : '');
  try {
    db.prepare('INSERT OR IGNORE INTO migration_log (name) VALUES (?)').run(tag.slice(0, 240));
    console.log(`[status-heal] ${tag}`);
  } catch (e) {
    console.error('[status-heal] log write failed:', e.message);
  }
}

// Fetch ESPN event status for a single event_id. Returns 'pre' | 'in' | 'post' | null.
// Uses the leaderboard endpoint that we already hit elsewhere — no new auth/dep.
function fetchEspnEventStatus(eventId) {
  return new Promise(resolve => {
    if (!eventId) return resolve(null);
    const url = `${ESPN_LEADERBOARD}?event=${eventId}`;
    const req = https.get(url, { timeout: 8000 }, res => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          const ev = j.events?.[0];
          // ESPN returns either status.type.state ('pre' | 'in' | 'post')
          // or status.type.name ('STATUS_SCHEDULED', 'STATUS_PLAY_COMPLETE', etc).
          const state = ev?.status?.type?.state || null;
          resolve(state);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// ── PHASE 1: date-based transitions (sync, fast, no network) ─────────────────

function applyDateBasedHeal() {
  const today = todayIso();
  const changes = [];

  // 1a. completed → scheduled (mistakenly marked completed for a future event)
  const futureCompleted = db.prepare(`
    SELECT id, name FROM golf_tournaments
    WHERE status = 'completed' AND date(start_date) > date(?)
  `).all(today);
  for (const t of futureCompleted) {
    db.prepare("UPDATE golf_tournaments SET status = 'scheduled' WHERE id = ?").run(t.id);
    logChange('completed→scheduled', `${t.name} (start_date > today)`);
    changes.push({ id: t.id, from: 'completed', to: 'scheduled', reason: 'future_event' });
  }

  // 1b. scheduled → active (tournament window has begun)
  const startingNow = db.prepare(`
    SELECT id, name FROM golf_tournaments
    WHERE status = 'scheduled'
      AND date(start_date) <= date(?)
      AND date(end_date)   >= date(?)
  `).all(today, today);
  for (const t of startingNow) {
    db.prepare("UPDATE golf_tournaments SET status = 'active' WHERE id = ?").run(t.id);
    logChange('scheduled→active', `${t.name} (start_date<=today<=end_date)`);
    changes.push({ id: t.id, from: 'scheduled', to: 'active', reason: 'in_window' });
  }

  // 1c. active → completed (end date has passed)
  const finished = db.prepare(`
    SELECT id, name FROM golf_tournaments
    WHERE status = 'active' AND date(end_date) < date(?)
  `).all(today);
  for (const t of finished) {
    db.prepare("UPDATE golf_tournaments SET status = 'completed' WHERE id = ?").run(t.id);
    logChange('active→completed', `${t.name} (end_date < today)`);
    changes.push({ id: t.id, from: 'active', to: 'completed', reason: 'end_date_passed' });
  }

  return changes;
}

// ── PHASE 2: ESPN status check for actives (async, network) ──────────────────
// If ESPN says 'post', the tournament is over (early/Monday finish, weather).
// Never overwrites a status if ESPN+date logic disagree — logs the conflict.

async function applyEspnStatusHeal() {
  const actives = db.prepare(`
    SELECT id, name, espn_event_id, end_date FROM golf_tournaments
    WHERE status = 'active' AND espn_event_id IS NOT NULL
  `).all();
  const changes = [];
  for (const t of actives) {
    const espnState = await fetchEspnEventStatus(t.espn_event_id);
    if (!espnState) continue; // ESPN unreachable — skip silently
    if (espnState === 'post') {
      // ESPN says done — set completed regardless of end_date
      db.prepare("UPDATE golf_tournaments SET status = 'completed' WHERE id = ?").run(t.id);
      const dateStillFuture = todayIso() <= t.end_date;
      const reason = dateStillFuture ? 'espn_post_early_finish' : 'espn_post';
      logChange('active→completed (ESPN)', `${t.name} (${reason})`);
      changes.push({ id: t.id, from: 'active', to: 'completed', reason });
    }
    // 'pre' on an active tournament is suspicious — log but don't overwrite
    if (espnState === 'pre') {
      logChange('CONFLICT', `${t.name} marked active but ESPN says 'pre' — left as-is`);
    }
  }
  return changes;
}

// ── PHASE 3: pre-tournament field sync (T-7 days) ────────────────────────────
// For tournaments scheduled to start in ~7 days, populate golf_tournament_fields
// proactively so commissioners can create pools without seeing empty rosters.

async function applyPreTournamentFieldSync() {
  const triggered = [];
  // Window: 5–8 days out (gives 4 chances to grab the field before the week)
  const candidates = db.prepare(`
    SELECT id, name, espn_event_id, datagolf_event_id
    FROM golf_tournaments
    WHERE status = 'scheduled'
      AND date(start_date) BETWEEN date('now', '+5 days') AND date('now', '+8 days')
      AND (SELECT COUNT(*) FROM golf_tournament_fields WHERE tournament_id = golf_tournaments.id) = 0
  `).all();

  if (candidates.length === 0) return triggered;

  // Try DataGolf first (more reliable + earlier than ESPN for non-majors).
  const dg = require('./dataGolfService');
  for (const t of candidates) {
    try {
      const r = await dg.syncFieldForTournament(t.id);
      const inserted = r?.inserted || 0;
      if (inserted > 0) {
        logChange('field-sync (T-7)', `${t.name} via DataGolf — ${inserted} players`);
        triggered.push({ id: t.id, name: t.name, source: 'datagolf', inserted });
      }
    } catch (e) {
      // ESPN fallback
      try {
        const { syncEspnFieldForTournament } = require('./golfSyncService');
        const r2 = await syncEspnFieldForTournament(t.id);
        const inserted = r2?.fieldCount || 0;
        if (inserted > 0) {
          logChange('field-sync (T-7)', `${t.name} via ESPN — ${inserted} players`);
          triggered.push({ id: t.id, name: t.name, source: 'espn', inserted });
        }
      } catch (e2) {
        console.warn(`[status-heal] field-sync failed for "${t.name}": dg=${e.message}, espn=${e2.message}`);
      }
    }
  }
  return triggered;
}

// ── PHASE 4: DataGolf event_id auto-mapping ──────────────────────────────────
// dataGolfService.syncFieldForTournament already handles the mapping internally.
// This phase explicitly attempts to fill any null datagolf_event_ids for upcoming
// tournaments, so commissioners can rely on DataGolf as the field-of-record.

async function mapMissingDataGolfEventIds() {
  const candidates = db.prepare(`
    SELECT id, name FROM golf_tournaments
    WHERE datagolf_event_id IS NULL
      AND status IN ('scheduled', 'active')
      AND date(start_date) <= date('now', '+30 days')
  `).all();

  const mapped = [];
  if (candidates.length === 0) return mapped;
  const dg = require('./dataGolfService');
  for (const t of candidates) {
    try {
      // syncFieldForTournament auto-resolves and writes datagolf_event_id when it matches.
      await dg.syncFieldForTournament(t.id);
      const updated = db.prepare('SELECT datagolf_event_id FROM golf_tournaments WHERE id = ?').get(t.id);
      if (updated?.datagolf_event_id) {
        logChange('dg-event-mapped', `${t.name} → datagolf_event_id=${updated.datagolf_event_id}`);
        mapped.push({ id: t.id, name: t.name, datagolf_event_id: updated.datagolf_event_id });
      }
    } catch (_) { /* silent — tournament name not in DataGolf catalog */ }
  }
  return mapped;
}

// ── PUBLIC: orchestrator ─────────────────────────────────────────────────────

/**
 * Run the full heal pipeline. Phases 1–4 in order.
 * @param {object} opts - { skipNetwork: bool } — date-only mode for fast boot
 * @returns {Promise<{dateChanges, espnChanges, fieldSyncs, dgMappings}>}
 */
async function runStatusHeal(opts = {}) {
  const { skipNetwork = false } = opts;
  const dateChanges = applyDateBasedHeal();
  if (skipNetwork) {
    return { dateChanges, espnChanges: [], fieldSyncs: [], dgMappings: [] };
  }
  const espnChanges = await applyEspnStatusHeal();
  const fieldSyncs  = await applyPreTournamentFieldSync();
  const dgMappings  = await mapMissingDataGolfEventIds();
  const total = dateChanges.length + espnChanges.length + fieldSyncs.length + dgMappings.length;
  if (total > 0) {
    console.log(`[status-heal] complete: ${dateChanges.length} date, ${espnChanges.length} ESPN, ${fieldSyncs.length} field-syncs, ${dgMappings.length} DG mappings`);
  }
  return { dateChanges, espnChanges, fieldSyncs, dgMappings };
}

// ── Daily 6am cron ───────────────────────────────────────────────────────────
// Computes ms until next 6am ET, fires once, then every 24h thereafter.
function scheduleDailyHeal() {
  const HOUR_ET = 6;
  function msUntilNext6amEt() {
    // 6am ET = 11am UTC (standard) / 10am UTC (DST). Approximate with 10am UTC
    // since US is on DST roughly half the year — a 1-hour drift around DST is
    // acceptable for an idempotent heal.
    const now = new Date();
    const next = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
      HOUR_ET + 4, 0, 0, 0, // 6am ET ≈ 10am UTC
    ));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next - now;
  }
  const firstDelay = msUntilNext6amEt();
  console.log(`[status-heal] daily cron scheduled — first run in ${Math.round(firstDelay / 60000)} min`);
  setTimeout(() => {
    runStatusHeal().catch(e => console.error('[status-heal] daily run failed:', e.message));
    setInterval(
      () => runStatusHeal().catch(e => console.error('[status-heal] daily run failed:', e.message)),
      24 * 60 * 60 * 1000,
    );
  }, firstDelay);
}

module.exports = {
  runStatusHeal,
  applyDateBasedHeal,
  applyEspnStatusHeal,
  applyPreTournamentFieldSync,
  mapMissingDataGolfEventIds,
  scheduleDailyHeal,
  fetchEspnEventStatus,
};
