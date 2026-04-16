import { useState, useEffect, useRef } from 'react';
import { Flag } from 'lucide-react';
import api from '../../../api';
import Select from '../../../components/ui/Select';

// ── Hole-by-hole scorecard helpers
function holeSym(strokes, toparStr) {
  if (strokes == null || toparStr == null) return { text: '·', color: '#374151' };
  const diff = toparStr === 'E' ? 0 : parseInt(toparStr, 10);
  if (isNaN(diff)) return { text: '·', color: '#374151' };
  if (diff <= -2) return { text: '◎', color: '#f59e0b', title: 'Eagle or better' };
  if (diff === -1) return { text: '●', color: '#22c55e', title: 'Birdie' };
  if (diff === 0)  return { text: String(strokes), color: '#e5e7eb', title: 'Par' };
  if (diff === 1)  return { text: '□', color: '#f59e0b', title: 'Bogey' };
  return { text: '■', color: '#ef4444', title: 'Double bogey+' };
}

function HoleScorecard({ holes, currentRound }) {
  if (!holes || holes.length === 0) {
    return (
      <div style={{ color: '#4b5563', fontSize: 11, fontStyle: 'italic', textAlign: 'center', padding: '8px 0' }}>
        Hole-by-hole data unavailable
      </div>
    );
  }

  const front = holes.filter(h => h.hole <= 9).sort((a, b) => a.hole - b.hole);
  const back  = holes.filter(h => h.hole >= 10).sort((a, b) => a.hole - b.hole);

  const cellStyle = { textAlign: 'center', minWidth: 22, fontSize: 12 };
  const hdrStyle  = { ...cellStyle, color: '#4b5563', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em' };

  function renderNine(nineHoles) {
    return nineHoles.map(h => {
      const { text, color, title } = holeSym(h.strokes, h.topar);
      return (
        <div key={h.hole} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 22 }}>
          <div style={hdrStyle}>{h.hole}</div>
          <div style={{ ...cellStyle, color, fontWeight: 700, fontSize: 13 }} title={title}>{text}</div>
        </div>
      );
    });
  }

  return (
    <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, minWidth: 'max-content' }}>
        <div style={{ display: 'flex', gap: 2 }}>{renderNine(front)}</div>
        {back.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 6px', gap: 2 }}>
            <div style={{ color: '#1f2937', fontSize: 9, fontWeight: 700 }}>│</div>
            <div style={{ color: '#1f2937', fontSize: 9 }}>│</div>
            <div style={{ color: '#1f2937', fontSize: 9 }}>│</div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 2 }}>{renderNine(back)}</div>
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {[['◎', '#f59e0b', 'Eagle+'], ['●', '#22c55e', 'Birdie'], ['#', '#e5e7eb', 'Par (digit)'], ['□', '#f59e0b', 'Bogey'], ['■', '#ef4444', 'Dbl+']].map(([sym, col, lbl]) => (
          <span key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: '#4b5563' }}>
            <span style={{ color: col, fontWeight: 700, fontSize: 11 }}>{sym}</span>{lbl}
          </span>
        ))}
      </div>
    </div>
  );
}

// Isolated component so the 5-second tick only re-renders this element,
// not the entire leaderboard table.
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
  return <span style={{ color: '#374151', fontSize: 10 }}>Updated {txt}</span>;
}

