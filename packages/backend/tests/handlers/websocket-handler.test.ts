import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { APIGatewayProxyWebsocketEventV2, Context } from 'aws-lambda';
import {
  connectHandler,
  disconnectHandler,
  joinRoomHandler,
  leaveRoomHandler,
  webSocketApiHandler,
} from '../../src/handlers/websocket-handler.js';
import { webSocketService } from '../../src/services/websocket-service.js';

// Mock webSocketService
jest.mock('../../src/services/websocket-service.js', () => ({
  webSocketService: {
    handleConnect: jest.fn(),
    handleDisconnect: jest.fn(),
    joinRoom: jest.fn(),
    leaveRoom: jest.fn(),
    getConnection: jest.fn(),
    broadcast: jest.fn(),
    sendToConnection: jest.fn(),
  },
}));

const mockWebSocketService = webSocketService as jest.Mocked<typeof webSocketService>;

// Helper function to create mock WebSocket event
const createMockWebSocketEvent = (
  routeKey: string,
  body?: string,
  connectionId = 'test-connection-id'
): APIGatewayProxyWebsocketEventV2 => ({
  requestContext: {
    routeKey,
    connectionId,
    messageId: 'test-message-id',
    apiId: 'test-api-id',
    domainName: 'test-domain.execute-api.us-east-1.amazonaws.com',
    stage: 'test',
    requestId: 'test-request-id',
    requestTime: '2023-01-01T00:00:00.000Z',
    requestTimeEpoch: 1672531200000,
    identity: {
      sourceIp: '127.0.0.1',
      userAgent: 'test-agent',
    },
    messageDirection: 'IN',
    eventType: 'MESSAGE',
    extendedRequestId: 'test-extended-request-id',
  },
  body,
  isBase64Encoded: false,
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

describe('WebSocket Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('connectHandler', () => {
    test('正常に接続を処理できる', async () => {
      mockWebSocketService.handleConnect.mockResolvedValue();

      const event = createMockWebSocketEvent('$connect');
      const result = await connectHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(result.body).toBeDefined();
      const body = JSON.parse(result.body!);
      expect(body.message).toBe('Connected successfully');
      expect(mockWebSocketService.handleConnect).toHaveBeenCalledWith('test-connection-id');
    });

    test('接続処理でエラーが発生した場合にエラーを返す', async () => {
      mockWebSocketService.handleConnect.mockRejectedValue(new Error('Connection failed'));

      const event = createMockWebSocketEvent('$connect');
      const result = await connectHandler(event, mockContext);

      expect(result.statusCode).toBe(500);
      expect(result.body).toBeDefined();
      const body = JSON.parse(result.body!);
      expect(body.error).toBeDefined();
    });
  });

  describe('disconnectHandler', () => {
    test('正常に切断を処理できる', async () => {
      mockWebSocketService.handleDisconnect.mockResolvedValue();

      const event = createMockWebSocketEvent('$disconnect');
      const result = await disconnectHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(result.body).toBeDefined();
      const body = JSON.parse(result.body!);
      expect(body.message).toBe('Disconnected successfully');
      expect(mockWebSocketService.handleDisconnect).toHaveBeenCalledWith('test-connection-id');
    });

    test('切断処理でエラーが発生した場合にエラーを返す', async () => {
      mockWebSocketService.handleDisconnect.mockRejectedValue(new Error('Disconnect failed'));

      const event = createMockWebSocketEvent('$disconnect');
      const result = await disconnectHandler(event, mockContext);

      expect(result.statusCode).toBe(500);
      expect(result.body).toBeDefined();
      const body = JSON.parse(result.body!);
      expect(body.error).toBeDefined();
    });
  });

  describe('joinRoomHandler', () => {
    test('正常にルーム参加を処理できる', async () => {
      mockWebSocketService.joinRoom.mockResolvedValue();

      const messageBody = JSON.stringify({
        roomId: 'room-123',
        userName: 'Test User',
      });

      const event = createMockWebSocketEvent('joinRoom', messageBody);
      const result = await joinRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(result.body).toBeDefined();
      const body = JSON.parse(result.body!);
      expect(body.message).toBe('Joined room successfully');
      expect(body.roomId).toBe('room-123');
      expect(body.userName).toBe('Test User');
      expect(mockWebSocketService.joinRoom).toHaveBeenCalledWith('test-connection-id', {
        roomId: 'room-123',
        userName: 'Test User',
      });
    });

    test('roomIdが欠落している場合にバリデーションエラーを返す', async () => {
      const messageBody = JSON.stringify({
        userName: 'Test User',
      });

      const event = createMockWebSocketEvent('joinRoom', messageBody);
      const result = await joinRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBeDefined();
      const body = JSON.parse(result.body!);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('Room ID is required');
      expect(mockWebSocketService.joinRoom).not.toHaveBeenCalled();
    });

    test('userNameが欠落している場合にバリデーションエラーを返す', async () => {
      const messageBody = JSON.stringify({
        roomId: 'room-123',
      });

      const event = createMockWebSocketEvent('joinRoom', messageBody);
      const result = await joinRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBeDefined();
      const body = JSON.parse(result.body!);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('User name is required');
      expect(mockWebSocketService.joinRoom).not.toHaveBeenCalled();
    });

    test('ルーム参加処理でエラーが発生した場合にエラーを返す', async () => {
      mockWebSocketService.joinRoom.mockRejectedValue(new Error('Join room failed'));

      const messageBody = JSON.stringify({
        roomId: 'room-123',
        userName: 'Test User',
      });

      const event = createMockWebSocketEvent('joinRoom', messageBody);
      const result = await joinRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(500);
      expect(result.body).toBeDefined();
      const body = JSON.parse(result.body!);
      expect(body.error).toBeDefined();
    });

    test('空のメッセージボディでバリデーションエラーを返す', async () => {
      const event = createMockWebSocketEvent('joinRoom');
      const result = await joinRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBeDefined();
      const body = JSON.parse(result.body!);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('Room ID is required');
      expect(mockWebSocketService.joinRoom).not.toHaveBeenCalled();
    });
  });

  describe('leaveRoomHandler', () => {
    test('正常にルーム退出を処理できる', async () => {
      mockWebSocketService.getConnection.mockResolvedValue({
        connectionId: 'test-connection-id',
        roomId: 'room-123',
        userId: 'user-123',
        userName: 'Test User',
        connectedAt: '2023-01-01T00:00:00.000Z',
      });
      mockWebSocketService.leaveRoom.mockResolvedValue();

      const messageBody = JSON.stringify({
        roomId: 'room-123',
      });

      const event = createMockWebSocketEvent('leaveRoom', messageBody);
      const result = await leaveRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(result.body).toBeDefined();
      const body = JSON.parse(result.body!);
      expect(body.message).toBe('Left room successfully');
      expect(body.roomId).toBe('room-123');
      expect(mockWebSocketService.getConnection).toHaveBeenCalledWith('test-connection-id');
      expect(mockWebSocketService.leaveRoom).toHaveBeenCalledWith(
        'test-connection-id',
        'room-123',
        'Test User'
      );
    });

    test('roomIdが欠落している場合にバリデーションエラーを返す', async () => {
      const messageBody = JSON.stringify({});

      const event = createMockWebSocketEvent('leaveRoom', messageBody);
      const result = await leaveRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBeDefined();
      const body = JSON.parse(result.body!);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('Room ID is required');
      expect(mockWebSocketService.getConnection).not.toHaveBeenCalled();
      expect(mockWebSocketService.leaveRoom).not.toHaveBeenCalled();
    });

    test('アクティブなルーム接続が見つからない場合にエラーを返す', async () => {
      mockWebSocketService.getConnection.mockResolvedValue(null);

      const messageBody = JSON.stringify({
        roomId: 'room-123',
      });

      const event = createMockWebSocketEvent('leaveRoom', messageBody);
      const result = await leaveRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBeDefined();
      const body = JSON.parse(result.body!);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('No active room connection found');
      expect(mockWebSocketService.leaveRoom).not.toHaveBeenCalled();
    });

    test('ルーム退出処理でエラーが発生した場合にエラーを返す', async () => {
      mockWebSocketService.getConnection.mockResolvedValue({
        connectionId: 'test-connection-id',
        roomId: 'room-123',
        userId: 'user-123',
        userName: 'Test User',
        connectedAt: '2023-01-01T00:00:00.000Z',
      });
      mockWebSocketService.leaveRoom.mockRejectedValue(new Error('Leave room failed'));

      const messageBody = JSON.stringify({
        roomId: 'room-123',
      });

      const event = createMockWebSocketEvent('leaveRoom', messageBody);
      const result = await leaveRoomHandler(event, mockContext);

      expect(result.statusCode).toBe(500);
      expect(result.body).toBeDefined();
      const body = JSON.parse(result.body!);
      expect(body.error).toBeDefined();
    });
  });

  describe('webSocketApiHandler', () => {
    test('$connectルートを正しくルーティングする', async () => {
      mockWebSocketService.handleConnect.mockResolvedValue();

      const event = createMockWebSocketEvent('$connect');
      const result = await webSocketApiHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(mockWebSocketService.handleConnect).toHaveBeenCalledWith('test-connection-id');
    });

    test('$disconnectルートを正しくルーティングする', async () => {
      mockWebSocketService.handleDisconnect.mockResolvedValue();

      const event = createMockWebSocketEvent('$disconnect');
      const result = await webSocketApiHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(mockWebSocketService.handleDisconnect).toHaveBeenCalledWith('test-connection-id');
    });

    test('joinRoomルートを正しくルーティングする', async () => {
      mockWebSocketService.joinRoom.mockResolvedValue();

      const messageBody = JSON.stringify({
        roomId: 'room-123',
        userName: 'Test User',
      });

      const event = createMockWebSocketEvent('joinRoom', messageBody);
      const result = await webSocketApiHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(mockWebSocketService.joinRoom).toHaveBeenCalledWith('test-connection-id', {
        roomId: 'room-123',
        userName: 'Test User',
      });
    });

    test('leaveRoomルートを正しくルーティングする', async () => {
      mockWebSocketService.getConnection.mockResolvedValue({
        connectionId: 'test-connection-id',
        roomId: 'room-123',
        userId: 'user-123',
        userName: 'Test User',
        connectedAt: '2023-01-01T00:00:00.000Z',
      });
      mockWebSocketService.leaveRoom.mockResolvedValue();

      const messageBody = JSON.stringify({
        roomId: 'room-123',
      });

      const event = createMockWebSocketEvent('leaveRoom', messageBody);
      const result = await webSocketApiHandler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(mockWebSocketService.leaveRoom).toHaveBeenCalledWith(
        'test-connection-id',
        'room-123',
        'Test User'
      );
    });

    test('不明なルートに対してデフォルトハンドラーを使用する', async () => {
      const event = createMockWebSocketEvent('unknownRoute');
      const result = await webSocketApiHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBeDefined();
      const body = JSON.parse(result.body!);
      expect(body.error).toBe('UNKNOWN_ROUTE');
      expect(body.message).toBe('Unknown route: unknownRoute');
    });

    test('ハンドラー内でエラーが発生した場合に適切なエラーレスポンスを返す', async () => {
      mockWebSocketService.handleConnect.mockRejectedValue(new Error('Unexpected error'));

      const event = createMockWebSocketEvent('$connect');
      const result = await webSocketApiHandler(event, mockContext);

      expect(result.statusCode).toBe(500);
      expect(result.body).toBeDefined();
      const body = JSON.parse(result.body!);
      expect(body.error).toBeDefined();
      expect(body.requestId).toBe('test-request-id');
    });
  });
});
