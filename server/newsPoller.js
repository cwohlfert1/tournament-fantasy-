const https = require('https');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const FEEDS = [
  { url: 'https://news.google.com/rss/search?q=NCAA+tournament+fantasy+basketball+strategy&hl=en-US&gl=US&ceid=US:en',   tag: 'strategy'    },
  { url: 'https://news.google.com/rss/search?q=NCAA+tournament+sleeper+picks+basketball&hl=en-US&gl=US&ceid=US:en',       tag: 'sleepers'    },
  { url: 'https://news.google.com/rss/search?q=March+Madness+basketball+player+rankings&hl=en-US&gl=US&ceid=US:en',       tag: 'rankings'    },
  { url: 'https://news.google.com/rss/search?q=college+basketball+tournament+predictions+2026&hl=en-US&gl=US&ceid=US:en', tag: 'predictions' },
  { url: 'https://news.google.com/rss/search?q=NCAA+tournament+player+injury+2026&hl=en-US&gl=US&ceid=US:en',             tag: 'injuries'    },
  { url: 'https://news.google.com/rss/search?q=college+basketball+tournament+injury+report&hl=en-US&gl=US&ceid=US:en',    tag: 'injuries'    },
  { url: 'https://news.google.com/rss/search?q=march+madness+player+out+injury+2026&hl=en-US&gl=US&ceid=US:en',           tag: 'injuries'    },
];

// Keep at most this many articles in the DB total
const MAX_ARTICLES = 160;

function fetchRaw(url, redirects = 0) {
  if (redirects > 3) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TourneyRun/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        return fetchRaw(res.headers.location, redirects + 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timed out')); });
  });
}

function extractText(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return '';
  return m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function parseItems(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const title = extractText(block, 'title');
    if (!title) continue;

    // Google News wraps the real URL in <link> after the item tag (not inside CDATA)
    const linkMatch = block.match(/<link>([^<]+)<\/link>/i) || block.match(/<link\s+href="([^"]+)"/i);
    const url = linkMatch ? linkMatch[1].trim() : '';
    if (!url || url.startsWith('http') === false) continue;

    // Source: Google News puts it in <source url="...">Name</source>
    const sourceMatch = block.match(/<source[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/i);
    const source = sourceMatch ? sourceMatch[1].replace(/&amp;/g, '&').trim() : '';

    // Publication date
    const pubDate = extractText(block, 'pubDate');

    items.push({ title, url, source, pubDate });
  }
  return items;
}

const upsert = db.prepare(`
  INSERT INTO news_articles (id, title, url, source, published_at, feed_tag)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(url) DO UPDATE SET
    title = excluded.title,
    source = excluded.source,
    published_at = excluded.published_at,
    fetched_at = CURRENT_TIMESTAMP
`);

async function pollNews() {
  try {
    console.log('[News] Polling strategy news feeds...');
    let total = 0;

    for (const feed of FEEDS) {
      try {
        const xml = await fetchRaw(feed.url);
        const items = parseItems(xml);
        for (const item of items) {
          upsert.run(uuidv4(), item.title, item.url, item.source, item.pubDate, feed.tag);
          total++;
        }
      } catch (err) {
        console.warn(`[News] Feed error (${feed.tag}): ${err.message}`);
      }
    }

    // Prune injury articles older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const injuryArticles = db.prepare("SELECT id, published_at FROM news_articles WHERE feed_tag = 'injuries'").all();
    const staleInjuryIds = injuryArticles
      .filter(a => { const d = new Date(a.published_at); return !isNaN(d) && d < thirtyDaysAgo; })
      .map(a => a.id);
    if (staleInjuryIds.length > 0) {
      const ph = staleInjuryIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM news_articles WHERE id IN (${ph})`).run(...staleInjuryIds);
      console.log(`[News] Pruned ${staleInjuryIds.length} stale injury article(s) older than 30 days.`);
    }

    // Prune oldest articles beyond MAX_ARTICLES
    const count = db.prepare('SELECT COUNT(*) as n FROM news_articles').get().n;
    if (count > MAX_ARTICLES) {
      db.prepare(`
        DELETE FROM news_articles WHERE id IN (
          SELECT id FROM news_articles ORDER BY fetched_at ASC LIMIT ?
        )
      `).run(count - MAX_ARTICLES);
    }

    console.log(`[News] Done — ${total} article(s) processed, ${Math.min(count, MAX_ARTICLES)} total cached.`);
  } catch (err) {
    console.error('[News poller] Fatal error:', err.message);
  }
}

module.exports = { pollNews };
