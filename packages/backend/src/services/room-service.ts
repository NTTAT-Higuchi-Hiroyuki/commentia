/**
 * Room Service - ルーム管理サービス
 * ルームの作成、取得、終了、検索機能を提供
 */

import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Room, RoomItem, RoomSettings } from '@commentia/shared';
import { dynamoDBDocClient, getTableName } from '../config/aws-clients.js';
import { CommentiaError, NotFoundError, ValidationError } from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

export class RoomService {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;

  constructor() {
    this.docClient = dynamoDBDocClient;
    this.tableName = getTableName('rooms');
  }

  /**
   * ルーム作成
   */
  async createRoom(hostId: string, customSettings?: Partial<RoomSettings>): Promise<Room> {
    logger.info('Creating new room', { hostId });

    // バリデーション
    if (!hostId || typeof hostId !== 'string' || hostId.trim().length === 0) {
      throw new ValidationError('Host ID is required');
    }

    const roomId = this.generateRoomId();
    const roomCode = this.generateRoomCode();
    const createdAt = new Date().toISOString();

    // デフォルト設定
    const defaultSettings: RoomSettings = {
      maxCommentsPerUser: 50,
      maxLikesPerUser: 100,
      commentMaxLength: 500,
    };

    const settings: RoomSettings = {
      ...defaultSettings,
      ...customSettings,
    };

    // TTL: 24時間後（86400秒）
    const ttl = Math.floor(Date.now() / 1000) + 86400;

    const roomItem: RoomItem = {
      PK: `ROOM#${roomId}`,
      SK: 'METADATA',
      roomId,
      roomCode,
      hostId: hostId.trim(),
      createdAt,
      status: 'active',
      settings,
      ttl,
    };

    try {
      // ルームコードの重複チェック
      await this.validateRoomCodeUnique(roomCode);

      // DynamoDBに保存
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: roomItem,
          ConditionExpression: 'attribute_not_exists(PK)',
        })
      );

      const room: Room = this.convertToRoom(roomItem);

      logger.info('Room created successfully', {
        roomId,
        roomCode,
        hostId,
      });

      return room;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new CommentiaError('Room already exists', 409, 'ROOM_EXISTS');
      }

      logger.error('Failed to create room', error, { hostId, roomId });
      throw error;
    }
  }

  /**
   * ルーム情報取得
   */
  async getRoom(roomId: string): Promise<Room> {
    logger.info('Getting room', { roomId });

    if (!roomId || typeof roomId !== 'string') {
      throw new ValidationError('Room ID is required');
    }

    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            PK: `ROOM#${roomId}`,
            SK: 'METADATA',
          },
        })
      );

      if (!result.Item) {
        throw new NotFoundError('Room');
      }

      const roomItem = result.Item as RoomItem;

      // ルームが閉じられているかチェック
      if (roomItem.status === 'closed') {
        throw new CommentiaError('Room is closed', 410, 'ROOM_CLOSED');
      }

      return this.convertToRoom(roomItem);
    } catch (error) {
      if (error instanceof CommentiaError) {
        throw error;
      }

      logger.error('Failed to get room', error, { roomId });
      throw new CommentiaError('Failed to retrieve room', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * ルーム終了
   */
  async closeRoom(roomId: string, hostId: string): Promise<void> {
    logger.info('Closing room', { roomId, hostId });

    if (!roomId || typeof roomId !== 'string') {
      throw new ValidationError('Room ID is required');
    }

    if (!hostId || typeof hostId !== 'string') {
      throw new ValidationError('Host ID is required');
    }

    try {
      // ルームの存在確認と権限チェック
      const room = await this.getRoom(roomId);

      if (room.hostId !== hostId) {
        throw new CommentiaError('Only room host can close the room', 403, 'FORBIDDEN');
      }

      if (room.status === 'closed') {
        throw new CommentiaError('Room is already closed', 409, 'ROOM_ALREADY_CLOSED');
      }

      // ルーム状態を更新
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: {
            PK: `ROOM#${roomId}`,
            SK: 'METADATA',
          },
          UpdateExpression: 'SET #status = :status, #closedAt = :closedAt',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#closedAt': 'closedAt',
            '#hostId': 'hostId',
          },
          ExpressionAttributeValues: {
            ':status': 'closed',
            ':closedAt': new Date().toISOString(),
            ':hostId': hostId,
          },
          ConditionExpression: 'attribute_exists(PK) AND #hostId = :hostId',
        })
      );

      logger.info('Room closed successfully', { roomId, hostId });
    } catch (error) {
      if (error instanceof CommentiaError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new CommentiaError('Room not found or access denied', 404, 'NOT_FOUND');
      }

      logger.error('Failed to close room', error, { roomId, hostId });
      throw new CommentiaError('Failed to close room', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * ルームコードで検索
   */
  async getRoomByCode(roomCode: string): Promise<Room> {
    logger.info('Getting room by code', { roomCode });

    if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
      throw new ValidationError('Room code must be 6 characters');
    }

    try {
      // ルームコードでのスキャンは非効率的なため、実装では別のアプローチを検討
      // 現在の実装では、すべてのアクティブなルームをスキャンしてマッチするものを探す
      const result = await this.docClient.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: 'roomCode = :roomCode AND #status = :status',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':roomCode': roomCode.toUpperCase(),
            ':status': 'active',
          },
        })
      );

      if (!result.Items || result.Items.length === 0) {
        throw new NotFoundError('Room with provided code');
      }

      const roomItem = result.Items[0] as RoomItem;
      return this.convertToRoom(roomItem);
    } catch (error) {
      if (error instanceof CommentiaError) {
        throw error;
      }

      logger.error('Failed to find room by code', error, { roomCode });
      throw new CommentiaError('Failed to find room', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * ユニークなルームID生成
   */
  private generateRoomId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }

  /**
   * 6桁のルームコード生成
   */
  private generateRoomCode(): string {
    // 混同しやすい文字（0, O, I, L）を除外
    const chars = '123456789ABCDEFGHJKMNPQRSTUVWXYZ';
    let result = '';

    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  }

  /**
   * ルームコードの一意性チェック
   */
  private async validateRoomCodeUnique(roomCode: string): Promise<void> {
    try {
      await this.getRoomByCode(roomCode);
      // ルームが見つかった場合は重複
      throw new CommentiaError('Room code already exists', 409, 'ROOM_CODE_EXISTS');
    } catch (error) {
      // NotFoundErrorの場合は正常（ユニーク）
      if (error instanceof NotFoundError) {
        return;
      }
      // その他のエラーは再スロー
      throw error;
    }
  }

  /**
   * RoomItemをRoomに変換
   */
  private convertToRoom(roomItem: RoomItem): Room {
    return {
      roomId: roomItem.roomId,
      roomCode: roomItem.roomCode,
      hostId: roomItem.hostId,
      createdAt: roomItem.createdAt,
      status: roomItem.status,
      settings: roomItem.settings,
    };
  }
}

// シングルトンインスタンス
export const roomService = new RoomService();
