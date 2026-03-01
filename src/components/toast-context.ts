import { createContext } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastContextValue {
  showToast: (message: string, type?: ToastType, durationMs?: number) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
