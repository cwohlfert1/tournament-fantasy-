import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import { useDocTitle } from '../../hooks/useDocTitle';

export default function CreateGolfLeague() {
  useDocTitle('Create Golf League | TourneyRun');
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    team_name: '',
    max_teams: 8,
    salary_cap: 3000,
    roster_size: 8,
    starters_count: 6,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/golf/leagues', form);
      navigate(`/golf/league/${res.data.league.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create league');
      setLoading(false);
    }
  };

  const PillSelector = ({ options, value, onChange }) => (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
            value === opt.value
              ? 'bg-green-500/20 border-green-500/60 text-green-400 shadow-sm shadow-green-500/20'
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">

      <div className="mb-8">
        <h1 className="text-3xl font-black text-white">Create Golf League</h1>
        <p className="text-gray-400 mt-1">Set up your PGA Tour fantasy league for the 2025 season.</p>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg p-3 text-sm mb-6">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* League Basics */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-gray-800">
            <span className="text-xl">⛳</span>
            <h2 className="text-white font-bold">League Basics</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="label">League Name *</label>
              <input
                type="text"
                className="input text-base"
                placeholder="Golf Degens 2025"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Your Team Name *</label>
              <input
                type="text"
                className="input text-base"
                placeholder="The Bogey Boys"
                value={form.team_name}
                onChange={e => set('team_name', e.target.value)}
                required
              />
            </div>
          </div>
        </div>

        {/* League Settings */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-gray-800">
            <span className="text-xl">⚙️</span>
            <h2 className="text-white font-bold">League Settings</h2>
          </div>
          <div className="space-y-5">
            <div>
              <label className="label mb-2.5">Max Teams</label>
              <PillSelector
                options={[4, 6, 8, 10, 12].map(n => ({ value: n, label: String(n) }))}
                value={form.max_teams}
                onChange={v => set('max_teams', v)}
              />
            </div>
            <div>
              <label className="label mb-2.5">Salary Cap</label>
              <PillSelector
                options={[
                  { value: 2500, label: '$2,500' },
                  { value: 3000, label: '$3,000' },
                  { value: 3500, label: '$3,500' },
                  { value: 4000, label: '$4,000' },
                ]}
                value={form.salary_cap}
                onChange={v => set('salary_cap', v)}
              />
              <p className="text-gray-600 text-xs mt-2">
                Players have salaries from $200 (low-ranked) to $800 (elite). Build your roster within the cap.
              </p>
            </div>
            <div>
              <label className="label mb-2.5">Roster Size</label>
              <PillSelector
                options={[6, 8, 10, 12].map(n => ({ value: n, label: String(n) }))}
                value={form.roster_size}
                onChange={v => set('roster_size', v)}
              />
            </div>
            <div>
              <label className="label mb-2.5">Starters Per Week</label>
              <PillSelector
                options={[4, 5, 6].map(n => ({ value: n, label: String(n) }))}
                value={form.starters_count}
                onChange={v => set('starters_count', v)}
              />
              <p className="text-gray-600 text-xs mt-2">
                Number of golfers whose scores count each tournament week.
              </p>
            </div>
          </div>
        </div>

        {/* Scoring info */}
        <div className="bg-green-500/5 border border-green-500/20 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-green-400">🏆</span>
            <span className="text-green-400 font-bold text-sm">Scoring System</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs text-gray-400">
            <div>Eagle → <span className="text-yellow-400 font-bold">+8 pts</span></div>
            <div>Birdie → <span className="text-green-400 font-bold">+3 pts</span></div>
            <div>Par → <span className="text-gray-300 font-bold">+0.5 pts</span></div>
            <div>Bogey → <span className="text-orange-400 font-bold">−0.5 pts</span></div>
            <div>Double+ → <span className="text-red-400 font-bold">−2 pts</span></div>
            <div>Majors → <span className="text-yellow-400 font-bold">1.5× all</span></div>
          </div>
          <p className="text-gray-500 text-xs mt-3">Finish bonuses: Win +30, Top 5 +15, Top 10 +8, Top 25 +3</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white font-black text-base rounded-2xl transition-all shadow-lg shadow-green-500/25 hover:shadow-green-500/40"
        >
          {loading ? 'Creating League...' : 'Create Golf League →'}
        </button>
      </form>
    </div>
  );
}
