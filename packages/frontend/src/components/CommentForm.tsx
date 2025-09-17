import { Button } from '@/components/ui/Button';
import { useCreateComment } from '@/hooks/useCommentQueries';
import { useUserStore } from '@/store/userStore';
// TODO: Import CONSTANTS from shared package once exported
const CONSTANTS = {
  MAX_COMMENT_LENGTH: 500,
};
import type React from 'react';
import type { FormEvent } from 'react';
import { useState } from 'react';

interface CommentFormProps {
  roomId: string;
  disabled?: boolean;
  className?: string;
}

export const CommentForm = ({ roomId, disabled = false, className = '' }: CommentFormProps) => {
  const { currentUser, limits } = useUserStore();
  const { commentsRemaining, nextPostTime } = limits;
  const createCommentMutation = useCreateComment(roomId);

  const [content, setContent] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const maxLength = CONSTANTS.MAX_COMMENT_LENGTH;

  // 投稿制限チェック
  const canPost = () => {
    if (!currentUser) return false;
    if (commentsRemaining <= 0) return false;
    if (nextPostTime && Date.now() < nextPostTime) return false;
    if (content.trim().length === 0) return false;
    if (content.length > maxLength) return false;
    return true;
  };

  // クールダウン時間の計算
  const getCooldownSeconds = () => {
    if (!nextPostTime) return 0;
    const remaining = Math.max(0, nextPostTime - Date.now());
    return Math.ceil(remaining / 1000);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!canPost() || !currentUser) {
      return;
    }

    try {
      await createCommentMutation.mutateAsync({
        roomId,
        userId: currentUser.userId,
        userName: currentUser.userName,
        content: content.trim(),
      });

      // 投稿成功時にフォームをクリア
      setContent('');
      setIsFocused(false);
    } catch (error) {
      console.error('コメント投稿エラー:', error);
    }
  };

  const cooldownSeconds = getCooldownSeconds();
  const isSubmitting = createCommentMutation.isPending;
  const remainingChars = maxLength - content.length;

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 md:p-6 ${className}`}>
      <form onSubmit={handleSubmit} className="space-y-3 md:space-y-4">
        {/* ユーザー情報表示 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm text-gray-600 space-y-1 sm:space-y-0">
          <span>
            投稿者: <span className="font-medium text-gray-900">{currentUser?.userName}</span>
          </span>
          <span>
            残り投稿数: <span className="font-medium">{commentsRemaining}</span>
          </span>
        </div>

        {/* コメント入力フィールド */}
        <div className="relative">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="コメントを入力してください..."
            className={`w-full p-3 md:p-4 border border-gray-200 rounded-md resize-none transition-all text-base touch-manipulation ${
              isFocused ? 'border-blue-500 ring-2 ring-blue-200' : ''
            } ${remainingChars < 0 ? 'border-red-500' : ''}`}
            rows={isFocused ? 4 : 2}
            maxLength={maxLength + 50} // UI上では少し多めに入力を許可（バリデーションで制限）
            disabled={disabled || isSubmitting}
          />

          {/* 文字数カウンター */}
          <div className="absolute bottom-2 right-2 text-xs text-gray-400">
            <span className={remainingChars < 0 ? 'text-red-500' : 'text-gray-500'}>
              {remainingChars < 0 ? `${-remainingChars} 文字超過` : `${remainingChars} 文字残り`}
            </span>
          </div>
        </div>

        {/* エラーメッセージ */}
        {createCommentMutation.error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <div className="flex items-start">
              <svg
                className="w-4 h-4 text-red-400 mr-2 mt-0.5 flex-shrink-0"
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
                {createCommentMutation.error instanceof Error
                  ? createCommentMutation.error.message
                  : 'コメントの投稿に失敗しました'}
              </p>
            </div>
          </div>
        )}

        {/* 制限情報 */}
        {commentsRemaining <= 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <p className="text-sm text-yellow-800">
              コメント投稿上限に達しました。これ以上コメントを投稿できません。
            </p>
          </div>
        )}

        {cooldownSeconds > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-sm text-blue-800">
              連続投稿制限中です。あと {cooldownSeconds} 秒後に投稿できます。
            </p>
          </div>
        )}

        {/* 投稿ボタン */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            <span>Enterで投稿</span>
            {isFocused && <span className="ml-2">Shift+Enterで改行</span>}
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={disabled || !canPost() || isSubmitting}
            loading={isSubmitting}
            className="px-6"
          >
            {isSubmitting ? '投稿中...' : '投稿'}
          </Button>
        </div>
      </form>

      {/* キーボードショートカット */}
      <div
        className="mt-2"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (canPost()) {
              handleSubmit(e as React.FormEvent);
            }
          }
        }}
      />
    </div>
  );
};