export default function PGALiveTab({ leagueId, league }) {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('all');
  const [sortBy, setSortBy]       = useState('position');
  const [expandedRow, setExpandedRow] = useState(null);
  const pgaRowRefs = useRef({});
  const [lastFetch, setLastFetch] = useState(null);

  async function load() {
    try {
      const r = await api.get(`/golf/leagues/${leagueId}/pga-live`);
      console.log('PGA raw response:', r);
      console.log('PGA data:', r.data);
      console.log('competitors length:', r.data?.competitors?.length);
      console.log('no_event:', r.data?.no_event, 'fetch_error:', r.data?.fetch_error);
      setData(r.data);
      setLastFetch(Date.now());
    } catch (err) {
      console.error('PGA fetch error:', err);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, 60_000);
    return () => clearInterval(iv);
  }, [leagueId]); // eslint-disable-line


  if (loading) return <div className="py-10 text-center text-gray-500 text-sm">Loading leaderboard…</div>;

  const competitors  = data?.competitors || [];
  const tournament   = data?.tournament;
  const myPickNames  = data?.my_pick_names || [];
  const isLive       = tournament?.status === 'active';

  const isPreTournament = competitors.length > 0 && competitors.every(c => c.isScheduled);

  if (data?.no_event || data?.fetch_error || competitors.length === 0) {
    const isScheduledTournament = tournament?.status === 'scheduled';
    return (
      <div className="py-12 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto">
          <Flag className="w-7 h-7 text-gray-600" />
        </div>
        <p className="text-white font-bold text-sm">{tournament?.name || 'PGA Tour Event'}</p>
        <p className="text-gray-500 text-sm">
          {data?.no_event
            ? 'No tournament ESPN ID configured for this league.'
            : isScheduledTournament
            ? 'Field not yet posted. Check back closer to tee time.'
            : 'Leaderboard unavailable right now.'}
        </p>
        {tournament?.start_date && (
          <p className="text-gray-600 text-xs">Starts {tournament.start_date}</p>
        )}
        <button onClick={load} style={{ color: '#22c55e', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  const norm = s => (s || '').toLowerCase().replace(/[.']/g, '').trim();
  const myPickSet = new Set(myPickNames.map(norm));
  const isMyPick  = name => myPickSet.has(norm(name));

  const maxRound = competitors.reduce((mx, c) => Math.max(mx, c.currentRound || 0), 0);

  const fmtTeeTime = (isoStr, hole) => {
    if (!isoStr) return null;
    try {
      const d = new Date(isoStr);
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const day = days[d.getDay()];
      let h = d.getHours(), m = d.getMinutes();
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      const mm = m < 10 ? `0${m}` : String(m);
      const holeStr = hole != null && hole !== 1 ? ` · Hole ${hole}` : hole === 1 ? ' · Hole 1' : '';
      return `${day} ${h}:${mm} ${ampm}${holeStr}`;
    } catch { return null; }
  };

  let display = [...competitors];
  if (filter === 'pool') {
    display = competitors.filter(c => isMyPick(c.name));
  }
  if (filter === 'leaders') display = competitors.filter(c => !c.isCut && !c.isWD && !c.isScheduled).slice(0, 25);

  if (sortBy === 'name')  display = [...display].sort((a, b) => a.name.localeCompare(b.name));
  if (sortBy === 'today') display = [...display].sort((a, b) => (a.today ?? 999) - (b.today ?? 999));

  const fmtPar = val => {
    if (val == null) return { text: '—', color: '#374151' };
    if (val === 0)   return { text: 'E',  color: '#9ca3af' };
    return val < 0   ? { text: String(val), color: '#22c55e' }
                     : { text: `+${val}`,  color: '#ef4444' };
  };

  return (
    <div className="space-y-3">

      {/* ── Tournament header ── */}
      <div style={{ background: '#111827', border: `1px solid ${isLive ? 'rgba(0,232,122,0.2)' : '#1f2937'}`, borderRadius: 14, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{tournament?.name || 'PGA Tour Event'}</div>
            <div style={{ color: '#6b7280', fontSize: 12, marginTop: 3 }}>
              {[tournament?.course, tournament?.start_date?.slice(0, 10)].filter(Boolean).join(' · ')}
            </div>
            {maxRound > 0 && (
              <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 4 }}>
                Round {maxRound} of 4{isLive ? ' · In Progress' : tournament?.status === 'completed' ? ' · Final' : ''}
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
            {isLive ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(0,232,122,0.12)', border: '1px solid rgba(0,232,122,0.3)', color: '#22c55e', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Live
              </span>
            ) : null}
            <FetchAge lastFetch={lastFetch} />
          </div>
        </div>
      </div>

      {/* ── Filter + Sort bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 5 }}>
          {[
            { key: 'all',     label: `All (${competitors.length})` },
            { key: 'pool',    label: `My Picks (${myPickNames.length})` },
            { key: 'leaders', label: 'Top 25' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)} style={{ fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', transition: 'all 0.15s', background: filter === key ? '#22c55e' : 'transparent', color: filter === key ? '#001a0d' : '#6b7280', border: filter === key ? 'none' : '1px solid #1f2937' }}>
              {label}
            </button>
          ))}
        </div>
        <Select
          value={sortBy}
          onChange={setSortBy}
          size="sm"
          options={[
            { value: 'position', label: 'Sort: Position' },
            { value: 'today',    label: 'Sort: Today' },
            { value: 'name',     label: 'Sort: Name' },
          ]}
        />
      </div>

      {/* ── Leaderboard ── */}
      <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16, overflow: 'hidden' }}>

        {isPreTournament && (
          <div style={{ padding: '10px 16px', background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13 }}>⏰</span>
            <span style={{ fontSize: 12, color: '#d97706', fontWeight: 600 }}>Tee times — tournament starts {tournament?.start_date}</span>
          </div>
        )}

        {/* Desktop column headers */}
        <div className="hidden sm:grid" style={{ gridTemplateColumns: isPreTournament ? '44px 1fr 1fr' : '44px 1fr 36px 32px 32px 32px 32px 48px 44px', gap: 0, padding: '8px 14px', borderBottom: '1px solid #1f2937' }}>
          {(isPreTournament ? ['#', 'Player', 'Tee Time'] : ['Pos', 'Player', 'Thru', 'R1', 'R2', 'R3', 'R4', 'Total', 'Today']).map((h, i) => (
            <div key={h} style={{ textAlign: isPreTournament ? (i === 2 ? 'right' : 'left') : (i >= 2 ? 'center' : 'left'), color: '#374151', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>

        {/* Mobile column headers */}
        <div className="grid sm:hidden" style={{ gridTemplateColumns: isPreTournament ? '32px 1fr 1fr' : '44px 1fr 48px 44px', gap: 0, padding: '8px 14px', borderBottom: '1px solid #1f2937' }}>
          {(isPreTournament ? ['#', 'Player', 'Tee Time'] : ['Pos', 'Player', 'Total', 'Today']).map((h, i) => (
            <div key={h} style={{ textAlign: isPreTournament ? (i === 2 ? 'right' : 'left') : (i >= 2 ? 'center' : 'left'), color: '#374151', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</div>
          ))}
        </div>

        {display.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
            {filter === 'pool' ? 'No picks submitted yet.' : 'No players found.'}
          </div>
        ) : display.map((c, i) => {
          const myPick   = isMyPick(c.name);
          const total    = fmtPar(c.total);
          const todayFmt = fmtPar(c.today);
          const rounds   = [c.r1, c.r2, c.r3, c.r4];
          const isOpen   = expandedRow === i;
          const statusBadge = c.isCut ? <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', padding: '1px 5px', borderRadius: 3 }}>CUT</span>
            : c.isWD  ? <span style={{ fontSize: 10, fontWeight: 700, color: '#f97316', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)', padding: '1px 5px', borderRadius: 3 }}>WD</span>
            : c.isMDF ? <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', padding: '1px 5px', borderRadius: 3 }}>MDF</span>
            : null;

          const playerCell = (
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {c.flagHref && (
                  <img src={c.flagHref} alt={c.countryAlt} style={{ width: 16, height: 11, objectFit: 'cover', borderRadius: 1, flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
                )}
                <span style={{ color: myPick ? '#22c55e' : '#fff', fontWeight: myPick ? 700 : 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.name}
                </span>
                {myPick && <span style={{ fontSize: 8, fontWeight: 700, color: '#22c55e', background: 'rgba(0,232,122,0.1)', border: '1px solid rgba(0,232,122,0.25)', padding: '1px 4px', borderRadius: 3, letterSpacing: '0.05em', flexShrink: 0 }}>PICK</span>}
                {statusBadge && <span style={{ marginLeft: 2, flexShrink: 0 }}>{statusBadge}</span>}
              </div>
              {!isPreTournament && c.thru != null && !c.isCut && !c.isWD && (
                <div className="block sm:hidden" style={{ color: '#4b5563', fontSize: 10, marginTop: 2, paddingLeft: 21 }}>
                  {c.thru === 18 ? 'F' : `Thru ${c.thru}`}
                </div>
              )}
            </div>
          );

          const posCell = (
            <div style={{ color: '#9ca3af', fontSize: 12, fontWeight: 700 }}>
              {c.posText || '—'}
            </div>
          );

          const thruCell = (
            <div style={{ textAlign: 'center', fontSize: 11, color: '#4b5563', fontVariantNumeric: 'tabular-nums' }}>
              {(c.isCut || c.isWD) ? '—' : c.thru === 18 ? 'F' : c.thru != null ? String(c.thru) : '—'}
            </div>
          );

          const todayCell = (
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: (c.isCut || c.isWD) ? '#374151' : todayFmt.color, fontVariantNumeric: 'tabular-nums' }}>
              {(c.isCut || c.isWD) ? '—' : todayFmt.text}
            </div>
          );

          const totalCell = (
            <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 14, color: total.color, fontVariantNumeric: 'tabular-nums' }}>
              {total.text}
            </div>
          );

          const toggleRow = e => {
            e.preventDefault(); e.stopPropagation();
            setExpandedRow(isOpen ? null : i);
            setTimeout(() => pgaRowRefs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 10);
          };

          const teeTxt = fmtTeeTime(c.teeTimeRaw, c.startHole);

          return (
            <div key={i} ref={el => { pgaRowRefs.current[i] = el; }} style={{ borderLeft: `3px solid ${myPick ? '#22c55e' : 'transparent'}`, borderBottom: '1px solid rgba(255,255,255,0.04)', background: myPick ? 'rgba(0,232,122,0.025)' : 'transparent', opacity: c.isCut || c.isWD ? 0.55 : 1 }}>
              {/* Desktop row */}
              <button
                className="hidden sm:grid"
                onClick={isPreTournament ? undefined : toggleRow}
                style={{ width: '100%', gridTemplateColumns: isPreTournament ? '44px 1fr 1fr' : '44px 1fr 36px 32px 32px 32px 32px 48px 44px', gap: 0, padding: '9px 14px', alignItems: 'center', background: 'transparent', border: 'none', cursor: isPreTournament ? 'default' : 'pointer', textAlign: 'left' }}
                onMouseEnter={e => { if (!isPreTournament) e.currentTarget.style.background = myPick ? 'rgba(0,232,122,0.05)' : 'rgba(255,255,255,0.02)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = myPick ? 'rgba(0,232,122,0.025)' : 'transparent'; }}
              >
                {posCell}
                {playerCell}
                {isPreTournament ? (
                  <div style={{ textAlign: 'right', fontSize: 12, color: myPick ? '#d97706' : '#6b7280', fontWeight: myPick ? 700 : 400 }}>
                    {teeTxt || '—'}
                  </div>
                ) : (<>
                  {thruCell}
                  {rounds.map((r, ri) => {
                    const { text, color } = fmtPar(r);
                    const isCurrent = (ri + 1) === maxRound && isLive && r != null;
                    return (
                      <div key={ri} style={{ textAlign: 'center', fontSize: 11, color: r != null ? color : '#374151', fontWeight: isCurrent ? 700 : 400 }}>{text}</div>
                    );
                  })}
                  {totalCell}
                  {todayCell}
                </>)}
              </button>

              {/* Mobile row */}
              <button
                className="grid sm:hidden"
                onClick={isPreTournament ? undefined : toggleRow}
                style={{ width: '100%', gridTemplateColumns: isPreTournament ? '32px 1fr 1fr' : '44px 1fr 48px 44px', gap: 0, padding: '10px 14px', alignItems: 'center', background: 'transparent', border: 'none', cursor: isPreTournament ? 'default' : 'pointer', textAlign: 'left' }}
              >
                {posCell}
                {playerCell}
                {isPreTournament ? (
                  <div style={{ textAlign: 'right', fontSize: 11, color: myPick ? '#d97706' : '#6b7280', fontWeight: myPick ? 700 : 400 }}>
                    {teeTxt || '—'}
                  </div>
                ) : (<>
                  {totalCell}
                  {todayCell}
                </>)}
              </button>

              {/* Expanded scorecard */}
              {isOpen && (
                <div style={{ background: 'rgba(0,0,0,0.25)', borderTop: '1px solid rgba(255,255,255,0.04)', padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                    {['R1', 'R2', 'R3', 'R4'].map((label, ri) => {
                      const { text, color } = fmtPar(rounds[ri]);
                      const isCurrent = (ri + 1) === maxRound && isLive && rounds[ri] != null;
                      return (
                        <div key={ri} style={{ textAlign: 'center', minWidth: 32 }}>
                          <div style={{ color: '#4b5563', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
                          <div style={{ color: rounds[ri] != null ? color : '#374151', fontSize: 14, fontWeight: isCurrent ? 800 : 500 }}>{text}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ color: '#4b5563', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                    Round {c.currentRound || maxRound} — Hole by Hole
                  </div>
                  <HoleScorecard holes={(c.rounds?.find(r => r.round === c.currentRound) ?? c.rounds?.[c.rounds.length - 1])?.holes} currentRound={c.currentRound} />
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
