import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { useComments, useLoadMoreComments } from '@/hooks/useCommentQueries';
import { useCommentsStore } from '@/store/commentsStore';
import type { SortOrder } from '@commentia/shared';
import { useState } from 'react';
import { CommentItem } from './CommentItem';

interface CommentListProps {
  roomId: string;
  className?: string;
}

export const CommentList = ({ roomId, className = '' }: CommentListProps) => {
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');
  const { comments, hasMore, error } = useCommentsStore();

  const commentsQuery = useComments(roomId, sortOrder);
  const loadMoreMutation = useLoadMoreComments(roomId, sortOrder);

  const handleSortChange = (newSortOrder: SortOrder) => {
    if (newSortOrder !== sortOrder) {
      setSortOrder(newSortOrder);
    }
  };

  const handleLoadMore = () => {
    if (hasMore && !loadMoreMutation.isPending) {
      loadMoreMutation.mutate();
    }
  };

  // ローディング状態（初回読み込み）
  if (commentsQuery.isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <CommentListHeader sortOrder={sortOrder} onSortChange={handleSortChange} />
        <div className="flex justify-center py-8">
          <Loading size="md" />
          <span className="ml-2 text-gray-600">コメントを読み込み中...</span>
        </div>
      </div>
    );
  }

  // エラー状態
  if (error) {
    return (
      <div className={`space-y-4 ${className}`}>
        <CommentListHeader sortOrder={sortOrder} onSortChange={handleSortChange} />
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <svg
            className="w-12 h-12 text-red-400 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-label="エラー"
            role="img"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <h3 className="text-lg font-medium text-red-900 mb-2">読み込みエラー</h3>
          <p className="text-red-700 mb-4">{error}</p>
          <Button variant="primary" onClick={() => commentsQuery.refetch()}>
            再試行
          </Button>
        </div>
      </div>
    );
  }

  // 空状態
  if (!comments || comments.length === 0) {
    return (
      <div className={`space-y-4 ${className}`}>
        <CommentListHeader sortOrder={sortOrder} onSortChange={handleSortChange} />
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <svg
            className="w-16 h-16 text-gray-400 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-label="コメントなし"
            role="img"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">まだコメントがありません</h3>
          <p className="text-gray-600">最初のコメントを投稿してみましょう！</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* ヘッダー部分 */}
      <CommentListHeader sortOrder={sortOrder} onSortChange={handleSortChange} />

      {/* コメント一覧 */}
      <div className="space-y-3">
        {comments.map((comment) => (
          <CommentItem key={comment.commentId} comment={comment} />
        ))}
      </div>

      {/* さらに読み込みボタン */}
      {hasMore && (
        <div className="flex justify-center py-4">
          <Button
            variant="secondary"
            onClick={handleLoadMore}
            disabled={loadMoreMutation.isPending}
            loading={loadMoreMutation.isPending}
            className="px-6"
          >
            {loadMoreMutation.isPending ? '読み込み中...' : 'さらに読み込む'}
          </Button>
        </div>
      )}

      {/* 読み込み完了メッセージ */}
      {!hasMore && comments.length > 0 && (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500">すべてのコメントを表示しました</p>
        </div>
      )}

      {/* 読み込みエラー（追加読み込み時） */}
      {loadMoreMutation.error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <div className="flex items-center">
            <svg
              className="w-4 h-4 text-red-400 mr-2"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-label="エラー"
              role="img"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm text-red-800">
              {loadMoreMutation.error instanceof Error
                ? loadMoreMutation.error.message
                : '追加コメントの読み込みに失敗しました'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ヘッダーコンポーネント（ソート機能）
interface CommentListHeaderProps {
  sortOrder: SortOrder;
  onSortChange: (sortOrder: SortOrder) => void;
}

const CommentListHeader = ({ sortOrder, onSortChange }: CommentListHeaderProps) => {
  return (
    <div className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4">
      <h2 className="text-lg font-semibold text-gray-900">コメント</h2>

      {/* ソート選択 */}
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-600">並び順:</span>
        <div className="flex bg-gray-100 rounded-md p-1">
          <button
            type="button"
            onClick={() => onSortChange('latest')}
            className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
              sortOrder === 'latest'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            新着順
          </button>
          <button
            type="button"
            onClick={() => onSortChange('likes')}
            className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
              sortOrder === 'likes'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            いいね順
          </button>
        </div>
      </div>
    </div>
  );
};
