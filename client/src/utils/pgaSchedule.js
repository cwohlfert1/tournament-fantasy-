/**
 * Shared PGA Tour 2026 schedule + status helpers.
 *
 * Single source of truth for "what's happening on Tour right now" across
 * landing pages. Derives everything from today's date so the UI auto-rolls
 * between tournaments with no manual updates mid-season.
 *
 * Status derivation:
 *   - live       — today is between start and end (inclusive)
 *   - next       — first tournament that starts strictly after today
 *   - upcoming   — any future tournament after "next"
 *   - completed  — end date has passed
 */

export const TOUR_SCHEDULE = [
  { name: 'AT&T Pebble Beach Pro-Am',     start: '2026-02-12', end: '2026-02-15', type: 'signature' },
  { name: 'Genesis Invitational',         start: '2026-02-19', end: '2026-02-22', type: 'signature' },
  { name: 'Arnold Palmer Invitational',   start: '2026-03-05', end: '2026-03-08', type: 'signature' },
  { name: 'Masters Tournament',           start: '2026-04-09', end: '2026-04-13', type: 'major'     },
  { name: 'RBC Heritage',                 start: '2026-04-16', end: '2026-04-19', type: 'signature' },
  { name: 'Cadillac Championship',        start: '2026-04-30', end: '2026-05-03', type: 'signature' },
  { name: 'Truist Championship',          start: '2026-05-07', end: '2026-05-10', type: 'signature' },
  { name: 'PGA Championship',             start: '2026-05-11', end: '2026-05-17', type: 'major'     },
  { name: 'The Memorial Tournament',      start: '2026-06-04', end: '2026-06-07', type: 'signature' },
  { name: 'US Open',                      start: '2026-06-15', end: '2026-06-21', type: 'major'     },
  { name: 'Travelers Championship',       start: '2026-06-25', end: '2026-06-28', type: 'signature' },
  { name: 'The Open Championship',        start: '2026-07-13', end: '2026-07-19', type: 'major'     },
];

export function _today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getLiveEvent(today = _today()) {
  return TOUR_SCHEDULE.find(t => {
    const s = new Date(t.start + 'T00:00:00');
    const e = new Date(t.end   + 'T23:59:59');
    return today >= s && today <= e;
  }) || null;
}

export function getNextUpEvent(today = _today()) {
  return TOUR_SCHEDULE.find(t => new Date(t.start + 'T00:00:00') > today) || null;
}

export function daysUntil(dateStr, today = _today()) {
  const target = new Date(dateStr + 'T00:00:00');
  return Math.max(0, Math.ceil((target - today) / 86400000));
}

export function getEventStatus(t, today = _today(), nextUpName = null) {
  const start = new Date(t.start + 'T00:00:00');
  const end   = new Date(t.end   + 'T23:59:59');
  if (end < today) return 'completed';
  if (today >= start && today <= end) return 'live';
  if (nextUpName && t.name === nextUpName) return 'next';
  return 'upcoming';
}
