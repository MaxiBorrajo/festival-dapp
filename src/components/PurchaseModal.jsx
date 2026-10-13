import React, { useEffect, useRef, useState } from 'react';
import { X, ArrowUpRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import Stepper from './Stepper';
import { EXPLORER, formatAmount, formatEth, shortHash } from '../lib/format';

const PAY_PHASES = ['paying', 'confirmingPayment'];
const MINT_PHASES = ['minting', 'confirmingMint'];

const ExtLink = ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent underline">
    {children} <ArrowUpRight className="w-4 h-4 shrink-0" aria-hidden="true" />
  </a>
);

// Un paso a la vez: Revisar → Pagar → Mintear → Listo
export default function PurchaseModal({
  open,
  onClose,
  flow,
  isBusy,
  buy,
  resetFlow,
  onGoTickets,
  review,
  estimateFees
}) {
  const [fees, setFees] = useState(null);
  const [loadingFees, setLoadingFees] = useState(false);
  const closeRef = useRef(null);

  const idle = flow.phase === 'idle' && !flow.paid;

  useEffect(() => {
    if (!open || !idle) return undefined;
    let cancelled = false;
    setLoadingFees(true);
    estimateFees().then((f) => {
      if (!cancelled) {
        setFees(f);
        setLoadingFees(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, idle, estimateFees]);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && !isBusy && handleClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isBusy]);

  if (!open) return null;

  const d = flow.details || {};
  const snap = d.snapshot || review;
  const sym = snap.tokenSymbol;
  const amountText = `${formatAmount(snap.payAmount)} ${sym}`;
  const mintCostText = snap.mintCostWei != null ? formatEth(snap.mintCostWei) : review.mintCostText;
  const entradas = `${snap.qty} ${snap.qty === 1 ? 'entrada' : 'entradas'}`;
  const payHash = d.payHash || flow.paid?.hash;

  const success = flow.phase === 'success';
  const mintStep = MINT_PHASES.includes(flow.phase) || flow.phase === 'awaitingMint';
  const payStep = PAY_PHASES.includes(flow.phase) || flow.phase === 'error';
  // Paso visible: review | pay | mint | done
  const view = success ? 'done' : mintStep ? 'mint' : payStep ? 'pay' : 'review';

  const steps = [
    { label: 'Revisar', status: view === 'review' ? 'current' : 'done' },
    {
      label: 'Pagar',
      status:
        view === 'review' ? 'todo' : view === 'pay' ? (flow.phase === 'error' ? 'error' : 'active') : 'done'
    },
    {
      label: 'Mintear',
      status:
        view === 'mint'
          ? flow.phase === 'awaitingMint' && flow.error
            ? 'error'
            : flow.phase === 'awaitingMint'
              ? 'current'
              : 'active'
          : view === 'done'
            ? 'done'
            : 'todo'
    },
    { label: 'Listo', status: view === 'done' ? 'done' : 'todo' }
  ];

  const handleClose = () => {
    if (isBusy) return;
    if (success || flow.phase === 'error') resetFlow();
    onClose();
  };

  const waiting = (signing, confirming, phase) => (
    <div className="text-center space-y-3 py-4">
      <Loader2 className="w-10 h-10 text-accent animate-spin mx-auto" aria-hidden="true" />
      <p className="text-base font-semibold">
        {flow.phase === phase ? signing : confirming}
      </p>
      <p className="text-sm text-muted">No cierres esta ventana.</p>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="purchase-title"
        className="card w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-5 md:p-6 space-y-5 rounded-b-none sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="purchase-title" className="text-lg font-semibold">
            Comprar {snap.nftName}
          </h2>
          <button
            ref={closeRef}
            onClick={handleClose}
            disabled={isBusy}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg hover:bg-surface-2 disabled:opacity-40"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <Stepper steps={steps} />

        {/* ---- Paso 1: revisar ---- */}
        {view === 'review' && (
          <div className="space-y-4">
            <div className="p-4 bg-surface-2 rounded-xl text-center space-y-1">
              <p className="text-sm text-muted">Vas a pagar</p>
              <p className="text-3xl font-semibold tabular-nums">{amountText}</p>
              {!snap.isBase && (
                <p className="text-sm text-muted tabular-nums">
                  {formatAmount(snap.basePrice)} MPC × {formatAmount(snap.factor, 2)} (factor sorteado)
                </p>
              )}
            </div>
            <ul className="text-sm space-y-1.5">
              <li className="flex justify-between gap-3">
                <span className="text-muted">Recibís</span>
                <span className="font-medium">{entradas}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted">Costo de minteo</span>
                <span className="font-medium tabular-nums">{mintCostText}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-muted">Fee de red (aprox.)</span>
                <span className="font-medium tabular-nums">
                  {loadingFees
                    ? 'calculando…'
                    : fees?.payFeeWei != null && fees?.mintFeeWei != null
                      ? formatEth(fees.payFeeWei + fees.mintFeeWei)
                      : 'no disponible'}
                </span>
              </li>
            </ul>
            <p className="text-xs text-muted">
              Firmarás 2 transacciones en tu billetera: primero el pago y después el minteo.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={handleClose} className="btn-ghost">
                Cancelar
              </button>
              <button onClick={buy} className="btn-primary">
                Confirmar y firmar
              </button>
            </div>
          </div>
        )}

        {/* ---- Paso 2: pagar ---- */}
        {view === 'pay' && (
          <div className="space-y-4">
            {flow.phase === 'error' ? (
              <div role="alert" className="text-center space-y-3 py-2">
                <AlertCircle className="w-10 h-10 text-danger mx-auto" aria-hidden="true" />
                <p className="font-semibold">No se pudo completar el pago</p>
                <p className="text-sm text-muted">{flow.error}</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={handleClose} className="btn-ghost">
                    Cerrar
                  </button>
                  <button onClick={buy} className="btn-primary">
                    Reintentar
                  </button>
                </div>
              </div>
            ) : (
              <>
                {waiting(
                  `Firmá en tu billetera el pago de ${amountText}`,
                  'Confirmando el pago en la red…',
                  'paying'
                )}
                {payHash && (
                  <p className="text-sm text-center">
                    <ExtLink href={`${EXPLORER}/tx/${payHash}`}>Ver pago {shortHash(payHash)}</ExtLink>
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ---- Paso 3: mintear ---- */}
        {view === 'mint' && (
          <div className="space-y-4">
            <p className="text-sm text-center text-ok flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              Pago confirmado: {amountText}
              {payHash && (
                <>
                  {' · '}
                  <ExtLink href={`${EXPLORER}/tx/${payHash}`}>tx</ExtLink>
                </>
              )}
            </p>
            {flow.phase === 'awaitingMint' ? (
              <div className="text-center space-y-3">
                {flow.error && (
                  <div role="alert" className="p-3 rounded-xl text-sm border bg-danger-soft border-danger/40">
                    {flow.error}
                  </div>
                )}
                <p className="text-sm text-muted">
                  Solo falta mintear {entradas} ({mintCostText}).
                </p>
                <div className="flex gap-3 justify-center">
                  <button onClick={handleClose} className="btn-ghost">
                    Cerrar
                  </button>
                  <button onClick={buy} className="btn-primary">
                    {flow.error ? 'Reintentar minteo' : 'Mintear'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {waiting(
                  `Firmá en tu billetera el minteo de ${entradas}`,
                  'Confirmando el minteo en la red…',
                  'minting'
                )}
                {d.mintHash && (
                  <p className="text-sm text-center">
                    <ExtLink href={`${EXPLORER}/tx/${d.mintHash}`}>Ver minteo {shortHash(d.mintHash)}</ExtLink>
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ---- Paso 4: listo ---- */}
        {view === 'done' && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <CheckCircle2 className="w-10 h-10 text-ok mx-auto" aria-hidden="true" />
              <p className="text-lg font-semibold">¡Compraste {entradas}!</p>
            </div>

            <dl className="text-sm rounded-xl border border-line divide-y divide-line">
              {[
                payHash && { label: 'Pago', value: amountText, href: `${EXPLORER}/tx/${payHash}` },
                d.mintHash && { label: 'Minteo', value: mintCostText, href: `${EXPLORER}/tx/${d.mintHash}` },
                ...(d.tokenIds || []).map((id) => ({
                  label: 'NFT',
                  value: `#${id}`,
                  href: `${EXPLORER}/nft/${snap.nftAddress}/${id}`
                }))
              ]
                .filter(Boolean)
                .map((row) => (
                  <div key={row.label + row.value} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <dt className="text-muted">{row.label}</dt>
                    <dd className="flex items-center gap-3">
                      <span className="font-medium tabular-nums">{row.value}</span>
                      <ExtLink href={row.href}>Etherscan</ExtLink>
                    </dd>
                  </div>
                ))}
            </dl>

            <div className="space-y-2">
              <button
                onClick={() => {
                  resetFlow();
                  onClose();
                  onGoTickets();
                }}
                className="btn-primary w-full py-3"
              >
                Ver mis tickets
              </button>
              <button
                onClick={() => {
                  resetFlow();
                  onClose();
                }}
                className="btn-ghost w-full"
              >
                Comprar otra
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
