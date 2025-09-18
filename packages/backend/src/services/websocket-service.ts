/**
 * WebSocket Service
 * リアルタイム通信の管理
 */

import {
  type ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { dynamoDBDocClient, getTableName, getWebSocketClient } from '../config/aws-clients.js';
import type { Connection, ConnectionItem, JoinRoomRequest, WSMessage } from '../types/index.js';
import {
  CommentiaError,
  NotFoundError,
  ValidationError,
  WebSocketError,
} from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

export class WebSocketService {
  private docClient: DynamoDBDocumentClient;
  private connectionsTableName: string;
  private roomsTableName: string;
  private wsClient: ApiGatewayManagementApiClient;

  constructor(websocketEndpoint?: string) {
    this.docClient = dynamoDBDocClient;
    this.connectionsTableName = getTableName('connections');
    this.roomsTableName = getTableName('rooms');
    this.wsClient = getWebSocketClient(websocketEndpoint);
  }

  /**
   * WebSocket接続処理
   */
  async handleConnect(connectionId: string): Promise<void> {
    logger.info('WebSocket connection started', { connectionId });

    try {
      // 接続情報を一時的に保存（ルーム参加時に更新）
      const connectedAt = new Date().toISOString();
      const ttl = Math.floor(Date.now() / 1000) + 7200; // 2時間後

      const connectionItem: ConnectionItem = {
        PK: `CONN#${connectionId}`,
        SK: 'METADATA',
        GSI1PK: '', // ルーム参加時に設定
        GSI1SK: '', // ルーム参加時に設定
        connectionId,
        roomId: '', // ルーム参加時に設定
        userId: '', // ルーム参加時に設定
        userName: '', // ルーム参加時に設定
        connectedAt,
        ttl,
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.connectionsTableName,
          Item: connectionItem,
        })
      );

      logger.info('WebSocket connection stored', { connectionId });
    } catch (error) {
      logger.error('Failed to handle WebSocket connection', error, { connectionId });
      throw new WebSocketError('Failed to establish connection', 'CONNECTION_ERROR');
    }
  }

  /**
   * WebSocket切断処理
   */
  async handleDisconnect(connectionId: string): Promise<void> {
    logger.info('WebSocket disconnection started', { connectionId });

    try {
      // 接続情報を取得
      const connection = await this.getConnection(connectionId);

      if (connection?.roomId) {
        // ルームから退出処理
        await this.leaveRoom(connectionId, connection.roomId, connection.userName);
      }

      // 接続情報を削除
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.connectionsTableName,
          Key: {
            PK: `CONN#${connectionId}`,
            SK: 'METADATA',
          },
        })
      );

      logger.info('WebSocket disconnection completed', { connectionId });
    } catch (error) {
      logger.error('Failed to handle WebSocket disconnection', error, { connectionId });
      // 切断処理はエラーを投げずに継続
    }
  }

  /**
   * ルーム参加処理
   */
  async joinRoom(connectionId: string, request: JoinRoomRequest): Promise<void> {
    logger.info('Joining room', {
      connectionId,
      roomId: request.roomId,
      userName: request.userName,
    });

    // バリデーション
    this.validateJoinRoomRequest(request);

    try {
      // ルーム存在確認
      await this.validateRoomExists(request.roomId);

      // ユーザーIDを生成（接続ID + タイムスタンプ）
      const userId = `user_${connectionId}_${Date.now()}`;
      const connectedAt = new Date().toISOString();
      const ttl = Math.floor(Date.now() / 1000) + 7200; // 2時間後

      // 接続情報を更新
      const connectionItem: ConnectionItem = {
        PK: `CONN#${connectionId}`,
        SK: 'METADATA',
        GSI1PK: `ROOM#${request.roomId}`,
        GSI1SK: `CONN#${connectionId}`,
        connectionId,
        roomId: request.roomId,
        userId,
        userName: request.userName,
        connectedAt,
        ttl,
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.connectionsTableName,
          Item: connectionItem,
          ConditionExpression: 'attribute_exists(PK)', // 既存接続のみ更新
        })
      );

      // ルーム内の参加者数を取得
      const userCount = await this.getRoomUserCount(request.roomId);

      // ルーム内の他の参加者に通知
      await this.broadcast(
        request.roomId,
        {
          type: 'user_joined',
          data: {
            userName: request.userName,
            userCount,
          },
        },
        [connectionId]
      ); // 自分自身を除外

      logger.info('Successfully joined room', {
        connectionId,
        roomId: request.roomId,
        userName: request.userName,
        userCount,
      });
    } catch (error) {
      logger.error('Failed to join room', error, {
        connectionId,
        roomId: request.roomId,
        userName: request.userName,
      });

      if (error instanceof CommentiaError) {
        throw error;
      }

      throw new WebSocketError('Failed to join room', 'JOIN_ROOM_ERROR');
    }
  }

  /**
   * ルーム退出処理
   */
  async leaveRoom(connectionId: string, roomId: string, userName: string): Promise<void> {
    logger.info('Leaving room', { connectionId, roomId, userName });

    try {
      // 接続情報を削除
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.connectionsTableName,
          Key: {
            PK: `CONN#${connectionId}`,
            SK: 'METADATA',
          },
        })
      );

      // ルーム内の参加者数を取得（退出後）
      const userCount = await this.getRoomUserCount(roomId);

      // ルーム内の他の参加者に通知
      await this.broadcast(roomId, {
        type: 'user_left',
        data: {
          userName,
          userCount,
        },
      });

      logger.info('Successfully left room', { connectionId, roomId, userName, userCount });
    } catch (error) {
      logger.error('Failed to leave room', error, { connectionId, roomId, userName });
      throw new WebSocketError('Failed to leave room', 'LEAVE_ROOM_ERROR');
    }
  }

  /**
   * ルーム内全体にメッセージを配信
   */
  async broadcast(
    roomId: string,
    message: WSMessage,
    excludeConnections: string[] = []
  ): Promise<void> {
    logger.info('Broadcasting message', {
      roomId,
      messageType: message.type,
      excludeCount: excludeConnections.length,
    });

    try {
      // ルーム内の全接続を取得
      const connections = await this.getRoomConnections(roomId);

      if (connections.length === 0) {
        logger.info('No connections in room', { roomId });
        return;
      }

      // 除外する接続をフィルタリング
      const targetConnections = connections.filter(
        (conn) => !excludeConnections.includes(conn.connectionId)
      );

      logger.info('Broadcasting to connections', {
        roomId,
        totalConnections: connections.length,
        targetConnections: targetConnections.length,
      });

      // 並列でメッセージを送信
      const messageData = JSON.stringify(message);
      const sendPromises = targetConnections.map(async (connection) => {
        try {
          await this.wsClient.send(
            new PostToConnectionCommand({
              ConnectionId: connection.connectionId,
              Data: messageData,
            })
          );

          logger.debug('Message sent successfully', {
            connectionId: connection.connectionId,
            messageType: message.type,
          });
        } catch (error) {
          logger.warn('Failed to send message to connection', {
            error: error instanceof Error ? error.message : String(error),
            connectionId: connection.connectionId,
            messageType: message.type,
          });

          // 接続が無効な場合は削除
          if (error instanceof Error && error.name === 'GoneException') {
            await this.handleDisconnect(connection.connectionId);
          }
        }
      });

      await Promise.allSettled(sendPromises);

      logger.info('Broadcast completed', {
        roomId,
        messageType: message.type,
        targetConnections: targetConnections.length,
      });
    } catch (error) {
      logger.error('Failed to broadcast message', error, {
        roomId,
        messageType: message.type,
      });
      throw new WebSocketError('Failed to broadcast message', 'BROADCAST_ERROR');
    }
  }

  /**
   * 特定の接続にメッセージを送信
   */
  async sendToConnection(connectionId: string, message: WSMessage): Promise<void> {
    try {
      const messageData = JSON.stringify(message);

      await this.wsClient.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: messageData,
        })
      );

      logger.debug('Message sent to connection', {
        connectionId,
        messageType: message.type,
      });
    } catch (error) {
      logger.warn('Failed to send message to connection', {
        error: error instanceof Error ? error.message : String(error),
        connectionId,
        messageType: message.type,
      });

      // 接続が無効な場合は削除
      if (error instanceof Error && error.name === 'GoneException') {
        await this.handleDisconnect(connectionId);
      }

      throw error;
    }
  }

  /**
   * 接続情報を取得
   */
  async getConnection(connectionId: string): Promise<Connection | null> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.connectionsTableName,
          Key: {
            PK: `CONN#${connectionId}`,
            SK: 'METADATA',
          },
        })
      );

      if (!result.Item) {
        return null;
      }

      const item = result.Item as ConnectionItem;
      return {
        connectionId: item.connectionId,
        roomId: item.roomId,
        userId: item.userId,
        userName: item.userName,
        connectedAt: item.connectedAt,
      };
    } catch (error) {
      logger.error('Failed to get connection', error, { connectionId });
      return null;
    }
  }

  /**
   * ルーム内の全接続を取得
   */
  private async getRoomConnections(roomId: string): Promise<Connection[]> {
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.connectionsTableName,
          IndexName: 'RoomConnectionsIndex',
          KeyConditionExpression: 'GSI1PK = :gsi1pk',
          ExpressionAttributeValues: {
            ':gsi1pk': `ROOM#${roomId}`,
          },
        })
      );

      return (result.Items || []).map((item) => {
        const connectionItem = item as ConnectionItem;
        return {
          connectionId: connectionItem.connectionId,
          roomId: connectionItem.roomId,
          userId: connectionItem.userId,
          userName: connectionItem.userName,
          connectedAt: connectionItem.connectedAt,
        };
      });
    } catch (error) {
      logger.error('Failed to get room connections', error, { roomId });
      return [];
    }
  }

  /**
   * ルーム内の参加者数を取得
   */
  private async getRoomUserCount(roomId: string): Promise<number> {
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.connectionsTableName,
          IndexName: 'RoomConnectionsIndex',
          KeyConditionExpression: 'GSI1PK = :gsi1pk',
          ExpressionAttributeValues: {
            ':gsi1pk': `ROOM#${roomId}`,
          },
          Select: 'COUNT',
        })
      );

      return result.Count || 0;
    } catch (error) {
      logger.error('Failed to get room user count', error, { roomId });
      return 0;
    }
  }

  /**
   * ルーム存在確認
   */
  private async validateRoomExists(roomId: string): Promise<void> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.roomsTableName,
          Key: {
            PK: `ROOM#${roomId}`,
            SK: 'METADATA',
          },
        })
      );

      if (!result.Item) {
        throw new NotFoundError('Room not found');
      }

      if (result.Item.status !== 'active') {
        throw new ValidationError('Room is not active');
      }
    } catch (error) {
      if (error instanceof CommentiaError) {
        throw error;
      }
      logger.error('Failed to validate room exists', error, { roomId });
      throw new CommentiaError('Failed to validate room', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * ルーム参加リクエストのバリデーション
   */
  private validateJoinRoomRequest(request: JoinRoomRequest): void {
    if (!request.roomId || typeof request.roomId !== 'string') {
      throw new ValidationError('Room ID is required');
    }

    if (
      !request.userName ||
      typeof request.userName !== 'string' ||
      request.userName.trim().length === 0
    ) {
      throw new ValidationError('User name is required');
    }

    if (request.userName.length > 50) {
      throw new ValidationError('User name must be 50 characters or less');
    }
  }
}

// インスタンスをエクスポート
export const webSocketService = process.env.NODE_ENV === 'test' ? null : new WebSocketService();
