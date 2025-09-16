/**
 * WebSocket Handler - WebSocket接続管理用Lambda関数
 * リアルタイム通信の接続・切断・ルーム管理を提供
 */

import type { Context } from 'aws-lambda';
import { webSocketService } from '../services/websocket-service.js';
import type {
  JoinRoomRequest,
  LeaveRoomRequest,
  WebSocketEvent,
  WebSocketResult,
} from '../types/index.js';
import {
  createWebSocketErrorResponse,
  createWebSocketResponse,
  safeParseJson,
  withWebSocketErrorHandling,
} from '../utils/error-handler.js';
import { logger } from '../utils/logger.js';

/**
 * WebSocket接続ハンドラー
 * $connect ルート
 */
const connectHandler = withWebSocketErrorHandling(
  async (event: WebSocketEvent, context: Context): Promise<WebSocketResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'connect',
    });

    const connectionId = event.requestContext.connectionId;

    logger.info('WebSocket connection request', { connectionId });

    // 接続処理
    await webSocketService.handleConnect(connectionId);

    logger.info('WebSocket connection established', { connectionId });

    return createWebSocketResponse(200, {
      message: 'Connected successfully',
    });
  }
);

/**
 * WebSocket切断ハンドラー
 * $disconnect ルート
 */
const disconnectHandler = withWebSocketErrorHandling(
  async (event: WebSocketEvent, context: Context): Promise<WebSocketResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'disconnect',
    });

    const connectionId = event.requestContext.connectionId;

    logger.info('WebSocket disconnection request', { connectionId });

    // 切断処理
    await webSocketService.handleDisconnect(connectionId);

    logger.info('WebSocket disconnection completed', { connectionId });

    return createWebSocketResponse(200, {
      message: 'Disconnected successfully',
    });
  }
);

/**
 * ルーム参加ハンドラー
 * joinRoom カスタムルート
 */
const joinRoomHandler = withWebSocketErrorHandling(
  async (event: WebSocketEvent, context: Context): Promise<WebSocketResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'joinRoom',
    });

    const connectionId = event.requestContext.connectionId;

    logger.info('Join room request', { connectionId });

    // リクエストボディのパース
    const requestBody = safeParseJson<JoinRoomRequest>(event.body || '', {
      roomId: '',
      userName: '',
    });

    // バリデーション
    if (!requestBody.roomId || typeof requestBody.roomId !== 'string') {
      logger.warn('Invalid roomId in join room request', {
        connectionId,
        roomId: requestBody.roomId,
      });
      return createWebSocketResponse(400, {
        error: 'VALIDATION_ERROR',
        message: 'Room ID is required',
      });
    }

    if (!requestBody.userName || typeof requestBody.userName !== 'string') {
      logger.warn('Invalid userName in join room request', {
        connectionId,
        userName: requestBody.userName,
      });
      return createWebSocketResponse(400, {
        error: 'VALIDATION_ERROR',
        message: 'User name is required',
      });
    }

    const joinRequest: JoinRoomRequest = {
      roomId: requestBody.roomId.trim(),
      userName: requestBody.userName.trim(),
    };

    // ルーム参加処理
    await webSocketService.joinRoom(connectionId, joinRequest);

    logger.info('Successfully joined room', {
      connectionId,
      roomId: joinRequest.roomId,
      userName: joinRequest.userName,
    });

    return createWebSocketResponse(200, {
      message: 'Joined room successfully',
      roomId: joinRequest.roomId,
      userName: joinRequest.userName,
    });
  }
);

/**
 * ルーム退出ハンドラー
 * leaveRoom カスタムルート
 */
const leaveRoomHandler = withWebSocketErrorHandling(
  async (event: WebSocketEvent, context: Context): Promise<WebSocketResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'leaveRoom',
    });

    const connectionId = event.requestContext.connectionId;

    logger.info('Leave room request', { connectionId });

    // リクエストボディのパース
    const requestBody = safeParseJson<LeaveRoomRequest>(event.body || '', {
      roomId: '',
    });

    // バリデーション
    if (!requestBody.roomId || typeof requestBody.roomId !== 'string') {
      logger.warn('Invalid roomId in leave room request', {
        connectionId,
        roomId: requestBody.roomId,
      });
      return createWebSocketResponse(400, {
        error: 'VALIDATION_ERROR',
        message: 'Room ID is required',
      });
    }

    // 接続情報を取得してルーム退出処理
    const connection = await webSocketService.getConnection(connectionId);

    if (!connection || !connection.roomId || !connection.userName) {
      logger.warn('No active room connection found for leave request', { connectionId });
      return createWebSocketResponse(400, {
        error: 'VALIDATION_ERROR',
        message: 'No active room connection found',
      });
    }

    // ルーム退出処理
    await webSocketService.leaveRoom(connectionId, connection.roomId, connection.userName);

    logger.info('Successfully left room', {
      connectionId,
      roomId: requestBody.roomId,
    });

    return createWebSocketResponse(200, {
      message: 'Left room successfully',
      roomId: requestBody.roomId,
    });
  }
);

/**
 * デフォルトハンドラー（ルート不明時）
 */
const defaultHandler = withWebSocketErrorHandling(
  async (event: WebSocketEvent, context: Context): Promise<WebSocketResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      action: 'default',
    });

    const routeKey = event.requestContext.routeKey;
    const connectionId = event.requestContext.connectionId;

    logger.warn('Unknown WebSocket route', { connectionId, routeKey });

    return createWebSocketResponse(400, {
      error: 'UNKNOWN_ROUTE',
      message: `Unknown route: ${routeKey}`,
    });
  }
);

/**
 * WebSocket メインハンドラー
 * ルーティングとエラーハンドリングを統合
 */
const webSocketApiHandler = withWebSocketErrorHandling(
  async (event: WebSocketEvent, context: Context): Promise<WebSocketResult> => {
    logger.setContext({
      requestId: context.awsRequestId,
      routeKey: event.requestContext.routeKey,
      connectionId: event.requestContext.connectionId,
    });

    const routeKey = event.requestContext.routeKey;
    const connectionId = event.requestContext.connectionId;

    logger.info('WebSocket request received', { routeKey, connectionId });

    try {
      // ルーティング
      switch (routeKey) {
        case '$connect':
          return await connectHandler(event, context);

        case '$disconnect':
          return await disconnectHandler(event, context);

        case 'joinRoom':
          return await joinRoomHandler(event, context);

        case 'leaveRoom':
          return await leaveRoomHandler(event, context);

        default:
          return await defaultHandler(event, context);
      }
    } catch (error) {
      logger.error('WebSocket handler error', error, {
        routeKey,
        connectionId,
        requestId: context.awsRequestId,
      });

      return createWebSocketErrorResponse(
        error instanceof Error ? error : new Error('Unknown error'),
        context.awsRequestId
      );
    }
  }
);

// Lambda関数のエクスポート
export const handler = webSocketApiHandler;

// 個別のハンドラーもエクスポート（テスト用）
export {
  connectHandler,
  disconnectHandler,
  joinRoomHandler,
  leaveRoomHandler,
  webSocketApiHandler,
};
