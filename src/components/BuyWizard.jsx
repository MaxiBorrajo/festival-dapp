import React from 'react';
import { ShieldCheck, AlertCircle, RefreshCw, CheckCircle2, ArrowUpRight } from 'lucide-react';
import Stepper from './Stepper';
import { EXPLORER, formatCost } from '../lib/format';

const PAYING = ['paying', 'confirmingPayment'];
const MINTING = ['minting', 'confirmingMint'];

function computeSteps({ account, flow }) {
  const { phase, paid } = flow;

  const connect = account ? 'done' : 'current';

  let pay = 'todo';
  if (account) {
    if (PAYING.includes(phase)) pay = 'active';
    else if (paid || MINTING.includes(phase) || phase === 'success') pay = 'done';
    else if (phase === 'error') pay = 'error';
    else pay = 'current';
  }

  let mint = 'todo';
  if (MINTING.includes(phase)) mint = 'active';
  else if (phase === 'success') mint = 'done';
  else if (phase === 'awaitingMint') mint = flow.error ? 'error' : 'current';

  return [
    { label: 'Conectar', status: connect },
    { label: 'Pagar tokens', status: pay },
    { label: 'Mintear ticket', status: mint }
  ];
}

export default function BuyWizard({
  account,
  isWrongNetwork,
  onConnect,
  token,
  nft,
  randomPrice,
  quantity,
  setQuantity,
  rerollPrice,
  flow,
  isBusy,
  buy,
  resetFlow,
  onGoTickets
}) {
  const steps = computeSteps({ account, flow });
  const hasToken = parseFloat(token.balance) > 0;
  const awaitingMint = flow.phase === 'awaitingMint';
  const quantities = Array.from({ length: nft.maxPerTx }, (_, i) => i + 1);

  const renderBody = () => {
    if (!account) {
      return (
        <div className="p-6 bg-surface-2 rounded-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-surface border border-line flex items-center justify-center text-muted mx-auto">
            <ShieldCheck className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Conecta tu billetera</h3>
            <p className="text-sm text-muted max-w-sm mx-auto mt-1">
              Necesitamos tu cuenta en Sepolia para comprobar tu saldo de {token.symbol} y habilitar la compra.
            </p>
          </div>
          <button onClick={onConnect} className="btn-primary">
            Conectar billetera
          </button>
        </div>
      );
    }

    if (isWrongNetwork) {
      return (
        <div role="note" className="p-5 bg-warn-soft border border-warn/40 rounded-xl text-sm">
          Cambia a la red Sepolia para continuar con la compra.
        </div>
      );
    }

    if (flow.phase === 'success') {
      return (
        <div className="p-6 bg-ok-soft border border-ok/40 rounded-xl text-center space-y-4">
          <CheckCircle2 className="w-9 h-9 text-ok mx-auto" aria-hidden="true" />
          <p className="text-base font-semibold">{flow.message}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button onClick={onGoTickets} className="btn-primary">
              Ver mis tickets
            </button>
            <button onClick={resetFlow} className="btn-ghost">
              Comprar otra
            </button>
            {flow.txHash && (
              <a href={`${EXPLORER}/tx/${flow.txHash}`} target="_blank" rel="noreferrer" className="btn-ghost">
                Etherscan <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      );
    }

    if (!hasToken && !flow.paid && !isBusy) {
      return (
        <div role="note" className="p-5 bg-danger-soft border border-danger/40 rounded-xl space-y-1.5">
          <div className="flex items-center gap-2 text-danger font-semibold">
            <AlertCircle className="w-5 h-5" aria-hidden="true" />
            Acceso bloqueado
          </div>
          <p className="text-sm leading-relaxed">
            Tu billetera no tiene saldo de <strong>{token.symbol}</strong>. Para desbloquear la compra
            necesitas al menos una fracción de token.
          </p>
        </div>
      );
    }

    const locked = isBusy || awaitingMint;
    const buttonLabel = awaitingMint
      ? 'Reintentar minteo'
      : `Pagar y mintear ${quantity} ${quantity === 1 ? 'entrada' : 'entradas'}`;

    return (
      <div className="space-y-5">
        {/* Precio de la ronda */}
        <div className="p-5 bg-surface-2 rounded-xl">
          <div className="flex justify-between items-center mb-2 gap-2">
            <span className="text-sm font-medium text-muted">
              {awaitingMint ? 'Pago realizado' : 'Precio de esta ronda'}
            </span>
            {!awaitingMint && (
              <button
                onClick={rerollPrice}
                disabled={locked}
                className="text-sm text-accent inline-flex items-center gap-1 font-medium hover:underline disabled:opacity-50 disabled:no-underline"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Nueva tirada
              </button>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold tabular-nums">
              {awaitingMint ? flow.paid?.amount.split(' ')[0] : randomPrice}
            </span>
            <span className="text-lg font-medium text-muted">{token.symbol}</span>
          </div>
          <p className="text-sm text-muted mt-2 leading-relaxed">
            {awaitingMint
              ? 'Tu pago ya fue confirmado en la blockchain. Solo falta el minteo.'
              : 'El precio se sortea entre 1 y tu saldo (máx. 1000). Se transfiere a la wallet creadora y luego pagas el costo de minteo en ETH.'}
          </p>
        </div>

        {/* Cantidad */}
        <div role="radiogroup" aria-labelledby="qty-label">
          <div className="flex justify-between items-center mb-2">
            <span id="qty-label" className="text-sm font-medium">
              Cantidad de entradas
            </span>
            <span className="text-sm text-muted">Máx. {nft.maxPerTx} por transacción</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {quantities.map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={quantity === n}
                disabled={isBusy}
                onClick={() => setQuantity(n)}
                className={`py-2.5 rounded-lg font-semibold text-base tabular-nums border transition disabled:opacity-60 disabled:cursor-not-allowed ${
                  quantity === n
                    ? 'bg-accent text-accent-fg border-accent'
                    : 'bg-surface border-line hover:bg-surface-2'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Resumen */}
        <dl className="text-sm space-y-2 pt-1">
          <div className="flex justify-between">
            <dt className="text-muted">1. Pago en {token.symbol}</dt>
            <dd className="font-medium tabular-nums">
              {awaitingMint ? flow.paid?.amount : `${randomPrice} ${token.symbol}`}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">2. Minteo ({quantity}×)</dt>
            <dd className="font-medium tabular-nums">{formatCost(nft.priceWei, quantity)}</dd>
          </div>
          <div className="border-t border-line pt-2 text-muted">
            Además del costo, pagarás el gas de cada transacción en SepoliaETH.
          </div>
        </dl>

        <button onClick={buy} disabled={isBusy} className="btn-primary w-full py-3.5 text-base">
          {isBusy ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" />
              Procesando…
            </>
          ) : (
            buttonLabel
          )}
        </button>
      </div>
    );
  };

  return (
    <section className="card p-6 md:p-8 space-y-6" aria-label="Compra de entradas">
      <div>
        <h2 className="text-2xl font-semibold">Comprar Festival Ticket</h2>
        <p className="text-sm text-muted mt-1">
          Paga en <strong className="text-fg">{token.symbol}</strong> y mintea tu entrada en SepoliaETH.
        </p>
      </div>

      <Stepper steps={steps} />

      {/* Progreso de la transacción, anunciado a lectores de pantalla */}
      <div role="status" aria-live="polite">
        {isBusy && flow.message && (
          <div className="p-4 rounded-xl text-sm border bg-surface-2 border-line flex items-start gap-2.5">
            <RefreshCw className="w-4 h-4 animate-spin shrink-0 mt-0.5 text-accent" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium">{flow.message}</p>
              {flow.txHash && (
                <a
                  href={`${EXPLORER}/tx/${flow.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-accent underline"
                >
                  Ver en Etherscan <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {(flow.phase === 'error' || (awaitingMint && flow.error)) && (
        <div role="alert" className="p-4 rounded-xl text-sm border bg-danger-soft border-danger/40 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-medium">{flow.error}</p>
            {awaitingMint && <p className="mt-1 text-muted">{flow.message}</p>}
          </div>
        </div>
      )}

      {awaitingMint && !flow.error && (
        <div role="note" className="p-4 rounded-xl text-sm border bg-warn-soft border-warn/40">
          {flow.message}
        </div>
      )}

      {renderBody()}
    </section>
  );
}
