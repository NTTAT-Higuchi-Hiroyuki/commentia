/**
 * Lambda 関数の型定義
 */

import type {
  APIGatewayEventWebsocketRequestContextV2,
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';

// AWS Lambda の型定義を再エクスポート
export type { APIGatewayProxyResult } from 'aws-lambda';

// API Gateway Lambda ハンドラー
export type ApiHandler = (
  event: APIGatewayProxyEvent,
  context: Context
) => Promise<APIGatewayProxyResult>;

// WebSocket Lambda ハンドラー
export type WebSocketHandler = (
  event: WebSocketEvent,
  context: Context
) => Promise<WebSocketResult>;

// WebSocket イベント型
export interface WebSocketEvent {
  requestContext: APIGatewayEventWebsocketRequestContextV2;
  body?: string;
  isBase64Encoded?: boolean;
  headers?: Record<string, string>;
  multiValueHeaders?: Record<string, string[]>;
  queryStringParameters?: Record<string, string> | null;
  multiValueQueryStringParameters?: Record<string, string[]> | null;
  pathParameters?: Record<string, string> | null;
  stageVariables?: Record<string, string> | null;
}

// WebSocket レスポンス型
export interface WebSocketResult {
  statusCode: number;
  body?: string;
  headers?: Record<string, string>;
}

// 環境変数の型定義
export interface LambdaEnvironment {
  STAGE: 'dev' | 'staging' | 'prod';
  REGION: string;
  ROOMS_TABLE_NAME: string;
  COMMENTS_TABLE_NAME: string;
  CONNECTIONS_TABLE_NAME: string;
  LIKES_TABLE_NAME: string;
  WEBSOCKET_ENDPOINT?: string;
}

// エラーレスポンス型
export interface ErrorResponse {
  error: string;
  message: string;
  requestId?: string;
  statusCode?: number;
}

// 成功レスポンス型
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  requestId?: string;
}

// Lambda コンテキスト拡張
export interface ExtendedContext extends Context {
  environment: LambdaEnvironment;
}
