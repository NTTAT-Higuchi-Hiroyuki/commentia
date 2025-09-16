/**
 * Lambda 関数用エラーハンドラー
 * API Gateway、WebSocket API、および内部エラーの統一処理
 */

import type { APIGatewayProxyResult, WebSocketResult } from '../types/index.js';
import { logger } from './logger.js';

// カスタムエラークラス
export class CommentiaError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', isOperational = true) {
    super(message);
    this.name = 'CommentiaError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    // スタックトレースの調整
    Error.captureStackTrace(this, this.constructor);
  }
}

// 事前定義エラー
export class ValidationError extends CommentiaError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends CommentiaError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends CommentiaError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends CommentiaError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class RateLimitError extends CommentiaError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class WebSocketError extends CommentiaError {
  constructor(message: string, code = 'WEBSOCKET_ERROR') {
    super(message, 400, code);
  }
}

// API Gateway レスポンス作成
export function createApiResponse(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {}
): APIGatewayProxyResult {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
    ...headers,
  };

  return {
    statusCode,
    headers: defaultHeaders,
    body: JSON.stringify(body),
  };
}

// WebSocket レスポンス作成
export function createWebSocketResponse(
  statusCode: number,
  body?: unknown,
  headers: Record<string, string> = {}
): WebSocketResult {
  const result: WebSocketResult = {
    statusCode,
    headers,
  };

  if (body) {
    result.body = JSON.stringify(body);
  }

  return result;
}

// エラーレスポンス作成
export function createErrorResponse(error: Error, requestId?: string): APIGatewayProxyResult {
  if (error instanceof CommentiaError) {
    return createApiResponse(error.statusCode, {
      error: error.code,
      message: error.message,
      requestId,
    });
  }

  // 未処理エラー
  logger.error('Unhandled error', error, { requestId });

  return createApiResponse(500, {
    error: 'INTERNAL_ERROR',
    message: 'Internal server error',
    requestId,
  });
}

// WebSocket エラーレスポンス作成
export function createWebSocketErrorResponse(error: Error, requestId?: string): WebSocketResult {
  if (error instanceof CommentiaError) {
    return createWebSocketResponse(error.statusCode, {
      error: error.code,
      message: error.message,
      requestId,
    });
  }

  // 未処理エラー
  logger.error('Unhandled WebSocket error', error, { requestId });

  return createWebSocketResponse(500, {
    error: 'INTERNAL_ERROR',
    message: 'Internal server error',
    requestId,
  });
}

// Lambda ハンドラー用エラーラッパー
export function withErrorHandling<T extends unknown[]>(
  handler: (...args: T) => Promise<APIGatewayProxyResult>
) {
  return async (...args: T): Promise<APIGatewayProxyResult> => {
    try {
      return await handler(...args);
    } catch (error) {
      const requestId = args[1] ? (args[1] as { awsRequestId: string }).awsRequestId : undefined;
      return createErrorResponse(
        error instanceof Error ? error : new Error(String(error)),
        requestId
      );
    }
  };
}

// WebSocket ハンドラー用エラーラッパー
export function withWebSocketErrorHandling<T extends unknown[]>(
  handler: (...args: T) => Promise<WebSocketResult>
) {
  return async (...args: T): Promise<WebSocketResult> => {
    try {
      return await handler(...args);
    } catch (error) {
      const requestId = args[1] ? (args[1] as { awsRequestId: string }).awsRequestId : undefined;
      return createWebSocketErrorResponse(
        error instanceof Error ? error : new Error(String(error)),
        requestId
      );
    }
  };
}

// バリデーションヘルパー
export function validateRequired<T>(value: T | undefined | null, fieldName: string): T {
  if (value === undefined || value === null || value === '') {
    throw new ValidationError(`${fieldName} is required`);
  }
  return value;
}

export function validateString(value: unknown, fieldName: string, maxLength?: number): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }

  if (maxLength && value.length > maxLength) {
    throw new ValidationError(`${fieldName} must be ${maxLength} characters or less`);
  }

  return value;
}

export function validateEmail(email: string): string {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }
  return email;
}

export function validateUUID(uuid: string, fieldName: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    throw new ValidationError(`${fieldName} must be a valid UUID`);
  }
  return uuid;
}

// JSON パース用ヘルパー
export function safeParseJson<T = unknown>(jsonString: string | undefined, defaultValue: T): T {
  if (!jsonString) {
    return defaultValue;
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch (_error) {
    throw new ValidationError('Invalid JSON format');
  }
}

// 非同期関数用のタイムアウトラッパー
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new CommentiaError(errorMessage, 408, 'TIMEOUT')), timeoutMs);
    }),
  ]);
}
