/**
 * GolferStack — overlapping mini avatars of a team's top golfers, shown
 * inline on leaderboard rows. Classic fantasy-sports scanning pattern
 * (ESPN / Yahoo / Sleeper).
 *
 * Default ranking: top by fantasy_points desc, then by tier asc.
 * Pre-tournament (no scores): first 3 picks in tier order.
 *
 * Props:
 *   picks   Array<{ espn_player_id, player_name, tier_number, fantasy_points? }>
 *   max     number of faces to show (default 3)
 *   size    px diameter per avatar (default 22)
 */
import PlayerAvatar from './PlayerAvatar';

export default function GolferStack({ picks = [], max = 3, size = 22 }) {
  if (!picks || picks.length === 0) return null;

  // Rank: highest fantasy_points first, then lowest tier_number. Exclude dropped.
  const ranked = [...picks]
    .filter(p => !p.is_dropped)
    .sort((a, b) => {
      const apts = a.fantasy_points ?? 0;
      const bpts = b.fantasy_points ?? 0;
      if (apts !== bpts) return bpts - apts;
      return (a.tier_number || 99) - (b.tier_number || 99);
    })
    .slice(0, max);

  if (ranked.length === 0) return null;

  const extra = picks.filter(p => !p.is_dropped).length - ranked.length;
  const overlap = Math.round(size * 0.32);

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
      aria-label={`Team lineup: ${ranked.map(p => p.player_name).join(', ')}${extra > 0 ? ` and ${extra} more` : ''}`}
    >
      {ranked.map((p, i) => (
        <div
          key={p.player_id || i}
          style={{
            marginLeft: i === 0 ? 0 : -overlap,
            zIndex: ranked.length - i,
            boxShadow: '0 0 0 2px #111827',
            borderRadius: '50%',
            flexShrink: 0,
          }}
          title={p.player_name}
        >
          <PlayerAvatar
            name={p.player_name}
            tier={p.tier_number}
            espnPlayerId={p.espn_player_id}
            size={size}
          />
        </div>
      ))}
      {extra > 0 && (
        <div
          style={{
            marginLeft: -overlap,
            width: size, height: size, borderRadius: '50%',
            background: 'rgba(30,41,59,0.95)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 0 0 2px #111827',
            color: '#9ca3af',
            fontSize: Math.round(size * 0.38),
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            letterSpacing: '-0.02em',
          }}
          title={`${extra} more`}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}
