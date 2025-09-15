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
  | { type: 'user_left'; data: { userName: string; userCount: number } };

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
