import React from 'react';
import { Ticket, Layers, History } from 'lucide-react';

const TABS = [
  { id: 'buy', label: 'Comprar', Icon: Ticket },
  { id: 'tickets', label: 'Mis tickets', Icon: Layers },
  { id: 'history', label: 'Historial', Icon: History }
];

// Pestañas subrayadas en escritorio; barra fija inferior en móvil.
export default function TabNav({ active, onChange, counts }) {
  const onKeyDown = (e) => {
    const i = TABS.findIndex((t) => t.id === active);
    if (e.key === 'ArrowRight') onChange(TABS[(i + 1) % TABS.length].id);
    if (e.key === 'ArrowLeft') onChange(TABS[(i - 1 + TABS.length) % TABS.length].id);
  };

  return (
    <div className="md:max-w-6xl md:mx-auto md:w-full md:px-4 md:mt-6">
      <div
        role="tablist"
        aria-label="Secciones"
        onKeyDown={onKeyDown}
        className="fixed bottom-0 inset-x-0 z-20 grid grid-cols-3 bg-surface border-t border-line
          md:static md:flex md:gap-6 md:bg-transparent md:border-t-0 md:border-b"
      >
        {TABS.map(({ id, label, Icon }) => {
          const selected = active === id;
          const count = counts[id];
          return (
            <button
              key={id}
              id={`tab-${id}`}
              role="tab"
              aria-selected={selected}
              aria-controls={`panel-${id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(id)}
              className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-3 py-2.5 md:px-1 md:py-3 text-sm font-medium transition md:border-b-2 md:-mb-px ${
                selected
                  ? 'text-accent md:text-fg md:border-accent'
                  : 'text-muted hover:text-fg md:border-transparent'
              }`}
            >
              <Icon className="w-5 h-5 md:w-4 md:h-4" aria-hidden="true" />
              <span>{label}</span>
              {count > 0 && (
                <span className="px-1.5 text-xs rounded-full bg-surface-2 text-muted tabular-nums">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
