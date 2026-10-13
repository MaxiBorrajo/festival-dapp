import React, { useEffect, useState } from 'react';
import { X, Trash2, Loader2, Plus } from 'lucide-react';
import { EXPLORER, shortAddr } from '../lib/format';

export default function AssetsModal({ open, onClose, tokens, nfts, customIds, addToken, addNft, removeToken, removeNft }) {
  const [kind, setKind] = useState('token');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setAdded('');
    try {
      const cfg = kind === 'token' ? await addToken(address) : await addNft(address);
      setAdded(kind === 'token' ? cfg.fallbackSymbol : cfg.name);
      setAddress('');
    } catch (err) {
      setError(err?.message || 'No se pudo agregar.');
    } finally {
      setBusy(false);
    }
  };

  const tab = (k, text) => (
    <button
      type="button"
      role="radio"
      aria-checked={kind === k}
      onClick={() => {
        setKind(k);
        setError('');
        setAdded('');
      }}
      className={`flex-1 py-2 rounded-lg border text-sm font-medium ${
        kind === k ? 'bg-accent text-accent-fg border-accent' : 'bg-surface border-line hover:bg-surface-2'
      }`}
    >
      {text}
    </button>
  );

  const row = (label, address, id, isCustom, onRemove) => (
    <li key={id} className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="min-w-0">
        <span className="font-medium block truncate">{label}</span>
        <a
          href={`${EXPLORER}/address/${address}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted underline"
        >
          {shortAddr(address)}
        </a>
      </span>
      {isCustom ? (
        <button
          onClick={() => onRemove(id)}
          aria-label={`Quitar ${label}`}
          className="p-1.5 rounded-lg text-danger hover:bg-danger-soft"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" />
        </button>
      ) : (
        <span className="text-xs text-muted">Por defecto</span>
      )}
    </li>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assets-title"
        className="card w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-5 md:p-6 space-y-5 rounded-b-none sm:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="assets-title" className="text-lg font-semibold">
            Tokens y NFTs
          </h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-surface-2">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div role="radiogroup" aria-label="Tipo" className="flex gap-2">
            {tab('token', 'Token ERC-20')}
            {tab('nft', 'NFT')}
          </div>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x… dirección del contrato en Sepolia"
            aria-label="Dirección del contrato"
            spellCheck={false}
            className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface font-mono text-sm outline-none focus:border-accent"
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {added && <p className="text-sm text-ok">Agregado: {added}</p>}
          <button type="submit" disabled={busy || !address.trim()} className="btn-primary w-full">
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="w-4 h-4" aria-hidden="true" />
            )}
            Agregar
          </button>
          <p className="text-xs text-muted">
            Se guarda en este navegador. Un NFT debe tener <code>mint(uint256)</code> o <code>buyTicket()</code>.
          </p>
        </form>

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold mb-1">Tokens</h3>
            <ul className="rounded-xl border border-line divide-y divide-line">
              {tokens.map((t) =>
                row(t.symbol, t.address, t.id, customIds.tokens.includes(t.id), removeToken)
              )}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-1">NFTs</h3>
            <ul className="rounded-xl border border-line divide-y divide-line">
              {nfts.map((n) => row(n.name, n.address, n.id, customIds.nfts.includes(n.id), removeNft))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
