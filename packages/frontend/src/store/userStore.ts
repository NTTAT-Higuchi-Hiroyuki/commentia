import type { User } from '@commentia/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  // 現在のユーザー情報
  currentUser: User | null;

  // 認証状態
  isAuthenticated: boolean;

  // ユーザー統計
  stats: {
    commentsPosted: number;
    likesGiven: number;
    likesReceived: number;
  };

  // 制限状況
  limits: {
    commentsRemaining: number;
    likesRemaining: number;
    nextPostTime: number; // 次回投稿可能時刻（timestamp）
  };

  // エラー状態
  error: string | null;

  // アクション
  setCurrentUser: (user: User | null) => void;
  updateUser: (updates: Partial<User>) => void;
  setAuthenticated: (authenticated: boolean) => void;
  setError: (error: string | null) => void;

  // 統計更新
  incrementCommentsPosted: () => void;
  incrementLikesGiven: () => void;
  incrementLikesReceived: () => void;

  // 制限管理
  updateLimits: (limits: Partial<UserState['limits']>) => void;
  decrementCommentsRemaining: () => void;
  decrementLikesRemaining: () => void;
  setNextPostTime: (timestamp: number) => void;

  // リセット
  clearUser: () => void;
  resetStats: () => void;

  // デリベートアクション
  generateTempUserId: () => string;
  canPost: () => boolean;
  canLike: () => boolean;
}

// 一時的なユーザーID生成
const generateTempUserId = (): string => {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      // 初期状態
      currentUser: null,
      isAuthenticated: false,
      stats: {
        commentsPosted: 0,
        likesGiven: 0,
        likesReceived: 0,
      },
      limits: {
        commentsRemaining: 10, // デフォルト制限
        likesRemaining: 100, // デフォルト制限
        nextPostTime: 0,
      },
      error: null,

      // 基本アクション
      setCurrentUser: (user) => {
        set({ currentUser: user });
        if (user) {
          set({ isAuthenticated: true, error: null });
        }
      },

      updateUser: (updates) => {
        const { currentUser } = get();
        if (currentUser) {
          set({
            currentUser: {
              ...currentUser,
              ...updates,
            },
          });
        }
      },

      setAuthenticated: (authenticated) => set({ isAuthenticated: authenticated }),

      setError: (error) => set({ error }),

      // 統計更新
      incrementCommentsPosted: () => {
        const { stats } = get();
        set({
          stats: {
            ...stats,
            commentsPosted: stats.commentsPosted + 1,
          },
        });
      },

      incrementLikesGiven: () => {
        const { stats } = get();
        set({
          stats: {
            ...stats,
            likesGiven: stats.likesGiven + 1,
          },
        });
      },

      incrementLikesReceived: () => {
        const { stats } = get();
        set({
          stats: {
            ...stats,
            likesReceived: stats.likesReceived + 1,
          },
        });
      },

      // 制限管理
      updateLimits: (newLimits) => {
        const { limits } = get();
        set({
          limits: {
            ...limits,
            ...newLimits,
          },
        });
      },

      decrementCommentsRemaining: () => {
        const { limits } = get();
        set({
          limits: {
            ...limits,
            commentsRemaining: Math.max(0, limits.commentsRemaining - 1),
          },
        });
      },

      decrementLikesRemaining: () => {
        const { limits } = get();
        set({
          limits: {
            ...limits,
            likesRemaining: Math.max(0, limits.likesRemaining - 1),
          },
        });
      },

      setNextPostTime: (timestamp) => {
        const { limits } = get();
        set({
          limits: {
            ...limits,
            nextPostTime: timestamp,
          },
        });
      },

      // リセット
      clearUser: () =>
        set({
          currentUser: null,
          isAuthenticated: false,
          error: null,
          stats: {
            commentsPosted: 0,
            likesGiven: 0,
            likesReceived: 0,
          },
          limits: {
            commentsRemaining: 10,
            likesRemaining: 100,
            nextPostTime: 0,
          },
        }),

      resetStats: () =>
        set({
          stats: {
            commentsPosted: 0,
            likesGiven: 0,
            likesReceived: 0,
          },
        }),

      // デリベートアクション
      generateTempUserId,

      canPost: () => {
        const { limits } = get();
        return limits.commentsRemaining > 0 && Date.now() >= limits.nextPostTime;
      },

      canLike: () => {
        const { limits } = get();
        return limits.likesRemaining > 0;
      },
    }),
    {
      name: 'commentia-user-storage', // localStorage key
      partialize: (state) => ({
        currentUser: state.currentUser,
        isAuthenticated: state.isAuthenticated,
        stats: state.stats,
        // limitsやerrorは永続化しない（セッション毎にリセット）
      }),
    }
  )
);

// セレクター関数
export const userSelectors = {
  currentUser: (state: UserState) => state.currentUser,
  isAuthenticated: (state: UserState) => state.isAuthenticated,
  userId: (state: UserState) => state.currentUser?.userId,
  userName: (state: UserState) => state.currentUser?.userName,
  stats: (state: UserState) => state.stats,
  limits: (state: UserState) => state.limits,
  error: (state: UserState) => state.error,
  canPost: (state: UserState) => state.canPost(),
  canLike: (state: UserState) => state.canLike(),
  commentsRemaining: (state: UserState) => state.limits.commentsRemaining,
  likesRemaining: (state: UserState) => state.limits.likesRemaining,
  nextPostIn: (state: UserState) => Math.max(0, state.limits.nextPostTime - Date.now()),
};

// 型のエクスポート
export type { UserState };

// カスタムフック
export const useCurrentUser = () => useUserStore(userSelectors.currentUser);
export const useIsAuthenticated = () => useUserStore(userSelectors.isAuthenticated);
export const useUserId = () => useUserStore(userSelectors.userId);
export const useUserName = () => useUserStore(userSelectors.userName);
export const useUserStats = () => useUserStore(userSelectors.stats);
export const useUserLimits = () => useUserStore(userSelectors.limits);
export const useUserError = () => useUserStore(userSelectors.error);
export const useCanPost = () => useUserStore(userSelectors.canPost);
export const useCanLike = () => useUserStore(userSelectors.canLike);
