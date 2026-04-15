/**
 * PlayerAvatar — ESPN headshot circle with tier-colored initials fallback.
 *
 * Used everywhere a player appears in tier context: pick rows, roster cards,
 * standings rows, % owned grids. Single source of truth for player visual
 * identity so a face is recognizable across the whole app.
 *
 * Headshot URL: https://a.espncdn.com/i/headshots/golf/players/full/{id}.png
 * Falls back to initials at tier color (15% opacity tint) when:
 *   - espnPlayerId is null/missing (most pre-tournament rows)
 *   - The image fails to load (player not in ESPN's CDN)
 *
 * Never shows the broken-image icon — the onError handler swaps to initials
 * before the fallback chrome renders.
 */
import { useState } from 'react';
import { tierAccent, tierTint } from '../../utils/golfTierColors';

export default function PlayerAvatar({ name, tier, espnPlayerId, size = 36 }) {
  const [imgFailed, setImgFailed] = useState(false);
  const accent = tierAccent(tier);
  // eslint-disable-next-line no-console
  console.log(`[PlayerAvatar] name=${JSON.stringify(name)} espnPlayerId=${JSON.stringify(espnPlayerId)} tier=${JSON.stringify(tier)} imgFailed=${imgFailed}`);
  const initials = (name || '?')
    .replace(/^.+,\s*/, '')         // "Scheffler, Scottie" → "Scottie"
    .split(/\s+/)
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const showPhoto = espnPlayerId && !imgFailed;

  if (showPhoto) {
    return (
      <div
        style={{
          width: size, height: size, borderRadius: '50%', flexShrink: 0,
          overflow: 'hidden',
          background: tierTint(tier, 0.15),
          border: `1px solid ${tierTint(tier, 0.35)}`,
          position: 'relative',
        }}
      >
        <img
          src={`https://a.espncdn.com/i/headshots/golf/players/full/${espnPlayerId}.png`}
          alt={name || ''}
          loading="lazy"
          onError={() => setImgFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  // Initials fallback — tier color at 15% with full-color text
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: tierTint(tier, 0.15),
        border: `1px solid ${tierTint(tier, 0.35)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: accent,
        fontWeight: 700,
        fontSize: Math.round(size * 0.36),
        letterSpacing: '0.02em',
      }}
    >
      {initials || '?'}
    </div>
  );
}
