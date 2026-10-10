import React, { useState } from 'react';
import { RefreshCw, Trash2, Clock, Zap, Ticket, Copy, Check, ExternalLink } from 'lucide-react';
import { EXPLORER, shortHash } from '../lib/format';

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'success', label: 'Confirmadas' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'failed', label: 'Fallidas' }
];

const STATUS = {
  success: { label: 'Confirmada', cls: 'bg-ok-soft border-ok/30 text-ok' },
  pending: { label: 'Pendiente', cls: 'bg-warn-soft border-warn/30 text-warn' },
  failed: { label: 'Fallida', cls: 'bg-danger-soft border-danger/30 text-danger' }
};

export default function HistoryTab({ transactions, tokenSymbol, isLoading, onSync, onClear, onGoBuy }) {
  const [filter, setFilter] = useState('all');
  const [copied, setCopied] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const visible = filter === 'all' ? transactions : transactions.filter((t) => t.status === filter);

  const copy = async (hash) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(hash);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      /* portapapeles no disponible */
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Historial de transacciones</h2>
          <p className="text-sm text-muted mt-0.5">Pagos de tokens y minteos de entradas en Sepolia</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onSync} disabled={isLoading} className="btn-ghost">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Sincronizar
          </button>
          {transactions.length > 0 &&
            (confirmClear ? (
              <button
                onClick={() => {
                  onClear();
                  setConfirmClear(false);
                }}
                onBlur={() => setConfirmClear(false)}
                autoFocus
                className="btn border border-danger/40 bg-danger-soft text-danger"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                ¿Seguro? Vaciar
              </button>
            ) : (
              <button onClick={() => setConfirmClear(true)} className="btn-ghost text-danger">
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                Limpiar
              </button>
            ))}
        </div>
      </div>

      {transactions.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
          {FILTERS.map((f) => {
            const count = f.id === 'all' ? transactions.length : transactions.filter((t) => t.status === f.id).length;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                  filter === f.id
                    ? 'bg-accent border-accent text-accent-fg'
                    : 'bg-surface border-line text-muted hover:text-fg'
                }`}
              >
                {f.label} <span className="tabular-nums">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {transactions.length === 0 ? (
        <div className="card p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center text-muted mx-auto">
            <Clock className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Sin transacciones registradas</h3>
            <p className="text-sm text-muted max-w-sm mx-auto mt-1">
              Cuando pagues en {tokenSymbol} o mintees entradas, aparecerán aquí con su enlace a Etherscan.
            </p>
          </div>
          <button onClick={onGoBuy} className="btn-primary">
            Realizar una compra
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">No hay transacciones con ese estado.</div>
      ) : (
        <ul className="card overflow-hidden divide-y divide-line">
          {visible.map((tx) => {
            const st = STATUS[tx.status] || STATUS.failed;
            return (
              <li key={tx.hash} className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-lg bg-surface-2 flex items-center justify-center shrink-0 text-muted">
                    {tx.type === 'TOKEN_PAYMENT' ? (
                      <Zap className="w-5 h-5" aria-hidden="true" />
                    ) : (
                      <Ticket className="w-5 h-5" aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">{tx.title}</h3>
                      <span className={`px-2 py-0.5 rounded-full text-sm font-medium border ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                    <p className="text-sm text-muted mt-0.5">{tx.description}</p>
                    <time className="text-sm text-muted block mt-1 tabular-nums">
                      {new Date(tx.timestamp || Date.now()).toLocaleString('es-AR')}
                    </time>
                  </div>
                </div>

                <div className="flex flex-col md:items-end gap-2">
                  <div className="md:text-right">
                    <span className="text-base font-semibold tabular-nums block">{tx.amount}</span>
                    {tx.costEth && tx.costEth !== '0 ETH' && (
                      <span className="text-sm text-muted tabular-nums">+ {tx.costEth}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 font-mono text-sm bg-surface-2 px-2 py-1 rounded-md text-muted">
                      <span>{shortHash(tx.hash)}</span>
                      <button
                        onClick={() => copy(tx.hash)}
                        aria-label="Copiar hash de la transacción"
                        className="hover:text-fg transition"
                      >
                        {copied === tx.hash ? <Check className="w-4 h-4 text-ok" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <a
                      href={`${EXPLORER}/tx/${tx.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-md border border-line text-sm font-medium inline-flex items-center gap-1 hover:bg-surface-2 transition"
                    >
                      Explorer <ExternalLink className="w-4 h-4 text-muted" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
