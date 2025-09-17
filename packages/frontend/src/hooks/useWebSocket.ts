import { WebSocketManager } from '@/services/websocketManager';
import { useCurrentRoom } from '@/store/roomStore';
import { useCurrentUser } from '@/store/userStore';
import { useWebSocketStore } from '@/store/websocketStore';
import type { JoinRoomRequest, WSMessage } from '@commentia/shared';
import { useCallback, useEffect } from 'react';

// WebSocket URL を環境変数から取得
const getWebSocketURL = (): string => {
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (wsUrl) {
    return wsUrl;
  }

  // デフォルトはHTTP URLをWebSocketに変換
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  return apiUrl.replace(/^http/, 'ws');
};

export const useWebSocket = () => {
  const currentRoom = useCurrentRoom();
  const currentUser = useCurrentUser();
  const status = useWebSocketStore((state) => state.status);
  const isConnected = useWebSocketStore((state) => state.status === 'connected');
  const isConnecting = useWebSocketStore(
    (state) => state.status === 'connecting' || state.status === 'reconnecting'
  );
  const userCount = useWebSocketStore((state) => state.userCount);
  const error = useWebSocketStore((state) => state.error);
  const canSendMessage = useWebSocketStore(
    (state) => state.status === 'connected' && state.socket !== null
  );

  // WebSocket マネージャーのインスタンス取得
  const manager = WebSocketManager.getInstance();

  // 接続関数
  const connect = useCallback(
    (url?: string) => {
      const wsUrl = url || getWebSocketURL();
      manager.connect(wsUrl);
    },
    [manager]
  );

  // 切断関数
  const disconnect = useCallback(() => {
    manager.disconnect();
  }, [manager]);

  // ルーム参加関数
  const joinRoom = useCallback(
    (roomId: string, roomCode?: string) => {
      if (!currentUser) {
        console.error('User must be authenticated to join room');
        return;
      }

      const request: JoinRoomRequest = {
        roomId,
        userId: currentUser.userId,
        userName: currentUser.userName,
        ...(roomCode ? { roomCode } : {}),
      };

      manager.joinRoom(request);
    },
    [manager, currentUser]
  );

  // ルーム退出関数
  const leaveRoom = useCallback(() => {
    manager.leaveRoom();
  }, [manager]);

  // メッセージ送信関数
  const sendMessage = useCallback(
    (message: WSMessage) => {
      manager.sendMessage(message);
    },
    [manager]
  );

  // コンポーネントマウント時にWebSocketマネージャーを初期化
  useEffect(() => {
    WebSocketManager.initialize();

    // クリーンアップ（コンポーネントアンマウント時）
    return () => {
      // 開発環境でのStrictModeでの重複実行を避けるため、
      // ここではクリーンアップしない
      // 実際のクリーンアップはアプリケーション終了時に行う
    };
  }, []);

  // 自動接続（ルームが存在し、ユーザーが認証済みの場合）
  useEffect(() => {
    if (currentRoom && currentUser && !isConnected && !isConnecting) {
      console.log('Auto-connecting to WebSocket...');
      connect();
    }
  }, [currentRoom, currentUser, isConnected, isConnecting, connect]);

  // 自動ルーム参加（接続完了後、ルームが存在する場合）
  useEffect(() => {
    if (isConnected && currentRoom && currentUser) {
      console.log('Auto-joining room...');
      joinRoom(currentRoom.roomId, currentRoom.roomCode);
    }
  }, [isConnected, currentRoom, currentUser, joinRoom]);

  return {
    // 状態
    status,
    isConnected,
    isConnecting,
    userCount,
    error,
    canSendMessage,

    // アクション
    connect,
    disconnect,
    joinRoom,
    leaveRoom,
    sendMessage,
  };
};

// WebSocketクリーンアップ用フック（アプリケーション終了時に使用）
export const useWebSocketCleanup = () => {
  useEffect(() => {
    // アプリケーション終了時のクリーンアップ
    const handleBeforeUnload = () => {
      WebSocketManager.cleanup();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
};
