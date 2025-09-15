// Shared types and interfaces for Commentia application

export interface Room {
  roomId: string;
  roomCode: string;
  hostId: string;
  createdAt: string;
  status: 'active' | 'closed';
  settings: RoomSettings;
}

export interface RoomSettings {
  maxCommentsPerUser: number;
  maxLikesPerUser: number;
  commentMaxLength: number;
}

export interface Comment {
  commentId: string;
  roomId: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: string;
  likeCount: number;
}

export interface User {
  userId: string;
  userName: string;
  roomId?: string;
  connectionId?: string;
}

export interface Connection {
  connectionId: string;
  roomId: string;
  userId: string;
  userName: string;
  connectedAt: string;
}

export interface Like {
  commentId: string;
  userId: string;
  likedAt: string;
}

export type WSMessage =
  | { type: 'comment_new'; data: Comment }
  | { type: 'comment_deleted'; data: { commentId: string } }
  | { type: 'like_updated'; data: { commentId: string; likeCount: number } }
  | { type: 'user_joined'; data: { userName: string; userCount: number } }
  | { type: 'user_left'; data: { userName: string; userCount: number } }
  | WSErrorMessage;

// API Request/Response types
export interface CreateRoomRequest {
  hostId: string;
  settings?: Partial<RoomSettings>;
}

export interface CreateRoomResponse {
  room: Room;
  roomUrl: string;
  qrCodeUrl: string;
}

export interface PostCommentRequest {
  roomId: string;
  userId: string;
  userName: string;
  content: string;
}

export interface PostCommentResponse {
  comment: Comment;
}

export interface GetCommentsRequest {
  roomId: string;
  sortBy?: 'latest' | 'likes';
  limit?: number;
  cursor?: string;
}

export interface GetCommentsResponse {
  comments: Comment[];
  nextCursor?: string;
}

// DynamoDB Item types
export interface RoomItem {
  PK: string;
  SK: string;
  roomId: string;
  roomCode: string;
  hostId: string;
  createdAt: string;
  status: 'active' | 'closed';
  settings: RoomSettings;
  ttl: number;
}

export interface CommentItem {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  commentId: string;
  roomId: string;
  userId: string;
  userName: string;
  content: string;
  timestamp: string;
  likeCount: number;
  ttl: number;
}

export interface ConnectionItem {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  connectionId: string;
  roomId: string;
  userId: string;
  userName: string;
  connectedAt: string;
  ttl: number;
}

export interface LikeItem {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  commentId: string;
  userId: string;
  roomId: string;
  likedAt: string;
  ttl: number;
}

// Environment configuration
export interface EnvironmentConfig {
  STAGE: 'dev' | 'staging' | 'prod';
  REGION: string;
  DYNAMODB_ENDPOINT?: string;
  WEBSOCKET_ENDPOINT: string;
  API_ENDPOINT: string;
  FRONTEND_URL: string;
}

// Common constants
export const CONSTANTS = {
  ROOM_CODE_LENGTH: 6,
  MAX_COMMENT_LENGTH: 500,
  MAX_COMMENTS_PER_USER: 10,
  MAX_LIKES_PER_USER: 100,
  ROOM_TTL_HOURS: 24,
  CONNECTION_TTL_HOURS: 2,
  MIN_POST_INTERVAL_MS: 3000, // 3 seconds between posts
} as const;

// Utility types
export type APIResponse<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    };

export type DynamoDBKey = {
  PK: string;
  SK: string;
};

export type SortOrder = 'latest' | 'likes';

// Error types
export const ERROR_CODES = {
  // Validation errors (400)
  INVALID_INPUT: 'INVALID_INPUT',
  COMMENT_TOO_LONG: 'COMMENT_TOO_LONG',
  INVALID_ROOM_CODE: 'INVALID_ROOM_CODE',
  DUPLICATE_USERNAME: 'DUPLICATE_USERNAME',

  // Authorization errors (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  HOST_ONLY_ACTION: 'HOST_ONLY_ACTION',

  // Not found errors (404)
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  COMMENT_NOT_FOUND: 'COMMENT_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',

  // Rate limiting errors (429)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_COMMENTS: 'TOO_MANY_COMMENTS',
  TOO_MANY_LIKES: 'TOO_MANY_LIKES',
  POST_TOO_FREQUENT: 'POST_TOO_FREQUENT',

  // Server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  WEBSOCKET_ERROR: 'WEBSOCKET_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface APIError {
  code: ErrorCode;
  message: string;
  details?: unknown;
  timestamp: string;
}

// WebSocket error messages
export type WSErrorMessage = {
  type: 'error';
  data: APIError;
};

// Join room request/response for WebSocket
export interface JoinRoomRequest {
  roomId: string;
  userName: string;
}

export interface JoinRoomResponse {
  success: boolean;
  userCount: number;
  error?: APIError;
}
