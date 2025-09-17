import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { RoomService } from '@/services/roomService';
import { useRoomStore } from '@/store/roomStore';
import { useUserStore } from '@/store/userStore';
import type { Room, RoomSettings as RoomSettingsType } from '@commentia/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export interface RoomSettingsProps {
  room: Room;
  isOpen: boolean;
  onClose: () => void;
}

export const RoomSettings = ({ room, isOpen, onClose }: RoomSettingsProps) => {
  const queryClient = useQueryClient();
  const { currentUser } = useUserStore();
  const { error, setError } = useRoomStore();

  const [settings, setSettings] = useState<RoomSettingsType>(room.settings);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // ルーム設定更新のミューテーション
  const updateSettingsMutation = useMutation({
    mutationFn: (newSettings: RoomSettingsType) =>
      RoomService.updateRoomSettings(room.roomId, newSettings),
    onSuccess: (updatedRoom) => {
      // キャッシュを更新
      queryClient.setQueryData(['room', room.roomId], updatedRoom);
      // ストアも更新
      useRoomStore.getState().setCurrentRoom(updatedRoom);
      setError(null);
      onClose();
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'ルーム設定の更新に失敗しました');
    },
  });

  // モーダルが開かれた時にルーム設定をリセット
  useEffect(() => {
    if (isOpen) {
      setSettings(room.settings);
      setValidationErrors({});
      setError(null);
    }
  }, [isOpen, room.settings, setError]);

  // ホストでない場合は設定変更を禁止
  const isHost = currentUser?.userId === room.hostId;
  if (!isHost) {
    return null;
  }

  const validateSettings = () => {
    const errors: Record<string, string> = {};

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateSettings()) {
      return;
    }

    // 設定に変更がない場合はそのまま閉じる
    if (JSON.stringify(settings) === JSON.stringify(room.settings)) {
      onClose();
      return;
    }

    try {
      await updateSettingsMutation.mutateAsync(settings);
    } catch (err) {
      console.error('設定更新エラー:', err);
    }
  };

  const handleReset = () => {
    setSettings(room.settings);
    setValidationErrors({});
  };

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(room.settings);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="ルーム設定"
      size="md"
      closeOnOverlayClick={!updateSettingsMutation.isPending}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 設定値入力 */}
        <div className="space-y-4">
          <div>
            <label
              htmlFor="maxCommentsPerUser"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              コメント上限（1人当たり）
            </label>
            <Input
              id="maxCommentsPerUser"
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
              disabled={updateSettingsMutation.isPending}
              placeholder="1〜100"
            />
            <p className="text-sm text-gray-500 mt-1">
              1人のユーザーが投稿できるコメントの最大数です
            </p>
          </div>

          <div>
            <label
              htmlFor="maxLikesPerUser"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              いいね上限（1人当たり）
            </label>
            <Input
              id="maxLikesPerUser"
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
              disabled={updateSettingsMutation.isPending}
              placeholder="1〜1000"
            />
            <p className="text-sm text-gray-500 mt-1">1人のユーザーが押せるいいねの最大数です</p>
          </div>

          <div>
            <label
              htmlFor="commentMaxLength"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              コメント文字数上限
            </label>
            <Input
              id="commentMaxLength"
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
              disabled={updateSettingsMutation.isPending}
              placeholder="10〜1000"
            />
            <p className="text-sm text-gray-500 mt-1">1つのコメントの最大文字数です</p>
          </div>
        </div>

        {/* 現在の設定との比較 */}
        {hasChanges && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h4 className="text-sm font-medium text-blue-800 mb-2">変更内容</h4>
            <div className="space-y-1 text-sm text-blue-700">
              {settings.maxCommentsPerUser !== room.settings.maxCommentsPerUser && (
                <div>
                  コメント上限: {room.settings.maxCommentsPerUser}件/人 →{' '}
                  {settings.maxCommentsPerUser}件/人
                </div>
              )}
              {settings.maxLikesPerUser !== room.settings.maxLikesPerUser && (
                <div>
                  いいね上限: {room.settings.maxLikesPerUser}回/人 → {settings.maxLikesPerUser}回/人
                </div>
              )}
              {settings.commentMaxLength !== room.settings.commentMaxLength && (
                <div>
                  文字数上限: {room.settings.commentMaxLength}文字 → {settings.commentMaxLength}文字
                </div>
              )}
            </div>
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

        {/* 注意事項 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <svg
              className="w-5 h-5 text-yellow-400 mr-2 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-yellow-800">ご注意</h4>
              <p className="text-sm text-yellow-700 mt-1">
                設定変更は即座に全ての参加者に適用されます。既存のコメントやいいねには影響しませんが、今後の投稿に制限が適用されます。
              </p>
            </div>
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleReset}
            disabled={updateSettingsMutation.isPending || !hasChanges}
            className="flex-1"
          >
            リセット
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={updateSettingsMutation.isPending}
            className="flex-1"
          >
            キャンセル
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={updateSettingsMutation.isPending || !hasChanges}
            loading={updateSettingsMutation.isPending}
            className="flex-1"
          >
            設定を保存
          </Button>
        </div>
      </form>
    </Modal>
  );
};
