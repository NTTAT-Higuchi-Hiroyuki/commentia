import { useRealtimeComments } from '@/hooks/useRealtimeComments';
import { useUserStore } from '@/store/userStore';
import { CommentForm } from './CommentForm';
import { CommentList } from './CommentList';

interface CommentSectionProps {
  roomId: string;
  className?: string;
}

export const CommentSection = ({ roomId, className = '' }: CommentSectionProps) => {
  const { currentUser } = useUserStore();

  // リアルタイム更新機能を有効化
  const { connectionStatus } = useRealtimeComments({
    roomId,
    enableNotifications: true,
  });

  if (!currentUser) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <svg
            className="w-12 h-12 text-yellow-400 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-label="警告"
            role="img"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <h3 className="text-lg font-medium text-yellow-900 mb-2">ルームに参加していません</h3>
          <p className="text-yellow-700">コメントを投稿するには、まずルームに参加してください。</p>
        </div>
        <CommentList roomId={roomId} />
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 接続ステータス表示 */}
      {connectionStatus !== 'connected' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
          <div className="flex items-center">
            <svg
              className="w-4 h-4 text-yellow-400 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-label="接続状態"
              role="img"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <p className="text-sm text-yellow-800">
              {connectionStatus === 'connecting' && 'リアルタイム機能に接続中...'}
              {connectionStatus === 'reconnecting' && 'リアルタイム機能に再接続中...'}
              {connectionStatus === 'disconnected' && 'リアルタイム機能が切断されています'}
              {connectionStatus === 'error' && 'リアルタイム機能でエラーが発生しました'}
            </p>
          </div>
        </div>
      )}

      {/* コメント投稿フォーム */}
      <CommentForm roomId={roomId} />

      {/* コメント一覧 */}
      <CommentList roomId={roomId} />
    </div>
  );
};
