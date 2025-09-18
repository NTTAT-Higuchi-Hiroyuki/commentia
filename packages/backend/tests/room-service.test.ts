import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Room, RoomItem } from '@commentia/shared';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { RoomService } from '../src/services/room-service.js';
import { CommentiaError, NotFoundError, ValidationError } from '../src/utils/error-handler.js';

const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('RoomService', () => {
  let roomService: RoomService;

  beforeEach(() => {
    dynamoMock.reset();
    roomService = new RoomService();
    jest.clearAllMocks();
  });

  describe('createRoom', () => {
    test('正常にルームを作成できる', async () => {
      const hostId = 'host123';
      const mockRoomCode = 'ABC123';
      const mockRoomId = '1234567890-abcdef';

      // generateRoomId と generateRoomCode をモック
      jest.spyOn(roomService as any, 'generateRoomId').mockReturnValue(mockRoomId);
      jest.spyOn(roomService as any, 'generateRoomCode').mockReturnValue(mockRoomCode);
      jest.spyOn(roomService as any, 'validateRoomCodeUnique').mockResolvedValue(undefined);

      dynamoMock.on(PutCommand).resolves({});

      const result = await roomService.createRoom(hostId);

      expect(result).toMatchObject({
        roomId: mockRoomId,
        roomCode: mockRoomCode,
        hostId,
        status: 'active',
        settings: {
          maxCommentsPerUser: 50,
          maxLikesPerUser: 100,
          commentMaxLength: 500,
        },
      });

      expect(dynamoMock.commandCalls(PutCommand)).toHaveLength(1);
      const putCall = dynamoMock.commandCalls(PutCommand)[0];
      expect(putCall.args[0].input.Item).toMatchObject({
        PK: `ROOM#${mockRoomId}`,
        SK: 'METADATA',
        roomId: mockRoomId,
        roomCode: mockRoomCode,
        hostId,
        status: 'active',
      });
    });

    test('カスタム設定でルームを作成できる', async () => {
      const hostId = 'host123';
      const customSettings = {
        maxCommentsPerUser: 30,
        commentMaxLength: 300,
      };

      jest.spyOn(roomService as any, 'generateRoomId').mockReturnValue('test-room-id');
      jest.spyOn(roomService as any, 'generateRoomCode').mockReturnValue('TEST01');
      jest.spyOn(roomService as any, 'validateRoomCodeUnique').mockResolvedValue(undefined);

      dynamoMock.on(PutCommand).resolves({});

      const result = await roomService.createRoom(hostId, customSettings);

      expect(result.settings).toEqual({
        maxCommentsPerUser: 30,
        maxLikesPerUser: 100, // デフォルト値
        commentMaxLength: 300,
      });
    });

    test('無効なHostIDでエラーを投げる', async () => {
      await expect(roomService.createRoom('')).rejects.toThrow(ValidationError);
      await expect(roomService.createRoom('   ')).rejects.toThrow(ValidationError);
    });

    test('ルームコードが重複している場合にエラーを投げる', async () => {
      const hostId = 'host123';

      jest.spyOn(roomService as any, 'generateRoomId').mockReturnValue('test-room-id');
      jest.spyOn(roomService as any, 'generateRoomCode').mockReturnValue('TEST01');
      jest
        .spyOn(roomService as any, 'validateRoomCodeUnique')
        .mockRejectedValue(new CommentiaError('Room code already exists', 409, 'ROOM_CODE_EXISTS'));

      await expect(roomService.createRoom(hostId)).rejects.toThrow(CommentiaError);
    });

    test('DynamoDBエラーでルーム作成に失敗', async () => {
      const hostId = 'host123';

      jest.spyOn(roomService as any, 'generateRoomId').mockReturnValue('test-room-id');
      jest.spyOn(roomService as any, 'generateRoomCode').mockReturnValue('TEST01');
      jest.spyOn(roomService as any, 'validateRoomCodeUnique').mockResolvedValue(undefined);

      dynamoMock.on(PutCommand).rejects(new Error('DynamoDB Error'));

      await expect(roomService.createRoom(hostId)).rejects.toThrow('DynamoDB Error');
    });
  });

  describe('getRoom', () => {
    test('正常にルーム情報を取得できる', async () => {
      const roomId = 'test-room-id';
      const mockRoomItem: RoomItem = {
        PK: `ROOM#${roomId}`,
        SK: 'METADATA',
        roomId,
        roomCode: 'ABC123',
        hostId: 'host123',
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'active',
        settings: {
          maxCommentsPerUser: 50,
          maxLikesPerUser: 100,
          commentMaxLength: 500,
        },
        ttl: 1234567890,
      };

      dynamoMock.on(GetCommand).resolves({ Item: mockRoomItem });

      const result = await roomService.getRoom(roomId);

      expect(result).toEqual({
        roomId,
        roomCode: 'ABC123',
        hostId: 'host123',
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'active',
        settings: {
          maxCommentsPerUser: 50,
          maxLikesPerUser: 100,
          commentMaxLength: 500,
        },
      });

      expect(dynamoMock.commandCalls(GetCommand)).toHaveLength(1);
    });

    test('存在しないルームでNotFoundErrorを投げる', async () => {
      const roomId = 'non-existent-room';

      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      await expect(roomService.getRoom(roomId)).rejects.toThrow(NotFoundError);
    });

    test('閉じられたルームでエラーを投げる', async () => {
      const roomId = 'closed-room';
      const mockRoomItem: RoomItem = {
        PK: `ROOM#${roomId}`,
        SK: 'METADATA',
        roomId,
        roomCode: 'ABC123',
        hostId: 'host123',
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'closed',
        settings: {
          maxCommentsPerUser: 50,
          maxLikesPerUser: 100,
          commentMaxLength: 500,
        },
        ttl: 1234567890,
      };

      dynamoMock.on(GetCommand).resolves({ Item: mockRoomItem });

      await expect(roomService.getRoom(roomId)).rejects.toThrow(
        new CommentiaError('Room is closed', 410, 'ROOM_CLOSED')
      );
    });

    test('無効なRoom IDでValidationErrorを投げる', async () => {
      await expect(roomService.getRoom('')).rejects.toThrow(ValidationError);
    });
  });

  describe('closeRoom', () => {
    test('正常にルームを閉じることができる', async () => {
      const roomId = 'test-room-id';
      const hostId = 'host123';

      const mockRoom: Room = {
        roomId,
        roomCode: 'ABC123',
        hostId,
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'active',
        settings: {
          maxCommentsPerUser: 50,
          maxLikesPerUser: 100,
          commentMaxLength: 500,
        },
      };

      jest.spyOn(roomService, 'getRoom').mockResolvedValue(mockRoom);
      dynamoMock.on(UpdateCommand).resolves({});

      await roomService.closeRoom(roomId, hostId);

      expect(dynamoMock.commandCalls(UpdateCommand)).toHaveLength(1);
      const updateCall = dynamoMock.commandCalls(UpdateCommand)[0];
      expect(updateCall.args[0].input.UpdateExpression).toContain(
        'SET #status = :status, #closedAt = :closedAt'
      );
      expect(updateCall.args[0].input.ExpressionAttributeValues).toMatchObject({
        ':status': 'closed',
        ':hostId': hostId,
      });
    });

    test('ホスト以外がルームを閉じようとするとエラーを投げる', async () => {
      const roomId = 'test-room-id';
      const hostId = 'host123';
      const otherUserId = 'other456';

      const mockRoom: Room = {
        roomId,
        roomCode: 'ABC123',
        hostId,
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'active',
        settings: {
          maxCommentsPerUser: 50,
          maxLikesPerUser: 100,
          commentMaxLength: 500,
        },
      };

      jest.spyOn(roomService, 'getRoom').mockResolvedValue(mockRoom);

      await expect(roomService.closeRoom(roomId, otherUserId)).rejects.toThrow(
        new CommentiaError('Only room host can close the room', 403, 'FORBIDDEN')
      );
    });

    test('既に閉じられたルームでエラーを投げる', async () => {
      const roomId = 'test-room-id';
      const hostId = 'host123';

      const mockRoom: Room = {
        roomId,
        roomCode: 'ABC123',
        hostId,
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'closed',
        settings: {
          maxCommentsPerUser: 50,
          maxLikesPerUser: 100,
          commentMaxLength: 500,
        },
      };

      jest.spyOn(roomService, 'getRoom').mockResolvedValue(mockRoom);

      await expect(roomService.closeRoom(roomId, hostId)).rejects.toThrow(
        new CommentiaError('Room is already closed', 409, 'ROOM_ALREADY_CLOSED')
      );
    });

    test('無効なパラメータでValidationErrorを投げる', async () => {
      await expect(roomService.closeRoom('', 'host123')).rejects.toThrow(ValidationError);
      await expect(roomService.closeRoom('room123', '')).rejects.toThrow(ValidationError);
    });
  });

  describe('getRoomByCode', () => {
    test('正常にルームコードでルームを取得できる', async () => {
      const roomCode = 'ABC123';
      const mockRoomItem: RoomItem = {
        PK: 'ROOM#test-room-id',
        SK: 'METADATA',
        roomId: 'test-room-id',
        roomCode,
        hostId: 'host123',
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'active',
        settings: {
          maxCommentsPerUser: 50,
          maxLikesPerUser: 100,
          commentMaxLength: 500,
        },
        ttl: 1234567890,
      };

      dynamoMock.on(ScanCommand).resolves({ Items: [mockRoomItem] });

      const result = await roomService.getRoomByCode(roomCode);

      expect(result.roomCode).toBe(roomCode);
      expect(result.roomId).toBe('test-room-id');

      expect(dynamoMock.commandCalls(ScanCommand)).toHaveLength(1);
      const scanCall = dynamoMock.commandCalls(ScanCommand)[0];
      expect(scanCall.args[0].input.FilterExpression).toBe(
        'roomCode = :roomCode AND #status = :status'
      );
      expect(scanCall.args[0].input.ExpressionAttributeValues).toMatchObject({
        ':roomCode': roomCode.toUpperCase(),
        ':status': 'active',
      });
    });

    test('存在しないルームコードでNotFoundErrorを投げる', async () => {
      const roomCode = 'XYZ999';

      dynamoMock.on(ScanCommand).resolves({ Items: [] });

      await expect(roomService.getRoomByCode(roomCode)).rejects.toThrow(NotFoundError);
    });

    test('無効なルームコード形式でValidationErrorを投げる', async () => {
      await expect(roomService.getRoomByCode('')).rejects.toThrow(ValidationError);
      await expect(roomService.getRoomByCode('ABC')).rejects.toThrow(ValidationError);
      await expect(roomService.getRoomByCode('ABCDEFG')).rejects.toThrow(ValidationError);
    });
  });

  describe('generateRoomCode', () => {
    test('6文字のルームコードを生成する', () => {
      const roomCode = (roomService as any).generateRoomCode();
      expect(roomCode).toHaveLength(6);
      expect(roomCode).toMatch(/^[123456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/);
    });

    test('混同しやすい文字を含まない', () => {
      // 複数回テストして確率的に確認
      for (let i = 0; i < 100; i++) {
        const roomCode = (roomService as any).generateRoomCode();
        expect(roomCode).not.toMatch(/[0OIL]/);
      }
    });
  });

  describe('generateRoomId', () => {
    test('ユニークなルームIDを生成する', () => {
      const roomId1 = (roomService as any).generateRoomId();
      const roomId2 = (roomService as any).generateRoomId();

      expect(roomId1).not.toBe(roomId2);
      expect(roomId1).toMatch(/^\d+-[a-z0-9]+$/);
      expect(roomId2).toMatch(/^\d+-[a-z0-9]+$/);
    });
  });

  describe('validateRoomCodeUnique', () => {
    test('ユニークなルームコードで正常に処理される', async () => {
      const roomCode = 'UNIQUE';

      jest
        .spyOn(roomService, 'getRoomByCode')
        .mockRejectedValue(new NotFoundError('Room with provided code'));

      await expect((roomService as any).validateRoomCodeUnique(roomCode)).resolves.toBeUndefined();
    });

    test('重複するルームコードでエラーを投げる', async () => {
      const roomCode = 'DUPLICATE';
      const mockRoom: Room = {
        roomId: 'existing-room',
        roomCode,
        hostId: 'host123',
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'active',
        settings: {
          maxCommentsPerUser: 50,
          maxLikesPerUser: 100,
          commentMaxLength: 500,
        },
      };

      jest.spyOn(roomService, 'getRoomByCode').mockResolvedValue(mockRoom);

      await expect((roomService as any).validateRoomCodeUnique(roomCode)).rejects.toThrow(
        new CommentiaError('Room code already exists', 409, 'ROOM_CODE_EXISTS')
      );
    });
  });

  describe('convertToRoom', () => {
    test('RoomItemをRoomに正しく変換する', () => {
      const roomItem: RoomItem = {
        PK: 'ROOM#test-room-id',
        SK: 'METADATA',
        roomId: 'test-room-id',
        roomCode: 'ABC123',
        hostId: 'host123',
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'active',
        settings: {
          maxCommentsPerUser: 50,
          maxLikesPerUser: 100,
          commentMaxLength: 500,
        },
        ttl: 1234567890,
      };

      const result = (roomService as any).convertToRoom(roomItem);

      expect(result).toEqual({
        roomId: 'test-room-id',
        roomCode: 'ABC123',
        hostId: 'host123',
        createdAt: '2024-01-01T00:00:00.000Z',
        status: 'active',
        settings: {
          maxCommentsPerUser: 50,
          maxLikesPerUser: 100,
          commentMaxLength: 500,
        },
      });

      // PK, SK, ttlは除外されることを確認
      expect(result).not.toHaveProperty('PK');
      expect(result).not.toHaveProperty('SK');
      expect(result).not.toHaveProperty('ttl');
    });
  });
});
