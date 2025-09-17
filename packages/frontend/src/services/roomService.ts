import type { APIResponse, CreateRoomRequest, JoinRoomRequest, Room } from '@commentia/shared';
import { apiClient, extractResponseData } from './api';

// ルーム作成
export async function createRoom(data: CreateRoomRequest): Promise<Room> {
  const response = await apiClient.post<APIResponse<Room>>('/rooms', data);
  return extractResponseData(response);
}

// ルーム参加
export async function joinRoom(data: JoinRoomRequest): Promise<Room> {
  const response = await apiClient.post<APIResponse<Room>>('/rooms/join', data);
  return extractResponseData(response);
}

// ルーム詳細取得
export async function getRoom(roomId: string): Promise<Room> {
  const response = await apiClient.get<APIResponse<Room>>(`/rooms/${roomId}`);
  return extractResponseData(response);
}

// ルームコードでルーム取得
export async function getRoomByCode(roomCode: string): Promise<Room> {
  const response = await apiClient.get<APIResponse<Room>>(`/rooms/code/${roomCode}`);
  return extractResponseData(response);
}

// ルーム退出
export async function leaveRoom(roomId: string): Promise<void> {
  await apiClient.post(`/rooms/${roomId}/leave`);
}

// ルーム閉鎖（ホスト専用）
export async function closeRoom(roomId: string): Promise<void> {
  await apiClient.delete(`/rooms/${roomId}`);
}

// ルーム設定更新（ホスト専用）
export async function updateRoomSettings(
  roomId: string,
  settings: Partial<Room['settings']>
): Promise<Room> {
  const response = await apiClient.patch<APIResponse<Room>>(`/rooms/${roomId}/settings`, {
    settings,
  });
  return extractResponseData(response);
}

// QRコード生成
export async function generateQRCode(roomId: string): Promise<{
  qrCodeData: string;
  qrCodeUrl: string;
}> {
  const response = await apiClient.post<
    APIResponse<{
      qrCodeData: string;
      qrCodeUrl: string;
    }>
  >(`/rooms/${roomId}/qr-code`);
  return extractResponseData(response);
}

// ルーム一覧取得（開発用/管理用）
export async function getRooms(params?: {
  page?: number;
  limit?: number;
  status?: 'active' | 'closed';
}): Promise<{
  rooms: Room[];
  totalCount: number;
  hasMore: boolean;
}> {
  const response = await apiClient.get<
    APIResponse<{
      rooms: Room[];
      totalCount: number;
      hasMore: boolean;
    }>
  >('/rooms', { params });
  return extractResponseData(response);
}

// 後方互換性のため、RoomServiceオブジェクトも提供
export const RoomService = {
  createRoom,
  joinRoom,
  getRoom,
  getRoomByCode,
  leaveRoom,
  closeRoom,
  updateRoomSettings,
  generateQRCode,
  getRooms,
} as const;
