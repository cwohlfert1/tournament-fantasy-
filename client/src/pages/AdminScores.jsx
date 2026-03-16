import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';
import BallLoader from '../components/BallLoader';

const ROUNDS = [
  'First Round', 'Second Round', 'Round of 16', 'Top 8', 'Semifinals', 'Championship'
];

export default function AdminScores() {
  const { id: leagueId } = useParams();
  const { user } = useAuth();
  const [tab, setTab] = useState('stats');
  const [league, setLeague] = useState(null);
  const [games, setGames] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  // Game creation form
  const [gameForm, setGameForm] = useState({
    game_date: new Date().toISOString().split('T')[0],
    round_name: 'First Round',
    team1: '',
    team2: '',
  });

  // Stats entry
  const [selectedGame, setSelectedGame] = useState(null);
  const [statsForm, setStatsForm] = useState({});
  const [winnerTeam, setWinnerTeam] = useState('');
  const [team1Score, setTeam1Score] = useState('');
  const [team2Score, setTeam2Score] = useState('');

  // Quick result (inline per-game, no stats)
  const [quickResultGame, setQuickResultGame] = useState(null);
  const [quickWinner, setQuickWinner] = useState('');
  const [quickScore1, setQuickScore1] = useState('');
  const [quickScore2, setQuickScore2] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  // Schedule generation
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [leagueRes, gamesRes, playersRes, teamsRes] = await Promise.all([
          api.get(`/leagues/${leagueId}`),
          api.get('/admin/games'),
          api.get('/players'),
          api.get('/admin/teams'),
        ]);
        setLeague(leagueRes.data.league);
        setSettings(leagueRes.data.settings);
        setGames(gamesRes.data.games);
        setAllPlayers(playersRes.data.players);
        setTeams(teamsRes.data.teams);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [leagueId]);

  if (!loading && league && league.commissioner_id !== user?.id) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <div className="text-5xl mb-4">🚫</div>
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-gray-400 mb-6">Only the commissioner can access this page.</p>
        <Link to={`/league/${leagueId}`} className="btn-primary px-6 py-3">Back to League</Link>
      </div>
    );
  }

  const createGame = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/admin/games', gameForm);
      setGames(prev => [res.data.game, ...prev]);
      setGameForm({ ...gameForm, team1: '', team2: '' });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create game');
    }
  };

  const loadGameForStats = (game) => {
    setSelectedGame(game);
    setWinnerTeam(game.winner_team || '');
    setTeam1Score(game.team1_score || '');
    setTeam2Score(game.team2_score || '');
    const gamePlayers = allPlayers.filter(p => p.team === game.team1 || p.team === game.team2);
    const initial = {};
    gamePlayers.forEach(p => { initial[p.id] = { points: 0 }; });
    setStatsForm(initial);
  };

  const submitStats = async () => {
    if (!selectedGame) return;
    const statsArray = Object.entries(statsForm)
      .map(([player_id, stats]) => ({ player_id, ...stats }))
      .filter(s => s.points > 0);
    try {
      await api.post(`/admin/games/${selectedGame.id}/stats`, {
        stats: statsArray,
        winner_team: winnerTeam,
        team1_score: parseInt(team1Score) || 0,
        team2_score: parseInt(team2Score) || 0,
      });
      const gamesRes = await api.get('/admin/games');
      setGames(gamesRes.data.games);
      setSelectedGame(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save stats');
    }
  };

  const openQuickResult = (game) => {
    setQuickResultGame(game);
    setQuickWinner(game.winner_team || '');
    setQuickScore1(game.team1_score || '');
    setQuickScore2(game.team2_score || '');
  };

  const submitQuickResult = async () => {
    if (!quickWinner) { alert('Please select a winner'); return; }
    setQuickSaving(true);
    try {
      await api.put(`/admin/games/${quickResultGame.id}/result`, {
        winner_team: quickWinner,
        team1_score: parseInt(quickScore1) || 0,
        team2_score: parseInt(quickScore2) || 0,
      });
      const gamesRes = await api.get('/admin/games');
      const teamsRes = await api.get('/admin/teams');
      setGames(gamesRes.data.games);
      setTeams(teamsRes.data.teams);
      setQuickResultGame(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save result');
    } finally {
      setQuickSaving(false);
    }
  };

  const generateSchedule = async () => {
    setGenerating(true);
    setGenerateResult(null);
    try {
      const res = await api.post('/admin/schedule/generate');
      setGenerateResult(res.data);
      const gamesRes = await api.get('/admin/games');
      setGames(gamesRes.data.games);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate schedule');
    } finally {
      setGenerating(false);
    }
  };

  const updateStat = (playerId, field, value) => {
    setStatsForm(prev => ({
      ...prev,
      [playerId]: { ...prev[playerId], [field]: parseInt(value) || 0 },
    }));
  };

  const toggleElimination = async (teamName, currentStatus) => {
    try {
      await api.put('/admin/teams/eliminate', { team_name: teamName, is_eliminated: !currentStatus });
      setTeams(prev => prev.map(t =>
        t.team === teamName ? { ...t, is_eliminated: !currentStatus ? 1 : 0 } : t
      ));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update team');
    }
  };

  const gamePlayers = selectedGame
    ? allPlayers.filter(p => p.team === selectedGame.team1 || p.team === selectedGame.team2)
    : [];
  const team1Players = gamePlayers.filter(p => p.team === selectedGame?.team1);
  const team2Players = gamePlayers.filter(p => p.team === selectedGame?.team2);

  if (loading) return <BallLoader />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
          {league && <p className="text-gray-400 text-sm mt-1">{league.name}</p>}
        </div>
        <Link to={`/league/${leagueId}`} className="text-gray-400 hover:text-white text-sm">← Back to League</Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 mb-6">
        {[
          { id: 'stats', label: '📊 Game Stats' },
          { id: 'schedule', label: '📅 Schedule' },
          { id: 'teams', label: '🏀 Teams' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t.id ? 'text-brand-400 border-brand-400' : 'text-gray-400 border-transparent hover:text-gray-200'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* STATS TAB */}
      {tab === 'stats' && (
        <div className="space-y-6">
          {/* Game list */}
          {!selectedGame && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
                <h2 className="font-bold text-white">Games</h2>
                <span className="text-xs text-gray-500">{games.filter(g => !g.is_completed).length} pending</span>
              </div>
              {games.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No games yet —
                  <button onClick={() => setTab('schedule')} className="text-brand-400 ml-1 hover:underline">
                    generate the schedule
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {games.map(game => (
                    <div key={game.id}>
                      {/* Main game row */}
                      <div className="px-5 py-3 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-medium text-sm">
                            {game.team1} <span className="text-gray-500">vs</span> {game.team2}
                          </div>
                          <div className="text-gray-500 text-xs">{game.round_name} · {game.game_date}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {game.is_completed ? (
                            <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">
                              {game.winner_team} wins · {game.team1_score}–{game.team2_score}
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => openQuickResult(quickResultGame?.id === game.id ? null : game)}
                                className="text-xs bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 px-2.5 py-1 rounded-lg hover:bg-yellow-500/25 transition-colors"
                              >
                                Mark Final
                              </button>
                              <button
                                onClick={() => loadGameForStats(game)}
                                className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
                              >
                                Enter Stats →
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Inline quick result form */}
                      {!game.is_completed && quickResultGame?.id === game.id && (
                        <div className="px-5 pb-4 bg-gray-900/40 border-t border-gray-800/50">
                          <div className="pt-3 grid grid-cols-3 gap-3 mb-3">
                            <div>
                              <label className="label text-xs">{game.team1}</label>
                              <input type="number" min="0" className="input py-1.5 text-sm"
                                placeholder="Score" value={quickScore1}
                                onChange={e => setQuickScore1(e.target.value)} />
                            </div>
                            <div>
                              <label className="label text-xs">{game.team2}</label>
                              <input type="number" min="0" className="input py-1.5 text-sm"
                                placeholder="Score" value={quickScore2}
                                onChange={e => setQuickScore2(e.target.value)} />
                            </div>
                            <div>
                              <label className="label text-xs">Winner</label>
                              <select className="input py-1.5 text-sm" value={quickWinner}
                                onChange={e => setQuickWinner(e.target.value)}>
                                <option value="">Select...</option>
                                <option value={game.team1}>{game.team1}</option>
                                <option value={game.team2}>{game.team2}</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2 items-center">
                            <button onClick={submitQuickResult} disabled={quickSaving || !quickWinner}
                              className="btn-primary px-4 py-1.5 text-sm disabled:opacity-50">
                              {quickSaving ? 'Saving...' : 'Save Result & Eliminate Loser'}
                            </button>
                            <button onClick={() => setQuickResultGame(null)}
                              className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
                              Cancel
                            </button>
                            <span className="text-gray-600 text-xs ml-1">
                              Loser is automatically eliminated
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Stats entry form */}
          {selectedGame && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-white">{selectedGame.team1} vs {selectedGame.team2}</h2>
                <button onClick={() => setSelectedGame(null)} className="text-gray-400 hover:text-white text-sm">
                  ← Back
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div>
                  <label className="label">{selectedGame.team1} Score</label>
                  <input type="number" className="input" value={team1Score}
                    onChange={e => setTeam1Score(e.target.value)} min="0" />
                </div>
                <div>
                  <label className="label">{selectedGame.team2} Score</label>
                  <input type="number" className="input" value={team2Score}
                    onChange={e => setTeam2Score(e.target.value)} min="0" />
                </div>
                <div>
                  <label className="label">Winner</label>
                  <select className="input" value={winnerTeam} onChange={e => setWinnerTeam(e.target.value)}>
                    <option value="">No winner yet</option>
                    <option value={selectedGame.team1}>{selectedGame.team1}</option>
                    <option value={selectedGame.team2}>{selectedGame.team2}</option>
                  </select>
                </div>
              </div>
              {[
                { label: selectedGame.team1, players: team1Players },
                { label: selectedGame.team2, players: team2Players },
              ].map(({ label, players }) => (
                <div key={label} className="mb-6">
                  <h3 className="text-brand-400 font-semibold mb-3 text-sm uppercase tracking-wide">{label}</h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left py-2 text-gray-400 font-medium">Player</th>
                        <th className="text-center py-2 px-1 text-gray-400 font-medium w-24">PTS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {players.map(player => (
                        <tr key={player.id}>
                          <td className="py-2 pr-2">
                            <div className="text-white text-sm font-medium">{player.name}</div>
                            <div className="text-gray-500 text-xs">{player.position}</div>
                          </td>
                          <td className="px-1 py-1">
                            <input type="number" min="0" max="99"
                              className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 text-center text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                              value={statsForm[player.id]?.points || ''}
                              placeholder="0"
                              onChange={e => updateStat(player.id, 'points', e.target.value)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
              <div className="flex gap-3">
                <button onClick={submitStats} className="btn-primary px-8 py-2.5">Save Stats</button>
                <button onClick={() => setSelectedGame(null)} className="btn-secondary px-6 py-2.5">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SCHEDULE TAB */}
      {tab === 'schedule' && (
        <div className="space-y-6">
          {/* Generate R64 */}
          <div className="card p-5">
            <h2 className="font-bold text-white mb-1">Generate Round of 64</h2>
            <p className="text-gray-400 text-sm mb-4">
              Automatically creates all 32 First Round matchups from the seeded team data —
              1v16, 2v15, 3v14, 4v13, 5v12, 6v11, 7v10, 8v9 in each region.
              East &amp; South games are dated March 19; West &amp; Midwest March 20. Safe to run multiple times — skips games that already exist.
            </p>
            {generateResult && (
              <div className="bg-green-900/20 border border-green-700/40 rounded-lg p-3 text-sm text-green-300 mb-4">
                {generateResult.message}
              </div>
            )}
            <button onClick={generateSchedule} disabled={generating}
              className="btn-primary px-6 py-2.5 disabled:opacity-50">
              {generating ? 'Generating...' : '⚡ Generate Round of 64 Schedule'}
            </button>
          </div>

          {/* Create game manually */}
          <div className="card p-5">
            <h2 className="font-bold text-white mb-4">Add Game Manually</h2>
            <form onSubmit={createGame} className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Game Date</label>
                <input type="date" className="input" value={gameForm.game_date}
                  onChange={e => setGameForm({ ...gameForm, game_date: e.target.value })} required />
              </div>
              <div>
                <label className="label">Round</label>
                <select className="input" value={gameForm.round_name}
                  onChange={e => setGameForm({ ...gameForm, round_name: e.target.value })}>
                  {ROUNDS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Team 1</label>
                <select className="input" value={gameForm.team1}
                  onChange={e => setGameForm({ ...gameForm, team1: e.target.value })} required>
                  <option value="">Select team...</option>
                  {teams.filter(t => !t.is_eliminated).map(t => (
                    <option key={t.team} value={t.team}>{t.team} (#{t.seed})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Team 2</label>
                <select className="input" value={gameForm.team2}
                  onChange={e => setGameForm({ ...gameForm, team2: e.target.value })} required>
                  <option value="">Select team...</option>
                  {teams.filter(t => !t.is_eliminated).map(t => (
                    <option key={t.team} value={t.team}>{t.team} (#{t.seed})</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className="btn-secondary px-6 py-2">Add Game</button>
              </div>
            </form>
          </div>

          {/* Game list in schedule view */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-bold text-white">All Games ({games.length})</h2>
            </div>
            {games.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No games scheduled yet</div>
            ) : (
              <div className="divide-y divide-gray-800">
                {games.map(game => (
                  <div key={game.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <div className="text-white text-sm font-medium">{game.team1} vs {game.team2}</div>
                      <div className="text-gray-500 text-xs">{game.round_name} · {game.game_date}</div>
                    </div>
                    {game.is_completed ? (
                      <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">
                        Final
                      </span>
                    ) : (
                      <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded-full">
                        Scheduled
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TEAMS TAB */}
      {tab === 'teams' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h2 className="font-bold text-white">Tournament Teams</h2>
            <p className="text-gray-400 text-sm mt-0.5">Teams are eliminated automatically when a game result is recorded</p>
          </div>
          <div className="divide-y divide-gray-800">
            {teams.map(team => (
              <div key={team.team} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className={`font-medium text-sm ${team.is_eliminated ? 'line-through text-gray-500' : 'text-white'}`}>
                    {team.team}
                  </div>
                  <div className="text-gray-500 text-xs">#{team.seed} · {team.region} · {team.player_count} players</div>
                </div>
                <button
                  onClick={() => toggleElimination(team.team, team.is_eliminated)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    team.is_eliminated
                      ? 'bg-red-900/30 text-red-400 border-red-500/30 hover:bg-gray-800 hover:text-gray-300 hover:border-gray-600'
                      : 'bg-green-900/30 text-green-400 border-green-500/30 hover:bg-red-900/30 hover:text-red-400 hover:border-red-500/30'
                  }`}
                >
                  {team.is_eliminated ? 'Eliminated ✗' : 'Active ✓'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
