import { useCommentsStore } from '@/store/commentsStore';
import { useRoomStore } from '@/store/roomStore';
import { useUserStore } from '@/store/userStore';
import { useWebSocketStore } from '@/store/websocketStore';
import type {
  CommentCreatedMessage,
  CommentDeletedMessage,
  CommentLikedMessage,
  JoinRoomRequest,
  RoomClosedMessage,
  RoomWithUserCount,
  UserJoinedMessage,
  UserLeftMessage,
  WSMessage,
} from '@commentia/shared';

export class WebSocketManager {
  private static instance: WebSocketManager | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  private constructor() {
    // シングルトンパターン
  }

  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  // WebSocket接続を開始
  connect(url: string): void {
    const store = useWebSocketStore.getState();
    store.connect(url);
    this.startHeartbeat();
  }

  // WebSocket接続を切断
  disconnect(): void {
    const store = useWebSocketStore.getState();
    store.disconnect();
    this.stopHeartbeat();
    this.stopReconnectTimeout();
  }

  // ルームに参加
  joinRoom(request: JoinRoomRequest): void {
    const store = useWebSocketStore.getState();
    store.joinRoom(request);
  }

  // ルームを退出
  leaveRoom(): void {
    const store = useWebSocketStore.getState();
    store.leaveRoom();
  }

  // メッセージを送信
  sendMessage(message: WSMessage): void {
    const store = useWebSocketStore.getState();
    store.sendMessage(message);
  }

  // ハートビート（接続確認）を開始
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const store = useWebSocketStore.getState();
      if (store.status === 'connected') {
        store.sendMessage({
          type: 'ping',
          data: { timestamp: Date.now() },
        });
      }
    }, 30000); // 30秒間隔
  }

  // ハートビートを停止
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // 再接続タイムアウトを停止
  private stopReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // WebSocketメッセージハンドラー（Zustandストアの handleMessage を拡張）
  static handleMessage(message: WSMessage): void {
    console.log('WebSocket message received:', message);

    const wsStore = useWebSocketStore.getState();
    const commentsStore = useCommentsStore.getState();
    const roomStore = useRoomStore.getState();
    const userStore = useUserStore.getState();

    switch (message.type) {
      case 'comment_created': {
        const data = message.data as CommentCreatedMessage['data'];
        commentsStore.addComment(data.comment);
        break;
      }

      case 'comment_deleted': {
        const data = message.data as CommentDeletedMessage['data'];
        commentsStore.removeComment(data.commentId);
        break;
      }

      case 'comment_liked': {
        const data = message.data as CommentLikedMessage['data'];
        commentsStore.updateLikeCount(data.commentId, data.newLikeCount);
        break;
      }

      case 'user_joined': {
        const data = message.data as UserJoinedMessage['data'];
        wsStore.setUserCount(data.userCount);

        // ルーム内ユーザー情報を更新（必要に応じて）
        if (roomStore.currentRoom) {
          const updatedRoom: RoomWithUserCount = {
            ...roomStore.currentRoom,
            userCount: data.userCount,
          };
          roomStore.setCurrentRoom(updatedRoom);
        }
        break;
      }

      case 'user_left': {
        const data = message.data as UserLeftMessage['data'];
        wsStore.setUserCount(data.userCount);

        // ルーム内ユーザー情報を更新
        if (roomStore.currentRoom) {
          const updatedRoom: RoomWithUserCount = {
            ...roomStore.currentRoom,
            userCount: data.userCount,
          };
          roomStore.setCurrentRoom(updatedRoom);
        }
        break;
      }

      case 'room_closed': {
        const data = message.data as RoomClosedMessage['data'];
        if (roomStore.currentRoom?.roomId === data.roomId) {
          roomStore.markRoomClosed();

          // ルーム閉鎖通知
          const errorMessage = data.reason
            ? `ルームが閉鎖されました: ${data.reason}`
            : 'ルームが閉鎖されました';
          roomStore.setError(errorMessage);

          // WebSocket接続を切断
          WebSocketManager.getInstance().disconnect();
        }
        break;
      }

      case 'pong': {
        // ハートビート応答を受信
        console.log('Heartbeat response received');
        break;
      }

      case 'error': {
        const errorData = message.data as { code?: string; message: string };
        const errorMessage = errorData.message || 'WebSocketエラーが発生しました';
        wsStore.setError(errorMessage);

        // 特定のエラーコードに応じた処理
        if (errorData.code === 'ROOM_NOT_FOUND') {
          roomStore.setError('ルームが見つかりません');
          roomStore.clearRoom();
        } else if (errorData.code === 'UNAUTHORIZED') {
          userStore.setError('認証エラーが発生しました');
          userStore.clearUser();
        }
        break;
      }

      case 'rate_limit': {
        const data = message.data as { retryAfter: number };
        const errorMessage = `レート制限に達しました。${data.retryAfter}秒後に再試行してください。`;
        wsStore.setError(errorMessage);
        break;
      }

      default:
        console.warn('Unknown WebSocket message type:', message.type);
        break;
    }
  }

  // 自動再接続の設定
  static setupAutoReconnect(): void {
    const store = useWebSocketStore.getState();

    // WebSocketストアのhandleMessageを上書き
    store.handleMessage = WebSocketManager.handleMessage;

    // 再接続ロジック
    store.handleClose = (event: CloseEvent) => {
      const currentState = useWebSocketStore.getState();

      currentState.setSocket(null);

      if (event.code === 1000) {
        // 正常終了
        currentState.setStatus('disconnected');
      } else if (currentState.autoReconnect && currentState.status !== 'error') {
        // 異常終了時の自動再接続
        console.log('WebSocket connection lost, attempting to reconnect...');
        currentState.reconnect();
      } else {
        currentState.setStatus('disconnected');
        currentState.setError(`Connection closed: ${event.reason || 'Unknown reason'}`);
      }
    };
  }

  // WebSocketマネージャーの初期化
  static initialize(): void {
    WebSocketManager.setupAutoReconnect();
  }

  // WebSocketマネージャーのクリーンアップ
  static cleanup(): void {
    const instance = WebSocketManager.getInstance();
    instance.stopHeartbeat();
    instance.stopReconnectTimeout();
    instance.disconnect();
  }
}
