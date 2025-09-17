import type { Comment, SortOrder } from '@commentia/shared';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface CommentsState {
  // コメント一覧
  comments: Comment[];

  // ローディング状態
  isLoading: boolean;
  isPosting: boolean;
  isDeleting: string | null; // 削除中のコメントID

  // ページネーション
  hasMore: boolean;
  nextCursor: string | null;

  // ソート設定
  sortBy: SortOrder;

  // エラー状態
  error: string | null;

  // 投稿制限
  postCooldown: number; // 次回投稿可能時刻（timestamp）

  // アクション
  setComments: (comments: Comment[]) => void;
  addComment: (comment: Comment) => void;
  removeComment: (commentId: string) => void;
  updateComment: (commentId: string, updates: Partial<Comment>) => void;
  prependComments: (comments: Comment[]) => void;
  appendComments: (comments: Comment[]) => void;

  setLoading: (loading: boolean) => void;
  setPosting: (posting: boolean) => void;
  setDeleting: (commentId: string | null) => void;
  setError: (error: string | null) => void;

  setSortBy: (sortBy: SortOrder) => void;
  setPagination: (hasMore: boolean, nextCursor: string | null) => void;
  setPostCooldown: (cooldownEnd: number) => void;

  clearComments: () => void;

  // デリベートアクション
  updateLikeCount: (commentId: string, newLikeCount: number) => void;
  sortComments: () => void;
}

const sortCommentsByOrder = (comments: Comment[], sortBy: SortOrder): Comment[] => {
  const sorted = [...comments];

  switch (sortBy) {
    case 'latest':
      return sorted.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    case 'likes':
      return sorted.sort((a, b) => {
        // いいね数で降順、同じ場合は新しい順
        if (b.likeCount !== a.likeCount) {
          return b.likeCount - a.likeCount;
        }
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
    default:
      return sorted;
  }
};

export const useCommentsStore = create<CommentsState>()(
  subscribeWithSelector((set, get) => ({
    // 初期状態
    comments: [],
    isLoading: false,
    isPosting: false,
    isDeleting: null,
    hasMore: false,
    nextCursor: null,
    sortBy: 'latest',
    error: null,
    postCooldown: 0,

    // 基本アクション
    setComments: (comments) => {
      const { sortBy } = get();
      const sortedComments = sortCommentsByOrder(comments, sortBy);
      set({ comments: sortedComments });
    },

    addComment: (comment) => {
      const { comments, sortBy } = get();
      const newComments = [comment, ...comments];
      const sortedComments = sortCommentsByOrder(newComments, sortBy);
      set({ comments: sortedComments });
    },

    removeComment: (commentId) => {
      const { comments } = get();
      set({
        comments: comments.filter((comment) => comment.commentId !== commentId),
      });
    },

    updateComment: (commentId, updates) => {
      const { comments } = get();
      const updatedComments = comments.map((comment) =>
        comment.commentId === commentId ? { ...comment, ...updates } : comment
      );
      set({ comments: updatedComments });
    },

    prependComments: (newComments) => {
      const { comments, sortBy } = get();
      const allComments = [...newComments, ...comments];
      // 重複削除
      const uniqueComments = allComments.filter(
        (comment, index, arr) => arr.findIndex((c) => c.commentId === comment.commentId) === index
      );
      const sortedComments = sortCommentsByOrder(uniqueComments, sortBy);
      set({ comments: sortedComments });
    },

    appendComments: (newComments) => {
      const { comments, sortBy } = get();
      const allComments = [...comments, ...newComments];
      // 重複削除
      const uniqueComments = allComments.filter(
        (comment, index, arr) => arr.findIndex((c) => c.commentId === comment.commentId) === index
      );
      const sortedComments = sortCommentsByOrder(uniqueComments, sortBy);
      set({ comments: sortedComments });
    },

    setLoading: (loading) => set({ isLoading: loading }),

    setPosting: (posting) => set({ isPosting: posting }),

    setDeleting: (commentId) => set({ isDeleting: commentId }),

    setError: (error) => set({ error }),

    setSortBy: (sortBy) => {
      const { comments } = get();
      const sortedComments = sortCommentsByOrder(comments, sortBy);
      set({ sortBy, comments: sortedComments });
    },

    setPagination: (hasMore, nextCursor) => set({ hasMore, nextCursor }),

    setPostCooldown: (cooldownEnd) => set({ postCooldown: cooldownEnd }),

    clearComments: () =>
      set({
        comments: [],
        hasMore: false,
        nextCursor: null,
        error: null,
        isLoading: false,
        isPosting: false,
        isDeleting: null,
        postCooldown: 0,
      }),

    // デリベートアクション
    updateLikeCount: (commentId, newLikeCount) => {
      const { comments } = get();
      const updatedComments = comments.map((comment) =>
        comment.commentId === commentId ? { ...comment, likeCount: newLikeCount } : comment
      );
      set({ comments: updatedComments });
    },

    sortComments: () => {
      const { comments, sortBy } = get();
      const sortedComments = sortCommentsByOrder(comments, sortBy);
      set({ comments: sortedComments });
    },
  }))
);

// セレクター関数
export const commentsSelectors = {
  comments: (state: CommentsState) => state.comments,
  isLoading: (state: CommentsState) => state.isLoading,
  isPosting: (state: CommentsState) => state.isPosting,
  isDeleting: (commentId: string) => (state: CommentsState) => state.isDeleting === commentId,
  hasMore: (state: CommentsState) => state.hasMore,
  sortBy: (state: CommentsState) => state.sortBy,
  error: (state: CommentsState) => state.error,
  canPost: (state: CommentsState) => !state.isPosting && Date.now() >= state.postCooldown,
  commentCount: (state: CommentsState) => state.comments.length,
  commentById: (commentId: string) => (state: CommentsState) =>
    state.comments.find((comment) => comment.commentId === commentId),
  commentsByUser: (userId: string) => (state: CommentsState) =>
    state.comments.filter((comment) => comment.userId === userId),
};

// 型のエクスポート
export type { CommentsState };

// カスタムフック
export const useComments = () => useCommentsStore(commentsSelectors.comments);
export const useCommentsLoading = () => useCommentsStore(commentsSelectors.isLoading);
export const useCommentsError = () => useCommentsStore(commentsSelectors.error);
export const useCanPost = () => useCommentsStore(commentsSelectors.canPost);
export const useCommentCount = () => useCommentsStore(commentsSelectors.commentCount);
export const useSortBy = () => useCommentsStore(commentsSelectors.sortBy);
