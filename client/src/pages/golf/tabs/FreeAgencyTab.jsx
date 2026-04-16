import { useState, useEffect } from 'react';
import { Flag, Trophy, Check, ArrowRight } from 'lucide-react';
import { Badge } from '../../../components/ui';
import api from '../../../api';
import Select from '../../../components/ui/Select';

const getTier = (salary) => {
  if (salary >= 800) return { label: 'Elite', color: '#f59e0b' };
  if (salary >= 700) return { label: 'Prem',  color: '#8b5cf6' };
  if (salary >= 550) return { label: 'Mid',   color: '#3b82f6' };
  if (salary >= 400) return { label: 'Val',   color: '#22c55e' };
  return                     { label: 'Slpr',  color: '#6b7280' };
};

function TierBadge({ salary }) {
  const { label, color } = getTier(salary || 0);
  return (
    <span style={{ color, borderColor: color + '55', backgroundColor: color + '18' }}
      className="inline-block text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border shrink-0">
      {label}
    </span>
  );
}

export default function FreeAgencyTab({ leagueId, league }) {
  console.log('[FreeAgency] render', { leagueId, league: !!league });
  const [waivers, setWaivers] = useState(null);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [bidTarget, setBidTarget] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [dropPlayerId, setDropPlayerId] = useState('');
  const [bidding, setBidding] = useState(false);
  const [bidError, setBidError] = useState('');
  const [bidSuccess, setBidSuccess] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [logs, setLogs] = useState({});

  async function load() {
    setLoadError('');
    try {
      const [wRes, rRes] = await Promise.all([
        api.get(`/golf/leagues/${leagueId}/waivers`),
        api.get(`/golf/leagues/${leagueId}/roster`),
      ]);
      setWaivers(wRes.data);
      setRoster(rRes.data.roster || []);
    } catch (err) {
      setLoadError(err.response?.data?.error || 'Failed to load waiver data');
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [leagueId]);

  const available = (waivers?.available || []).filter(p =>
    !p.on_roster &&
    (!search || (p.name || '').toLowerCase().includes(search.toLowerCase()))
  );

  const rosterFull = roster.length >= (league.roster_size || 8);
  const droppable = roster.filter(p => !p.is_core);

  function openBid(p) {
    setBidTarget(p);
    setBidAmount('');
    setDropPlayerId('');
    setBidError('');
    setBidSuccess('');
  }

  async function toggleRow(playerId) {
    if (expandedId === playerId) { setExpandedId(null); return; }
    setExpandedId(playerId);
    if (logs[playerId]) return;
    setLogs(prev => ({ ...prev, [playerId]: { loading: true } }));
    try {
      const r = await api.get(`/golf/players/${playerId}/gamelog`);
      setLogs(prev => ({ ...prev, [playerId]: { loading: false, data: r.data } }));
    } catch {
      setLogs(prev => ({ ...prev, [playerId]: { loading: false, error: 'Failed to load' } }));
    }
  }

  async function placeBid(e) {
    e.preventDefault();
    setBidding(true);
    setBidError('');
    try {
      const body = {
        player_id: bidTarget.id,
        bid_amount: parseInt(bidAmount) || 0,
      };
      if (dropPlayerId) body.drop_player_id = dropPlayerId;
      await api.post(`/golf/leagues/${leagueId}/waivers/bid`, body);
      setBidSuccess(`Bid of $${bidAmount || 0} placed on ${bidTarget.name}`);
      setBidTarget(null);
      await load();
    } catch (err) {
      setBidError(err.response?.data?.error || 'Failed to place bid');
    }
    setBidding(false);
  }

  if (loading) return <div className="py-10 text-center text-gray-500">Loading...</div>;

  if (loadError) {
    return (
      <div className="py-10 text-center">
        <div className="bg-red-900/30 border border-red-700/50 text-red-400 rounded-2xl p-6 text-sm max-w-sm mx-auto">
          {loadError}
        </div>
      </div>
    );
  }

  const pendingBids = (waivers?.myBids || []).filter(b => b.status === 'pending');

  return (
    <div className="space-y-4">
      {/* Budget card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-800">
          <Trophy className="w-4 h-4 text-green-400" />
          <h3 className="text-white font-bold">My FAAB Budget</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-800/60 rounded-xl px-3 py-2.5 text-center">
            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">Remaining</div>
            <div className="text-green-400 font-bold text-xl tabular-nums">${waivers?.faabRemaining ?? '—'}</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl px-3 py-2.5 text-center">
            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">Budget</div>
            <div className="text-white font-bold text-xl tabular-nums">${waivers?.faabBudget ?? '—'}</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl px-3 py-2.5 text-center">
            <div className="text-gray-500 text-[10px] uppercase tracking-wide mb-1">Pending</div>
            <div className="text-yellow-400 font-bold text-xl tabular-nums">{pendingBids.length}</div>
          </div>
        </div>
      </div>

      {/* Success banner */}
      {bidSuccess && (
        <div className="bg-green-900/40 border border-green-700 text-green-300 rounded-xl p-3 text-sm flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" /> {bidSuccess}
        </div>
      )}

      {/* Bid modal */}
      {bidTarget && (
        <div className="bg-gray-900 border border-green-500/40 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-bold">Place FAAB Bid</h3>
            <button onClick={() => setBidTarget(null)} className="text-gray-500 hover:text-gray-300 text-sm">Cancel</button>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 min-w-0">
              <div className="text-white font-semibold">{bidTarget.name}</div>
              <div className="text-gray-500 text-xs">{bidTarget.country} · Rank #{bidTarget.world_ranking}</div>
            </div>
            <TierBadge salary={bidTarget.salary} />
            <div className="text-green-400 font-bold text-sm shrink-0">${bidTarget.salary}</div>
          </div>
          {bidError && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm mb-3">{bidError}</div>
          )}
          <form onSubmit={placeBid} className="space-y-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
              <input
                type="number"
                min="0"
                max={waivers?.faabRemaining ?? 9999}
                className="w-full bg-gray-800 border border-gray-700 focus:border-green-500 focus:outline-none text-white text-sm rounded-xl pl-7 pr-4 py-2.5"
                placeholder="Bid amount"
                value={bidAmount}
                onChange={e => setBidAmount(e.target.value)}
                autoFocus
              />
            </div>
            {rosterFull && (
              <div>
                <label className="block text-xs text-gray-400 font-semibold mb-1.5">Drop player (roster full)</label>
                <Select
                  value={dropPlayerId}
                  onChange={setDropPlayerId}
                  options={droppable.map(p => ({
                    value: p.player_id,
                    label: `${p.name} ($${p.salary})`,
                  }))}
                  placeholder="Select player to drop..."
                  fullWidth
                />
              </div>
            )}
            <button
              type="submit"
              disabled={bidding || (rosterFull && !dropPlayerId)}
              className="w-full py-2.5 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all"
            >
              {bidding ? 'Placing bid...' : 'Place Blind Bid'}
            </button>
          </form>
          <p className="text-gray-600 text-xs mt-2">Bids are blind — processed at waiver deadline.</p>
        </div>
      )}

      {/* Available players */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-gray-400" />
              <h3 className="text-white font-bold">Free Agents</h3>
            </div>
            <span className="text-gray-600 text-xs">{available.length} available</span>
          </div>
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500"
          />
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          {available.slice(0, 60).map(p => {
            const isOpen = expandedId === p.id;
            const log = logs[p.id];
            return (
              <div key={p.id} className="border-b border-gray-800 last:border-0">
                {/* ── Main row ── */}
                <div
                  onClick={() => toggleRow(p.id)}
                  className="flex items-center gap-2 px-4 min-h-[48px] py-2.5 cursor-pointer active:bg-gray-800/50 transition-colors select-none"
                >
                  {/* Chevron */}
                  <svg
                    style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                    className="w-3 h-3 text-gray-500 shrink-0"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-gray-600 text-[11px] font-bold tabular-nums w-6 text-center shrink-0">#{p.world_ranking}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-semibold truncate">{p.name}</div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-gray-500">{p.country}</span>
                      {Number(p.season_points) > 0 && (
                        <span className="text-green-400 font-bold tabular-nums">· +{Number(p.season_points).toFixed(1)} pts</span>
                      )}
                    </div>
                  </div>
                  <TierBadge salary={p.salary} />
                  <span className="text-green-400 font-bold text-sm shrink-0 tabular-nums">${p.salary}</span>
                  <button
                    onClick={e => { e.stopPropagation(); openBid(p); }}
                    className="text-xs px-2.5 py-1.5 bg-green-500/15 border border-green-500/30 text-green-400 rounded-lg active:bg-green-500/25 transition-colors font-semibold shrink-0"
                  >
                    Bid
                  </button>
                </div>

                {/* ── Game log (expanded) ── */}
                {isOpen && (
                  <div className="bg-gray-950/70 border-t border-gray-800/60 px-4 py-3">
                    {log?.loading && (
                      <div className="py-3 text-center text-gray-500 text-xs">Loading...</div>
                    )}
                    {log?.error && (
                      <div className="py-2 text-center text-red-400 text-xs">{log.error}</div>
                    )}
                    {log?.data && (
                      log.data.gamelog.length === 0 ? (
                        <div className="py-3 text-center text-gray-500 text-xs">No results this season</div>
                      ) : (
                        <>
                          <div className="overflow-x-auto -mx-4 px-4">
                            <table className="w-full text-xs min-w-[400px]">
                              <thead>
                                <tr className="text-gray-600 text-[10px] uppercase tracking-wide">
                                  <th className="text-left pb-2 font-semibold pr-2">Tournament</th>
                                  <th className="text-center pb-2 font-semibold w-9">R1</th>
                                  <th className="text-center pb-2 font-semibold w-9">R2</th>
                                  <th className="text-center pb-2 font-semibold w-9">R3</th>
                                  <th className="text-center pb-2 font-semibold w-9">R4</th>
                                  <th className="text-center pb-2 font-semibold w-8">Cut</th>
                                  <th className="text-center pb-2 font-semibold w-10">Fin</th>
                                  <th className="text-right pb-2 font-semibold w-12">Pts</th>
                                </tr>
                              </thead>
                              <tbody>
                                {log.data.gamelog.map((g, i) => (
                                  <tr key={i} className="border-t border-gray-800/50">
                                    <td className="py-1.5 pr-2 text-gray-300 max-w-[120px]">
                                      <span className="truncate block">{g.tournament_name}{g.is_major ? ' ★' : ''}</span>
                                    </td>
                                    <td className="py-1.5 text-center text-gray-400 tabular-nums">{g.r1 ?? '—'}</td>
                                    <td className="py-1.5 text-center text-gray-400 tabular-nums">{g.r2 ?? '—'}</td>
                                    <td className="py-1.5 text-center text-gray-400 tabular-nums">{g.made_cut ? (g.r3 ?? '—') : '—'}</td>
                                    <td className="py-1.5 text-center text-gray-400 tabular-nums">{g.made_cut ? (g.r4 ?? '—') : '—'}</td>
                                    <td className="py-1.5 text-center font-bold">
                                      {g.made_cut
                                        ? <span style={{ color: '#22c55e' }}>Y</span>
                                        : <span style={{ color: '#ef4444' }}>N</span>}
                                    </td>
                                    <td className="py-1.5 text-center text-gray-400 tabular-nums">{g.finish_position ?? '—'}</td>
                                    <td className="py-1.5 text-right tabular-nums font-bold"
                                      style={{ color: g.fantasy_points >= 0 ? '#22c55e' : '#ef4444' }}>
                                      {g.fantasy_points > 0 ? '+' : ''}{g.fantasy_points}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-gray-800/60 grid grid-cols-4 gap-2">
                            {[
                              { label: 'Avg Pts', value: `${log.data.season_avg > 0 ? '+' : ''}${log.data.season_avg}`, color: log.data.season_avg >= 0 ? '#22c55e' : '#ef4444' },
                              { label: 'Events',  value: String(log.data.events_played), color: '#9ca3af' },
                              { label: 'Cuts',    value: `${log.data.cuts_made}/${log.data.events_played}`, color: '#9ca3af' },
                              { label: 'Best',    value: log.data.best_finish ?? '—', color: '#f59e0b' },
                            ].map(s => (
                              <div key={s.label} className="text-center">
                                <div className="text-gray-600 text-[10px] uppercase tracking-wide mb-0.5">{s.label}</div>
                                <div className="font-bold text-sm tabular-nums" style={{ color: s.color }}>{s.value}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {available.length === 0 && !search && (
            <div className="py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-800 flex items-center justify-center mx-auto mb-3">
                <Flag className="w-6 h-6 text-gray-600" />
              </div>
              <p className="text-gray-500 text-sm">All players are rostered.</p>
            </div>
          )}
          {available.length === 0 && search && (
            <div className="py-8 text-center text-gray-500 text-sm">No players match "{search}".</div>
          )}
        </div>
      </div>

      {/* Pending bids */}
      {pendingBids.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-yellow-400" />
            <h3 className="text-white font-bold">My Pending Bids</h3>
          </div>
          <div className="divide-y divide-gray-800">
            {pendingBids.map(b => (
              <div key={b.id} className="flex items-center justify-between px-5 py-3.5 gap-3">
                <div className="min-w-0">
                  <div className="text-white text-sm font-medium truncate">{b.player_name}</div>
                  {b.drop_player_name && (
                    <div className="text-gray-500 text-xs">Drop: {b.drop_player_name}</div>
                  )}
                </div>
                <Badge color="yellow">${b.bid_amount}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
