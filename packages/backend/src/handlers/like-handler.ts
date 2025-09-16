/**
 * Like Handler - いいね管理API用Lambda関数
 * REST API経由でいいね機能を提供
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { likeService } from '../services/like-service.js';
import type {
  AddLikeRequest,
  AddLikeResponse,
  RemoveLikeRequest,
  RemoveLikeResponse,
} from '../types/index.js';
import {
  createApiResponse,
  safeParseJson,
  validateRequired,
  validateString,
  withErrorHandling,
} from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

/**
 * いいね追加ハンドラー
 * POST /comments/{commentId}/likes
 */
const addLikeHandler = withErrorHandling(
  async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'addLike',
    });

    logger.info('Like addition started');

    // パスパラメータから commentId を取得
    const commentId = validateRequired(
      validateString(event.pathParameters?.commentId, 'commentId'),
      'commentId'
    );

    // リクエストボディのパース
    const requestBody = safeParseJson<AddLikeRequest>(event.body || '', {
      commentId: '',
      userId: '',
      roomId: '',
    });

    // バリデーション
    const userId = validateRequired(validateString(requestBody.userId, 'userId', 100), 'userId');
    const roomId = validateRequired(validateString(requestBody.roomId, 'roomId', 100), 'roomId');

    const addRequest: AddLikeRequest = {
      commentId,
      userId,
      roomId,
    };

    // いいね追加
    const result = await likeService.addLike(addRequest);

    const response: AddLikeResponse = {
      success: true,
      likeCount: result.likeCount,
      message: result.message,
    };

    logger.info('Like added successfully', {
      commentId,
      userId,
      likeCount: result.likeCount,
    });

    return createApiResponse(201, response);
  }
);

/**
 * いいね取消ハンドラー
 * DELETE /comments/{commentId}/likes
 */
const removeLikeHandler = withErrorHandling(
  async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'removeLike',
    });

    // パスパラメータから commentId を取得
    const commentId = validateRequired(
      validateString(event.pathParameters?.commentId, 'commentId'),
      'commentId'
    );

    // リクエストボディから userId を取得
    const requestBody = safeParseJson<{ userId: string }>(event.body || '', { userId: '' });
    const userId = validateRequired(validateString(requestBody.userId, 'userId', 100), 'userId');

    logger.info('Removing like', { commentId, userId });

    const removeRequest: RemoveLikeRequest = {
      commentId,
      userId,
    };

    // いいね取消
    const result = await likeService.removeLike(removeRequest);

    const response: RemoveLikeResponse = {
      success: true,
      likeCount: result.likeCount,
      message: result.message,
    };

    logger.info('Like removed successfully', {
      commentId,
      userId,
      likeCount: result.likeCount,
    });

    return createApiResponse(200, response);
  }
);

/**
 * Like API メインハンドラー
 * ルーティングとエラーハンドリングを統合
 */
const likeApiHandler = withErrorHandling(
  async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      httpMethod: event.httpMethod,
      path: event.path,
    });

    const method = event.httpMethod;
    const path = event.path;

    logger.info('Like API request received', { method, path });

    // ルーティング
    if (method === 'POST' && path.match(/^\/comments\/[^/]+\/likes$/)) {
      return addLikeHandler(event, context);
    }

    if (method === 'DELETE' && path.match(/^\/comments\/[^/]+\/likes$/)) {
      return removeLikeHandler(event, context);
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

// Lambda関数のエクスポート
export const handler = likeApiHandler;

// 個別のハンドラーもエクスポート（テスト用）
export { addLikeHandler, removeLikeHandler, likeApiHandler };
