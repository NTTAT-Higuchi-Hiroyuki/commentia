import type { JoinRoomRequest, WSMessage } from '@commentia/shared';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface WebSocketState {
  // 接続状態
  status: ConnectionStatus;
  socket: WebSocket | null;

  // 接続情報
  url: string | null;
  reconnectAttempts: number;
  maxReconnectAttempts: number;

  // メッセージキュー（接続前の送信待ちメッセージ）
  messageQueue: string[];

  // 接続されたユーザー数
  userCount: number;

  // エラー情報
  error: string | null;
  lastError: Error | null;

  // 設定
  autoReconnect: boolean;
  reconnectInterval: number; // milliseconds
  baseReconnectInterval: number; // milliseconds
  maxReconnectInterval: number; // milliseconds

  // アクション
  setStatus: (status: ConnectionStatus) => void;
  setSocket: (socket: WebSocket | null) => void;
  setError: (error: string | null, errorObj?: Error) => void;
  setUserCount: (count: number) => void;

  connect: (url: string) => void;
  disconnect: () => void;
  reconnect: () => void;
  manualReconnect: () => void;

  sendMessage: (message: WSMessage) => void;
  queueMessage: (message: string) => void;
  flushMessageQueue: () => void;

  joinRoom: (request: JoinRoomRequest) => void;
  leaveRoom: () => void;

  // デリベートアクション
  handleMessage: (message: WSMessage) => void;
  handleError: (error: Event) => void;
  handleClose: (event: CloseEvent) => void;
  handleOpen: () => void;

  clearState: () => void;
}

