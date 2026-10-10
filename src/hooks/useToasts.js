import { useState, useCallback, useRef } from 'react';

// type: 'success' | 'error' | 'info'
export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (type, message, { txHash = '' } = {}) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, type, message, txHash }]);
      const ttl = type === 'error' ? 12000 : 7000;
      setTimeout(() => dismiss(id), ttl);
    },
    [dismiss]
  );

  return { toasts, notify, dismiss };
}
