import { useState, useEffect } from 'react';
import api from '../../api';
import HorseSelector from './HorseSelector';
import SilkSwatch from './SilkSwatch';

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

  function getDisabledIds(slot) {
    return SLOTS.filter(s => s.key !== slot).map(s => picks[s.key]).filter(Boolean);
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

  if (isLocked) {
    return (
      <div className="space-y-2">
        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-3">Your Picks (locked)</h3>
        {SLOTS.map(s => {
          const horse = activeHorses.find(h => h.id === picks[s.key]);
          return (
            <div key={s.key} className="border border-gray-800 rounded-2xl p-3 flex items-center gap-3">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide w-12">{s.label}</span>
              {horse ? (
                <>
                  <SilkSwatch silkColors={horse.silk_colors} size={24} />
                  <span className="text-white font-semibold text-sm">{horse.horse_name}</span>
                  <span className="text-gray-500 text-xs ml-auto">#{horse.post_position}</span>
                </>
              ) : (
                <span className="text-gray-500 text-sm">No pick</span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div className="text-red-400 text-sm border border-red-500/30 rounded-2xl px-3 py-2">{error}</div>}
      {saved && <div className="text-green-400 text-sm border border-green-500/30 rounded-2xl px-3 py-2">Picks saved</div>}

      {SLOTS.map(s => (
        <HorseSelector
          key={s.key}
          label={`${s.label} — ${s.desc}`}
          horses={activeHorses}
          value={picks[s.key]}
          onChange={id => { setPicks(p => ({ ...p, [s.key]: id })); setSaved(false); }}
          disabledIds={getDisabledIds(s.key)}
          placeholder={`Select ${s.label.toLowerCase()} horse`}
        />
      ))}

      <button onClick={handleSave} disabled={!allPicked || saving}
        className="w-full bg-horses-500 hover:bg-horses-600 text-white py-2.5 rounded-2xl text-sm font-bold disabled:opacity-50">
        {saving ? 'Saving...' : 'Save Picks'}
      </button>
    </div>
  );
}
