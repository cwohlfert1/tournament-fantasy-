import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Search, Trophy, Flag } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';
import BallLoader from '../../components/BallLoader';

// Client-side preview of commissioner pts formula
function previewPts(s, par, isMajor) {
  let pts = 0;
  [s.r1, s.r2, s.r3, s.r4].forEach(r => {
    if (r !== '' && r !== null && r !== undefined) pts += (Number(r) - par) * -1.5;
  });
  const pos = (s.finish_position !== '' && s.finish_position !== null) ? parseInt(s.finish_position) : null;
  if (pos !== null) {
    if (pos === 1)      pts += 30;
    else if (pos <= 5)  pts += 12;
    else if (pos <= 10) pts += 8;
    else if (pos <= 25) pts += 3;
  }
  if (s.made_cut) pts += 2;
  else pts -= 5;
  if (isMajor) pts *= 1.5;
  return Math.round(pts * 10) / 10;
}

const BLANK = { r1: '', r2: '', r3: '', r4: '', made_cut: true, finish_position: '' };

export default function GolfScoreEntry() {
  useDocTitle('Enter Scores | TourneyRun');
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [league, setLeague] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [players, setPlayers] = useState([]);
  const [selectedTournId, setSelectedTournId] = useState(searchParams.get('tournament') || '');
  const [par, setPar] = useState(72);
  const [scores, setScores] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  useEffect(() => {
    Promise.all([
      api.get(`/golf/leagues/${id}`),
      api.get('/golf/tournaments'),
      api.get('/golf/players'),
    ]).then(([lr, tr, pr]) => {
      const lg = lr.data.league;
      if (lg.commissioner_id !== user?.id) {
        navigate(`/golf/league/${id}`);
        return;
      }
      setLeague(lg);
      const eligible = (tr.data.tournaments || [])
        .filter(t => t.status === 'active' || t.status === 'completed')
        .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      setTournaments(eligible);
      setPlayers(pr.data.players || []);
      if (!searchParams.get('tournament') && eligible.length > 0) {
        setSelectedTournId(eligible[eligible.length - 1].id);
      }
    }).catch(() => navigate(`/golf/league/${id}`))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!selectedTournId) return;
    api.get(`/golf/tournaments/${selectedTournId}/scores`).then(r => {
      const existing = {};
      for (const s of (r.data.scores || [])) {
        existing[s.player_id] = {
          r1: s.round1 ?? '',
          r2: s.round2 ?? '',
          r3: s.round3 ?? '',
          r4: s.round4 ?? '',
          made_cut: s.made_cut === 1,
          finish_position: s.finish_position ?? '',
        };
      }
      setScores(existing);
    }).catch(() => {});
  }, [selectedTournId]);

  function getScore(playerId) {
    return scores[playerId] || { ...BLANK };
  }

  function updateScore(playerId, field, value) {
    setScores(prev => ({
      ...prev,
      [playerId]: { ...(prev[playerId] || { ...BLANK }), [field]: value },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    const toSubmit = players
      .map(p => ({ player_id: p.id, ...getScore(p.id) }))
      .filter(s => s.r1 !== '' || s.r2 !== '' || s.r3 !== '' || s.r4 !== '')
      .map(s => ({
        player_id: s.player_id,
        r1: s.r1 !== '' ? parseInt(s.r1) : null,
        r2: s.r2 !== '' ? parseInt(s.r2) : null,
        r3: s.r3 !== '' ? parseInt(s.r3) : null,
        r4: s.r4 !== '' ? parseInt(s.r4) : null,
        made_cut: s.made_cut ? 1 : 0,
        finish_position: s.finish_position !== '' ? parseInt(s.finish_position) : null,
      }));
    if (toSubmit.length === 0) {
      setSaveError('No scores to save. Enter at least one round score.');
      setSaving(false);
      return;
    }
    try {
      await api.post(`/golf/leagues/${id}/scores`, {
        tournament_id: selectedTournId,
        par: parseInt(par),
        scores: toSubmit,
      });
      setSaveSuccess(`Saved ${toSubmit.length} player scores. Member standings updated.`);
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to save scores');
    }
    setSaving(false);
  }

  const selectedTourn = tournaments.find(t => t.id === selectedTournId);
  const filteredPlayers = players.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <BallLoader />;
  if (!league) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">

      {/* Header */}
      <div className="mb-6">
        <Link
          to={`/golf/league/${id}`}
          className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-400 text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> {league.name}
        </Link>
        <h1 className="text-3xl font-black text-white mt-3">Enter Scores</h1>
        <p className="text-gray-400 mt-1 text-sm">Commissioner score entry — updates all member standings automatically.</p>
      </div>

      {/* Tournament + Par */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Tournament</label>
            <select
              value={selectedTournId}
              onChange={e => setSelectedTournId(e.target.value)}
              className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-xl border border-gray-700 focus:outline-none focus:border-green-500"
            >
              <option value="">Select tournament...</option>
              {tournaments.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.status}){t.is_major ? ' ★' : t.is_signature ? ' ◆' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Course Par</label>
            <input
              type="number"
              value={par}
              onChange={e => setPar(e.target.value)}
              min="68" max="74"
              className="w-full bg-gray-800 text-white text-sm px-3 py-2.5 rounded-xl border border-gray-700 focus:outline-none focus:border-green-500"
            />
          </div>
        </div>
        {selectedTourn?.is_major ? (
          <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
            <Trophy className="w-3.5 h-3.5 shrink-0" /> Major tournament — all fantasy points multiplied by 1.5×
          </div>
        ) : selectedTourn?.is_signature ? (
          <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
            <Flag className="w-3.5 h-3.5 shrink-0" /> Signature event
          </div>
        ) : null}
      </div>

      {selectedTournId && (
        <>
          {/* Search */}
          <div className="mb-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search players..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 text-white text-sm pl-9 pr-4 py-2.5 rounded-xl focus:outline-none focus:border-green-500"
            />
          </div>

          {/* Score table */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-5">
            {/* Desktop header */}
            <div className="hidden sm:grid grid-cols-[1fr_64px_64px_64px_64px_72px_80px_72px] gap-2 px-4 py-3 border-b border-gray-800 text-gray-500 text-xs font-bold uppercase tracking-wide">
              <div>Player</div>
              <div className="text-center">R1</div>
              <div className="text-center">R2</div>
              <div className="text-center">R3</div>
              <div className="text-center">R4</div>
              <div className="text-center">Cut</div>
              <div className="text-center">Finish</div>
              <div className="text-center">Pts</div>
            </div>

            <div className="divide-y divide-gray-800 max-h-[60vh] overflow-y-auto">
              {filteredPlayers.map(p => {
                const s = getScore(p.id);
                const hasData = s.r1 !== '' || s.r2 !== '' || s.r3 !== '' || s.r4 !== '';
                const preview = hasData ? previewPts(s, Number(par), !!selectedTourn?.is_major) : null;
                const ptsColor = preview === null ? 'text-gray-700' : preview >= 0 ? 'text-green-400' : 'text-red-400';
                const ptsLabel = preview === null ? '—' : `${preview > 0 ? '+' : ''}${preview}`;

                return (
                  <div key={p.id} className={`px-4 py-3 ${hasData ? 'bg-green-500/3' : ''}`}>
                    {/* Mobile layout */}
                    <div className="sm:hidden">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-white text-sm font-semibold">{p.name}</div>
                          <div className="text-gray-500 text-xs">{p.country} · Rank #{p.world_ranking}</div>
                        </div>
                        {preview !== null && (
                          <div className={`text-sm font-black ${ptsColor}`}>{ptsLabel}</div>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        {['r1','r2','r3','r4'].map((rk, i) => (
                          <div key={rk}>
                            <div className="text-gray-600 text-[10px] uppercase mb-1">R{i+1}</div>
                            <input
                              type="number"
                              value={s[rk]}
                              onChange={e => updateScore(p.id, rk, e.target.value)}
                              placeholder="—"
                              className="w-full bg-gray-800 text-white text-sm text-center px-1 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={s.made_cut}
                            onChange={e => updateScore(p.id, 'made_cut', e.target.checked)}
                            className="w-4 h-4 rounded accent-green-500"
                          />
                          <span className="text-gray-400 text-xs">Made Cut</span>
                        </label>
                        <input
                          type="number"
                          value={s.finish_position}
                          onChange={e => updateScore(p.id, 'finish_position', e.target.value)}
                          placeholder="Finish pos"
                          min="1"
                          className="w-full bg-gray-800 text-white text-sm text-center px-2 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500"
                        />
                      </div>
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden sm:grid grid-cols-[1fr_64px_64px_64px_64px_72px_80px_72px] gap-2 items-center">
                      <div>
                        <div className="text-white text-sm font-semibold truncate">{p.name}</div>
                        <div className="text-gray-500 text-xs">{p.country} · Rank #{p.world_ranking}</div>
                      </div>
                      {['r1','r2','r3','r4'].map(rk => (
                        <input
                          key={rk}
                          type="number"
                          value={s[rk]}
                          onChange={e => updateScore(p.id, rk, e.target.value)}
                          placeholder="—"
                          className="w-full bg-gray-800 text-white text-sm text-center px-1 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500"
                        />
                      ))}
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          checked={s.made_cut}
                          onChange={e => updateScore(p.id, 'made_cut', e.target.checked)}
                          className="w-4 h-4 accent-green-500 cursor-pointer"
                        />
                      </div>
                      <input
                        type="number"
                        value={s.finish_position}
                        onChange={e => updateScore(p.id, 'finish_position', e.target.value)}
                        placeholder="—"
                        min="1"
                        className="w-full bg-gray-800 text-white text-sm text-center px-1 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:border-green-500"
                      />
                      <div className={`text-center text-sm font-black tabular-nums ${ptsColor}`}>
                        {ptsLabel}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredPlayers.length === 0 && (
                <div className="py-10 text-center text-gray-500 text-sm">No players found.</div>
              )}
            </div>
          </div>

          {/* Messages */}
          {saveError && (
            <div className="mb-4 bg-red-900/40 border border-red-700 text-red-300 rounded-xl p-3 text-sm">{saveError}</div>
          )}
          {saveSuccess && (
            <div className="mb-4 bg-green-900/40 border border-green-700 text-green-300 rounded-xl p-3 text-sm">{saveSuccess}</div>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-black rounded-2xl transition-all shadow-lg shadow-green-500/25 flex items-center justify-center gap-2"
          >
            <Save className="w-5 h-5" />
            {saving ? 'Saving...' : 'Calculate & Save All'}
          </button>
          <p className="text-gray-600 text-xs text-center mt-2">
            Pts = (score − par) × −1.5 per round + finish bonus{selectedTourn?.is_major ? ' × 1.5 major' : ''}
          </p>
        </>
      )}
    </div>
  );
}
