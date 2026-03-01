import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { ToastContext } from './toast-context';
import type { ToastType } from './toast-context';
import './ToastProvider.css';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  durationMs: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', durationMs = 3200) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, type, durationMs }]);
    window.setTimeout(() => removeToast(id), durationMs);
  }, [removeToast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item toast-${toast.type}`}>
            <span className="toast-icon" aria-hidden="true">
              {toast.type === 'success' ? <CheckCircle2 size={16} /> : toast.type === 'error' ? <AlertTriangle size={16} /> : <Info size={16} />}
            </span>
            <span className="toast-message">{toast.message}</span>
            <button type="button" className="toast-close" aria-label="Dismiss message" onClick={() => removeToast(toast.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
