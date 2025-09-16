/**
 * Room Handler - ルーム管理API用Lambda関数
 * REST API経由でルーム管理機能を提供
 */

import type { CreateRoomRequest, CreateRoomResponse } from '@commentia/shared';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { roomService } from '../services/room-service.js';
import {
  createApiResponse,
  safeParseJson,
  validateRequired,
  validateString,
  withErrorHandling,
} from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

/**
 * ルーム作成ハンドラー
 * POST /rooms
 */
export const createRoomHandler = withErrorHandling(
  async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'createRoom',
    });

    logger.info('Room creation started');

    // リクエストボディのパース
    const requestBody = safeParseJson<CreateRoomRequest>(event.body || '', {
      hostId: '',
    });

    // バリデーション
    const hostId = validateRequired(validateString(requestBody.hostId, 'hostId', 100), 'hostId');

    // ルーム作成
    const room = await roomService.createRoom(hostId, requestBody.settings);

    const response: CreateRoomResponse = {
      room,
      roomUrl: `https://commentia.example.com/rooms/${room.roomId}`, // TODO: 実際のドメインに置き換え
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(`https://commentia.example.com/rooms/${room.roomId}`)}&size=200x200`,
    };

    logger.info('Room created successfully', {
      roomId: room.roomId,
      roomCode: room.roomCode,
    });

    return createApiResponse(201, response);
  }
);

/**
 * ルーム情報取得ハンドラー
 * GET /rooms/{roomId}
 */
export const getRoomHandler = withErrorHandling(
  async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'getRoom',
    });

    // パスパラメータから roomId を取得
    const roomId = validateRequired(
      validateString(event.pathParameters?.roomId, 'roomId'),
      'roomId'
    );

    logger.info('Getting room', { roomId });

    // ルーム取得
    const room = await roomService.getRoom(roomId);

    const response = {
      success: true,
      data: room,
      requestId: context.awsRequestId,
    };

    return createApiResponse(200, response);
  }
);

/**
 * ルーム終了ハンドラー
 * DELETE /rooms/{roomId}
 */
export const closeRoomHandler = withErrorHandling(
  async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'closeRoom',
    });

    // パスパラメータから roomId を取得
    const roomId = validateRequired(
      validateString(event.pathParameters?.roomId, 'roomId'),
      'roomId'
    );

    // リクエストボディから hostId を取得
    const requestBody = safeParseJson<{ hostId: string }>(event.body || '', { hostId: '' });
    const hostId = validateRequired(validateString(requestBody.hostId, 'hostId', 100), 'hostId');

    logger.info('Closing room', { roomId, hostId });

    // ルーム終了
    await roomService.closeRoom(roomId, hostId);

    const response = {
      success: true,
      message: 'Room closed successfully',
      requestId: context.awsRequestId,
    };

    return createApiResponse(200, response);
  }
);

/**
 * ルームコード検索ハンドラー
 * GET /rooms/code/{roomCode}
 */
export const getRoomByCodeHandler = withErrorHandling(
  async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'getRoomByCode',
    });

    // パスパラメータから roomCode を取得
    const roomCode = validateRequired(
      validateString(event.pathParameters?.roomCode, 'roomCode', 6),
      'roomCode'
    );

    logger.info('Finding room by code', { roomCode });

    // ルーム検索
    const room = await roomService.getRoomByCode(roomCode);

    const response = {
      success: true,
      data: room,
      requestId: context.awsRequestId,
    };

    return createApiResponse(200, response);
  }
);

/**
 * 統合ハンドラー - API Gateway統合用
 * 複数のエンドポイントを単一のLambda関数で処理
 */
export const roomApiHandler = withErrorHandling(
  async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      httpMethod: event.httpMethod,
      path: event.path,
    });

    const method = event.httpMethod;
    const path = event.path;

    logger.info('Room API request received', { method, path });

    // ルーティング
    if (method === 'POST' && path === '/rooms') {
      return createRoomHandler(event, context);
    }

    if (method === 'GET' && path.match(/^\/rooms\/[^/]+$/)) {
      return getRoomHandler(event, context);
    }

    if (method === 'DELETE' && path.match(/^\/rooms\/[^/]+$/)) {
      return closeRoomHandler(event, context);
    }

    if (method === 'GET' && path.match(/^\/rooms\/code\/[^/]+$/)) {
      return getRoomByCodeHandler(event, context);
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
export const handler = roomApiHandler;
