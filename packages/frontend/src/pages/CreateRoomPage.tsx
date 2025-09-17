import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { useCreateRoom } from '@/hooks/useRoomQueries';
import { useRoomStore } from '@/store/roomStore';
import { useUserStore } from '@/store/userStore';
import type { CreateRoomRequest } from '@commentia/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

export const CreateRoomPage = () => {
  const navigate = useNavigate();
  const { currentUser, setCurrentUser } = useUserStore();
  const { currentRoom, isCreatingRoom, error } = useRoomStore();
  const createRoomMutation = useCreateRoom();

  const [userName, setUserName] = useState(currentUser?.userName || '');
  const [settings, setSettings] = useState({
    maxCommentsPerUser: 10,
    maxLikesPerUser: 100,
    commentMaxLength: 500,
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // ルーム作成成功時の処理
  useEffect(() => {
    if (currentRoom && !isCreatingRoom) {
      navigate(`/room/${currentRoom.roomId}`);
    }
  }, [currentRoom, isCreatingRoom, navigate]);

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!userName.trim()) {
      errors.userName = 'ユーザー名を入力してください';
    } else if (userName.trim().length < 2) {
      errors.userName = 'ユーザー名は2文字以上で入力してください';
    } else if (userName.trim().length > 20) {
      errors.userName = 'ユーザー名は20文字以内で入力してください';
    }

    if (settings.maxCommentsPerUser < 1 || settings.maxCommentsPerUser > 100) {
      errors.maxCommentsPerUser = 'コメント上限は1〜100の範囲で設定してください';
    }

    if (settings.maxLikesPerUser < 1 || settings.maxLikesPerUser > 1000) {
      errors.maxLikesPerUser = 'いいね上限は1〜1000の範囲で設定してください';
    }

    if (settings.commentMaxLength < 10 || settings.commentMaxLength > 1000) {
      errors.commentMaxLength = 'コメント文字数は10〜1000の範囲で設定してください';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // ユーザー情報を更新
    const userId = currentUser?.userId || crypto.randomUUID();
    setCurrentUser({
      userId,
      userName: userName.trim(),
    });

    // ルーム作成リクエスト
    const createRoomRequest: CreateRoomRequest = {
      hostId: userId,
      settings,
    };

    try {
      await createRoomMutation.mutateAsync(createRoomRequest);
    } catch (err) {
      console.error('ルーム作成エラー:', err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">ルーム作成</h1>
        <p className="text-lg text-gray-600">新しいルームを作成してコメント投稿を始めましょう</p>
      </div>

      <div className="card p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ユーザー名入力 */}
          <div>
            <label htmlFor="userName" className="block text-sm font-medium text-gray-700 mb-2">
              ユーザー名 <span className="text-red-500">*</span>
            </label>
            <Input
              id="userName"
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="ユーザー名を入力（2-20文字）"
              error={validationErrors.userName}
              disabled={isCreatingRoom}
            />
          </div>

          {/* ルーム設定 */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">ルーム設定</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="maxComments"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  コメント上限/人
                </label>
                <Input
                  id="maxComments"
                  type="number"
                  min="1"
                  max="100"
                  value={settings.maxCommentsPerUser}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      maxCommentsPerUser: Number.parseInt(e.target.value) || 1,
                    }))
                  }
                  error={validationErrors.maxCommentsPerUser}
                  disabled={isCreatingRoom}
                />
              </div>

              <div>
                <label htmlFor="maxLikes" className="block text-sm font-medium text-gray-700 mb-2">
                  いいね上限/人
                </label>
                <Input
                  id="maxLikes"
                  type="number"
                  min="1"
                  max="1000"
                  value={settings.maxLikesPerUser}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      maxLikesPerUser: Number.parseInt(e.target.value) || 1,
                    }))
                  }
                  error={validationErrors.maxLikesPerUser}
                  disabled={isCreatingRoom}
                />
              </div>

              <div>
                <label htmlFor="maxLength" className="block text-sm font-medium text-gray-700 mb-2">
                  コメント文字数上限
                </label>
                <Input
                  id="maxLength"
                  type="number"
                  min="10"
                  max="1000"
                  value={settings.commentMaxLength}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      commentMaxLength: Number.parseInt(e.target.value) || 10,
                    }))
                  }
                  error={validationErrors.commentMaxLength}
                  disabled={isCreatingRoom}
                />
              </div>
            </div>
          </div>

          {/* エラーメッセージ */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <svg
                  className="w-5 h-5 text-red-400 mr-2 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          {/* 送信ボタン */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate('/')}
              disabled={isCreatingRoom}
              className="flex-1"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isCreatingRoom}
              loading={isCreatingRoom}
              className="flex-1"
            >
              ルームを作成
            </Button>
          </div>
        </form>
      </div>

      {/* ローディング表示 */}
      {isCreatingRoom && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 text-center">
            <Loading size="lg" />
            <p className="mt-4 text-gray-600">ルームを作成しています...</p>
          </div>
        </div>
      )}
    </div>
  );
};
