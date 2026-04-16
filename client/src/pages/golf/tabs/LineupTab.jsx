import { useState, useEffect } from 'react';
import { Target, Lock, Check } from 'lucide-react';
import { Badge } from '../../../components/ui';
import api from '../../../api';
import GolfPaymentModal from '../../../components/golf/GolfPaymentModal';
import Select from '../../../components/ui/Select';

export default function LineupTab({ leagueId, league }) {
  const [tournaments, setTournaments] = useState([]);
  const [selectedTournId, setSelectedTournId] = useState(null);
  const [lineup, setLineup] = useState([]);
  const [roster, setRoster] = useState([]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [showPoolGate, setShowPoolGate] = useState(false);
  const [paidTournaments, setPaidTournaments] = useState([]);

  useEffect(() => {
    api.get('/golf/tournaments').then(r => {
      const upcoming = (r.data.tournaments || []).filter(t => t.status !== 'completed');
      setTournaments(upcoming);
      if (upcoming.length > 0) setSelectedTournId(upcoming[0].id);
    }).catch(() => setLoading(false));
    if (league.format_type === 'office_pool') {
      api.get('/golf/payments/status').then(r => setPaidTournaments(r.data.paidTournaments || [])).catch(() => {});
    }
  }, [league.format_type]);

  useEffect(() => {
    if (!selectedTournId) return;
    setLoading(true);
    api.get(`/golf/leagues/${leagueId}/lineup/${selectedTournId}`)
      .then(r => {
        setLineup((r.data.lineup || []).filter(l => l.is_started).map(l => l.player_id));
        setRoster(r.data.roster || []);
        setLocked(r.data.isLocked || false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [leagueId, selectedTournId]);

  function toggleStarter(playerId) {
    if (locked) return;
    const maxStarters = league.starters_per_week || 6;
    setLineup(prev => {
      if (prev.includes(playerId)) return prev.filter(id => id !== playerId);
      if (prev.length >= maxStarters) return prev;
      return [...prev, playerId];
    });
  }

  async function saveLineup() {
    if (league.format_type === 'office_pool' && selectedTournId && !paidTournaments.includes(String(selectedTournId))) {
      setShowPoolGate(true);
      return;
    }
    await doSaveLineup();
  }

  async function doSaveLineup() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await api.post(`/golf/leagues/${leagueId}/lineup/${selectedTournId}`, { starter_ids: lineup });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save lineup');
    }
    setSaving(false);
  }

  const maxStarters = league.starters_per_week || 6;
  const selectedTourn = tournaments.find(t => t.id === selectedTournId || t.id === Number(selectedTournId));

  return (
    <div className="space-y-4">
      {/* Gate 1: Office Pool entry modal */}
      {showPoolGate && (
        <GolfPaymentModal
          type="office_pool"
          meta={{
            tournamentId: String(selectedTournId),
            tournamentName: selectedTourn?.name,
            isMajor: !!selectedTourn?.is_major,
            leagueId,
          }}
          onClose={() => setShowPoolGate(false)}
          onAlreadyPaid={() => {
            setPaidTournaments(p => [...p, String(selectedTournId)]);
            setShowPoolGate(false);
            doSaveLineup();
          }}
        />
      )}

      {/* Tournament selector */}
      {tournaments.length > 0 && (
        <div>
          <label className="label mb-2">Select Tournament</label>
          <Select
            value={selectedTournId || ''}
            onChange={v => setSelectedTournId(Number(v))}
            options={tournaments.map(t => ({
              value: t.id,
              label: `${t.name} \u2014 ${t.start_date?.slice(0, 10)}${t.is_major ? ' \u2605' : ''}`,
            }))}
            fullWidth
          />
        </div>
      )}

      {locked && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-xl px-4 py-3 text-sm font-semibold">
          <Lock className="w-4 h-4 shrink-0" /> Lineup locked — tournament has started.
        </div>
      )}

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="py-8 text-center text-gray-500">Loading lineup...</div>
      ) : (
        <>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-gray-400" />
                <h3 className="text-white font-bold">
                  Set Starters ({lineup.length}/{maxStarters})
                </h3>
              </div>
              {!locked && (
                <button
                  onClick={saveLineup}
                  disabled={saving}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition-all disabled:opacity-50 ${
                    saved
                      ? 'bg-green-500/20 border-green-500/40 text-green-400'
                      : 'bg-green-500 border-green-500 text-white hover:bg-green-400'
                  }`}
                >
                  {saving ? 'Saving...' : saved ? <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" />Saved</span> : 'Save Lineup'}
                </button>
              )}
            </div>
            {roster.length === 0 ? (
              <div className="py-8 text-center text-gray-500 text-sm">
                Add players to your roster first to set a lineup.
              </div>
            ) : (
              <div className="divide-y divide-gray-800">
                {roster.map(p => {
                  const isStarter = lineup.includes(p.player_id);
                  const canAdd = !isStarter && lineup.length < maxStarters && !locked;
                  return (
                    <button
                      key={p.player_id}
                      onClick={() => toggleStarter(p.player_id)}
                      disabled={locked || (!isStarter && !canAdd)}
                      className={`w-full flex items-center justify-between px-5 py-3.5 gap-3 transition-colors text-left ${
                        isStarter
                          ? 'bg-green-500/8 hover:bg-green-500/12'
                          : locked || !canAdd
                          ? 'opacity-50 cursor-default'
                          : 'hover:bg-gray-800/50 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                          isStarter ? 'bg-green-500 border-green-500' : 'border-gray-600'
                        }`}>
                          {isStarter && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-white text-sm font-medium truncate">{p.name}</div>
                          <div className="text-gray-500 text-xs">{p.country}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isStarter && <Badge color="green">Starter</Badge>}
                        <span className="text-green-400 font-bold text-sm">${p.salary}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <p className="text-gray-600 text-xs text-center">
            Lineups lock Thursday 12pm ET each tournament week.
          </p>
        </>
      )}
    </div>
  );
}
