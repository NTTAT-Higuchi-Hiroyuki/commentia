import type { APIGatewayProxyResult, Context } from 'aws-lambda';
import { logger } from './logger.js';

export interface WebSocketResult {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

// 基底エラークラス
export class CommentiaError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: string, isOperational = true) {
    super(message);

    this.name = this.constructor.name;
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
    super(message, 400, 'INVALID_INPUT');
  }
}

export class NotFoundError extends CommentiaError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends CommentiaError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends CommentiaError {
  constructor(message: string) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class InternalError extends CommentiaError {
  constructor(message: string) {
    super(message, 500, 'INTERNAL_ERROR');
  }
}

export class WebSocketError extends CommentiaError {
  constructor(message: string, code = 'WEBSOCKET_ERROR') {
    super(message, 400, code);
  }
}

// APIレスポンス作成
export function createApiResponse(
  statusCode: number,
  body?: unknown,
  headers: Record<string, string> = {}
): APIGatewayProxyResult {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
    ...headers,
  };

  const result: APIGatewayProxyResult = {
    statusCode,
    headers: defaultHeaders,
    body: '',
  };

  if (body) {
    result.body = JSON.stringify(body);
  }

  return result;
}

// WebSocketレスポンス作成
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
  logger.error('Unhandled error', error, { requestId });

  return createWebSocketResponse(500, {
    error: 'INTERNAL_ERROR',
    message: 'Internal server error',
    requestId,
  });
}

// エラーハンドリングミドルウェア
export function withErrorHandling<T extends unknown[], R>(handler: (...args: T) => Promise<R>) {
  return async (...args: T): Promise<R> => {
    const context = args.find((arg) => arg && typeof arg === 'object' && 'awsRequestId' in arg) as
      | Context
      | undefined;
    const requestId = context?.awsRequestId || 'unknown';

    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('Unhandled error', error, {
          requestId,
        });

        // WebSocketの場合とAPIの場合を判定
        if (handler.name.includes('websocket') || handler.name.includes('WebSocket')) {
          return createWebSocketErrorResponse(error, requestId) as R;
        }
        return createErrorResponse(error, requestId) as R;
      }

      // Errorでない例外の場合
      logger.error('Unknown error type', new Error(String(error)), {
        requestId,
      });

      // 500エラーを返す
      return createErrorResponse(new Error('Unknown error'), requestId) as R;
    }
  };
}

// WebSocket専用エラーハンドリングミドルウェア
export function withWebSocketErrorHandling<T extends unknown[], R>(
  handler: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    const context = args.find((arg) => arg && typeof arg === 'object' && 'awsRequestId' in arg) as
      | Context
      | undefined;
    const requestId = context?.awsRequestId || 'unknown';

    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof Error) {
        logger.error('WebSocket handler error', error, {
          requestId,
        });

        return createWebSocketErrorResponse(error, requestId) as R;
      }

      // Errorでない例外の場合
      logger.error('Unknown error type in WebSocket', new Error(String(error)), {
        requestId,
      });

      // 500エラーを返す
      return createWebSocketErrorResponse(new Error('Unknown error'), requestId) as R;
    }
  };
}

// JSON解析ヘルパー
export function safeParseJson<T>(jsonString: string, defaultValue: T): T {
  try {
    if (!jsonString || jsonString.trim() === '') {
      return defaultValue;
    }
    return JSON.parse(jsonString) as T;
  } catch (error) {
    logger.warn('Failed to parse JSON', { jsonString, error });
    return defaultValue;
  }
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

export function validateNumber(
  value: unknown,
  fieldName: string,
  min?: number,
  max?: number
): number {
  const num = Number(value);

  if (Number.isNaN(num)) {
    throw new ValidationError(`${fieldName} must be a number`);
  }

  if (min !== undefined && num < min) {
    throw new ValidationError(`${fieldName} must be at least ${min}`);
  }

  if (max !== undefined && num > max) {
    throw new ValidationError(`${fieldName} must be at most ${max}`);
  }

  return num;
}

export function validateEmail(value: string, fieldName: string): string {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(value)) {
    throw new ValidationError(`${fieldName} must be a valid email address`);
  }

  return value;
}

export function validateEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowedValues: readonly T[]
): T {
  if (typeof value !== 'string' || !allowedValues.includes(value as T)) {
    throw new ValidationError(`${fieldName} must be one of: ${allowedValues.join(', ')}`);
  }

  return value as T;
}
