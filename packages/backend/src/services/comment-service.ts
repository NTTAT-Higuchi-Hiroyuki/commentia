/**
 * Comment Service - コメント管理サービス
 * コメントの投稿、取得、削除機能を提供
 */

import {
  DeleteCommand,
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  type QueryCommandOutput,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Comment, CommentItem, PostCommentRequest, RoomSettings } from '@commentia/shared';
import { dynamoDBDocClient, getTableName } from '../config/aws-clients.js';
import {
  CommentiaError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

export class CommentService {
  private docClient: DynamoDBDocumentClient;
  private commentsTableName: string;
  private roomsTableName: string;

  constructor() {
    this.docClient = dynamoDBDocClient;
    this.commentsTableName = getTableName('comments');
    this.roomsTableName = getTableName('rooms');
  }

  /**
   * コメント投稿
   */
  async postComment(request: PostCommentRequest): Promise<Comment> {
    logger.info('Posting comment', { roomId: request.roomId, userId: request.userId });

    // バリデーション
    this.validateCommentRequest(request);

    // XSS対策 - HTMLタグをエスケープ
    const sanitizedContent = this.sanitizeContent(request.content);

    // ルーム存在確認と設定取得
    const roomSettings = await this.getRoomSettings(request.roomId);

    // 投稿制限チェック
    await this.checkPostingLimits(request.roomId, request.userId, roomSettings);

    const commentId = this.generateCommentId();
    const timestamp = new Date().toISOString();
    const sortableTimestamp = new Date().getTime().toString().padStart(13, '0');

    // TTL: 24時間後（86400秒）
    const ttl = Math.floor(Date.now() / 1000) + 86400;

    const commentItem: CommentItem = {
      PK: `ROOM#${request.roomId}`,
      SK: `COMMENT#${sortableTimestamp}#${commentId}`,
      GSI1PK: `ROOM#${request.roomId}`,
      GSI1SK: `LIKES#0000000000#${commentId}`, // いいね数0でパディング
      commentId,
      roomId: request.roomId,
      userId: request.userId,
      userName: request.userName,
      content: sanitizedContent,
      timestamp,
      likeCount: 0,
      ttl,
    };

    try {
      // DynamoDBに保存
      await this.docClient.send(
        new PutCommand({
          TableName: this.commentsTableName,
          Item: commentItem,
        })
      );

      const comment: Comment = this.convertToComment(commentItem);

      logger.info('Comment posted successfully', {
        commentId,
        roomId: request.roomId,
        userId: request.userId,
      });

      return comment;
    } catch (error) {
      logger.error('Failed to post comment', error, {
        roomId: request.roomId,
        userId: request.userId,
      });
      throw new CommentiaError('Failed to post comment', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * コメント一覧取得
   */
  async getComments(
    roomId: string,
    sortBy: 'latest' | 'likes' = 'latest',
    limit = 50,
    cursor?: string
  ): Promise<{ comments: Comment[]; nextCursor?: string }> {
    logger.info('Getting comments', { roomId, sortBy, limit });

    if (!roomId || typeof roomId !== 'string') {
      throw new ValidationError('Room ID is required');
    }

    try {
      let result: QueryCommandOutput;

      if (sortBy === 'latest') {
        // 新着順：メインテーブルをクエリ
        result = await this.docClient.send(
          new QueryCommand({
            TableName: this.commentsTableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
              ':pk': `ROOM#${roomId}`,
              ':sk': 'COMMENT#',
            },
            ScanIndexForward: false, // 降順（新着順）
            Limit: limit,
            ExclusiveStartKey: cursor
              ? JSON.parse(Buffer.from(cursor, 'base64').toString())
              : undefined,
          })
        );
      } else {
        // いいね順：GSIをクエリ
        result = await this.docClient.send(
          new QueryCommand({
            TableName: this.commentsTableName,
            IndexName: 'LikeCountIndex',
            KeyConditionExpression: 'GSI1PK = :gsi1pk AND begins_with(GSI1SK, :gsi1sk)',
            ExpressionAttributeValues: {
              ':gsi1pk': `ROOM#${roomId}`,
              ':gsi1sk': 'LIKES#',
            },
            ScanIndexForward: false, // 降順（いいね数順）
            Limit: limit,
            ExclusiveStartKey: cursor
              ? JSON.parse(Buffer.from(cursor, 'base64').toString())
              : undefined,
          })
        );
      }

      const comments = (result.Items || []).map((item) =>
        this.convertToComment(item as CommentItem)
      );

      const nextCursor = result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : undefined;

      logger.info('Comments retrieved successfully', {
        roomId,
        sortBy,
        count: comments.length,
        hasNextCursor: !!nextCursor,
      });

      return {
        comments,
        ...(nextCursor && { nextCursor }),
      };
    } catch (error) {
      logger.error('Failed to get comments', error, { roomId, sortBy });
      throw new CommentiaError('Failed to retrieve comments', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * コメント削除
   */
  async deleteComment(commentId: string, userId: string): Promise<void> {
    logger.info('Deleting comment', { commentId, userId });

    if (!commentId || typeof commentId !== 'string') {
      throw new ValidationError('Comment ID is required');
    }

    if (!userId || typeof userId !== 'string') {
      throw new ValidationError('User ID is required');
    }

    try {
      // コメント存在確認と権限チェック
      const comment = await this.getCommentById(commentId);

      if (comment.userId !== userId) {
        throw new CommentiaError('Only comment author can delete the comment', 403, 'FORBIDDEN');
      }

      // DynamoDBから削除
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.commentsTableName,
          Key: {
            PK: `ROOM#${comment.roomId}`,
            SK: comment.SK, // 実際のSKを使用
          },
          ConditionExpression: 'attribute_exists(PK) AND userId = :userId',
          ExpressionAttributeValues: {
            ':userId': userId,
          },
        })
      );

      logger.info('Comment deleted successfully', { commentId, userId });
    } catch (error) {
      if (error instanceof CommentiaError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        throw new CommentiaError('Comment not found or access denied', 404, 'NOT_FOUND');
      }

      logger.error('Failed to delete comment', error, { commentId, userId });
      throw new CommentiaError('Failed to delete comment', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * コメントのいいね数を更新
   */
  async updateCommentLikeCount(commentId: string, newLikeCount: number): Promise<void> {
    logger.info('Updating comment like count', { commentId, newLikeCount });

    try {
      const comment = await this.getCommentById(commentId);
      const paddedLikeCount = newLikeCount.toString().padStart(10, '0');

      // GSI用のSKを更新
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.commentsTableName,
          Key: {
            PK: `ROOM#${comment.roomId}`,
            SK: comment.SK,
          },
          UpdateExpression: 'SET likeCount = :likeCount, GSI1SK = :gsi1sk',
          ExpressionAttributeValues: {
            ':likeCount': newLikeCount,
            ':gsi1sk': `LIKES#${paddedLikeCount}#${commentId}`,
          },
        })
      );

      logger.info('Comment like count updated successfully', { commentId, newLikeCount });
    } catch (error) {
      logger.error('Failed to update comment like count', error, { commentId, newLikeCount });
      throw new CommentiaError('Failed to update like count', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * コメントIDでコメント取得（内部用）
   */
  private async getCommentById(commentId: string): Promise<CommentItem> {
    // commentIdからコメントを検索（全ルームを対象とする必要があるため、GSIを使用）
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.commentsTableName,
        FilterExpression: 'commentId = :commentId',
        ExpressionAttributeValues: {
          ':commentId': commentId,
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      throw new NotFoundError('Comment');
    }

    return result.Items[0] as CommentItem;
  }

  /**
   * ルーム設定を取得
   */
  private async getRoomSettings(roomId: string): Promise<RoomSettings> {
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
        throw new NotFoundError('Room');
      }

      return result.Item.settings as RoomSettings;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new CommentiaError('Failed to get room settings', 500, 'INTERNAL_ERROR');
    }
  }

  /**
   * 投稿制限チェック
   */
  private async checkPostingLimits(
    roomId: string,
    userId: string,
    settings: RoomSettings
  ): Promise<void> {
    // ユーザーの投稿数チェック
    const userCommentCount = await this.getUserCommentCount(roomId, userId);

    if (userCommentCount >= settings.maxCommentsPerUser) {
      throw new RateLimitError(`Maximum ${settings.maxCommentsPerUser} comments per user allowed`);
    }

    // 連続投稿チェック（過去1分以内の投稿をチェック）
    const recentComments = await this.getRecentUserComments(roomId, userId, 60000); // 1分

    if (recentComments.length > 0) {
      // 最後の投稿から30秒未満の場合は制限
      const lastCommentTime = new Date(recentComments[0].timestamp).getTime();
      const now = Date.now();
      const timeDiff = now - lastCommentTime;

      if (timeDiff < 30000) {
        // 30秒
        throw new RateLimitError('Please wait before posting another comment');
      }
    }
  }

  /**
   * ユーザーのコメント数取得
   */
  private async getUserCommentCount(roomId: string, userId: string): Promise<number> {
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.commentsTableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':pk': `ROOM#${roomId}`,
          ':sk': 'COMMENT#',
          ':userId': userId,
        },
        Select: 'COUNT',
      })
    );

    return result.Count || 0;
  }

  /**
   * 最近のユーザーコメント取得
   */
  private async getRecentUserComments(
    roomId: string,
    userId: string,
    timeWindowMs: number
  ): Promise<Comment[]> {
    const cutoffTime = new Date(Date.now() - timeWindowMs).toISOString();
    const cutoffTimestamp = new Date(cutoffTime).getTime().toString().padStart(13, '0');

    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.commentsTableName,
        KeyConditionExpression: 'PK = :pk AND SK >= :sk',
        FilterExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':pk': `ROOM#${roomId}`,
          ':sk': `COMMENT#${cutoffTimestamp}`,
          ':userId': userId,
        },
        ScanIndexForward: false, // 新しい順
        Limit: 5, // 最大5件
      })
    );

    return (result.Items || []).map((item) => this.convertToComment(item as CommentItem));
  }

  /**
   * コメント内容のサニタイゼーション
   */
  private sanitizeContent(content: string): string {
    // HTMLタグをエスケープしてXSS対策
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .trim();
  }

  /**
   * コメント投稿リクエストのバリデーション
   */
  private validateCommentRequest(request: PostCommentRequest): void {
    if (!request.roomId || typeof request.roomId !== 'string') {
      throw new ValidationError('Room ID is required');
    }

    if (!request.userId || typeof request.userId !== 'string') {
      throw new ValidationError('User ID is required');
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

    if (
      !request.content ||
      typeof request.content !== 'string' ||
      request.content.trim().length === 0
    ) {
      throw new ValidationError('Comment content is required');
    }

    if (request.content.length > 500) {
      throw new ValidationError('Comment must be 500 characters or less');
    }
  }

  /**
   * ユニークなコメントID生成
   */
  private generateCommentId(): string {
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }

  /**
   * CommentItemをCommentに変換
   */
  private convertToComment(commentItem: CommentItem): Comment {
    return {
      commentId: commentItem.commentId,
      roomId: commentItem.roomId,
      userId: commentItem.userId,
      userName: commentItem.userName,
      content: commentItem.content,
      timestamp: commentItem.timestamp,
      likeCount: commentItem.likeCount,
    };
  }
}

// シングルトンインスタンス
export const commentService = new CommentService();
