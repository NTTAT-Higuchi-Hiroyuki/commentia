import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import {
  closeRoomHandler,
  createRoomHandler,
  getRoomByCodeHandler,
  getRoomHandler,
} from '../../src/handlers/room-handler.js';
import { roomService } from '../../src/services/room-service.js';
import { NotFoundError, ValidationError } from '../../src/utils/error-handler.js';

// Mock roomService
jest.mock('../../src/services/room-service.js', () => ({
  roomService: {
    createRoom: jest.fn(),
    getRoom: jest.fn(),
    closeRoom: jest.fn(),
    getRoomByCode: jest.fn(),
  },
}));

const mockRoomService = roomService as jest.Mocked<typeof roomService>;

// Helper function to create mock event
const createMockEvent = (
  body?: string,
  pathParameters?: Record<string, string | undefined>,
  queryStringParameters?: Record<string, string | undefined>
): APIGatewayProxyEvent => ({
  body,
  pathParameters,
  queryStringParameters,
  headers: {},
  multiValueHeaders: {},
  httpMethod: 'POST',
  isBase64Encoded: false,
  path: '/rooms',
  resource: '/rooms',
  requestContext: {
    accountId: '123456789012',
    apiId: 'test-api',
    httpMethod: 'POST',
    path: '/rooms',
    stage: 'test',
    requestId: 'test-request-id',
    requestTime: '2023-01-01T00:00:00.000Z',
    requestTimeEpoch: 1672531200000,
    resourceId: 'test-resource',
    resourcePath: '/rooms',
    protocol: 'HTTP/1.1',
    identity: {
      accessKey: null,
      accountId: null,
      apiKey: null,
      apiKeyId: null,
      caller: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      principalOrgId: null,
      sourceIp: '127.0.0.1',
      user: null,
      userAgent: 'test-agent',
      userArn: null,
      clientCert: null,
    },
    authorizer: null,
  },
  stageVariables: null,
});

const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test-function',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test-function',
  logStreamName: '2023/01/01/[1]test-stream',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

describe('Room Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createRoomHandler', () => {
    test('正常にルームを作成できる', async () => {
      const mockRoom = {
        roomId: 'test-room-id',
        roomCode: 'ABC123',
        hostId: 'host123',
        title: 'Test Room',
        description: 'Test Description',
        settings: {
          maxParticipants: 100,
          commentMaxLength: 500,
          allowAnonymous: true,
          requireApproval: false,
          likesPerComment: 10,
          likesPerUser: 50,
        },
        status: 'active' as const,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockRoomService.createRoom.mockResolvedValue(mockRoom);

      const event = createMockEvent(JSON.stringify({ hostId: 'host123' }));
      const result = await createRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(201);
      expect(JSON.parse(result.body)).toMatchObject({
        room: mockRoom,
        roomUrl: expect.stringContaining(mockRoom.roomId),
        qrCodeUrl: expect.stringContaining('qrserver.com'),
      });
      expect(mockRoomService.createRoom).toHaveBeenCalledWith('host123', undefined);
    });

    test('無効なJSONでValidationErrorを返す', async () => {
      const event = createMockEvent('invalid json');
      const result = await createRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    test('hostIdが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(JSON.stringify({}));
      const result = await createRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    test('roomServiceでエラーが発生した場合にエラーレスポンスを返す', async () => {
      mockRoomService.createRoom.mockRejectedValue(new Error('Database error'));

      const event = createMockEvent(JSON.stringify({ hostId: 'host123' }));
      const result = await createRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INTERNAL_ERROR');
    });
  });

  describe('getRoomHandler', () => {
    test('正常にルーム情報を取得できる', async () => {
      const mockRoom = {
        roomId: 'test-room-id',
        roomCode: 'ABC123',
        hostId: 'host123',
        title: 'Test Room',
        description: 'Test Description',
        settings: {
          maxParticipants: 100,
          commentMaxLength: 500,
          allowAnonymous: true,
          requireApproval: false,
          likesPerComment: 10,
          likesPerUser: 50,
        },
        status: 'active' as const,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockRoomService.getRoom.mockResolvedValue(mockRoom);

      const event = createMockEvent(undefined, { roomId: 'test-room-id' });
      const result = await getRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({ data: mockRoom });
      expect(mockRoomService.getRoom).toHaveBeenCalledWith('test-room-id');
    });

    test('roomIdが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(undefined, {});
      const result = await getRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    test('存在しないルームでNotFoundErrorを返す', async () => {
      mockRoomService.getRoom.mockRejectedValue(new NotFoundError('Room not found'));

      const event = createMockEvent(undefined, { roomId: 'non-existent' });
      const result = await getRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('NOT_FOUND');
    });
  });

  describe('closeRoomHandler', () => {
    test('正常にルームを閉じることができる', async () => {
      mockRoomService.closeRoom.mockResolvedValue();

      const event = createMockEvent(JSON.stringify({ hostId: 'host123' }), {
        roomId: 'test-room-id',
      });
      const result = await closeRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({ success: true });
      expect(mockRoomService.closeRoom).toHaveBeenCalledWith('test-room-id', 'host123');
    });

    test('roomIdが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(JSON.stringify({ hostId: 'host123' }), {});
      const result = await closeRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    test('hostIdが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(JSON.stringify({}), {
        roomId: 'test-room-id',
      });
      const result = await closeRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('getRoomByCodeHandler', () => {
    test('正常にルームコードでルームを取得できる', async () => {
      const mockRoom = {
        roomId: 'test-room-id',
        roomCode: 'ABC123',
        hostId: 'host123',
        title: 'Test Room',
        description: 'Test Description',
        settings: {
          maxParticipants: 100,
          commentMaxLength: 500,
          allowAnonymous: true,
          requireApproval: false,
          likesPerComment: 10,
          likesPerUser: 50,
        },
        status: 'active' as const,
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      mockRoomService.getRoomByCode.mockResolvedValue(mockRoom);

      const event = createMockEvent(undefined, { roomCode: 'ABC123' });
      const result = await getRoomByCodeHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({ data: mockRoom });
      expect(mockRoomService.getRoomByCode).toHaveBeenCalledWith('ABC123');
    });

    test('ルームコードが不足している場合にValidationErrorを返す', async () => {
      const event = createMockEvent(undefined, {});
      const result = await getRoomByCodeHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('VALIDATION_ERROR');
    });

    test('存在しないルームコードでNotFoundErrorを返す', async () => {
      mockRoomService.getRoomByCode.mockRejectedValue(new NotFoundError('Room not found'));

      const event = createMockEvent(undefined, { roomCode: 'XYZ999' });
      const result = await getRoomByCodeHandler(event, mockContext);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('NOT_FOUND');
    });
  });
});
