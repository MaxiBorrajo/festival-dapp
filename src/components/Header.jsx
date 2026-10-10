import React, { useState, useEffect, useRef } from 'react';
import { Ticket, Wallet, Copy, Check, ExternalLink, LogOut, ChevronDown, RefreshCw } from 'lucide-react';
import { EXPLORER, shortAddr } from '../lib/format';

function WalletMenu({ account, onDisconnect }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* portapapeles no disponible */
    }
  };

  const itemClass =
    'w-full flex items-center gap-2 px-3 py-2.5 text-sm text-fg hover:bg-surface-2 rounded-md text-left';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="chip hover:bg-surface-2"
      >
        <span className="w-2 h-2 rounded-full bg-ok" aria-hidden="true" />
        <span className="font-mono">{shortAddr(account)}</span>
        <ChevronDown className="w-4 h-4 text-muted" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 p-1.5 rounded-xl bg-surface border border-line shadow-lg z-30"
        >
          <button role="menuitem" onClick={copy} className={itemClass}>
            {copied ? <Check className="w-4 h-4 text-ok" /> : <Copy className="w-4 h-4 text-muted" />}
            {copied ? 'Dirección copiada' : 'Copiar dirección'}
          </button>
          <a
            role="menuitem"
            href={`${EXPLORER}/address/${account}`}
            target="_blank"
            rel="noreferrer"
            className={itemClass}
          >
            <ExternalLink className="w-4 h-4 text-muted" />
            Ver en Etherscan
          </a>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDisconnect();
            }}
            className={`${itemClass} text-danger`}
          >
            <LogOut className="w-4 h-4" />
            Desconectar
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({
  account,
  tokenSymbol,
  tokenBalance,
  ethBalance,
  isConnecting,
  hasLoaded,
  pending,
  onPendingClick,
  onConnect,
  onDisconnect
}) {
  const skeleton = <span className="inline-block w-14 h-4 rounded bg-surface-2 animate-pulse" />;

  return (
    <header className="bg-surface border-b border-line">
      <div className="max-w-6xl mx-auto w-full px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="w-10 h-10 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-fg">
            <Ticket className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">UNQ Festival</h1>
            <p className="text-sm text-muted leading-tight">
              Entradas para holders de {tokenSymbol}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
          {pending && (
            <button onClick={onPendingClick} className="chip border-warn/40 bg-warn-soft text-warn">
              <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
              Transacción en curso
            </button>
          )}

          {account && (
            <>
              <div className="chip" title="Saldo del token">
                {hasLoaded ? (
                  <span>
                    {Number(tokenBalance).toLocaleString('es-AR', { maximumFractionDigits: 4 })}{' '}
                    <span className="text-muted">{tokenSymbol}</span>
                  </span>
                ) : (
                  skeleton
                )}
              </div>
              <div className="chip" title="Saldo de ETH">
                {hasLoaded ? (
                  <span>
                    {ethBalance} <span className="text-muted">ETH</span>
                  </span>
                ) : (
                  skeleton
                )}
              </div>
            </>
          )}

          {account ? (
            <WalletMenu account={account} onDisconnect={onDisconnect} />
          ) : (
            <button onClick={onConnect} disabled={isConnecting} className="btn-primary">
              <Wallet className="w-4 h-4" aria-hidden="true" />
              {isConnecting ? 'Conectando…' : 'Conectar billetera'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
