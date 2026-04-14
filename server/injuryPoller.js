const https = require('https');
const http = require('http');
const db = require('./db/index');

const INJURY_KEYWORDS = [
  'injured', 'out', 'doubtful', 'questionable', 'day-to-day',
  'limited', 'ankle', 'knee', 'concussion', 'illness', 'scratch',
  "won't play", 'unlikely to play', 'missed practice', 'will not play',
  'ruled out', 'sidelined', 'hip', 'hamstring', 'shoulder', 'wrist',
];
// Pre-compiled word-boundary regexes — prevents 'hip' matching 'championship',
// 'injured' matching 'uninjured', 'limited' matching 'unlimited', etc.
const INJURY_REGEXES = INJURY_KEYWORDS.map(
  w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
);

// News sources — broad NCAA tournament injury search; a few feeds cover most cases
const NEWS_FEEDS = [
  'https://news.google.com/rss/search?q=NCAA+tournament+injury+college+basketball&hl=en-US&gl=US&ceid=US:en',
  'https://news.google.com/rss/search?q=NCAA+March+Madness+player+injury+out&hl=en-US&gl=US&ceid=US:en',
  'https://www.espn.com/espn/rss/ncb/news',
];

function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TourneyRun/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    }, (res) => {
      // Follow one redirect
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        fetchRaw(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

// Parse <title> text from RSS <item> blocks
function extractHeadlines(xml) {
  const headlines = [];
  // Match <item>...</item> blocks
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const item of items) {
    // Prefer <title> inside the item; strip CDATA wrappers
    const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    if (titleMatch?.[1]) headlines.push({ text: titleMatch[1].trim(), headline: titleMatch[1].trim() });
    if (descMatch?.[1]) {
      const plain = descMatch[1].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      if (plain) headlines.push({ text: plain, headline: titleMatch?.[1]?.trim() || plain });
    }
  }
  return headlines;
}

function hasInjuryKeyword(text) {
  return INJURY_REGEXES.some(re => re.test(text));
}

// Build a map: normalized-name -> player row
async function buildPlayerIndex() {
  const players = await db.all('SELECT id, name FROM players');
  const index = new Map();
  for (const p of players) {
    const lower = p.name.toLowerCase().trim();
    index.set(lower, p);
    // Also index by last name (collision-safe: only add if unique last name)
    const parts = lower.split(' ');
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      if (!index.has(`_last_${last}`)) {
        index.set(`_last_${last}`, p);
      } else {
        // Duplicate last name — remove so it won't false-match
        index.delete(`_last_${last}`);
      }
    }
  }
  return index;
}

function findPlayerInText(text, playerIndex) {
  const lower = text.toLowerCase();
  for (const [key, player] of playerIndex) {
    if (key.startsWith('_last_')) {
      const lastName = key.slice(6);
      // Only match last name when surrounded by word boundaries
      const re = new RegExp(`\\b${lastName}\\b`);
      if (re.test(lower)) return player;
    } else {
      if (lower.includes(key)) return player;
    }
  }
  return null;
}

async function pollInjuries() {
  try {
    console.log('[Injuries] Scanning news feeds for injury reports...');

    const playerIndex = await buildPlayerIndex();
    // Map of player_id -> best headline found
    const flagged = new Map();

    for (const feedUrl of NEWS_FEEDS) {
      try {
        const xml = await fetchRaw(feedUrl);
        const items = extractHeadlines(xml);
        for (const { text, headline } of items) {
          if (!hasInjuryKeyword(text)) continue;
          const player = findPlayerInText(text, playerIndex);
          if (player && !flagged.has(player.id)) {
            // Clean up HTML entities in the headline
            const clean = headline.replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim();
            flagged.set(player.id, clean);
          }
        }
      } catch (err) {
        console.warn(`[Injuries] Feed error (${feedUrl}): ${err.message}`);
      }
    }

    // Reset auto-detected flags only — preserve manual OUT designations
    await db.run("UPDATE players SET injury_flagged = 0, injury_headline = '' WHERE injury_status != 'OUT'");
    for (const [id, headline] of flagged) {
      await db.run('UPDATE players SET injury_flagged = 1, injury_headline = ? WHERE id = ?', headline, id);
    }

    // Clear flags for players who have played in the last 5 completed game days
    // (injury news may be stale — if they've suited up recently, they're not hurt)
    // Never clear manually designated OUT players.
    const recentDates = (await db.all(`
      SELECT DISTINCT game_date FROM games
      WHERE is_completed = 1 ORDER BY game_date DESC LIMIT 5
    `)).map(r => r.game_date);

    if (recentDates.length > 0) {
      const ph = recentDates.map(() => '?').join(',');
      const cleared = await db.run(`
        UPDATE players SET injury_flagged = 0, injury_headline = ''
        WHERE injury_flagged = 1
        AND injury_status != 'OUT'
        AND id IN (
          SELECT DISTINCT ps.player_id
          FROM player_stats ps
          JOIN games g ON ps.game_id = g.id
          WHERE g.is_completed = 1 AND g.game_date IN (${ph})
        )
      `, ...recentDates);
      if (cleared.changes > 0) {
        console.log(`[Injuries] Cleared ${cleared.changes} flag(s) for players who played in the last ${recentDates.length} game day(s).`);
      }
    }

    console.log(`[Injuries] Done — ${flagged.size} player(s) flagged from news.`);
  } catch (err) {
    console.error('[Injuries poller] Fatal error:', err.message);
  }
}

module.exports = { pollInjuries };
