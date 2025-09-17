import { useIsConnecting, useWebSocketError, useWebSocketStatus } from '@/store/websocketStore';
import { useWebSocketStore } from '@/store/websocketStore';

interface ConnectionStatusProps {
  className?: string;
  showDetails?: boolean;
  variant?: 'compact' | 'detailed';
}

export const ConnectionStatus = ({
  className = '',
  showDetails = false,
  variant = 'compact',
}: ConnectionStatusProps) => {
  const status = useWebSocketStatus();
  const isConnecting = useIsConnecting();
  const error = useWebSocketError();
  const { reconnectAttempts, maxReconnectAttempts } = useWebSocketStore();

  // ステータスに応じた表示内容
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          icon: '●',
          color: 'text-green-500',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          text: 'オンライン',
          description: 'サーバーに接続されています',
        };
      case 'connecting':
        return {
          icon: '◐',
          color: 'text-blue-500',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          text: '接続中',
          description: 'サーバーに接続しています...',
        };
      case 'reconnecting':
        return {
          icon: '◐',
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          text: '再接続中',
          description: `再接続を試行中... (${reconnectAttempts}/${maxReconnectAttempts})`,
        };
      case 'error':
        return {
          icon: '●',
          color: 'text-red-500',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          text: 'エラー',
          description: error || '接続エラーが発生しました',
        };
      default:
        return {
          icon: '●',
          color: 'text-gray-400',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          text: 'オフライン',
          description: 'サーバーから切断されています',
        };
    }
  };

  const config = getStatusConfig();

  if (variant === 'compact') {
    return (
      <div className={`inline-flex items-center space-x-2 ${className}`}>
        <span className={`${config.color} animate-pulse`} aria-label={`接続状態: ${config.text}`}>
          {config.icon}
        </span>
        <span className="text-sm text-gray-600">{config.text}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${config.bgColor} ${config.borderColor} ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span
            className={`${config.color} ${isConnecting ? 'animate-spin' : 'animate-pulse'}`}
            aria-label={`接続状態: ${config.text}`}
          >
            {config.icon}
          </span>
          <span className="font-medium text-sm text-gray-900">{config.text}</span>
        </div>

        {/* 詳細情報ボタン */}
        {showDetails && (
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-700"
            onClick={() => {
              // 詳細情報の表示/非表示を切り替える処理
              // 実装は親コンポーネントで管理する
            }}
          >
            詳細
          </button>
        )}
      </div>

      {/* 説明文 */}
      <p className="text-xs text-gray-600 mt-1">{config.description}</p>

      {/* エラーの詳細表示 */}
      {status === 'error' && error && (
        <div className="mt-2 p-2 bg-red-100 border border-red-200 rounded text-xs text-red-800">
          {error}
        </div>
      )}

      {/* 再接続の進行状況 */}
      {status === 'reconnecting' && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>再接続試行中</span>
            <span>
              {reconnectAttempts}/{maxReconnectAttempts}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1">
            <div
              className="bg-yellow-500 h-1 rounded-full transition-all duration-300"
              style={{
                width: `${(reconnectAttempts / maxReconnectAttempts) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* 接続中のローディング表示 */}
      {isConnecting && status !== 'reconnecting' && (
        <div className="mt-2 flex items-center space-x-2 text-xs text-gray-600">
          <div className="w-3 h-3 border border-blue-300 border-t-blue-600 rounded-full animate-spin" />
          <span>接続を確立しています...</span>
        </div>
      )}
    </div>
  );
};
