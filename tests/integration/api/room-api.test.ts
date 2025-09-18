/**
 * Room API 統合テスト
 * フロントエンド-バックエンド間のAPI統合テスト
 */

import type { CreateRoomRequest, CreateRoomResponse, Room } from '@commentia/shared';
import axios, { type AxiosInstance } from 'axios';
import {
  checkDynamoDBLocal,
  generateTestRoomId,
  generateTestUserId,
  testDynamoClient,
} from '../setup';

describe('Room API Integration Tests', () => {
  let apiClient: AxiosInstance;
  const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

  beforeAll(async () => {
    // DynamoDB Local起動確認
    const dynamoRunning = await checkDynamoDBLocal();
    if (!dynamoRunning) {
      console.warn('DynamoDB Local is not running. Skipping integration tests.');
      return;
    }

    // APIクライアント設定
    apiClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  beforeEach(() => {
    // 各テスト前のセットアップ
  });

  afterEach(() => {
    // 各テスト後のクリーンアップ
  });

  describe('POST /rooms - ルーム作成', () => {
    it('正常にルームを作成できること', async () => {
      const hostId = generateTestUserId();
      const requestData: CreateRoomRequest = {
        hostId,
        settings: {
          maxCommentsPerUser: 10,
          maxLikesPerUser: 50,
          commentMaxLength: 500,
        },
      };

      try {
        const response = await apiClient.post<CreateRoomResponse>('/rooms', requestData);

        expect(response.status).toBe(201);
        expect(response.data).toHaveProperty('room');
        expect(response.data.room).toMatchObject({
          hostId,
          status: 'active',
          settings: requestData.settings,
        });
        expect(response.data.room.roomId).toBeDefined();
        expect(response.data.room.roomCode).toMatch(/^\d{6}$/);
        expect(response.data.room.createdAt).toBeDefined();
      } catch (error) {
        if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
          console.warn('API server is not running. Skipping test.');
          return;
        }
        throw error;
      }
    });

    it('不正なデータでルーム作成が失敗すること', async () => {
      const invalidRequestData = {
        // hostIdなし
        settings: {
          maxCommentsPerUser: -1, // 無効な値
          maxLikesPerUser: 50,
          commentMaxLength: 500,
        },
      };

      try {
        await apiClient.post('/rooms', invalidRequestData);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.code === 'ECONNREFUSED') {
            console.warn('API server is not running. Skipping test.');
            return;
          }
          expect(error.response?.status).toBe(400);
        } else {
          throw error;
        }
      }
    });
  });

  describe('GET /rooms/:roomId - ルーム情報取得', () => {
    let createdRoom: Room;

    beforeEach(async () => {
      // テスト用ルーム作成
      const hostId = generateTestUserId();
      const requestData: CreateRoomRequest = {
        hostId,
        settings: {
          maxCommentsPerUser: 10,
          maxLikesPerUser: 50,
          commentMaxLength: 500,
        },
      };

      try {
        const response = await apiClient.post<CreateRoomResponse>('/rooms', requestData);
        createdRoom = response.data.room;
      } catch (error) {
        if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
          console.warn('API server is not running. Skipping setup.');
          return;
        }
        throw error;
      }
    });

    it('正常にルーム情報を取得できること', async () => {
      if (!createdRoom) {
        console.warn('Room not created. Skipping test.');
        return;
      }

      try {
        const response = await apiClient.get(`/rooms/${createdRoom.roomId}`);

        expect(response.status).toBe(200);
        expect(response.data).toMatchObject({
          roomId: createdRoom.roomId,
          hostId: createdRoom.hostId,
          status: 'active',
        });
      } catch (error) {
        if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
          console.warn('API server is not running. Skipping test.');
          return;
        }
        throw error;
      }
    });

    it('存在しないルームで404エラーが返されること', async () => {
      const nonExistentRoomId = generateTestRoomId();

      try {
        await apiClient.get(`/rooms/${nonExistentRoomId}`);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.code === 'ECONNREFUSED') {
            console.warn('API server is not running. Skipping test.');
            return;
          }
          expect(error.response?.status).toBe(404);
        } else {
          throw error;
        }
      }
    });
  });

  describe('GET /rooms/code/:roomCode - ルームコード検索', () => {
    let createdRoom: Room;

    beforeEach(async () => {
      // テスト用ルーム作成
      const hostId = generateTestUserId();
      const requestData: CreateRoomRequest = {
        hostId,
        settings: {
          maxCommentsPerUser: 10,
          maxLikesPerUser: 50,
          commentMaxLength: 500,
        },
      };

      try {
        const response = await apiClient.post<CreateRoomResponse>('/rooms', requestData);
        createdRoom = response.data.room;
      } catch (error) {
        if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
          console.warn('API server is not running. Skipping setup.');
          return;
        }
        throw error;
      }
    });

    it('ルームコードでルームを検索できること', async () => {
      if (!createdRoom) {
        console.warn('Room not created. Skipping test.');
        return;
      }

      try {
        const response = await apiClient.get(`/rooms/code/${createdRoom.roomCode}`);

        expect(response.status).toBe(200);
        expect(response.data).toMatchObject({
          roomId: createdRoom.roomId,
          roomCode: createdRoom.roomCode,
          status: 'active',
        });
      } catch (error) {
        if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
          console.warn('API server is not running. Skipping test.');
          return;
        }
        throw error;
      }
    });

    it('存在しないルームコードで404エラーが返されること', async () => {
      const nonExistentRoomCode = '999999';

      try {
        await apiClient.get(`/rooms/code/${nonExistentRoomCode}`);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.code === 'ECONNREFUSED') {
            console.warn('API server is not running. Skipping test.');
            return;
          }
          expect(error.response?.status).toBe(404);
        } else {
          throw error;
        }
      }
    });
  });

  describe('DELETE /rooms/:roomId - ルーム終了', () => {
    let createdRoom: Room;

    beforeEach(async () => {
      // テスト用ルーム作成
      const hostId = generateTestUserId();
      const requestData: CreateRoomRequest = {
        hostId,
        settings: {
          maxCommentsPerUser: 10,
          maxLikesPerUser: 50,
          commentMaxLength: 500,
        },
      };

      try {
        const response = await apiClient.post<CreateRoomResponse>('/rooms', requestData);
        createdRoom = response.data.room;
      } catch (error) {
        if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
          console.warn('API server is not running. Skipping setup.');
          return;
        }
        throw error;
      }
    });

    it('ホストがルームを終了できること', async () => {
      if (!createdRoom) {
        console.warn('Room not created. Skipping test.');
        return;
      }

      try {
        const response = await apiClient.delete(`/rooms/${createdRoom.roomId}`, {
          headers: {
            'X-Host-Id': createdRoom.hostId,
          },
        });

        expect(response.status).toBe(200);

        // ルーム状態確認
        const getResponse = await apiClient.get(`/rooms/${createdRoom.roomId}`);
        expect(getResponse.data.status).toBe('closed');
      } catch (error) {
        if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
          console.warn('API server is not running. Skipping test.');
          return;
        }
        throw error;
      }
    });

    it('ホスト以外がルーム終了を試行すると403エラーが返されること', async () => {
      if (!createdRoom) {
        console.warn('Room not created. Skipping test.');
        return;
      }

      const nonHostId = generateTestUserId();

      try {
        await apiClient.delete(`/rooms/${createdRoom.roomId}`, {
          headers: {
            'X-Host-Id': nonHostId,
          },
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        if (axios.isAxiosError(error)) {
          if (error.code === 'ECONNREFUSED') {
            console.warn('API server is not running. Skipping test.');
            return;
          }
          expect(error.response?.status).toBe(403);
        } else {
          throw error;
        }
      }
    });
  });
});
