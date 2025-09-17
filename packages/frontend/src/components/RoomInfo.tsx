import { QRCode } from '@/components/QRCode';
import { Button } from '@/components/ui/Button';
import { useCloseRoom, useLeaveRoom } from '@/hooks/useRoomQueries';
import { useRoomStore } from '@/store/roomStore';
import { useUserStore } from '@/store/userStore';
import type { Room, RoomSettings } from '@commentia/shared';
import { useState } from 'react';

export interface RoomInfoProps {
  room: Room;
  userCount?: number;
  onShowSettings?: () => void;
}

export const RoomInfo = ({ room, userCount = 0, onShowSettings }: RoomInfoProps) => {
  const { currentUser } = useUserStore();
  const { error } = useRoomStore();
  const closeRoomMutation = useCloseRoom();
  const leaveRoomMutation = useLeaveRoom();

  const [showQRCode, setShowQRCode] = useState(false);

  const isHost = currentUser?.userId === room.hostId;
  const roomUrl = `${window.location.origin}/join/${room.roomId}`;

  const handleCopyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(room.roomCode);
      // Toast通知などがあれば表示
    } catch (err) {
      console.error('コピーエラー:', err);
    }
  };

  const handleCopyRoomUrl = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl);
      // Toast通知などがあれば表示
    } catch (err) {
      console.error('コピーエラー:', err);
    }
  };

  const handleLeaveRoom = async () => {
    if (confirm('本当にルームから退出しますか？')) {
      try {
        await leaveRoomMutation.mutateAsync(room.roomId);
      } catch (err) {
        console.error('退出エラー:', err);
      }
    }
  };

  const handleCloseRoom = async () => {
    if (
      confirm(
        'ルームを閉鎖すると、すべての参加者が退出され、ルームは使用できなくなります。本当に閉鎖しますか？'
      )
    ) {
      try {
        await closeRoomMutation.mutateAsync(room.roomId);
      } catch (err) {
        console.error('ルーム閉鎖エラー:', err);
      }
    }
  };

  const formatSettingsValue = (key: keyof RoomSettings, value: number) => {
    switch (key) {
      case 'maxCommentsPerUser':
        return `${value}件/人`;
      case 'maxLikesPerUser':
        return `${value}回/人`;
      case 'commentMaxLength':
        return `${value}文字`;
      default:
        return value.toString();
    }
  };

  const getSettingsLabel = (key: keyof RoomSettings) => {
    switch (key) {
      case 'maxCommentsPerUser':
        return 'コメント上限';
      case 'maxLikesPerUser':
        return 'いいね上限';
      case 'commentMaxLength':
        return '文字数上限';
      default:
        return key;
    }
  };

  return (
    <div className="space-y-6">
      {/* ルーム基本情報 */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">ルーム情報</h2>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-400 rounded-full" />
            <span className="text-sm text-gray-600">
              {room.status === 'active' ? 'アクティブ' : '閉鎖済み'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ルームコード */}
          <div className="space-y-2">
            <div className="block text-sm font-medium text-gray-700">ルームコード</div>
            <div className="flex items-center space-x-2">
              <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 font-mono text-lg tracking-widest flex-1 text-center">
                {room.roomCode}
              </div>
              <Button variant="ghost" size="icon" onClick={handleCopyRoomCode} title="コピー">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <title>コピー</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </Button>
            </div>
          </div>

          {/* 参加者数 */}
          <div className="space-y-2">
            <div className="block text-sm font-medium text-gray-700">参加者数</div>
            <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-center">
              <span className="text-lg font-semibold text-blue-600">{userCount}</span>
              <span className="text-sm text-gray-600 ml-1">人</span>
            </div>
          </div>
        </div>

        {/* ルームURL */}
        <div className="mt-4">
          <div className="block text-sm font-medium text-gray-700 mb-2">ルームURL</div>
          <div className="flex items-center space-x-2">
            <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm flex-1 font-mono break-all">
              {roomUrl}
            </div>
            <Button variant="ghost" size="icon" onClick={handleCopyRoomUrl} title="URLをコピー">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <title>URLをコピー</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowQRCode(true)}>
              QRコード
            </Button>
          </div>
        </div>
      </div>

      {/* ルーム設定 */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">ルーム設定</h3>
          {isHost && onShowSettings && (
            <Button variant="ghost" size="sm" onClick={onShowSettings}>
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <title>設定</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              設定を変更
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Object.entries(room.settings).map(([key, value]) => (
            <div key={key} className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">
                {getSettingsLabel(key as keyof RoomSettings)}
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {formatSettingsValue(key as keyof RoomSettings, value)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* アクションボタン */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">アクション</h3>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <svg
                className="w-5 h-5 text-red-400 mr-2 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <title>エラー</title>
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          {isHost ? (
            <>
              <Button
                variant="danger"
                onClick={handleCloseRoom}
                disabled={closeRoomMutation.isPending}
                loading={closeRoomMutation.isPending}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <title>警告</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                ルームを閉鎖
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              onClick={handleLeaveRoom}
              disabled={leaveRoomMutation.isPending}
              loading={leaveRoomMutation.isPending}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <title>退出</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              ルームから退出
            </Button>
          )}
        </div>
      </div>

      {/* QRコードモーダル */}
      {showQRCode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">QRコード</h3>
              <button
                type="button"
                onClick={() => setShowQRCode(false)}
                className="p-1 hover:bg-gray-100 rounded-md transition-colors"
                aria-label="QRコードを閉じる"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
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
            <div className="text-center">
              <QRCode value={roomUrl} size={200} className="mx-auto mb-4" />
              <p className="text-sm text-gray-600 mb-4">QRコードをスキャンしてルームに参加</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowQRCode(false)}
                className="w-full"
              >
                閉じる
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
