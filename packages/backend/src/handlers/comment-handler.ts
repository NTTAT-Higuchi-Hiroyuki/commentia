/**
 * Comment Handler - コメント管理API用Lambda関数
 * REST API経由でコメント管理機能を提供
 */

import type {
  GetCommentsResponse,
  PostCommentRequest,
  PostCommentResponse,
} from '@commentia/shared';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { commentService } from '../services/comment-service.js';
import {
  createApiResponse,
  safeParseJson,
  validateRequired,
  validateString,
  withErrorHandling,
} from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

/**
 * コメント投稿ハンドラー
 * POST /rooms/{roomId}/comments
 */
export const postCommentHandler = withErrorHandling(
  async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'postComment',
    });

    logger.info('Comment posting started');

    // パスパラメータから roomId を取得
    const roomId = validateRequired(
      validateString(event.pathParameters?.roomId, 'roomId'),
      'roomId'
    );

    // リクエストボディのパース
    const requestBody = safeParseJson<PostCommentRequest>(event.body || '', {
      roomId: '',
      userId: '',
      userName: '',
      content: '',
    });

    // バリデーション
    const userId = validateRequired(validateString(requestBody.userId, 'userId', 100), 'userId');

    const userName = validateRequired(
      validateString(requestBody.userName, 'userName', 50),
      'userName'
    );

    const content = validateRequired(
      validateString(requestBody.content, 'content', 500),
      'content'
    );

    const postRequest: PostCommentRequest = {
      roomId,
      userId,
      userName,
      content,
    };

    // コメント投稿
    if (!commentService) {
      throw new Error('Comment service not available');
    }
    const comment = await commentService.postComment(postRequest);

    const response: PostCommentResponse = {
      comment,
    };

    logger.info('Comment posted successfully', {
      commentId: comment.commentId,
      roomId,
      userId,
    });

    return createApiResponse(201, response);
  }
);

/**
 * コメント一覧取得ハンドラー
 * GET /rooms/{roomId}/comments
 */
export const getCommentsHandler = withErrorHandling(
  async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'getComments',
    });

    // パスパラメータから roomId を取得
    const roomId = validateRequired(
      validateString(event.pathParameters?.roomId, 'roomId'),
      'roomId'
    );

    // クエリパラメータの取得
    const sortBy = (event.queryStringParameters?.sortBy as 'latest' | 'likes') || 'latest';
    const limit = event.queryStringParameters?.limit
      ? Math.min(Math.max(Number.parseInt(event.queryStringParameters.limit, 10), 1), 100)
      : 50;
    const cursor = event.queryStringParameters?.cursor;

    logger.info('Getting comments', { roomId, sortBy, limit });

    // コメント一覧取得
    if (!commentService) {
      throw new Error('Comment service not available');
    }
    const result = await commentService.getComments(roomId, sortBy, limit, cursor);

    const response: GetCommentsResponse = {
      comments: result.comments,
      hasMore: !!result.nextCursor,
      ...(result.nextCursor && { nextCursor: result.nextCursor }),
    };

    return createApiResponse(200, response);
  }
);

/**
 * コメント削除ハンドラー
 * DELETE /comments/{commentId}
 */
export const deleteCommentHandler = withErrorHandling(
  async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'deleteComment',
    });

    // パスパラメータから commentId を取得
    const commentId = validateRequired(
      validateString(event.pathParameters?.commentId, 'commentId'),
      'commentId'
    );

    // リクエストボディから userId を取得
    const requestBody = safeParseJson<{ userId: string }>(event.body || '', {
      userId: '',
    });
    const userId = validateRequired(validateString(requestBody.userId, 'userId', 100), 'userId');

    logger.info('Deleting comment', { commentId, userId });

    // コメント削除
    if (!commentService) {
      throw new Error('Comment service not available');
    }
    await commentService.deleteComment(commentId, userId);

    const response = {
      success: true,
      message: 'Comment deleted successfully',
      requestId: context.awsRequestId,
    };

    return createApiResponse(200, response);
  }
);

/**
 * 統合ハンドラー - API Gateway統合用
 * 複数のエンドポイントを単一のLambda関数で処理
 */
export const commentApiHandler = withErrorHandling(
  async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      httpMethod: event.httpMethod,
      path: event.path,
    });

    const method = event.httpMethod;
    const path = event.path;

    logger.info('Comment API request received', { method, path });

    // ルーティング
    if (method === 'POST' && path.match(/^\/rooms\/[^/]+\/comments$/)) {
      return postCommentHandler(event, context);
    }

    if (method === 'GET' && path.match(/^\/rooms\/[^/]+\/comments$/)) {
      return getCommentsHandler(event, context);
    }

    if (method === 'DELETE' && path.match(/^\/comments\/[^/]+$/)) {
      return deleteCommentHandler(event, context);
    }

    // 該当するルートが見つからない場合
    logger.warn('Route not found', { method, path });

    return createApiResponse(404, {
      error: 'NOT_FOUND',
      message: 'API endpoint not found',
      requestId: context.awsRequestId,
    });
  }
);

// 個別エクスポートもサポート
export const handler = commentApiHandler;
