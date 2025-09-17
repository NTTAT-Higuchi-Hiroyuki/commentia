import { RoomService } from '@/services/roomService';
import { useRoomStore } from '@/store/roomStore';
// import { useUserStore } from "@/store/userStore";
// import type { CreateRoomRequest } from "@commentia/shared";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

// ルーム作成フック
export const useCreateRoom = () => {
  const queryClient = useQueryClient();
  const { setCurrentRoom, setCreatingRoom, setError } = useRoomStore();

  return useMutation({
    mutationFn: RoomService.createRoom,
    onMutate: () => {
      setCreatingRoom(true);
      setError(null);
    },
    onSuccess: (room) => {
      setCurrentRoom(room);
      setCreatingRoom(false);
      // ルーム一覧キャッシュを無効化
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (error) => {
      setCreatingRoom(false);
      setError(error instanceof Error ? error.message : 'ルーム作成に失敗しました');
    },
  });
};

// ルーム参加フック
export const useJoinRoom = () => {
  const queryClient = useQueryClient();
  const { setCurrentRoom, setJoiningRoom, setError } = useRoomStore();

  return useMutation({
    mutationFn: RoomService.joinRoom,
    onMutate: () => {
      setJoiningRoom(true);
      setError(null);
    },
    onSuccess: (room) => {
      setCurrentRoom(room);
      setJoiningRoom(false);
      // ルーム詳細キャッシュを更新
      queryClient.setQueryData(['room', room.roomId], room);
    },
    onError: (error) => {
      setJoiningRoom(false);
      setError(error instanceof Error ? error.message : 'ルーム参加に失敗しました');
    },
  });
};

// ルーム詳細取得フック
export const useRoom = (roomId: string | null) => {
  const { setCurrentRoom, setError } = useRoomStore();

  const query = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => {
      if (!roomId) throw new Error('Room ID is required');
      return RoomService.getRoom(roomId);
    },
    enabled: !!roomId,
  });

  useEffect(() => {
    if (query.data) {
      setCurrentRoom(query.data);
    }
  }, [query.data, setCurrentRoom]);

  useEffect(() => {
    if (query.error) {
      setError(
        query.error instanceof Error ? query.error.message : 'ルーム情報の取得に失敗しました'
      );
    }
  }, [query.error, setError]);

  return query;
};

// ルーム退出フック
export const useLeaveRoom = () => {
  const queryClient = useQueryClient();
  const { clearRoom, setError } = useRoomStore();

  return useMutation({
    mutationFn: RoomService.leaveRoom,
    onSuccess: () => {
      clearRoom();
      // 関連するクエリキャッシュをクリア
      queryClient.removeQueries({ queryKey: ['room'] });
      queryClient.removeQueries({ queryKey: ['comments'] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'ルーム退出に失敗しました');
    },
  });
};

// ルーム閉鎖フック（ホスト専用）
export const useCloseRoom = () => {
  const queryClient = useQueryClient();
  const { markRoomClosed, setError } = useRoomStore();

  return useMutation({
    mutationFn: RoomService.closeRoom,
    onSuccess: () => {
      markRoomClosed();
      // 関連するクエリキャッシュを無効化
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
    },
    onError: (error) => {
      setError(error instanceof Error ? error.message : 'ルーム閉鎖に失敗しました');
    },
  });
};
