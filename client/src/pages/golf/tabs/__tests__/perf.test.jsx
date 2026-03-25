import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState, useEffect } from 'react';

// ── #6 + #3: computeRanks (duplicated here for unit testing) ──────────────────

function computeRanks(standings, scoringStyle) {
  const lowerIsBetter = scoringStyle === 'total_strokes';
  const arr = standings.map((s) => ({ pts: s.season_points ?? 0 }));
  return arr.map(({ pts }) => {
    const rank = lowerIsBetter
      ? arr.filter(x => x.pts < pts).length + 1
      : arr.filter(x => x.pts > pts).length + 1;
    const tied = arr.filter(x => x.pts === pts).length > 1;
    return { rank, tied };
  });
}

describe('computeRanks', () => {
  it('ranks by fantasy_points descending', () => {
    const standings = [
      { season_points: 100 },
      { season_points: 80 },
      { season_points: 60 },
    ];
    const ranks = computeRanks(standings, 'fantasy_points');
    expect(ranks[0].rank).toBe(1);
    expect(ranks[1].rank).toBe(2);
    expect(ranks[2].rank).toBe(3);
  });

  it('ranks by total_strokes ascending (lower is better)', () => {
    const standings = [
      { season_points: -10 },
      { season_points: -5 },
      { season_points: 0 },
    ];
    const ranks = computeRanks(standings, 'total_strokes');
    expect(ranks[0].rank).toBe(1);
    expect(ranks[1].rank).toBe(2);
    expect(ranks[2].rank).toBe(3);
  });

  it('marks tied entries', () => {
    const standings = [
      { season_points: 100 },
      { season_points: 100 },
      { season_points: 50 },
    ];
    const ranks = computeRanks(standings, 'fantasy_points');
    expect(ranks[0].rank).toBe(1);
    expect(ranks[0].tied).toBe(true);
    expect(ranks[1].rank).toBe(1);
    expect(ranks[1].tied).toBe(true);
    expect(ranks[2].rank).toBe(3);
    expect(ranks[2].tied).toBe(false);
  });

  it('handles null season_points as 0', () => {
    const standings = [{ season_points: null }, { season_points: 50 }];
    const ranks = computeRanks(standings, 'fantasy_points');
    expect(ranks[1].rank).toBe(1);
    expect(ranks[0].rank).toBe(2);
  });
});

// ── #4: FetchAge isolated component ───────────────────────────────────────────

function FetchAge({ lastFetch }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!lastFetch) return;
    setSecs(0);
    const iv = setInterval(() => setSecs(Math.floor((Date.now() - lastFetch) / 1000)), 5000);
    return () => clearInterval(iv);
  }, [lastFetch]);
  if (!lastFetch) return null;
  const txt = secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`;
  return <span data-testid="fetch-age">{txt}</span>;
}

describe('FetchAge component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('renders nothing when lastFetch is null', () => {
    const { container } = render(<FetchAge lastFetch={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows 0s ago immediately after fetch', () => {
    render(<FetchAge lastFetch={Date.now()} />);
    expect(screen.getByTestId('fetch-age').textContent).toBe('0s ago');
  });

  it('updates to minutes after 60+ seconds', () => {
    const start = Date.now();
    render(<FetchAge lastFetch={start} />);
    act(() => { vi.advanceTimersByTime(65_000); });
    expect(screen.getByTestId('fetch-age').textContent).toBe('1m ago');
  });

  it('cleans up interval on unmount', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval');
    const { unmount } = render(<FetchAge lastFetch={Date.now()} />);
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
