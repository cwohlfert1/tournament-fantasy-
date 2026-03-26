import { useState, useEffect } from 'react';
import api from '../../../api';

const TIER_COLORS = {
  1: { label: '#fbbf24', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.3)' },
  2: { label: '#a78bfa', bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.3)' },
  3: { label: '#60a5fa', bg: 'rgba(59,130,246,0.15)', border: 'rgba(59,130,246,0.3)' },
  4: { label: '#34d399', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)' },
};

const toFlag = code => {
  if (!code || code.length !== 2) return '🏌️';
  return code.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
};

export default function OwnershipTab({ leagueId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/golf/leagues/${leagueId}/standings`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId]); // eslint-disable-line

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>Loading…</div>;
  }

  const standings = data?.standings || [];
  const teamCount = standings.filter(s => (s.picks || []).length > 0).length;

  if (teamCount === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
        No picks submitted yet.
      </div>
    );
  }

  // Aggregate player ownership across all teams
  const map = {};
  for (const s of standings) {
    for (const pick of (s.picks || [])) {
      const key = pick.player_name;
      if (!map[key]) {
        map[key] = {
          player_name: pick.player_name,
          tier_number: pick.tier_number,
          country: pick.country,
          count: 0,
        };
      }
      map[key].count++;
    }
  }

  const players = Object.values(map).sort(
    (a, b) => b.count - a.count || (a.tier_number || 9) - (b.tier_number || 9)
  );
  const maxCount = players[0]?.count || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ color: '#4b5563', fontSize: 12 }}>
        {players.length} players · {teamCount} teams submitted
      </div>

      <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, overflow: 'hidden' }}>
        {/* Column headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 48px 72px', gap: 0, padding: '8px 14px', borderBottom: '1px solid #1f2937' }}>
          {['#', 'Player', 'Tier', '% Owned'].map((h, i) => (
            <div key={h} style={{ textAlign: i >= 2 ? 'center' : 'left', color: '#374151', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>

        {players.map((p, i) => {
          const pct = Math.round((p.count / teamCount) * 100);
          const tc = TIER_COLORS[p.tier_number] || TIER_COLORS[4];
          const barWidth = Math.round((p.count / maxCount) * 100);

          return (
            <div
              key={p.player_name}
              style={{ display: 'grid', gridTemplateColumns: '28px 1fr 48px 72px', gap: 0, padding: '10px 14px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
            >
              {/* Rank */}
              <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 700 }}>{i + 1}</div>

              {/* Player name + bar */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{toFlag(p.country)}</span>
                  <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.player_name}
                  </span>
                </div>
                <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                  <div style={{ height: '100%', width: `${barWidth}%`, background: tc.label, borderRadius: 2, transition: 'width 0.4s ease' }} />
                </div>
              </div>

              {/* Tier badge */}
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: tc.label, background: tc.bg, border: `1px solid ${tc.border}`, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.04em' }}>
                  T{p.tier_number || '?'}
                </span>
              </div>

              {/* Ownership */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 700 }}>{pct}%</div>
                <div style={{ color: '#4b5563', fontSize: 10 }}>{p.count}/{teamCount}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
