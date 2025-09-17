import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface Participant {
  userId: string;
  userName: string;
  joinedAt: number;
  isOnline: boolean;
}

interface ParticipantsState {
  // 参加者一覧
  participants: Participant[];

  // 参加者数（WebSocketから同期）
  totalCount: number;

  // エラー状態
  error: string | null;

  // アクション
  addParticipant: (participant: Omit<Participant, 'joinedAt' | 'isOnline'>) => void;
  removeParticipant: (userId: string) => void;
  updateParticipantStatus: (userId: string, isOnline: boolean) => void;
  updateParticipantName: (userId: string, userName: string) => void;

  // ユーティリティ
  findParticipantByUserName: (userName: string) => Participant | undefined;
  findParticipantByUserId: (userId: string) => Participant | undefined;
  isUserNameTaken: (userName: string, excludeUserId?: string) => boolean;
  getOnlineParticipants: () => Participant[];
  getParticipantCount: () => number;

  // 同期とリセット
  syncTotalCount: (count: number) => void;
  setError: (error: string | null) => void;
  clearParticipants: () => void;
  resetState: () => void;
}

export const useParticipantsStore = create<ParticipantsState>()(
  subscribeWithSelector((set, get) => ({
    // 初期状態
    participants: [],
    totalCount: 0,
    error: null,

    // 参加者追加
    addParticipant: (participant) => {
      const { participants } = get();

      // 既に存在する場合は重複を避ける
      const existingParticipant = participants.find((p) => p.userId === participant.userId);
      if (existingParticipant) {
        // 既存参加者をオンラインに更新
        set({
          participants: participants.map((p) =>
            p.userId === participant.userId
              ? { ...p, isOnline: true, userName: participant.userName }
              : p
          ),
        });
        return;
      }

      // 新しい参加者を追加
      const newParticipant: Participant = {
        ...participant,
        joinedAt: Date.now(),
        isOnline: true,
      };

      set({
        participants: [...participants, newParticipant],
        error: null,
      });
    },

    // 参加者削除
    removeParticipant: (userId) => {
      const { participants } = get();
      set({
        participants: participants.filter((p) => p.userId !== userId),
      });
    },

    // 参加者のオンライン状態更新
    updateParticipantStatus: (userId, isOnline) => {
      const { participants } = get();
      set({
        participants: participants.map((p) => (p.userId === userId ? { ...p, isOnline } : p)),
      });
    },

    // 参加者名更新
    updateParticipantName: (userId, userName) => {
      const { participants } = get();
      set({
        participants: participants.map((p) => (p.userId === userId ? { ...p, userName } : p)),
      });
    },

    // ユーザー名で参加者検索
    findParticipantByUserName: (userName) => {
      const { participants } = get();
      return participants.find((p) => p.userName === userName);
    },

    // ユーザーIDで参加者検索
    findParticipantByUserId: (userId) => {
      const { participants } = get();
      return participants.find((p) => p.userId === userId);
    },

    // ユーザー名重複チェック
    isUserNameTaken: (userName, excludeUserId) => {
      const { participants } = get();
      return participants.some(
        (p) => p.userName === userName && p.isOnline && p.userId !== excludeUserId
      );
    },

    // オンライン参加者取得
    getOnlineParticipants: () => {
      const { participants } = get();
      return participants.filter((p) => p.isOnline).sort((a, b) => a.joinedAt - b.joinedAt);
    },

    // 参加者数取得
    getParticipantCount: () => {
      const { participants } = get();
      return participants.filter((p) => p.isOnline).length;
    },

    // WebSocketからの参加者数同期
    syncTotalCount: (count) => {
      set({ totalCount: count });
    },

    // エラー設定
    setError: (error) => set({ error }),

    // 参加者一覧クリア
    clearParticipants: () => {
      set({ participants: [], totalCount: 0, error: null });
    },

    // 状態リセット
    resetState: () => {
      set({
        participants: [],
        totalCount: 0,
        error: null,
      });
    },
  }))
);

// セレクター関数
export const participantsSelectors = {
  participants: (state: ParticipantsState) => state.participants,
  onlineParticipants: (state: ParticipantsState) => state.getOnlineParticipants(),
  totalCount: (state: ParticipantsState) => state.totalCount,
  participantCount: (state: ParticipantsState) => state.getParticipantCount(),
  error: (state: ParticipantsState) => state.error,
  isUserNameTaken: (state: ParticipantsState) => state.isUserNameTaken,
  findByUserName: (state: ParticipantsState) => state.findParticipantByUserName,
  findByUserId: (state: ParticipantsState) => state.findParticipantByUserId,
};

// 型のエクスポート
export type { ParticipantsState };

// カスタムフック
export const useParticipants = () => useParticipantsStore(participantsSelectors.participants);
export const useOnlineParticipants = () =>
  useParticipantsStore(participantsSelectors.onlineParticipants);
export const useParticipantCount = () =>
  useParticipantsStore(participantsSelectors.participantCount);
export const useTotalParticipantCount = () =>
  useParticipantsStore(participantsSelectors.totalCount);
export const useParticipantsError = () => useParticipantsStore(participantsSelectors.error);
export const useIsUserNameTaken = () => useParticipantsStore(participantsSelectors.isUserNameTaken);
