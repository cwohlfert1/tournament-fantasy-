/**
 * Single source of truth for golf-pool tier visual identity.
 *
 * Approved spec: T1 gold, T2 cyan, T3 purple, T4 slate, T5+ darker slate.
 * Used by every component that displays a player IN the context of a tier
 * (PickSheetTab, PoolRosterTab, StandingsTab, PlayerAvatar).
 *
 * Each color is the "accent" — apply at varied opacities for tints, borders,
 * glow rings. Don't introduce new tier colors elsewhere.
 */
export const TIER_ACCENTS = {
  1: '#FFD700', // gold — elite favorites
  2: '#00B4D8', // cyan — premium contenders
  3: '#9B59B6', // purple — mid-field
  4: '#64748B', // slate — longshots
  5: '#475569', // darker slate — deep longshots
};

export function tierAccent(tierNumber) {
  if (!tierNumber) return TIER_ACCENTS[5];
  return TIER_ACCENTS[tierNumber] || TIER_ACCENTS[5];
}

/** rgba helper — converts our hex tokens to alpha tints for backgrounds + borders */
export function tierTint(tierNumber, alpha = 0.03) {
  const hex = tierAccent(tierNumber).replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
