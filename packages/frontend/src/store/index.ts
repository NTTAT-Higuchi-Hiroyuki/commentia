/**
 * Central store exports for Commentia application
 * Provides access to all Zustand stores and their related hooks
 */

// Room Store
export {
  useRoomStore,
  roomSelectors,
  useCurrentRoom,
  useRoomLoading,
  useRoomError,
  useIsInRoom,
  useIsHost,
  useQRCode,
} from './roomStore';

// Comments Store
export {
  useCommentsStore,
  commentsSelectors,
  useComments,
  useCommentsLoading,
  useCommentsError,
  useCanPost,
  useCommentCount,
  useSortBy,
} from './commentsStore';

// User Store
export {
  useUserStore,
  userSelectors,
  useCurrentUser,
  useIsAuthenticated,
  useUserId,
  useUserName,
  useUserStats,
  useUserLimits,
  useUserError,
  useCanPost as useCanPostUser,
  useCanLike,
} from './userStore';

// WebSocket Store
export {
  useWebSocketStore,
  websocketSelectors,
  useWebSocketStatus,
  useIsConnected,
  useIsConnecting,
  useUserCount,
  useWebSocketError,
  useCanSendMessage,
} from './websocketStore';

// Combined hooks for common use cases
export const useAppState = () => ({
  room: useCurrentRoom(),
  user: useCurrentUser(),
  isAuthenticated: useIsAuthenticated(),
  isConnected: useIsConnected(),
  comments: useComments(),
});

export const useLoadingStates = () => ({
  room: useRoomLoading(),
  comments: useCommentsLoading(),
  websocket: useIsConnecting(),
});

export const useErrorStates = () => ({
  room: useRoomError(),
  comments: useCommentsError(),
  user: useUserError(),
  websocket: useWebSocketError(),
});

// Type exports for store states
export type { RoomState } from './roomStore';
export type { CommentsState } from './commentsStore';
export type { UserState } from './userStore';
export type { WebSocketState } from './websocketStore';
