/**
 * Select — custom dropdown component matching the dark theme.
 *
 * Drop-in replacement for native <select> — avoids OS-rendered dropdowns
 * that break the theme. Supports keyboard nav, outside-click dismiss,
 * and optional icon/leading slot.
 *
 * Usage:
 *   <Select
 *     value={value}
 *     onChange={setValue}
 *     options={[
 *       { value: 'a', label: 'Option A' },
 *       { value: 'b', label: 'Option B', icon: <Flag size={14} /> },
 *     ]}
 *     placeholder="Choose…"
 *   />
 *
 * Props:
 *   value       current value (string/number)
 *   onChange    (newValue) => void
 *   options     [{ value, label, icon?, disabled? }]
 *   placeholder string shown when no value selected
 *   disabled    bool
 *   size        'sm' | 'md' | 'lg' (default md)
 *   fullWidth   bool (default false; sets width:100%)
 *   className   extra classes on the trigger
 *   id          trigger id (for label htmlFor)
 */
import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const SIZES = {
  sm: { h: 32, padX: 10, font: 12 },
  md: { h: 38, padX: 12, font: 13 },
  lg: { h: 44, padX: 14, font: 14 },
};

export default function Select({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  disabled = false,
  size = 'md',
  fullWidth = false,
  className = '',
  id,
  ariaLabel,
}) {
  const s = SIZES[size] || SIZES.md;
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find(o => o.value === value) || null;

  // Outside click to close
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Keyboard nav
  function onKeyDown(e) {
    if (disabled) return;
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
      e.preventDefault();
      setOpen(true);
      const curIdx = options.findIndex(o => o.value === value);
      setActiveIdx(curIdx >= 0 ? curIdx : 0);
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => {
        const next = Math.min(options.length - 1, i + 1);
        return options[next]?.disabled ? Math.min(options.length - 1, next + 1) : next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = options[activeIdx];
      if (o && !o.disabled) { onChange?.(o.value); setOpen(false); }
    }
  }

  function pick(o) {
    if (o.disabled) return;
    onChange?.(o.value);
    setOpen(false);
  }

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', width: fullWidth ? '100%' : 'auto', display: fullWidth ? 'block' : 'inline-block' }}
    >
      <button
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={onKeyDown}
        className={className}
        style={{
          height: s.h,
          padding: `0 ${s.padX}px`,
          paddingRight: s.padX + 22,
          fontSize: s.font,
          width: fullWidth ? '100%' : 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(30,41,59,0.6)',
          border: `1px solid ${open ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 8,
          color: selected ? '#f3f4f6' : '#6b7280',
          fontWeight: 500,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
          outline: 'none',
          boxShadow: open ? '0 0 0 3px rgba(34,197,94,0.1)' : 'none',
          position: 'relative',
          textAlign: 'left',
          letterSpacing: '-0.005em',
        }}
      >
        {selected?.icon && <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, color: '#9ca3af' }}>{selected.icon}</span>}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          style={{
            position: 'absolute',
            right: s.padX,
            top: '50%',
            transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
            color: '#6b7280',
            transition: 'transform 0.18s',
          }}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-activedescendant={activeIdx >= 0 ? `opt-${options[activeIdx]?.value}` : undefined}
          style={{
            position: 'absolute',
            top: `calc(100% + 4px)`,
            left: 0,
            right: fullWidth ? 0 : undefined,
            minWidth: fullWidth ? undefined : '100%',
            maxHeight: 280,
            overflowY: 'auto',
            background: '#0f1923',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            boxShadow: '0 16px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.25)',
            padding: 4,
            zIndex: 9500,
            animation: 'tr-select-in 0.14s ease-out',
          }}
        >
          <style>{`
            @keyframes tr-select-in {
              from { opacity: 0; transform: translateY(-4px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          {options.length === 0 && (
            <div style={{ padding: '10px 12px', color: '#6b7280', fontSize: 13 }}>No options</div>
          )}
          {options.map((o, i) => {
            const isSelected = o.value === value;
            const isActive   = i === activeIdx;
            return (
              <button
                id={`opt-${o.value}`}
                key={String(o.value)}
                role="option"
                aria-selected={isSelected}
                disabled={o.disabled}
                onClick={() => pick(o)}
                onMouseEnter={() => setActiveIdx(i)}
                type="button"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  padding: '7px 10px',
                  borderRadius: 6,
                  background: isActive ? 'rgba(34,197,94,0.1)' : 'transparent',
                  border: 'none',
                  color: o.disabled ? '#4b5563' : isSelected ? '#4ade80' : '#e5e7eb',
                  fontSize: s.font,
                  fontWeight: isSelected ? 600 : 500,
                  textAlign: 'left',
                  cursor: o.disabled ? 'not-allowed' : 'pointer',
                  opacity: o.disabled ? 0.5 : 1,
                  transition: 'background 0.1s',
                  letterSpacing: '-0.005em',
                }}
              >
                {o.icon && <span style={{ flexShrink: 0, display: 'inline-flex', color: isSelected ? '#4ade80' : '#9ca3af' }}>{o.icon}</span>}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                {isSelected && <Check size={14} style={{ color: '#22c55e', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
