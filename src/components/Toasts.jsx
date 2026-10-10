import React from 'react';
import { CheckCircle2, AlertCircle, Info, X, ArrowUpRight } from 'lucide-react';
import { EXPLORER } from '../lib/format';

const STYLES = {
  success: { box: 'bg-ok-soft border-ok/40', Icon: CheckCircle2, icon: 'text-ok' },
  error: { box: 'bg-danger-soft border-danger/40', Icon: AlertCircle, icon: 'text-danger' },
  info: { box: 'bg-surface border-line', Icon: Info, icon: 'text-accent' }
};

export default function Toasts({ toasts, onDismiss }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-40 top-4 right-4 left-4 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => {
        const { box, Icon, icon } = STYLES[t.type] || STYLES.info;
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-lg text-sm ${box}`}
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${icon}`} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="font-medium break-words">{t.message}</p>
              {t.txHash && (
                <a
                  href={`${EXPLORER}/tx/${t.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-accent underline"
                >
                  Ver en Etherscan <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                </a>
              )}
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              aria-label="Cerrar notificación"
              className="p-1 rounded-md text-muted hover:bg-surface-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
