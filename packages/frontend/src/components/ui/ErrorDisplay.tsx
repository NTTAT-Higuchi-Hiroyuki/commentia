import type { ReactNode } from 'react';
import { Button } from './Button';

export type ErrorType =
  | 'network'
  | 'validation'
  | 'server'
  | 'authentication'
  | 'not-found'
  | 'rate-limit'
  | 'generic';

export interface ErrorDisplayProps {
  type?: ErrorType;
  title?: string;
  message?: string;
  details?: string;
  showRetry?: boolean;
  showGoHome?: boolean;
  onRetry?: () => void;
  onGoHome?: () => void;
  children?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const getErrorConfig = (type: ErrorType) => {
  switch (type) {
    case 'network':
      return {
        icon: '🌐',
        title: 'ネットワークエラー',
        message: 'インターネット接続を確認してから再度お試しください。',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        iconColor: 'text-blue-500',
      };
    case 'validation':
      return {
        icon: '⚠️',
        title: '入力エラー',
        message: '入力内容をご確認ください。',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        iconColor: 'text-yellow-500',
      };
    case 'server':
      return {
        icon: '🔧',
        title: 'サーバーエラー',
        message: 'サーバーで問題が発生しています。しばらく時間をおいてから再度お試しください。',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        iconColor: 'text-red-500',
      };
    case 'authentication':
      return {
        icon: '🔐',
        title: '認証エラー',
        message: 'ログインが必要です。再度ログインしてください。',
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200',
        iconColor: 'text-purple-500',
      };
    case 'not-found':
      return {
        icon: '🔍',
        title: 'ページが見つかりません',
        message: 'お探しのページまたはリソースが見つかりませんでした。',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        iconColor: 'text-gray-500',
      };
    case 'rate-limit':
      return {
        icon: '⏱️',
        title: 'アクセス制限',
        message: 'アクセス回数の上限に達しました。しばらく時間をおいてから再度お試しください。',
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-200',
        iconColor: 'text-orange-500',
      };
    default:
      return {
        icon: '❌',
        title: 'エラーが発生しました',
        message: '予期しないエラーが発生しました。',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        iconColor: 'text-red-500',
      };
  }
};

const getSizeStyles = (size: 'sm' | 'md' | 'lg') => {
  switch (size) {
    case 'sm':
      return {
        container: 'p-3 text-sm',
        icon: 'text-lg mb-2',
        title: 'text-sm font-medium',
        message: 'text-xs',
        button: 'text-xs px-2 py-1',
      };
    case 'lg':
      return {
        container: 'p-8 text-base',
        icon: 'text-4xl mb-4',
        title: 'text-xl font-bold',
        message: 'text-base',
        button: 'text-base px-4 py-2',
      };
    default: // md
      return {
        container: 'p-6 text-sm',
        icon: 'text-2xl mb-3',
        title: 'text-lg font-semibold',
        message: 'text-sm',
        button: 'text-sm px-3 py-1.5',
      };
  }
};

export const ErrorDisplay = ({
  type = 'generic',
  title,
  message,
  details,
  showRetry = false,
  showGoHome = false,
  onRetry,
  onGoHome,
  children,
  className = '',
  size = 'md',
}: ErrorDisplayProps) => {
  const config = getErrorConfig(type);
  const sizeStyles = getSizeStyles(size);

  const displayTitle = title || config.title;
  const displayMessage = message || config.message;

  return (
    <div
      className={`rounded-lg border ${config.bgColor} ${config.borderColor} ${sizeStyles.container} ${className}`}
      role="alert"
      aria-live="polite"
    >
      <div className="text-center">
        <div className={`${sizeStyles.icon}`}>{config.icon}</div>

        <h3 className={`${config.iconColor} ${sizeStyles.title} mb-2`}>{displayTitle}</h3>

        <p className={`text-gray-600 ${sizeStyles.message} mb-4`}>{displayMessage}</p>

        {details && (
          <details className="text-left mb-4">
            <summary className={`cursor-pointer font-medium text-gray-700 ${sizeStyles.message}`}>
              詳細情報
            </summary>
            <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono overflow-auto max-h-32">
              {details}
            </div>
          </details>
        )}

        {children && <div className="mb-4">{children}</div>}

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {showRetry && onRetry && (
            <Button onClick={onRetry} variant="primary" size="sm" className={sizeStyles.button}>
              再試行
            </Button>
          )}

          {showGoHome && onGoHome && (
            <Button onClick={onGoHome} variant="secondary" size="sm" className={sizeStyles.button}>
              ホームに戻る
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

// Inline error for form fields
export const InlineError = ({
  message,
  className = '',
}: {
  message: string;
  className?: string;
}) => {
  return (
    <div className={`flex items-center text-red-600 text-sm mt-1 ${className}`}>
      <svg
        className="w-4 h-4 mr-1 flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <title>エラー</title>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>{message}</span>
    </div>
  );
};

// Success message component
export const SuccessDisplay = ({
  title,
  message,
  children,
  className = '',
  size = 'md',
}: {
  title?: string;
  message?: string;
  children?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) => {
  const sizeStyles = getSizeStyles(size);

  return (
    <output
      className={`rounded-lg border bg-green-50 border-green-200 ${sizeStyles.container} ${className}`}
      aria-live="polite"
    >
      <div className="text-center">
        <div className={`text-green-500 ${sizeStyles.icon}`}>✅</div>

        {title && <h3 className={`text-green-700 ${sizeStyles.title} mb-2`}>{title}</h3>}

        {message && <p className={`text-green-600 ${sizeStyles.message} mb-4`}>{message}</p>}

        {children}
      </div>
    </output>
  );
};

// Warning message component
export const WarningDisplay = ({
  title,
  message,
  children,
  className = '',
  size = 'md',
}: {
  title?: string;
  message?: string;
  children?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) => {
  const sizeStyles = getSizeStyles(size);

  return (
    <div
      className={`rounded-lg border bg-yellow-50 border-yellow-200 ${sizeStyles.container} ${className}`}
      role="alert"
      aria-live="polite"
    >
      <div className="text-center">
        <div className={`text-yellow-500 ${sizeStyles.icon}`}>⚠️</div>

        {title && <h3 className={`text-yellow-700 ${sizeStyles.title} mb-2`}>{title}</h3>}

        {message && <p className={`text-yellow-600 ${sizeStyles.message} mb-4`}>{message}</p>}

        {children}
      </div>
    </div>
  );
};
