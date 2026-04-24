import { useState, useRef, useEffect } from 'react';
import SilkSwatch from './SilkSwatch';

/**
 * HorseSelector — replaces <select> dropdown with a rich card-based picker.
 * Shows silk swatch, horse name, post position, jockey, and odds.
 */
export default function HorseSelector({ horses = [], value, onChange, disabledIds = [], placeholder = 'Select a horse', label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = horses.find(h => h.id === value);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label && <div className="text-sm text-gray-400 mb-1">{label}</div>}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-3 py-2.5 text-left flex items-center gap-3 hover:border-horses-500/40 transition-colors"
      >
        {selected ? (
          <>
            <SilkSwatch silkColors={selected.silk_colors} size={28} />
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-semibold truncate">{selected.horse_name}</div>
              <div className="text-gray-500 text-xs">#{selected.post_position} &middot; {selected.jockey_name || 'TBD'} &middot; {selected.morning_line_odds || ''}</div>
            </div>
          </>
        ) : (
          <span className="text-gray-500 text-sm">{placeholder}</span>
        )}
        <svg width="12" height="7" viewBox="0 0 12 7" fill="none" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}>
          <path d="M1 1L6 6L11 1" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl shadow-black/40 max-h-72 overflow-y-auto">
          {/* Clear option */}
          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-800/60 border-b border-gray-800/50"
            >
              Clear selection
            </button>
          )}

          {horses.map(h => {
            const disabled = disabledIds.includes(h.id);
            const isSelected = h.id === value;
            return (
              <button
                key={h.id}
                type="button"
                disabled={disabled}
                onClick={() => { onChange(h.id); setOpen(false); }}
                className={`w-full px-3 py-2.5 text-left flex items-center gap-3 transition-colors ${
                  isSelected ? 'bg-horses-500/15 border-l-2 border-horses-500' :
                  disabled ? 'opacity-30 cursor-not-allowed' :
                  'hover:bg-gray-800/60 border-l-2 border-transparent'
                }`}
              >
                <SilkSwatch silkColors={h.silk_colors} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-mono text-xs">#{h.post_position || '?'}</span>
                    <span className={`text-sm font-semibold truncate ${h.status === 'scratched' ? 'text-gray-500 line-through' : 'text-white'}`}>
                      {h.horse_name}
                    </span>
                  </div>
                  <div className="text-gray-500 text-xs mt-0.5">
                    {h.jockey_name || 'TBD'} &middot; {h.morning_line_odds || ''}
                    {h.silk_colors && <span className="text-gray-600"> &middot; {h.silk_colors}</span>}
                  </div>
                </div>
                {disabled && <span className="text-[10px] text-gray-600 uppercase tracking-wide">Used</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
