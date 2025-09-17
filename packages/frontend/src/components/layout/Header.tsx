import { useCurrentUser } from '@/store/userStore';
import { useWebSocketStatus } from '@/store/websocketStore';
import { Button } from '../ui/Button';

interface HeaderProps {
  onMenuClick?: () => void;
  showUserInfo?: boolean;
}

export const Header = ({ onMenuClick, showUserInfo = true }: HeaderProps) => {
  const currentUser = useCurrentUser();
  const wsStatus = useWebSocketStatus();

  const getStatusColor = () => {
    switch (wsStatus) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
      case 'reconnecting':
        return 'bg-yellow-500';
      case 'disconnected':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = () => {
    switch (wsStatus) {
      case 'connected':
        return '接続中';
      case 'connecting':
        return '接続中...';
      case 'reconnecting':
        return '再接続中...';
      case 'disconnected':
        return '切断';
      default:
        return '不明';
    }
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 relative z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left section */}
          <div className="flex items-center space-x-4">
            {onMenuClick && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onMenuClick}
                className="md:hidden"
                aria-label="メニューを開く"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <title>メニュー</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              </Button>
            )}

            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-blue-600">Commentia</h1>
              <span className="text-sm text-gray-500 hidden sm:block">
                リアルタイムコメント投稿システム
              </span>
            </div>
          </div>

          {/* Right section */}
          <nav className="flex items-center space-x-4">
            {/* WebSocket status indicator */}
            <div className="flex items-center space-x-2">
              <div
                className={`w-2 h-2 rounded-full ${getStatusColor()}`}
                title={`WebSocket status: ${getStatusText()}`}
              />
              <span className="text-xs text-gray-500 hidden sm:block">{getStatusText()}</span>
            </div>

            {/* User info */}
            {showUserInfo && currentUser && (
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <title>ユーザー</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <span className="hidden sm:block">{currentUser.userName}</span>
              </div>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
};

export type { HeaderProps };
