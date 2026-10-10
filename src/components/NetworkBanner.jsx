import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function NetworkBanner({ onSwitch }) {
  return (
    <div role="alert" className="max-w-6xl mx-auto w-full px-4 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-warn-soft border border-warn/40">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-warn" aria-hidden="true" />
          <p className="text-sm">
            <strong>Estás en la red equivocada.</strong> Esta dApp funciona solo en Sepolia; las compras
            están deshabilitadas hasta que cambies de red.
          </p>
        </div>
        <button onClick={onSwitch} className="btn-primary shrink-0">
          Cambiar a Sepolia
        </button>
      </div>
    </div>
  );
}
