import type { Room, RoomSettings } from '@commentia/shared';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface RoomState {
  // 現在のルーム情報
  currentRoom: Room | null;

  // ローディング状態
  isLoading: boolean;
  isCreatingRoom: boolean;
  isJoiningRoom: boolean;

  // エラー状態
  error: string | null;

  // QRコード関連
  qrCodeData: string | null;
  qrCodeUrl: string | null;

  // アクション
  setCurrentRoom: (room: Room | null) => void;
  setLoading: (loading: boolean) => void;
  setCreatingRoom: (creating: boolean) => void;
  setJoiningRoom: (joining: boolean) => void;
  setError: (error: string | null) => void;
  setQRCodeData: (qrData: string | null, qrUrl: string | null) => void;
  clearRoom: () => void;

  // デリベートアクション
  updateRoomSettings: (settings: Partial<RoomSettings>) => void;
  markRoomClosed: () => void;
}

export const useRoomStore = create<RoomState>()(
  subscribeWithSelector((set, get) => ({
    // 初期状態
    currentRoom: null,
    isLoading: false,
    isCreatingRoom: false,
    isJoiningRoom: false,
    error: null,
    qrCodeData: null,
    qrCodeUrl: null,

    // 基本アクション
    setCurrentRoom: (room) => {
      set({ currentRoom: room });
      if (room) {
        set({ error: null }); // ルームが設定されたらエラーをクリア
      }
    },

    setLoading: (loading) => set({ isLoading: loading }),

    setCreatingRoom: (creating) => set({ isCreatingRoom: creating }),

    setJoiningRoom: (joining) => set({ isJoiningRoom: joining }),

    setError: (error) => set({ error }),

    setQRCodeData: (qrData, qrUrl) =>
      set({
        qrCodeData: qrData,
        qrCodeUrl: qrUrl,
      }),

    clearRoom: () =>
      set({
        currentRoom: null,
        qrCodeData: null,
        qrCodeUrl: null,
        error: null,
        isLoading: false,
        isCreatingRoom: false,
        isJoiningRoom: false,
      }),

    // デリベートアクション
    updateRoomSettings: (newSettings) => {
      const currentRoom = get().currentRoom;
      if (currentRoom) {
        set({
          currentRoom: {
            ...currentRoom,
            settings: {
              ...currentRoom.settings,
              ...newSettings,
            },
          },
        });
      }
    },

    markRoomClosed: () => {
      const currentRoom = get().currentRoom;
      if (currentRoom) {
        set({
          currentRoom: {
            ...currentRoom,
            status: 'closed',
          },
        });
      }
    },
  }))
);

// セレクター関数（パフォーマンス最適化用）
export const roomSelectors = {
  currentRoom: (state: RoomState) => state.currentRoom,
  isInRoom: (state: RoomState) => state.currentRoom !== null,
  roomId: (state: RoomState) => state.currentRoom?.roomId,
  roomCode: (state: RoomState) => state.currentRoom?.roomCode,
  isHost: (userId: string) => (state: RoomState) => state.currentRoom?.hostId === userId,
  roomSettings: (state: RoomState) => state.currentRoom?.settings,
  isRoomActive: (state: RoomState) => state.currentRoom?.status === 'active',
  isLoading: (state: RoomState) => state.isLoading || state.isCreatingRoom || state.isJoiningRoom,
  error: (state: RoomState) => state.error,
  qrCode: (state: RoomState) => ({
    data: state.qrCodeData,
    url: state.qrCodeUrl,
  }),
};

// 型のエクスポート
export type { RoomState };

// カスタムフック（よく使用される組み合わせ）
export const useCurrentRoom = () => useRoomStore(roomSelectors.currentRoom);
export const useRoomLoading = () => useRoomStore(roomSelectors.isLoading);
export const useRoomError = () => useRoomStore(roomSelectors.error);
export const useIsInRoom = () => useRoomStore(roomSelectors.isInRoom);
export const useIsHost = (userId: string) => useRoomStore(roomSelectors.isHost(userId));
export const useQRCode = () => useRoomStore(roomSelectors.qrCode);
