import { useState, useEffect } from 'react';
import { useDocTitle } from '../../hooks/useDocTitle';
import api from '../../api';

const NEWS_TABS = [
  { key: 'golf_news',     label: 'PGA Tour News'  },
  { key: 'golf_tips',     label: 'Fantasy Tips'   },
  { key: 'golf_injuries', label: 'WD & Injuries'  },
];

export default function GolfNews() {
  useDocTitle('News | TourneyRun Golf');

  const [activeTab, setActiveTab] = useState('golf_news');
  const [articles, setArticles]   = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    setLoading(true);
    setArticles([]);
    api.get(`/news?tag=${activeTab}`)
      .then(res => setArticles(res.data.articles || []))
      .catch(() => setArticles([]))
      .finally(() => setLoading(false));
  }, [activeTab]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-8">
        <p style={{ color: '#22c55e', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 12 }}>
          Golf News
        </p>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">What's happening on tour</h1>
        <p className="text-gray-400 text-base leading-relaxed">
          Latest news, fantasy tips, and injury updates from the PGA Tour.
        </p>
      </div>

      {/* Tab bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div style={{ display: 'flex', borderBottom: '1px solid #1f2937' }}>
          {NEWS_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              style={{
                flex: 1,
                padding: '12px 8px',
                fontSize: 12,
                fontWeight: activeTab === key ? 700 : 400,
                color: activeTab === key ? '#22c55e' : '#6b7280',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === key ? '2px solid #22c55e' : '2px solid transparent',
                cursor: 'pointer',
                transition: 'color 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Articles */}
        <div style={{ minHeight: 200 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>Loading…</div>
          ) : articles.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#4b5563', fontSize: 13 }}>No articles found.</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {articles.slice(0, 12).map((a, i) => (
                <li key={i} style={{ borderBottom: '1px solid #111827' }}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'block', padding: '12px 20px', textDecoration: 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#111827'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ fontSize: 14, color: '#e5e7eb', lineHeight: 1.45, marginBottom: 3 }}>{a.title}</div>
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
    </div>
  );
}
