import { useState, useEffect } from 'react';
import api from '../../api';

const SLOTS = [
  { key: 'win', label: 'Win', desc: 'Pick the horse that will finish 1st' },
  { key: 'place', label: 'Place', desc: 'Pick a horse to finish in the top 2' },
  { key: 'show', label: 'Show', desc: 'Pick a horse to finish in the top 3' },
];

export default function PickWPSForm({ poolId, eventId, horses = [], currentPicks = [], poolStatus, onPicksSaved }) {
  const [picks, setPicks] = useState({ win: '', place: '', show: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (currentPicks.length) {
      const map = {};
      currentPicks.forEach(p => { map[p.slot] = p.horse_id; });
      setPicks(prev => ({ ...prev, ...map }));
    }
  }, [currentPicks]);

  const activeHorses = horses.filter(h => h.status === 'active');
  const isLocked = poolStatus !== 'open';

  function getAvailable(slot) {
    const otherSlots = SLOTS.filter(s => s.key !== slot).map(s => picks[s.key]);
    return activeHorses.filter(h => !otherSlots.includes(h.id));
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      await api.post(`/horses/pools/${poolId}/picks`, {
        win_horse_id: picks.win,
        place_horse_id: picks.place,
        show_horse_id: picks.show,
      });
      setSaved(true);
      onPicksSaved?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save picks');
    } finally { setSaving(false); }
  }

  const allPicked = picks.win && picks.place && picks.show;
  const horseName = (id) => activeHorses.find(h => h.id === id)?.horse_name || '';

  if (isLocked) {
    return (
      <div className="space-y-2">
        <h3 className="text-sm text-gray-400 uppercase tracking-wide mb-2">Your Picks (locked)</h3>
        {SLOTS.map(s => (
          <div key={s.key} className="border border-gray-700 rounded-lg p-3 flex items-center justify-between">
            <span className="text-gray-400 text-sm w-16">{s.label}</span>
            <span className="text-white font-medium">{horseName(picks[s.key]) || 'No pick'}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div className="text-red-400 text-sm border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}
      {saved && <div className="text-green-400 text-sm border border-green-500/30 rounded-lg px-3 py-2">Picks saved</div>}

      {SLOTS.map(s => (
        <div key={s.key}>
          <label className="text-sm text-gray-400 mb-1 block">{s.label} &mdash; {s.desc}</label>
          <select value={picks[s.key]} onChange={e => { setPicks(p => ({ ...p, [s.key]: e.target.value })); setSaved(false); }}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm w-full">
            <option value="">Select a horse</option>
            {getAvailable(s.key).map(h => (
              <option key={h.id} value={h.id}>#{h.post_position || '?'} {h.horse_name} ({h.morning_line_odds || 'N/A'})</option>
            ))}
          </select>
        </div>
      ))}

      <button onClick={handleSave} disabled={!allPicked || saving}
        className="w-full bg-horses-500 hover:bg-horses-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
        {saving ? 'Saving...' : 'Save Picks'}
      </button>
    </div>
  );
}