export const useWebSocketStore = create<WebSocketState>()(
  subscribeWithSelector((set, get) => ({
    // 初期状態
    status: 'disconnected',
    socket: null,
    url: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    messageQueue: [],
    userCount: 0,
    error: null,
    lastError: null,
    autoReconnect: true,
    reconnectInterval: 3000, // 3秒
    baseReconnectInterval: 1000, // 1秒
    maxReconnectInterval: 30000, // 30秒

    // 基本アクション
    setStatus: (status) => set({ status }),

    setSocket: (socket) => set({ socket }),

    setError: (error, errorObj) => set({ error, lastError: errorObj || null }),

    setUserCount: (count) => set({ userCount: count }),

    // 接続管理
    connect: (url) => {
      const state = get();

      if (state.status === 'connected' || state.status === 'connecting') {
        return; // 既に接続中または接続済み
      }

      set({ url, status: 'connecting', error: null });

      try {
        const socket = new WebSocket(url);

        socket.onopen = () => {
          const currentState = get();
          currentState.handleOpen();
        };

        socket.onmessage = (event) => {
          const currentState = get();
          try {
            const message: WSMessage = JSON.parse(event.data);
            currentState.handleMessage(message);
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        socket.onerror = (error) => {
          const currentState = get();
          currentState.handleError(error);
        };

        socket.onclose = (event) => {
          const currentState = get();
          currentState.handleClose(event);
        };

        set({ socket });
      } catch (err) {
        set({
          status: 'error',
          error: 'Failed to create WebSocket connection',
          lastError: err as Error,
        });
      }
    },

    disconnect: () => {
      const { socket } = get();

      set({ autoReconnect: false }); // 手動切断時は自動再接続を無効化

      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close(1000, 'User disconnect');
      }

      set({
        socket: null,
        status: 'disconnected',
        reconnectAttempts: 0,
        messageQueue: [],
        error: null,
      });
    },

    reconnect: () => {
      const {
        url,
        reconnectAttempts,
        maxReconnectAttempts,
        baseReconnectInterval,
        maxReconnectInterval,
      } = get();

      if (!url || reconnectAttempts >= maxReconnectAttempts) {
        set({
          status: 'error',
          error: 'Max reconnection attempts reached',
        });
        return;
      }

      set({
        status: 'reconnecting',
        reconnectAttempts: reconnectAttempts + 1,
      });

      // 指数バックオフで再接続間隔を計算
      const exponentialDelay = Math.min(
        baseReconnectInterval * 2 ** reconnectAttempts,
        maxReconnectInterval
      );

      // ランダムなジッターを追加 (±25%)
      const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
      const finalDelay = Math.max(0, exponentialDelay + jitter);

      console.log(
        `Reconnecting in ${Math.round(finalDelay)}ms (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`
      );

      setTimeout(() => {
        const currentState = get();
        currentState.connect(url);
      }, finalDelay);
    },

    manualReconnect: () => {
      const { socket } = get();

      // 現在の接続を切断
      if (socket) {
        socket.close();
      }

      // 再接続試行回数をリセットして自動再接続を有効化
      set({
        reconnectAttempts: 0,
        autoReconnect: true,
        error: null,
        status: 'disconnected',
      });

      // 少し待ってから再接続
      setTimeout(() => {
        const { url } = get();
        if (url) {
          get().connect(url);
        }
      }, 100);
    },

    // メッセージ送信
    sendMessage: (message) => {
      const { socket, status } = get();

      if (status !== 'connected' || !socket) {
        // 接続されていない場合はキューに追加
        get().queueMessage(JSON.stringify(message));
        return;
      }

      try {
        socket.send(JSON.stringify(message));
      } catch (err) {
        console.error('Failed to send WebSocket message:', err);
        get().queueMessage(JSON.stringify(message));
      }
    },

    queueMessage: (message) => {
      const { messageQueue } = get();
      set({ messageQueue: [...messageQueue, message] });
    },

    flushMessageQueue: () => {
      const { socket, messageQueue, status } = get();

      if (status !== 'connected' || !socket || messageQueue.length === 0) {
        return;
      }

      try {
        for (const message of messageQueue) {
          socket.send(message);
        }
        set({ messageQueue: [] });
      } catch (err) {
        console.error('Failed to flush message queue:', err);
      }
    },

    // ルーム操作
    joinRoom: (request) => {
      get().sendMessage({
        type: 'join_room',
        data: request,
      } as WSMessage);
    },

    leaveRoom: () => {
      get().sendMessage({
        type: 'leave_room',
        data: {},
      } as WSMessage);
    },

    // イベントハンドラー
    handleOpen: () => {
      set({
        status: 'connected',
        reconnectAttempts: 0,
        error: null,
      });

      // 接続成功時にメッセージキューを送信
      get().flushMessageQueue();
    },

    handleMessage: (message) => {
      // メッセージタイプに応じて他のストアを更新
      // この処理は実際のコンポーネントやサービスレイヤーで行う
      console.log('WebSocket message received:', message);

      // ユーザー数更新の例
      if (message.type === 'user_joined' || message.type === 'user_left') {
        if ('userCount' in message.data) {
          set({ userCount: message.data.userCount as number });
        }
      }
    },

    handleError: (error) => {
      console.error('WebSocket error:', error);
      set({
        status: 'error',
        error: 'WebSocket connection error',
        lastError: new Error('WebSocket error'),
      });
    },

    handleClose: (event) => {
      const { autoReconnect, status } = get();

      set({ socket: null });

      if (event.code === 1000) {
        // 正常終了
        set({ status: 'disconnected' });
      } else if (autoReconnect && status !== 'error') {
        // 異常終了時の自動再接続
        get().reconnect();
      } else {
        set({
          status: 'disconnected',
          error: `Connection closed: ${event.reason || 'Unknown reason'}`,
        });
      }
    },

    clearState: () =>
      set({
        status: 'disconnected',
        socket: null,
        url: null,
        reconnectAttempts: 0,
        messageQueue: [],
        userCount: 0,
        error: null,
        lastError: null,
        autoReconnect: true,
        reconnectInterval: 3000,
        baseReconnectInterval: 1000,
        maxReconnectInterval: 30000,
      }),
  }))
);

// セレクター関数
export const websocketSelectors = {
  status: (state: WebSocketState) => state.status,
  isConnected: (state: WebSocketState) => state.status === 'connected',
  isConnecting: (state: WebSocketState) =>
    state.status === 'connecting' || state.status === 'reconnecting',
  userCount: (state: WebSocketState) => state.userCount,
  error: (state: WebSocketState) => state.error,
  reconnectAttempts: (state: WebSocketState) => state.reconnectAttempts,
  canSendMessage: (state: WebSocketState) => state.status === 'connected' && state.socket !== null,
};

// 型のエクスポート
export type { WebSocketState };

// カスタムフック
export const useWebSocketStatus = () => useWebSocketStore(websocketSelectors.status);
export const useIsConnected = () => useWebSocketStore(websocketSelectors.isConnected);
export const useIsConnecting = () => useWebSocketStore(websocketSelectors.isConnecting);
export const useUserCount = () => useWebSocketStore(websocketSelectors.userCount);
export const useWebSocketError = () => useWebSocketStore(websocketSelectors.error);
export const useCanSendMessage = () => useWebSocketStore(websocketSelectors.canSendMessage);
