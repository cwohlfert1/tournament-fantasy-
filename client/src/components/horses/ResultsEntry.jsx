import { useState } from 'react';
import api from '../../api';

export default function ResultsEntry({ poolId, horses = [], formatType, existingResults = [], isFinalized, onResultsSaved, onPayoutsTriggered }) {
  const minPositions = formatType === 'squares' ? 4 : 3;
  const [results, setResults] = useState(() => {
    if (existingResults.length) return existingResults.map(r => ({ finish_position: r.finish_position, horse_id: r.horse_id, post_position: r.post_position }));
    return Array.from({ length: minPositions }, (_, i) => ({ finish_position: i + 1, horse_id: '', post_position: '' }));
  });
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [payoutPreview, setPayoutPreview] = useState(null);
  const [error, setError] = useState('');

  function setResult(idx, field, val) {
    setResults(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  }

  const horseName = (id) => horses.find(h => h.id === id)?.horse_name || '';
  const allFilled = results.every(r => r.horse_id);
  const usedHorses = results.map(r => r.horse_id).filter(Boolean);

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      // Auto-fill post_position from horse data
      const payload = results.map(r => {
        const horse = horses.find(h => h.id === r.horse_id);
        return { ...r, post_position: r.post_position || horse?.post_position || null };
      });
      await api.post(`/horses/pools/${poolId}/results`, { results: payload });
      onResultsSaved?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save results');
    } finally { setSaving(false); }
  }

  async function handleTriggerPayouts() {
    setError('');
    setTriggering(true);
    try {
      const r = await api.post(`/horses/pools/${poolId}/payouts/trigger`);
      setShowConfirm(false);
      onPayoutsTriggered?.(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to trigger payouts');
    } finally { setTriggering(false); }
  }

  if (isFinalized) {
    return (
      <div className="space-y-2">
        <div className="text-sm text-gray-400 uppercase tracking-wide">Results (finalized)</div>
        {results.map(r => (
          <div key={r.finish_position} className="border border-gray-700 rounded-lg p-3 flex items-center gap-3">
            <span className="text-gray-400 font-mono w-8">{r.finish_position}.</span>
            <span className="text-white font-medium">{horseName(r.horse_id)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div className="text-red-400 text-sm border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}

      <div className="text-sm text-gray-400 uppercase tracking-wide">Enter Finish Order</div>
      {results.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-gray-400 font-mono w-8 text-sm">{r.finish_position}.</span>
          <select value={r.horse_id} onChange={e => setResult(i, 'horse_id', e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm flex-1">
            <option value="">Select horse</option>
            {horses.filter(h => !usedHorses.includes(h.id) || h.id === r.horse_id).map(h => (
              <option key={h.id} value={h.id}>#{h.post_position || '?'} {h.horse_name}</option>
            ))}
          </select>
          {formatType === 'squares' && (
            <input type="number" value={r.post_position || ''} onChange={e => setResult(i, 'post_position', Number(e.target.value))}
              placeholder="PP" className="bg-gray-800 border border-gray-700 rounded px-2 py-2 text-white text-sm w-16" />
          )}
        </div>
      ))}

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={!allFilled || saving}
          className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Results'}
        </button>
        <button onClick={() => setShowConfirm(true)} disabled={!allFilled}
          className="bg-horses-500 hover:bg-horses-600 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">
          Trigger Payouts
        </button>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="text-white font-semibold text-lg">Confirm Payouts</h3>
            <div className="text-sm text-gray-300 space-y-1">
              {results.filter(r => r.horse_id).map(r => (
                <div key={r.finish_position}>
                  <span className="text-gray-500">{r.finish_position}.</span> {horseName(r.horse_id)}
                </div>
              ))}
            </div>
            <p className="text-sm text-gray-400">
              This will finalize payouts. Results cannot be changed after this point without admin intervention.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm(false)} className="flex-1 border border-gray-700 text-white py-2 rounded-lg text-sm">Cancel</button>
              <button onClick={handleTriggerPayouts} disabled={triggering}
                className="flex-1 bg-horses-500 hover:bg-horses-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
                {triggering ? 'Finalizing...' : 'Confirm & Finalize'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
