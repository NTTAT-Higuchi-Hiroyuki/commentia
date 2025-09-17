import { CommentService } from '@/services/commentService';
import { useCommentsStore } from '@/store/commentsStore';
import { useUserStore } from '@/store/userStore';
import type {
  CreateCommentRequest,
  GetCommentsRequest,
  GetCommentsResponse,
  SortOrder,
} from '@commentia/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

// コメント一覧取得フック
export const useComments = (roomId: string | null, sortBy: SortOrder = 'latest') => {
  const { setComments, setLoading, setError, setPagination } = useCommentsStore();

  const query = useQuery({
    queryKey: ['comments', roomId, sortBy],
    queryFn: () =>
      CommentService.getComments({
        roomId: roomId!,
        sortBy,
        limit: 20,
      }),
    enabled: !!roomId,
  });

  useEffect(() => {
    if (query.data) {
      setComments(query.data.comments);
      setPagination(query.data.hasMore, query.data.nextCursor);
      setError(null);
    }
  }, [query.data, setComments, setPagination, setError]);

  useEffect(() => {
    if (query.error) {
      setError(query.error instanceof Error ? query.error.message : 'コメントの取得に失敗しました');
    }
  }, [query.error, setError]);

  useEffect(() => {
    setLoading(false);
  }, [query.isFetched, setLoading]);

  return query;
};

// 追加コメント読み込みフック（ページネーション）
export const useLoadMoreComments = (roomId: string | null, sortBy: SortOrder = 'latest') => {
  const queryClient = useQueryClient();
  const { appendComments, setPagination, setError } = useCommentsStore();
  const nextCursor = useCommentsStore((state) => state.nextCursor);

  return useMutation({
    mutationFn: () =>
      CommentService.getComments({
        roomId: roomId!,
        sortBy,
        cursor: nextCursor,
        limit: 20,
      }),
    onSuccess: (response) => {
      appendComments(response.comments);
      setPagination(response.hasMore, response.nextCursor);
      // キャッシュを更新
      queryClient.setQueryData(
        ['comments', roomId, sortBy],
        (oldData: GetCommentsResponse | undefined) => {
          if (!oldData) return response;
          return {
            ...response,
            comments: [...oldData.comments, ...response.comments],
          };
        }
      );
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : '追加コメントの取得に失敗しました');
    },
  });
};

// コメント投稿フック
export const useCreateComment = (roomId: string) => {
  const queryClient = useQueryClient();
  const { addComment, setPosting, setError, setPostCooldown } = useCommentsStore();
  const { incrementCommentsPosted, decrementCommentsRemaining, setNextPostTime } = useUserStore();

  return useMutation({
    mutationFn: CommentService.createComment,
    onMutate: () => {
      setPosting(true);
      setError(null);
    },
    onSuccess: (comment) => {
      addComment(comment);
      setPosting(false);

      // ユーザー統計を更新
      incrementCommentsPosted();
      decrementCommentsRemaining();

      // 投稿クールダウンを設定（30秒）
      const cooldownEnd = Date.now() + 30000;
      setPostCooldown(cooldownEnd);
      setNextPostTime(cooldownEnd);

      // コメント一覧キャッシュを無効化
      queryClient.invalidateQueries({
        queryKey: ['comments', roomId],
      });
    },
    onError: (error) => {
      setPosting(false);
      setError(error instanceof Error ? error.message : 'コメントの投稿に失敗しました');
    },
  });
};

// コメント削除フック
export const useDeleteComment = () => {
  const queryClient = useQueryClient();
  const { removeComment, setDeleting, setError } = useCommentsStore();

  return useMutation({
    mutationFn: (commentId: string) => {
      setDeleting(commentId);
      return CommentService.deleteComment(commentId);
    },
    onSuccess: (_, commentId) => {
      removeComment(commentId);
      setDeleting(null);
      // コメント一覧キャッシュを無効化
      queryClient.invalidateQueries({
        queryKey: ['comments'],
      });
    },
    onError: (error, commentId) => {
      setDeleting(null);
      setError(error instanceof Error ? error.message : 'コメントの削除に失敗しました');
    },
  });
};

// いいねフック
export const useLikeComment = () => {
  const queryClient = useQueryClient();
  const { updateLikeCount, setError } = useCommentsStore();
  const { incrementLikesGiven, decrementLikesRemaining } = useUserStore();

  return useMutation({
    mutationFn: CommentService.likeComment,
    onSuccess: (response, commentId) => {
      updateLikeCount(commentId, response.likeCount);

      // ユーザー統計を更新
      incrementLikesGiven();
      decrementLikesRemaining();

      // 関連するキャッシュを無効化
      queryClient.invalidateQueries({
        queryKey: ['comments'],
      });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'いいねに失敗しました');
    },
  });
};

// いいね取消フック
export const useUnlikeComment = () => {
  const queryClient = useQueryClient();
  const { updateLikeCount, setError } = useCommentsStore();

  return useMutation({
    mutationFn: CommentService.unlikeComment,
    onSuccess: (response, commentId) => {
      updateLikeCount(commentId, response.likeCount);

      // 関連するキャッシュを無効化
      queryClient.invalidateQueries({
        queryKey: ['comments'],
      });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'いいね取消に失敗しました');
    },
  });
};
