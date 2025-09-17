import { useEffect, useState } from 'react';
import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // ms, 0 means no auto-dismiss
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastState {
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;
  clearAllToasts: () => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newToast: ToastItem = {
      ...toast,
      id,
      duration: toast.duration ?? 5000, // Default 5 seconds
    };

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));

    // Auto-dismiss if duration is set and > 0
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        get().removeToast(id);
      }, newToast.duration);
    }
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },

  clearAllToasts: () => {
    set({ toasts: [] });
  },
}));

// Hook for easy toast usage
export const useToast = () => {
  const { addToast, removeToast, clearAllToasts } = useToastStore();

  return {
    toast: {
      success: (
        title: string,
        message?: string,
        options?: Partial<Pick<ToastItem, 'duration' | 'action'>>
      ) =>
        addToast({
          type: 'success',
          title,
          ...(message && { message }),
          ...options,
        }),

      error: (
        title: string,
        message?: string,
        options?: Partial<Pick<ToastItem, 'duration' | 'action'>>
      ) =>
        addToast({
          type: 'error',
          title,
          ...(message && { message }),
          duration: 0,
          ...options,
        }), // Errors don't auto-dismiss

      warning: (
        title: string,
        message?: string,
        options?: Partial<Pick<ToastItem, 'duration' | 'action'>>
      ) =>
        addToast({
          type: 'warning',
          title,
          ...(message && { message }),
          ...options,
        }),

      info: (
        title: string,
        message?: string,
        options?: Partial<Pick<ToastItem, 'duration' | 'action'>>
      ) =>
        addToast({
          type: 'info',
          title,
          ...(message && { message }),
          ...options,
        }),
    },

    removeToast,
    clearAllToasts,
  };
};

// Toast component styles
const getToastStyles = (type: ToastType) => {
  const baseStyles = 'flex items-start p-4 rounded-lg shadow-lg border-l-4 bg-white';

  switch (type) {
    case 'success':
      return `${baseStyles} border-green-500`;
    case 'error':
      return `${baseStyles} border-red-500`;
    case 'warning':
      return `${baseStyles} border-yellow-500`;
    case 'info':
      return `${baseStyles} border-blue-500`;
    default:
      return `${baseStyles} border-gray-500`;
  }
};

const getIconForType = (type: ToastType) => {
  const iconClass = 'w-5 h-5 flex-shrink-0 mt-0.5';

  switch (type) {
    case 'success':
      return (
        <svg
          className={`${iconClass} text-green-500`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <title>成功</title>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case 'error':
      return (
        <svg
          className={`${iconClass} text-red-500`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <title>エラー</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      );
    case 'warning':
      return (
        <svg
          className={`${iconClass} text-yellow-500`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <title>警告</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      );
    case 'info':
      return (
        <svg
          className={`${iconClass} text-blue-500`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <title>情報</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    default:
      return null;
  }
};

interface ToastProps {
  toast: ToastItem;
  onClose: (id: string) => void;
}

export const Toast = ({ toast, onClose }: ToastProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    // Animate in
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsRemoving(true);
    setTimeout(() => onClose(toast.id), 300); // Wait for animation
  };

  return (
    <div
      className={`transform transition-all duration-300 ease-in-out mb-3 ${
        isVisible && !isRemoving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div className={getToastStyles(toast.type)}>
        {getIconForType(toast.type)}

        <div className="ml-3 flex-1">
          <h4 className="text-sm font-medium text-gray-900">{toast.title}</h4>
          {toast.message && <p className="text-sm text-gray-600 mt-1">{toast.message}</p>}

          {toast.action && (
            <button
              type="button"
              onClick={toast.action.onClick}
              className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-500 focus:outline-none focus:underline"
            >
              {toast.action.label}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="ml-3 text-gray-400 hover:text-gray-600 focus:outline-none"
          aria-label="通知を閉じる"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <title>閉じる</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export const ToastContainer = () => {
  const { toasts } = useToastStore();
  const { removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-50 max-w-sm w-full space-y-3"
      role="region"
      aria-label="通知"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={removeToast} />
      ))}
    </div>
  );
};
