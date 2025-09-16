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

// =============================================================================
// Like Service 関連の型定義
// =============================================================================

// いいね API リクエスト型
export interface AddLikeRequest {
  commentId: string;
  userId: string;
  roomId: string;
}

export interface RemoveLikeRequest {
  commentId: string;
  userId: string;
}

// いいね API レスポンス型
export interface AddLikeResponse {
  success: true;
  likeCount: number;
  message: string;
}

export interface RemoveLikeResponse {
  success: true;
  likeCount: number;
  message: string;
}

// DynamoDB アイテム型
export interface LikeItem {
  PK: string; // "LIKE#${commentId}"
  SK: string; // "USER#${userId}"
  GSI1PK: string; // "USER#${userId}#ROOM#${roomId}"
  GSI1SK: string; // "LIKE#${likedAt}"
  commentId: string;
  userId: string;
  roomId: string;
  likedAt: string;
  ttl: number;
}

// いいね情報型
export interface Like {
  commentId: string;
  userId: string;
  roomId: string;
  likedAt: string;
}

// =============================================================================
// WebSocket Service 関連の型定義
// =============================================================================

// WebSocket メッセージ型
export type WSMessage =
  | { type: 'comment_new'; data: Comment }
  | { type: 'comment_deleted'; data: { commentId: string } }
  | { type: 'like_updated'; data: { commentId: string; likeCount: number } }
  | { type: 'user_joined'; data: { userName: string; userCount: number } }
  | { type: 'user_left'; data: { userName: string; userCount: number } };

// WebSocket リクエスト型
export interface JoinRoomRequest {
  roomId: string;
  userName: string;
}

export interface LeaveRoomRequest {
  roomId: string;
}

// DynamoDB Connections テーブル アイテム型
export interface ConnectionItem {
  PK: string; // "CONN#${connectionId}"
  SK: string; // "METADATA"
  GSI1PK: string; // "ROOM#${roomId}"
  GSI1SK: string; // "CONN#${connectionId}"
  connectionId: string;
  roomId: string;
  userId: string;
  userName: string;
  connectedAt: string;
  ttl: number; // 接続から2時間後に削除
}

// WebSocket 接続情報型
export interface Connection {
  connectionId: string;
  roomId: string;
  userId: string;
  userName: string;
  connectedAt: string;
}

// コメント型（共有用）
export interface Comment {
  commentId: string;
  roomId: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: string;
  likeCount: number;
}
