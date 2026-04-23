import { useState } from 'react';
import api from '../../api';

export default function SquaresGrid({ poolId, squares = [], currentEntryId, poolStatus, onUpdate }) {
  const [selected, setSelected] = useState([]);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState('');

  const isOpen = poolStatus === 'open';
  const hasDigits = squares.some(s => s.row_digit !== null);

  // Build 10x10 grid lookup
  const grid = {};
  squares.forEach(s => { grid[`${s.row_num}-${s.col_num}`] = s; });

  function toggleSquare(row, col) {
    if (!isOpen) return;
    const sq = grid[`${row}-${col}`];
    if (!sq) return;
    if (sq.entry_id && sq.entry_id !== currentEntryId) return; // claimed by someone else

    const key = `${row}-${col}`;
    if (sq.entry_id === currentEntryId) {
      // Unclaim
      setSelected(prev => prev.filter(s => s !== key));
      // Immediate unclaim
      api.post(`/horses/pools/${poolId}/squares/unclaim`, { squares: [{ row, col }] })
        .then(() => onUpdate?.())
        .catch(() => {});
      return;
    }

    setSelected(prev =>
      prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
    );
  }

  async function handleClaim() {
    if (!selected.length) return;
    setError('');
    setClaiming(true);
    try {
      const claimSquares = selected.map(k => {
        const [row, col] = k.split('-').map(Number);
        return { row, col };
      });
      await api.post(`/horses/pools/${poolId}/squares/claim`, { squares: claimSquares });
      setSelected([]);
      onUpdate?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to claim squares');
    } finally { setClaiming(false); }
  }

  function cellClass(row, col) {
    const sq = grid[`${row}-${col}`];
    const key = `${row}-${col}`;
    const base = 'w-full aspect-square flex items-center justify-center text-xs border border-gray-700 transition-colors cursor-pointer select-none';

    if (!sq) return `${base} bg-gray-900`;
    if (selected.includes(key)) return `${base} bg-horses-500/40 border-horses-500`;
    if (sq.entry_id === currentEntryId) return `${base} bg-horses-500/20 border-horses-500/50`;
    if (sq.entry_id) return `${base} bg-gray-700/50 cursor-default`;
    if (!isOpen) return `${base} bg-gray-900 cursor-default`;
    return `${base} bg-gray-800/50 hover:bg-gray-700/50`;
  }

  return (
    <div className="space-y-3">
      {error && <div className="text-red-400 text-sm border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-[auto_repeat(10,1fr)] gap-0 min-w-[340px]">
          {/* Header row */}
          <div className="w-8" />
          {Array.from({ length: 10 }, (_, c) => (
            <div key={`h-${c}`} className="text-center text-xs text-gray-500 py-1 font-mono">
              {hasDigits ? (grid[`0-${c}`]?.col_digit ?? c) : c}
            </div>
          ))}

          {/* Grid rows */}
          {Array.from({ length: 10 }, (_, r) => (
            <>
              <div key={`l-${r}`} className="w-8 flex items-center justify-center text-xs text-gray-500 font-mono">
                {hasDigits ? (grid[`${r}-0`]?.row_digit ?? r) : r}
              </div>
              {Array.from({ length: 10 }, (_, c) => {
                const sq = grid[`${r}-${c}`];
                return (
                  <div key={`${r}-${c}`} onClick={() => toggleSquare(r, c)} className={cellClass(r, c)}
                    style={{ minWidth: 30, minHeight: 30 }}>
                    {sq?.display_name ? (
                      <span className="truncate text-[10px] text-gray-300 px-0.5">
                        {sq.display_name.slice(0, 3)}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Claim button */}
      {isOpen && selected.length > 0 && (
        <button onClick={handleClaim} disabled={claiming}
          className="w-full bg-horses-500 hover:bg-horses-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {claiming ? 'Claiming...' : `Claim ${selected.length} Square${selected.length > 1 ? 's' : ''}`}
        </button>
      )}

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-500 justify-center">
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-horses-500/20 border border-horses-500/50 inline-block" /> Yours</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-700/50 border border-gray-700 inline-block" /> Taken</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-800/50 border border-gray-700 inline-block" /> Open</span>
      </div>
    </div>
  );
}
