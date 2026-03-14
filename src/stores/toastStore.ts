import { create } from 'zustand';

type ToastType = 'error' | 'success' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  showToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;
}

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 3000;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  showToast: (type, message) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const toast: Toast = { id, type, message };

    set((state) => {
      const updated = [...state.toasts, toast];
      // Keep only the most recent MAX_TOASTS
      if (updated.length > MAX_TOASTS) {
        return { toasts: updated.slice(updated.length - MAX_TOASTS) };
      }
      return { toasts: updated };
    });

    // Auto-dismiss after timeout
    setTimeout(() => {
      get().removeToast(id);
    }, AUTO_DISMISS_MS);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
