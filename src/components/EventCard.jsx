import React from 'react';
import { ArrowUpRight, Ticket } from 'lucide-react';
import { CONTRACT_ADDRESSES } from '../contracts';
import { EXPLORER, formatCost, formatFestivalDate, shortAddr } from '../lib/format';

export default function EventCard({ nft, hasLoaded }) {
  const pct = nft.maxSupply > 0 ? Math.min(Math.round((nft.totalMinted / nft.maxSupply) * 100), 100) : 0;
  const date = formatFestivalDate(nft.festivalDate);

  return (
    <section className="card p-6 space-y-6" aria-label="Detalle del festival">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-lg bg-surface-2 border border-line flex items-center justify-center shrink-0">
          <Ticket className="w-6 h-6" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-xl font-semibold leading-tight">UNQ-FEST VIP</h2>
          <p className="text-sm text-muted mt-0.5">Pase oficial ERC-721 · Sepolia</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-muted">Fecha del festival</dt>
          <dd className="font-medium mt-0.5">{hasLoaded ? date || 'A confirmar' : '…'}</dd>
        </div>
        <div>
          <dt className="text-muted">Acceso</dt>
          <dd className="font-medium mt-0.5">Acceso total</dd>
        </div>
        <div>
          <dt className="text-muted">Costo por ticket</dt>
          <dd className="font-medium mt-0.5 tabular-nums">{formatCost(nft.priceWei, 1)}</dd>
        </div>
        <div>
          <dt className="text-muted">Tus tickets</dt>
          <dd className="font-medium mt-0.5 tabular-nums">{nft.balance}</dd>
        </div>
      </dl>

      <div>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-muted">Entradas vendidas</span>
          <span className="font-medium tabular-nums">
            {nft.totalMinted} / {nft.maxSupply} ({pct}%)
          </span>
        </div>
        <div
          className="w-full h-2 bg-surface-2 rounded-full overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Entradas vendidas"
        >
          <div
            className="h-full bg-accent rounded-full transition-all duration-500"
            style={{ width: `${Math.max(pct, 1)}%` }}
          />
        </div>
      </div>

      <div className="pt-4 border-t border-line flex items-center justify-between gap-2 text-sm text-muted">
        <span className="truncate">
          Contrato <span className="font-mono">{shortAddr(CONTRACT_ADDRESSES.nft)}</span>
        </span>
        <a
          href={`${EXPLORER}/address/${CONTRACT_ADDRESSES.nft}`}
          target="_blank"
          rel="noreferrer"
          className="text-accent inline-flex items-center gap-1 font-medium hover:underline shrink-0"
        >
          Ver <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
