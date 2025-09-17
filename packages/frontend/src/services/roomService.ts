import type { APIResponse, CreateRoomRequest, JoinRoomRequest, Room } from '@commentia/shared';
import { apiClient, extractResponseData } from './api';

export class RoomService {
  // ルーム作成
  static async createRoom(data: CreateRoomRequest): Promise<Room> {
    const response = await apiClient.post<APIResponse<Room>>('/rooms', data);
    return extractResponseData(response);
  }

  // ルーム参加
  static async joinRoom(data: JoinRoomRequest): Promise<Room> {
    const response = await apiClient.post<APIResponse<Room>>('/rooms/join', data);
    return extractResponseData(response);
  }

  // ルーム詳細取得
  static async getRoom(roomId: string): Promise<Room> {
    const response = await apiClient.get<APIResponse<Room>>(`/rooms/${roomId}`);
    return extractResponseData(response);
  }

  // ルームコードでルーム取得
  static async getRoomByCode(roomCode: string): Promise<Room> {
    const response = await apiClient.get<APIResponse<Room>>(`/rooms/code/${roomCode}`);
    return extractResponseData(response);
  }

  // ルーム退出
  static async leaveRoom(roomId: string): Promise<void> {
    await apiClient.post(`/rooms/${roomId}/leave`);
  }

  // ルーム閉鎖（ホスト専用）
  static async closeRoom(roomId: string): Promise<void> {
    await apiClient.delete(`/rooms/${roomId}`);
  }

  // ルーム設定更新（ホスト専用）
  static async updateRoomSettings(
    roomId: string,
    settings: Partial<Room['settings']>
  ): Promise<Room> {
    const response = await apiClient.patch<APIResponse<Room>>(`/rooms/${roomId}/settings`, {
      settings,
    });
    return extractResponseData(response);
  }

  // QRコード生成
  static async generateQRCode(roomId: string): Promise<{
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
  static async getRooms(params?: {
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
}
