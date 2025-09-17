import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { useJoinRoom } from '@/hooks/useRoomQueries';
import { useRoomStore } from '@/store/roomStore';
import { useUserStore } from '@/store/userStore';
import type { JoinRoomRequest } from '@commentia/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

export const JoinRoomPage = () => {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId?: string }>();
  const [searchParams] = useSearchParams();
  const { currentUser, setCurrentUser } = useUserStore();
  const { currentRoom, isJoiningRoom, error } = useRoomStore();
  const joinRoomMutation = useJoinRoom();

  const [joinMethod, setJoinMethod] = useState<'code' | 'url'>(roomId ? 'url' : 'code');
  const [userName, setUserName] = useState(currentUser?.userName || '');
  const [roomCode, setRoomCode] = useState(searchParams.get('code') || '');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // ルーム参加成功時の処理
  useEffect(() => {
    if (currentRoom && !isJoiningRoom) {
      navigate(`/room/${currentRoom.roomId}`);
    }
  }, [currentRoom, isJoiningRoom, navigate]);

  // URL パラメータからルームIDが取得できた場合の自動参加処理
  useEffect(() => {
    if (roomId && userName.trim() && joinMethod === 'url') {
      // ユーザー名が設定されていればすぐに参加を試行
      if (currentUser?.userName) {
        handleJoinRoom(roomId);
      }
    }
  }, [roomId, userName, currentUser?.userName, joinMethod]);

  const validateForm = () => {
    const errors: Record<string, string> = {};

    if (!userName.trim()) {
      errors.userName = 'ユーザー名を入力してください';
    } else if (userName.trim().length < 2) {
      errors.userName = 'ユーザー名は2文字以上で入力してください';
    } else if (userName.trim().length > 20) {
      errors.userName = 'ユーザー名は20文字以内で入力してください';
    }

    if (joinMethod === 'code') {
      if (!roomCode.trim()) {
        errors.roomCode = 'ルームコードを入力してください';
      } else if (roomCode.trim().length !== 6) {
        errors.roomCode = 'ルームコードは6文字で入力してください';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleJoinRoom = async (targetRoomId?: string) => {
    const userId = currentUser?.userId || crypto.randomUUID();

    // ユーザー情報を更新
    setCurrentUser({
      userId,
      userName: userName.trim(),
    });

    const joinRequest: JoinRoomRequest = {
      roomId: targetRoomId || roomId || '',
      userId,
      userName: userName.trim(),
      ...(joinMethod === 'code' && roomCode.trim() ? { roomCode: roomCode.trim() } : {}),
    };

    try {
      await joinRoomMutation.mutateAsync(joinRequest);
    } catch (err) {
      console.error('ルーム参加エラー:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    await handleJoinRoom();
  };

  const handleMethodChange = (method: 'code' | 'url') => {
    setJoinMethod(method);
    setValidationErrors({});
    if (method === 'url') {
      setRoomCode('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">ルーム参加</h1>
        <p className="text-lg text-gray-600">ルームコードまたはURLでルームに参加しましょう</p>
      </div>

      <div className="card p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 参加方法選択 */}
          {!roomId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                参加方法を選択してください
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleMethodChange('code')}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    joinMethod === 'code'
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center">
                    <svg
                      className="w-5 h-5 mr-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                      />
                    </svg>
                    <div>
                      <div className="font-medium">ルームコード</div>
                      <div className="text-sm text-gray-600">6文字のコードを入力</div>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleMethodChange('url')}
                  className={`p-4 border-2 rounded-lg text-left transition-colors ${
                    joinMethod === 'url'
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center">
                    <svg
                      className="w-5 h-5 mr-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.102m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                      />
                    </svg>
                    <div>
                      <div className="font-medium">URL</div>
                      <div className="text-sm text-gray-600">ルームのURLを入力</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* URL参加の場合の表示 */}
          {roomId && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex">
                <svg
                  className="w-5 h-5 text-blue-400 mr-2 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <h4 className="text-sm font-medium text-blue-800">URLからの参加</h4>
                  <p className="text-sm text-blue-700 mt-1">ルームID: {roomId}</p>
                </div>
              </div>
            </div>
          )}

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
              disabled={isJoiningRoom}
            />
          </div>

          {/* ルームコード入力 */}
          {joinMethod === 'code' && !roomId && (
            <div>
              <label htmlFor="roomCode" className="block text-sm font-medium text-gray-700 mb-2">
                ルームコード <span className="text-red-500">*</span>
              </label>
              <Input
                id="roomCode"
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="6文字のルームコードを入力"
                maxLength={6}
                error={validationErrors.roomCode}
                disabled={isJoiningRoom}
                className="font-mono text-center text-lg tracking-widest"
              />
              <p className="text-sm text-gray-500 mt-1">
                ※ ルームコードは主催者から共有された6文字のコードです
              </p>
            </div>
          )}

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
              disabled={isJoiningRoom}
              className="flex-1"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isJoiningRoom}
              loading={isJoiningRoom}
              className="flex-1"
            >
              ルームに参加
            </Button>
          </div>
        </form>

        {/* QRコードスキャン機能の案内 */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="text-center">
            <h3 className="text-sm font-medium text-gray-900 mb-2">QRコードでの参加</h3>
            <p className="text-sm text-gray-600 mb-4">
              モバイルデバイスでQRコードをスキャンして、ルームのURLを取得できます
            </p>
            <div className="flex items-center justify-center">
              <svg
                className="w-16 h-16 text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h2M4 4h4m4 4h4m-4 0v4m-4 4h4"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* ローディング表示 */}
      {isJoiningRoom && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 text-center">
            <Loading size="lg" />
            <p className="mt-4 text-gray-600">ルームに参加しています...</p>
          </div>
        </div>
      )}
    </div>
  );
};
