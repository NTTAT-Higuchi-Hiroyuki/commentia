/**
 * Like Service
 * いいね機能の管理
 */

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import { dynamoDBDocClient, getTableName } from '../config/aws-clients.js';
import type {
  AddLikeRequest,
  AddLikeResponse,
  LikeItem,
  RemoveLikeRequest,
  RemoveLikeResponse,
} from '../types/index.js';
import {
  CommentiaError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

export class LikeService {
  private docClient: DynamoDBDocumentClient;
  private likesTableName: string;
  private commentsTableName: string;
  private roomsTableName: string;

  constructor() {
    this.docClient = dynamoDBDocClient;
    this.likesTableName = getTableName('likes');
    this.commentsTableName = getTableName('comments');
    this.roomsTableName = getTableName('rooms');
  }

  /**
   * いいね追加
   */
  async addLike(request: AddLikeRequest): Promise<AddLikeResponse> {
    logger.info('Adding like', {
      commentId: request.commentId,
      userId: request.userId,
      roomId: request.roomId,
    });

    // バリデーション
    this.validateLikeRequest(request);

    // コメント存在確認
    await this.validateCommentExists(request.commentId, request.roomId);

    // 重複いいね防止
    const existingLike = await this.checkExistingLike(request.commentId, request.userId);
    if (existingLike) {
      logger.warn('Like already exists', {
        commentId: request.commentId,
        userId: request.userId,
      });
      throw new ValidationError('You have already liked this comment');
    }

    // いいね数制限チェック
    await this.checkLikeLimits(request.roomId, request.userId);

    const likedAt = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 86400; // 24時間後

    const likeItem: LikeItem = {
      PK: `LIKE#${request.commentId}`,
      SK: `USER#${request.userId}`,
      GSI1PK: `USER#${request.userId}#ROOM#${request.roomId}`,
      GSI1SK: `LIKE#${likedAt}`,
      commentId: request.commentId,
      userId: request.userId,
      roomId: request.roomId,
      likedAt,
      ttl,
    };

    try {
      // いいね追加
      await this.docClient.send(
        new PutCommand({
          TableName: this.likesTableName,
          Item: likeItem,
          ConditionExpression: 'attribute_not_exists(PK)', // 重複防止
        })
      );

      // いいね数を取得・更新
      const newLikeCount = await this.updateCommentLikeCount(request.commentId);

      logger.info('Like added successfully', {
        commentId: request.commentId,
        userId: request.userId,
        newLikeCount,
      });

      return {
        success: true,
        likeCount: newLikeCount,
        message: 'Like added successfully',
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new ValidationError('You have already liked this comment');
      }

      logger.error('Failed to add like', error, {
        commentId: request.commentId,
        userId: request.userId,
      });
      throw new CommentiaError('Failed to add like', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * いいね取消
   */
  async removeLike(request: RemoveLikeRequest): Promise<RemoveLikeResponse> {
    logger.info('Removing like', {
      commentId: request.commentId,
      userId: request.userId,
    });

    // バリデーション
    this.validateRemoveLikeRequest(request);

    // いいね存在確認
    const existingLike = await this.checkExistingLike(request.commentId, request.userId);
    if (!existingLike) {
      throw new NotFoundError('Like not found');
    }

    try {
      // いいね削除
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.likesTableName,
          Key: {
            PK: `LIKE#${request.commentId}`,
            SK: `USER#${request.userId}`,
          },
          ConditionExpression: 'attribute_exists(PK)',
        })
      );

      // いいね数を取得・更新
      const newLikeCount = await this.updateCommentLikeCount(request.commentId);

      logger.info('Like removed successfully', {
        commentId: request.commentId,
        userId: request.userId,
        newLikeCount,
      });

      return {
        success: true,
        likeCount: newLikeCount,
        message: 'Like removed successfully',
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new NotFoundError('Like not found');
      }

      logger.error('Failed to remove like', error, {
        commentId: request.commentId,
        userId: request.userId,
      });
      throw new CommentiaError('Failed to remove like', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * コメントのいいね数を更新
   */
  private async updateCommentLikeCount(commentId: string): Promise<number> {
    try {
      // いいね数をカウント
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.likesTableName,
          KeyConditionExpression: 'PK = :pk',
          ExpressionAttributeValues: {
            ':pk': `LIKE#${commentId}`,
          },
          Select: 'COUNT',
        })
      );

      const newLikeCount = result.Count || 0;

      // Comment Serviceのメソッドを使用してコメントのいいね数を更新
      // 注意: この実装では直接DynamoDBを更新している
      // 本来はComment Serviceのメソッドを呼び出すべきだが、循環依存を避けるため直接実装
      const paddedLikeCount = newLikeCount.toString().padStart(10, '0');

      // コメントを検索してSKを取得
      const commentResult = await this.docClient.send(
        new QueryCommand({
          TableName: this.commentsTableName,
          FilterExpression: 'commentId = :commentId',
          ExpressionAttributeValues: {
            ':commentId': commentId,
          },
          Limit: 1,
        })
      );

      if (!commentResult.Items || commentResult.Items.length === 0) {
        throw new NotFoundError('Comment not found');
      }

      const comment = commentResult.Items[0];

      // コメントのいいね数とGSI1SKを更新
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.commentsTableName,
          Key: {
            PK: comment.PK,
            SK: comment.SK,
          },
          UpdateExpression: 'SET likeCount = :likeCount, GSI1SK = :gsi1sk',
          ExpressionAttributeValues: {
            ':likeCount': newLikeCount,
            ':gsi1sk': `LIKES#${paddedLikeCount}#${commentId}`,
          },
        })
      );

      return newLikeCount;
    } catch (error) {
      logger.error('Failed to update comment like count', error, { commentId });
      throw new CommentiaError('Failed to update like count', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * 既存のいいねをチェック
   */
  private async checkExistingLike(commentId: string, userId: string): Promise<LikeItem | null> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.likesTableName,
          Key: {
            PK: `LIKE#${commentId}`,
            SK: `USER#${userId}`,
          },
        })
      );

      return result.Item ? (result.Item as LikeItem) : null;
    } catch (error) {
      logger.error('Failed to check existing like', error, { commentId, userId });
      return null;
    }
  }

  /**
   * コメント存在確認
   */
  private async validateCommentExists(commentId: string, roomId: string): Promise<void> {
    try {
      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.commentsTableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          FilterExpression: 'commentId = :commentId',
          ExpressionAttributeValues: {
            ':pk': `ROOM#${roomId}`,
            ':sk': 'COMMENT#',
            ':commentId': commentId,
          },
          Limit: 1,
        })
      );

      if (!result.Items || result.Items.length === 0) {
        throw new NotFoundError('Comment not found');
      }
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error('Failed to validate comment exists', error, { commentId, roomId });
      throw new CommentiaError('Failed to validate comment', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * いいね制限チェック
   */
  private async checkLikeLimits(roomId: string, userId: string): Promise<void> {
    try {
      // ルーム設定を取得
      const roomResult = await this.docClient.send(
        new GetCommand({
          TableName: this.roomsTableName,
          Key: {
            PK: `ROOM#${roomId}`,
            SK: 'METADATA',
          },
        })
      );

      if (!roomResult.Item) {
        throw new NotFoundError('Room not found');
      }

      const roomSettings = roomResult.Item.settings;
      const maxLikesPerUser = roomSettings?.maxLikesPerUser || 100; // デフォルト100

      // ユーザーのいいね数をカウント
      const userLikesResult = await this.docClient.send(
        new QueryCommand({
          TableName: this.likesTableName,
          IndexName: 'UserLikesIndex',
          KeyConditionExpression: 'GSI1PK = :gsi1pk',
          ExpressionAttributeValues: {
            ':gsi1pk': `USER#${userId}#ROOM#${roomId}`,
          },
          Select: 'COUNT',
        })
      );

      const currentLikeCount = userLikesResult.Count || 0;

      if (currentLikeCount >= maxLikesPerUser) {
        throw new RateLimitError(`Maximum ${maxLikesPerUser} likes per user allowed`);
      }
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof RateLimitError) {
        throw error;
      }
      logger.error('Failed to check like limits', error, { roomId, userId });
      throw new CommentiaError('Failed to check like limits', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * いいね追加リクエストのバリデーション
   */
  private validateLikeRequest(request: AddLikeRequest): void {
    if (!request.commentId || typeof request.commentId !== 'string') {
      throw new ValidationError('Comment ID is required');
    }

    if (!request.userId || typeof request.userId !== 'string') {
      throw new ValidationError('User ID is required');
    }

    if (!request.roomId || typeof request.roomId !== 'string') {
      throw new ValidationError('Room ID is required');
    }
  }

  /**
   * いいね取消リクエストのバリデーション
   */
  private validateRemoveLikeRequest(request: RemoveLikeRequest): void {
    if (!request.commentId || typeof request.commentId !== 'string') {
      throw new ValidationError('Comment ID is required');
    }

    if (!request.userId || typeof request.userId !== 'string') {
      throw new ValidationError('User ID is required');
    }
  }
}

// インスタンスをエクスポート
export const likeService = new LikeService();
