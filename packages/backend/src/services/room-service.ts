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
import { measureDynamoDBOperation, metrics } from '../utils/metrics.js';

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
    const timer = metrics.startTimer('room-creation');
    logger.info('Creating new room', { hostId });

    try {
      // バリデーション
      if (!hostId || typeof hostId !== 'string' || hostId.trim().length === 0) {
        await metrics.recordValidationError('hostId', 'required');
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

      // ルームコードの重複チェック
      await this.validateRoomCodeUnique(roomCode);

      // DynamoDBに保存
      await measureDynamoDBOperation('PutItem', this.tableName, async () => {
        await this.docClient.send(
          new PutCommand({
            TableName: this.tableName,
            Item: roomItem,
            ConditionExpression: 'attribute_not_exists(PK)',
          })
        );
      });

      const room: Room = this.convertToRoom(roomItem);

      // メトリクス記録
      await metrics.recordRoomCreated(roomId, hostId);

      logger.info('Room created successfully', {
        roomId,
        roomCode,
        hostId,
      });

      return room;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        await metrics.recordRoomCreationFailure('duplicate_room');
        throw new CommentiaError('Room already exists', 409, 'ROOM_EXISTS');
      }

      if (error instanceof ValidationError) {
        await metrics.recordRoomCreationFailure('validation_error');
        throw error;
      }

      await metrics.recordRoomCreationFailure('unknown_error');
      logger.error('Failed to create room', error, { hostId });
      throw error;
    } finally {
      await timer();
    }
  }

  /**
   * ルーム情報取得
   */
  async getRoom(roomId: string): Promise<Room> {
    const timer = metrics.startTimer('room-retrieval');
    logger.info('Getting room', { roomId });

    try {
      if (!roomId || typeof roomId !== 'string') {
        await metrics.recordValidationError('roomId', 'required');
        throw new ValidationError('Room ID is required');
      }

      const result = await measureDynamoDBOperation('GetItem', this.tableName, async () => {
        return await this.docClient.send(
          new GetCommand({
            TableName: this.tableName,
            Key: {
              PK: `ROOM#${roomId}`,
              SK: 'METADATA',
            },
          })
        );
      });

      if (!result.Item) {
        await metrics.recordApplicationError('room_not_found', 'room-service');
        throw new NotFoundError('Room');
      }

      const roomItem = result.Item as RoomItem;

      // ルームが閉じられているかチェック
      if (roomItem.status === 'closed') {
        await metrics.recordApplicationError('room_closed', 'room-service');
        throw new CommentiaError('Room is closed', 410, 'ROOM_CLOSED');
      }

      return this.convertToRoom(roomItem);
    } catch (error) {
      if (error instanceof CommentiaError) {
        throw error;
      }

      await metrics.recordApplicationError('room_retrieval_failed', 'room-service');
      logger.error('Failed to get room', error, { roomId });
      throw new CommentiaError('Failed to retrieve room', 500, 'INTERNAL_ERROR');
    } finally {
      await timer();
    }
  }

  /**
   * ルーム終了
   */
  async closeRoom(roomId: string, hostId: string): Promise<void> {
    const timer = metrics.startTimer('room-closure');
    logger.info('Closing room', { roomId, hostId });

    try {
      if (!roomId || typeof roomId !== 'string') {
        await metrics.recordValidationError('roomId', 'required');
        throw new ValidationError('Room ID is required');
      }

      if (!hostId || typeof hostId !== 'string') {
        await metrics.recordValidationError('hostId', 'required');
        throw new ValidationError('Host ID is required');
      }

      // ルームの存在確認と権限チェック
      const room = await this.getRoom(roomId);

      if (room.hostId !== hostId) {
        await metrics.recordApplicationError('unauthorized_room_closure', 'room-service');
        throw new CommentiaError('Only room host can close the room', 403, 'FORBIDDEN');
      }

      if (room.status === 'closed') {
        await metrics.recordApplicationError('room_already_closed', 'room-service');
        throw new CommentiaError('Room is already closed', 409, 'ROOM_ALREADY_CLOSED');
      }

      const closedAt = new Date().toISOString();
      const createdAt = new Date(room.createdAt);
      const durationSeconds = Math.floor((Date.now() - createdAt.getTime()) / 1000);

      // ルーム状態を更新
      await measureDynamoDBOperation('UpdateItem', this.tableName, async () => {
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
              ':closedAt': closedAt,
              ':hostId': hostId,
            },
            ConditionExpression: 'attribute_exists(PK) AND #hostId = :hostId',
          })
        );
      });

      // メトリクス記録 - 参加者数は実際には別途取得が必要だが、ここでは簡単化
      await metrics.recordRoomClosed(roomId, durationSeconds, 0);

      logger.info('Room closed successfully', {
        roomId,
        hostId,
        durationSeconds,
      });
    } catch (error) {
      if (error instanceof CommentiaError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        await metrics.recordApplicationError('room_closure_unauthorized', 'room-service');
        throw new CommentiaError('Room not found or access denied', 404, 'NOT_FOUND');
      }

      await metrics.recordApplicationError('room_closure_failed', 'room-service');
      logger.error('Failed to close room', error, { roomId, hostId });
      throw new CommentiaError('Failed to close room', 500, 'INTERNAL_ERROR');
    } finally {
      await timer();
    }
  }

  /**
   * ルームコードで検索
   */
  async getRoomByCode(roomCode: string): Promise<Room> {
    const timer = metrics.startTimer('room-code-search');
    logger.info('Getting room by code', { roomCode });

    try {
      if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
        await metrics.recordValidationError('roomCode', 'invalid_format');
        throw new ValidationError('Room code must be 6 characters');
      }

      // ルームコードでのスキャンは非効率的なため、実装では別のアプローチを検討
      // 現在の実装では、すべてのアクティブなルームをスキャンしてマッチするものを探す
      const result = await measureDynamoDBOperation('Scan', this.tableName, async () => {
        return await this.docClient.send(
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
      });

      if (!result.Items || result.Items.length === 0) {
        await metrics.recordApplicationError('room_code_not_found', 'room-service');
        throw new NotFoundError('Room with provided code');
      }

      const roomItem = result.Items[0] as RoomItem;
      return this.convertToRoom(roomItem);
    } catch (error) {
      if (error instanceof CommentiaError) {
        throw error;
      }

      await metrics.recordApplicationError('room_code_search_failed', 'room-service');
      logger.error('Failed to find room by code', error, { roomCode });
      throw new CommentiaError('Failed to find room', 500, 'INTERNAL_ERROR');
    } finally {
      await timer();
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
      await metrics.recordApplicationError('room_code_collision', 'room-service');
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

// シングルトンインスタンス（テスト環境では作成しない）
export const roomService = process.env.NODE_ENV === 'test' ? null : new RoomService();
