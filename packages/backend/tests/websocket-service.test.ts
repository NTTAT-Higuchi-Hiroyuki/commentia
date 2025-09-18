import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Connection, ConnectionItem, JoinRoomRequest, WSMessage } from '@commentia/shared';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { WebSocketService } from '../src/services/websocket-service.js';
import {
  CommentiaError,
  NotFoundError,
  ValidationError,
  WebSocketError,
} from '../src/utils/error-handler.js';

const dynamoMock = mockClient(DynamoDBDocumentClient);
const wsApiMock = mockClient(ApiGatewayManagementApiClient);

describe('WebSocketService', () => {
  let webSocketService: WebSocketService;

  beforeEach(() => {
    dynamoMock.reset();
    wsApiMock.reset();
    webSocketService = new WebSocketService('ws://localhost:3001');
    jest.clearAllMocks();
  });

  describe('handleConnect', () => {
    const connectionId = 'test-connection-id';

    test('正常にWebSocket接続を処理できる', async () => {
      dynamoMock.on(PutCommand).resolves({});

      await webSocketService.handleConnect(connectionId);

      expect(dynamoMock.commandCalls(PutCommand)).toHaveLength(1);
      const putCall = dynamoMock.commandCalls(PutCommand)[0];
      expect(putCall.args[0].input.Item).toMatchObject({
        PK: `CONN#${connectionId}`,
        SK: 'METADATA',
        connectionId,
        roomId: '',
        userId: '',
        userName: '',
      });
    });

    test('DynamoDBエラーでWebSocketErrorを投げる', async () => {
      dynamoMock.on(PutCommand).rejects(new Error('DynamoDB Error'));

      await expect(webSocketService.handleConnect(connectionId)).rejects.toThrow(
        new WebSocketError('Failed to establish connection', 'CONNECTION_ERROR')
      );
    });
  });

  describe('handleDisconnect', () => {
    const connectionId = 'test-connection-id';
    const mockConnection: Connection = {
      connectionId,
      roomId: 'room123',
      userId: 'user123',
      userName: 'TestUser',
      connectedAt: '2024-01-01T00:00:00.000Z',
    };

    test('正常にWebSocket切断を処理できる', async () => {
      jest.spyOn(webSocketService, 'getConnection').mockResolvedValue(mockConnection);
      jest.spyOn(webSocketService, 'leaveRoom').mockResolvedValue(undefined);
      dynamoMock.on(DeleteCommand).resolves({});

      await webSocketService.handleDisconnect(connectionId);

      expect(dynamoMock.commandCalls(DeleteCommand)).toHaveLength(1);
      const deleteCall = dynamoMock.commandCalls(DeleteCommand)[0];
      expect(deleteCall.args[0].input.Key).toEqual({
        PK: `CONN#${connectionId}`,
        SK: 'METADATA',
      });
    });

    test('ルームに参加していない場合でも正常に処理される', async () => {
      const connectionWithoutRoom: Connection = {
        ...mockConnection,
        roomId: '',
      };

      jest.spyOn(webSocketService, 'getConnection').mockResolvedValue(connectionWithoutRoom);
      dynamoMock.on(DeleteCommand).resolves({});

      await webSocketService.handleDisconnect(connectionId);

      expect(dynamoMock.commandCalls(DeleteCommand)).toHaveLength(1);
    });

    test('接続情報が存在しない場合でも正常に処理される', async () => {
      jest.spyOn(webSocketService, 'getConnection').mockResolvedValue(null);
      dynamoMock.on(DeleteCommand).resolves({});

      await webSocketService.handleDisconnect(connectionId);

      expect(dynamoMock.commandCalls(DeleteCommand)).toHaveLength(1);
    });

    test('エラーが発生しても例外を投げない', async () => {
      jest.spyOn(webSocketService, 'getConnection').mockRejectedValue(new Error('Test Error'));

      await expect(webSocketService.handleDisconnect(connectionId)).resolves.toBeUndefined();
    });
  });

  describe('joinRoom', () => {
    const connectionId = 'test-connection-id';
    const validRequest: JoinRoomRequest = {
      roomId: 'room123',
      userName: 'TestUser',
    };

    const _mockRoom = {
      PK: 'ROOM#room123',
      SK: 'METADATA',
      status: 'active',
    };

    test('正常にルームに参加できる', async () => {
      jest.spyOn(webSocketService as any, 'validateJoinRoomRequest').mockImplementation(() => {});
      jest.spyOn(webSocketService as any, 'validateRoomExists').mockResolvedValue(undefined);
      jest.spyOn(webSocketService as any, 'getRoomUserCount').mockResolvedValue(3);
      jest.spyOn(webSocketService, 'broadcast').mockResolvedValue(undefined);

      dynamoMock.on(PutCommand).resolves({});

      await webSocketService.joinRoom(connectionId, validRequest);

      expect(dynamoMock.commandCalls(PutCommand)).toHaveLength(1);
      const putCall = dynamoMock.commandCalls(PutCommand)[0];
      expect(putCall.args[0].input.Item).toMatchObject({
        PK: `CONN#${connectionId}`,
        SK: 'METADATA',
        GSI1PK: `ROOM#${validRequest.roomId}`,
        connectionId,
        roomId: validRequest.roomId,
        userName: validRequest.userName,
      });
      expect(putCall.args[0].input.ConditionExpression).toBe('attribute_exists(PK)');
    });

    test('無効なリクエストでValidationErrorを投げる', async () => {
      const invalidRequest = { roomId: '', userName: 'TestUser' };

      await expect(webSocketService.joinRoom(connectionId, invalidRequest)).rejects.toThrow(
        ValidationError
      );
    });

    test('存在しないルームでNotFoundErrorを投げる', async () => {
      jest.spyOn(webSocketService as any, 'validateJoinRoomRequest').mockImplementation(() => {});
      jest
        .spyOn(webSocketService as any, 'validateRoomExists')
        .mockRejectedValue(new NotFoundError('Room not found'));

      await expect(webSocketService.joinRoom(connectionId, validRequest)).rejects.toThrow(
        NotFoundError
      );
    });

    test('DynamoDBエラーでWebSocketErrorを投げる', async () => {
      jest.spyOn(webSocketService as any, 'validateJoinRoomRequest').mockImplementation(() => {});
      jest.spyOn(webSocketService as any, 'validateRoomExists').mockResolvedValue(undefined);

      dynamoMock.on(PutCommand).rejects(new Error('DynamoDB Error'));

      await expect(webSocketService.joinRoom(connectionId, validRequest)).rejects.toThrow(
        new WebSocketError('Failed to join room', 'JOIN_ROOM_ERROR')
      );
    });
  });

  describe('leaveRoom', () => {
    const connectionId = 'test-connection-id';
    const roomId = 'room123';
    const userName = 'TestUser';

    test('正常にルームから退出できる', async () => {
      jest.spyOn(webSocketService as any, 'getRoomUserCount').mockResolvedValue(2);
      jest.spyOn(webSocketService, 'broadcast').mockResolvedValue(undefined);

      dynamoMock.on(DeleteCommand).resolves({});

      await webSocketService.leaveRoom(connectionId, roomId, userName);

      expect(dynamoMock.commandCalls(DeleteCommand)).toHaveLength(1);
      const deleteCall = dynamoMock.commandCalls(DeleteCommand)[0];
      expect(deleteCall.args[0].input.Key).toEqual({
        PK: `CONN#${connectionId}`,
        SK: 'METADATA',
      });
    });

    test('DynamoDBエラーでWebSocketErrorを投げる', async () => {
      dynamoMock.on(DeleteCommand).rejects(new Error('DynamoDB Error'));

      await expect(webSocketService.leaveRoom(connectionId, roomId, userName)).rejects.toThrow(
        new WebSocketError('Failed to leave room', 'LEAVE_ROOM_ERROR')
      );
    });
  });

  describe('broadcast', () => {
    const roomId = 'room123';
    const message: WSMessage = {
      type: 'comment_posted',
      data: { content: 'Test message' },
    };

    const mockConnections: Connection[] = [
      {
        connectionId: 'conn1',
        roomId,
        userId: 'user1',
        userName: 'User1',
        connectedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        connectionId: 'conn2',
        roomId,
        userId: 'user2',
        userName: 'User2',
        connectedAt: '2024-01-01T00:00:00.000Z',
      },
    ];

    test('正常にルーム内全体にメッセージを配信できる', async () => {
      jest.spyOn(webSocketService as any, 'getRoomConnections').mockResolvedValue(mockConnections);
      wsApiMock.on(PostToConnectionCommand).resolves({});

      await webSocketService.broadcast(roomId, message);

      expect(wsApiMock.commandCalls(PostToConnectionCommand)).toHaveLength(2);
      const postCalls = wsApiMock.commandCalls(PostToConnectionCommand);
      expect(postCalls[0].args[0].input.ConnectionId).toBe('conn1');
      expect(postCalls[1].args[0].input.ConnectionId).toBe('conn2');
      expect(JSON.parse(postCalls[0].args[0].input.Data as string)).toEqual(message);
    });

    test('除外する接続を正しく処理する', async () => {
      jest.spyOn(webSocketService as any, 'getRoomConnections').mockResolvedValue(mockConnections);
      wsApiMock.on(PostToConnectionCommand).resolves({});

      await webSocketService.broadcast(roomId, message, ['conn1']);

      expect(wsApiMock.commandCalls(PostToConnectionCommand)).toHaveLength(1);
      const postCall = wsApiMock.commandCalls(PostToConnectionCommand)[0];
      expect(postCall.args[0].input.ConnectionId).toBe('conn2');
    });

    test('ルームに接続がない場合は何もしない', async () => {
      jest.spyOn(webSocketService as any, 'getRoomConnections').mockResolvedValue([]);

      await webSocketService.broadcast(roomId, message);

      expect(wsApiMock.commandCalls(PostToConnectionCommand)).toHaveLength(0);
    });

    test('GoneExceptionで無効な接続を自動削除する', async () => {
      jest.spyOn(webSocketService as any, 'getRoomConnections').mockResolvedValue(mockConnections);
      jest.spyOn(webSocketService, 'handleDisconnect').mockResolvedValue(undefined);

      const goneError = new Error('GoneException');
      goneError.name = 'GoneException';

      wsApiMock
        .on(PostToConnectionCommand, { ConnectionId: 'conn1' })
        .rejects(goneError)
        .on(PostToConnectionCommand, { ConnectionId: 'conn2' })
        .resolves({});

      await webSocketService.broadcast(roomId, message);

      expect(webSocketService.handleDisconnect).toHaveBeenCalledWith('conn1');
      expect(wsApiMock.commandCalls(PostToConnectionCommand)).toHaveLength(2);
    });

    test('配信エラーでWebSocketErrorを投げる', async () => {
      jest
        .spyOn(webSocketService as any, 'getRoomConnections')
        .mockRejectedValue(new Error('DynamoDB Error'));

      await expect(webSocketService.broadcast(roomId, message)).rejects.toThrow(
        new WebSocketError('Failed to broadcast message', 'BROADCAST_ERROR')
      );
    });
  });

  describe('sendToConnection', () => {
    const connectionId = 'test-connection-id';
    const message: WSMessage = {
      type: 'test_message',
      data: { content: 'Test' },
    };

    test('正常に特定の接続にメッセージを送信できる', async () => {
      wsApiMock.on(PostToConnectionCommand).resolves({});

      await webSocketService.sendToConnection(connectionId, message);

      expect(wsApiMock.commandCalls(PostToConnectionCommand)).toHaveLength(1);
      const postCall = wsApiMock.commandCalls(PostToConnectionCommand)[0];
      expect(postCall.args[0].input.ConnectionId).toBe(connectionId);
      expect(JSON.parse(postCall.args[0].input.Data as string)).toEqual(message);
    });

    test('GoneExceptionで無効な接続を自動削除する', async () => {
      jest.spyOn(webSocketService, 'handleDisconnect').mockResolvedValue(undefined);

      const goneError = new Error('GoneException');
      goneError.name = 'GoneException';
      wsApiMock.on(PostToConnectionCommand).rejects(goneError);

      await expect(webSocketService.sendToConnection(connectionId, message)).rejects.toThrow(
        goneError
      );
      expect(webSocketService.handleDisconnect).toHaveBeenCalledWith(connectionId);
    });

    test('その他のエラーを再スローする', async () => {
      const otherError = new Error('Other Error');
      wsApiMock.on(PostToConnectionCommand).rejects(otherError);

      await expect(webSocketService.sendToConnection(connectionId, message)).rejects.toThrow(
        otherError
      );
    });
  });

  describe('getConnection', () => {
    const connectionId = 'test-connection-id';
    const mockConnectionItem: ConnectionItem = {
      PK: `CONN#${connectionId}`,
      SK: 'METADATA',
      GSI1PK: 'ROOM#room123',
      GSI1SK: `CONN#${connectionId}`,
      connectionId,
      roomId: 'room123',
      userId: 'user123',
      userName: 'TestUser',
      connectedAt: '2024-01-01T00:00:00.000Z',
      ttl: 1234567890,
    };

    test('正常に接続情報を取得できる', async () => {
      dynamoMock.on(GetCommand).resolves({ Item: mockConnectionItem });

      const result = await webSocketService.getConnection(connectionId);

      expect(result).toEqual({
        connectionId,
        roomId: 'room123',
        userId: 'user123',
        userName: 'TestUser',
        connectedAt: '2024-01-01T00:00:00.000Z',
      });

      expect(dynamoMock.commandCalls(GetCommand)).toHaveLength(1);
      const getCall = dynamoMock.commandCalls(GetCommand)[0];
      expect(getCall.args[0].input.Key).toEqual({
        PK: `CONN#${connectionId}`,
        SK: 'METADATA',
      });
    });

    test('接続情報が存在しない場合にnullを返す', async () => {
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      const result = await webSocketService.getConnection(connectionId);

      expect(result).toBeNull();
    });

    test('DynamoDBエラーでnullを返す', async () => {
      dynamoMock.on(GetCommand).rejects(new Error('DynamoDB Error'));

      const result = await webSocketService.getConnection(connectionId);

      expect(result).toBeNull();
    });
  });

  describe('validateJoinRoomRequest', () => {
    test('有効なリクエストで正常に処理される', () => {
      const validRequest: JoinRoomRequest = {
        roomId: 'room123',
        userName: 'TestUser',
      };

      expect(() => (webSocketService as any).validateJoinRoomRequest(validRequest)).not.toThrow();
    });

    test('必須フィールドが不足している場合にValidationErrorを投げる', () => {
      const invalidRequests = [
        { roomId: '', userName: 'TestUser' },
        { roomId: 'room123', userName: '' },
        { roomId: 'room123', userName: '   ' },
      ];

      invalidRequests.forEach((request) => {
        expect(() => (webSocketService as any).validateJoinRoomRequest(request)).toThrow(
          ValidationError
        );
      });
    });

    test('ユーザー名が長すぎる場合にValidationErrorを投げる', () => {
      const longUserName = 'A'.repeat(51);
      const requestWithLongUserName = {
        roomId: 'room123',
        userName: longUserName,
      };

      expect(() =>
        (webSocketService as any).validateJoinRoomRequest(requestWithLongUserName)
      ).toThrow(new ValidationError('User name must be 50 characters or less'));
    });
  });

  describe('validateRoomExists', () => {
    const roomId = 'room123';

    test('アクティブなルームで正常に処理される', async () => {
      const mockRoom = {
        PK: `ROOM#${roomId}`,
        SK: 'METADATA',
        status: 'active',
      };

      dynamoMock.on(GetCommand).resolves({ Item: mockRoom });

      await expect((webSocketService as any).validateRoomExists(roomId)).resolves.toBeUndefined();

      expect(dynamoMock.commandCalls(GetCommand)).toHaveLength(1);
      const getCall = dynamoMock.commandCalls(GetCommand)[0];
      expect(getCall.args[0].input.Key).toEqual({
        PK: `ROOM#${roomId}`,
        SK: 'METADATA',
      });
    });

    test('存在しないルームでNotFoundErrorを投げる', async () => {
      dynamoMock.on(GetCommand).resolves({ Item: undefined });

      await expect((webSocketService as any).validateRoomExists(roomId)).rejects.toThrow(
        new NotFoundError('Room not found')
      );
    });

    test('非アクティブなルームでValidationErrorを投げる', async () => {
      const mockRoom = {
        PK: `ROOM#${roomId}`,
        SK: 'METADATA',
        status: 'closed',
      };

      dynamoMock.on(GetCommand).resolves({ Item: mockRoom });

      await expect((webSocketService as any).validateRoomExists(roomId)).rejects.toThrow(
        new ValidationError('Room is not active')
      );
    });

    test('DynamoDBエラーでCommentiaErrorを投げる', async () => {
      dynamoMock.on(GetCommand).rejects(new Error('DynamoDB Error'));

      await expect((webSocketService as any).validateRoomExists(roomId)).rejects.toThrow(
        CommentiaError
      );
    });
  });

  describe('getRoomConnections', () => {
    const roomId = 'room123';
    const mockConnectionItems: ConnectionItem[] = [
      {
        PK: 'CONN#conn1',
        SK: 'METADATA',
        GSI1PK: `ROOM#${roomId}`,
        GSI1SK: 'CONN#conn1',
        connectionId: 'conn1',
        roomId,
        userId: 'user1',
        userName: 'User1',
        connectedAt: '2024-01-01T00:00:00.000Z',
        ttl: 1234567890,
      },
      {
        PK: 'CONN#conn2',
        SK: 'METADATA',
        GSI1PK: `ROOM#${roomId}`,
        GSI1SK: 'CONN#conn2',
        connectionId: 'conn2',
        roomId,
        userId: 'user2',
        userName: 'User2',
        connectedAt: '2024-01-01T00:00:00.000Z',
        ttl: 1234567890,
      },
    ];

    test('正常にルーム内の全接続を取得できる', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: mockConnectionItems });

      const result = await (webSocketService as any).getRoomConnections(roomId);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        connectionId: 'conn1',
        roomId,
        userId: 'user1',
        userName: 'User1',
        connectedAt: '2024-01-01T00:00:00.000Z',
      });

      expect(dynamoMock.commandCalls(QueryCommand)).toHaveLength(1);
      const queryCall = dynamoMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.IndexName).toBe('RoomConnectionsIndex');
      expect(queryCall.args[0].input.KeyConditionExpression).toBe('GSI1PK = :gsi1pk');
      expect(queryCall.args[0].input.ExpressionAttributeValues).toMatchObject({
        ':gsi1pk': `ROOM#${roomId}`,
      });
    });

    test('接続がない場合に空配列を返す', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const result = await (webSocketService as any).getRoomConnections(roomId);

      expect(result).toEqual([]);
    });

    test('DynamoDBエラーで空配列を返す', async () => {
      dynamoMock.on(QueryCommand).rejects(new Error('DynamoDB Error'));

      const result = await (webSocketService as any).getRoomConnections(roomId);

      expect(result).toEqual([]);
    });
  });

  describe('getRoomUserCount', () => {
    const roomId = 'room123';

    test('正常にルーム内の参加者数を取得できる', async () => {
      dynamoMock.on(QueryCommand).resolves({ Count: 5 });

      const result = await (webSocketService as any).getRoomUserCount(roomId);

      expect(result).toBe(5);

      expect(dynamoMock.commandCalls(QueryCommand)).toHaveLength(1);
      const queryCall = dynamoMock.commandCalls(QueryCommand)[0];
      expect(queryCall.args[0].input.IndexName).toBe('RoomConnectionsIndex');
      expect(queryCall.args[0].input.Select).toBe('COUNT');
    });

    test('参加者がいない場合に0を返す', async () => {
      dynamoMock.on(QueryCommand).resolves({ Count: 0 });

      const result = await (webSocketService as any).getRoomUserCount(roomId);

      expect(result).toBe(0);
    });

    test('DynamoDBエラーで0を返す', async () => {
      dynamoMock.on(QueryCommand).rejects(new Error('DynamoDB Error'));

      const result = await (webSocketService as any).getRoomUserCount(roomId);

      expect(result).toBe(0);
    });
  });
});
