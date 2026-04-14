'use strict';
/**
 * playerNameNorm.js
 *
 * Shared player-name normalisation used by all sync services and matching
 * logic so the same algorithm runs everywhere consistently.
 *
 * normalizePlayerName(name) → lowercase comparison string
 *   - Strips diacritics: ø→o, é→e, å→a, ü→u, ñ→n, ø→o, ó→o, etc.
 *   - Strips periods (J.T.→JT, C.T.→CT, R.→R)
 *   - Strips hyphens, apostrophes, curly quotes
 *   - Collapses whitespace
 *
 * matchPlayerName(espnName, players) → player object | null
 *   Multi-level fallback matching:
 *   1. Exact normalised name
 *   2. Last name + first initial
 *   3. Last name only (only if unique — risky fallback)
 *
 * Usage:
 *   const { normalizePlayerName, matchPlayerName } = require('../utils/playerNameNorm');
 */

function normalizePlayerName(name) {
  let s = (name || '').trim();
  // "Last, First [Middle...]" → "First Middle Last" before any other normalization.
  // DataGolf historically returned this format and it polluted golf_players.
  // Skip if the post-comma part looks like a suffix only (Jr/Sr/II/III/IV) —
  // that's "Davis Love, III" not a swap candidate.
  const comma = s.match(/^([^,]+?),\s*(.+)$/);
  if (comma && !/^(jr|sr|ii|iii|iv)\.?$/i.test(comma[2].trim())) {
    s = comma[2].trim() + ' ' + comma[1].trim();
  }
  return s
    // Explicit substitutions for characters that do NOT decompose via NFD.
    // ø, æ, œ, ł, ð, þ, ß are precomposed ligatures — NFD leaves them unchanged.
    .replace(/[øØ]/g, 'o')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[łŁ]/g, 'l')
    .replace(/[ðÐ]/g, 'd')
    .replace(/[þÞ]/g, 'th')
    .replace(/ß/g, 'ss')
    // NFD decomposition strips everything else: é→e, ü→u, å→a, ñ→n, etc.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.\-,''']/g, '')      // strip periods, hyphens, commas, apostrophes (J.T.→jt)
    .replace(/\s+/g, ' ')
    .trim()
    // Strip generational suffixes ("Davis Love III", "John Daly Jr.")
    // — ESPN sometimes drops them, sometimes keeps them. Normalizing to no
    // suffix on both sides means "John Daly Jr" matches "John Daly" cleanly.
    // Order matters: longer alternatives first so 'iii' wins over 'ii'.
    // Plain 'v' is intentionally NOT stripped (too ambiguous with real names).
    .replace(/\s+(iii|iv|jr|sr|ii)$/, '');
}

/**
 * Match an ESPN display name against an array of player objects { id, name }.
 * Returns the matched player object, or null with a console.error log on miss.
 *
 * @param {string} espnName - Name from ESPN API (may have diacritics, periods, etc.)
 * @param {Array<{id: string, name: string}>} players - Players from golf_players table
 * @param {string} [tournamentName] - For log context
 * @returns {{id: string, name: string} | null}
 */
// Common nickname → formal name mapping for ESPN ↔ DB matching
const NICK_ALIASES = {
  sam: 'samuel', nico: 'nicolas', nick: 'nicholas', mike: 'michael',
  will: 'william', bob: 'robert', bill: 'william', jim: 'james',
  jimmy: 'james', johnny: 'john', matt: 'matthew', dan: 'daniel',
  ben: 'benjamin', chris: 'christopher', tom: 'thomas', tony: 'anthony',
  fred: 'frederick', rick: 'richard', rickie: 'richard', ricky: 'richard',
  alex: 'alexander', ed: 'edward', charlie: 'charles', joe: 'joseph',
  jake: 'jacob', max: 'maximilian', cam: 'cameron',
};

