import React from 'react';
import { RefreshCw, ArrowUpRight, Ticket } from 'lucide-react';
import { CONTRACT_ADDRESSES } from '../contracts';
import { EXPLORER, formatFestivalDate, shortAddr } from '../lib/format';

// Arte generativo: mismo ID => mismo diseño. Sin dependencias externas.
function TicketArt({ id, image, used }) {
  const [failed, setFailed] = React.useState(false);
  const hue = (270 + ((id * 47) % 60)) % 360; // zona violeta/magenta
  const hue2 = (hue + 40) % 360;
  const gid = `g-${id}`;

  return (
    <div className="ticket-art">
      {image && !failed ? (
        <img
          src={image}
          alt={`Entrada #${id}`}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <svg viewBox="0 0 320 180" className="w-full h-full" role="img" aria-label={`Arte de la entrada #${id}`}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={`hsl(${hue} 80% 55%)`} />
              <stop offset="1" stopColor={`hsl(${hue2} 75% 35%)`} />
            </linearGradient>
          </defs>
          <rect width="320" height="180" fill={`url(#${gid})`} />
          <circle cx={60 + ((id * 37) % 200)} cy="40" r="70" fill="rgba(255,255,255,0.08)" />
          <circle cx={240 - ((id * 29) % 160)} cy="150" r="90" fill="rgba(0,0,0,0.12)" />
          <text x="20" y="46" fill="rgba(255,255,255,0.85)" fontSize="14" fontWeight="600" letterSpacing="3">
            UNQ FESTIVAL
          </text>
          <text x="20" y="140" fill="#fff" fontSize="56" fontWeight="800">
            #{id}
          </text>
          <text x="300" y="160" textAnchor="end" fill="rgba(255,255,255,0.75)" fontSize="12">
            ACCESO TOTAL
          </text>
        </svg>
      )}
      {used && <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-white text-sm font-semibold tracking-wide">CANJEADO</div>}
    </div>
  );
}

function TicketCard({ ticket, festivalDate, account }) {
  const date = formatFestivalDate(festivalDate);
  return (
    <article className="card overflow-hidden">
      <TicketArt id={ticket.id} image={ticket.image} used={ticket.used} />
      <div className="p-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">UNQ-FEST · Acceso total</p>
          <h3 className="text-lg font-semibold mt-0.5">Pase #{ticket.id}</h3>
          <p className="text-sm text-muted mt-1">{date || 'Fecha a confirmar'}</p>
        </div>
        <span
          className={`shrink-0 text-sm font-medium px-2.5 py-0.5 rounded-full border ${
            ticket.used
              ? 'bg-surface-2 text-muted border-line'
              : 'bg-ok-soft text-ok border-ok/30'
          }`}
        >
          {ticket.used ? 'Canjeado' : 'Válido'}
        </span>
      </div>

      {/* Divisor tipo perforación */}
      <div className="border-t border-dashed border-line" />

      <dl className="p-5 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Propietario</dt>
          <dd className="font-mono">{shortAddr(account)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Estado</dt>
          <dd className="font-medium">{ticket.used ? 'Ya usado en puerta' : 'Sin canjear'}</dd>
        </div>
        <div className="pt-2">
          <a
            href={`${EXPLORER}/token/${CONTRACT_ADDRESSES.nft}?a=${ticket.id}`}
            target="_blank"
            rel="noreferrer"
            className="text-accent inline-flex items-center gap-1 font-medium hover:underline"
          >
            Ver en Etherscan <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
      </dl>
    </article>
  );
}

export default function TicketsTab({ account, tickets, balance, festivalDate, tokenSymbol, isLoading, onReload, onGoBuy }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold">Tus entradas</h2>
          <p className="text-sm text-muted mt-0.5">
            {balance} {balance === 1 ? 'entrada' : 'entradas'} en tu billetera
          </p>
        </div>
        <button onClick={onReload} disabled={isLoading || !account} className="btn-ghost">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Actualizar
        </button>
      </div>

      {!account ? (
        <div className="card p-10 text-center text-sm text-muted">
          Conecta tu billetera para ver tus entradas.
        </div>
      ) : balance === 0 ? (
        <div className="card p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center text-muted mx-auto">
            <Ticket className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Aún no tienes entradas</h3>
            <p className="text-sm text-muted max-w-sm mx-auto mt-1">
              Usa tus tokens {tokenSymbol} para desbloquear la compra y conseguir tu primer pase.
            </p>
          </div>
          <button onClick={onGoBuy} className="btn-primary">
            Ir a comprar
          </button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="card p-10 text-center text-sm text-muted">
          {isLoading
            ? 'Buscando tus entradas…'
            : `Tienes ${balance} entrada(s), pero no pudimos identificar sus IDs ahora. Pulsa "Actualizar" para reintentar.`}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} festivalDate={festivalDate} account={account} />
          ))}
        </div>
      )}
    </div>
  );
}
