import { Button } from '@/components/ui/Button';
import { useDeleteComment, useLikeComment, useUnlikeComment } from '@/hooks/useCommentQueries';
import { useUserStore } from '@/store/userStore';
import type { Comment } from '@commentia/shared';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useState } from 'react';

interface CommentItemProps {
  comment: Comment;
  className?: string;
}

export const CommentItem = ({ comment, className = '' }: CommentItemProps) => {
  const { currentUser, limits, isCommentLiked, addLikedComment, removeLikedComment } =
    useUserStore();
  const { likesRemaining } = limits;
  const deleteCommentMutation = useDeleteComment();
  const likeCommentMutation = useLikeComment();
  const unlikeCommentMutation = useUnlikeComment();

  const isLiked = isCommentLiked(comment.commentId);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isOwnComment = currentUser?.userId === comment.userId;
  const canLike = !isOwnComment && likesRemaining > 0 && !isLiked;
  const canUnlike = !isOwnComment && isLiked;

  // 時刻フォーマット
  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return formatDistanceToNow(date, { addSuffix: true, locale: ja });
    } catch {
      return '時刻不明';
    }
  };

  // いいねボタンのクリック処理
  const handleLikeClick = async () => {
    if (!canLike && !canUnlike) return;

    try {
      if (isLiked) {
        await unlikeCommentMutation.mutateAsync(comment.commentId);
        removeLikedComment(comment.commentId);
      } else {
        await likeCommentMutation.mutateAsync(comment.commentId);
        addLikedComment(comment.commentId);
      }
    } catch (error) {
      console.error('いいね操作エラー:', error);
      // エラー時は状態を元に戻す
      if (isLiked) {
        addLikedComment(comment.commentId);
      } else {
        removeLikedComment(comment.commentId);
      }
    }
  };

  // 削除ボタンのクリック処理
  const handleDeleteClick = async () => {
    if (!isOwnComment) return;

    try {
      await deleteCommentMutation.mutateAsync(comment.commentId);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('コメント削除エラー:', error);
    }
  };

  // コメント内容の改行処理
  const formatContent = (content: string) => {
    return content.split('\n').map((line, index) => (
      <span key={`line-${index}-${line.slice(0, 10)}`}>
        {line}
        {index < content.split('\n').length - 1 && <br />}
      </span>
    ));
  };

  const isDeleting = deleteCommentMutation.isPending;
  const isLikeLoading = likeCommentMutation.isPending || unlikeCommentMutation.isPending;

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
      {/* ヘッダー部分 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          {/* ユーザーアバター */}
          <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-medium">
              {comment.userName.charAt(0).toUpperCase()}
            </span>
          </div>

          {/* ユーザー名と時刻 */}
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-medium text-gray-900">{comment.userName}</span>
              {isOwnComment && (
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                  あなた
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500">{formatTime(comment.timestamp)}</div>
          </div>
        </div>

        {/* 削除ボタン（自分のコメントのみ） */}
        {isOwnComment && (
          <div className="relative">
            {!showDeleteConfirm ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
                className="text-gray-400 hover:text-red-500"
                title="削除"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-label="削除"
                  role="img"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </Button>
            ) : (
              <div className="flex items-center space-x-1 bg-red-50 rounded-md p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="text-xs text-gray-600"
                >
                  キャンセル
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDeleteClick}
                  disabled={isDeleting}
                  loading={isDeleting}
                  className="text-xs"
                >
                  削除
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* コメント内容 */}
      <div className="mb-3">
        <p className="text-gray-900 leading-relaxed">{formatContent(comment.content)}</p>
      </div>

      {/* フッター部分 */}
      <div className="flex items-center justify-between">
        {/* いいねボタン */}
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLikeClick}
            disabled={isLikeLoading || (!canLike && !canUnlike)}
            className={`group flex items-center space-x-1 transition-all duration-200 ease-in-out transform ${
              isLiked
                ? 'text-red-500 hover:text-red-600 scale-110'
                : 'text-gray-500 hover:text-red-500 hover:scale-105'
            } ${isLikeLoading ? 'animate-pulse' : ''} active:scale-95`}
          >
            <svg
              className={`w-4 h-4 transition-all duration-300 ease-in-out ${
                isLiked ? 'fill-current scale-110 drop-shadow-sm' : 'group-hover:scale-110'
              }`}
              fill={isLiked ? 'currentColor' : 'none'}
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-label="いいね"
              role="img"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
            <span
              className={`text-sm transition-all duration-200 ${isLikeLoading ? 'opacity-50' : ''}`}
            >
              {comment.likeCount}
            </span>
          </Button>

          {/* いいね制限表示 */}
          {!isOwnComment && likesRemaining <= 0 && (
            <span className="text-xs text-gray-400">（いいね上限達成）</span>
          )}
        </div>

        {/* コメントID（開発用） */}
        {process.env.NODE_ENV === 'development' && (
          <span className="text-xs text-gray-400 font-mono">ID: {comment.commentId.slice(-8)}</span>
        )}
      </div>

      {/* エラーメッセージ */}
      {(deleteCommentMutation.error ||
        likeCommentMutation.error ||
        unlikeCommentMutation.error) && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded-md p-2">
          <p className="text-sm text-red-800">
            {deleteCommentMutation.error?.message ||
              likeCommentMutation.error?.message ||
              unlikeCommentMutation.error?.message ||
              '操作に失敗しました'}
          </p>
        </div>
      )}
    </div>
  );
};
