import { CommentForm } from '@/components/CommentForm';
import { CommentSection } from '@/components/CommentSection';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { ParticipantList } from '@/components/ParticipantList';
import { Button } from '@/components/ui/Button';
import { useRealtimeComments } from '@/hooks/useRealtimeComments';
import { WebSocketManager } from '@/services/websocketManager';
import { useParticipantsStore } from '@/store/participantsStore';
import { useRoomStore } from '@/store/roomStore';
import { useUserStore } from '@/store/userStore';
import { useWebSocketStore } from '@/store/websocketStore';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export const RoomPage = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { currentRoom, isLoading, error } = useRoomStore();
  const { currentUser, isAuthenticated } = useUserStore();
  const { status: wsStatus, userCount } = useWebSocketStore();
  const { clearParticipants } = useParticipantsStore();
  const [showParticipants, setShowParticipants] = useState(false);
  const [copied, setCopied] = useState(false);

  // リアルタイムコメント機能を有効化
  const { isConnected } = useRealtimeComments({
    roomId: roomId || '',
    enableNotifications: true,
  });

  // ルーム情報の初期化と WebSocket 接続
  useEffect(() => {
    if (!roomId) {
      navigate('/');
      return;
    }

    if (!currentUser || !isAuthenticated) {
      navigate(`/join-room?code=${roomId}`);
      return;
    }

    // 参加者データをクリア（新しいルーム用）
    clearParticipants();

    // WebSocket接続が確立されていない場合は接続
    if (wsStatus === 'disconnected') {
      const wsUrl = import.meta.env.VITE_WS_URL || 'wss://api.commentia.example.com/ws';
      WebSocketManager.getInstance().connect(wsUrl);
    }
  }, [roomId, currentUser, isAuthenticated, navigate, clearParticipants, wsStatus]);

  // ルーム退出処理
  const handleLeaveRoom = () => {
    if (window.confirm('ルームから退出しますか？')) {
      WebSocketManager.getInstance().leaveRoom();
      WebSocketManager.getInstance().disconnect();
      clearParticipants();
      navigate('/');
    }
  };

  // ルームコードをクリップボードにコピー
  const handleCopyRoomCode = async () => {
    if (!currentRoom?.roomCode) return;

    try {
      await navigator.clipboard.writeText(currentRoom.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('コピーに失敗しました:', err);
    }
  };

  // ルーム招待URLをコピー
  const handleCopyInviteUrl = async () => {
    if (!roomId) return;

    const inviteUrl = `${window.location.origin}/join-room/${roomId}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('コピーに失敗しました:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border border-blue-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">ルームを読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !currentRoom) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center">
          <svg
            className="w-16 h-16 mx-auto text-red-400 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-label="警告"
          >
            <title>ルームエラー</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">ルームが見つかりません</h1>
          <p className="text-gray-600 mb-6">
            {error || 'ルームが存在しないか、アクセス権限がありません。'}
          </p>
          <div className="space-y-3">
            <Button onClick={() => navigate('/')} variant="primary">
              ホームに戻る
            </Button>
            <Button onClick={() => navigate('/join-room')} variant="secondary">
              別のルームに参加
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* ルームヘッダー */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">ルーム {currentRoom.roomCode}</h1>
              <ConnectionStatus variant="compact" />
            </div>

            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span>ルームコード: {currentRoom.roomCode}</span>
              <span>参加者: {userCount}人</span>
              <span>
                ホスト: {currentRoom.hostId === currentUser?.userId ? 'あなた' : 'その他'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* 参加者一覧表示切り替え */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowParticipants(!showParticipants)}
              className="flex items-center space-x-1"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-label="参加者"
              >
                <title>参加者一覧</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <span>{showParticipants ? '参加者を非表示' : '参加者を表示'}</span>
            </Button>

            {/* 共有ボタン */}
            <Button variant="ghost" size="sm" onClick={handleCopyRoomCode}>
              {copied ? '✓ コピー済み' : '📋 コード共有'}
            </Button>

            <Button variant="ghost" size="sm" onClick={handleCopyInviteUrl}>
              🔗 URL共有
            </Button>

            {/* 退出ボタン */}
            <Button variant="danger" size="sm" onClick={handleLeaveRoom}>
              退出
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* メインコンテンツエリア */}
        <div className={`${showParticipants ? 'lg:col-span-3' : 'lg:col-span-4'} space-y-6`}>
          {/* 接続状態詳細 */}
          {wsStatus !== 'connected' && (
            <ConnectionStatus variant="detailed" showDetails className="mb-4" />
          )}

          {/* コメント投稿フォーム */}
          {roomId && (
            <CommentForm roomId={roomId} disabled={!isConnected || wsStatus !== 'connected'} />
          )}

          {/* コメント一覧 */}
          {roomId && <CommentSection roomId={roomId} />}
        </div>

        {/* サイドバー（参加者一覧） */}
        {showParticipants && (
          <div className="lg:col-span-1">
            <ParticipantList
              showHeader
              maxHeight="max-h-[calc(100vh-300px)]"
              className="sticky top-6"
            />
          </div>
        )}
      </div>

      {/* モバイル用参加者一覧（オーバーレイ） */}
      {showParticipants && (
        <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-50">
          <div className="absolute inset-x-4 top-4 bottom-4 bg-white rounded-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-medium">参加者一覧</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowParticipants(false)}>
                ✕
              </Button>
            </div>
            <div className="p-4 h-full overflow-y-auto">
              <ParticipantList showHeader={false} maxHeight="h-full" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
