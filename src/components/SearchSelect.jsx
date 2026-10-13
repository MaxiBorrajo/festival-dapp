import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

// Select con búsqueda. options: [{ value, label, hint?, disabled?, keywords? }]
export default function SearchSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  placeholder = 'Buscar…',
  compact = false,
  align = 'left'
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const labelId = useId();

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.hint ?? ''} ${o.keywords ?? ''}`.toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const onDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => setActive(0), [query, open]);

  const pick = (o) => {
    if (!o || o.disabled) return;
    onChange(o.value);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(filtered[active]);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <span id={labelId} className={compact ? 'sr-only' : 'text-sm font-medium block mb-2'}>
        {label}
      </span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={
          compact
            ? 'chip hover:bg-surface-2 gap-2'
            : 'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-line bg-surface hover:bg-surface-2 text-left disabled:opacity-60 disabled:cursor-not-allowed'
        }
      >
        {compact ? (
          <span className="whitespace-nowrap">
            {selected?.chipLabel ?? selected?.label ?? '—'}
          </span>
        ) : (
          <span className="min-w-0">
            <span className="font-semibold block truncate">{selected?.label ?? '—'}</span>
            {selected?.hint && <span className="text-xs text-muted block truncate">{selected.hint}</span>}
          </span>
        )}
        <ChevronDown className="w-4 h-4 shrink-0 text-muted" aria-hidden="true" />
      </button>

      {open && (
        <div
          className={`absolute z-30 mt-1 card shadow-lg p-2 space-y-2 ${
            compact ? `w-64 ${align === 'right' ? 'right-0' : 'left-0'}` : 'w-full'
          }`}
          onKeyDown={onKeyDown}
        >
          <div className="flex items-center gap-2 px-2 border border-line rounded-lg bg-surface">
            <Search className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              aria-label="Buscar"
              className="w-full py-2 bg-transparent outline-none text-sm"
            />
          </div>
          <ul role="listbox" aria-labelledby={labelId} className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-muted">Sin resultados</li>}
            {filtered.map((o, i) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg cursor-pointer ${
                  i === active ? 'bg-surface-2' : ''
                } ${o.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="min-w-0">
                  <span className="font-medium block truncate">{o.label}</span>
                  {o.hint && <span className="text-xs text-muted block truncate">{o.hint}</span>}
                </span>
                {o.value === value && <Check className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
