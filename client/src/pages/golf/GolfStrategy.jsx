import { useState, useEffect } from 'react';
import { useDocTitle } from '../../hooks/useDocTitle';
import api from '../../api';

const TIPS = [
  {
    icon: '⛳',
    title: 'Target the right salary tier',
    body: "Don't blow your entire $2,400 cap on two superstars. The sweet spot is 3–4 mid-tier golfers ($250–$350) who play consistently all season, anchored by one elite stud. Guys ranked 20–50 in the world offer near-top scoring at a fraction of the price — and they play every week.",
  },
  {
    icon: '🏆',
    title: 'Majors are everything',
    body: "All points multiply 1.5× at The Masters, PGA Championship, US Open, and The Open Championship. An eagle at Augusta is worth 12 pts. A top-5 finish at a major is 18 pts. One great major week can move you 40+ positions in season standings. Target form players entering major weeks — not just world-ranking names.",
  },
  {
    icon: '📊',
    title: 'Made cuts are your scoring floor',
    body: "The −5 missed-cut penalty destroys seasons. A player who misses 4 cuts costs you 20 points — the equivalent of a top-5 finish. Build your core 4 around high-floor players who make cuts at 70%+ even in elite fields. Save your upside gambles for flex spots.",
  },
  {
    icon: '🔀',
    title: 'Stream the waiver wire',
    body: "Your 4 flex spots are where you win leagues. Stream players who historically dominate the upcoming venue, then swap them after the event via FAAB. Identify returning players coming off a break — they often run hot in their first event back. Snipe them for $10–$30 while others overpay for the obvious targets.",
  },
  {
    icon: '💎',
    title: 'World ranking undervalues form players',
    body: "A player ranked 55th in the world who has made 8 of his last 10 cuts and finished top-20 in 4 of them is worth more than his ranking suggests. Check Strokes Gained: Total over the last 8 weeks — recent form predicts fantasy results far better than season-long averages or world rankings.",
  },
  {
    icon: '🎯',
    title: 'Flex spots are your upside engine',
    body: "Your 4 core spots should be reliable studs. Your 4 flex spots should be calculated swings — target players with a specific course history edge, players coming off rest, or bombers entering a venue that rewards length. One flex pick who wins a tournament adds 30 pts. That swings a season.",
  },
  {
    icon: '⚠️',
    title: 'Watch the WD and injury wire',
    body: "Withdrawals (WDs) happen every week. A player who WDs after round 1 still gets scored on those holes — but anyone still on your roster who misses the cut gets −5. Monitor beat reporters and the PGA Tour site Tuesday–Wednesday for late WDs. Drop injured players before they cost you a −5 penalty.",
  },
  {
    icon: '🧠',
    title: "Don't sleep on The Open Championship",
    body: "American managers consistently underprice links specialists. Dustin Johnson types who bomb it on U.S. setups often struggle at The Open, while low-ball shot-shapers from Europe and Australia thrive. This creates a pricing inefficiency in the auction — you can often draft a links ace cheap while others fight over the favorites.",
  },
];

const NEWS_TABS = [
  { key: 'golf_news',     label: 'PGA Tour News'    },
  { key: 'golf_tips',     label: 'Fantasy Tips'     },
  { key: 'golf_injuries', label: 'WD & Injuries'    },
];

function NewsSection() {
  const [activeTab, setActiveTab] = useState('golf_news');
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setArticles([]);
    api.get(`/news?tag=${activeTab}`)
      .then(res => setArticles(res.data.articles || []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, [activeTab]);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1f2937' }}>
        {NEWS_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            style={{
              flex: 1,
              padding: '10px 8px',
              fontSize: 12,
              fontWeight: activeTab === key ? 600 : 400,
              color: activeTab === key ? '#4ade80' : '#6b7280',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === key ? '2px solid #4ade80' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Articles */}
      <div style={{ minHeight: 180 }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>Loading…</div>
        ) : articles.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>No articles found.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {articles.slice(0, 8).map((a, i) => (
              <li key={i} style={{ borderBottom: '1px solid #111827' }}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'block', padding: '10px 16px', textDecoration: 'none' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#111827'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ fontSize: 13, color: '#e5e7eb', lineHeight: 1.4, marginBottom: 2 }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: '#4b5563' }}>
                    {a.source}{a.source && a.published_at ? ' · ' : ''}{a.published_at ? new Date(a.published_at).toLocaleDateString() : ''}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function GolfStrategy() {
  useDocTitle('Golf Strategy | TourneyRun');

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
          ⛳ Golf Strategy Guide
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">Win your golf league</h1>
        <p className="text-gray-400 text-base max-w-2xl leading-relaxed">
          Season-long fantasy golf rewards patience and smart roster management. These tips apply to the TourneyRun format — one draft, all season, majors at 1.5×.
        </p>
      </div>

      {/* Tips grid */}
      <div className="grid sm:grid-cols-2 gap-4 mb-10">
        {TIPS.map(({ icon, title, body }) => (
          <div
            key={title}
            className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-green-500/25 transition-colors"
          >
            <div className="flex items-start gap-3 mb-2">
              <span className="text-xl shrink-0">{icon}</span>
              <h3 className="text-white font-bold text-sm leading-snug">{title}</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed pl-8">{body}</p>
          </div>
        ))}
      </div>

      {/* Quick scoring reference */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 sm:p-6 mb-8">
        <h3 className="text-white font-bold text-sm mb-4">⚡ Quick Scoring Reference</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5 text-sm mb-4">
          {[
            { label: 'Eagle',      pts: '+8',   color: 'text-yellow-400' },
            { label: 'Birdie',     pts: '+3',   color: 'text-green-400'  },
            { label: 'Par',        pts: '+0.5', color: 'text-gray-300'   },
            { label: 'Bogey',      pts: '−0.5', color: 'text-orange-400' },
            { label: 'Double+',    pts: '−2',   color: 'text-red-400'    },
            { label: '1st Place',  pts: '+30',  color: 'text-green-400'  },
            { label: 'Top 5',      pts: '+12',  color: 'text-green-400'  },
            { label: 'Top 10',     pts: '+8',   color: 'text-green-400'  },
            { label: 'Top 25',     pts: '+3',   color: 'text-green-400'  },
            { label: 'Made Cut',   pts: '+2',   color: 'text-green-400'  },
            { label: 'Missed Cut', pts: '−5',   color: 'text-red-400'    },
          ].map(({ label, pts, color }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="text-gray-400">{label}</span>
              <span className={`font-bold ${color}`}>{pts}</span>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t border-gray-800 flex items-center gap-2">
          <span className="text-yellow-400">⭐</span>
          <span className="text-yellow-400 font-bold text-sm">Majors: all points × 1.5</span>
          <span className="text-gray-600 text-xs ml-auto hidden sm:inline">Masters · PGA Champ · US Open · The Open</span>
        </div>
      </div>

      {/* Live news section */}
      <div>
        <h3 className="text-white font-bold text-sm mb-3">📰 Latest Golf News</h3>
        <NewsSection />
      </div>
    </div>
  );
}
