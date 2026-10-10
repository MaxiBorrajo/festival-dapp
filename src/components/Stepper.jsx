import React from 'react';
import { Check, X, Loader2 } from 'lucide-react';

// status: 'todo' | 'current' | 'active' | 'done' | 'error'
const DOT = {
  todo: 'bg-surface border-line text-muted',
  current: 'bg-surface border-accent text-accent',
  active: 'bg-surface border-accent text-accent',
  done: 'bg-accent border-accent text-accent-fg',
  error: 'bg-danger-soft border-danger text-danger'
};

const LABEL = {
  todo: 'pendiente',
  current: 'siguiente',
  active: 'en curso',
  done: 'completado',
  error: 'con error'
};

export default function Stepper({ steps }) {
  return (
    <ol className="flex items-start gap-2" aria-label="Pasos de la compra">
      {steps.map((step, i) => (
        <li
          key={step.label}
          className="flex-1 flex flex-col items-center text-center gap-1.5 relative"
          aria-current={step.status === 'current' || step.status === 'active' ? 'step' : undefined}
        >
          {i > 0 && (
            <span
              aria-hidden="true"
              className={`absolute top-4 right-1/2 w-full h-px ${
                steps[i - 1].status === 'done' ? 'bg-accent' : 'bg-line'
              }`}
            />
          )}
          <span
            className={`relative z-10 w-8 h-8 rounded-full border flex items-center justify-center text-sm font-semibold ${DOT[step.status]}`}
          >
            {step.status === 'done' ? (
              <Check className="w-4 h-4" aria-hidden="true" />
            ) : step.status === 'error' ? (
              <X className="w-4 h-4" aria-hidden="true" />
            ) : step.status === 'active' ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              i + 1
            )}
          </span>
          <span
            className={`text-sm font-medium ${step.status === 'todo' ? 'text-muted' : 'text-fg'}`}
          >
            {step.label}
          </span>
          <span className="sr-only">{LABEL[step.status]}</span>
        </li>
      ))}
    </ol>
  );
}
