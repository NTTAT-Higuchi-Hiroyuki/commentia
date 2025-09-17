import {
  useOnlineParticipants,
  useParticipantCount,
  useTotalParticipantCount,
} from '@/store/participantsStore';
import type { Participant } from '@/store/participantsStore';
import { useUserStore } from '@/store/userStore';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

interface ParticipantListProps {
  className?: string;
  showHeader?: boolean;
  maxHeight?: string;
}

interface ParticipantItemProps {
  participant: Participant;
  isCurrentUser: boolean;
}

const ParticipantItem = ({ participant, isCurrentUser }: ParticipantItemProps) => {
  const joinedTimeAgo = formatDistanceToNow(new Date(participant.joinedAt), {
    addSuffix: true,
    locale: ja,
  });

  return (
    <div className="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-50 transition-colors">
      {/* ユーザーアバター */}
      <div className="relative">
        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
          <span className="text-white text-sm font-medium">
            {participant.userName.charAt(0).toUpperCase()}
          </span>
        </div>
        {/* オンライン状態インジケーター */}
        {participant.isOnline && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
        )}
      </div>

      {/* ユーザー情報 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-2">
          <span className="font-medium text-gray-900 truncate">{participant.userName}</span>
          {isCurrentUser && (
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full flex-shrink-0">
              あなた
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500">{joinedTimeAgo}に参加</div>
      </div>

      {/* 接続状態 */}
      <div className="flex-shrink-0">
        {participant.isOnline ? (
          <span className="inline-flex items-center text-xs text-green-600">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse" />
            オンライン
          </span>
        ) : (
          <span className="text-xs text-gray-400">オフライン</span>
        )}
      </div>
    </div>
  );
};

export const ParticipantList = ({
  className = '',
  showHeader = true,
  maxHeight = 'max-h-96',
}: ParticipantListProps) => {
  const onlineParticipants = useOnlineParticipants();
  const participantCount = useParticipantCount();
  const totalCount = useTotalParticipantCount();
  const { currentUser } = useUserStore();

  // 現在のユーザーを最初に表示するためにソート
  const sortedParticipants = [...onlineParticipants].sort((a, b) => {
    if (a.userId === currentUser?.userId) return -1;
    if (b.userId === currentUser?.userId) return 1;
    return a.joinedAt - b.joinedAt;
  });

  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      {/* ヘッダー */}
      {showHeader && (
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">参加者一覧</h3>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center text-sm text-gray-600">
                <svg
                  className="w-4 h-4 mr-1 text-green-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-label="オンライン"
                  role="img"
                >
                  <circle cx="10" cy="10" r="8" />
                </svg>
                {participantCount}人オンライン
              </span>
              {totalCount !== participantCount && (
                <span className="text-sm text-gray-400">（全{totalCount}人）</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 参加者リスト */}
      <div className={`${maxHeight} overflow-y-auto`}>
        {sortedParticipants.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <svg
              className="w-12 h-12 mx-auto text-gray-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-label="参加者なし"
              role="img"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <p className="text-gray-500 text-sm">まだ参加者がいません</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {sortedParticipants.map((participant) => (
              <ParticipantItem
                key={participant.userId}
                participant={participant}
                isCurrentUser={participant.userId === currentUser?.userId}
              />
            ))}
          </div>
        )}
      </div>

      {/* フッター情報 */}
      {onlineParticipants.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
          最近の参加者から表示 • リアルタイム更新
        </div>
      )}
    </div>
  );
};