function matchPlayerName(espnName, players, tournamentName) {
  const n = normalizePlayerName(espnName);

  // 1. Exact normalised match
  let m = players.find(p => normalizePlayerName(p.name) === n);
  if (m) return m;

  const parts = n.split(' ');
  if (parts.length < 2) {
    console.error(`[sync] NO MATCH: "${espnName}"${tournamentName ? ` in "${tournamentName}"` : ''} — name too short for fallback matching`);
    return null;
  }

  const last      = parts[parts.length - 1];
  const firstInit = parts[0][0];

  // 1.5. Nickname alias — "Nico Echavarria" → try "Nicolas Echavarria"
  const alias = NICK_ALIASES[parts[0]];
  if (alias) {
    const aliasName = alias + ' ' + parts.slice(1).join(' ');
    m = players.find(p => normalizePlayerName(p.name) === aliasName);
    if (m) return m;
  }
  // Reverse alias — DB has "Nico" but ESPN sends "Nicolas"
  for (const [nick, formal] of Object.entries(NICK_ALIASES)) {
    if (parts[0] === formal) {
      m = players.find(p => normalizePlayerName(p.name) === nick + ' ' + parts.slice(1).join(' '));
      if (m) return m;
    }
  }

  // 2. Last name + first initial
  // Guard: skip if first name token is exactly 2 chars — these are multi-initial
  // abbreviations ("K.H."→"kh", "T.J."→"tj", "J.J."→"jj") that look like initials
  // but would incorrectly match any player sharing the first letter and last name.
  // Single-letter initials ("T."→"t", "J."→"j") are allowed — they're unambiguous
  // in context of a last name.  Real 2-char first names (e.g. "Si") always match at
  // level 1 (exact) and never reach this fallback.
  if (parts[0].length !== 2) {
    m = players.find(p => {
      const pp = normalizePlayerName(p.name).split(' ');
      return pp[pp.length - 1] === last && pp[0]?.[0] === firstInit;
    });
    if (m) return m;
  }

  // 3. Last name only — only safe if exactly one match
  // Same 2-char guard: "K.H. Lee" must not fall through to last-name-only and
  // incorrectly match "Min Woo Lee" when he is the sole Lee in the player pool.
  if (parts[0].length !== 2) {
    const byLast = players.filter(p => normalizePlayerName(p.name).split(' ').pop() === last);
    if (byLast.length === 1) return byLast[0];
  }

  console.error(`[sync] NO MATCH: "${espnName}"${tournamentName ? ` in "${tournamentName}"` : ''} — not found in golf_players table`);
  return null;
}

/**
 * Validate and normalize a parsed competitor object (from parseCompetitor).
 * Returns the same shape with corrections applied plus a `warnings` array.
 *
 * Checks:
 *   1. country_code must be exactly 2 letters — warns if missing or wrong length.
 *   2. name is normalized via normalizePlayerName.
 *   3. Round scores of 0 are coerced to null (0 is invalid; unplayed rounds are null).
 *
 * @param {{ name?: string, country_code?: string, r1?: number|null, r2?: number|null, r3?: number|null, r4?: number|null }} player
 * @returns {object} Validated copy with added `normalized_name` and `warnings` fields.
 */
function validatePlayerData(player) {
  const warnings = [];
  if (!player || typeof player !== 'object') return { warnings: ['invalid input'] };

  // 1. Normalize name
  const normalized_name = normalizePlayerName(player.name);

  // 2. Validate country_code
  let country_code = player.country_code || player.country || null;
  if (!country_code) {
    warnings.push(`missing country_code for "${player.name}"`);
  } else if (country_code.length !== 2) {
    warnings.push(`country_code "${country_code}" is not 2 letters for "${player.name}" — should be ISO 3166-1 alpha-2`);
    country_code = null;  // don't store bad value
  }

  // 3. Coerce 0 round scores → null (0 is not a valid to-par score; null means unplayed)
  const roundKeys = ['r1', 'r2', 'r3', 'r4'];
  const rounds = {};
  for (const k of roundKeys) {
    const v = player[k];
    if (v === 0) {
      warnings.push(`${k} is 0 for "${player.name}" — coerced to null (unplayed)`);
      rounds[k] = null;
    } else {
      rounds[k] = v !== undefined ? v : null;
    }
  }

  return { ...player, ...rounds, country_code, normalized_name, warnings };
}

/**
 * Convert "Last, First [Middle]" → "First Middle Last" for storage. Preserves
 * casing/diacritics — this is the canonical insert form, not a comparison key.
 * Returns the input unchanged if it doesn't look like a comma-swapped name
 * (e.g. "Davis Love, III" is left alone — that's a suffix, not a swap).
 */
function toFirstLast(name) {
  const s = (name || '').trim();
  const m = s.match(/^([^,]+?),\s*(.+)$/);
  if (!m) return s;
  if (/^(jr|sr|ii|iii|iv)\.?$/i.test(m[2].trim())) return s;
  return m[2].trim() + ' ' + m[1].trim();
}

module.exports = { normalizePlayerName, matchPlayerName, validatePlayerData, toFirstLast };
